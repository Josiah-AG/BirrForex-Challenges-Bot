/**
 * BirrForex Challenge Evaluation Engine
 * Runs all 11 rule checks on parsed MT5 trade data
 */

import { MT5Position, MT5Deal, MT5AccountInfo } from './mt5Parser';

export interface EvaluationConfig {
  challengeStartDate: string;  // "2026-04-20"
  challengeEndDate: string;    // "2026-05-01"
  startingBalanceLimit: number; // 50
  targetBalance: number;       // 100
  maxLot: number;              // 0.02
  maxOpenTrades: number;       // 3
  maxSamePair: number;         // 2
  maxSlDollars: number;        // 6 (internal buffer for $5 rule)
  maxDailyLoss: number;        // 10
  maxHoldHours: number;        // 24
  minActiveDays: number;       // 7
}

export interface FlaggedTrade {
  positionId: string;
  symbol: string;
  openTime: string;
  profit: number;
  reasons: string[];
}

export interface DailyDrawdownInfo {
  day: string;
  dayName: string;
  openBalance: number;
  minBalance: number;
  closeBalance: number;
  drawdown: number;
  breached: boolean;
  profitsRemovedAfterBreach: number;
}

export interface EvaluationResult {
  // Account info
  accountNumber: string;
  accountType: 'demo' | 'real';
  accountName: string;
  isCent: boolean;

  // Balances
  startingBalance: number;
  reportedBalance: number;
  adjustedBalance: number;
  profitRemoved: number;

  // Trade stats
  totalTrades: number;
  flaggedCount: number;
  activeDays: number;

  // Status
  isQualified: boolean;
  isDisqualified: boolean;
  disqualifyReasons: string[];

  // Check results
  checks: {
    challengePeriod: boolean;
    startingBalance: boolean;
    noRecharging: boolean;
    activeDays: boolean;
    weekendTrading: boolean;
    lotSize: boolean;
    maxOpenTrades: boolean;
    samePairLimit: boolean;
    stopLoss: boolean;
    dailyDrawdown: boolean;
    holdTime: boolean;
  };

  // Details
  flaggedTrades: FlaggedTrade[];
  dailyDrawdowns: DailyDrawdownInfo[];
  slViolationCount: number;
  noSlCount: number;
  slTooWideCount: number;
  maxSimultaneous: number;
  worstDrawdownDay: string;
  worstDrawdownAmount: number;
  balanceResetOnDay1: boolean;

  // Full report text
  shortReport: string;
  fullReport: string;
}

// ── Instrument helpers ──

function getInstrumentInfo(symbol: string): { pipSize: number; contractSize: number } {
  const sym = symbol.replace(/m$/, '').replace(/_x\d+m?$/, '');
  const hasX100 = symbol.includes('_x100');

  if (sym.includes('XAUUSD') || sym === 'XAU') return { pipSize: 0.01, contractSize: 100 };
  if (sym.includes('XAGUSD') || sym === 'XAG') return { pipSize: 0.01, contractSize: 5000 };
  if (sym.includes('USTEC') || sym.includes('US500') || sym.includes('AUS200') || sym.includes('FR40'))
    return { pipSize: 0.1, contractSize: hasX100 ? 100 : 1 };
  if (sym.includes('US30') || sym.includes('DE30') || sym.includes('HK50') || sym.includes('JP225'))
    return { pipSize: 1, contractSize: hasX100 ? 100 : 1 };
  if (sym.includes('BTC') || sym.includes('ETH')) return { pipSize: 0.1, contractSize: 1 };
  if (sym.includes('UKOIL') || sym.includes('USOIL')) return { pipSize: 0.01, contractSize: 1000 };
  if (sym.includes('XNGUSD')) return { pipSize: 0.01, contractSize: 10000 };
  if (sym.includes('JPY')) return { pipSize: 0.01, contractSize: 100000 };
  return { pipSize: 0.0001, contractSize: 100000 };
}

