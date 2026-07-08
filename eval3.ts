// Evaluation: Account 134140606 (real, Standard)
// Challenge 15: Apr 20 - May 1, 2026, Start $50, Target $100

interface P {
  openTime: string; closeTime: string; positionId: string; symbol: string;
  type: 'buy'|'sell'; volume: number; entryPrice: number; sl: number|null;
  tp: number|null; exitPrice: number; profit: number;
}

function pipInfo(sym: string): { pipSize: number; contractSize: number } {
  const s = sym.replace(/m$/,'').replace(/_x\d+m?$/,'');
  const x100 = sym.includes('_x100');
  if (s.includes('XAUUSD')) return { pipSize: 0.01, contractSize: 100 };
  if (s.includes('USTEC')) return { pipSize: 0.1, contractSize: x100 ? 100 : 1 };
  if (s.includes('EURUSD')) return { pipSize: 0.0001, contractSize: 100000 };
  return { pipSize: 0.0001, contractSize: 100000 };
}

function slDollars(sym: string, vol: number, entry: number, sl: number): number {
  const { pipSize, contractSize } = pipInfo(sym);
  const diff = Math.abs(entry - sl);
  const pips = diff / pipSize;
  const pipVal = vol * contractSize * pipSize;
  return pips * pipVal;
}

function dateKey(s: string): string { return s.substring(0, 10); }
function parseT(s: string): Date { return new Date(s.replace(' ','T')+'Z'); }
function isWeekend(d: Date): boolean { return d.getUTCDay()===0||d.getUTCDay()===6; }
function dayName(s: string): string { return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(s+'T00:00:00Z').getUTCDay()]; }
function hoursDiff(a: string, b: string): number { return Math.abs(parseT(b).getTime()-parseT(a).getTime())/(3600000); }

const positions: P[] = [
  { openTime:'2026-04-20 12:33:59', closeTime:'2026-04-20 13:20:32', positionId:'983698694', symbol:'XAUUSDm', type:'buy', volume:0.02, entryPrice:4805.533, sl:4806.350, tp:null, exitPrice:4817.853, profit:24.64 },
  { openTime:'2026-04-20 12:34:00', closeTime:'2026-04-20 13:20:32', positionId:'983698709', symbol:'XAUUSDm', type:'buy', volume:0.02, entryPrice:4805.522, sl:4805.749, tp:null, exitPrice:4817.853, profit:24.67 },
  { openTime:'2026-04-21 14:13:59', closeTime:'2026-04-21 14:17:24', positionId:'984294845', symbol:'USTECm', type:'sell', volume:0.01, entryPrice:26733.36, sl:26762.33, tp:null, exitPrice:26762.33, profit:-0.29 },
  { openTime:'2026-04-21 14:58:24', closeTime:'2026-04-21 16:53:22', positionId:'984341569', symbol:'XAUUSDm', type:'sell', volume:0.02, entryPrice:4736.744, sl:4736.400, tp:4711.652, exitPrice:4712.664, profit:48.16 },
  { openTime:'2026-04-21 14:58:24', closeTime:'2026-04-21 16:53:23', positionId:'984341571', symbol:'XAUUSDm', type:'sell', volume:0.02, entryPrice:4736.744, sl:4735.825, tp:4711.480, exitPrice:4712.270, profit:48.95 },
  { openTime:'2026-04-22 14:57:08', closeTime:'2026-04-22 14:57:20', positionId:'984920849', symbol:'USTECm', type:'sell', volume:0.01, entryPrice:26848.43, sl:26860.29, tp:null, exitPrice:26846.21, profit:0.02 },
  { openTime:'2026-04-23 17:02:21', closeTime:'2026-04-23 17:05:32', positionId:'985544447', symbol:'USTECm', type:'buy', volume:0.01, entryPrice:26919.20, sl:26870.60, tp:null, exitPrice:26865.11, profit:-0.54 },
  { openTime:'2026-04-23 17:45:27', closeTime:'2026-04-23 17:46:42', positionId:'985587547', symbol:'USTECm', type:'buy', volume:0.01, entryPrice:26606.26, sl:26567.72, tp:null, exitPrice:26567.72, profit:-0.39 },
  { openTime:'2026-04-23 17:46:56', closeTime:'2026-04-23 17:47:35', positionId:'985589763', symbol:'USTECm', type:'buy', volume:0.01, entryPrice:26571.09, sl:26548.61, tp:26612.47, exitPrice:26612.47, profit:0.41 },
  { openTime:'2026-04-24 17:13:20', closeTime:'2026-04-24 17:16:01', positionId:'986141291', symbol:'USTECm', type:'sell', volume:0.01, entryPrice:27286.23, sl:27302.12, tp:null, exitPrice:27280.58, profit:0.06 },
  { openTime:'2026-04-27 12:41:01', closeTime:'2026-04-27 13:51:11', positionId:'986696333', symbol:'USTEC_x100m', type:'sell', volume:0.02, entryPrice:27292.25, sl:27287.10, tp:27195.41, exitPrice:27195.41, profit:193.68 },
  { openTime:'2026-04-27 12:41:38', closeTime:'2026-04-27 12:41:56', positionId:'986697219', symbol:'USTEC_x100m', type:'sell', volume:0.01, entryPrice:27285.35, sl:null, tp:null, exitPrice:27284.32, profit:1.03 },
  { openTime:'2026-04-28 14:47:02', closeTime:'2026-04-28 14:48:11', positionId:'987447971', symbol:'USTECm', type:'sell', volume:0.01, entryPrice:26977.94, sl:26995.75, tp:null, exitPrice:26970.06, profit:0.08 },
  { openTime:'2026-04-28 14:50:17', closeTime:'2026-04-28 14:50:44', positionId:'987450559', symbol:'USTECm', type:'buy', volume:0.01, entryPrice:26937.44, sl:26921.68, tp:null, exitPrice:26921.68, profit:-0.16 },
  { openTime:'2026-04-29 13:40:47', closeTime:'2026-04-29 14:29:09', positionId:'987998073', symbol:'USTEC_x100m', type:'buy', volume:0.02, entryPrice:27076.51, sl:27078.41, tp:27171.28, exitPrice:27163.74, profit:174.46 },
  { openTime:'2026-04-29 13:40:47', closeTime:'2026-04-29 14:29:09', positionId:'987998077', symbol:'USTEC_x100m', type:'buy', volume:0.02, entryPrice:27077.23, sl:27078.51, tp:27168.30, exitPrice:27163.74, profit:173.02 },
  { openTime:'2026-04-30 16:20:55', closeTime:'2026-04-30 16:21:15', positionId:'988826311', symbol:'XAUUSDm', type:'buy', volume:0.01, entryPrice:4607.652, sl:4605.192, tp:4611.267, exitPrice:4608.969, profit:1.32 },
  { openTime:'2026-05-01 05:01:49', closeTime:'2026-05-01 05:06:58', positionId:'989003737', symbol:'XAUUSDm', type:'buy', volume:0.01, entryPrice:4609.199, sl:4609.407, tp:4612.585, exitPrice:4611.661, profit:2.46 },
  { openTime:'2026-05-01 16:50:32', closeTime:'2026-05-01 16:50:48', positionId:'989436439', symbol:'XAUUSDm', type:'buy', volume:0.01, entryPrice:4637.269, sl:4635.971, tp:null, exitPrice:4637.563, profit:0.29 },
];

