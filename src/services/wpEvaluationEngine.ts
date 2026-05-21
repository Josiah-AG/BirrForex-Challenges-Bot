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
  const sym = symbol.replace(/[mc]$/, '').replace(/_x\d+m?$/, '').toUpperCase();
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

function calculateSlDollars(symbol: string, volume: number, entryPrice: number, slPrice: number): number {
  const { pipSize, contractSize } = getInstrumentInfo(symbol);
  const priceDiff = Math.abs(entryPrice - slPrice);
  const pips = priceDiff / pipSize;
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
async function fetchCandles(symbol: string, fromTime: Date, toTime: Date): Promise<{ low: number; high: number }[] | null> {
  try {
    const response = await axios.post(
      `${config.vpsApiUrl}/api/v1/candles`,
      {
        symbol,
        timeframe: 'M1',
        from_time: fromTime.toISOString().replace('T', ' ').substring(0, 19),
        to_time: toTime.toISOString().replace('T', ' ').substring(0, 19),
        terminal_id: 1,
      },
      {
        headers: { 'Content-Type': 'application/json', 'X-API-Key': config.vpsApiKey },
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
 * Check if price crossed the SL level during the trade's open period.
 * Returns violation message or null.
 */
async function validateSlWithCandles(trade: TradeRow): Promise<string | null> {
  if (!trade.stop_loss || parseFloat(String(trade.stop_loss)) === 0) return null;

  const sl = parseFloat(String(trade.stop_loss));
  const isBuy = trade.trade_type?.toLowerCase() === 'buy';

  const candles = await fetchCandles(trade.symbol, new Date(trade.open_time), new Date(trade.close_time));
  if (!candles || candles.length === 0) return null; // Can't verify — skip

  for (const candle of candles) {
    if (isBuy) {
      // Buy trade: SL is below entry. If candle low went at/below SL, it should have triggered
      if (candle.low <= sl) {
        return `SL not active — price reached ${candle.low} (below SL ${sl}) during open period but trade was not closed`;
      }
    } else {
      // Sell trade: SL is above entry. If candle high went at/above SL, it should have triggered
      if (candle.high >= sl) {
        return `SL not active — price reached ${candle.high} (above SL ${sl}) during open period but trade was not closed`;
      }
    }
  }

  return null; // SL is valid — price never crossed it
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

    const challenge = await db.query(`SELECT starting_balance, target_balance FROM trading_challenges WHERE id = $1`, [challengeId]);
    const startingBalance = parseFloat(challenge.rows[0]?.starting_balance || 30);
    const targetBalance = parseFloat(challenge.rows[0]?.target_balance || 60);

    const registrations = await db.query(
      `SELECT id, account_number, telegram_id, username, nickname, account_type
       FROM trading_registrations WHERE challenge_id = $1 AND disqualified = false AND investor_password IS NOT NULL`,
      [challengeId]
    );

    let totalFlagged = 0;
    let totalQualified = 0;

    for (const reg of registrations.rows) {
      // For hybrid challenges with only_cent_account, convert rules for real/cent accounts
      let effectiveRules = rules;
      let effectiveStartBalance = startingBalance;
      let effectiveTargetBalance = targetBalance;

      if (rules.only_cent_account && reg.account_type === 'real') {
        // Check if this is a hybrid challenge (rules entered in standard, need conversion)
        const challengeTypeResult = await db.query('SELECT type FROM trading_challenges WHERE id = $1', [challengeId]);
        const challengeType = challengeTypeResult.rows[0]?.type;

        if (challengeType === 'hybrid') {
          // Hybrid: admin entered rules in standard perspective, convert to cent (×100)
          effectiveRules = {
            ...rules,
            max_lot_size: rules.max_lot_size ? rules.max_lot_size * 100 : null,
            max_risk_dollars: rules.max_risk_dollars ? rules.max_risk_dollars * 100 : null,
            daily_loss_cap: rules.daily_loss_cap ? rules.daily_loss_cap * 100 : null,
          };
          effectiveStartBalance = startingBalance * 100;
          effectiveTargetBalance = targetBalance * 100;
        }
        // For real-only challenges: admin already entered in cent values, use as-is
      }

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
      console.log(`⚠️ WP Evaluation: No rules for challenge ${challengeId}, skipping account ${registrationId}`);
      return { flaggedCount: 0, isQualified: false };
    }

    const challenge = await db.query(`SELECT starting_balance, target_balance, type FROM trading_challenges WHERE id = $1`, [challengeId]);
    const startingBalance = parseFloat(challenge.rows[0]?.starting_balance || 30);
    const targetBalance = parseFloat(challenge.rows[0]?.target_balance || 60);
    const challengeType = challenge.rows[0]?.type;

    const regResult = await db.query(
      `SELECT id, account_number, telegram_id, username, nickname, account_type
       FROM trading_registrations WHERE id = $1 AND challenge_id = $2`,
      [registrationId, challengeId]
    );
    if (regResult.rows.length === 0) return { flaggedCount: 0, isQualified: false };
    const reg = regResult.rows[0];

    // For hybrid challenges with only_cent_account, convert rules for real/cent accounts
    let effectiveRules = rules;
    let effectiveStartBalance = startingBalance;
    let effectiveTargetBalance = targetBalance;

    if (rules.only_cent_account && reg.account_type === 'real') {
      if (challengeType === 'hybrid') {
        effectiveRules = {
          ...rules,
          max_lot_size: rules.max_lot_size ? rules.max_lot_size * 100 : null,
          max_risk_dollars: rules.max_risk_dollars ? rules.max_risk_dollars * 100 : null,
          daily_loss_cap: rules.daily_loss_cap ? rules.daily_loss_cap * 100 : null,
        };
        effectiveStartBalance = startingBalance * 100;
        effectiveTargetBalance = targetBalance * 100;
      }
    }

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
      // No trades — use VPS balance if available, otherwise starting balance
      let currentBalance = startingBalance;
      try {
        const regBalance = await db.query(`SELECT last_known_balance FROM trading_registrations WHERE id = $1`, [reg.id]);
        const vpsBalance = regBalance.rows[0]?.last_known_balance;
        if (vpsBalance !== null && vpsBalance !== undefined) currentBalance = parseFloat(vpsBalance);
      } catch {
        // Column might not exist yet — use starting balance
      }
      await this.upsertLeaderboard(challengeId, reg, startingBalance, { currentBalance, adjustedBalance: currentBalance, qualifiedProfit: currentBalance - startingBalance, grossProfit: currentBalance - startingBalance, profitRemoved: 0, totalTrades: 0, qualifiedTrades: 0, flaggedTrades: 0, activeDays: 0, isQualified: false, lastTradeTime: null });
      return { flaggedCount: 0, isQualified: false };
    }

    const allTrades: TradeRow[] = trades.rows;
    let flaggedCount = 0;
    let grossProfit = 0;
    let profitRemoved = 0;

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
            const slDollars = calculateSlDollars(trade.symbol, parseFloat(String(trade.volume)), parseFloat(String(trade.open_price)), parseFloat(String(trade.stop_loss)));
            if (slDollars > rules.max_risk_dollars) {
              violations.push(`SL risk $${slDollars.toFixed(2)} exceeds max $${rules.max_risk_dollars}`);
            }
          }

          // Fake SL detection via candle data
          const fakeSl = await validateSlWithCandles(trade);
          if (fakeSl) {
            violations.push(fakeSl);
          }
        }
      }

      // Daily loss cap
      if (dailyDrawdownFlagged.has(trade.ticket)) {
        violations.push(`Profit after daily $${rules.daily_loss_cap} drawdown breach`);
      }

      // Hold time
      if (rules.max_hold_hours) {
        const holdMs = new Date(trade.close_time).getTime() - new Date(trade.open_time).getTime();
        const holdHours = holdMs / (1000 * 60 * 60);
        if (holdHours > rules.max_hold_hours) {
          violations.push(`Held ${holdHours.toFixed(1)}h exceeds max ${rules.max_hold_hours}h`);
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

    const qualifiedProfit = grossProfit - profitRemoved;
    const adjustedBalance = startingBalance + qualifiedProfit;
    const currentBalance = startingBalance + grossProfit;
    const qualifiedTrades = allTrades.length - flaggedCount;
    const tradeDays = new Set(allTrades.map(t => new Date(t.close_time).toISOString().split('T')[0]));
    const activeDays = tradeDays.size;
    const isQualified = adjustedBalance >= targetBalance && activeDays >= rules.min_active_days;
    const lastTrade = allTrades[allTrades.length - 1];

    await this.upsertLeaderboard(challengeId, reg, startingBalance, {
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
      `INSERT INTO wp_pull_errors (pull_batch_id, registration_id, account_number, error_code, error_message)
       VALUES (0, $1, $2, 'drawdown_notified', $3)`,
      [reg.id, reg.account_number, `Drawdown $${cap} reached at ${time} EAT on ${day}`]
    );

    // Send Telegram notification
    if (this.bot) {
      try {
        await this.bot.bot.telegram.sendMessage(
          reg.telegram_id,
          `⚠️ <b>Daily Drawdown Reached</b>\n\n` +
          `You hit your daily loss limit of <b>$${cap}</b> at <b>${time} EAT</b>.\n\n` +
          `🛑 Cool it down — any profits you make for the rest of today will <b>NOT be counted</b> toward your qualified balance.\n\n` +
          `You can continue trading tomorrow with a fresh start.\n\n` +
          `<i>Losses still count. Take a break and come back stronger tomorrow.</i> 💪`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {
        console.error(`Could not notify user ${reg.telegram_id} about drawdown:`, e);
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
    await db.query(
      `INSERT INTO wp_leaderboard
       (challenge_id, registration_id, account_number, telegram_id, username, nickname, account_type,
        starting_balance, current_balance, adjusted_balance, qualified_profit, gross_profit, profit_removed,
        total_trades, qualified_trades, flagged_trades, active_days, is_qualified, last_trade_time, last_updated,
        zero_balance_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),$20)
       ON CONFLICT (challenge_id, registration_id) DO UPDATE SET
         current_balance=EXCLUDED.current_balance, adjusted_balance=EXCLUDED.adjusted_balance,
         qualified_profit=EXCLUDED.qualified_profit, gross_profit=EXCLUDED.gross_profit,
         profit_removed=EXCLUDED.profit_removed, total_trades=EXCLUDED.total_trades,
         qualified_trades=EXCLUDED.qualified_trades, flagged_trades=EXCLUDED.flagged_trades,
         active_days=EXCLUDED.active_days, is_qualified=EXCLUDED.is_qualified,
         last_trade_time=EXCLUDED.last_trade_time, last_updated=NOW(),
         zero_balance_at = CASE
           WHEN EXCLUDED.current_balance <= 0 AND wp_leaderboard.zero_balance_at IS NULL THEN NOW()
           WHEN EXCLUDED.current_balance > 0 THEN NULL
           ELSE wp_leaderboard.zero_balance_at
         END`,
      [challengeId, reg.id, reg.account_number, reg.telegram_id, reg.username, reg.nickname, reg.account_type,
       startingBalance, data.currentBalance, data.adjustedBalance, data.qualifiedProfit, data.grossProfit,
       data.profitRemoved, data.totalTrades, data.qualifiedTrades, data.flaggedTrades, data.activeDays,
       data.isQualified, data.lastTradeTime,
       data.currentBalance <= 0 ? new Date() : null]
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
    const isHybrid = challengeType === 'hybrid';

    if (cfg.max_lot_size) {
      if (isHybrid && isCent) {
        rules.push(`Maximum lot size per trade: ${cfg.max_lot_size} (Standard) / ${cfg.max_lot_size * 100} lots (Cent)`);
      } else if (isCent && challengeType === 'real') {
        rules.push(`Maximum lot size per trade: ${cfg.max_lot_size} lots`);
      } else {
        rules.push(`Maximum lot size per trade: ${cfg.max_lot_size}`);
      }
    }
    if (cfg.max_open_trades) rules.push(`Maximum ${cfg.max_open_trades} trades open at the same time`);
    if (cfg.pair_limit) rules.push(`Maximum ${cfg.pair_limit} trades on the same pair simultaneously`);
    if (cfg.stop_loss_required) {
      let t = 'Stop loss required on all trades';
      if (cfg.max_risk_dollars) {
        if (isHybrid && isCent) {
          t += ` (max risk: $${cfg.max_risk_dollars} Standard / ${cfg.max_risk_dollars * 100}¢ Cent)`;
        } else if (isCent && challengeType === 'real') {
          t += ` (max risk: ${cfg.max_risk_dollars}¢)`;
        } else {
          t += ` (max risk: $${cfg.max_risk_dollars})`;
        }
      }
      rules.push(t);
    }
    if (cfg.daily_loss_cap) {
      if (isHybrid && isCent) {
        rules.push(`Daily loss cap: $${cfg.daily_loss_cap} (Standard) / ${cfg.daily_loss_cap * 100}¢ (Cent) from day's opening balance`);
      } else if (isCent && challengeType === 'real') {
        rules.push(`Daily loss cap: ${cfg.daily_loss_cap}¢ from day's opening balance`);
      } else {
        rules.push(`Daily loss cap: $${cfg.daily_loss_cap} from day's opening balance`);
      }
    }
    if (cfg.max_hold_hours) rules.push(`Maximum trade duration: ${cfg.max_hold_hours} hours`);
    if (!cfg.weekend_trading) rules.push('No weekend trading (Friday 22:00 — Sunday 22:00 UTC)');
    if (cfg.min_active_days) rules.push(`Minimum ${cfg.min_active_days} active trading days to qualify`);
    if (isCent) rules.push('Only cent accounts allowed for real account category');
    rules.push('No recharging (additional deposits) allowed during the challenge');
    rules.push('Unlimited trades per day — as long as all rules are followed');
    rules.push('No leverage limit');
    rules.push('Trades against the rules will have profits disqualified (losses still count)');
    return { rules, isCent };
  }
}

export const evaluationEngine = new WpEvaluationEngine();