function calculateSlDollars(symbol: string, volume: number, entryPrice: number, slPrice: number): number {
  const { pipSize, contractSize } = getInstrumentInfo(symbol);
  const priceDiff = Math.abs(entryPrice - slPrice);
  const pips = priceDiff / pipSize;
  const pipValue = volume * contractSize * pipSize;
  let result = pips * pipValue;

  // For JPY-quoted pairs, the result is in JPY — convert to USD by dividing by entry price
  const sym = symbol.replace(/m$/, '').replace(/_x\d+m?$/, '');
  if (sym.endsWith('JPY')) {
    result = result / entryPrice;
  }

  return result;
}

function parseTime(s: string): Date {
  return new Date(s.replace(' ', 'T') + 'Z');
}

function isWeekend(d: Date): boolean {
  return d.getUTCDay() === 0 || d.getUTCDay() === 6;
}

function dateKey(d: Date): string {
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

function dayName(s: string): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(s + 'T00:00:00Z').getUTCDay()];
}

function hoursDiff(a: string, b: string): number {
  return Math.abs(parseTime(b).getTime() - parseTime(a).getTime()) / 3600000;
}

// ── Main evaluation ──

export function evaluateAccount(
  account: MT5AccountInfo,
  positions: MT5Position[],
  deals: MT5Deal[],
  reportedBalance: number,
  config: EvaluationConfig
): EvaluationResult {
  const tradeFlags = new Map<string, string[]>();

  function addFlag(posId: string, reason: string) {
    if (!tradeFlags.has(posId)) tradeFlags.set(posId, []);
    tradeFlags.get(posId)!.push(reason);
  }

  const challengeStart = new Date(config.challengeStartDate + 'T00:00:00Z');
  const challengeEnd = new Date(config.challengeEndDate + 'T23:59:59Z');

  function isInPeriod(d: Date): boolean {
    return d >= challengeStart && d <= challengeEnd;
  }

  // Step 1: Filter to challenge period
  const challengePositions = positions.filter(p => {
    const open = parseTime(p.openTime);
    const close = parseTime(p.closeTime);
    return isInPeriod(open) || isInPeriod(close);
  });

  // Step 2: Starting balance — use the running balance from the last deal before challenge starts
  const allBalanceDeals = deals.filter(d => d.dealType === 'balance' || (d.symbol === '' && d.direction === ''));
  let startingBalance = 0;
  
  // Find the last deal (any type) before the challenge start and use its running balance
  for (let i = deals.length - 1; i >= 0; i--) {
    const dealTime = parseTime(deals[i].time);
    if (dealTime < challengeStart && deals[i].balance > 0) {
      startingBalance = deals[i].balance;
      break;
    }
  }
  
  // Fallback: if no deals before challenge start, use the first deal's balance
  if (startingBalance === 0 && deals.length > 0) {
    // The first balance deal is the initial deposit
    const firstBalanceDeal = deals.find(d => d.dealType === 'balance' || (d.symbol === '' && d.direction === ''));
    if (firstBalanceDeal) {
      startingBalance = firstBalanceDeal.balance;
    }
  }
  
  // startingBalanceOk is checked after day-1 deposit handling below

  // Step 3: Recharging — check for actual deposits DURING the challenge period
  // Tolerate day-1 deposits (initial setup) as long as total doesn't exceed starting balance limit
  // Any deposit after day 1 = recharging = disqualify
  const challengeStartDateStr = config.challengeStartDate;
  const challengeDay1End = new Date(challengeStartDateStr + 'T23:59:59Z');

  // Check if user reset their balance on day 1 (withdrawal to reach exactly $50)
  let balanceResetOnDay1 = false;
  const day1AllBalanceDeals = allBalanceDeals.filter(d => {
    const t = parseTime(d.time);
    return t >= challengeStart && t <= challengeDay1End;
  });

  // Find the balance after all day-1 balance operations (deposits + withdrawals)
  if (day1AllBalanceDeals.length > 0) {
    const lastDay1Deal = day1AllBalanceDeals[day1AllBalanceDeals.length - 1];
    const balanceAfterDay1Ops = lastDay1Deal.balance;
    // If balance after day-1 operations equals the limit, user reset their balance
    if (Math.abs(balanceAfterDay1Ops - config.startingBalanceLimit) < 0.01) {
      balanceResetOnDay1 = true;
      startingBalance = config.startingBalanceLimit;
    }
  }

  // If no reset detected but starting balance is above limit, check if any deal on day 1 shows $50
  if (!balanceResetOnDay1 && startingBalance > config.startingBalanceLimit) {
    // Check all deals on day 1 — if any shows balance = $50, user reset
    for (const d of deals) {
      const t = parseTime(d.time);
      if (t >= challengeStart && t <= challengeDay1End) {
        if (Math.abs(d.balance - config.startingBalanceLimit) < 0.01) {
          balanceResetOnDay1 = true;
          startingBalance = config.startingBalanceLimit;
          break;
        }
      }
    }
  }

  const depositsInChallenge = allBalanceDeals.filter(d => {
    const t = parseTime(d.time);
    if (t < challengeStart || t > challengeEnd) return false;
    if (d.profit <= 0) return false;
    // Exclude non-deposit balance entries by comment
    const comment = (d.comment || '').toUpperCase();
    if (comment.startsWith('DIV-')) return false;
    if (comment.startsWith('SWAP')) return false;
    if (comment.includes('CORRECTION')) return false;
    if (comment.includes('REBATE')) return false;
    if (comment.includes('BONUS')) return false;
    if (comment.includes('COMMISSION')) return false;
    if (comment.includes('ROLLOVER')) return false;
    return true;
  });

  // Separate day-1 deposits from later deposits
  const day1Deposits = depositsInChallenge.filter(d => parseTime(d.time) <= challengeDay1End);
  const laterDeposits = depositsInChallenge.filter(d => parseTime(d.time) > challengeDay1End);

  // Day-1 deposits: use the actual running balance after the last day-1 deposit
  let balanceAfterDay1Deposits = startingBalance;
  if (day1Deposits.length > 0) {
    const lastDay1Deposit = day1Deposits[day1Deposits.length - 1];
    balanceAfterDay1Deposits = lastDay1Deposit.balance;
  }
  const day1DepositsOk = balanceAfterDay1Deposits <= config.startingBalanceLimit || balanceResetOnDay1;

  // If day-1 deposits bring balance to valid level, update starting balance
  if (day1Deposits.length > 0 && day1DepositsOk) {
    startingBalance = balanceAfterDay1Deposits;
  }

  // Recharging = any deposit after day 1, OR day-1 deposits that exceed the limit (unless reset)
  const noRecharging = laterDeposits.length === 0 && day1DepositsOk;
  const startingBalanceOk = startingBalance <= config.startingBalanceLimit;

  // Step 4: Active days
  const activeDaysSet = new Set<string>();
  challengePositions.forEach(p => {
    const od = parseTime(p.openTime);
    const cd = parseTime(p.closeTime);
    if (!isWeekend(od)) activeDaysSet.add(dateKey(od));
    if (!isWeekend(cd)) activeDaysSet.add(dateKey(cd));
  });
  const activeDaysOk = activeDaysSet.size >= config.minActiveDays;

  // Step 5: Weekend trading
  let weekendOk = true;
  challengePositions.forEach(p => {
    const open = parseTime(p.openTime);
    const close = parseTime(p.closeTime);
    if (isWeekend(open) || isWeekend(close)) {
      weekendOk = false;
      if (p.profit > 0) addFlag(p.positionId, 'Weekend trading');
    }
  });

  // Step 6: Lot size
  let lotSizeOk = true;
  challengePositions.forEach(p => {
    if (p.volume > config.maxLot) {
      lotSizeOk = false;
      if (p.profit > 0) addFlag(p.positionId, 'Lot size ' + p.volume + ' > ' + config.maxLot);
    }
  });

  // Step 7: Max open trades
  type TimeEvent = { time: number; posId: string; action: 'open' | 'close' };
  const events: TimeEvent[] = [];
  challengePositions.forEach(p => {
    events.push({ time: parseTime(p.openTime).getTime(), posId: p.positionId, action: 'open' });
    events.push({ time: parseTime(p.closeTime).getTime(), posId: p.positionId, action: 'close' });
  });
  events.sort((a, b) => a.time - b.time || (a.action === 'close' ? -1 : 1));

  const openSet = new Set<string>();
  let maxSimultaneous = 0;
  const violating4Plus = new Set<string>();
  for (const ev of events) {
    if (ev.action === 'open') openSet.add(ev.posId); else openSet.delete(ev.posId);
    if (openSet.size > maxSimultaneous) maxSimultaneous = openSet.size;
    if (openSet.size > config.maxOpenTrades) openSet.forEach(id => violating4Plus.add(id));
  }
  violating4Plus.forEach(id => {
    const p = challengePositions.find(pp => pp.positionId === id);
    if (p && p.profit > 0) addFlag(id, (config.maxOpenTrades + 1) + '+ trades open simultaneously');
  });

  // Step 8: Same pair limit
  const bySymbol = new Map<string, MT5Position[]>();
  challengePositions.forEach(p => {
    if (!bySymbol.has(p.symbol)) bySymbol.set(p.symbol, []);
    bySymbol.get(p.symbol)!.push(p);
  });
  const pairViolations = new Set<string>();
  bySymbol.forEach((symPositions) => {
    const symEvents: TimeEvent[] = [];
    symPositions.forEach(p => {
      symEvents.push({ time: parseTime(p.openTime).getTime(), posId: p.positionId, action: 'open' });
      symEvents.push({ time: parseTime(p.closeTime).getTime(), posId: p.positionId, action: 'close' });
    });
    symEvents.sort((a, b) => a.time - b.time || (a.action === 'close' ? -1 : 1));
    const so = new Set<string>();
    for (const ev of symEvents) {
      if (ev.action === 'open') so.add(ev.posId); else so.delete(ev.posId);
      if (so.size > config.maxSamePair) so.forEach(id => pairViolations.add(id));
    }
  });
  pairViolations.forEach(id => {
    const p = challengePositions.find(pp => pp.positionId === id);
    if (p && p.profit > 0) addFlag(id, 'Same pair 3+ open (' + p.symbol + ')');
  });

  // Step 9: Stop loss
  let noSlCount = 0;
  let slTooWideCount = 0;
  challengePositions.forEach(p => {
    if (p.sl === null || p.sl === 0) {
      noSlCount++;
      if (p.profit > 0) addFlag(p.positionId, 'No stop loss');
    } else {
      // Check if SL is on the loss side (correct placement)
      const isBuy = p.type === 'buy';
      const slOnLossSide = isBuy ? p.sl < p.entryPrice : p.sl > p.entryPrice;

      if (slOnLossSide) {
        // SL is correctly placed — check distance
        const slDollars = calculateSlDollars(p.symbol, p.volume, p.entryPrice, p.sl);
        if (slDollars > config.maxSlDollars) {
          slTooWideCount++;
          if (p.profit > 0) addFlag(p.positionId, 'SL too wide: $' + slDollars.toFixed(2));
        }
      }
      // SL on profit side = trailing stop, not a violation
    }
  });

  // Step 10: Daily drawdown
  const sortedByClose = [...challengePositions].sort((a, b) =>
    parseTime(a.closeTime).getTime() - parseTime(b.closeTime).getTime()
  );
  const byDay = new Map<string, MT5Position[]>();
  sortedByClose.forEach(p => {
    const dk = dateKey(parseTime(p.closeTime));
    if (!byDay.has(dk)) byDay.set(dk, []);
    byDay.get(dk)!.push(p);
  });

  let runBal = startingBalance;
  const tradingDays = [...byDay.keys()].sort();
  const dailyDrawdowns: DailyDrawdownInfo[] = [];
  let worstDD = 0;
  let worstDDDay = '';

  for (const day of tradingDays) {
    const openBal = runBal;
    const dayPos = byDay.get(day)!;
    let cur = openBal;
    let minBal = openBal;
    let breached = false;
    let removedAfter = 0;

    for (const p of dayPos) {
      cur += p.profit;
      if (cur < minBal) minBal = cur;
      const dd = openBal - cur;
      if (dd >= config.maxDailyLoss && !breached) breached = true;
      if (breached && p.profit > 0) {
        addFlag(p.positionId, 'Profit after daily $' + config.maxDailyLoss + ' drawdown on ' + day);
        removedAfter += p.profit;
      }
    }

    const dd = openBal - minBal;
    if (dd > worstDD) { worstDD = dd; worstDDDay = day; }

    dailyDrawdowns.push({
      day,
      dayName: dayName(day),
      openBalance: openBal,
      minBalance: minBal,
      closeBalance: cur,
      drawdown: dd,
      breached,
      profitsRemovedAfterBreach: removedAfter,
    });

    runBal = cur;
  }

  // Step 11: 24-hour hold
  let holdOk = true;
  challengePositions.forEach(p => {
    const h = hoursDiff(p.openTime, p.closeTime);
    if (h > config.maxHoldHours) {
      holdOk = false;
      if (p.profit > 0) addFlag(p.positionId, 'Held ' + h.toFixed(1) + 'h > ' + config.maxHoldHours + 'h');
    }
  });

  // Calculate final results
  let totalProfitRemoved = 0;
  const flaggedTrades: FlaggedTrade[] = [];
  tradeFlags.forEach((reasons, posId) => {
    const p = challengePositions.find(pp => pp.positionId === posId);
    if (p && p.profit > 0) {
      totalProfitRemoved += p.profit;
      flaggedTrades.push({ positionId: posId, symbol: p.symbol, openTime: p.openTime, profit: p.profit, reasons });
    }
  });

  const adjustedBalance = reportedBalance - totalProfitRemoved;
  const disqualifyReasons: string[] = [];
  if (!noRecharging) {
    let depositDetails = '';
    if (laterDeposits.length > 0) {
      depositDetails = 'Additional deposits detected after day 1:';
      laterDeposits.forEach(d => {
        const dateStr = d.time.substring(0, 16);
        depositDetails += '\n  +$' + d.profit.toFixed(2) + ' on ' + dateStr;
      });
    }
    if (!day1DepositsOk) {
      depositDetails += (depositDetails ? '\n' : '') + 'Day 1 deposits exceeded limit ($' + config.startingBalanceLimit + '):';
      depositDetails += ' balance reached $' + balanceAfterDay1Deposits.toFixed(2);
    }
    disqualifyReasons.push(depositDetails);
  }
  if (!activeDaysOk) disqualifyReasons.push('Only ' + activeDaysSet.size + ' active days (min ' + config.minActiveDays + ')');
  if (!startingBalanceOk) disqualifyReasons.push('Starting balance $' + startingBalance + ' exceeds $' + config.startingBalanceLimit);
  const isDisqualified = disqualifyReasons.length > 0;
  const isQualified = !isDisqualified && adjustedBalance >= config.targetBalance;

  const drawdownBreachCount = dailyDrawdowns.filter(d => d.breached).length;

  const result: EvaluationResult = {
    accountNumber: account.accountNumber,
    accountType: account.accountType,
    accountName: account.name,
    isCent: account.isCent,
    startingBalance,
    reportedBalance,
    adjustedBalance: Math.round(adjustedBalance * 100) / 100,
    profitRemoved: Math.round(totalProfitRemoved * 100) / 100,
    totalTrades: challengePositions.length,
    flaggedCount: flaggedTrades.length,
    activeDays: activeDaysSet.size,
    isQualified,
    isDisqualified,
    disqualifyReasons,
    checks: {
      challengePeriod: true,
      startingBalance: startingBalanceOk,
      noRecharging,
      activeDays: activeDaysOk,
      weekendTrading: weekendOk,
      lotSize: lotSizeOk,
      maxOpenTrades: violating4Plus.size === 0,
      samePairLimit: pairViolations.size === 0,
      stopLoss: noSlCount === 0 && slTooWideCount === 0,
      dailyDrawdown: drawdownBreachCount === 0,
      holdTime: holdOk,
    },
    flaggedTrades,
    dailyDrawdowns,
    slViolationCount: noSlCount + slTooWideCount,
    noSlCount,
    slTooWideCount,
    maxSimultaneous,
    worstDrawdownDay: worstDDDay,
    worstDrawdownAmount: Math.round(worstDD * 100) / 100,
    balanceResetOnDay1,
    shortReport: '',
    fullReport: '',
  };

  // Generate reports
  result.shortReport = generateShortReport(result, config);
  result.fullReport = generateFullReport(result, config);

  return result;
}

