"""
Fake SL Detection Analysis — Account 134157894 (Mom)
Fetches candle data from VPS to verify if SL was reachable during each trade.
"""
import json
import subprocess
from datetime import datetime, timezone, timedelta

CANDLES_URL = "http://108.181.184.223:8000/api/v1/candles"
API_KEY = "wp-k8x2m9f4v7j3n6q1w5t8r2y4u7i0p3"


def get_candles(symbol, timeframe, from_time, to_time):
    body = json.dumps({
        "symbol": symbol, "timeframe": timeframe,
        "from_time": from_time, "to_time": to_time, "api_key": API_KEY,
    })
    r = subprocess.run(
        ["curl", "-s", "-X", "POST", CANDLES_URL, "-H", "Content-Type: application/json", "-d", body],
        capture_output=True, text=True, timeout=30
    )
    return json.loads(r.stdout)


# All 16 trades from the export
trades = [
    {"pos": 984002500, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4789.458, "sl": 4801.962, "tp": 4777.276, "open": "2026-04-21 05:14:20", "close": "2026-04-21 06:02:58", "close_p": 4777.276, "profit": 24.37},
    {"pos": 984002501, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4789.458, "sl": 4801.962, "tp": 4777.276, "open": "2026-04-21 05:14:20", "close": "2026-04-21 06:02:58", "close_p": 4777.276, "profit": 24.37},
    {"pos": 984026727, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4787.482, "sl": 4789.080, "tp": None, "open": "2026-04-21 06:12:44", "close": "2026-04-21 11:31:50", "close_p": 4789.080, "profit": -3.20},
    {"pos": 984026732, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4787.246, "sl": 4788.187, "tp": None, "open": "2026-04-21 06:12:45", "close": "2026-04-21 11:31:44", "close_p": 4788.187, "profit": -1.88},
    {"pos": 984581001, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4756.591, "sl": 4743.404, "tp": None, "open": "2026-04-22 02:19:06", "close": "2026-04-22 14:39:43", "close_p": 4737.355, "profit": 38.47},
    {"pos": 984581003, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4756.727, "sl": 4738.881, "tp": None, "open": "2026-04-22 02:19:06", "close": "2026-04-22 14:39:43", "close_p": 4737.355, "profit": 38.74},
    {"pos": 985145405, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4701.845, "sl": 4693.789, "tp": None, "open": "2026-04-23 04:02:08", "close": "2026-04-23 17:42:38", "close_p": 4688.305, "profit": 27.08},
    {"pos": 985145406, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4701.938, "sl": 4694.927, "tp": None, "open": "2026-04-23 04:02:08", "close": "2026-04-23 17:42:38", "close_p": 4688.305, "profit": 27.27},
    {"pos": 985791647, "sym": "EURUSDm", "type": "sell", "vol": 0.02, "entry": 1.16777, "sl": 1.16786, "tp": None, "open": "2026-04-24 07:04:34", "close": "2026-04-24 07:04:58", "close_p": 1.16786, "profit": -0.18},
    {"pos": 986456152, "sym": "EURUSDm", "type": "sell", "vol": 0.01, "entry": 1.17286, "sl": 1.17292, "tp": 1.17271, "open": "2026-04-27 03:21:18", "close": "2026-04-27 03:22:27", "close_p": 1.17283, "profit": 0.03},
    {"pos": 987027938, "sym": "EURUSDm", "type": "sell", "vol": 0.01, "entry": 1.17117, "sl": 1.17129, "tp": None, "open": "2026-04-28 04:04:10", "close": "2026-04-28 04:04:51", "close_p": 1.17130, "profit": -0.13},
    {"pos": 987027943, "sym": "EURUSDm", "type": "sell", "vol": 0.01, "entry": 1.17117, "sl": 1.17125, "tp": None, "open": "2026-04-28 04:04:12", "close": "2026-04-28 04:04:35", "close_p": 1.17125, "profit": -0.08},
    {"pos": 987590288, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4596.362, "sl": 4564.659, "tp": None, "open": "2026-04-28 22:23:24", "close": "2026-04-29 08:42:02", "close_p": 4564.659, "profit": 63.40},
    {"pos": 987590289, "sym": "XAUUSDm", "type": "sell", "vol": 0.02, "entry": 4596.354, "sl": 4564.581, "tp": None, "open": "2026-04-28 22:23:25", "close": "2026-04-29 08:42:01", "close_p": 4564.604, "profit": 63.50},
    {"pos": 988378151, "sym": "AUDUSDm", "type": "buy", "vol": 0.01, "entry": 0.71195, "sl": 0.71184, "tp": None, "open": "2026-04-30 05:26:27", "close": "2026-04-30 05:26:35", "close_p": 0.71184, "profit": -0.11},
    {"pos": 989069319, "sym": "AUDUSDm", "type": "buy", "vol": 0.01, "entry": 0.72005, "sl": 0.71998, "tp": None, "open": "2026-05-01 07:24:44", "close": "2026-05-01 07:24:57", "close_p": 0.72000, "profit": -0.05},
]