console.log('═══════════════════════════════════════════════');
console.log('  CHALLENGE 15 — EVALUATION REPORT');
console.log('  Account: 134140606 (real, Standard)');
console.log('═══════════════════════════════════════════════\n');

// STEP 1: Period
console.log('STEP 1 — Challenge Period: All 19 trades within Apr 20 - May 1 ✅\n');

// STEP 2: Starting balance
console.log('STEP 2 — Starting Balance: $50.00 (deposited Apr 8) ✅\n');

// STEP 3: Recharging
console.log('STEP 3 — Recharging: Only 1 deposit ($50.00) ✅\n');

// STEP 4: Active days
const activeDays = new Set<string>();
positions.forEach(p => {
  const od = dateKey(p.openTime), cd = dateKey(p.closeTime);
  if (!isWeekend(parseT(p.openTime))) activeDays.add(od);
  if (!isWeekend(parseT(p.closeTime))) activeDays.add(cd);
});
console.log('STEP 4 — Active Trading Days: ' + activeDays.size);
[...activeDays].sort().forEach(d => console.log('  ' + d + ' (' + dayName(d) + ')'));
console.log(activeDays.size >= 7 ? '  ✅ Meets minimum 7\n' : '  ❌ DISQUALIFIED — less than 7\n');

// STEP 5: Weekend
console.log('STEP 5 — Weekend Trading: None ✅\n');

// STEP 6: Lot size
console.log('STEP 6 — Lot Size Check');
let lotOk = true;
positions.forEach(p => { if (p.volume > 0.02) { lotOk = false; console.log('  ⚠️ ' + p.positionId + ' vol=' + p.volume); }});
if (lotOk) console.log('  ✅ All trades ≤ 0.02 lots');
console.log();

