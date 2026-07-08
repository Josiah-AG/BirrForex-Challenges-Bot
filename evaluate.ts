#!/usr/bin/env ts-node
/**
 * BirrForex Challenge 15 — Trade Evaluation Script
 * 
 * Usage: Paste positions and deals data into the DATA section at the bottom,
 * then run: npx ts-node evaluate.ts
 * 
 * Rules enforced:
 * 1. Challenge period filter (Apr 20 - May 1, 2026)
 * 2. Starting balance <= $50
 * 3. No recharging (additional deposits)
 * 4. Min 7 active trading days
 * 5. No weekend trading profits
 * 6. Max lot size 0.02 (0.01 and 0.02 allowed)
 * 7. Max 3 open trades at same time
 * 8. Max 2 same pair open at same time
 * 9. Stop loss required, max $6 risk (internal buffer for $5 rule)
 * 10. Daily drawdown max $10 from day's opening balance
 * 11. Max 24-hour hold time
 * 
 * Profit removal rules:
 * - Rule violations only remove PROFIT, losses always count
 * - If trade is flagged, profit becomes 0 (loss stays as-is)
 */

// ============================================================
// TYPES
// ============================================================

interface Position {
  openTime: string;   // "2026-04-20 03:21:28"
  closeTime: string;  // "2026-04-20 19:51:17"
  positionId: string;
  symbol: string;
  type: 'buy' | 'sell';
  volume: number;
  entryPrice: number;
  sl: number | null;
  tp: number | null;
  exitPrice: number;
  commission: number;
  swap: number;
  profit: number;
}

interface Deal {
  time: string;       // "2026-04-20 03:21:28"
  symbol: string;     // "" for balance deals
  dealType: string;   // "buy", "sell", "balance"
  direction: string;  // "in", "out", "" for balance
  volume: number;
  price: number;
  profit: number;
  balance: number;
  comment: string;
}

interface AccountInfo {
  accountNumber: string;
  accountType: string; // "demo" or "real"
  name: string;
}

interface FlaggedTrade {
  positionId: string;
  symbol: string;
  openTime: string;
  profit: number;
  reasons: string[];
  profitRemoved: number;
}

// ============================================================
// PIP / SL CALCULATION
// ============================================================

function getInstrumentInfo(symbol: string): { pipSize: number; contractSize: number } {
  const sym = symbol.replace(/m$/, '').replace(/_x\d+m?$/, '');
  const hasX100 = symbol.includes('_x100');

  // Metals
  if (sym.includes('XAUUSD') || sym === 'XAU') {
    return { pipSize: 0.01, contractSize: 100 }; // 100 troy oz
  }
  if (sym.includes('XAGUSD') || sym === 'XAG') {
    return { pipSize: 0.01, contractSize: 5000 };
  }

  // Indices
  if (sym.includes('USTEC') || sym.includes('US500') || sym.includes('AUS200') || sym.includes('FR40')) {
    return { pipSize: 0.1, contractSize: hasX100 ? 100 : 1 };
  }
  if (sym.includes('US30') || sym.includes('DE30') || sym.includes('HK50') || sym.includes('JP225')) {
    return { pipSize: 1, contractSize: hasX100 ? 100 : 1 };
  }

  // Crypto
  if (sym.includes('BTC') || sym.includes('ETH')) {
    return { pipSize: 0.1, contractSize: 1 };
  }

  // Energies
  if (sym.includes('UKOIL') || sym.includes('USOIL')) {
    return { pipSize: 0.01, contractSize: 1000 };
  }
  if (sym.includes('XNGUSD')) {
    return { pipSize: 0.01, contractSize: 10000 };
  }

  // JPY pairs
  if (sym.includes('JPY')) {
    return { pipSize: 0.01, contractSize: 100000 };
  }

  // DXY
  if (sym === 'DXY') {
    return { pipSize: 0.0001, contractSize: 1000 };
  }

  // Default forex
  return { pipSize: 0.0001, contractSize: 100000 };
}

function calculateSlDollars(symbol: string, volume: number, entryPrice: number, slPrice: number): number {
  const { pipSize, contractSize } = getInstrumentInfo(symbol);
  const priceDiff = Math.abs(entryPrice - slPrice);
  const pips = priceDiff / pipSize;
  const pipValue = volume * contractSize * pipSize;
  return pips * pipValue;
}

// ============================================================
// HELPERS
// ============================================================

function parseTime(s: string): Date {
  // "2026-04-20 03:21:28" -> Date (treat as UTC)
  return new Date(s.replace(' ', 'T') + 'Z');
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
}

function dayOfWeek(d: Date): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
}

function hoursDiff(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60);
}

function isInChallengePeriod(d: Date): boolean {
  const start = new Date('2026-04-20T00:00:00Z');
  const end = new Date('2026-05-01T23:59:59Z');
  return d >= start && d <= end;
}

// ============================================================
// MAIN EVALUATION
// ============================================================