print("=" * 95)
print("  FAKE SL DETECTION — Account 134157894 (Mom)")
print("  Method: Fetch M1 candles during trade, check if SL was on wrong side of price action")
print("=" * 95)
print()

for t in trades:
    # Basic info
    sl_dist = abs(t["entry"] - t["sl"])
    open_dt = datetime.fromisoformat(t["open"])
    close_dt = datetime.fromisoformat(t["close"])
    duration_sec = (close_dt - open_dt).total_seconds()
    duration_str = f"{int(duration_sec//3600)}h{int((duration_sec%3600)//60)}m" if duration_sec >= 3600 else f"{int(duration_sec//60)}m{int(duration_sec%60)}s"

    # Closed at SL?
    if "XAU" in t["sym"]:
        closed_at_sl = abs(t["close_p"] - t["sl"]) < 0.01
    else:
        closed_at_sl = abs(t["close_p"] - t["sl"]) < 0.00002

    # SL direction check
    if t["type"] == "sell":
        sl_above = t["sl"] > t["entry"]  # Normal for sell (SL above = loss protection)
        sl_below = t["sl"] < t["entry"]  # WRONG for sell (SL below = profit side = fake)
    else:
        sl_above = t["sl"] > t["entry"]  # WRONG for buy (SL above = profit side = fake)
        sl_below = t["sl"] < t["entry"]  # Normal for buy (SL below = loss protection)

    # Determine if SL is on wrong side
    if t["type"] == "sell":
        wrong_side = sl_below  # Sell SL should be ABOVE entry
    else:
        wrong_side = sl_above  # Buy SL should be BELOW entry

    # Fetch candles
    # Use M5 for trades > 1h, M1 for shorter
    tf = "M5" if duration_sec > 3600 else "M1"
    candle_result = get_candles(t["sym"], tf, t["open"], t["close"])
    candles = candle_result.get("candles", []) if candle_result.get("success") else []

    # Analyze candles
    if candles:
        highest = max(c["high"] for c in candles)
        lowest = min(c["low"] for c in candles)
    else:
        highest = t["entry"]
        lowest = t["entry"]

    # FAKE SL DETECTION:
    # A fake SL is one placed on the PROFIT side (below entry for sell, above for buy)
    # so it acts as a take-profit disguised as a stop-loss.
    # This lets the trader claim "I had an SL" while actually using it as TP.
    is_fake = False
    reason = ""

    if wrong_side:
        is_fake = True
        if t["type"] == "sell":
            reason = "SL BELOW entry (profit side) — acts as TP"
        else:
            reason = "SL ABOVE entry (profit side) — acts as TP"
    elif duration_sec < 30 and closed_at_sl:
        # Ultra-fast SL hit — likely intentional tiny SL
        is_fake = True
        reason = f"Hit SL in {int(duration_sec)}s — intentional instant loss"
    elif not wrong_side and closed_at_sl and duration_sec < 60:
        # Very fast SL hit with tight SL
        if "XAU" in t["sym"] and sl_dist < 2.0:
            is_fake = True
            reason = f"Tight SL (${sl_dist:.3f}) hit in {int(duration_sec)}s"
        elif "XAU" not in t["sym"] and sl_dist < 0.00015:
            is_fake = True
            reason = f"Tight SL ({sl_dist:.5f}) hit in {int(duration_sec)}s"

    # Print result
    verdict = f"🚩 FAKE — {reason}" if is_fake else "✅ VALID"
    sl_dir = "↓ below" if t["sl"] < t["entry"] else "↑ above"
    print(f"  Trade #{t['pos']} | {t['sym']} {t['type'].upper()} @ {t['entry']}")
    print(f"    SL: {t['sl']} ({sl_dir} entry, dist: {sl_dist:.3f}) | Duration: {duration_str} | P&L: ${t['profit']}")
    print(f"    Candles ({tf}): {len(candles)} | Range: {lowest:.3f} – {highest:.3f} | Closed@SL: {'YES' if closed_at_sl else 'NO'}")
    print(f"    → {verdict}")
    print()

# Summary
fakes = [t for t in trades if any(
    (t["type"] == "sell" and t["sl"] < t["entry"]) or
    (t["type"] == "buy" and t["sl"] > t["entry"]) or
    ((datetime.fromisoformat(t["close"]) - datetime.fromisoformat(t["open"])).total_seconds() < 30 and
     (abs(t["close_p"] - t["sl"]) < 0.01 if "XAU" in t["sym"] else abs(t["close_p"] - t["sl"]) < 0.00002))
    for _ in [1]
)]

print("=" * 95)
print("  SUMMARY")
print("=" * 95)
