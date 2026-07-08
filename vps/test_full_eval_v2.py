"""
Full Evaluation v2 — Account 161585721 (tt) — Cent Account
Uses ALL trades from Deals section (31 closing deals)
Checks: Lot, SL required, SL risk, Hold time, Weekend, Max open, Pair limit, Fake SL, Daily loss cap
"""
import json, subprocess
from datetime import datetime, timedelta
from collections import defaultdict

CANDLES_URL = "http://108.181.184.223:8000/api/v1/candles"
API_KEY = "wp-k8x2m9f4v7j3n6q1w5t8r2y4u7i0p3"

MAX_LOT = 2.0
MAX_OPEN_TRADES = 4
PAIR_LIMIT = 2
MAX_RISK = 500  # cents
DAILY_LOSS_CAP = 250  # cents
MAX_HOLD_HOURS = 24
MIN_ACTIVE_DAYS = 4
SL_REQUIRED = True
WEEKEND_TRADING = False

def get_candles(symbol, timeframe, from_time, to_time):
    body = json.dumps({"symbol": symbol, "timeframe": timeframe, "from_time": from_time, "to_time": to_time, "api_key": API_KEY})
    r = subprocess.run(["curl","-s","-X","POST",CANDLES_URL,"-H","Content-Type: application/json","-d",body], capture_output=True, text=True, timeout=30)
    try: return json.loads(r.stdout)
    except: return {"success": False}

def get_contract(symbol):
    sym = symbol.rstrip("mczr").upper()
    if "XAUUSD" in sym: return 100
    elif "GBPUSD" in sym or "EURUSD" in sym or "AUDUSD" in sym or "NZDUSD" in sym: return 100000
    elif "USDJPY" in sym: return 100000
    else: return 100000

def max_sl_price(symbol, volume, entry, max_risk, is_buy):
    contract = get_contract(symbol)
    price_move = max_risk / (volume * contract)
    return entry - price_move if is_buy else entry + price_move

def select_tf(hold_min):
    if hold_min < 20: return "M1"
    elif hold_min < 60: return "M5"
    elif hold_min < 360: return "M15"
    elif hold_min < 1440: return "H1"
    else: return "H4"

def format_eat(iso_time):
    utc = datetime.fromisoformat(iso_time.replace("+00:00","").replace("Z",""))
    eat = utc + timedelta(hours=3)
    return f"{eat.hour:02d}:{eat.minute:02d} EAT"

def get_base_symbol(sym):
    return sym.rstrip("mczr").upper()