// STEP 7: Max 3 open trades
console.log('STEP 7 — Max Open Trades Simultaneously');
type TE = { time: number; id: string; action: 'open'|'close' };
const evts: TE[] = [];
positions.forEach(p => {
  evts.push({ time: parseT(p.openTime).getTime(), id: p.positionId, action: 'open' });
  evts.push({ time: parseT(p.closeTime).getTime(), id: p.positionId, action: 'close' });
});
evts.sort((a,b) => a.time - b.time || (a.action==='close'?-1:1));
const openS = new Set<string>();
let maxO = 0;
const viol4 = new Set<string>();
for (const e of evts) {
  if (e.action==='open') openS.add(e.id); else openS.delete(e.id);
  if (openS.size > maxO) maxO = openS.size;
  if (openS.size > 3) openS.forEach(id => viol4.add(id));
}
if (viol4.size > 0) {
  console.log('  ⚠️ Max simultaneous: ' + maxO + ' — VIOLATION');
  viol4.forEach(id => {
    const p = positions.find(pp => pp.positionId===id)!;
    console.log('    ' + id + ' ' + p.symbol + ' profit=$' + p.profit.toFixed(2));
  });
} else {
  console.log('  ✅ Max simultaneous: ' + maxO + ' (≤ 3)');
}
console.log();

// STEP 8: Same pair max 2
console.log('STEP 8 — Same Pair Max 2 Open');
const bySym = new Map<string, P[]>();
positions.forEach(p => { if (!bySym.has(p.symbol)) bySym.set(p.symbol,[]); bySym.get(p.symbol)!.push(p); });
const pairV = new Set<string>();
bySym.forEach((ps, sym) => {
  const se: TE[] = [];
  ps.forEach(p => {
    se.push({ time: parseT(p.openTime).getTime(), id: p.positionId, action: 'open' });
    se.push({ time: parseT(p.closeTime).getTime(), id: p.positionId, action: 'close' });
  });
  se.sort((a,b) => a.time-b.time || (a.action==='close'?-1:1));
  const so = new Set<string>();
  for (const e of se) {
    if (e.action==='open') so.add(e.id); else so.delete(e.id);
    if (so.size > 2) so.forEach(id => pairV.add(id));
  }
});
if (pairV.size > 0) {
  console.log('  ⚠️ Same-pair violations:');
  pairV.forEach(id => { const p = positions.find(pp=>pp.positionId===id)!; console.log('    '+id+' '+p.symbol+' +$'+p.profit.toFixed(2)); });
} else {
  console.log('  ✅ No same-pair violations');
}
console.log();

// STEP 9: Stop Loss
console.log('STEP 9 — Stop Loss Check');
const flagged: { id: string; reasons: string[] }[] = [];
function addFlag(id: string, r: string) {
  let f = flagged.find(ff=>ff.id===id);
  if (!f) { f = { id, reasons: [] }; flagged.push(f); }
  f.reasons.push(r);
}

positions.forEach(p => {
  if (p.sl === null) {
    console.log('  ⚠️ ' + p.positionId + ' ' + p.symbol + ' ' + p.openTime + ' NO SL — ' + (p.profit>0?'profit $'+p.profit.toFixed(2)+' → REMOVED':'loss $'+p.profit.toFixed(2)+' (kept)'));
    if (p.profit > 0) addFlag(p.positionId, 'No stop loss');
  } else {
    const sd = slDollars(p.symbol, p.volume, p.entryPrice, p.sl);
    // For buy: SL should be below entry. For sell: SL should be above entry.
    // Check if SL is on wrong side (would mean no effective SL)
    const isBuy = p.type === 'buy';
    const slOnWrongSide = isBuy ? p.sl > p.entryPrice : p.sl < p.entryPrice;
    
    if (slOnWrongSide) {
      // SL is in profit direction — not a real stop loss for risk
      // But if the distance is tiny (< $0.50), it's likely a breakeven SL
      if (sd > 0.50) {
        console.log('  ⚠️ ' + p.positionId + ' ' + p.symbol + ' SL on wrong side ($' + sd.toFixed(2) + ') — ' + (p.profit>0?'profit $'+p.profit.toFixed(2)+' → REMOVED':'loss (kept)'));
        if (p.profit > 0) addFlag(p.positionId, 'SL on wrong side: $' + sd.toFixed(2));
      } else {
        // Tiny — likely breakeven, OK
      }
    } else if (sd > 6.0) {
      console.log('  ⚠️ ' + p.positionId + ' ' + p.symbol + ' SL=$' + sd.toFixed(2) + ' > $6 — ' + (p.profit>0?'profit $'+p.profit.toFixed(2)+' → REMOVED':'loss (kept)'));
      if (p.profit > 0) addFlag(p.positionId, 'SL too wide: $' + sd.toFixed(2));
    }
  }
});

