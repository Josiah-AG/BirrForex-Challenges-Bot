"""
Fake SL Detection Test — 3 Accounts from Previous Challenge
Standard accounts, max risk = $5
"""
import json, subprocess
from datetime import datetime

CANDLES_URL = "http://108.181.184.223:8000/api/v1/candles"
API_KEY = "wp-k8x2m9f4v7j3n6q1w5t8r2y4u7i0p3"
MAX_RISK = 5.0

def get_candles(symbol, timeframe, from_time, to_time):
    body = json.dumps({"symbol": symbol, "timeframe": timeframe, "from_time": from_time, "to_time": to_time, "api_key": API_KEY})
    r = subprocess.run(["curl","-s","-X","POST",CANDLES_URL,"-H","Content-Type: application/json","-d",body], capture_output=True, text=True, timeout=30)
    try:
        return json.loads(r.stdout)
    except:
        return {"success": False}

def get_contract(symbol):
    sym = symbol.replace("_x100m","").replace("_x100","").rstrip("mczr").upper()
    has_x100 = "_x100" in symbol
    if "XAUUSD" in sym: return 100
    elif "XAGUSD" in sym: return 5000
    elif "USTEC" in sym or "US500" in sym: return 100 if has_x100 else 1
    elif "US30" in sym: return 100 if has_x100 else 1
    elif "JPY" in sym: return 100000
    else: return 100000

def max_sl_price(symbol, volume, entry, max_risk, is_buy):
    contract = get_contract(symbol)
    price_move = max_risk / (volume * contract)
    if is_buy: return entry - price_move
    else: return entry + price_move

def select_tf(hold_min):
    if hold_min < 20: return "M1"
    elif hold_min < 60: return "M5"
    elif hold_min < 360: return "M15"
    elif hold_min < 1440: return "H1"
    else: return "H4"

def check_trade(t):
    """Returns (is_fake, flag_message) or (False, None)"""
    if t["profit"] <= 0:
        return False, None  # Only check winners

    is_buy = t["type"] == "buy"
    msl = max_sl_price(t["sym"], t["vol"], t["entry"], MAX_RISK, is_buy)

    open_dt = datetime.fromisoformat(t["open"])
    close_dt = datetime.fromisoformat(t["close"])
    hold_sec = (close_dt - open_dt).total_seconds()
    hold_min = hold_sec / 60
    tf = select_tf(hold_min)

    candle_result = get_candles(t["sym"], tf, t["open"], t["close"])
    candles = candle_result.get("candles", []) if candle_result.get("success") else []

    # Exclude first and last candle
    safe = candles[1:-1] if len(candles) > 2 else []
    if not safe:
        return False, None  # Can't verify

    for c in safe:
        if is_buy and c["low"] <= msl:
            eat_time = format_eat(c["time"])
            return True, f"SL placed late. Price passed the maximum allowed risk (${MAX_RISK}, SL @ {msl:.5f}) during trade open period on the {tf} candle formed at {eat_time}. Trade should have been closed by SL at that time"
        elif not is_buy and c["high"] >= msl:
            eat_time = format_eat(c["time"])
            return True, f"SL placed late. Price passed the maximum allowed risk (${MAX_RISK}, SL @ {msl:.5f}) during trade open period on the {tf} candle formed at {eat_time}. Trade should have been closed by SL at that time"

    return False, None

def format_eat(iso_time):
    """Convert UTC ISO time to EAT HH:MM format"""
    from datetime import timedelta
    utc = datetime.fromisoformat(iso_time.replace("+00:00","").replace("Z",""))
    eat = utc + timedelta(hours=3)
    return f"{eat.hour:02d}:{eat.minute:02d} EAT"


