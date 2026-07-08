"""
Test: Incremental Pull vs Full Pull — Verify identical results
Run on VPS: py -3.12 test_incremental_pull.py

This script:
1. Logs into account 161585733 on Exness-MT5Real21
2. Simulates 10 incremental pulls (each covering a 5-hour window, stepping back in time)
3. Merges all incremental results (like the scheduler does with UPSERT)
4. Does one full pull from challenge start (May 12, 2025)
5. Compares: incremental merged trades == full pull trades
"""

import MetaTrader5 as mt5
import sys
from datetime import datetime, timezone, timedelta
from collections import OrderedDict

# Account credentials
ACCOUNT = 161585733
SERVER = "Exness-MT5Real21"
PASSWORD = "Jony@2024"

# Challenge start date (adjust if different)
CHALLENGE_START = datetime(2025, 5, 12, tzinfo=timezone.utc)

# Terminal path (adjust to your VPS terminal)
TERMINAL_PATH = r"C:\MetaTrader\Terminal 1\terminal64.exe"


def init_mt5():
    """Initialize MT5 and login."""
    if not mt5.initialize(TERMINAL_PATH):
        print(f"❌ MT5 init failed: {mt5.last_error()}")
        sys.exit(1)

    if not mt5.login(ACCOUNT, password=PASSWORD, server=SERVER):
        print(f"❌ Login failed: {mt5.last_error()}")
        mt5.shutdown()
        sys.exit(1)

    info = mt5.account_info()
    print(f"✅ Logged in: {info.name} | Balance: {info.balance} | Server: {info.server}")
    print()


def pull_trades(from_date, to_date, orders_from_date):
    """
    Pull trades using the same logic as worker.py do_pull.
    Returns dict of {ticket: trade_dict}
    """
    # Fetch deals in the window
    deals_raw = mt5.history_deals_get(from_date, to_date)

    # Fetch orders from full challenge period (for open_time/open_price)
    orders_raw = mt5.history_orders_get(orders_from_date, to_date)

    orders_by_position = {}
    if orders_raw is not None:
        for order in orders_raw:
            pos_id = order.position_id
            if pos_id and pos_id not in orders_by_position:
                orders_by_position[pos_id] = {
                    "sl": order.sl,
                    "tp": order.tp,
                    "open_time": datetime.fromtimestamp(order.time_setup, tz=timezone.utc).isoformat() if order.time_setup else None,
                    "open_price": order.price_open,
                }

    # First pass: index opening deals
    open_deals_by_position = {}
    deals_list = []

    if deals_raw is not None:
        for deal in deals_raw:
            deals_list.append(deal)
            if deal.entry == 0 and deal.symbol and deal.position_id:
                open_deals_by_position[deal.position_id] = {
                    "time": datetime.fromtimestamp(deal.time, tz=timezone.utc).isoformat(),
                    "price": deal.price,
                    "type": deal.type,
                }

    # Second pass: each closing deal becomes a trade
    trades = {}
    if deals_raw is not None:
        for deal in deals_raw:
            if deal.entry == 1 and deal.symbol:
                trade_ticket = deal.ticket
                pos_id = deal.position_id or deal.ticket

                open_deal = open_deals_by_position.get(pos_id, {})
                if open_deal:
                    trade_type = "Buy" if open_deal.get("type") == 0 else "Sell" if open_deal.get("type") == 1 else "Other"
                else:
                    trade_type = "Sell" if deal.type == 0 else "Buy" if deal.type == 1 else "Other"

                order_info = orders_by_position.get(pos_id, {})
                open_time = order_info.get("open_time") or open_deal.get("time")
                open_price = order_info.get("open_price") or open_deal.get("price", deal.price)

                trades[trade_ticket] = {
                    "ticket": trade_ticket,
                    "position_id": pos_id,
                    "symbol": deal.symbol,
                    "type": trade_type,
                    "volume": deal.volume,
                    "open_time": open_time,
                    "close_time": datetime.fromtimestamp(deal.time, tz=timezone.utc).isoformat(),
                    "open_price": open_price,
                    "close_price": deal.price,
                    "stop_loss": order_info.get("sl", 0),
                    "take_profit": order_info.get("tp", 0),
                    "profit": deal.profit,
                    "commission": deal.commission,
                    "swap": deal.swap,
                }

    return trades