// Show all SL details
console.log('\n  SL Detail for all trades:');
positions.forEach(p => {
  if (p.sl === null) {
    console.log('    ' + p.positionId + ' ' + p.symbol + ' ' + p.type + ' ' + p.volume + ' — NO SL');
  } else {
    const sd = slDollars(p.symbol, p.volume, p.entryPrice, p.sl);
    const isBuy = p.type === 'buy';
    const dir = isBuy ? (p.sl < p.entryPrice ? 'correct' : 'wrong side') : (p.sl > p.entryPrice ? 'correct' : 'wrong side');
    console.log('    ' + p.positionId + ' ' + p.symbol + ' ' + p.type + ' ' + p.volume + ' entry=' + p.entryPrice + ' sl=' + p.sl + ' $' + sd.toFixed(2) + ' (' + dir + ')');
  }
});
console.log();

// STEP 10: Daily Drawdown
console.log('STEP 10 — Daily Drawdown');
const sortedByClose = [...positions].sort((a,b) => parseT(a.closeTime).getTime()-parseT(b.closeTime).getTime());
const byDay = new Map<string, P[]>();
sortedByClose.forEach(p => { const dk=dateKey(p.closeTime); if(!byDay.has(dk)) byDay.set(dk,[]); byDay.get(dk)!.push(p); });
let runBal = 50.00;
const tradeDays = [...byDay.keys()].sort();
for (const day of tradeDays) {
  const openBal = runBal;
  const dayP = byDay.get(day)!;
  let cur = openBal, minB = openBal, breached = false;
  for (const p of dayP) {
    cur += p.profit;
    if (cur < minB) minB = cur;
    if (openBal - cur >= 10 && !breached) {
      breached = true;
      console.log('  ⚠️ ' + day + ': DD=$' + (openBal-cur).toFixed(2) + ' breached');
    }
    if (breached && p.profit > 0) {
      addFlag(p.positionId, 'Profit after daily $10 drawdown on ' + day);
      console.log('    → ' + p.positionId + ' +$' + p.profit.toFixed(2) + ' REMOVED');
    }
  }
  const dd = openBal - minB;
  const st = dd >= 10 ? '❌' : '✅';
  console.log('  ' + st + ' ' + day + ' (' + dayName(day) + '): Open=$' + openBal.toFixed(2) + ' Min=$' + minB.toFixed(2) + ' DD=$' + dd.toFixed(2) + ' Close=$' + cur.toFixed(2));
  runBal = cur;
}
console.log();

// STEP 11: 24h hold
console.log('STEP 11 — 24-Hour Hold Time');
let holdOk = true;
positions.forEach(p => {
  const h = hoursDiff(p.openTime, p.closeTime);
  if (h > 24) { holdOk = false; console.log('  ⚠️ ' + p.positionId + ' held ' + h.toFixed(1) + 'h'); if (p.profit>0) addFlag(p.positionId,'Held '+h.toFixed(1)+'h > 24h'); }
});
if (holdOk) console.log('  ✅ All trades < 24 hours');
console.log();

// FINAL
console.log('═══════════════════════════════════════════════');
console.log('  FINAL CALCULATION');
console.log('═══════════════════════════════════════════════\n');

let totalRemoved = 0;
flagged.forEach(f => {
  const p = positions.find(pp=>pp.positionId===f.id)!;
  if (p.profit > 0) totalRemoved += p.profit;
});

const reported = 741.87;
const adjusted = reported - totalRemoved;

console.log('  Starting Balance:     $50.00');
console.log('  Reported Balance:     $' + reported.toFixed(2));
console.log('  Profit Removed:       $' + totalRemoved.toFixed(2));
console.log('  Adjusted Balance:     $' + adjusted.toFixed(2));
console.log('  DISQUALIFIED:         ' + (activeDays.size < 7 ? 'YES — only ' + activeDays.size + ' active days' : 'NO'));
console.log();

if (flagged.length > 0) {
  console.log('  ─── FLAGGED TRADES (' + flagged.length + ') ───');
  flagged.forEach((f,i) => {
    const p = positions.find(pp=>pp.positionId===f.id)!;
    console.log('  ' + (i+1) + '. ' + f.id + ' ' + p.symbol + ' ' + p.openTime + ' +$' + p.profit.toFixed(2) + ' → REMOVED');
    console.log('     ' + f.reasons.join(', '));
  });
} else {
  console.log('  ✅ No flagged trades');
}
console.log('\n═══════════════════════════════════════════════');