# ==================== ACCOUNT 1: 134157894 (Mom) ====================
acct1_trades = [
    {"pos": 984002500, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4789.458, "open": "2026-04-21 05:14:20", "close": "2026-04-21 06:02:58", "profit": 24.37},
    {"pos": 984002501, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4789.458, "open": "2026-04-21 05:14:20", "close": "2026-04-21 06:02:58", "profit": 24.37},
    {"pos": 984026727, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4787.482, "open": "2026-04-21 06:12:44", "close": "2026-04-21 11:31:50", "profit": -3.20},
    {"pos": 984026732, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4787.246, "open": "2026-04-21 06:12:45", "close": "2026-04-21 11:31:44", "profit": -1.88},
    {"pos": 984581001, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4756.591, "open": "2026-04-22 02:19:06", "close": "2026-04-22 14:39:43", "profit": 38.47},
    {"pos": 984581003, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4756.727, "open": "2026-04-22 02:19:06", "close": "2026-04-22 14:39:43", "profit": 38.74},
    {"pos": 985145405, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4701.845, "open": "2026-04-23 04:02:08", "close": "2026-04-23 17:42:38", "profit": 27.08},
    {"pos": 985145406, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4701.938, "open": "2026-04-23 04:02:08", "close": "2026-04-23 17:42:38", "profit": 27.27},
    {"pos": 985791647, "sym": "EURUSDm", "type": "sell", "vol": 0.02, "entry": 1.16777, "open": "2026-04-24 07:04:34", "close": "2026-04-24 07:04:58", "profit": -0.18},
    {"pos": 986456152, "sym": "EURUSDm", "type": "sell", "vol": 0.01, "entry": 1.17286, "open": "2026-04-27 03:21:18", "close": "2026-04-27 03:22:27", "profit": 0.03},
    {"pos": 987027938, "sym": "EURUSDm", "type": "sell", "vol": 0.01, "entry": 1.17117, "open": "2026-04-28 04:04:10", "close": "2026-04-28 04:04:51", "profit": -0.13},
    {"pos": 987027943, "sym": "EURUSDm", "type": "sell", "vol": 0.01, "entry": 1.17117, "open": "2026-04-28 04:04:12", "close": "2026-04-28 04:04:35", "profit": -0.08},
    {"pos": 987590288, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4596.362, "open": "2026-04-28 22:23:24", "close": "2026-04-29 08:42:02", "profit": 63.40},
    {"pos": 987590289, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4596.354, "open": "2026-04-28 22:23:25", "close": "2026-04-29 08:42:01", "profit": 63.50},
    {"pos": 988378151, "sym": "AUDUSDm", "type": "buy", "vol": 0.01, "entry": 0.71195, "open": "2026-04-30 05:26:27", "close": "2026-04-30 05:26:35", "profit": -0.11},
    {"pos": 989069319, "sym": "AUDUSDm", "type": "buy", "vol": 0.01, "entry": 0.72005, "open": "2026-05-01 07:24:44", "close": "2026-05-01 07:24:57", "profit": -0.05},
]

# ==================== ACCOUNT 2: 223584802 (standard) ====================
acct2_trades = [
    {"pos": 99870135, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4794.856, "open": "2026-04-21 05:36:51", "close": "2026-04-21 13:18:34", "profit": 49.40},
    {"pos": 100452518, "sym": "XAUUSDm", "type": "buy", "vol": 0.02, "entry": 4707.171, "open": "2026-04-23 03:47:39", "close": "2026-04-23 12:09:34", "profit": 46.11},
    {"pos": 100452521, "sym": "XAUUSDm", "type": "buy", "vol": 0.02, "entry": 4707.560, "open": "2026-04-23 03:47:41", "close": "2026-04-23 12:09:13", "profit": 46.28},
    {"pos": 100768908, "sym": "EURUSDm", "type": "sell", "vol": 0.01, "entry": 1.16772, "open": "2026-04-24 07:03:27", "close": "2026-04-24 07:05:53", "profit": -0.18},
    {"pos": 101209581, "sym": "EURUSDm", "type": "buy", "vol": 0.01, "entry": 1.17195, "open": "2026-04-27 06:13:52", "close": "2026-04-27 06:16:29", "profit": -0.15},
    {"pos": 101613772, "sym": "EURUSDm", "type": "sell", "vol": 0.01, "entry": 1.16946, "open": "2026-04-28 13:04:57", "close": "2026-04-28 13:06:39", "profit": -0.08},
    {"pos": 102005314, "sym": "EURUSDm", "type": "buy", "vol": 0.01, "entry": 1.16779, "open": "2026-04-29 18:28:13", "close": "2026-04-29 18:28:54", "profit": -0.15},
    {"pos": 102108450, "sym": "EURUSDm", "type": "sell", "vol": 0.01, "entry": 1.16676, "open": "2026-04-30 06:50:53", "close": "2026-04-30 06:51:46", "profit": -0.20},
    {"pos": 102465757, "sym": "EURUSDm", "type": "sell", "vol": 0.01, "entry": 1.17357, "open": "2026-05-01 09:40:43", "close": "2026-05-01 09:41:22", "profit": -0.14},
]