// ── Report generators ──

function generateShortReport(r: EvaluationResult, cfg: EvaluationConfig): string {
  const status = r.isDisqualified ? '🚫 DISQUALIFIED' : r.isQualified ? '✅ QUALIFIES' : '❌ Below Target';
  let text = '';
  text += '📊 <b>EVALUATION</b> — ' + r.accountNumber + '\n';
  text += '📁 Category: ' + (r.accountType === 'real' ? 'Real' : 'Demo') + '\n\n';
  text += status + '\n\n';
  text += '💰 Adjusted Balance: <b>$' + r.adjustedBalance.toFixed(2) + '</b>\n';
  text += '💰 Reported Balance: $' + r.reportedBalance.toFixed(2) + '\n';
  text += '➖ Profit Removed: $' + r.profitRemoved.toFixed(2) + '\n\n';
  text += '📈 Total Trades: ' + r.totalTrades + '\n';
  text += '⚠️ Flagged Trades: ' + r.flaggedCount + '\n';
  if (r.noSlCount > 0) text += '🛡️ Missing Stop Loss: ' + r.noSlCount + '\n';
  if (r.slTooWideCount > 0) text += '🛡️ SL Too Wide: ' + r.slTooWideCount + '\n';
  if (r.dailyDrawdowns.some(d => d.breached)) text += '📉 Drawdown Breaches: ' + r.dailyDrawdowns.filter(d => d.breached).length + ' days\n';
  text += '📅 Active Days: ' + r.activeDays + '/' + cfg.minActiveDays + '\n';
  if (r.balanceResetOnDay1) {
    text += 'ℹ️ Balance reset on Day 1 (grace period used)\n';
  }
  if (r.isDisqualified) {
    text += '\n📛 ' + r.disqualifyReasons.join(', ');
  }
  return text;
}

