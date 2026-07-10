import { db } from '../database/db';
import { config } from '../config';
import axios from 'axios';

/**
 * WinnerPip Real-Time Evaluation Engine
 *
 * Features:
 * - Configurable rules per challenge (admin form)
 * - Instrument-aware pip/contract calculations (forex, JPY, metals, indices, crypto)
 * - Cent account support (auto ÷100)
 * - Fake SL detection via M1 candle data from VPS
 * - Daily drawdown notification via Telegram bot
 * - Only removes profits from flagged trades (losses always count)
 */

// ==================== INSTRUMENT INFO ====================

function getInstrumentInfo(symbol: string): { pipSize: number; contractSize: number; isCent: boolean } {
  const isCent = symbol.endsWith('m') || symbol.endsWith('c');
  const sym = symbol.replace(/[mczr]$/, '').replace(/_x\d+m?$/, '').toUpperCase();
  const hasX100 = symbol.includes('_x100');
  let pipSize: number;
  let contractSize: number;

  if (sym.includes('XAUUSD') || sym === 'XAU' || sym.includes('GOLD')) { pipSize = 0.01; contractSize = 100; }
  else if (sym.includes('XAGUSD') || sym === 'XAG') { pipSize = 0.01; contractSize = 5000; }
  else if (sym.includes('USTEC') || sym.includes('US500') || sym.includes('AUS200') || sym.includes('FR40')) { pipSize = 0.1; contractSize = hasX100 ? 100 : 1; }
  else if (sym.includes('US30') || sym.includes('DE30') || sym.includes('HK50') || sym.includes('JP225')) { pipSize = 1; contractSize = hasX100 ? 100 : 1; }
  else if (sym.includes('BTC') || sym.includes('ETH')) { pipSize = 0.1; contractSize = 1; }
  else if (sym.includes('UKOIL') || sym.includes('USOIL') || sym.includes('BRENT') || sym.includes('WTI')) { pipSize = 0.01; contractSize = 1000; }
  else if (sym.includes('XNGUSD') || sym.includes('NATGAS')) { pipSize = 0.01; contractSize = 10000; }
  else if (sym.includes('JPY')) { pipSize = 0.01; contractSize = 100000; }
  else if (sym === 'DXY') { pipSize = 0.0001; contractSize = 1000; }
  else { pipSize = 0.0001; contractSize = 100000; }

  if (isCent) contractSize = contractSize / 100;
  return { pipSize, contractSize, isCent };
}

/**
 * Calculate SL risk in account currency using the ratio method.
 * Works for ALL pairs regardless of quote currency — no VPS call needed.
 *
 * Logic: The ratio of (entry→SL distance) to (entry→close distance) tells us
 * what the loss WOULD have been if SL was hit, relative to the actual P/L.
 *
 * For trades where close ≈ entry (profit ≈ 0), we fall back to the old pip-based method
 * which is accurate for USD-quoted pairs and approximate for others.
 */
function calculateSlDollars(symbol: string, volume: number, entryPrice: number, slPrice: number, closePrice?: number, actualProfit?: number): number {
  if (!slPrice || slPrice === 0) return 0;

  const slDistance = Math.abs(entryPrice - slPrice);
  const closeDistance = closePrice ? Math.abs(entryPrice - closePrice) : 0;

  // Ratio method: if we have actual profit and meaningful price movement
  if (actualProfit !== undefined && closePrice && closeDistance > 0) {
    // actualProfit is what happened with entry→close movement
    // SL risk is what would happen with entry→SL movement
    const ratio = slDistance / closeDistance;
    return Math.abs(actualProfit) * ratio;
  }

  // Fallback: pip-based calculation (accurate for USD-quoted pairs)
  const { pipSize, contractSize } = getInstrumentInfo(symbol);
  const pips = slDistance / pipSize;
  const pipValue = volume * contractSize * pipSize;
  return pips * pipValue;
}

// ==================== TYPES ====================

interface RuleConfig {
  max_lot_size: number | null;
  max_open_trades: number | null;
  pair_limit: number | null;
  stop_loss_required: boolean;
  max_risk_dollars: number | null;
  daily_loss_cap: number | null;
  max_hold_hours: number | null;
  weekend_trading: boolean;
  min_active_days: number;
  only_cent_account: boolean;
  allow_professional: boolean;
}

interface TradeRow {
  id: number;
  registration_id: number;
  account_number: string;
  ticket: number;
  position_id: number | null; // set for partial closes; null for legacy rows
  symbol: string;
  trade_type: string;
  volume: number;
  open_time: Date;
  close_time: Date;
  open_price: number;
  close_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  profit: number;
  commission: number;
  swap: number;
  sl_check_result?: string | null;
  sl_check_attempts?: number | null;
  sl_conflict_count?: number | null;
}

// ==================== CANDLE TERMINAL MANAGER ====================

type CandleResult = { time: string; low: number; high: number; open: number; close: number }[];

/**
 * Stub — dynamic home account assignment removed (v8.0).
 * All terminals always idle on the hardcoded standard base account.
 * setup() and restore() are no-ops kept for call-site compatibility.
 */
class CandleTerminalManager {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async setup(_challengeId: number, _healthyTerminalIds: number[]): Promise<void> {
    // No-op: terminals stay on base account, no /configure call needed
  }
  async restore(): Promise<void> {
    // No-op
  }
}

export const candleTerminalManager = new CandleTerminalManager();

// ==================== VPS CANDLE SERVICE ====================

/**
 * Remap a symbol from any account-type suffix to the standard base-account suffix ('m').
 *
 * All candle fetches go through the hardcoded standard base account (Exness-MT5Trial9).
 * That account uses the 'm' suffix for all instruments (XAUUSDm, EURUSDm, etc.).
 * User trades may carry a different suffix (e.g. 'c' for cent accounts).
 * Strip the trailing lowercase suffix and append 'm' so the worker can find the symbol.
 *
 * Examples:
 *   XAUUSDc  → XAUUSDm
 *   EURUSDc  → EURUSDm
 *   XAUUSDm  → XAUUSDm  (already correct, no change)
 *   XAUUSD   → XAUUSDm  (no suffix → add 'm')
 */
function remapSymbolToBaseAccount(symbol: string): string {
  // Strip a single trailing lowercase letter (the account-type suffix), then add 'm'
  return symbol.replace(/[a-z]$/, '') + 'm';
}

/**
 * Fetch OHLC candles from LOCAL ohlc_candles DB table.
 *
 * Symbol is remapped to the standard 'm' suffix (same as stored in ohlc_candles).
 * Returns M1 candles for the requested range.
 * Returns null if no data at all for this symbol (triggers FAILED/pending).
 * Returns [] if symbol exists but no candles in the specific time range (short trade → pass).
 */
async function fetchCandles(
  symbol: string,
  fromTime: Date,
  toTime: Date,
  timeframe: string = 'M1',
): Promise<CandleResult | null> {
  const baseSymbol = remapSymbolToBaseAccount(symbol);

  try {
    const result = await db.query(
      `SELECT time, open, high, low, close FROM ohlc_candles
       WHERE symbol = $1 AND time >= $2 AND time <= $3
       ORDER BY time ASC
       LIMIT 5000`,
      [baseSymbol, new Date(fromTime.getTime() - 60000).toISOString(), toTime.toISOString()]
    );

    if (result.rows.length === 0) {
      const countCheck = await db.query(
        `SELECT COUNT(*) as cnt FROM ohlc_candles WHERE symbol = $1`, [baseSymbol]
      );
      if (parseInt(countCheck.rows[0]?.cnt || '0') === 0) {
        return null; // No data at all → FAILED → pending
      }
      // Symbol exists but no candles in this specific range.
      // If the range is very short (<2 min), it's a short trade → pass.
      // If longer, it's a genuine gap in coverage → return null to trigger retry.
      const rangeMs = toTime.getTime() - fromTime.getTime();
      if (rangeMs < 2 * 60 * 1000) {
        return []; // Short trade → pass
      }
      return null; // Gap in OHLC coverage → pending, will retry
    }

    return result.rows.map((r: any) => ({
      time: new Date(r.time).toISOString(),
      open: parseFloat(r.open),
      high: parseFloat(r.high),
      low: parseFloat(r.low),
      close: parseFloat(r.close),
    }));
  } catch (e) {
    console.error(`⚠️ fetchCandles DB error for ${baseSymbol}:`, (e as Error).message);
    return null;
  }
}

/**
 * Calculate the maximum allowed SL price level from max_risk_dollars.
 *
 * Uses ratio method when actual trade data is available — this handles ALL instruments
 * correctly including non-USD quoted pairs (USDJPY, EURJPY, XAU, etc.) because
 * MT5 profit is already in account currency, so the ratio automatically encodes
 * whatever conversion rate applied during the trade.
 *
 * Fallback: pip-based formula (accurate for USD-quoted pairs only).
 */
function calculateMaxSlPrice(
  symbol: string, volume: number, entryPrice: number, maxRiskDollars: number, isBuy: boolean,
  closePrice?: number, actualProfit?: number
): number {
  // Ratio method — derive price move from actual trade data
  if (closePrice !== undefined && actualProfit !== undefined) {
    const closeDistance = Math.abs(entryPrice - closePrice);
    const absProfit = Math.abs(actualProfit);
    if (closeDistance > 0 && absProfit > 0) {
      // $1 in account currency = closeDistance / absProfit price units
      const slPriceMove = closeDistance * (maxRiskDollars / absProfit);
      if (slPriceMove > 0 && isFinite(slPriceMove)) {
        return isBuy ? entryPrice - slPriceMove : entryPrice + slPriceMove;
      }
    }
  }

  // Fallback: pip-based (accurate for USD-quoted pairs)
  const sym = symbol.replace(/[mczr]$/, '').replace(/_x\d+m?$/, '').toUpperCase();
  let contractSize: number;
  if (sym.includes('XAUUSD') || sym === 'XAU' || sym.includes('GOLD')) contractSize = 100;
  else if (sym.includes('XAGUSD') || sym === 'XAG') contractSize = 5000;
  else if (sym.includes('JPY')) contractSize = 100000;
  else contractSize = 100000;

  const priceMove = maxRiskDollars / (volume * contractSize);
  if (priceMove <= 0 || !isFinite(priceMove)) return 0;
  return isBuy ? entryPrice - priceMove : entryPrice + priceMove;
}

/**
 * Adaptive timeframe selection based on trade hold duration.
 * Returns the timeframe string and period in milliseconds.
 */
function selectTimeframe(holdMinutes: number, maxHoldHours: number | null): { timeframe: string; periodMs: number } | null {
  if (holdMinutes < 20) return { timeframe: 'M1', periodMs: 60 * 1000 };
  if (holdMinutes < 60) return { timeframe: 'M5', periodMs: 5 * 60 * 1000 };
  if (holdMinutes < 360) return { timeframe: 'M15', periodMs: 15 * 60 * 1000 };
  if (holdMinutes < 1440) return { timeframe: 'H1', periodMs: 60 * 60 * 1000 };
  // > 24 hours
  if (maxHoldHours && holdMinutes > maxHoldHours * 60) {
    // Trade already flagged for hold time violation — skip SL check
    return null;
  }
  return { timeframe: 'H4', periodMs: 4 * 60 * 60 * 1000 };
}