# ==================== ACCOUNT 3: 134140606 (Standard) ====================
acct3_trades = [
    {"pos": 983698694, "sym": "XAUUSDm", "type": "buy", "vol": 0.02, "entry": 4805.533, "open": "2026-04-20 12:33:59", "close": "2026-04-20 13:20:32", "profit": 24.64},
    {"pos": 983698709, "sym": "XAUUSDm", "type": "buy", "vol": 0.02, "entry": 4805.522, "open": "2026-04-20 12:34:00", "close": "2026-04-20 13:20:32", "profit": 24.67},
    {"pos": 984294845, "sym": "USTECm", "type": "sell", "vol": 0.01, "entry": 26733.36, "open": "2026-04-21 14:13:59", "close": "2026-04-21 14:17:24", "profit": -0.29},
    {"pos": 984341569, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4736.744, "open": "2026-04-21 14:58:24", "close": "2026-04-21 16:53:22", "profit": 48.16},
    {"pos": 984341571, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4736.744, "open": "2026-04-21 14:58:24", "close": "2026-04-21 16:53:23", "profit": 48.95},
    {"pos": 984920849, "sym": "USTECm", "type": "sell", "vol": 0.01, "entry": 26848.43, "open": "2026-04-22 14:57:08", "close": "2026-04-22 14:57:20", "profit": 0.02},
    {"pos": 985544447, "sym": "USTECm", "type": "buy", "vol": 0.01, "entry": 26919.20, "open": "2026-04-23 17:02:21", "close": "2026-04-23 17:05:32", "profit": -0.54},
    {"pos": 985587547, "sym": "USTECm", "type": "buy", "vol": 0.01, "entry": 26606.26, "open": "2026-04-23 17:45:27", "close": "2026-04-23 17:46:42", "profit": -0.39},
    {"pos": 985589763, "sym": "USTECm", "type": "buy", "vol": 0.01, "entry": 26571.09, "open": "2026-04-23 17:46:56", "close": "2026-04-23 17:47:35", "profit": 0.41},
    {"pos": 986141291, "sym": "USTECm", "type": "sell", "vol": 0.01, "entry": 27286.23, "open": "2026-04-24 17:13:20", "close": "2026-04-24 17:16:01", "profit": 0.06},
    {"pos": 986696333, "sym": "USTEC_x100m", "type": "sell", "vol": 0.02, "entry": 27292.25, "open": "2026-04-27 12:41:01", "close": "2026-04-27 13:51:11", "profit": 193.68},
    {"pos": 986697219, "sym": "USTEC_x100m", "type": "sell", "vol": 0.01, "entry": 27285.35, "open": "2026-04-27 12:41:38", "close": "2026-04-27 12:41:56", "profit": 1.03},
    {"pos": 987447971, "sym": "USTECm", "type": "sell", "vol": 0.01, "entry": 26977.94, "open": "2026-04-28 14:47:02", "close": "2026-04-28 14:48:11", "profit": 0.08},
    {"pos": 987450559, "sym": "USTECm", "type": "buy", "vol": 0.01, "entry": 26937.44, "open": "2026-04-28 14:50:17", "close": "2026-04-28 14:50:44", "profit": -0.16},
    {"pos": 987998073, "sym": "USTEC_x100m", "type": "buy", "vol": 0.02, "entry": 27076.51, "open": "2026-04-29 13:40:47", "close": "2026-04-29 14:29:09", "profit": 174.46},
    {"pos": 987998077, "sym": "USTEC_x100m", "type": "buy", "vol": 0.02, "entry": 27077.23, "open": "2026-04-29 13:40:47", "close": "2026-04-29 14:29:09", "profit": 173.02},
    {"pos": 988826311, "sym": "XAUUSDm", "type": "buy", "vol": 0.01, "entry": 4607.652, "open": "2026-04-30 16:20:55", "close": "2026-04-30 16:21:15", "profit": 1.32},
    {"pos": 989003737, "sym": "XAUUSDm", "type": "buy", "vol": 0.01, "entry": 4609.199, "open": "2026-05-01 05:01:49", "close": "2026-05-01 05:06:58", "profit": 2.46},
    {"pos": 989436439, "sym": "XAUUSDm", "type": "buy", "vol": 0.01, "entry": 4637.269, "open": "2026-05-01 16:50:32", "close": "2026-05-01 16:50:48", "profit": 0.29},
]

accounts = [
    ("134157894 (Mom)", acct1_trades),
    ("223584802 (standard)", acct2_trades),
    ("134140606 (Standard)", acct3_trades),
]

print("=" * 100)
print("  FAKE SL DETECTION — 3 Accounts | Standard | Max Risk: $5")
print("=" * 100)

for acct_name, trades in accounts:
    print(f"\n{'─' * 100}")
    print(f"  ACCOUNT: {acct_name} | {len(trades)} trades")
    print(f"{'─' * 100}")

    flagged = []
    valid_winners = []
    losers = []

    for t in trades:
        if t["profit"] <= 0:
            losers.append(t)
            continue

        is_fake, flag = check_trade(t)
        if is_fake:
            flagged.append((t, flag))
        else:
            valid_winners.append(t)

    # Print flagged trades
    if flagged:
        print(f"\n  🚩 FLAGGED ({len(flagged)} trades):")
        for t, flag in flagged:
            msl = max_sl_price(t["sym"], t["vol"], t["entry"], MAX_RISK, t["type"] == "buy")
            print(f"    #{t['pos']} | {t['sym']} {t['type'].upper()} @ {t['entry']} | Vol: {t['vol']} | Profit: ${t['profit']}")
            print(f"      Max SL: {msl:.5f} | {flag}")
            print()
    else:
        print(f"\n  ✅ No fake SL detected")

    # Print valid winners
    if valid_winners:
        print(f"  ✅ VALID winners ({len(valid_winners)} trades):")
        for t in valid_winners:
            print(f"    #{t['pos']} | {t['sym']} {t['type'].upper()} | Profit: ${t['profit']}")

    # Summary
    total_flagged_profit = sum(t["profit"] for t, _ in flagged)
    total_valid_profit = sum(t["profit"] for t in valid_winners)
    print(f"\n  Summary: {len(flagged)} flagged (${total_flagged_profit:.2f} removed) | {len(valid_winners)} valid winners (${total_valid_profit:.2f}) | {len(losers)} losers")

print(f"\n{'=' * 100}")
print("  DONE")
print("=" * 100)