function evaluate(account: AccountInfo, positions: Position[], deals: Deal[]) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CHALLENGE 15 — TRADE EVALUATION REPORT');
  console.log(`  Account: ${account.accountNumber} (${account.accountType}, ${account.name})`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const flagged: FlaggedTrade[] = [];
  const tradeFlags: Map<string, string[]> = new Map(); // positionId -> reasons

  function addFlag(posId: string, reason: string) {
    if (!tradeFlags.has(posId)) tradeFlags.set(posId, []);
    tradeFlags.get(posId)!.push(reason);
  }

  // ── STEP 1: Filter to challenge period ──
  const challengePositions = positions.filter(p => {
    const open = parseTime(p.openTime);
    const close = parseTime(p.closeTime);
    return isInChallengePeriod(open) || isInChallengePeriod(close);
  });
  console.log(`STEP 1 — Challenge Period Filter`);
  console.log(`  Total positions: ${positions.length}`);
  console.log(`  In challenge period: ${challengePositions.length}`);
  const outsideCount = positions.length - challengePositions.length;
  if (outsideCount > 0) console.log(`  ⚠️ ${outsideCount} trades outside challenge period`);
  else console.log(`  ✅ All trades within period`);
  console.log();

  // ── STEP 2: Starting balance ──
  const balanceDeals = deals.filter(d => d.dealType === 'balance' || (d.symbol === '' && d.direction === ''));
  const firstBalance = balanceDeals[0];
  console.log(`STEP 2 — Starting Balance`);
  console.log(`  First deposit: $${firstBalance?.balance?.toFixed(2) || 'N/A'} on ${firstBalance?.time || 'N/A'}`);
  const startingBalance = firstBalance?.profit || 0;
  if (startingBalance > 50) {
    console.log(`  ❌ Starting balance $${startingBalance} exceeds $50 limit`);
  } else {
    console.log(`  ✅ Starting balance $${startingBalance.toFixed(2)} (≤ $50)`);
  }
  console.log();

  // ── STEP 3: Recharging check ──
  console.log(`STEP 3 — Recharging Check`);
  const depositDeals = deals.filter(d => 
    (d.dealType === 'balance' || (d.symbol === '' && d.direction === '')) && 
    d.profit > 0
  );
  if (depositDeals.length > 1) {
    console.log(`  ❌ DISQUALIFIED — ${depositDeals.length} deposits found:`);
    depositDeals.forEach(d => console.log(`    ${d.time}: +$${d.profit.toFixed(2)} (${d.comment})`));
  } else {
    console.log(`  ✅ No additional deposits`);
  }
  console.log();

  // ── STEP 4: Active trading days ──
  console.log(`STEP 4 — Active Trading Days`);
  const activeDays = new Set<string>();
  challengePositions.forEach(p => {
    const openDate = parseTime(p.openTime);
    const closeDate = parseTime(p.closeTime);
    if (!isWeekend(openDate)) activeDays.add(dateKey(openDate));
    if (!isWeekend(closeDate)) activeDays.add(dateKey(closeDate));
  });
  const sortedDays = [...activeDays].sort();
  console.log(`  Active weekdays: ${activeDays.size}`);
  sortedDays.forEach(d => {
    const dt = new Date(d + 'T00:00:00Z');
    console.log(`    ${d} (${dayOfWeek(dt)})`);
  });
  if (activeDays.size < 7) {
    console.log(`  ❌ DISQUALIFIED — Only ${activeDays.size} active days (min 7)`);
  } else {
    console.log(`  ✅ ${activeDays.size} active days (min 7)`);
  }
  console.log();

  // ── STEP 5: Weekend trading ──
  console.log(`STEP 5 — Weekend Trading`);
  let weekendCount = 0;
  challengePositions.forEach(p => {
    const open = parseTime(p.openTime);
    const close = parseTime(p.closeTime);
    if (isWeekend(open) || isWeekend(close)) {
      weekendCount++;
      if (p.profit > 0) {
        addFlag(p.positionId, `Weekend trading (${dayOfWeek(open)})`);
        console.log(`  ⚠️ ${p.positionId} ${p.symbol} opened ${p.openTime} (${dayOfWeek(open)}) profit $${p.profit.toFixed(2)} → REMOVED`);
      }
    }
  });
  if (weekendCount === 0) console.log(`  ✅ No weekend trades`);
  console.log();

  // ── STEP 6: Lot size ──
  console.log(`STEP 6 — Lot Size Check`);
  let lotViolations = 0;
  challengePositions.forEach(p => {
    if (p.volume > 0.02) {
      lotViolations++;
      if (p.profit > 0) {
        addFlag(p.positionId, `Lot size ${p.volume} > 0.02`);
      }
      console.log(`  ⚠️ ${p.positionId} ${p.symbol} volume=${p.volume} profit=$${p.profit.toFixed(2)}${p.profit > 0 ? ' → REMOVED' : ' (loss kept)'}`);
    }
  });
  if (lotViolations === 0) console.log(`  ✅ All trades ≤ 0.02 lots`);
  console.log();

  // ── STEP 7: Max 3 open trades at same time ──
  console.log(`STEP 7 — Max 3 Open Trades Simultaneously`);
  // Build timeline events
  type TimeEvent = { time: number; posId: string; action: 'open' | 'close' };
  const events: TimeEvent[] = [];
  challengePositions.forEach(p => {
    events.push({ time: parseTime(p.openTime).getTime(), posId: p.positionId, action: 'open' });
    events.push({ time: parseTime(p.closeTime).getTime(), posId: p.positionId, action: 'close' });
  });
  events.sort((a, b) => a.time - b.time || (a.action === 'close' ? -1 : 1)); // closes before opens at same time

  const openSet = new Set<string>();
  const violating4Plus = new Set<string>();
  let maxOpen = 0;

  for (const ev of events) {
    if (ev.action === 'open') {
      openSet.add(ev.posId);
    } else {
      openSet.delete(ev.posId);
    }
    if (openSet.size > maxOpen) maxOpen = openSet.size;
    if (openSet.size > 3) {
      // All currently open trades are in violation
      openSet.forEach(id => violating4Plus.add(id));
    }
  }

  if (violating4Plus.size > 0) {
    console.log(`  ⚠️ Max simultaneous: ${maxOpen} — VIOLATION`);
    console.log(`  Trades involved in 4+ overlap:`);
    violating4Plus.forEach(id => {
      const p = challengePositions.find(pp => pp.positionId === id);
      if (p && p.profit > 0) {
        addFlag(id, `4+ trades open simultaneously`);
        console.log(`    ${id} ${p.symbol} profit=$${p.profit.toFixed(2)} → REMOVED`);
      } else if (p) {
        console.log(`    ${id} ${p.symbol} loss=$${p.profit.toFixed(2)} (kept)`);
      }
    });
  } else {
    console.log(`  ✅ Max simultaneous: ${maxOpen} (≤ 3)`);
  }
  console.log();

  // ── STEP 8: Same pair max 2 open at once ──
  console.log(`STEP 8 — Same Pair Max 2 Open at Once`);
  // Group by symbol
  const bySymbol = new Map<string, Position[]>();
  challengePositions.forEach(p => {
    if (!bySymbol.has(p.symbol)) bySymbol.set(p.symbol, []);
    bySymbol.get(p.symbol)!.push(p);
  });

  const pairViolations = new Set<string>();
  bySymbol.forEach((symPositions, symbol) => {
    const symEvents: TimeEvent[] = [];
    symPositions.forEach(p => {
      symEvents.push({ time: parseTime(p.openTime).getTime(), posId: p.positionId, action: 'open' });
      symEvents.push({ time: parseTime(p.closeTime).getTime(), posId: p.positionId, action: 'close' });
    });
    symEvents.sort((a, b) => a.time - b.time || (a.action === 'close' ? -1 : 1));

    const symOpen = new Set<string>();
    for (const ev of symEvents) {
      if (ev.action === 'open') symOpen.add(ev.posId);
      else symOpen.delete(ev.posId);
      if (symOpen.size > 2) {
        symOpen.forEach(id => pairViolations.add(id));
      }
    }
  });

  if (pairViolations.size > 0) {
    console.log(`  ⚠️ Same-pair violations found:`);
    pairViolations.forEach(id => {
      const p = challengePositions.find(pp => pp.positionId === id);
      if (p && p.profit > 0) {
        addFlag(id, `Same pair 3+ open (${p.symbol})`);
        console.log(`    ${id} ${p.symbol} ${p.openTime} profit=$${p.profit.toFixed(2)} → REMOVED`);
      } else if (p) {
        console.log(`    ${id} ${p.symbol} ${p.openTime} loss=$${p.profit.toFixed(2)} (kept)`);
      }
    });
  } else {
    console.log(`  ✅ No same-pair violations`);
  }
  console.log();

  // ── STEP 9: Stop Loss Check ──
  console.log(`STEP 9 — Stop Loss Check`);
  let noSlCount = 0;
  let slTooWideCount = 0;
  challengePositions.forEach(p => {
    if (p.sl === null || p.sl === 0) {
      noSlCount++;
      if (p.profit > 0) {
        addFlag(p.positionId, `No stop loss`);
        console.log(`  ⚠️ ${p.positionId} ${p.symbol} ${p.openTime} NO SL — profit $${p.profit.toFixed(2)} → REMOVED`);
      } else {
        console.log(`  ⚠️ ${p.positionId} ${p.symbol} ${p.openTime} NO SL — loss $${p.profit.toFixed(2)} (kept)`);
      }
    } else {
      // Check SL distance
      const slDollars = calculateSlDollars(p.symbol, p.volume, p.entryPrice, p.sl);
      if (slDollars > 6.0) {
        slTooWideCount++;
        if (p.profit > 0) {
          addFlag(p.positionId, `SL too wide: $${slDollars.toFixed(2)} > $6`);
          console.log(`  ⚠️ ${p.positionId} ${p.symbol} SL=$${slDollars.toFixed(2)} > $6 — profit $${p.profit.toFixed(2)} → REMOVED`);
        } else {
          console.log(`  ⚠️ ${p.positionId} ${p.symbol} SL=$${slDollars.toFixed(2)} > $6 — loss $${p.profit.toFixed(2)} (kept)`);
        }
      }
    }
  });
  if (noSlCount === 0 && slTooWideCount === 0) {
    console.log(`  ✅ All trades have valid SL within $6`);
  } else {
    console.log(`  Total: ${noSlCount} missing SL, ${slTooWideCount} SL too wide`);
  }
  console.log();

  // ── STEP 10: Daily Drawdown ──
  console.log(`STEP 10 — Daily Drawdown ($10 max from day's opening balance)`);
  // Process deals chronologically, track daily drawdown
  const challengeDeals = deals.filter(d => {
    const t = parseTime(d.time);
    return isInChallengePeriod(t);
  });

  // Group deals by day
  const dealsByDay = new Map<string, Deal[]>();
  challengeDeals.forEach(d => {
    const dk = dateKey(parseTime(d.time));
    if (!dealsByDay.has(dk)) dealsByDay.set(dk, []);
    dealsByDay.get(dk)!.push(d);
  });

  // Track opening balance per day
  let runningBalance = startingBalance;
  const allDays = [...dealsByDay.keys()].sort();
  const dayOpeningBalances = new Map<string, number>();
  
  // First pass: calculate opening balances
  let bal = startingBalance;
  const dailyProfits = new Map<string, number[]>(); // day -> array of profits in order
  
  for (const day of allDays) {
    dayOpeningBalances.set(day, bal);
    const dayDeals = dealsByDay.get(day)!;
    for (const d of dayDeals) {
      if (d.symbol !== '' || d.direction !== '') { // skip balance deals for running calc
        bal += d.profit;
      } else if (d.profit > 0 && d.symbol === '') {
        bal += d.profit; // deposit
      }
    }
  }

  // Second pass: check drawdown and flag post-drawdown profits
  const drawdownFlaggedTrades = new Set<string>();
  
  for (const day of allDays) {
    const openBal = dayOpeningBalances.get(day)!;
    const dayDeals = dealsByDay.get(day)!;
    let currentBal = openBal;
    let cumulativeLoss = 0;
    let drawdownBreached = false;
    
    for (const d of dayDeals) {
      if (d.symbol === '' && d.direction === '') continue; // skip balance deals
      
      if (d.direction === 'out' && d.profit !== 0) {
        if (d.profit < 0) {
          cumulativeLoss += Math.abs(d.profit);
          currentBal += d.profit;
        } else {
          currentBal += d.profit;
        }
        
        // Check if drawdown from opening balance exceeded
        const drawdownFromOpen = openBal - currentBal;
        if (drawdownFromOpen >= 10 && !drawdownBreached) {
          drawdownBreached = true;
          console.log(`  ⚠️ ${day}: Drawdown $${drawdownFromOpen.toFixed(2)} from opening $${openBal.toFixed(2)} at balance $${currentBal.toFixed(2)}`);
        }
        
        // If drawdown already breached and this is a profit, flag it
        // We need to find which position this deal belongs to
        if (drawdownBreached && d.profit > 0) {
          // Find position by matching deal to position
          // Use the comment or order to match
          // For simplicity, we'll flag based on the deal's associated position
          // The deal's order field can help match to position
          const matchingPos = challengePositions.find(p => {
            const closeT = parseTime(p.closeTime);
            const dealT = parseTime(d.time);
            return Math.abs(closeT.getTime() - dealT.getTime()) < 2000 && 
                   p.symbol === d.symbol &&
                   Math.abs(p.profit - d.profit) < 0.01;
          });
          if (matchingPos) {
            drawdownFlaggedTrades.add(matchingPos.positionId);
            addFlag(matchingPos.positionId, `Profit after daily $10 drawdown on ${day}`);
            console.log(`    → Profit $${d.profit.toFixed(2)} after drawdown — trade ${matchingPos.positionId} flagged`);
          }
        }
      }
    }
    
    if (!drawdownBreached) {
      const maxDD = openBal - Math.min(currentBal, openBal);
      if (maxDD > 0) {
        // Only show days with some drawdown
      }
    }
  }
  
  // Show daily summary
  for (const day of allDays) {
    const openBal = dayOpeningBalances.get(day)!;
    const dayDeals = dealsByDay.get(day)!;
    let minBal = openBal;
    let curBal = openBal;
    for (const d of dayDeals) {
      if (d.symbol === '' && d.direction === '') continue;
      if (d.direction === 'out') {
        curBal += d.profit;
        if (curBal < minBal) minBal = curBal;
      }
    }
    const dd = openBal - minBal;
    const dt = new Date(day + 'T00:00:00Z');
    const status = dd >= 10 ? '❌' : '✅';
    console.log(`  ${status} ${day} (${dayOfWeek(dt)}): Open=$${openBal.toFixed(2)}, MinBal=$${minBal.toFixed(2)}, DD=$${dd.toFixed(2)}, Close=$${curBal.toFixed(2)}`);
  }
  console.log();

  // ── STEP 11: 24-hour hold time ──
  console.log(`STEP 11 — 24-Hour Hold Time`);
  let holdViolations = 0;
  challengePositions.forEach(p => {
    const hours = hoursDiff(parseTime(p.openTime), parseTime(p.closeTime));
    if (hours > 24) {
      holdViolations++;
      if (p.profit > 0) {
        addFlag(p.positionId, `Held ${hours.toFixed(1)}h > 24h`);
        console.log(`  ⚠️ ${p.positionId} ${p.symbol} held ${hours.toFixed(1)}h — profit $${p.profit.toFixed(2)} → REMOVED`);
      } else {
        console.log(`  ⚠️ ${p.positionId} ${p.symbol} held ${hours.toFixed(1)}h — loss $${p.profit.toFixed(2)} (kept)`);
      }
    }
  });
  if (holdViolations === 0) console.log(`  ✅ All trades < 24 hours`);
  console.log();

  // ── FINAL CALCULATION ──
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FINAL CALCULATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  let totalProfitRemoved = 0;
  const allFlagged: FlaggedTrade[] = [];

  tradeFlags.forEach((reasons, posId) => {
    const p = challengePositions.find(pp => pp.positionId === posId);
    if (p && p.profit > 0) {
      totalProfitRemoved += p.profit;
      allFlagged.push({
        positionId: posId,
        symbol: p.symbol,
        openTime: p.openTime,
        profit: p.profit,
        reasons,
        profitRemoved: p.profit,
      });
    }
  });

  const reportedBalance = deals.length > 0 ? deals[deals.length - 1].balance : 0;
  // Find the last balance value from the summary line
  const lastDeal = deals.filter(d => d.balance > 0);
  const finalReportedBalance = lastDeal.length > 0 ? lastDeal[lastDeal.length - 1].balance : reportedBalance;
  const adjustedBalance = finalReportedBalance - totalProfitRemoved;

  // Check disqualification
  const isDisqualified = depositDeals.length > 1 || activeDays.size < 7 || startingBalance > 50;
  const disqualifyReasons: string[] = [];
  if (depositDeals.length > 1) disqualifyReasons.push('Recharging detected');
  if (activeDays.size < 7) disqualifyReasons.push(`Only ${activeDays.size} active days`);
  if (startingBalance > 50) disqualifyReasons.push(`Starting balance $${startingBalance} > $50`);

  console.log(`  Starting Balance:     $${startingBalance.toFixed(2)}`);
  console.log(`  Reported Balance:     $${finalReportedBalance.toFixed(2)}`);
  console.log(`  Profit Removed:       $${totalProfitRemoved.toFixed(2)}`);
  console.log(`  Adjusted Balance:     $${adjustedBalance.toFixed(2)}`);
  console.log(`  DISQUALIFIED:         ${isDisqualified ? 'YES — ' + disqualifyReasons.join(', ') : 'NO'}`);
  console.log();

  if (allFlagged.length > 0) {
    console.log(`  ─── FLAGGED TRADES (${allFlagged.length}) ───`);
    allFlagged.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.positionId} ${f.symbol} ${f.openTime}`);
      console.log(`     Profit: $${f.profit.toFixed(2)} → REMOVED`);
      console.log(`     Reasons: ${f.reasons.join(', ')}`);
    });
  } else {
    console.log(`  ✅ No flagged trades`);
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');

  return { adjustedBalance, totalProfitRemoved, isDisqualified, flaggedCount: allFlagged.length };
}

// ============================================================
// DATA — Paste account data here
// ============================================================

const accountInfo: AccountInfo = {
  accountNumber: '295747472',
  accountType: 'real',
  name: 'Gz2',
};

// Positions from the report (copy from Positions section)
const positions: Position[] = [
  // Apr 20
  { openTime: '2026-04-20 03:21:28', closeTime: '2026-04-20 19:51:17', positionId: '202349654', symbol: 'EURUSDm', type: 'buy', volume: 0.02, entryPrice: 1.17578, sl: 1.17328, tp: 1.18350, exitPrice: 1.17864, commission: 0, swap: 0, profit: 5.72 },
  { openTime: '2026-04-20 05:44:51', closeTime: '2026-04-20 10:19:58', positionId: '202348174', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4780.000, sl: 4780.000, tp: 4854.000, exitPrice: 4799.999, commission: 0, swap: 0, profit: 20.00 },
  { openTime: '2026-04-20 11:53:17', closeTime: '2026-04-20 12:27:49', positionId: '202464355', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4805.668, sl: 4805.668, tp: null, exitPrice: 4805.668, commission: 0, swap: 0, profit: 0.00 },
  { openTime: '2026-04-20 14:10:48', closeTime: '2026-04-20 14:51:06', positionId: '202492195', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4808.990, sl: 4803.989, tp: 4874.989, exitPrice: 4803.989, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-20 15:33:54', closeTime: '2026-04-20 15:36:27', positionId: '202563974', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4807.027, sl: 4802.027, tp: null, exitPrice: 4802.027, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-20 16:55:03', closeTime: '2026-04-21 02:21:04', positionId: '202583896', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4804.916, sl: 4804.916, tp: 4837.916, exitPrice: 4804.916, commission: 0, swap: 0, profit: 0.00 },
  // Apr 21
  { openTime: '2026-04-21 03:25:27', closeTime: '2026-04-21 04:50:07', positionId: '202664252', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4794.000, sl: 4789.000, tp: 4832.000, exitPrice: 4789.000, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-21 03:57:44', closeTime: '2026-04-21 07:00:55', positionId: '202669882', symbol: 'EURUSDm', type: 'buy', volume: 0.02, entryPrice: 1.17756, sl: 1.17506, tp: null, exitPrice: 1.17741, commission: 0, swap: 0, profit: -0.30 },
  { openTime: '2026-04-21 08:45:54', closeTime: '2026-04-21 08:52:46', positionId: '202741972', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4792.532, sl: 4787.532, tp: 4827.500, exitPrice: 4787.532, commission: 0, swap: 0, profit: -5.00 },
  // Apr 22
  { openTime: '2026-04-22 03:33:13', closeTime: '2026-04-22 03:38:15', positionId: '203062658', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4763.707, sl: 4758.707, tp: 4792.000, exitPrice: 4758.707, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-22 08:15:12', closeTime: '2026-04-22 08:36:18', positionId: '203060670', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4757.345, sl: 4752.345, tp: 4795.000, exitPrice: 4752.345, commission: 0, swap: 0, profit: -5.00 },
  // Apr 23
  { openTime: '2026-04-23 06:46:26', closeTime: '2026-04-23 12:40:56', positionId: '203408436', symbol: 'EURUSDm', type: 'sell', volume: 0.02, entryPrice: 1.17082, sl: 1.17082, tp: null, exitPrice: 1.16959, commission: 0, swap: 0, profit: 2.46 },
  { openTime: '2026-04-23 10:13:58', closeTime: '2026-04-23 10:15:22', positionId: '203508058', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4685.848, sl: 4690.848, tp: 4645.000, exitPrice: 4690.848, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-23 10:43:53', closeTime: '2026-04-23 10:57:40', positionId: '203520039', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4690.677, sl: 4695.677, tp: 4669.000, exitPrice: 4695.677, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-23 12:44:50', closeTime: '2026-04-23 12:45:56', positionId: '203569412', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4739.954, sl: 4737.659, tp: null, exitPrice: 4737.659, commission: 0, swap: 0, profit: -2.29 },
  // Apr 24
  { openTime: '2026-04-24 06:28:41', closeTime: '2026-04-24 09:38:41', positionId: '203817957', symbol: 'EURUSDm', type: 'sell', volume: 0.02, entryPrice: 1.16788, sl: 1.17038, tp: null, exitPrice: 1.16881, commission: 0, swap: 0, profit: -1.86 },
  { openTime: '2026-04-24 07:49:05', closeTime: '2026-04-24 08:21:06', positionId: '203793927', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4691.000, sl: 4696.000, tp: null, exitPrice: 4696.000, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-24 09:38:50', closeTime: '2026-04-24 09:42:40', positionId: '203877151', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4683.342, sl: 4686.562, tp: null, exitPrice: 4686.562, commission: 0, swap: 0, profit: -3.22 },
  // Apr 27
  { openTime: '2026-04-27 05:05:08', closeTime: '2026-04-27 07:11:26', positionId: '204259241', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4721.676, sl: 4721.676, tp: 4691.000, exitPrice: 4716.666, commission: 0, swap: 0, profit: 5.01 },
  { openTime: '2026-04-27 05:08:06', closeTime: '2026-04-27 08:35:26', positionId: '204259696', symbol: 'EURUSDm', type: 'buy', volume: 0.02, entryPrice: 1.17278, sl: 1.17028, tp: null, exitPrice: 1.17413, commission: 0, swap: 0, profit: 2.70 },
  { openTime: '2026-04-27 08:35:40', closeTime: '2026-04-27 08:44:27', positionId: '204310859', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4709.293, sl: 4711.793, tp: 4696.793, exitPrice: 4711.793, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-27 08:45:11', closeTime: '2026-04-27 08:48:23', positionId: '204314939', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4711.680, sl: 4716.680, tp: null, exitPrice: 4713.975, commission: 0, swap: 0, profit: -2.30 },
  { openTime: '2026-04-27 08:50:56', closeTime: '2026-04-27 12:16:44', positionId: '204317470', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4711.394, sl: 4716.394, tp: 4691.000, exitPrice: 4711.075, commission: 0, swap: 0, profit: 0.31 },
  { openTime: '2026-04-27 13:05:33', closeTime: '2026-04-27 13:10:53', positionId: '204406854', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4693.732, sl: 4698.732, tp: null, exitPrice: 4698.732, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-27 14:00:23', closeTime: '2026-04-27 15:00:55', positionId: '204435786', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4694.046, sl: 4700.366, tp: null, exitPrice: 4679.497, commission: 0, swap: 0, profit: 14.55 },
  { openTime: '2026-04-27 15:06:02', closeTime: '2026-04-27 15:11:00', positionId: '204475315', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4671.349, sl: 4676.349, tp: null, exitPrice: 4676.349, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-27 15:21:10', closeTime: '2026-04-27 15:29:41', positionId: '204482804', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4677.967, sl: 4680.467, tp: 4596.967, exitPrice: 4680.467, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-27 15:36:52', closeTime: '2026-04-27 15:41:07', positionId: '204489438', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4678.231, sl: 4680.731, tp: null, exitPrice: 4680.731, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-27 16:00:32', closeTime: '2026-04-27 16:05:09', positionId: '204497602', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4668.939, sl: 4671.439, tp: 4653.939, exitPrice: 4671.439, commission: 0, swap: 0, profit: -5.00 },
  // Apr 28
  { openTime: '2026-04-28 07:08:36', closeTime: '2026-04-28 07:48:32', positionId: '204655239', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4635.087, sl: 4640.087, tp: null, exitPrice: 4627.284, commission: 0, swap: 0, profit: 15.60 },
  { openTime: '2026-04-28 07:49:00', closeTime: '2026-04-28 07:57:26', positionId: '204667052', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4627.621, sl: 4630.121, tp: null, exitPrice: 4630.121, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-28 08:03:08', closeTime: '2026-04-28 08:06:59', positionId: '204673579', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4620.465, sl: 4622.965, tp: null, exitPrice: 4622.965, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-28 08:07:34', closeTime: '2026-04-28 08:09:04', positionId: '204676158', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4619.661, sl: 4622.161, tp: null, exitPrice: 4622.161, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-28 08:17:11', closeTime: '2026-04-28 08:19:07', positionId: '204680204', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4621.256, sl: 4623.756, tp: null, exitPrice: 4623.756, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-28 08:46:34', closeTime: '2026-04-28 09:39:42', positionId: '204690184', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4628.546, sl: 4631.046, tp: null, exitPrice: 4610.349, commission: 0, swap: 0, profit: 36.39 },
  { openTime: '2026-04-28 09:51:47', closeTime: '2026-04-28 10:19:49', positionId: '204715129', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4612.683, sl: 4615.183, tp: null, exitPrice: 4615.183, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-28 11:22:42', closeTime: '2026-04-28 11:23:35', positionId: '204747253', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4598.220, sl: null, tp: null, exitPrice: 4602.263, commission: 0, swap: 0, profit: -8.09 },
  { openTime: '2026-04-28 11:30:50', closeTime: '2026-04-28 12:12:17', positionId: '204750874', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4596.283, sl: 4579.283, tp: null, exitPrice: 4579.283, commission: 0, swap: 0, profit: 34.00 },
  { openTime: '2026-04-28 13:00:13', closeTime: '2026-04-28 13:42:25', positionId: '204800912', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4591.219, sl: 4582.219, tp: 4558.219, exitPrice: 4582.219, commission: 0, swap: 0, profit: 18.00 },
  { openTime: '2026-04-28 14:00:24', closeTime: '2026-04-28 14:04:59', positionId: '204834025', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4578.156, sl: 4580.656, tp: 4565.656, exitPrice: 4565.656, commission: 0, swap: 0, profit: 25.00 },
  { openTime: '2026-04-28 14:55:19', closeTime: '2026-04-28 14:55:54', positionId: '204865943', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4560.983, sl: null, tp: null, exitPrice: 4566.301, commission: 0, swap: 0, profit: -10.63 },
  { openTime: '2026-04-28 17:08:24', closeTime: '2026-04-28 17:11:47', positionId: '204905559', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4590.753, sl: 4593.253, tp: 4561.753, exitPrice: 4593.253, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-28 18:56:31', closeTime: '2026-04-28 19:01:07', positionId: '204930322', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4593.732, sl: 4596.232, tp: 4581.232, exitPrice: 4596.232, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-28 19:54:32', closeTime: '2026-04-28 20:04:48', positionId: '204939340', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4594.615, sl: 4597.115, tp: 4579.615, exitPrice: 4597.115, commission: 0, swap: 0, profit: -5.00 },
  // Apr 29
  { openTime: '2026-04-29 05:39:00', closeTime: '2026-04-29 05:40:57', positionId: '205027413', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4594.414, sl: 4596.914, tp: 4581.914, exitPrice: 4596.914, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 05:51:35', closeTime: '2026-04-29 05:53:27', positionId: '205030885', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4602.966, sl: 4600.466, tp: 4620.966, exitPrice: 4600.466, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 06:11:36', closeTime: '2026-04-29 07:10:05', positionId: '205037357', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4590.372, sl: 4590.372, tp: 4579.000, exitPrice: 4579.000, commission: 0, swap: 0, profit: 22.74 },
  { openTime: '2026-04-29 07:23:49', closeTime: '2026-04-29 08:20:06', positionId: '205059639', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4577.672, sl: 4580.172, tp: 4558.000, exitPrice: 4569.635, commission: 0, swap: 0, profit: 16.07 },
  { openTime: '2026-04-29 08:29:51', closeTime: '2026-04-29 08:46:00', positionId: '205086192', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4567.762, sl: 4570.262, tp: 4557.000, exitPrice: 4570.262, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 09:07:35', closeTime: '2026-04-29 09:18:07', positionId: '205102867', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4574.464, sl: 4576.964, tp: 4557.000, exitPrice: 4576.964, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 09:48:17', closeTime: '2026-04-29 10:03:39', positionId: '205118920', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4559.287, sl: 4561.787, tp: null, exitPrice: 4561.787, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 10:18:50', closeTime: '2026-04-29 10:21:21', positionId: '205133825', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4571.254, sl: 4568.754, tp: 4583.000, exitPrice: 4568.754, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 10:23:15', closeTime: '2026-04-29 10:25:00', positionId: '205135095', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4569.433, sl: 4571.933, tp: null, exitPrice: 4571.933, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 10:38:08', closeTime: '2026-04-29 12:51:55', positionId: '205140456', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4571.034, sl: 4564.034, tp: 4551.034, exitPrice: 4551.034, commission: 0, swap: 0, profit: 40.00 },
  { openTime: '2026-04-29 13:06:51', closeTime: '2026-04-29 13:13:02', positionId: '205202008', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4548.137, sl: 4550.637, tp: 4489.137, exitPrice: 4550.637, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 13:39:50', closeTime: '2026-04-29 13:41:06', positionId: '205222805', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4525.365, sl: 4527.865, tp: null, exitPrice: 4521.150, commission: 0, swap: 0, profit: 8.43 },
  { openTime: '2026-04-29 13:41:36', closeTime: '2026-04-29 13:55:39', positionId: '205224441', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4522.122, sl: 4524.622, tp: 4508.000, exitPrice: 4524.622, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 14:06:25', closeTime: '2026-04-29 14:13:03', positionId: '205241858', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4524.912, sl: 4527.412, tp: 4508.912, exitPrice: 4527.412, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 14:23:57', closeTime: '2026-04-29 14:33:15', positionId: '205251823', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4536.282, sl: 4538.782, tp: 4500.282, exitPrice: 4538.782, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 14:53:59', closeTime: '2026-04-29 14:54:29', positionId: '205268234', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4534.173, sl: 4536.673, tp: null, exitPrice: 4536.673, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 15:14:05', closeTime: '2026-04-29 15:17:14', positionId: '205278806', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4538.822, sl: 4541.322, tp: 4526.322, exitPrice: 4541.322, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 16:02:58', closeTime: '2026-04-29 16:03:22', positionId: '205282647', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4559.000, sl: 4561.500, tp: 4511.000, exitPrice: 4561.500, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 16:02:58', closeTime: '2026-04-29 16:03:22', positionId: '205282802', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4559.000, sl: 4561.500, tp: 4511.000, exitPrice: 4561.500, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 16:09:41', closeTime: '2026-04-29 16:12:33', positionId: '205306160', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4560.849, sl: 4558.349, tp: null, exitPrice: 4558.349, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 16:13:12', closeTime: '2026-04-29 16:15:28', positionId: '205308124', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4557.787, sl: 4560.287, tp: null, exitPrice: 4560.287, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 16:24:09', closeTime: '2026-04-29 16:30:00', positionId: '205311749', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4562.129, sl: 4559.629, tp: 4583.000, exitPrice: 4559.629, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 16:33:19', closeTime: '2026-04-29 18:36:19', positionId: '205315327', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4553.282, sl: 4535.282, tp: 4515.000, exitPrice: 4535.282, commission: 0, swap: 0, profit: 36.00 },
  { openTime: '2026-04-29 19:41:14', closeTime: '2026-04-29 19:46:42', positionId: '205395365', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4540.667, sl: 4543.167, tp: null, exitPrice: 4543.167, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 20:27:23', closeTime: '2026-04-29 20:31:05', positionId: '205405669', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4543.449, sl: 4545.949, tp: null, exitPrice: 4545.949, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 20:33:18', closeTime: '2026-04-29 20:39:27', positionId: '205407193', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4543.737, sl: 4546.237, tp: null, exitPrice: 4546.237, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-29 23:48:05', closeTime: '2026-04-29 23:52:03', positionId: '205382082', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4557.000, sl: 4559.500, tp: null, exitPrice: 4559.500, commission: 0, swap: 0, profit: -5.00 },
  // Apr 30
  { openTime: '2026-04-30 04:25:46', closeTime: '2026-04-30 05:08:03', positionId: '205468080', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4549.939, sl: 4552.439, tp: 4520.939, exitPrice: 4552.439, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 06:52:57', closeTime: '2026-04-30 06:55:12', positionId: '205501356', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4583.000, sl: 4585.500, tp: null, exitPrice: 4585.500, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 06:57:50', closeTime: '2026-04-30 06:58:06', positionId: '205512158', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4587.840, sl: null, tp: null, exitPrice: 4589.930, commission: 0, swap: 0, profit: -4.18 },
  { openTime: '2026-04-30 06:58:18', closeTime: '2026-04-30 07:00:16', positionId: '205512590', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4590.674, sl: 4588.174, tp: 4618.000, exitPrice: 4588.174, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 07:34:51', closeTime: '2026-04-30 08:19:54', positionId: '205527384', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4588.959, sl: 4588.959, tp: null, exitPrice: 4614.559, commission: 0, swap: 0, profit: 51.20 },
  { openTime: '2026-04-30 08:33:34', closeTime: '2026-04-30 08:37:00', positionId: '205559093', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4617.136, sl: 4614.636, tp: null, exitPrice: 4614.636, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 09:42:02', closeTime: '2026-04-30 11:33:20', positionId: '205587048', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4619.461, sl: 4628.461, tp: 4667.461, exitPrice: 4628.461, commission: 0, swap: 0, profit: 18.00 },
  { openTime: '2026-04-30 12:13:31', closeTime: '2026-04-30 12:16:21', positionId: '205655806', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4635.087, sl: null, tp: null, exitPrice: 4630.796, commission: 0, swap: 0, profit: -8.58 },
  { openTime: '2026-04-30 13:04:17', closeTime: '2026-04-30 13:05:37', positionId: '205682068', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4642.869, sl: null, tp: null, exitPrice: 4638.804, commission: 0, swap: 0, profit: -8.13 },
  { openTime: '2026-04-30 13:10:01', closeTime: '2026-04-30 13:10:45', positionId: '205685322', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4640.187, sl: 4637.687, tp: null, exitPrice: 4637.687, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 13:38:03', closeTime: '2026-04-30 13:41:46', positionId: '205644093', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4624.000, sl: 4621.500, tp: 4668.000, exitPrice: 4621.500, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 13:54:57', closeTime: '2026-04-30 14:01:14', positionId: '205715711', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4613.691, sl: 4616.191, tp: null, exitPrice: 4616.191, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 14:09:14', closeTime: '2026-04-30 14:09:54', positionId: '205726334', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4618.884, sl: 4621.384, tp: null, exitPrice: 4621.384, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 14:17:47', closeTime: '2026-04-30 14:18:26', positionId: '205732298', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4619.242, sl: 4621.742, tp: null, exitPrice: 4621.742, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 15:31:48', closeTime: '2026-04-30 15:33:40', positionId: '205766506', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4624.190, sl: 4621.690, tp: null, exitPrice: 4621.690, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 15:36:22', closeTime: '2026-04-30 15:38:04', positionId: '205767997', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4622.668, sl: 4617.668, tp: null, exitPrice: 4617.668, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 15:36:32', closeTime: '2026-04-30 15:38:23', positionId: '205768081', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4622.298, sl: 4617.298, tp: null, exitPrice: 4617.298, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 15:43:38', closeTime: '2026-04-30 17:11:34', positionId: '205771148', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4615.120, sl: 4620.120, tp: null, exitPrice: 4620.120, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 15:43:42', closeTime: '2026-04-30 17:21:00', positionId: '205771170', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4615.397, sl: 4620.397, tp: null, exitPrice: 4620.397, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 17:21:40', closeTime: '2026-04-30 18:56:39', positionId: '205805471', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4619.680, sl: 4614.680, tp: 4644.000, exitPrice: 4624.096, commission: 0, swap: 0, profit: 4.42 },
  { openTime: '2026-04-30 17:21:49', closeTime: '2026-04-30 17:29:06', positionId: '205805499', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4619.845, sl: 4614.845, tp: null, exitPrice: 4614.845, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 18:09:46', closeTime: '2026-04-30 18:14:47', positionId: '205816453', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4622.844, sl: 4620.344, tp: 4644.000, exitPrice: 4620.344, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 18:16:03', closeTime: '2026-04-30 18:16:09', positionId: '205817908', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4622.240, sl: null, tp: null, exitPrice: 4622.345, commission: 0, swap: 0, profit: 0.11 },
  { openTime: '2026-04-30 18:16:15', closeTime: '2026-04-30 18:29:34', positionId: '205817972', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4622.849, sl: 4620.349, tp: 46244.000, exitPrice: 4620.349, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-04-30 18:56:53', closeTime: '2026-04-30 19:20:00', positionId: '205825827', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4623.883, sl: 4621.383, tp: 4644.000, exitPrice: 4621.383, commission: 0, swap: 0, profit: -5.00 },
  // May 1
  { openTime: '2026-05-01 03:55:03', closeTime: '2026-05-01 04:07:15', positionId: '205893835', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4626.156, sl: 4623.656, tp: null, exitPrice: 4623.656, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 04:56:16', closeTime: '2026-05-01 05:08:29', positionId: '205902540', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4611.310, sl: 4613.810, tp: null, exitPrice: 4613.810, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 05:12:39', closeTime: '2026-05-01 05:18:02', positionId: '205905670', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4614.459, sl: 4611.959, tp: 4630.000, exitPrice: 4611.959, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 05:12:44', closeTime: '2026-05-01 05:17:38', positionId: '205905682', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4614.604, sl: 4612.104, tp: 4630.000, exitPrice: 4612.104, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 05:19:42', closeTime: '2026-05-01 05:21:59', positionId: '205906714', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4612.765, sl: 4615.265, tp: null, exitPrice: 4615.265, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 05:22:33', closeTime: '2026-05-01 05:27:00', positionId: '205907225', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4615.169, sl: 4612.669, tp: null, exitPrice: 4612.669, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 05:43:50', closeTime: '2026-05-01 05:48:40', positionId: '205910863', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4610.437, sl: 4612.937, tp: null, exitPrice: 4612.937, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 05:53:07', closeTime: '2026-05-01 08:32:25', positionId: '205912978', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4610.791, sl: 4570.291, tp: 4560.000, exitPrice: 4570.291, commission: 0, swap: 0, profit: 81.00 },
  { openTime: '2026-05-01 08:51:18', closeTime: '2026-05-01 09:22:52', positionId: '205973352', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4568.046, sl: 4570.546, tp: 4544.000, exitPrice: 4570.546, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 11:05:43', closeTime: '2026-05-01 11:09:02', positionId: '206012561', symbol: 'XAUUSDm', type: 'sell', volume: 0.02, entryPrice: 4565.625, sl: 4568.125, tp: 4544.000, exitPrice: 4568.125, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 11:14:54', closeTime: '2026-05-01 11:18:39', positionId: '206015085', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4565.941, sl: 4570.941, tp: null, exitPrice: 4570.941, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 11:31:11', closeTime: '2026-05-01 11:41:16', positionId: '206021868', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4572.767, sl: 4577.767, tp: null, exitPrice: 4577.767, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 12:05:47', closeTime: '2026-05-01 13:31:40', positionId: '206032478', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4578.966, sl: 4578.966, tp: 4616.000, exitPrice: 4593.602, commission: 0, swap: 0, profit: 14.63 },
  { openTime: '2026-05-01 12:16:03', closeTime: '2026-05-01 12:43:09', positionId: '206038593', symbol: 'XAUUSDm', type: 'buy', volume: 0.02, entryPrice: 4585.413, sl: 4590.413, tp: null, exitPrice: 4590.413, commission: 0, swap: 0, profit: 10.00 },
  { openTime: '2026-05-01 12:49:24', closeTime: '2026-05-01 13:29:23', positionId: '206060759', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4592.315, sl: 4587.315, tp: 4629.000, exitPrice: 4587.315, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 13:32:23', closeTime: '2026-05-01 14:19:11', positionId: '206078372', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4593.231, sl: 4650.000, tp: null, exitPrice: 4650.000, commission: 0, swap: 0, profit: 56.77 },
  { openTime: '2026-05-01 13:32:28', closeTime: '2026-05-01 14:25:26', positionId: '206078440', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4592.795, sl: 4647.000, tp: null, exitPrice: 4647.000, commission: 0, swap: 0, profit: 54.20 },
  { openTime: '2026-05-01 14:39:38', closeTime: '2026-05-01 14:41:00', positionId: '206128634', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4641.777, sl: null, tp: null, exitPrice: 4636.045, commission: 0, swap: 0, profit: -5.73 },
  { openTime: '2026-05-01 14:39:41', closeTime: '2026-05-01 14:40:11', positionId: '206128652', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4642.153, sl: 4637.153, tp: null, exitPrice: 4637.153, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 15:07:09', closeTime: '2026-05-01 15:50:35', positionId: '206130351', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4620.000, sl: 4635.000, tp: 4679.000, exitPrice: 4633.552, commission: 0, swap: 0, profit: 13.55 },
  { openTime: '2026-05-01 15:07:09', closeTime: '2026-05-01 15:46:10', positionId: '206130526', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4620.000, sl: 4608.000, tp: 4645.000, exitPrice: 4645.000, commission: 0, swap: 0, profit: 25.00 },
  { openTime: '2026-05-01 15:49:12', closeTime: '2026-05-01 15:50:30', positionId: '206157020', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4645.749, sl: 4640.749, tp: 4695.749, exitPrice: 4640.749, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 16:09:10', closeTime: '2026-05-01 16:30:02', positionId: '206163310', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4641.640, sl: 4636.640, tp: null, exitPrice: 4636.640, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 16:09:15', closeTime: '2026-05-01 16:30:01', positionId: '206163327', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4642.182, sl: 4637.182, tp: null, exitPrice: 4637.182, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 17:43:12', closeTime: '2026-05-01 18:05:09', positionId: '206172737', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4628.000, sl: 4623.000, tp: null, exitPrice: 4623.000, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 17:43:12', closeTime: '2026-05-01 18:05:09', positionId: '206172856', symbol: 'XAUUSDm', type: 'buy', volume: 0.01, entryPrice: 4628.000, sl: 4623.000, tp: null, exitPrice: 4623.000, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 18:16:35', closeTime: '2026-05-01 18:21:07', positionId: '206198743', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4615.638, sl: 4620.638, tp: null, exitPrice: 4620.638, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 18:16:39', closeTime: '2026-05-01 18:21:01', positionId: '206198787', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4615.147, sl: 4620.147, tp: null, exitPrice: 4620.147, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 18:27:30', closeTime: '2026-05-01 18:50:39', positionId: '206201812', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4620.427, sl: 4625.427, tp: 4595.427, exitPrice: 4625.427, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 18:27:37', closeTime: '2026-05-01 18:50:39', positionId: '206201824', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4620.404, sl: 4625.404, tp: 4595.404, exitPrice: 4625.404, commission: 0, swap: 0, profit: -5.00 },
  { openTime: '2026-05-01 19:33:32', closeTime: '2026-05-01 20:43:57', positionId: '206215042', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4618.438, sl: 4618.438, tp: null, exitPrice: 4614.500, commission: 0, swap: 0, profit: 3.94 },
  { openTime: '2026-05-01 19:33:39', closeTime: '2026-05-01 20:44:01', positionId: '206215059', symbol: 'XAUUSDm', type: 'sell', volume: 0.01, entryPrice: 4618.451, sl: 4618.451, tp: null, exitPrice: 4614.208, commission: 0, swap: 0, profit: 4.24 },
];

// Deals from the report
const deals: Deal[] = [
  { time: '2026-04-19 18:28:44', symbol: '', dealType: 'balance', direction: '', volume: 0, price: 0, profit: 50.00, balance: 50.00, comment: 'D-ALLINT-USD-INT-697259687941' },
];

// Run evaluation
evaluate(accountInfo, positions, deals);