# ALL trades from the export (every position with open/close times and SL from Positions section)
# Position 320350275 was partially closed (0.05 at 15:29:59, 0.05 at 17:54:41)
trades = [
    {"id": 1, "sym": "XAUUSDc", "type": "buy", "vol": 0.1, "entry": 4561.726, "sl": 4551.958, "open": "2026-05-25 08:08:05", "close": "2026-05-25 09:01:29", "profit": -48.70},
    {"id": 2, "sym": "XAUUSDc", "type": "sell", "vol": 0.1, "entry": 4535.414, "sl": 4533.094, "open": "2026-05-26 04:27:52", "close": "2026-05-26 05:30:04", "profit": 23.20},
    {"id": 3, "sym": "EURUSDc", "type": "sell", "vol": 1.0, "entry": 1.16401, "sl": 1.16500, "open": "2026-05-26 08:12:33", "close": "2026-05-26 13:53:35", "profit": 200.00},
    {"id": 4, "sym": "XAUUSDc", "type": "sell", "vol": 0.1, "entry": 4540.014, "sl": 4534.936, "open": "2026-05-26 10:50:27", "close": "2026-05-26 11:35:46", "profit": 300.40},
    {"id": 5, "sym": "XAUUSDc", "type": "sell", "vol": 0.1, "entry": 4516.677, "sl": 4506.559, "open": "2026-05-26 14:26:14", "close": "2026-05-26 15:29:59", "profit": 49.90},  # partial close 1
    {"id": 6, "sym": "XAUUSDc", "type": "sell", "vol": 0.05, "entry": 4516.677, "sl": 4506.559, "open": "2026-05-26 14:26:14", "close": "2026-05-26 17:54:41", "profit": 100.60},  # partial close 2
    {"id": 7, "sym": "EURUSDc", "type": "sell", "vol": 0.5, "entry": 1.16398, "sl": 1.16396, "open": "2026-05-27 00:24:29", "close": "2026-05-27 10:45:10", "profit": 1.00},
    {"id": 8, "sym": "XAUUSDc", "type": "sell", "vol": 0.05, "entry": 4506.373, "sl": 4504.009, "open": "2026-05-27 05:16:39", "close": "2026-05-27 06:21:41", "profit": 100.60},
    {"id": 9, "sym": "XAUUSDc", "type": "sell", "vol": 0.1, "entry": 4489.247, "sl": 4486.139, "open": "2026-05-27 09:43:37", "close": "2026-05-27 10:39:45", "profit": 230.90},
    {"id": 10, "sym": "XAUUSDc", "type": "sell", "vol": 0.1, "entry": 4371.425, "sl": 4381.316, "open": "2026-05-28 04:23:33", "close": "2026-05-28 05:30:24", "profit": -98.90},
    {"id": 11, "sym": "XAUUSDc", "type": "sell", "vol": 0.1, "entry": 4371.877, "sl": 4381.523, "open": "2026-05-28 04:48:51", "close": "2026-05-28 05:30:36", "profit": -96.40},
    {"id": 12, "sym": "XAUUSDc", "type": "sell", "vol": 0.05, "entry": 4390.467, "sl": 4385.068, "open": "2026-05-28 05:45:02", "close": "2026-05-28 06:23:03", "profit": 27.00},
    {"id": 13, "sym": "XAUUSDc", "type": "sell", "vol": 0.05, "entry": 4387.522, "sl": 4387.230, "open": "2026-05-28 07:49:34", "close": "2026-05-28 07:59:16", "profit": 1.40},
    {"id": 14, "sym": "XAUUSDc", "type": "sell", "vol": 0.05, "entry": 4387.950, "sl": 4397.716, "open": "2026-05-28 07:59:47", "close": "2026-05-28 09:21:50", "profit": -48.80},
    {"id": 15, "sym": "XAUUSDc", "type": "sell", "vol": 0.05, "entry": 4394.253, "sl": 4400.352, "open": "2026-05-28 10:03:33", "close": "2026-05-28 10:09:35", "profit": -30.50},
    {"id": 16, "sym": "EURUSDc", "type": "sell", "vol": 0.75, "entry": 1.16532, "sl": 1.16400, "open": "2026-05-29 06:58:09", "close": "2026-05-29 08:55:28", "profit": 200.25},
    {"id": 17, "sym": "EURUSDc", "type": "sell", "vol": 0.75, "entry": 1.16481, "sl": 1.16414, "open": "2026-05-29 07:15:10", "close": "2026-05-29 09:58:16", "profit": 50.25},
    {"id": 18, "sym": "XAUUSDc", "type": "sell", "vol": 0.05, "entry": 4512.361, "sl": 4532.368, "open": "2026-05-29 07:29:15", "close": "2026-05-29 08:19:04", "profit": -36.90},
    {"id": 19, "sym": "EURUSDc", "type": "sell", "vol": 1.0, "entry": 1.16429, "sl": 1.16529, "open": "2026-05-29 10:40:19", "close": "2026-05-29 13:21:17", "profit": -87.00},
    {"id": 20, "sym": "EURUSDc", "type": "sell", "vol": 0.5, "entry": 1.16451, "sl": 1.16552, "open": "2026-05-29 12:15:09", "close": "2026-05-29 13:39:05", "profit": -25.64},
    {"id": 21, "sym": "GBPUSDc", "type": "sell", "vol": 1.0, "entry": 1.34380, "sl": 1.34478, "open": "2026-05-29 13:16:36", "close": "2026-05-29 13:24:53", "profit": -28.81},
    {"id": 22, "sym": "XAUUSDc", "type": "buy", "vol": 0.2, "entry": 4523.658, "sl": 4524.056, "open": "2026-05-29 13:17:01", "close": "2026-05-29 13:35:27", "profit": 7.90},
    {"id": 23, "sym": "XAUUSDc", "type": "buy", "vol": 0.3, "entry": 4524.167, "sl": 4524.459, "open": "2026-05-29 13:36:07", "close": "2026-05-29 13:39:05", "profit": 233.50},
    {"id": 24, "sym": "XAUUSDc", "type": "buy", "vol": 0.1, "entry": 4532.843, "sl": 4533.336, "open": "2026-05-29 13:46:42", "close": "2026-05-29 13:47:45", "profit": 5.00},
    {"id": 25, "sym": "XAUUSDc", "type": "buy", "vol": 0.02, "entry": 4549.926, "sl": 4541.953, "open": "2026-05-29 14:12:50", "close": "2026-05-29 14:16:34", "profit": -16.00},
    {"id": 26, "sym": "XAUUSDc", "type": "buy", "vol": 0.02, "entry": 4537.721, "sl": 4538.013, "open": "2026-05-29 14:43:56", "close": "2026-05-29 14:47:30", "profit": 0.60},
    {"id": 27, "sym": "XAUUSDc", "type": "buy", "vol": 0.01, "entry": 4538.126, "sl": 4542.511, "open": "2026-05-29 14:48:21", "close": "2026-05-29 14:52:41", "profit": 20.40},
]

