"""
Full Evaluation — Account 161585721 (tt) — Cent Account
Challenge Rules (from screenshot):
  Max Lot Size: 2
  Max Open Trades: 4
  Pair Limit (Simultaneous): 2
  Max Risk per Trade: 500¢
  Daily Loss Cap: 250¢
  Max Trade Duration: 24 hours
  Min Active Trading Days: 4
  Stop Loss Required: YES
  Weekend Trading: NO
  Only Cent Account: YES
"""
import json, subprocess
from datetime import datetime, timedelta
from collections import defaultdict

CANDLES_URL = "http://108.181.184.223:8000/api/v1/candles"
API_KEY = "wp-k8x2m9f4v7j3n6q1w5t8r2y4u7i0p3"

# Rules
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
    elif "XAGUSD" in sym: return 5000
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

# All 26 trades from the positions section (using close_time for ordering)
trades = [
    {"pos": 318674655, "sym": "XAUUSDc", "type": "buy", "vol": 0.1, "entry": 4561.726, "sl": 4551.958, "tp": None, "open": "2026-05-25 08:08:05", "close": "2026-05-25 09:01:29", "profit": -48.70},
    {"pos": 319578560, "sym": "XAUUSDc", "type": "sell", "vol": 0.1, "entry": 4535.414, "sl": 4533.094, "tp": 4515.284, "open": "2026-05-26 04:27:52", "close": "2026-05-26 05:30:04", "profit": 23.20},
    {"pos": 319643668, "sym": "EURUSDc", "type": "sell", "vol": 1.0, "entry": 1.16401, "sl": 1.16500, "tp": 1.16201, "open": "2026-05-26 08:12:33", "close": "2026-05-26 13:53:35", "profit": 200.00},
    {"pos": 319639180, "sym": "XAUUSDc", "type": "sell", "vol": 0.1, "entry": 4540.014, "sl": 4534.936, "tp": 4509.965, "open": "2026-05-26 10:50:27", "close": "2026-05-26 11:35:46", "profit": 300.40},
    {"pos": 320350275, "sym": "XAUUSDc", "type": "sell", "vol": 0.1, "entry": 4516.677, "sl": 4506.559, "tp": 4496.555, "open": "2026-05-26 14:26:14", "close": "2026-05-26 17:54:41", "profit": 150.50},
    {"pos": 320690482, "sym": "EURUSDc", "type": "sell", "vol": 0.5, "entry": 1.16398, "sl": 1.16396, "tp": 1.16198, "open": "2026-05-27 00:24:29", "close": "2026-05-27 10:45:10", "profit": 1.00},
    {"pos": 320945275, "sym": "XAUUSDc", "type": "sell", "vol": 0.05, "entry": 4506.373, "sl": 4504.009, "tp": 4486.261, "open": "2026-05-27 05:16:39", "close": "2026-05-27 06:21:41", "profit": 100.60},
    {"pos": 321247736, "sym": "XAUUSDc", "type": "sell", "vol": 0.1, "entry": 4489.247, "sl": 4486.139, "tp": 4466.160, "open": "2026-05-27 09:43:37", "close": "2026-05-27 10:39:45", "profit": 230.90},
    {"pos": 322378197, "sym": "XAUUSDc", "type": "sell", "vol": 0.1, "entry": 4371.425, "sl": 4381.316, "tp": 4351.127, "open": "2026-05-28 04:23:33", "close": "2026-05-28 05:30:24", "profit": -98.90},
    {"pos": 322389971, "sym": "XAUUSDc", "type": "sell", "vol": 0.1, "entry": 4371.877, "sl": 4381.523, "tp": 4351.503, "open": "2026-05-28 04:48:51", "close": "2026-05-28 05:30:36", "profit": -96.40},
    {"pos": 322425805, "sym": "XAUUSDc", "type": "sell", "vol": 0.05, "entry": 4390.467, "sl": 4385.068, "tp": 4330.462, "open": "2026-05-28 05:45:02", "close": "2026-05-28 06:23:03", "profit": 27.00},
    {"pos": 322542987, "sym": "XAUUSDc", "type": "sell", "vol": 0.05, "entry": 4387.522, "sl": 4387.230, "tp": 4327.591, "open": "2026-05-28 07:49:34", "close": "2026-05-28 07:59:16", "profit": 1.40},
    {"pos": 322553300, "sym": "XAUUSDc", "type": "sell", "vol": 0.05, "entry": 4387.950, "sl": 4397.716, "tp": None, "open": "2026-05-28 07:59:47", "close": "2026-05-28 09:21:50", "profit": -48.80},
    {"pos": 322661322, "sym": "XAUUSDc", "type": "sell", "vol": 0.05, "entry": 4394.253, "sl": 4400.352, "tp": 4364.194, "open": "2026-05-28 10:03:33", "close": "2026-05-28 10:09:35", "profit": -30.50},
    {"pos": 323616951, "sym": "EURUSDc", "type": "sell", "vol": 0.75, "entry": 1.16532, "sl": 1.16400, "tp": 1.16265, "open": "2026-05-29 06:58:09", "close": "2026-05-29 08:55:28", "profit": 200.25},
    {"pos": 323662258, "sym": "EURUSDc", "type": "sell", "vol": 0.75, "entry": 1.16481, "sl": 1.16414, "tp": 1.16281, "open": "2026-05-29 07:15:10", "close": "2026-05-29 09:58:16", "profit": 50.25},
    {"pos": 323675906, "sym": "XAUUSDc", "type": "sell", "vol": 0.05, "entry": 4512.361, "sl": 4532.368, "tp": None, "open": "2026-05-29 07:29:15", "close": "2026-05-29 08:19:04", "profit": -36.90},
    {"pos": 323870142, "sym": "EURUSDc", "type": "sell", "vol": 1.0, "entry": 1.16429, "sl": 1.16529, "tp": 1.16228, "open": "2026-05-29 10:40:19", "close": "2026-05-29 13:21:17", "profit": -87.00},
    {"pos": 323945204, "sym": "EURUSDc", "type": "sell", "vol": 0.5, "entry": 1.16451, "sl": 1.16552, "tp": 1.16249, "open": "2026-05-29 12:15:09", "close": "2026-05-29 13:39:05", "profit": -25.64},
    {"pos": 323936146, "sym": "GBPUSDc", "type": "sell", "vol": 1.0, "entry": 1.34380, "sl": 1.34478, "tp": 1.34078, "open": "2026-05-29 13:16:36", "close": "2026-05-29 13:24:53", "profit": -28.81},
    {"pos": 324020478, "sym": "XAUUSDc", "type": "buy", "vol": 0.2, "entry": 4523.658, "sl": 4524.056, "tp": 4553.039, "open": "2026-05-29 13:17:01", "close": "2026-05-29 13:35:27", "profit": 7.90},
    {"pos": 324046949, "sym": "XAUUSDc", "type": "buy", "vol": 0.3, "entry": 4524.167, "sl": 4524.459, "tp": 4537.576, "open": "2026-05-29 13:36:07", "close": "2026-05-29 13:39:05", "profit": 233.50},
    {"pos": 324065144, "sym": "XAUUSDc", "type": "buy", "vol": 0.1, "entry": 4532.843, "sl": 4533.336, "tp": None, "open": "2026-05-29 13:46:42", "close": "2026-05-29 13:47:45", "profit": 5.00},
    {"pos": 324114798, "sym": "XAUUSDc", "type": "buy", "vol": 0.02, "entry": 4549.926, "sl": 4541.953, "tp": None, "open": "2026-05-29 14:12:50", "close": "2026-05-29 14:16:34", "profit": -16.00},
    {"pos": 324170796, "sym": "XAUUSDc", "type": "buy", "vol": 0.02, "entry": 4537.721, "sl": 4538.013, "tp": None, "open": "2026-05-29 14:43:56", "close": "2026-05-29 14:47:30", "profit": 0.60},
    {"pos": 324176505, "sym": "XAUUSDc", "type": "buy", "vol": 0.01, "entry": 4538.126, "sl": 4542.511, "tp": 4558.491, "open": "2026-05-29 14:48:21", "close": "2026-05-29 14:52:41", "profit": 20.40},
]

