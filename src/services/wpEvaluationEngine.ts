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
}

interface TradeRow {
  id: number;
  registration_id: number;
  account_number: string;
  ticket: number;
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
}

// ==================== VPS CANDLE SERVICE ====================

/**
 * Fetch M1 candles from VPS API for SL validation
 */
async function fetchCandles(symbol: string, fromTime: Date, toTime: Date, timeframe: string = 'M1'): Promise<{ time: string; low: number; high: number; open: number; close: number }[] | null> {
  try {
    const response = await axios.post(
      `${config.vpsApiUrl}/api/v1/candles`,
      {
        symbol,
        timeframe,
        from_time: fromTime.toISOString(),
        to_time: toTime.toISOString(),
        api_key: config.vpsApiKey,
        terminal_id: 1,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      }
    );
    if (response.data?.success && response.data?.candles) {
      return response.data.candles;
    }
    return null;
  } catch {
    return null; // Graceful degradation — skip SL validation if candles unavailable
  }
}

/**
 * Calculate the maximum allowed SL price level from max_risk_dollars.
 * This is the price at which a properly-placed SL would trigger a max-risk loss.
 * 
 * IMPORTANT: max_risk_dollars is already in account currency ($ for standard, ¢ for cent).
 * We use FULL contract size (not ÷100 for cent) because the profit formula on MT5 is:
 *   profit_in_account_currency = volume × contractSize × priceMove
 * For cent accounts, MT5 reports profit in cents with the FULL contract size.
 * The ÷100 in getInstrumentInfo is for pip-value-in-USD calculations, not for this.
 */