/**
 * Format candle open time in EAT for violation messages.
 * Returns simple time like "10:30 EAT" or "13:00 EAT"
 */
function formatCandleTimeEAT(candleTimeISO: string, _periodMs: number): string {
  const utc = new Date(candleTimeISO);
  const eat = new Date(utc.getTime() + 3 * 60 * 60 * 1000); // UTC+3
  const yyyy = eat.getUTCFullYear();
  const mo   = (eat.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd   = eat.getUTCDate().toString().padStart(2, '0');
  const h    = eat.getUTCHours().toString().padStart(2, '0');
  const m    = eat.getUTCMinutes().toString().padStart(2, '0');
  return `${yyyy}-${mo}-${dd} ${h}:${m} EAT`;
}

/**
 * Fake SL Detection — only runs on winning trades where SL was set at entry.
 * Checks if price went past the max allowed risk level during the trade, which
 * means the SL was removed or widened after opening (cheating).
 *
 * Uses 10% tolerance internally so marginal cases are not flagged.
 * Messages show the admin-set max risk (not the tolerance-adjusted value).
 * Uses ratio method for currency conversion — works for all instruments.
 * Returns violation message, null (valid), or 'FAILED' (candle fetch error).
 */
interface SlCheckOutcome {
  violation: string | null | 'FAILED';
  slAllowedPrice: number | null;
  slMaxAdversePrice: number | null;
  slCheckResult: 'passed' | 'fake_sl' | 'no_candles' | 'skipped';
}

const SL_SKIPPED: SlCheckOutcome = { violation: null, slAllowedPrice: null, slMaxAdversePrice: null, slCheckResult: 'skipped' };

async function validateSlWithCandles(
  trade: TradeRow,
  maxHoldHours: number | null = null,
  maxRiskDollars: number = 0,
  opts?: { windowStart?: Date; windowEnd?: Date; effectiveVolume?: number }
): Promise<SlCheckOutcome> {
  if (!trade.open_time || !trade.close_time) return SL_SKIPPED;
  if (!maxRiskDollars || maxRiskDollars <= 0) return SL_SKIPPED;

  const openPrice  = parseFloat(String(trade.open_price));
  const closePrice = parseFloat(String(trade.close_price));
  const volume     = opts?.effectiveVolume ?? parseFloat(String(trade.volume));
  const tradeNet   = parseFloat(String(trade.profit)) + parseFloat(String(trade.commission || 0)) + parseFloat(String(trade.swap || 0));
  const isBuy      = trade.trade_type?.toLowerCase() === 'buy';

  if (!openPrice || !volume) return SL_SKIPPED;

  // 10% tolerance — internal threshold only, message shows raw maxRiskDollars
  const effectiveMaxRisk = maxRiskDollars * 1.10;

  // Ratio method for correct non-USD conversion; fallback to pip-based
  const maxSlPrice = calculateMaxSlPrice(trade.symbol, volume, openPrice, effectiveMaxRisk, isBuy, closePrice, tradeNet);
  if (maxSlPrice <= 0) return SL_SKIPPED;

  const windowFrom = opts?.windowStart ?? new Date(trade.open_time);
  const windowTo   = opts?.windowEnd   ?? new Date(trade.close_time);
  const openMs     = windowFrom.getTime();
  const closeMs    = windowTo.getTime();
  if (openMs <= 946684800000 || closeMs <= openMs) return { ...SL_SKIPPED, slAllowedPrice: maxSlPrice };

  const holdMinutes = (closeMs - openMs) / (60 * 1000);
  // Always use M1 candles from local DB — no timeframe selection needed
  const tf = { timeframe: 'M1', periodMs: 60 * 1000 };

  let candles = await fetchCandles(trade.symbol, windowFrom, windowTo, 'M1');

  if (candles === null) {
    return { violation: 'FAILED', slAllowedPrice: maxSlPrice, slMaxAdversePrice: null, slCheckResult: 'no_candles' };
  }
  if (candles.length === 0) {
    // Symbol exists in DB but trade is too short — pass (benefit of doubt)
    return { ...SL_SKIPPED, slAllowedPrice: maxSlPrice, slCheckResult: 'passed' };
  }

  // Exclude first and last candle (entry/exit candles have partial data)
  const safeCandles = candles.filter(candle => {
    const candleTime = new Date(candle.time).getTime();
    const candleEnd  = candleTime + tf.periodMs;
    return candleTime > openMs && candleEnd <= closeMs;
  });

  if (safeCandles.length === 0) return { ...SL_SKIPPED, slAllowedPrice: maxSlPrice };

  // Most adverse price reached during trade (min low for Buy, max high for Sell)
  const slMaxAdversePrice = isBuy
    ? Math.min(...safeCandles.map(c => c.low))
    : Math.max(...safeCandles.map(c => c.high));

  // Message shows admin-set max (not tolerance-adjusted)
  const riskLabel = trade.symbol.endsWith('c') ? `¢${maxRiskDollars}` : `$${maxRiskDollars}`;

  const netLabel = trade.symbol.endsWith('c') ? `¢${tradeNet.toFixed(2)}` : `$${tradeNet.toFixed(2)}`;

  for (const candle of safeCandles) {
    if (isBuy) {
      if (candle.low <= maxSlPrice) {
        const eatTime = formatCandleTimeEAT(candle.time, tf.periodMs);
        return {
          violation: `Price exceeded the maximum allowed risk (${riskLabel}, virtual SL @ ${maxSlPrice.toFixed(5)}) on the ${tf.timeframe} candle formed at ${eatTime}. Trade should have been closed at that point. Profit of ${netLabel} not counted — max allowed loss of ${riskLabel} deducted instead.`,
          slAllowedPrice: maxSlPrice, slMaxAdversePrice, slCheckResult: 'fake_sl',
        };
      }
    } else {
      if (candle.high >= maxSlPrice) {
        const eatTime = formatCandleTimeEAT(candle.time, tf.periodMs);
        return {
          violation: `Price exceeded the maximum allowed risk (${riskLabel}, virtual SL @ ${maxSlPrice.toFixed(5)}) on the ${tf.timeframe} candle formed at ${eatTime}. Trade should have been closed at that point. Profit of ${netLabel} not counted — max allowed loss of ${riskLabel} deducted instead.`,
          slAllowedPrice: maxSlPrice, slMaxAdversePrice, slCheckResult: 'fake_sl',
        };
      }
    }
  }

  return { violation: null, slAllowedPrice: maxSlPrice, slMaxAdversePrice, slCheckResult: 'passed' };
}

// Partial-close-aware SL check.
// siblings = all closing deals for the same position_id, sorted by close_time asc.
// For each deal we check the candle window from the END of the previous partial close (or open_time for the first)
// using the lot that was still open at that point. Window 0 (full lot) governs all deals — if it's breached, every
// partial of the position is marked fake_sl (loss occurred before any partial was taken).
async function runSlCheckForTrade(
  trade: TradeRow,
  siblings: TradeRow[],
  maxHoldHours: number | null,
  maxRiskDollars: number
): Promise<SlCheckOutcome> {
  if (siblings.length <= 1) {
    return validateSlWithCandles(trade, maxHoldHours, maxRiskDollars);
  }

  const totalLot = siblings.reduce((s, t) => s + parseFloat(String(t.volume)), 0);
  const thisIdx  = siblings.findIndex(t => t.ticket === trade.ticket);

  // Window 0: open → first partial close with total lot
  const w0 = await validateSlWithCandles(trade, maxHoldHours, maxRiskDollars, {
    windowStart: new Date(trade.open_time),
    windowEnd:   new Date(siblings[0].close_time),
    effectiveVolume: totalLot,
  });

  if (w0.violation === 'FAILED') return w0; // no candle data
  if (w0.violation) return w0;              // Window 0 breached → all partials fail
  if (thisIdx === 0) return w0;             // first partial, passed

  // Later partial: check own window [prev_close → this_close] with remaining lot
  const windowStart  = new Date(siblings[thisIdx - 1].close_time);
  const remainingLot = siblings.slice(thisIdx).reduce((s, t) => s + parseFloat(String(t.volume)), 0);
  return validateSlWithCandles(trade, maxHoldHours, maxRiskDollars, {
    windowStart,
    effectiveVolume: remainingLot,
  });
}

// ==================== ENGINE ====================

export class WpEvaluationEngine {
  private bot: any = null;

  setBot(bot: any) {
    this.bot = bot;
  }

  /**
   * Run full evaluation after a pull cycle
   */
  async evaluate(challengeId: number): Promise<{ evaluated: number; flagged: number; qualified: number }> {
    console.log(`📊 WP Evaluation: Starting for challenge ${challengeId}`);

    const rules = await this.loadRules(challengeId);
    if (!rules) {
      console.log('⚠️ WP Evaluation: No rules configured, seeding defaults');
      await this.seedDefaultRules(challengeId);
      return this.evaluate(challengeId);
    }

    const challenge = await db.query(`SELECT starting_balance, target_balance, type FROM trading_challenges WHERE id = $1`, [challengeId]);
    const startingBalance = parseFloat(challenge.rows[0]?.starting_balance || 30);
    const targetBalance = parseFloat(challenge.rows[0]?.target_balance || 60);
    const challengeType = challenge.rows[0]?.type;

    const registrations = await db.query(
      `SELECT id, account_number, user_id, username, nickname, account_type, account_subtype, is_cent, source
       FROM trading_registrations WHERE challenge_id = $1 AND disqualified = false AND investor_password IS NOT NULL`,
      [challengeId]
    );

    let totalFlagged = 0;
    let totalQualified = 0;

    for (const reg of registrations.rows) {
      // Determine if conversion is needed for this user
      // Rule: Admin enters in CENT terms ONLY for "Real + cent-only" challenges.
      // All other scenarios: admin enters in STANDARD terms.
      // Convert ×100 when: user is cent AND challenge is NOT "real + cent-only"
      let effectiveRules = rules;
      let effectiveStartBalance = startingBalance;
      let effectiveTargetBalance = targetBalance;

      const userIsCent = reg.is_cent || false;
      const isRealCentOnly = challengeType === 'real' && rules.only_cent_account;

      if (userIsCent && !isRealCentOnly) {
        // User is cent but admin entered in standard terms → convert ×100
        effectiveRules = {
          ...rules,
          max_lot_size: rules.max_lot_size ? rules.max_lot_size * 100 : null,
          max_risk_dollars: rules.max_risk_dollars ? rules.max_risk_dollars * 100 : null,
          daily_loss_cap: rules.daily_loss_cap ? rules.daily_loss_cap * 100 : null,
        };
        effectiveStartBalance = startingBalance * 100;
        effectiveTargetBalance = targetBalance * 100;
      }
      // If isRealCentOnly: admin entered in cent terms, all users are cent → no conversion
      // If user is NOT cent: admin entered in standard terms → no conversion

      const result = await this.evaluateAccount(challengeId, reg, effectiveRules, effectiveStartBalance, effectiveTargetBalance);
      totalFlagged += result.flaggedCount;
      if (result.isQualified) totalQualified++;
    }

    // NOTE: Rankings are now managed by leaderboardService (updated at start of next cycle).
    // This method is kept for backward compatibility but ranking is handled externally.
    // await this.updateRankings(challengeId);

    console.log(`✅ WP Evaluation: ${registrations.rows.length} accounts, ${totalFlagged} flags, ${totalQualified} qualified`);
    return { evaluated: registrations.rows.length, flagged: totalFlagged, qualified: totalQualified };
  }


  /**
   * Evaluate a single account — public for per-account streaming evaluation
   */
  async evaluateSingleAccount(challengeId: number, registrationId: number): Promise<{ flaggedCount: number; isQualified: boolean }> {
    const rules = await this.loadRules(challengeId);
    if (!rules) {
      // No rules configured — still create leaderboard entry with basic data
      console.log(`⚠️ WP Evaluation: No rules for challenge ${challengeId}, creating basic leaderboard entry`);
      await this.seedDefaultRules(challengeId);
      // Retry with default rules
      return this.evaluateSingleAccount(challengeId, registrationId);
    }

    const challenge = await db.query(`SELECT starting_balance, target_balance, type FROM trading_challenges WHERE id = $1`, [challengeId]);
    const startingBalance = parseFloat(challenge.rows[0]?.starting_balance || 30);
    const targetBalance = parseFloat(challenge.rows[0]?.target_balance || 60);
    const challengeType = challenge.rows[0]?.type;

    const regResult = await db.query(
      `SELECT id, account_number, user_id, username, nickname, account_type, account_subtype, is_cent, source
       FROM trading_registrations WHERE id = $1 AND challenge_id = $2`,
      [registrationId, challengeId]
    );
    if (regResult.rows.length === 0) return { flaggedCount: 0, isQualified: false };
    const reg = regResult.rows[0];
    const userIsCent = reg.is_cent || false;

    // Determine if conversion is needed for this user
    // Rule: Admin enters in CENT terms ONLY for "Real + cent-only" challenges.
    // All other scenarios: admin enters in STANDARD terms.
    // Convert ×100 when: user is cent AND challenge is NOT "real + cent-only"
    let effectiveRules = rules;
    let effectiveStartBalance = startingBalance;
    let effectiveTargetBalance = targetBalance;

    const isRealCentOnly = challengeType === 'real' && rules.only_cent_account;

    if (userIsCent && !isRealCentOnly) {
      // User is cent but admin entered in standard terms → convert ×100
      effectiveRules = {
        ...rules,
        max_lot_size: rules.max_lot_size ? rules.max_lot_size * 100 : null,
        max_risk_dollars: rules.max_risk_dollars ? rules.max_risk_dollars * 100 : null,
        daily_loss_cap: rules.daily_loss_cap ? rules.daily_loss_cap * 100 : null,
      };
      effectiveStartBalance = startingBalance * 100;
      effectiveTargetBalance = targetBalance * 100;
    }
    // If isRealCentOnly: admin entered in cent terms, all users are cent → no conversion
    // If user is NOT cent: admin entered in standard terms → no conversion

    return this.evaluateAccount(challengeId, reg, effectiveRules, effectiveStartBalance, effectiveTargetBalance);
  }

  /**
   * Evaluate a single account (internal)
   */
  private async evaluateAccount(
    challengeId: number, reg: any, rules: RuleConfig, startingBalance: number, targetBalance: number
  ): Promise<{ flaggedCount: number; isQualified: boolean }> {

    // Get challenge dates for period filtering
    const challengeDates = await db.query(
      `SELECT start_date, end_date FROM trading_challenges WHERE id = $1`,
      [challengeId]
    );
    const challengeStart = challengeDates.rows[0]?.start_date;
    const challengeEnd = challengeDates.rows[0]?.end_date;

    // Apply 3-hour grace window before start (for Sunday market open → Monday server time)
    let startFilter = '';
    const params: any[] = [challengeId, reg.id];
    if (challengeStart) {
      const graceStart = new Date(new Date(challengeStart).getTime() - 3 * 60 * 60 * 1000);
      startFilter = ` AND close_time >= $3`;
      params.push(graceStart.toISOString());
    }
    if (challengeEnd) {
      const graceEnd = new Date(new Date(challengeEnd).getTime() + 27 * 60 * 60 * 1000);
      startFilter += ` AND close_time <= $${params.length + 1}`;
      params.push(graceEnd.toISOString());
    }

    const trades = await db.query(
      `SELECT * FROM wp_trades WHERE challenge_id = $1 AND registration_id = $2${startFilter} ORDER BY open_time ASC`,
      params
    );

    if (trades.rows.length === 0) {
      // No trades — use VPS balance, and person's actual starting balance for profit
      let currentBalance = startingBalance;
      let actualStartBalance = startingBalance;
      try {
        const regData = await db.query(`SELECT last_known_balance, registration_balance FROM trading_registrations WHERE id = $1`, [reg.id]);
        const vpsBalance = regData.rows[0]?.last_known_balance;
        const regBalance = regData.rows[0]?.registration_balance;
        if (vpsBalance !== null && vpsBalance !== undefined) currentBalance = parseFloat(vpsBalance);
        // Use person's actual registration balance (or 0 if they registered with $0)
        if (regBalance !== null && regBalance !== undefined) actualStartBalance = parseFloat(regBalance);
        else if (currentBalance < startingBalance) actualStartBalance = currentBalance; // They haven't deposited yet
      } catch {}

      // === 0-TRADES ACTIVE-DAYS DQ / UNDO ===
      if (rules.min_active_days) {
        const challengeEndResult = await db.query(`SELECT end_date FROM trading_challenges WHERE id = $1`, [challengeId]);
        const challengeEnd = challengeEndResult.rows[0]?.end_date;
        if (challengeEnd) {
          const now = new Date();
          const end = new Date(challengeEnd);
          const remainingDays = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
          if (remainingDays >= rules.min_active_days) {
            // Still enough days left — undo any incorrect active-days DQ
            const currentDq = await db.query(
              `SELECT disqualified, disqualified_reason FROM trading_registrations WHERE id = $1`,
              [reg.id]
            );
            const dqRow = currentDq.rows[0];
            if (dqRow?.disqualified && dqRow?.disqualified_reason?.toLowerCase().includes('active')) {
              await db.query(
                `UPDATE trading_registrations SET disqualified = false, disqualified_at = NULL, disqualified_reason = NULL WHERE id = $1`,
                [reg.id]
              );
              await db.query(
                `UPDATE wp_leaderboard SET is_disqualified = false, disqualify_reason = NULL WHERE registration_id = $1`,
                [reg.id]
              );
              console.log(`✅ WP Evaluation: Cleared incorrect active-days DQ for reg ${reg.id} (0 trades, ${remainingDays} days left, need ${rules.min_active_days})`);
            }
          } else {
            // 0 active days + not enough remaining = impossible
            await db.query(
              `UPDATE trading_registrations SET disqualified = true, disqualified_at = NOW(), disqualified_reason = $1 WHERE id = $2 AND disqualified = false`,
              [`Cannot meet minimum ${rules.min_active_days} active trading days (0 days traded, ${remainingDays} days left)`, reg.id]
            );
          }
        }
      }

      // No trades = profit is $0 (they haven't started trading)
      await this.upsertLeaderboard(challengeId, reg, actualStartBalance, { currentBalance, adjustedBalance: currentBalance, qualifiedProfit: 0, grossProfit: 0, profitRemoved: 0, totalTrades: 0, qualifiedTrades: 0, flaggedTrades: 0, activeDays: 0, isQualified: false, lastTradeTime: null });
      return { flaggedCount: 0, isQualified: false };
    }

    const allTrades: TradeRow[] = trades.rows;
    let flaggedCount = 0;
    let grossProfit = 0;
    let profitRemoved = 0;

    // === DEPOSIT DETECTION & ACTUAL STARTING BALANCE ===
    // Rules:
    //   - Pre-challenge deposits are free — user may deposit multiple times before start.
    //     actualStartBalance = their balance at challenge start time.
    //   - If user had balance before start AND any deposit arrives after start → DQ (recharging).
    //   - If user had $0 before start → first post-start deposit = actualStartBalance.
    //     Second post-start deposit → DQ.
    //   - If actualStartBalance > startingBalance (+1% tolerance) → DQ (deposited above limit).
    //
    // Units: registration_balance and wp_deals.profit are raw VPS values.
    // The startingBalance param is already ×100 for cent users — same units on both sides.
    let actualStartBalance = startingBalance;
    try {
      const regData = await db.query(
        `SELECT registration_balance, actual_starting_balance FROM trading_registrations WHERE id = $1`, [reg.id]
      );
      const savedActual = regData.rows[0]?.actual_starting_balance;
      const regBalance  = parseFloat(regData.rows[0]?.registration_balance ?? '0') || 0;
      const currency    = reg.is_cent ? '¢' : '$';

      if (savedActual !== null && savedActual !== undefined && parseFloat(savedActual) > 0) {
        // Already determined in a previous cycle — reuse it.
        // Only treat as determined if > 0: a saved 0 means detection ran but
        // found no deposit yet (e.g. user registered with $0 and deposited between
        // registration and challenge start, landing in preDeposits which the old
        // zero-balance branch ignored). Re-run detection until we find a real amount.
        actualStartBalance = parseFloat(savedActual);
      } else {
        const csTime = challengeStart ? new Date(challengeStart).getTime() : 0;

        // Only treat genuine cash deposits as "deposits". MT5/brokers post several other
        // things through the same deal_type='balance' bucket that are NOT trader-initiated
        // deposits and must never trigger the recharge/DQ logic below, regardless of sign:
        //   - Index/stock dividend adjustments  (comment like "DIV-USTEC-1204213")
        //   - Swap/rollover credited as a balance op instead of per-trade swap (e.g. "SWAP")
        //   - Bonus credits, corrections, and other broker-side balance corrections
        // Real deposits/withdrawals from this broker are tagged "D-..." / "W-...".
        const allDeposits = await db.query(
          `SELECT profit, time FROM wp_deals
           WHERE challenge_id = $1 AND registration_id = $2
             AND (deal_type ILIKE '%balance%' OR deal_type = '2')
             AND profit > 0
             AND comment NOT ILIKE 'DIV%'
             AND comment NOT ILIKE '%DIVIDEND%'
             AND comment NOT ILIKE '%SWAP%'
             AND comment NOT ILIKE '%BONUS%'
             AND comment NOT ILIKE '%CREDIT%'
             AND comment NOT ILIKE '%CORRECTION%'
           ORDER BY time ASC`,
          [challengeId, reg.id]
        );

        const preDeposits  = allDeposits.rows.filter(d => new Date(d.time).getTime() <  csTime);
        const postDeposits = allDeposits.rows.filter(d => new Date(d.time).getTime() >= csTime);
        const tolerance    = startingBalance * 0.01; // 1% tolerance, same as registration check

        if (regBalance > 0) {
          // ── User had money before challenge started ──────────────────────
          // actualStartBalance = registration snapshot + any pre-challenge deposits
          // that landed in the pull window (between registration and challenge start).
          // preDeposits come from the challenge_start-1h window so they don't
          // overlap with registration_balance (which was snapshotted earlier).
          const extraPre = preDeposits.reduce((sum, d) => sum + parseFloat(d.profit), 0);
          actualStartBalance = regBalance + extraPre;

          await db.query(
            `UPDATE trading_registrations SET actual_starting_balance = $1 WHERE id = $2`,
            [actualStartBalance, reg.id]
          );

          // Did pre-challenge deposits push them above the allowed limit?
          if (actualStartBalance > startingBalance + tolerance) {
            await db.query(
              `UPDATE trading_registrations SET disqualified = true, disqualified_at = NOW(), disqualified_reason = $1 WHERE id = $2 AND disqualified = false`,
              [`Starting balance ${currency}${actualStartBalance.toFixed(2)} exceeds allowed starting balance of ${currency}${startingBalance.toFixed(2)}`, reg.id]
            );
          }

          // Any deposit AFTER challenge start = recharging = DQ
          if (postDeposits.length > 0) {
            const d  = postDeposits[0];
            const dt = new Date(d.time).toISOString().slice(0, 10);
            await db.query(
              `UPDATE trading_registrations SET disqualified = true, disqualified_at = NOW(), disqualified_reason = $1 WHERE id = $2 AND disqualified = false`,
              [`Account recharged — deposit of ${currency}${parseFloat(d.profit).toFixed(2)} detected after challenge start (${dt})`, reg.id]
            );
          }

        } else {
          // ── User had $0 before challenge — waiting for first deposit ─────
          // Check pre-challenge deposits first: user registered with $0 but deposited
          // between registration and challenge start (common — they fund the account
          // after signing up but before the gun fires). These show up in preDeposits
          // but the regBalance>0 branch never runs, so we must handle them here.
          const preSum = preDeposits.reduce((sum, d) => sum + parseFloat(d.profit), 0);

          if (postDeposits.length === 0 && preSum === 0) {
            // Genuinely hasn't deposited at all yet — keep pulling
            actualStartBalance = 0;
          } else if (postDeposits.length === 0 && preSum > 0) {
            // Deposited before challenge start (between registration and challenge start)
            actualStartBalance = preSum;

            if (actualStartBalance > startingBalance + tolerance) {
              await db.query(
                `UPDATE trading_registrations SET disqualified = true, disqualified_at = NOW(), disqualified_reason = $1 WHERE id = $2 AND disqualified = false`,
                [`Starting balance ${currency}${actualStartBalance.toFixed(2)} exceeds allowed starting balance of ${currency}${startingBalance.toFixed(2)}`, reg.id]
              );
            }

            await db.query(
              `UPDATE trading_registrations SET actual_starting_balance = $1 WHERE id = $2`,
              [actualStartBalance, reg.id]
            );

            // Any deposit AFTER challenge start on top of the pre-deposit = recharging = DQ
            if (postDeposits.length > 0) {
              const d  = postDeposits[0];
              const dt = new Date(d.time).toISOString().slice(0, 10);
              await db.query(
                `UPDATE trading_registrations SET disqualified = true, disqualified_at = NOW(), disqualified_reason = $1 WHERE id = $2 AND disqualified = false`,
                [`Account recharged — deposit of ${currency}${parseFloat(d.profit).toFixed(2)} detected after challenge start (${dt})`, reg.id]
              );
            }
          } else {
            // First deposit arrived after challenge start
            const firstAmount = parseFloat(postDeposits[0].profit);
            actualStartBalance = firstAmount + preSum; // preSum usually 0 here but include for correctness

            // First deposit above allowed limit?
            if (actualStartBalance > startingBalance + tolerance) {
              await db.query(
                `UPDATE trading_registrations SET disqualified = true, disqualified_at = NOW(), disqualified_reason = $1 WHERE id = $2 AND disqualified = false`,
                [`Starting balance ${currency}${actualStartBalance.toFixed(2)} exceeds allowed starting balance of ${currency}${startingBalance.toFixed(2)}`, reg.id]
              );
            }

            await db.query(
              `UPDATE trading_registrations SET actual_starting_balance = $1 WHERE id = $2`,
              [actualStartBalance, reg.id]
            );

            // Second deposit after start = DQ (recharging)
            if (postDeposits.length > 1) {
              const d  = postDeposits[1];
              const dt = new Date(d.time).toISOString().slice(0, 10);
              await db.query(
                `UPDATE trading_registrations SET disqualified = true, disqualified_at = NOW(), disqualified_reason = $1 WHERE id = $2 AND disqualified = false`,
                [`Account recharged — second deposit of ${currency}${parseFloat(d.profit).toFixed(2)} detected after challenge start (${dt})`, reg.id]
              );
            }
          }
        }
      }
    } catch {
      // Fallback to challenge starting balance
    }

    // Use actual starting balance for this person's evaluation
    const effectiveStartBalance = actualStartBalance;

    // ── Partial-close deduplication ─────────────────────────────────────────
    // A position closed in N parts creates N wp_trades rows, all sharing the same
    // open_time and position_id. For concurrent-trade checks we must count a
    // position only once, regardless of how many partial-close rows it has.
    //
    // Strategy: for each unique position_id, collapse all its partial-close rows
    // into one "logical trade" that spans open_time → last close_time.
    // The check uses logical trades; violations are then propagated back to every
    // partial-close ticket of the offending position.
    //
    // position_id is stored on each wp_trades row (ticket of the opening deal).
    // Fall back to the trade ticket itself when position_id is not stored.

    // Map: positionId → all trade tickets that belong to it
    const positionToTickets = new Map<number, number[]>();
    // Map: ticket → positionId (for reverse lookup)
    const ticketToPosition = new Map<number, number>();

    allTrades.forEach(t => {
      // position_id column may not exist on older rows — fall back to ticket
      const posId: number = (t as any).position_id ?? t.ticket;
      ticketToPosition.set(t.ticket, posId);
      if (!positionToTickets.has(posId)) positionToTickets.set(posId, []);
      positionToTickets.get(posId)!.push(t.ticket);
    });

    // Build one "logical trade" per position: earliest open_time, latest close_time
    interface LogicalTrade { posId: number; openMs: number; closeMs: number; symbol: string; maxVolume: number; tickets: number[] }
    const logicalTrades: LogicalTrade[] = [];
    for (const [posId, tickets] of positionToTickets) {
      const parts = allTrades.filter(t => tickets.includes(t.ticket));
      const openMs  = Math.min(...parts.map(t => new Date(t.open_time).getTime()));
      const closeMs = Math.max(...parts.map(t => new Date(t.close_time).getTime()));
      // Max volume = largest single partial (for lot-size check on positions)
      const maxVolume = Math.max(...parts.map(t => parseFloat(String(t.volume))));
      logicalTrades.push({ posId, openMs, closeMs, symbol: parts[0].symbol, maxVolume, tickets });
    }

    // Pre-compute simultaneous trade violations (on logical trades, not partial rows)
    type TimeEvent = { time: number; posId: number; symbol: string; action: 'open' | 'close' };
    const events: TimeEvent[] = [];
    logicalTrades.forEach(lt => {
      events.push({ time: lt.openMs,  posId: lt.posId, symbol: lt.symbol, action: 'open' });
      events.push({ time: lt.closeMs, posId: lt.posId, symbol: lt.symbol, action: 'close' });
    });
    // Tie-break at equal timestamps: a position's OWN open/close pair (0-duration trade)
    // must self-cancel — open before its own close — otherwise it would be deleted
    // (no-op, since it was never added yet) before being added, leaving it stuck in the
    // open set forever and falsely flagging every later trade as "simultaneous".
    // For DIFFERENT positions at the same instant, close still sorts before open so a
    // trade closing exactly when another opens isn't counted as overlapping.
    events.sort((a, b) => {
      if (a.time !== b.time) return a.time - b.time;
      if (a.posId === b.posId) return a.action === 'open' ? -1 : 1;
      return a.action === 'close' ? -1 : 1;
    });

    // positionViolators: posId → [co-offending posIds]
    const positionViolators = new Map<number, number[]>();
    if (rules.max_open_trades) {
      const symbolOf = new Map<number, string>(logicalTrades.map(lt => [lt.posId, lt.symbol]));
      const openSet = new Set<number>();
      for (const ev of events) {
        if (ev.action === 'open') openSet.add(ev.posId); else openSet.delete(ev.posId);
        if (openSet.size > rules.max_open_trades) {
          openSet.forEach(pid => {
            const coOffenders = [...openSet].filter(o => o !== pid);
            if (!positionViolators.has(pid)) {
              positionViolators.set(pid, coOffenders);
            } else {
              const existing = positionViolators.get(pid)!;
              const existingSet = new Set(existing);
              coOffenders.forEach(c => { if (!existingSet.has(c)) existing.push(c); });
            }
          });
        }
      }
    }

    // Propagate position violations back to individual partial-close tickets
    const maxOpenViolators = new Map<number, { ticket: number; symbol: string }[]>();
    for (const [posId, coOffenderPosIds] of positionViolators) {
      const myTickets = positionToTickets.get(posId) || [];
      // co-offenders: pick first ticket of each co-offending position
      const coOffenders = coOffenderPosIds.map(coPosId => {
        const coTickets = positionToTickets.get(coPosId) || [];
        return { ticket: coTickets[0] ?? coPosId, symbol: logicalTrades.find(lt => lt.posId === coPosId)?.symbol || '' };
      });
      myTickets.forEach(tk => maxOpenViolators.set(tk, coOffenders));
    }

    // pairViolators: ticket → ticket[] of co-offending same-pair trades
    // Same dedup: count by logical position, not partial rows
    const pairViolators = new Map<number, number[]>();
    if (rules.pair_limit) {
      const bySymbol = new Map<string, LogicalTrade[]>();
      logicalTrades.forEach(lt => {
        if (!bySymbol.has(lt.symbol)) bySymbol.set(lt.symbol, []);
        bySymbol.get(lt.symbol)!.push(lt);
      });

      bySymbol.forEach(symLogical => {
        const symEvents: TimeEvent[] = [];
        symLogical.forEach(lt => {
          symEvents.push({ time: lt.openMs,  posId: lt.posId, symbol: lt.symbol, action: 'open' });
          symEvents.push({ time: lt.closeMs, posId: lt.posId, symbol: lt.symbol, action: 'close' });
        });
        // Same self-cancel fix as the global open-trades check above: a 0-duration
        // position's own open/close pair must not get stuck "open" forever.
        symEvents.sort((a, b) => {
          if (a.time !== b.time) return a.time - b.time;
          if (a.posId === b.posId) return a.action === 'open' ? -1 : 1;
          return a.action === 'close' ? -1 : 1;
        });
        const symOpen = new Set<number>();
        const symPosViolators = new Map<number, number[]>();
        for (const ev of symEvents) {
          if (ev.action === 'open') symOpen.add(ev.posId); else symOpen.delete(ev.posId);
          if (symOpen.size > rules.pair_limit!) {
            symOpen.forEach(pid => {
              const coOffenders = [...symOpen].filter(o => o !== pid);
              if (!symPosViolators.has(pid)) {
                symPosViolators.set(pid, coOffenders);
              } else {
                const existing = symPosViolators.get(pid)!;
                const existingSet = new Set(existing);
                coOffenders.forEach(c => { if (!existingSet.has(c)) existing.push(c); });
              }
            });
          }
        }
        // Propagate back to tickets
        for (const [posId, coOffenderPosIds] of symPosViolators) {
          const myTickets = positionToTickets.get(posId) || [];
          const coTickets = coOffenderPosIds.flatMap(coPosId => positionToTickets.get(coPosId) || [coPosId]);
          myTickets.forEach(tk => {
            if (!pairViolators.has(tk)) pairViolators.set(tk, coTickets);
            else { const ex = pairViolators.get(tk)!; const exSet = new Set(ex); coTickets.forEach(c => { if (!exSet.has(c)) ex.push(c); }); }
          });
        }
      });
    }

    // Daily drawdown tracking
    const dailyDrawdownFlagged = new Set<number>();
    let drawdownBreachTime: string | null = null;
    let drawdownBreachDay: string | null = null;

    if (rules.daily_loss_cap) {
      const tradesByDay = new Map<string, TradeRow[]>();
      allTrades.forEach(t => {
        const day = new Date(t.close_time).toISOString().split('T')[0];
        if (!tradesByDay.has(day)) tradesByDay.set(day, []);
        tradesByDay.get(day)!.push(t);
      });

      let runningBalance = startingBalance;
      const sortedDays = [...tradesByDay.keys()].sort();
      for (const day of sortedDays) {
        const dayOpenBalance = runningBalance;
        let drawdownBreached = false;

        for (const t of tradesByDay.get(day)!) {
          const tradeNet = parseFloat(String(t.profit)) + parseFloat(String(t.commission || 0)) + parseFloat(String(t.swap || 0));
          runningBalance += tradeNet;
          const drawdown = dayOpenBalance - runningBalance;

          if (drawdown >= rules.daily_loss_cap! && !drawdownBreached) {
            drawdownBreached = true;
            drawdownBreachDay = day;
            // Get the time of the trade that caused the breach
            const breachTimeUTC = new Date(t.close_time);
            const breachTimeEAT = new Date(breachTimeUTC.getTime() + 3 * 60 * 60 * 1000);
            drawdownBreachTime = `${breachTimeEAT.getUTCHours().toString().padStart(2, '0')}:${breachTimeEAT.getUTCMinutes().toString().padStart(2, '0')}`;
          }

          if (drawdownBreached && tradeNet > 0) {
            dailyDrawdownFlagged.add(t.ticket);
          }
        }
      }
    }

    // === Position-level SL pre-check ===
    // The SL — whether declared by the user or implied via candle data — governs the
    // position's FULL lot size at entry. Partially closing later doesn't reduce the
    // risk already taken on the first segment. So both layers are evaluated ONCE per
    // position using the full lot; if either breaches, the SAME violation applies to
    // EVERY child close of that position (win or loss), not just whichever close
    // happened to be profitable.
    const isDefinitiveSl = (r: string | null | undefined) => r === 'fake_sl' || r === 'passed';
    interface PositionSlOutcome {
      layerABreach: boolean; layerAViolation: string | null;
      layerBBreach: boolean; layerBViolation: string | null;
      slAllowedPrice: number | null; slMaxAdversePrice: number | null; slCheckResult: string;
    }
    // Per-TICKET SL outcome (not per-position) — allows different results for each partial close
    const ticketSlOutcomes = new Map<number, PositionSlOutcome>();

    if (rules.stop_loss_required && rules.max_risk_dollars) {
      const currency = reg.is_cent ? '¢' : '$';
      for (const [posId, tickets] of positionToTickets) {
        const siblings = allTrades
          .filter(t => tickets.includes(t.ticket))
          .sort((a, b) => new Date(a.close_time).getTime() - new Date(b.close_time).getTime());
        const isPartialClose = siblings.length > 1;
        const entryTrade = siblings[0];
        const totalLot = siblings.reduce((s, t) => s + parseFloat(String(t.volume)), 0);

        // Layer A: declared SL too wide — applies to ALL closes of this position
        let layerABreach = false;
        let layerAViolation: string | null = null;
        const sl = parseFloat(String(entryTrade.stop_loss));
        const hasSl = sl !== 0 && !isNaN(sl);
        if (hasSl) {
          const entryNet = parseFloat(String(entryTrade.profit)) + parseFloat(String(entryTrade.commission || 0)) + parseFloat(String(entryTrade.swap || 0));
          const slDollars = calculateSlDollars(
            entryTrade.symbol, totalLot,
            parseFloat(String(entryTrade.open_price)), sl,
            parseFloat(String(entryTrade.close_price)), entryNet
          );
          const tolerance = rules.max_risk_dollars * 0.10;
          if (slDollars > rules.max_risk_dollars + tolerance) {
            layerABreach = true;
            layerAViolation = `Declared SL risk ${currency}${slDollars.toFixed(2)} exceeds max ${currency}${rules.max_risk_dollars}${isPartialClose ? ' (full position) — all closes disqualified' : ''}`;
          }
        }

        // Layer B: Multi-window candle check for partial closes
        // Window 0: open → first close (full lot) — if breached, ALL closes fail
        // Window N: prev_close → this_close (remaining lot) — if breached, this + subsequent fail
        const anyProfitable = siblings.some(t => (parseFloat(String(t.profit)) + parseFloat(String(t.commission || 0)) + parseFloat(String(t.swap || 0))) > 0);
        if (anyProfitable || isPartialClose) {
          let windowBreachedFrom = -1; // index from which all subsequent are flagged

          // Window 0: full lot
          const w0 = await validateSlWithCandles(entryTrade, rules.max_hold_hours || null, rules.max_risk_dollars, {
            windowStart: new Date(entryTrade.open_time),
            windowEnd: new Date(siblings[0].close_time),
            effectiveVolume: totalLot,
          });

          if (w0.violation && w0.violation !== 'FAILED') {
            windowBreachedFrom = 0; // all closes fail
            for (const sib of siblings) {
              ticketSlOutcomes.set(sib.ticket, {
                layerABreach, layerAViolation,
                layerBBreach: true, layerBViolation: w0.violation,
                slAllowedPrice: w0.slAllowedPrice ?? null,
                slMaxAdversePrice: w0.slMaxAdversePrice ?? null,
                slCheckResult: 'fake_sl',
              });
            }
          } else if (w0.violation === 'FAILED') {
            // No candle data for window 0 — mark all as pending (don't store outcome)
          } else {
            // Window 0 passed — check subsequent windows for partial closes
            for (let i = 1; i < siblings.length; i++) {
              const windowStart = new Date(siblings[i - 1].close_time);
              const remainingLot = siblings.slice(i).reduce((s, t) => s + parseFloat(String(t.volume)), 0);
              const wN = await validateSlWithCandles(siblings[i], rules.max_hold_hours || null, rules.max_risk_dollars, {
                windowStart,
                effectiveVolume: remainingLot,
              });

              if (wN.violation && wN.violation !== 'FAILED') {
                // This window breached — this and all subsequent closes fail
                for (let j = i; j < siblings.length; j++) {
                  ticketSlOutcomes.set(siblings[j].ticket, {
                    layerABreach, layerAViolation,
                    layerBBreach: true, layerBViolation: wN.violation,
                    slAllowedPrice: wN.slAllowedPrice ?? null,
                    slMaxAdversePrice: wN.slMaxAdversePrice ?? null,
                    slCheckResult: 'fake_sl',
                  });
                }
                break; // no need to check further windows
              } else if (wN.violation === 'FAILED') {
                // No candle data — leave as pending for this ticket
              } else {
                // Window passed — mark this ticket as passed (if not already set by layer A)
                if (!ticketSlOutcomes.has(siblings[i].ticket)) {
                  ticketSlOutcomes.set(siblings[i].ticket, {
                    layerABreach, layerAViolation,
                    layerBBreach: false, layerBViolation: null,
                    slAllowedPrice: wN.slAllowedPrice ?? null,
                    slMaxAdversePrice: wN.slMaxAdversePrice ?? null,
                    slCheckResult: 'passed',
                  });
                }
              }
            }

            // Mark first partial as passed if not already set
            if (!ticketSlOutcomes.has(siblings[0].ticket)) {
              ticketSlOutcomes.set(siblings[0].ticket, {
                layerABreach, layerAViolation,
                layerBBreach: false, layerBViolation: null,
                slAllowedPrice: w0.slAllowedPrice ?? null,
                slMaxAdversePrice: w0.slMaxAdversePrice ?? null,
                slCheckResult: 'passed',
              });
            }
          }
        }

        // If only Layer A breached (no Layer B run or passed), store for all tickets
        if (layerABreach) {
          for (const sib of siblings) {
            if (!ticketSlOutcomes.has(sib.ticket)) {
              ticketSlOutcomes.set(sib.ticket, {
                layerABreach, layerAViolation,
                layerBBreach: false, layerBViolation: null,
                slAllowedPrice: null, slMaxAdversePrice: null, slCheckResult: 'skipped',
              });
            }
          }
        }
      }
    }

    // Evaluate each trade
    const slCheckFailures: { ticket: number; symbol: string; tradeId: number }[] = [];
    for (const trade of allTrades) {
      const violations: string[] = [];
      const tradeNet = parseFloat(String(trade.profit)) + parseFloat(String(trade.commission || 0)) + parseFloat(String(trade.swap || 0));
      grossProfit += tradeNet;

      // Max lot size — check the full position volume (sum of all partials),
      // not just the partial close volume, to catch positions that opened large
      // and were closed in smaller pieces.
      if (rules.max_lot_size) {
        const posId = ticketToPosition.get(trade.ticket) ?? trade.ticket;
        const lt = logicalTrades.find(l => l.posId === posId);
        const positionVolume = lt ? lt.maxVolume : parseFloat(String(trade.volume));
        if (positionVolume > rules.max_lot_size) {
          violations.push(`Lot size ${positionVolume} exceeds max ${rules.max_lot_size} lots`);
        }
      }

      // Max open trades — include co-offending ticket IDs with their symbols
      if (maxOpenViolators.has(trade.ticket)) {
        const coOffenders = maxOpenViolators.get(trade.ticket)!;
        const coStr = coOffenders.map(c => `#${c.ticket} [${c.symbol}]`).join(', ');
        violations.push(`Exceeded max ${rules.max_open_trades} simultaneous open trades (also open: ${coStr})`);
      }

      // Pair limit — same symbol so no need to repeat currency
      if (pairViolators.has(trade.ticket)) {
        const coOffenders = pairViolators.get(trade.ticket)!;
        const coStr = coOffenders.map(tk => `#${tk}`).join(', ');
        violations.push(`Exceeded max ${rules.pair_limit} simultaneous ${trade.symbol} trades (also open: ${coStr})`);
      }

      // Daily loss cap
      if (dailyDrawdownFlagged.has(trade.ticket)) {
        const currency = reg.is_cent ? '¢' : '$';
        const capDisplay = rules.daily_loss_cap ? `${currency}${(rules.daily_loss_cap).toFixed(2)}` : '';
        violations.push(`Profit after daily ${capDisplay} drawdown breach`);
      }

      // Hold time
      if (rules.max_hold_hours && trade.open_time && trade.close_time) {
        const openMs  = new Date(trade.open_time).getTime();
        const closeMs = new Date(trade.close_time).getTime();
        if (openMs > 946684800000 && closeMs > openMs) {
          const holdHours = (closeMs - openMs) / (1000 * 60 * 60);
          if (holdHours > rules.max_hold_hours) {
            violations.push(`Held ${holdHours.toFixed(1)}h exceeds max ${rules.max_hold_hours}h`);
          }
        }
      }

      // Weekend trading
      if (!rules.weekend_trading) {
        if (this.isWeekend(new Date(trade.open_time)) || this.isWeekend(new Date(trade.close_time))) {
          violations.push(`Weekend trading`);
        }
      }

      // === SL CHECK — Only runs on profitable trades that pass ALL other rules above ===
      let slPenaltyDollars = 0;
      if (rules.stop_loss_required && violations.length === 0 && tradeNet > 0) {
        const currency = reg.is_cent ? '¢' : '$';
        const MAX_SL_CHECK_ATTEMPTS = 5;
        const MAX_CONFLICTS = 3;
        const isDefinitive = isDefinitiveSl;
        const ticketOutcome = ticketSlOutcomes.get(trade.ticket);

        // Layer A — declared SL too wide
        if (ticketOutcome?.layerABreach) {
          violations.push(ticketOutcome.layerAViolation!);
        }

        if (ticketOutcome?.layerBBreach) {
          // Layer B (fake SL) confirmed for this specific ticket
          violations.push(ticketOutcome.layerBViolation!);
          if (rules.max_risk_dollars) slPenaltyDollars = rules.max_risk_dollars;
          await db.query(
            `UPDATE wp_trades SET sl_allowed_price = $1, sl_max_adverse_price = $2, sl_check_result = $3, sl_check_pending = false, sl_check_attempts = 0, sl_conflict_count = 0 WHERE id = $4`,
            [ticketOutcome.slAllowedPrice, ticketOutcome.slMaxAdversePrice, ticketOutcome.slCheckResult, trade.id]
          ).catch(() => {});
        } else if (ticketOutcome && ticketOutcome.slCheckResult === 'passed') {
          // Pre-pass confirmed this ticket passed — mark as passed
          await db.query(
            `UPDATE wp_trades SET sl_allowed_price = $1, sl_max_adverse_price = $2, sl_check_result = 'passed', sl_check_pending = false WHERE id = $3`,
            [ticketOutcome.slAllowedPrice, ticketOutcome.slMaxAdversePrice, trade.id]
          ).catch(() => {});
        } else if (rules.max_risk_dollars && !ticketOutcome) {
          const existingResult = trade.sl_check_result;
          const attempts = (trade.sl_check_attempts ?? 0);
          const conflicts = (trade.sl_conflict_count ?? 0);

          // Always re-run candle check (even if previously check_failed) — now that
          // we use local OHLC data, old VPS failures should resolve.
          {
            const posId2 = trade.position_id ?? trade.ticket;
            const siblings = allTrades
              .filter(t => (t.position_id ?? t.ticket) === posId2)
              .sort((a, b) => new Date(a.close_time).getTime() - new Date(b.close_time).getTime());
            const slOutcome = await runSlCheckForTrade(trade, siblings, rules.max_hold_hours || null, rules.max_risk_dollars);

            if (slOutcome.violation === 'FAILED') {
              if (isDefinitive(existingResult)) {
                await db.query(
                  `UPDATE wp_trades SET sl_check_pending = true, sl_check_attempts = $1 WHERE id = $2`,
                  [attempts + 1, trade.id]
                ).catch(() => {});
                if (existingResult === 'fake_sl') {
                  const storedViols: string[] = (() => { try { return JSON.parse((trade as any).violations || '[]'); } catch { return []; } })();
                  const v = storedViols.find(x => x.includes('maximum allowed risk'));
                  if (v && !violations.includes(v)) { violations.push(v); slPenaltyDollars = rules.max_risk_dollars; }
                }
              } else {
                const newAttempts = attempts + 1;
                // Benefit of doubt — never penalize. Keep pending, retry next cycle.
                await db.query(
                  `UPDATE wp_trades SET sl_check_pending = true, sl_check_attempts = $1 WHERE id = $2`,
                  [newAttempts, trade.id]
                ).catch(() => {});
                slCheckFailures.push({ ticket: trade.ticket, symbol: trade.symbol, tradeId: trade.id });
                slCheckFailures.push({ ticket: trade.ticket, symbol: trade.symbol, tradeId: trade.id });
              }
            } else {
              const newResultValue = slOutcome.violation ? 'fake_sl' : 'passed';

              if (isDefinitive(existingResult) && existingResult !== newResultValue) {
                const newConflicts = conflicts + 1;
                if (newConflicts >= MAX_CONFLICTS) {
                  const riskLabel = trade.symbol.endsWith('c') ? `¢${rules.max_risk_dollars}` : `$${rules.max_risk_dollars}`;
                  const escalationViol = `Max risk check returned conflicting results across ${newConflicts} evaluations — max allowed loss of ${riskLabel} applied as a precaution.`;
                  violations.push(escalationViol);
                  slPenaltyDollars = rules.max_risk_dollars;
                  await db.query(
                    `UPDATE wp_trades SET sl_check_result = 'check_failed', sl_check_pending = false, sl_conflict_count = $1, sl_allowed_price = $2, sl_max_adverse_price = $3 WHERE id = $4`,
                    [newConflicts, slOutcome.slAllowedPrice, slOutcome.slMaxAdversePrice, trade.id]
                  ).catch(() => {});
                } else {
                  await db.query(
                    `UPDATE wp_trades SET sl_check_result = 'conflicting', sl_check_pending = true, sl_conflict_count = $1, sl_allowed_price = $2, sl_max_adverse_price = $3 WHERE id = $4`,
                    [newConflicts, slOutcome.slAllowedPrice, slOutcome.slMaxAdversePrice, trade.id]
                  ).catch(() => {});
                  slCheckFailures.push({ ticket: trade.ticket, symbol: trade.symbol, tradeId: trade.id });
                }
              } else {
                await db.query(
                  `UPDATE wp_trades SET sl_allowed_price = $1, sl_max_adverse_price = $2, sl_check_result = $3, sl_check_pending = false, sl_check_attempts = 0, sl_conflict_count = 0 WHERE id = $4`,
                  [slOutcome.slAllowedPrice, slOutcome.slMaxAdversePrice, slOutcome.slCheckResult, trade.id]
                ).catch(() => {});
                if (slOutcome.violation) {
                  violations.push(slOutcome.violation);
                  slPenaltyDollars = rules.max_risk_dollars;
                }
              }
            }
          }
        }
      } else if (rules.stop_loss_required && (tradeNet <= 0 || violations.length > 0)) {
        // Losing trade or already failed other rules — skip SL check, mark as skipped
        if (!isDefinitiveSl(trade.sl_check_result) && trade.sl_check_result !== 'check_failed') {
          await db.query(`UPDATE wp_trades SET sl_check_result = 'skipped' WHERE id = $1`, [trade.id]).catch(() => {});
        }
      }

      // Apply
      const isQualified = violations.length === 0;
      if (!isQualified) {
        flaggedCount++;
        if (slPenaltyDollars > 0) {
          profitRemoved += tradeNet + slPenaltyDollars;
        } else if (tradeNet > 0) {
          profitRemoved += tradeNet;
        }
      }

      // Only clear sl_check_pending here if it wasn't just set — pending flag is managed above
      const hadSlFailure = slCheckFailures.some((f: any) => f.tradeId === trade.id);
      await db.query(
        `UPDATE wp_trades SET is_qualified = $1, violations = $2${hadSlFailure ? '' : ', sl_check_pending = false'} WHERE id = $3`,
        [isQualified, violations.length > 0 ? JSON.stringify(violations) : '[]', trade.id]
      );
    }

    // === DAILY DRAWDOWN NOTIFICATION ===
    if (drawdownBreachDay && drawdownBreachTime) {
      await this.notifyDailyDrawdown(challengeId, reg, drawdownBreachDay, drawdownBreachTime, rules.daily_loss_cap!);
    }

    // === SL CHECK FAILURE LOGGING ===
    if (slCheckFailures.length > 0) {
      try {
        await db.query(
          `INSERT INTO wp_pull_errors (registration_id, account_number, error_code, error_message)
           VALUES ($1, $2, 'sl_check_failed', $3)`,
          [reg.id, reg.account_number, JSON.stringify({ trades_unchecked: slCheckFailures.length, tickets: slCheckFailures.map(f => f.ticket) })]
        );
      } catch (e) {
        console.log(`⚠️ Could not log SL check failure for ${reg.account_number}:`, (e as Error).message);
      }
    }

    const qualifiedProfit = grossProfit - profitRemoved;
    const adjustedBalance = effectiveStartBalance + qualifiedProfit;
    const currentBalance = effectiveStartBalance + grossProfit;
    const qualifiedTrades = allTrades.length - flaggedCount;
    const tradeDays = new Set(allTrades.map(t => new Date(t.close_time).toISOString().split('T')[0]));
    const activeDays = tradeDays.size;

    // === ACTIVE-DAYS DQ / UNDO — computed once, used for both directions ===
    if (rules.min_active_days) {
      const challengeEndResult = await db.query(`SELECT end_date FROM trading_challenges WHERE id = $1`, [challengeId]);
      const challengeEnd = challengeEndResult.rows[0]?.end_date;
      if (challengeEnd) {
        const now = new Date();
        const end = new Date(challengeEnd);
        const remainingDays = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        const maxPossibleDays = activeDays + remainingDays;

        if (maxPossibleDays >= rules.min_active_days) {
          // User CAN still meet the requirement — undo any incorrect active-days DQ.
          // Only clears DQs caused by active-days logic; manual DQs (recharge, over-limit) are untouched.
          const currentDq = await db.query(
            `SELECT disqualified, disqualified_reason FROM trading_registrations WHERE id = $1`,
            [reg.id]
          );
          const dqRow = currentDq.rows[0];
          if (dqRow?.disqualified && dqRow?.disqualified_reason?.toLowerCase().includes('active')) {
            await db.query(
              `UPDATE trading_registrations SET disqualified = false, disqualified_at = NULL, disqualified_reason = NULL WHERE id = $1`,
              [reg.id]
            );
            await db.query(
              `UPDATE wp_leaderboard SET is_disqualified = false, disqualify_reason = NULL WHERE registration_id = $1`,
              [reg.id]
            );
            console.log(`✅ WP Evaluation: Cleared incorrect active-days DQ for reg ${reg.id} (${activeDays} days traded, ${remainingDays} days left, need ${rules.min_active_days})`);
          }
        } else {
          // Impossible to meet requirement — auto-DQ
          await db.query(
            `UPDATE trading_registrations SET disqualified = true, disqualified_at = NOW(), disqualified_reason = $1 WHERE id = $2 AND disqualified = false`,
            [`Cannot meet minimum ${rules.min_active_days} active trading days (${activeDays} days traded, ${remainingDays} days left)`, reg.id]
          );
          await db.query(
            `UPDATE wp_leaderboard SET is_disqualified = true, disqualify_reason = $1 WHERE registration_id = $2`,
            [`Cannot meet minimum ${rules.min_active_days} active days`, reg.id]
          );
        }
      }
    }

    const isQualified = adjustedBalance >= targetBalance && activeDays >= (rules.min_active_days || 0);
    const lastTrade = allTrades[allTrades.length - 1];

    await this.upsertLeaderboard(challengeId, reg, effectiveStartBalance, {
      currentBalance, adjustedBalance, qualifiedProfit, grossProfit, profitRemoved,
      totalTrades: allTrades.length, qualifiedTrades, flaggedTrades: flaggedCount,
      activeDays, isQualified, lastTradeTime: lastTrade?.close_time || null,
    });

    // If the VPS equity has hit zero (or below) on an account that has traded,
    // mark it blown in staging regardless of the computed current_balance.
    // This catches accounts where equity = 0 but gross balance formula still
    // shows positive (e.g. open losing positions not yet reflected in closed trades).
    if (allTrades.length > 0) {
      const eqRow = await db.query(
        `SELECT last_known_equity FROM trading_registrations WHERE id = $1`, [reg.id]
      );
      const equity = eqRow.rows[0]?.last_known_equity;
      if (equity !== null && equity !== undefined && parseFloat(equity) <= 0) {
        await db.query(
          `UPDATE wp_leaderboard_staging
           SET zero_balance_at = COALESCE(zero_balance_at, NOW()),
               current_balance = LEAST(current_balance, 0)
           WHERE challenge_id = $1 AND registration_id = $2`,
          [challengeId, reg.id]
        ).catch(() => {});
      }
    }

    return { flaggedCount, isQualified };
  }

  // ==================== DAILY DRAWDOWN NOTIFICATION ====================

  private async notifyDailyDrawdown(challengeId: number, reg: any, day: string, time: string, cap: number) {
    // Check if already notified today
    const existing = await db.query(
      `SELECT 1 FROM wp_pull_errors WHERE registration_id = $1 AND error_code = 'drawdown_notified' AND created_at::date = $2::date`,
      [reg.id, day]
    );
    if (existing.rows.length > 0) return; // Already notified today

    // Record notification
    await db.query(
      `INSERT INTO wp_pull_errors (registration_id, account_number, error_code, error_message)
       VALUES ($1, $2, 'drawdown_notified', $3)`,
      [reg.id, reg.account_number, `Drawdown $${cap} reached at ${time} EAT on ${day}`]
    );

    // Send Telegram notification (only for Telegram users — skip Discord users)
    if (this.bot) {
      // Check source — Discord user IDs are > 10 digits, or check source column
      const source = reg.source || 'telegram';
      if (source !== 'telegram') return; // Don't try to DM Discord users via Telegram

      try {
        await this.bot.bot.telegram.sendMessage(
          reg.user_id,
          `⚠️ <b>Daily Drawdown Reached</b>\n\n` +
          `You hit your daily loss limit of <b>$${cap}</b> at <b>${time} EAT</b>.\n\n` +
          `🛑 Cool it down — any profits you make for the rest of today will <b>NOT be counted</b> toward your qualified balance.\n\n` +
          `You can continue trading tomorrow with a fresh start.\n\n` +
          `<i>Losses still count. Take a break and come back stronger tomorrow.</i> 💪`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {
        console.error(`Could not notify user ${reg.user_id} about drawdown:`, e);
      }
    }
  }

  // ==================== HELPERS ====================

  private isWeekend(d: Date): boolean {
    const day = d.getUTCDay();
    const hour = d.getUTCHours();
    if (day === 6) return true;
    if (day === 0 && hour < 22) return true;
    if (day === 5 && hour >= 22) return true;
    return false;
  }

  private async upsertLeaderboard(challengeId: number, reg: any, startingBalance: number, data: any) {
    const userIsCent = reg.is_cent || false;
    const normalizedBalance = userIsCent ? data.adjustedBalance / 100 : data.adjustedBalance;

    // Write to staging table (not live) — will be flushed to live at next cycle start
    await db.query(
      `INSERT INTO wp_leaderboard_staging
       (challenge_id, registration_id, account_number, user_id, username, nickname, account_type, is_cent,
        starting_balance, current_balance, adjusted_balance, normalized_balance, qualified_profit, gross_profit, profit_removed,
        total_trades, qualified_trades, flagged_trades, active_days, is_qualified, last_trade_time,
        zero_balance_at, evaluated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW())
       ON CONFLICT (challenge_id, registration_id) DO UPDATE SET
         current_balance=EXCLUDED.current_balance, adjusted_balance=EXCLUDED.adjusted_balance,
         normalized_balance=EXCLUDED.normalized_balance, is_cent=EXCLUDED.is_cent,
         qualified_profit=EXCLUDED.qualified_profit, gross_profit=EXCLUDED.gross_profit,
         profit_removed=EXCLUDED.profit_removed, total_trades=EXCLUDED.total_trades,
         qualified_trades=EXCLUDED.qualified_trades, flagged_trades=EXCLUDED.flagged_trades,
         active_days=EXCLUDED.active_days, is_qualified=EXCLUDED.is_qualified,
         last_trade_time=EXCLUDED.last_trade_time,
         zero_balance_at = CASE
           WHEN EXCLUDED.current_balance <= 0 AND EXCLUDED.total_trades > 0 THEN COALESCE(wp_leaderboard_staging.zero_balance_at, NOW())
           WHEN EXCLUDED.current_balance > 0 THEN NULL
           WHEN EXCLUDED.total_trades = 0 THEN NULL
           ELSE wp_leaderboard_staging.zero_balance_at
         END,
         evaluated_at=NOW()`,
      [challengeId, reg.id, reg.account_number, reg.user_id || reg.telegram_id, reg.username, reg.nickname, reg.account_type, userIsCent,
       startingBalance, data.currentBalance, data.adjustedBalance, normalizedBalance, data.qualifiedProfit, data.grossProfit,
       data.profitRemoved, data.totalTrades, data.qualifiedTrades, data.flaggedTrades, data.activeDays,
       data.isQualified, data.lastTradeTime,
       (data.currentBalance <= 0 && data.totalTrades > 0) ? new Date() : null]
    );
  }

  async updateRankings(challengeId: number) {
    for (const accountType of ['demo', 'real']) {
      await db.query(
        `UPDATE wp_leaderboard SET rank = sub.rn FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY adjusted_balance DESC) as rn
          FROM wp_leaderboard WHERE challenge_id=$1 AND account_type=$2 AND is_disqualified=false
        ) sub WHERE wp_leaderboard.id = sub.id`,
        [challengeId, accountType]
      );
    }
  }

  // ==================== RULES ====================

  async loadRules(challengeId: number): Promise<RuleConfig | null> {
    const result = await db.query(
      `SELECT parameters FROM wp_challenge_rules WHERE challenge_id=$1 AND rule_code='config'`, [challengeId]);
    if (result.rows.length === 0) return null;
    return result.rows[0].parameters as RuleConfig;
  }

  async saveRules(challengeId: number, rules: RuleConfig) {
    await db.query(
      `INSERT INTO wp_challenge_rules (challenge_id, rule_code, rule_label, parameters, penalty, order_number)
       VALUES ($1, 'config', 'Challenge Rules Configuration', $2, 'flag', 0)
       ON CONFLICT (challenge_id, rule_code) DO UPDATE SET parameters = $2`,
      [challengeId, JSON.stringify(rules)]
    );
  }

  async seedDefaultRules(challengeId: number) {
    const defaults: RuleConfig = {
      max_lot_size: 0.02, max_open_trades: 3, pair_limit: 2,
      stop_loss_required: true, max_risk_dollars: 5, daily_loss_cap: 10,
      max_hold_hours: 24, weekend_trading: false, min_active_days: 7,
      only_cent_account: false, allow_professional: false,
    };
    await this.saveRules(challengeId, defaults);
    console.log(`✅ WP Evaluation: Seeded default rules for challenge ${challengeId}`);
  }

  async getRulesForDisplay(challengeId: number): Promise<{ rules: string[]; isCent: boolean }> {
    const cfg = await this.loadRules(challengeId);
    if (!cfg) return { rules: ['Rules not yet configured'], isCent: false };
    const isCent = cfg.only_cent_account || false;
    const rules: string[] = [];

    // Get challenge type to determine display format
    const challengeResult = await db.query('SELECT type FROM trading_challenges WHERE id = $1', [challengeId]);
    const challengeType = challengeResult.rows[0]?.type || 'demo';

    // Determine display mode:
    //
    // isRealCentOnly: type = real AND only_cent_account = true
    //   → Admin entered values in ¢. All participants are cent. Display in ¢ only.
    //
    // showDual: any real or hybrid challenge that is NOT cent-only real
    //   → Cent accounts are accepted (whether mandatory or not), so both standard ($)
    //     and cent (¢) users can coexist. Show both values.
    //   → only_cent_account = false means cent is not mandatory, not that it's absent.
    //
    // $ only: demo challenges (no real cent accounts possible).
    const isRealCentOnly = challengeType === 'real' && isCent;
    const showDual = challengeType !== 'demo' && !isRealCentOnly;

    if (cfg.max_lot_size) {
      if (showDual) {
        rules.push(`📊 Maximum lot size: ${cfg.max_lot_size} lots (Standard/Demo) / ${cfg.max_lot_size * 100} lots (Cent/Real)`);
      } else {
        rules.push(`📊 Maximum lot size: ${cfg.max_lot_size} lots`);
      }
    }
    if (cfg.max_open_trades) rules.push(`📈 Maximum ${cfg.max_open_trades} trades open at the same time`);
    if (cfg.pair_limit) rules.push(`🔄 Maximum ${cfg.pair_limit} trades on the same pair simultaneously`);
    if (cfg.stop_loss_required) {
      let t = '🛡️ Max risk per trade';
      if (cfg.max_risk_dollars) {
        if (showDual) {
          t += `: $${cfg.max_risk_dollars} (Standard) / ${cfg.max_risk_dollars * 100}¢ (Cent)`;
        } else if (isRealCentOnly) {
          t += `: ${cfg.max_risk_dollars}¢`;
        } else {
          t += `: $${cfg.max_risk_dollars}`;
        }
      }
      t += ' — each trade is checked; profits removed if limit is breached';
      rules.push(t);
    }
    if (cfg.daily_loss_cap) {
      if (showDual) {
        rules.push(`⚠️ Daily loss cap: $${cfg.daily_loss_cap} (Standard) / ${cfg.daily_loss_cap * 100}¢ (Cent) from day's opening balance`);
      } else if (isRealCentOnly) {
        rules.push(`⚠️ Daily loss cap: ${cfg.daily_loss_cap}¢ from day's opening balance`);
      } else {
        rules.push(`⚠️ Daily loss cap: $${cfg.daily_loss_cap} from day's opening balance`);
      }
    }
    if (cfg.max_hold_hours) rules.push(`⏱️ Maximum trade duration: ${cfg.max_hold_hours} hours`);
    if (!cfg.weekend_trading) rules.push('🚫 No weekend trading');
    if (cfg.min_active_days) rules.push(`📅 Minimum ${cfg.min_active_days} active trading days to qualify`);
    rules.push('🚫 No recharging (additional deposits) allowed during the challenge');
    rules.push('✅ Unlimited trades per day — as long as all rules are followed');
    rules.push('✅ No leverage limit');
    rules.push('⚖️ Trades against the rules will have profits disqualified (losses still count)');
    return { rules, isCent };
  }

  // ==================== SL RECHECK ====================

  /**
   * Re-run the SL candle check for all trades with sl_check_pending=true
   * for a specific account. Updates trades, re-evaluates, flushes to live leaderboard.
   * Returns a summary of what happened.
   */
  async recheckSlPendingForAccount(challengeId: number, registrationId: number): Promise<{
    checked: number; violations: number; cleared: number; nickname: string; error?: string;
  }> {
    try {
      const regResult = await db.query(
        `SELECT r.*, c.start_date, c.end_date FROM trading_registrations r
         JOIN trading_challenges c ON r.challenge_id = c.id
         WHERE r.id = $1`,
        [registrationId]
      );
      if (regResult.rows.length === 0) return { checked: 0, violations: 0, cleared: 0, nickname: '?', error: 'Registration not found' };
      const reg = regResult.rows[0];

      // Load rules
      const rules = await this.loadRules(challengeId);
      if (!rules || !rules.max_risk_dollars) {
        return { checked: 0, violations: 0, cleared: 0, nickname: reg.nickname || reg.account_number, error: 'No rules configured' };
      }

      // Update OHLC candle data for pending symbols before re-checking
      try {
        const scheduler = (global as any).__vpsPullScheduler;
        if (scheduler) {
          const challengeData = await db.query(`SELECT * FROM trading_challenges WHERE id = $1`, [challengeId]);
          if (challengeData.rows[0]) {
            await scheduler.updateOhlcCandles(challengeData.rows[0]);
          }
        }
      } catch (e) {
        console.warn('⚠️ recheckSl: OHLC update failed (proceeding with existing data):', (e as Error).message);
      }

      const MAX_SL_CHECK_ATTEMPTS = 5;
      const MAX_CONFLICTS = 3;
      const isDefinitive = (r: string | null | undefined) => r === 'fake_sl' || r === 'passed';

      // Find all pending trades
      const pendingResult = await db.query(
        `SELECT id, ticket, symbol, trade_type, volume, open_price, close_price,
                open_time, close_time, profit, commission, swap, violations, stop_loss,
                sl_check_attempts, sl_check_result, sl_conflict_count
         FROM wp_trades
         WHERE challenge_id = $1 AND registration_id = $2 AND sl_check_pending = true`,
        [challengeId, registrationId]
      );

      if (pendingResult.rows.length === 0) {
        return { checked: 0, violations: 0, cleared: 0, nickname: reg.nickname || reg.account_number };
      }

      // Fetch all siblings for positions that have pending trades, so runSlCheckForTrade can window correctly
      const pendingPosIds = [...new Set(pendingResult.rows.map((t: any) => t.position_id ?? t.ticket).filter(Boolean))];
      const siblingsResult = pendingPosIds.length > 0
        ? await db.query(
            `SELECT id, ticket, position_id, volume, open_time, close_time, profit, commission, swap,
                    open_price, close_price, trade_type, symbol, stop_loss, sl_check_result,
                    sl_check_attempts, sl_conflict_count
             FROM wp_trades
             WHERE challenge_id = $1 AND registration_id = $2 AND position_id = ANY($3::bigint[])
             ORDER BY close_time ASC`,
            [challengeId, registrationId, pendingPosIds]
          ).catch(() => ({ rows: [] as any[] }))
        : { rows: [] as any[] };

      const siblingsByPos = new Map<number, any[]>();
      for (const row of siblingsResult.rows) {
        const key = row.position_id ?? row.ticket;
        if (!siblingsByPos.has(key)) siblingsByPos.set(key, []);
        siblingsByPos.get(key)!.push(row);
      }

      let checkedCount = 0;
      let violationCount = 0;
      let clearedCount = 0;

      for (const trade of pendingResult.rows) {
        const tradeNet = parseFloat(trade.profit) + parseFloat(trade.commission || 0) + parseFloat(trade.swap || 0);
        if (tradeNet <= 0) {
          await db.query(`UPDATE wp_trades SET sl_check_pending = false WHERE id = $1`, [trade.id]);
          clearedCount++;
          continue;
        }

        const attempts = parseInt(trade.sl_check_attempts ?? '0');
        const conflicts = parseInt(trade.sl_conflict_count ?? '0');
        const existingResult = trade.sl_check_result as string | null;
        const existingViols: string[] = (() => { try { return JSON.parse(trade.violations || '[]'); } catch { return []; } })();

        const recheckPosId = (trade as any).position_id ?? trade.ticket;
        const recheckSiblings = (siblingsByPos.get(recheckPosId) || [trade])
          .sort((a: any, b: any) => new Date(a.close_time).getTime() - new Date(b.close_time).getTime());
        const slOutcome = await runSlCheckForTrade(trade, recheckSiblings, rules.max_hold_hours || null, rules.max_risk_dollars);
        checkedCount++;

        if (slOutcome.violation === 'FAILED') {
          // No candle data
          if (isDefinitive(existingResult)) {
            // Existing good result wins — keep it, just re-confirm next cycle
            await db.query(
              `UPDATE wp_trades SET sl_check_pending = true, sl_check_attempts = $1 WHERE id = $2`,
              [attempts + 1, trade.id]
            );
          } else {
            const newAttempts = attempts + 1;
            // Benefit of doubt — never penalize. Keep pending, retry next cycle.
            await db.query(
              `UPDATE wp_trades SET sl_check_pending = true, sl_check_attempts = $1 WHERE id = $2`,
              [newAttempts, trade.id]
            );
          }
          continue;
        }

        // Got a definitive result
        const newResultValue = slOutcome.violation ? 'fake_sl' : 'passed';

        if (isDefinitive(existingResult) && existingResult !== newResultValue) {
          // Conflict — two definitive results disagree
          const newConflicts = conflicts + 1;
          if (newConflicts >= MAX_CONFLICTS) {
            // Escalate — fake_sl wins (stricter side)
            const riskLabel = trade.symbol.endsWith('c') ? `¢${rules.max_risk_dollars}` : `$${rules.max_risk_dollars}`;
            const escalationViol = `Max risk check returned conflicting results across ${newConflicts} evaluations — max allowed loss of ${riskLabel} applied as a precaution.`;
            if (!existingViols.includes(escalationViol)) existingViols.push(escalationViol);
            await db.query(
              `UPDATE wp_trades SET sl_check_result = 'check_failed', sl_check_pending = false, sl_conflict_count = $1, sl_allowed_price = $2, sl_max_adverse_price = $3, is_qualified = false, violations = $4 WHERE id = $5`,
              [newConflicts, slOutcome.slAllowedPrice, slOutcome.slMaxAdversePrice, JSON.stringify(existingViols), trade.id]
            );
            violationCount++;
          } else {
            await db.query(
              `UPDATE wp_trades SET sl_check_result = 'conflicting', sl_check_pending = true, sl_conflict_count = $1, sl_allowed_price = $2, sl_max_adverse_price = $3 WHERE id = $4`,
              [newConflicts, slOutcome.slAllowedPrice, slOutcome.slMaxAdversePrice, trade.id]
            );
          }
        } else {
          // No conflict — definitive result, write it
          if (!existingViols.includes(slOutcome.violation || '') && slOutcome.violation) {
            existingViols.push(slOutcome.violation);
          }
          const stillFlagged = existingViols.length > 0;
          await db.query(
            `UPDATE wp_trades SET sl_allowed_price = $1, sl_max_adverse_price = $2, sl_check_result = $3, sl_check_pending = false, sl_check_attempts = 0, sl_conflict_count = 0, is_qualified = $4, violations = $5 WHERE id = $6`,
            [slOutcome.slAllowedPrice, slOutcome.slMaxAdversePrice, slOutcome.slCheckResult, !stillFlagged, JSON.stringify(existingViols), trade.id]
          );
          if (slOutcome.violation) violationCount++;
          else clearedCount++;
        }
      }

      // Re-evaluate this account, flush to live, then re-rank all participants
      await this.evaluateSingleAccount(challengeId, registrationId);
      await this.flushSingleAccountToLive(challengeId, registrationId);
      await this.updateRankings(challengeId);

      return {
        checked: checkedCount,
        violations: violationCount,
        cleared: clearedCount,
        nickname: reg.nickname || reg.account_number,
      };
    } catch (e) {
      console.error('recheckSlPendingForAccount error:', e);
      return { checked: 0, violations: 0, cleared: 0, nickname: '?', error: (e as Error).message };
    }
  }

  /**
   * Get all registration IDs for a challenge that still have sl_check_pending trades.
   */
  async getPendingSlAccounts(challengeId: number): Promise<number[]> {
    const result = await db.query(
      `SELECT DISTINCT registration_id FROM wp_trades
       WHERE challenge_id = $1 AND sl_check_pending = true`,
      [challengeId]
    );
    return result.rows.map((r: any) => r.registration_id);
  }

  /**
   * Flush a single account's staging row directly to the live leaderboard
   * without waiting for the next full cycle.
   */
  private async flushSingleAccountToLive(challengeId: number, registrationId: number) {
    await db.query(
      `INSERT INTO wp_leaderboard
       (challenge_id, registration_id, account_number, user_id, username, nickname, account_type, is_cent,
        starting_balance, current_balance, adjusted_balance, normalized_balance, qualified_profit, gross_profit,
        profit_removed, total_trades, qualified_trades, flagged_trades, active_days, is_qualified,
        last_trade_time, zero_balance_at, evaluated_at, rank)
       SELECT challenge_id, registration_id, account_number, user_id, username, nickname, account_type, is_cent,
              starting_balance, current_balance, adjusted_balance, normalized_balance, qualified_profit, gross_profit,
              profit_removed, total_trades, qualified_trades, flagged_trades, active_days, is_qualified,
              last_trade_time, zero_balance_at, NOW(),
              (SELECT COALESCE(rank, 999) FROM wp_leaderboard WHERE challenge_id = $1 AND registration_id = $2)
       FROM wp_leaderboard_staging
       WHERE challenge_id = $1 AND registration_id = $2
       ON CONFLICT (challenge_id, registration_id) DO UPDATE SET
         current_balance=EXCLUDED.current_balance, adjusted_balance=EXCLUDED.adjusted_balance,
         normalized_balance=EXCLUDED.normalized_balance, qualified_profit=EXCLUDED.qualified_profit,
         gross_profit=EXCLUDED.gross_profit, profit_removed=EXCLUDED.profit_removed,
         total_trades=EXCLUDED.total_trades, qualified_trades=EXCLUDED.qualified_trades,
         flagged_trades=EXCLUDED.flagged_trades, active_days=EXCLUDED.active_days,
         is_qualified=EXCLUDED.is_qualified, last_trade_time=EXCLUDED.last_trade_time,
         zero_balance_at=EXCLUDED.zero_balance_at, evaluated_at=NOW()`,
      [challengeId, registrationId]
    );
  }
}

export const evaluationEngine = new WpEvaluationEngine();