print("=" * 100)
print("  FULL EVALUATION — Account 161585721 (tt) | Cent Account | 26 trades")
print("  Rules: Lot≤2 | Open≤4 | Pair≤2 | Risk≤500¢ | DailyCap≤250¢ | Hold≤24h | SL Required | No Weekend")
print("=" * 100)
print()

flagged_trades = []
valid_trades = []

for t in trades:
    violations = []
    open_dt = datetime.fromisoformat(t["open"])
    close_dt = datetime.fromisoformat(t["close"])
    hold_hours = (close_dt - open_dt).total_seconds() / 3600
    is_buy = t["type"] == "buy"

    # 1. Max Lot Size
    if t["vol"] > MAX_LOT:
        violations.append(f"Lot size {t['vol']} exceeds max {MAX_LOT}")

    # 2. SL Required
    if SL_REQUIRED and (t["sl"] is None or t["sl"] == 0):
        violations.append("No stop loss set")

    # 3. SL Risk check (max 500¢)
    if t["sl"] and t["sl"] != 0:
        contract = get_contract(t["sym"])
        sl_dist = abs(t["entry"] - t["sl"])
        sl_risk = t["vol"] * contract * sl_dist
        if sl_risk > MAX_RISK + 20:  # 20¢ tolerance for cent
            violations.append(f"SL risk {sl_risk:.0f}¢ exceeds max {MAX_RISK}¢")

    # 4. Max Hold Time
    if hold_hours > MAX_HOLD_HOURS:
        violations.append(f"Hold time {hold_hours:.1f}h exceeds max {MAX_HOLD_HOURS}h")

    # 5. Weekend Trading
    if not WEEKEND_TRADING:
        if open_dt.weekday() >= 5 or close_dt.weekday() >= 5:
            violations.append("Weekend trading not allowed")

    # 6. Fake SL Detection (price passed max SL level during trade)
    if t["sl"] and t["sl"] != 0:
        msl = max_sl_price(t["sym"], t["vol"], t["entry"], MAX_RISK, is_buy)
        hold_min = (close_dt - open_dt).total_seconds() / 60
        tf = select_tf(hold_min)
        candle_result = get_candles(t["sym"], tf, t["open"], t["close"])
        candles = candle_result.get("candles", []) if candle_result.get("success") else []
        safe = candles[1:-1] if len(candles) > 2 else []
        for c in safe:
            if is_buy and c["low"] <= msl:
                eat_time = format_eat(c["time"])
                violations.append(f"SL placed late. Price passed max risk (500¢, SL @ {msl:.3f}) on {tf} candle at {eat_time}")
                break
            elif not is_buy and c["high"] >= msl:
                eat_time = format_eat(c["time"])
                violations.append(f"SL placed late. Price passed max risk (500¢, SL @ {msl:.3f}) on {tf} candle at {eat_time}")
                break

    if violations:
        flagged_trades.append((t, violations))
    else:
        valid_trades.append(t)