def main():
    print("=" * 60)
    print("  INCREMENTAL vs FULL PULL TEST")
    print(f"  Account: {ACCOUNT} @ {SERVER}")
    print(f"  Challenge Start: {CHALLENGE_START.isoformat()}")
    print("=" * 60)
    print()

    init_mt5()

    now = datetime.now(timezone.utc)
    orders_from_date = CHALLENGE_START - timedelta(hours=1)

    # ==================== INCREMENTAL PULLS ====================
    # Simulate 10 pulls, each covering 5 hours, stepping back from now
    # Pull 1: now-5h to now
    # Pull 2: now-10h to now-5h (but with 1h overlap = now-11h to now-5h)
    # ...etc
    # This simulates what happens over 5 days with 2 pulls/day (every 4h with 1h overlap)

    print("📊 PHASE 1: Simulating 10 incremental pulls...")
    print("-" * 50)

    merged_trades = {}  # Simulates UPSERT — later pulls overwrite same ticket
    total_deals_window = timedelta(hours=5)  # 4h window + 1h overlap

    for i in range(10):
        # Each pull covers a 5-hour window, stepping back in time
        # Pull 0: most recent 5h
        # Pull 1: 4h-9h ago (1h overlap with pull 0)
        # Pull 2: 8h-13h ago (1h overlap with pull 1)
        # etc.
        window_end = now - timedelta(hours=i * 4)
        window_start = window_end - total_deals_window

        # Don't go before challenge start
        if window_start < CHALLENGE_START:
            window_start = CHALLENGE_START - timedelta(hours=1)

        trades = pull_trades(window_start, window_end, orders_from_date)

        # UPSERT: merge into accumulated results (same as DB ON CONFLICT DO UPDATE)
        for ticket, trade in trades.items():
            merged_trades[ticket] = trade

        print(f"  Pull {i+1:2d}: {window_start.strftime('%m/%d %H:%M')} → {window_end.strftime('%m/%d %H:%M')} UTC | Found: {len(trades)} trades | Merged total: {len(merged_trades)}")

    print()
    print(f"✅ Incremental result: {len(merged_trades)} unique trades")
    print()

    # ==================== FULL PULL ====================
    print("📊 PHASE 2: Full pull from challenge start...")
    print("-" * 50)

    full_from = CHALLENGE_START - timedelta(hours=1)
    full_trades = pull_trades(full_from, now, orders_from_date)

    print(f"✅ Full pull result: {len(full_trades)} trades")
    print()

    # ==================== COMPARISON ====================
    print("📊 PHASE 3: Comparing results...")
    print("=" * 60)

    incremental_tickets = set(merged_trades.keys())
    full_tickets = set(full_trades.keys())

    missing_from_incremental = full_tickets - incremental_tickets
    extra_in_incremental = incremental_tickets - full_tickets
    common_tickets = incremental_tickets & full_tickets

    print(f"  Incremental unique trades: {len(incremental_tickets)}")
    print(f"  Full pull unique trades:   {len(full_tickets)}")
    print(f"  Common (in both):          {len(common_tickets)}")
    print()

    if missing_from_incremental:
        print(f"  ❌ MISSING from incremental ({len(missing_from_incremental)}):")
        for ticket in sorted(missing_from_incremental):
            t = full_trades[ticket]
            print(f"     Ticket {ticket}: {t['symbol']} {t['type']} {t['volume']} lots | Close: {t['close_time']} | Profit: {t['profit']}")
        print()

    if extra_in_incremental:
        print(f"  ⚠️ EXTRA in incremental ({len(extra_in_incremental)}):")
        for ticket in sorted(extra_in_incremental):
            t = merged_trades[ticket]
            print(f"     Ticket {ticket}: {t['symbol']} {t['type']} {t['volume']} lots | Close: {t['close_time']} | Profit: {t['profit']}")
        print()

    # Check data consistency for common tickets
    mismatches = []
    for ticket in common_tickets:
        inc = merged_trades[ticket]
        full = full_trades[ticket]
        diffs = []
        for key in ["symbol", "type", "volume", "profit", "commission", "swap", "close_price", "open_price"]:
            if inc.get(key) != full.get(key):
                diffs.append(f"{key}: {inc.get(key)} vs {full.get(key)}")
        if diffs:
            mismatches.append((ticket, diffs))

    if mismatches:
        print(f"  ⚠️ DATA MISMATCHES ({len(mismatches)}):")
        for ticket, diffs in mismatches[:10]:
            print(f"     Ticket {ticket}: {', '.join(diffs)}")
        print()

    # Final verdict
    print("=" * 60)
    if not missing_from_incremental and not extra_in_incremental and not mismatches:
        print("  ✅ PASS — Incremental and full pull are IDENTICAL!")
        print(f"     {len(common_tickets)} trades match perfectly.")
    else:
        issues = len(missing_from_incremental) + len(extra_in_incremental) + len(mismatches)
        print(f"  ❌ FAIL — {issues} issue(s) found")
        if missing_from_incremental:
            print(f"     • {len(missing_from_incremental)} trades missing from incremental (window too narrow?)")
        if extra_in_incremental:
            print(f"     • {len(extra_in_incremental)} extra trades in incremental (outside challenge period?)")
        if mismatches:
            print(f"     • {len(mismatches)} trades with data differences")
    print("=" * 60)

    mt5.shutdown()


if __name__ == "__main__":
    main()