# Check max simultaneous open trades and pair limit (same logic as production engine)
def check_simultaneous(trades):
    """Uses event-based approach: when open count exceeds limit, ALL open trades get flagged"""
    # Build open/close events
    events = []
    for t in trades:
        events.append({"time": datetime.fromisoformat(t["open"]), "id": t["id"], "sym": get_base_symbol(t["sym"]), "action": "open"})
        events.append({"time": datetime.fromisoformat(t["close"]), "id": t["id"], "sym": get_base_symbol(t["sym"]), "action": "close"})
    # Sort: same time → close before open
    events.sort(key=lambda e: (e["time"], 0 if e["action"] == "close" else 1))

    # Max open trades check
    max_open_violators = set()
    open_set = set()
    for ev in events:
        if ev["action"] == "open":
            open_set.add(ev["id"])
        else:
            open_set.discard(ev["id"])
        if len(open_set) > MAX_OPEN_TRADES:
            for tid in open_set:
                max_open_violators.add(tid)

    # Pair limit check (per symbol)
    pair_violators = set()
    symbols = set(get_base_symbol(t["sym"]) for t in trades)
    for sym in symbols:
        sym_events = [e for e in events if e["sym"] == sym]
        sym_open = set()
        for ev in sym_events:
            if ev["action"] == "open":
                sym_open.add(ev["id"])
            else:
                sym_open.discard(ev["id"])
            if len(sym_open) > PAIR_LIMIT:
                for tid in sym_open:
                    pair_violators.add(tid)

    return max_open_violators, pair_violators

max_open_violators, pair_violators = check_simultaneous(trades)

# Daily loss tracking
daily_pnl = defaultdict(float)
daily_loss_breach_trades = set()

# Process trades in chronological order by close time
sorted_trades = sorted(trades, key=lambda t: t["close"])
for t in sorted_trades:
    close_date = datetime.fromisoformat(t["close"]).strftime("%Y-%m-%d")
    if t["profit"] < 0:
        daily_pnl[close_date] += t["profit"]
        if daily_pnl[close_date] < -DAILY_LOSS_CAP:
            daily_loss_breach_trades.add(t["id"])

# Now also flag trades that PROFIT after the daily cap was breached
daily_breach_dates = set()
for date, pnl in daily_pnl.items():
    if pnl < -DAILY_LOSS_CAP:
        daily_breach_dates.add(date)

# Find trades that profited after breach on same day
for t in sorted_trades:
    close_date = datetime.fromisoformat(t["close"]).strftime("%Y-%m-%d")
    if close_date in daily_breach_dates and t["profit"] > 0:
        # Check if this trade closed AFTER the breach point
        running = 0
        breached_at = None
        for prev in sorted_trades:
            prev_date = datetime.fromisoformat(prev["close"]).strftime("%Y-%m-%d")
            if prev_date != close_date: continue
            if prev["profit"] < 0:
                running += prev["profit"]
                if running < -DAILY_LOSS_CAP and breached_at is None:
                    breached_at = prev["close"]
            if prev["id"] == t["id"] and breached_at and t["close"] > breached_at:
                daily_loss_breach_trades.add(t["id"])
                break

print("=" * 100)
print("  FULL EVALUATION — Account 161585721 (tt) | Cent | 27 trades")
print("  Rules: Lot≤2 | Open≤4 | Pair≤2 | Risk≤500¢ | DailyCap≤250¢ | Hold≤24h | SL Req | No Weekend")
print("=" * 100)
print()

flagged = []
valid = []