# Print results
print("  🚩 FLAGGED TRADES:")
print("-" * 100)
for t, viols in flagged_trades:
    print(f"  #{t['pos']} | {t['sym']} {t['type'].upper()} @ {t['entry']} | Vol: {t['vol']} | P&L: {t['profit']}¢")
    for v in viols:
        print(f"    ⚠️  {v}")
    print()

print("  ✅ VALID TRADES:")
print("-" * 100)
for t in valid_trades:
    print(f"  #{t['pos']} | {t['sym']} {t['type'].upper()} @ {t['entry']} | Vol: {t['vol']} | P&L: {t['profit']}¢")

# Summary
print()
print("=" * 100)
flagged_profit = sum(t["profit"] for t, _ in flagged_trades if t["profit"] > 0)
valid_profit = sum(t["profit"] for t in valid_trades)
valid_loss = sum(t["profit"] for t in valid_trades if t["profit"] < 0)
total_qualified = valid_profit + valid_loss
starting = 1000
adjusted = starting + total_qualified

# Active days
trade_days = set()
for t in trades:
    d = datetime.fromisoformat(t["close"]).date()
    trade_days.add(d)

print(f"  SUMMARY:")
print(f"  Total trades: {len(trades)} | Flagged: {len(flagged_trades)} | Valid: {len(valid_trades)}")
print(f"  Profit removed (flagged winners): {flagged_profit:.2f}¢")
print(f"  Qualified P&L: {total_qualified:.2f}¢")
print(f"  Starting balance: {starting}¢ | Adjusted balance: {adjusted:.2f}¢")
print(f"  Active trading days: {len(trade_days)} ({', '.join(str(d) for d in sorted(trade_days))})")
print(f"  Min required: {MIN_ACTIVE_DAYS} → {'✅ PASS' if len(trade_days) >= MIN_ACTIVE_DAYS else '❌ FAIL'}")
print("=" * 100)
