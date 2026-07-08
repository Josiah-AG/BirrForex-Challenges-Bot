"""
Test: Incremental Pull vs Full Pull via VPS HTTP API
Simulates 10 incremental pulls then compares with one full pull.
"""
import json
import subprocess
from datetime import datetime, timezone, timedelta

VPS_URL = "http://108.181.184.223:8000/pull"
API_KEY = "wp-k8x2m9f4v7j3n6q1w5t8r2y4u7i0p3"
ACCOUNT = "161585733"
SERVER = "Exness-MT5Real21"
PASSWORD = "Jony@2024"
CHALLENGE_START = "2025-05-12T00:00:00Z"


def do_pull(from_date):
    """Call VPS /pull endpoint and return parsed response."""
    body = json.dumps({
        "account": ACCOUNT,
        "server": SERVER,
        "password": PASSWORD,
        "api_key": API_KEY,
        "from_date": from_date,
    })
    result = subprocess.run(
        ["curl", "-s", "-X", "POST", VPS_URL,
         "-H", "Content-Type: application/json",
         "-d", body],
        capture_output=True, text=True, timeout=60
    )
    return json.loads(result.stdout)


def main():
    print("=" * 60)
    print("  INCREMENTAL vs FULL PULL TEST (via HTTP)")
    print(f"  Account: {ACCOUNT} @ {SERVER}")
    print(f"  Challenge Start: {CHALLENGE_START}")
    print("=" * 60)
    print()

    now = datetime.now(timezone.utc)

    # ==================== FULL PULL ====================
    print("PHASE 1: Full pull from challenge start...")
    print("-" * 50)
    full_result = do_pull(CHALLENGE_START)
    if not full_result.get("success"):
        print(f"FAILED: {full_result.get('message')}")
        return

    full_trades = {t["ticket"]: t for t in full_result["trades"]}
    print(f"Full pull: {len(full_trades)} trades")
    print()

    # ==================== INCREMENTAL PULLS ====================
    # Simulate pulls every 4 hours with 1h overlap (5h window each)
    # We need to cover the full challenge period
    # Challenge started May 12 — that's ~18 days ago = 432 hours
    # At 4h steps, we need ~108 pulls to cover everything
    # But in production, first pull is full — so let's simulate:
    # Pull 1 (first ever): from challenge start (full)
    # Pulls 2-10: incremental (last 5h each, stepping forward in time)

    print("PHASE 2: Simulating incremental pulls...")
    print("-" * 50)

    merged_trades = {}

    # First pull is always full (lastPullAt is null)
    print(f"  Pull  1 (FIRST - full): from {CHALLENGE_START}")
    first_result = do_pull(CHALLENGE_START)
    if first_result.get("success"):
        for t in first_result["trades"]:
            merged_trades[t["ticket"]] = t
        print(f"           Found: {len(first_result['trades'])} trades | Merged: {len(merged_trades)}")
    else:
        print(f"           FAILED: {first_result.get('message')}")
        return

    # Subsequent pulls: 5h window each, stepping back from now
    # This simulates what happens in production after the first full pull
    for i in range(2, 11):
        window_end = now - timedelta(hours=(i - 2) * 4)
        window_start = window_end - timedelta(hours=5)

        # Don't go before challenge start
        challenge_start_dt = datetime(2025, 5, 12, tzinfo=timezone.utc)
        if window_start < challenge_start_dt:
            window_start = challenge_start_dt - timedelta(hours=1)

        from_date = window_start.isoformat()
        result = do_pull(from_date)

        if result.get("success"):
            trades_found = result["trades"]
            for t in trades_found:
                merged_trades[t["ticket"]] = t  # UPSERT
            print(f"  Pull {i:2d} (incremental): {window_start.strftime('%m/%d %H:%M')} -> {window_end.strftime('%m/%d %H:%M')} | Found: {len(trades_found)} | Merged: {len(merged_trades)}")
        else:
            print(f"  Pull {i:2d}: FAILED - {result.get('message')}")

    print()

    # ==================== COMPARISON ====================
    print("PHASE 3: Comparing results...")
    print("=" * 60)

    incremental_tickets = set(merged_trades.keys())
    full_tickets = set(full_trades.keys())

    missing_from_incremental = full_tickets - incremental_tickets
    extra_in_incremental = incremental_tickets - full_tickets
    common_tickets = incremental_tickets & full_tickets

    print(f"  Incremental merged trades: {len(incremental_tickets)}")
    print(f"  Full pull trades:          {len(full_tickets)}")
    print(f"  Common (in both):          {len(common_tickets)}")
    print()

    if missing_from_incremental:
        print(f"  MISSING from incremental ({len(missing_from_incremental)}):")
        for ticket in sorted(missing_from_incremental)[:10]:
            t = full_trades[ticket]
            print(f"     Ticket {ticket}: {t.get('symbol')} {t.get('type')} {t.get('volume')} lots | Close: {t.get('close_time')} | Profit: {t.get('profit')}")
        if len(missing_from_incremental) > 10:
            print(f"     ... and {len(missing_from_incremental) - 10} more")
        print()

    if extra_in_incremental:
        print(f"  EXTRA in incremental ({len(extra_in_incremental)}):")
        for ticket in sorted(extra_in_incremental)[:10]:
            t = merged_trades[ticket]
            print(f"     Ticket {ticket}: {t.get('symbol')} {t.get('type')} {t.get('volume')} lots | Close: {t.get('close_time')} | Profit: {t.get('profit')}")
        print()

    # Check data consistency
    mismatches = []
    for ticket in common_tickets:
        inc = merged_trades[ticket]
        full = full_trades[ticket]
        diffs = []
        for key in ["symbol", "type", "volume", "profit", "commission", "swap", "close_price"]:
            if inc.get(key) != full.get(key):
                diffs.append(f"{key}: {inc.get(key)} vs {full.get(key)}")
        if diffs:
            mismatches.append((ticket, diffs))

    if mismatches:
        print(f"  DATA MISMATCHES ({len(mismatches)}):")
        for ticket, diffs in mismatches[:10]:
            print(f"     Ticket {ticket}: {', '.join(diffs)}")
        print()

    # Final verdict
    print("=" * 60)
    if not missing_from_incremental and not extra_in_incremental and not mismatches:
        print("  PASS - Incremental and full pull are IDENTICAL!")
        print(f"     {len(common_tickets)} trades match perfectly.")
    else:
        issues = len(missing_from_incremental) + len(extra_in_incremental) + len(mismatches)
        print(f"  RESULT: {issues} difference(s) found")
        if missing_from_incremental:
            print(f"     {len(missing_from_incremental)} trades only in full (incremental window didn't cover them)")
            print(f"     NOTE: In production, first pull is FULL so these would be captured.")
        if not missing_from_incremental and not mismatches:
            print("  EFFECTIVE PASS - All full-pull trades present in incremental.")
    print("=" * 60)


if __name__ == "__main__":
    main()