for t in trades:
    violations = []
    open_dt = datetime.fromisoformat(t["open"])
    close_dt = datetime.fromisoformat(t["close"])
    hold_hours = (close_dt - open_dt).total_seconds() / 3600
    is_buy = t["type"] == "buy"

    # 1. Max Lot
    if t["vol"] > MAX_LOT:
        violations.append(f"Lot size {t['vol']} exceeds max {MAX_LOT}")

    # 2. SL Required
    if SL_REQUIRED and (t.get("sl") is None or t["sl"] == 0):
        violations.append("No stop loss set")

    # 3. SL Risk
    if t.get("sl") and t["sl"] != 0:
        contract = get_contract(t["sym"])
        sl_dist = abs(t["entry"] - t["sl"])
        sl_risk = t["vol"] * contract * sl_dist
        if sl_risk > MAX_RISK + 20:
            violations.append(f"SL risk {sl_risk:.0f}¢ exceeds max {MAX_RISK}¢")

    # 4. Hold Time
    if hold_hours > MAX_HOLD_HOURS:
        violations.append(f"Hold time {hold_hours:.1f}h exceeds max {MAX_HOLD_HOURS}h")

    # 5. Weekend
    if not WEEKEND_TRADING:
        if open_dt.weekday() >= 5 or close_dt.weekday() >= 5:
            violations.append("Weekend trading")

    # 6. Max Open Trades / Pair Limit
    if t["id"] in max_open_violators:
        violations.append(f"Exceeded {MAX_OPEN_TRADES} simultaneous trades")
    if t["id"] in pair_violators:
        violations.append(f"Exceeded {PAIR_LIMIT} simultaneous {get_base_symbol(t['sym'])} trades")

    # 7. Daily Loss Cap
    if t["id"] in daily_loss_breach_trades and t["profit"] > 0:
        violations.append(f"Profit after daily {DAILY_LOSS_CAP}¢ drawdown breach")

    # 8. Fake SL Detection
    if t.get("sl") and t["sl"] != 0:
        msl = max_sl_price(t["sym"], t["vol"], t["entry"], MAX_RISK, is_buy)
        hold_min = (close_dt - open_dt).total_seconds() / 60
        tf = select_tf(hold_min)
        candle_result = get_candles(t["sym"], tf, t["open"], t["close"])
        candles = candle_result.get("candles", []) if candle_result.get("success") else []
        safe = candles[1:-1] if len(candles) > 2 else []
        for c in safe:
            if is_buy and c["low"] <= msl:
                violations.append(f"SL placed late. Price passed max risk (500¢, SL @ {msl:.3f}) on {tf} candle at {format_eat(c['time'])}")
                break
            elif not is_buy and c["high"] >= msl:
                violations.append(f"SL placed late. Price passed max risk (500¢, SL @ {msl:.3f}) on {tf} candle at {format_eat(c['time'])}")
                break

    if violations:
        flagged.append((t, violations))
    else:
        valid.append(t)

# Print
print("  🚩 FLAGGED TRADES:")
print("-" * 100)
if not flagged:
    print("  None")
else:
    for t, viols in flagged:
        print(f"  #{t['id']:2d} | {t['sym']} {t['type'].upper()} @ {t['entry']} | Vol: {t['vol']} | P&L: {t['profit']}¢")
        for v in viols:
            print(f"      ⚠️  {v}")
        print()

print()
print("  ✅ VALID TRADES:")
print("-" * 100)
for t in valid:
    print(f"  #{t['id']:2d} | {t['sym']} {t['type'].upper()} @ {t['entry']} | Vol: {t['vol']} | P&L: {t['profit']}¢")

# Summary
print()
print("=" * 100)
total_profit = sum(t["profit"] for t in trades)
flagged_profit_removed = sum(t["profit"] for t, _ in flagged if t["profit"] > 0)
valid_pnl = sum(t["profit"] for t in valid)
# Losses from flagged trades still count
flagged_losses = sum(t["profit"] for t, _ in flagged if t["profit"] < 0)
qualified_pnl = valid_pnl + flagged_losses
starting = 1000
adjusted = starting + qualified_pnl
current_balance = starting + total_profit

trade_days = set()
for t in trades:
    d = datetime.fromisoformat(t["close"]).date()
    trade_days.add(d)

print(f"  SUMMARY:")
print(f"  Total trades: {len(trades)} | Flagged: {len(flagged)} | Valid: {len(valid)}")
print(f"  Gross P&L: {total_profit:.2f}¢ | Current balance: {current_balance:.2f}¢")
print(f"  Profit removed (flagged winners): {flagged_profit_removed:.2f}¢")
print(f"  Flagged losses (still count): {flagged_losses:.2f}¢")
print(f"  Qualified P&L: {qualified_pnl:.2f}¢")
print(f"  Starting: {starting}¢ | Adjusted balance: {adjusted:.2f}¢")
print(f"  Active days: {len(trade_days)} ({', '.join(str(d) for d in sorted(trade_days))})")
print(f"  Min required: {MIN_ACTIVE_DAYS} → {'✅ PASS' if len(trade_days) >= MIN_ACTIVE_DAYS else '❌ FAIL'}")
print("=" * 100)
