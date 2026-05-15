"""
MT5 Terminal Test Script
Tests that all 10 MT5 terminals can be initialized and used to pull data.
Run this on the VPS: python test_mt5.py
"""

import MetaTrader5 as mt5
import time
import os

# Paths to all 10 MT5 terminals
TERMINALS = [f"C:\\MT5_{i}\\terminal64.exe" for i in range(1, 11)]

def test_terminal(terminal_path, index):
    """Test a single MT5 terminal"""
    print(f"\n{'='*50}")
    print(f"Testing Terminal {index}: {terminal_path}")
    print(f"{'='*50}")
    
    # Check if file exists
    if not os.path.exists(terminal_path):
        print(f"  ❌ File not found: {terminal_path}")
        return False
    
    # Initialize
    if not mt5.initialize(terminal_path):
        error = mt5.last_error()
        print(f"  ❌ Failed to initialize: {error}")
        mt5.shutdown()
        return False
    
    # Get version
    version = mt5.version()
    print(f"  ✅ Connected! Version: {version}")
    
    # Get terminal info
    info = mt5.terminal_info()
    if info:
        print(f"  📁 Data path: {info.data_path}")
        print(f"  🌐 Connected: {info.connected}")
        print(f"  📊 Trade allowed: {info.trade_allowed}")
    
    mt5.shutdown()
    return True


def test_login(terminal_path, account, password, server):
    """Test logging into an account"""
    print(f"\n{'='*50}")
    print(f"Testing Login: Account {account} on {server}")
    print(f"{'='*50}")
    
    if not mt5.initialize(terminal_path):
        print(f"  ❌ Failed to initialize terminal")
        mt5.shutdown()
        return False
    
    # Try to login
    if not mt5.login(int(account), password=password, server=server):
        error = mt5.last_error()
        print(f"  ❌ Login failed: {error}")
        mt5.shutdown()
        return False
    
    # Get account info
    account_info = mt5.account_info()
    if account_info:
        print(f"  ✅ Logged in successfully!")
        print(f"  👤 Name: {account_info.name}")
        print(f"  💰 Balance: ${account_info.balance}")
        print(f"  📊 Equity: ${account_info.equity}")
        print(f"  🏦 Server: {account_info.server}")
        print(f"  📱 Account: {account_info.login}")
    
    # Pull recent deals (last 30 days)
    from datetime import datetime, timedelta
    date_from = datetime.now() - timedelta(days=30)
    date_to = datetime.now()
    
    deals = mt5.history_deals_get(date_from, date_to)
    if deals:
        print(f"  📈 Deals in last 30 days: {len(deals)}")
        # Show last 3 deals
        for deal in deals[-3:]:
            print(f"     - {deal.symbol} | {deal.type} | Profit: ${deal.profit:.2f}")
    else:
        print(f"  📈 No deals in last 30 days")
    
    mt5.shutdown()
    return True


if __name__ == "__main__":
    print("=" * 60)
    print("   MT5 TERMINAL TEST - BirrForex Challenge Bot")
    print("=" * 60)
    
    # Test 1: Check all terminals can initialize
    print("\n\n📋 TEST 1: Terminal Initialization")
    print("-" * 40)
    
    results = []
    for i, path in enumerate(TERMINALS, 1):
        success = test_terminal(path, i)
        results.append(success)
        time.sleep(2)  # Wait between terminals
    
    print(f"\n\n📊 RESULTS:")
    print(f"  ✅ Passed: {sum(results)}/10")
    print(f"  ❌ Failed: {10 - sum(results)}/10")
    
    # Test 2: Optional - test login with a real account
    print("\n\n📋 TEST 2: Account Login (Optional)")
    print("-" * 40)
    print("To test a real login, edit this script and uncomment below:")
    print("# test_login(TERMINALS[0], '12345678', 'InvestorPassword', 'Exness-MT5Real9')")
    
    # Test with real account
    test_login(TERMINALS[0], '435923524', 'Aa@11221234', 'Exness-MT5Trial9')
    
    print("\n\n✅ Test complete!")
    print("If all 10 terminals passed, your VPS is ready for the worker script.")