function generateFullReport(r: EvaluationResult, cfg: EvaluationConfig): string {
  let text = '';

  text += '📋 DETAILED EVALUATION REPORT\n';
  text += 'Account: ' + r.accountNumber + ' | ' + (r.accountType === 'real' ? 'Real' : 'Demo') + '\n';
  text += 'Name: ' + r.accountName + '\n\n';

  text += '────────────────────────────\n';
  text += '         RULE CHECKS\n';
  text += '────────────────────────────\n\n';

  text += (r.checks.startingBalance ? '✅' : '❌') + ' Starting Balance      $' + r.startingBalance.toFixed(2) + '\n';
  if (r.balanceResetOnDay1) {
    text += '   ℹ️ User reset balance on Day 1 (grace period)\n';
  }
  text += (r.checks.noRecharging ? '✅' : '❌') + ' No Recharging\n';
  text += (r.checks.activeDays ? '✅' : '❌') + ' Active Days           ' + r.activeDays + '/' + cfg.minActiveDays + '\n';
  text += (r.checks.weekendTrading ? '✅' : '⚠️') + ' Weekend Trading\n';
  text += (r.checks.lotSize ? '✅' : '⚠️') + ' Lot Size              All ≤ ' + cfg.maxLot + '\n';
  text += (r.checks.maxOpenTrades ? '✅' : '⚠️') + ' Max Open Trades       Max: ' + r.maxSimultaneous + '\n';
  text += (r.checks.samePairLimit ? '✅' : '⚠️') + ' Same Pair Limit\n';
  text += (r.checks.stopLoss ? '✅' : '⚠️') + ' Stop Loss             ';
  if (r.checks.stopLoss) text += 'All valid\n';
  else text += r.noSlCount + ' missing, ' + r.slTooWideCount + ' too wide\n';
  text += (r.checks.dailyDrawdown ? '✅' : '❌') + ' Daily Drawdown        ';
  if (r.checks.dailyDrawdown) text += 'Max: $' + r.worstDrawdownAmount.toFixed(2) + '\n';
  else text += r.dailyDrawdowns.filter(d => d.breached).length + ' days breached\n';
  text += (r.checks.holdTime ? '✅' : '⚠️') + ' Max Hold Time         All < ' + cfg.maxHoldHours + 'h\n';

  if (r.flaggedTrades.length > 0) {
    text += '\n────────────────────────────\n';
    text += '    FLAGGED TRADES (' + r.flaggedTrades.length + ')\n';
    text += '────────────────────────────\n\n';

    r.flaggedTrades.forEach((f, i) => {
      const dateStr = f.openTime.substring(5, 10).replace('-', '/');
      text += (i + 1) + '. #' + f.positionId + ' | ' + dateStr + ' | ' + f.symbol + ' | +$' + f.profit.toFixed(2) + '\n';
      text += '   ' + f.reasons.join(', ') + '\n';
    });
  }

  if (r.dailyDrawdowns.some(d => d.breached)) {
    text += '\n────────────────────────────\n';
    text += '    DAILY DRAWDOWN\n';
    text += '────────────────────────────\n\n';

    r.dailyDrawdowns.forEach(d => {
      const st = d.breached ? '❌' : '✅';
      text += st + ' ' + d.day + ' (' + d.dayName + ')\n';
      text += '   Open: $' + d.openBalance.toFixed(2) + ' | DD: $' + d.drawdown.toFixed(2) + '\n';
      if (d.breached && d.profitsRemovedAfterBreach > 0) {
        text += '   Profits removed: $' + d.profitsRemovedAfterBreach.toFixed(2) + '\n';
      }
    });
  }

  text += '\n────────────────────────────\n';
  text += '       FINAL RESULT\n';
  text += '────────────────────────────\n\n';

  text += '💰 Reported Balance:  $' + r.reportedBalance.toFixed(2) + '\n';
  text += '➖ Profit Removed:    $' + r.profitRemoved.toFixed(2) + '\n';
  text += '✅ Adjusted Balance:  $' + r.adjustedBalance.toFixed(2) + '\n\n';

  if (r.isDisqualified) {
    text += '🚫 DISQUALIFIED\n';
    text += '📛 ' + r.disqualifyReasons.join(', ') + '\n';
  } else if (r.isQualified) {
    text += '🏆 QUALIFIES (Target: $' + cfg.targetBalance + ')\n';
  } else {
    text += '❌ DOES NOT QUALIFY\n';
    text += 'Adjusted balance below target ($' + cfg.targetBalance + ')\n';
  }

  return text;
}