function calculateMaxSlPrice(symbol: string, volume: number, entryPrice: number, maxRiskDollars: number, isBuy: boolean): number {
  // Get base instrument info but use FULL contract size (not cent-adjusted)
  const sym = symbol.replace(/[mczr]$/, '').replace(/_x\d+m?$/, '').toUpperCase();
  let contractSize: number;

  if (sym.includes('XAUUSD') || sym === 'XAU' || sym.includes('GOLD')) contractSize = 100;
  else if (sym.includes('XAGUSD') || sym === 'XAG') contractSize = 5000;
  else if (sym.includes('JPY')) contractSize = 100000;
  else contractSize = 100000;

  // priceMove that causes max_risk loss: max_risk = volume × contractSize × priceMove
  // So: priceMove = max_risk / (volume × contractSize)
  const priceMove = maxRiskDollars / (volume * contractSize);
  if (priceMove <= 0 || !isFinite(priceMove)) return 0;

  // For BUY: SL is below entry. For SELL: SL is above entry.
  if (isBuy) return entryPrice - priceMove;
  else return entryPrice + priceMove;
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
function formatCandleTimeEAT(candleTimeISO: string, periodMs: number): string {
  const utc = new Date(candleTimeISO);
  const eat = new Date(utc.getTime() + 3 * 60 * 60 * 1000); // UTC+3
  const h = eat.getUTCHours().toString().padStart(2, '0');
  const m = eat.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m} EAT`;
}

/**
 * Fake SL Detection — checks if price went past the max allowed SL level during the trade.
 * 
 * Logic: If the user had placed a proper SL at max_risk distance from entry when the trade
 * opened, would it have been hit? If YES → the trade should have been a loss, not a winner.
 * The user likely ran the trade without SL, then added one later after it went into profit.
 *
 * Only flags WINNING trades (losers don't benefit from this cheat).
 * Uses adaptive timeframe candles, excludes first/last candle.
 * Returns violation message, null (valid), or 'FAILED' (candle fetch error).
 */
async function validateSlWithCandles(trade: TradeRow, maxHoldHours: number | null = null, maxRiskDollars: number = 0): Promise<string | null | 'FAILED'> {
  if (!trade.open_time || !trade.close_time) return null;
  if (!maxRiskDollars || maxRiskDollars <= 0) return null;

  const openPrice = parseFloat(String(trade.open_price));
  const volume = parseFloat(String(trade.volume));
  const isBuy = trade.trade_type?.toLowerCase() === 'buy';

  if (!openPrice || !volume) return null;

  // Calculate the max allowed SL price (where SL should have been if placed at open)
  const maxSlPrice = calculateMaxSlPrice(trade.symbol, volume, openPrice, maxRiskDollars, isBuy);
  if (maxSlPrice <= 0) return null;

  const openMs = new Date(trade.open_time).getTime();
  const closeMs = new Date(trade.close_time).getTime();

  if (openMs <= 946684800000 || closeMs <= openMs) return null; // Invalid times

  const holdMinutes = (closeMs - openMs) / (60 * 1000);

  // Select adaptive timeframe
  const tf = selectTimeframe(holdMinutes, maxHoldHours);
  if (!tf) return null; // Skip — trade already flagged for hold time

  const candles = await fetchCandles(trade.symbol, new Date(trade.open_time), new Date(trade.close_time), tf.timeframe);
  if (!candles || candles.length === 0) return 'FAILED'; // Can't verify — report failure

  // Filter: exclude first and last candle (entry/exit candles have partial data)
  const safeCandles = candles.filter(candle => {
    const candleTime = new Date(candle.time).getTime();
    const candleEnd = candleTime + tf.periodMs;
    return candleTime > openMs && candleEnd <= closeMs;
  });

  if (safeCandles.length === 0) return null; // Not enough candles to verify

  // Check if price crossed the max SL level during the trade
  for (const candle of safeCandles) {
    if (isBuy) {
      if (candle.low <= maxSlPrice) {
        const eatTime = formatCandleTimeEAT(candle.time, tf.periodMs);
        const riskLabel = trade.symbol.endsWith('c') ? `¢${maxRiskDollars}` : `$${maxRiskDollars}`;
        return `SL placed late. Price passed the maximum allowed risk (${riskLabel}, SL @ ${maxSlPrice.toFixed(5)}) during trade open period on the ${tf.timeframe} candle formed at ${eatTime}. Trade should have been closed by SL at that time`;
      }
    } else {
      if (candle.high >= maxSlPrice) {
        const eatTime = formatCandleTimeEAT(candle.time, tf.periodMs);
        const riskLabel = trade.symbol.endsWith('c') ? `¢${maxRiskDollars}` : `$${maxRiskDollars}`;
        return `SL placed late. Price passed the maximum allowed risk (${riskLabel}, SL @ ${maxSlPrice.toFixed(5)}) during trade open period on the ${tf.timeframe} candle formed at ${eatTime}. Trade should have been closed by SL at that time`;
      }
    }
  }

  return null; // Valid — price never crossed max SL level during trade
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
      `SELECT id, account_number, user_id, username, nickname, account_type, is_cent, source
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
      `SELECT id, account_number, user_id, username, nickname, account_type, is_cent, source
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
      startFilter += ` AND close_time <= $${params.length + 1}`;
      params.push(new Date(challengeEnd).toISOString());
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

      // === AUTO-DQ: 0 trades and can't meet min_active_days ===
      if (rules.min_active_days) {
        const challengeEndResult = await db.query(`SELECT end_date FROM trading_challenges WHERE id = $1`, [challengeId]);
        const challengeEnd = challengeEndResult.rows[0]?.end_date;
        if (challengeEnd) {
          const now = new Date();
          const end = new Date(challengeEnd);
          const remainingDays = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
          if (remainingDays < rules.min_active_days) {
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
    // Get deals to detect deposits (balance operations)
    let actualStartBalance = startingBalance;
    try {
      const regData = await db.query(
        `SELECT registration_balance, actual_starting_balance FROM trading_registrations WHERE id = $1`, [reg.id]
      );
      const savedActual = regData.rows[0]?.actual_starting_balance;
      const regBalance = regData.rows[0]?.registration_balance;

      if (savedActual !== null && savedActual !== undefined) {
        // Already determined
        actualStartBalance = parseFloat(savedActual);
      } else {
        // Detect from deals — find balance deposits (not swap/commission/dividend)
        const deposits = await db.query(
          `SELECT profit, time FROM wp_deals
           WHERE challenge_id = $1 AND registration_id = $2
             AND (deal_type ILIKE '%balance%' OR deal_type = '2')
             AND profit > 0
           ORDER BY time ASC`,
          [challengeId, reg.id]
        );

        if (deposits.rows.length > 0) {
          // First deposit = their actual starting balance
          const firstDeposit = parseFloat(deposits.rows[0].profit);
          actualStartBalance = firstDeposit;

          // Save it
          await db.query(
            `UPDATE trading_registrations SET actual_starting_balance = $1 WHERE id = $2`,
            [actualStartBalance, reg.id]
          );

          // Check for recharging (second deposit = DQ)
          if (deposits.rows.length > 1) {
            // Multiple deposits detected — DQ for recharging
            const secondDeposit = deposits.rows[1];
            await db.query(
              `UPDATE trading_registrations SET disqualified = true, disqualified_at = NOW(), disqualified_reason = 'Account recharged — additional deposit detected after challenge start' WHERE id = $1 AND disqualified = false`,
              [reg.id]
            );
            await db.query(
              `UPDATE wp_leaderboard SET is_disqualified = true, disqualify_reason = 'Recharging — additional deposit' WHERE registration_id = $1`,
              [reg.id]
            );
          }
        } else if (regBalance !== null && regBalance !== undefined && parseFloat(regBalance) > 0) {
          // No deals but had balance at registration
          actualStartBalance = parseFloat(regBalance);
          await db.query(
            `UPDATE trading_registrations SET actual_starting_balance = $1 WHERE id = $2`,
            [actualStartBalance, reg.id]
          );
        } else {
          // Use VPS balance as starting point
          const vpsData = await db.query(`SELECT last_known_balance FROM trading_registrations WHERE id = $1`, [reg.id]);
          const vps = vpsData.rows[0]?.last_known_balance;
          if (vps !== null && vps !== undefined && parseFloat(vps) > 0) {
            actualStartBalance = parseFloat(vps);
          } else {
            actualStartBalance = 0; // They truly have nothing
          }
        }
      }
    } catch {
      // Fallback to challenge starting balance
    }

    // Use actual starting balance for this person's evaluation
    const effectiveStartBalance = actualStartBalance;

    // Pre-compute simultaneous trade violations
    type TimeEvent = { time: number; ticket: number; symbol: string; action: 'open' | 'close' };
    const events: TimeEvent[] = [];
    allTrades.forEach(t => {
      events.push({ time: new Date(t.open_time).getTime(), ticket: t.ticket, symbol: t.symbol, action: 'open' });
      events.push({ time: new Date(t.close_time).getTime(), ticket: t.ticket, symbol: t.symbol, action: 'close' });
    });
    events.sort((a, b) => a.time - b.time || (a.action === 'close' ? -1 : 1));

    const maxOpenViolators = new Set<number>();
    if (rules.max_open_trades) {
      const openSet = new Set<number>();
      for (const ev of events) {
        if (ev.action === 'open') openSet.add(ev.ticket); else openSet.delete(ev.ticket);
        if (openSet.size > rules.max_open_trades) openSet.forEach(t => maxOpenViolators.add(t));
      }
    }

    const pairViolators = new Set<number>();
    if (rules.pair_limit) {
      const bySymbol = new Map<string, TradeRow[]>();
      allTrades.forEach(t => { if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, []); bySymbol.get(t.symbol)!.push(t); });
      bySymbol.forEach((symTrades) => {
        const symEvents: TimeEvent[] = [];
        symTrades.forEach(t => {
          symEvents.push({ time: new Date(t.open_time).getTime(), ticket: t.ticket, symbol: t.symbol, action: 'open' });
          symEvents.push({ time: new Date(t.close_time).getTime(), ticket: t.ticket, symbol: t.symbol, action: 'close' });
        });
        symEvents.sort((a, b) => a.time - b.time || (a.action === 'close' ? -1 : 1));
        const symOpen = new Set<number>();
        for (const ev of symEvents) {
          if (ev.action === 'open') symOpen.add(ev.ticket); else symOpen.delete(ev.ticket);
          if (symOpen.size > rules.pair_limit!) symOpen.forEach(t => pairViolators.add(t));
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

    // Evaluate each trade
    const slCheckFailures: { ticket: number; symbol: string }[] = [];
    for (const trade of allTrades) {
      const violations: string[] = [];
      const tradeNet = parseFloat(String(trade.profit)) + parseFloat(String(trade.commission || 0)) + parseFloat(String(trade.swap || 0));
      grossProfit += tradeNet;

      // Max lot size
      if (rules.max_lot_size && parseFloat(String(trade.volume)) > rules.max_lot_size) {
        violations.push(`Lot size ${trade.volume} exceeds max ${rules.max_lot_size}`);
      }

      // Max open trades
      if (maxOpenViolators.has(trade.ticket)) {
        violations.push(`Exceeded ${rules.max_open_trades} simultaneous trades`);
      }

      // Pair limit
      if (pairViolators.has(trade.ticket)) {
        violations.push(`Exceeded ${rules.pair_limit} simultaneous ${trade.symbol} trades`);
      }

      // Stop loss checks
      if (rules.stop_loss_required) {
        if (!trade.stop_loss || parseFloat(String(trade.stop_loss)) === 0) {
          violations.push(`No stop loss set`);
        } else {
          // Check SL risk amount
          if (rules.max_risk_dollars) {
            const tradeProfit = parseFloat(String(trade.profit)) + parseFloat(String(trade.commission || 0)) + parseFloat(String(trade.swap || 0));
            const slDollars = calculateSlDollars(trade.symbol, parseFloat(String(trade.volume)), parseFloat(String(trade.open_price)), parseFloat(String(trade.stop_loss)), parseFloat(String(trade.close_price)), tradeProfit);
            // Tolerance: +$0.50 for standard accounts, +20¢ for cent accounts
            // If max_risk_dollars > 50, it's in cent terms (already ×100)
            const slTolerance = rules.max_risk_dollars > 50 ? 20 : 0.5;
            if (slDollars > rules.max_risk_dollars + slTolerance) {
              violations.push(`SL risk $${slDollars.toFixed(2)} exceeds max $${rules.max_risk_dollars}`);
            }
          }

          // Fake SL detection via candle data (adaptive timeframe)
          // Checks if price went past max allowed SL during trade — if yes, SL was placed late
          if (rules.max_risk_dollars) {
            const fakeSl = await validateSlWithCandles(trade, rules.max_hold_hours || null, rules.max_risk_dollars || 0);
            if (fakeSl === 'FAILED') {
              slCheckFailures.push({ ticket: trade.ticket, symbol: trade.symbol });
            } else if (fakeSl) {
              violations.push(fakeSl);
            }
          }
        }
      }

      // Daily loss cap
      if (dailyDrawdownFlagged.has(trade.ticket)) {
        violations.push(`Profit after daily $${rules.daily_loss_cap} drawdown breach`);
      }

      // Hold time
      if (rules.max_hold_hours) {
        if (trade.open_time && trade.close_time) {
          const openMs = new Date(trade.open_time).getTime();
          const closeMs = new Date(trade.close_time).getTime();
          // Only check if both dates are valid and open_time is after year 2000
          if (openMs > 946684800000 && closeMs > openMs) {
            const holdHours = (closeMs - openMs) / (1000 * 60 * 60);
            if (holdHours > rules.max_hold_hours) {
              violations.push(`Held ${holdHours.toFixed(1)}h exceeds max ${rules.max_hold_hours}h`);
            }
          }
        }
      }

      // Weekend trading
      if (!rules.weekend_trading) {
        if (this.isWeekend(new Date(trade.open_time)) || this.isWeekend(new Date(trade.close_time))) {
          violations.push(`Weekend trading`);
        }
      }

      // Apply
      const isQualified = violations.length === 0;
      if (!isQualified) {
        flaggedCount++;
        if (tradeNet > 0) profitRemoved += tradeNet;
      }

      await db.query(`UPDATE wp_trades SET is_qualified = $1, violations = $2 WHERE id = $3`,
        [isQualified, violations.length > 0 ? JSON.stringify(violations) : '[]', trade.id]);
    }

    // === DAILY DRAWDOWN NOTIFICATION ===
    if (drawdownBreachDay && drawdownBreachTime) {
      await this.notifyDailyDrawdown(reg, drawdownBreachDay, drawdownBreachTime, rules.daily_loss_cap!);
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

    // === AUTO-DQ: Cannot meet min_active_days ===
    if (rules.min_active_days && activeDays < rules.min_active_days) {
      // Calculate remaining trading days until challenge end
      const challengeEndResult = await db.query(`SELECT end_date FROM trading_challenges WHERE id = $1`, [challengeId]);
      const challengeEnd = challengeEndResult.rows[0]?.end_date;
      if (challengeEnd) {
        const now = new Date();
        const end = new Date(challengeEnd);
        const remainingDays = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        const maxPossibleDays = activeDays + remainingDays;

        if (maxPossibleDays < rules.min_active_days) {
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

    return { flaggedCount, isQualified };
  }

  // ==================== DAILY DRAWDOWN NOTIFICATION ====================

  private async notifyDailyDrawdown(reg: any, day: string, time: string, cap: number) {
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

  private async updateRankings(challengeId: number) {
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
      only_cent_account: false,
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
    // - "cent_only": Real + cent-only → admin entered in cent terms, display in ¢
    // - "dual": Flexible (real or hybrid) where cent users may exist → show both $ and ¢
    // - "standard": Demo only or no cent possibility → display in $
    const isRealCentOnly = challengeType === 'real' && isCent;
    const isFlexibleWithCent = !isRealCentOnly && (challengeType === 'real' || challengeType === 'hybrid');
    // Show dual format when: hybrid (always has potential for cent in real category) OR real+flexible
    const showDual = isFlexibleWithCent && (isCent || challengeType === 'hybrid' || challengeType === 'real');

    if (cfg.max_lot_size) {
      if (showDual) {
        rules.push(`📊 Maximum lot size: ${cfg.max_lot_size} lots (Standard) / ${cfg.max_lot_size * 100} lots (Cent)`);
      } else if (isRealCentOnly) {
        rules.push(`📊 Maximum lot size: ${cfg.max_lot_size} lots`);
      } else {
        rules.push(`📊 Maximum lot size: ${cfg.max_lot_size} lots`);
      }
    }
    if (cfg.max_open_trades) rules.push(`📈 Maximum ${cfg.max_open_trades} trades open at the same time`);
    if (cfg.pair_limit) rules.push(`🔄 Maximum ${cfg.pair_limit} trades on the same pair simultaneously`);
    if (cfg.stop_loss_required) {
      let t = '🛡️ Stop loss required on all trades';
      if (cfg.max_risk_dollars) {
        if (showDual) {
          t += ` (max risk: $${cfg.max_risk_dollars} Standard / ${cfg.max_risk_dollars * 100}¢ Cent)`;
        } else if (isRealCentOnly) {
          t += ` (max risk: ${cfg.max_risk_dollars}¢)`;
        } else {
          t += ` (max risk: $${cfg.max_risk_dollars})`;
        }
      }
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
    if (isCent) {
      if (isRealCentOnly) {
        rules.push('💰 Cent account only');
      } else {
        rules.push('💰 Only cent accounts allowed for real account category');
      }
    }
    rules.push('🚫 No recharging (additional deposits) allowed during the challenge');
    rules.push('✅ Unlimited trades per day — as long as all rules are followed');
    rules.push('✅ No leverage limit');
    rules.push('⚖️ Trades against the rules will have profits disqualified (losses still count)');
    return { rules, isCent };
  }
}

export const evaluationEngine = new WpEvaluationEngine();
