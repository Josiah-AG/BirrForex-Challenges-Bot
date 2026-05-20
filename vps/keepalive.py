"""
WinnerPip VPS Keep-Alive — Prevents Exness Demo Account Archival

Run twice daily via Task Scheduler (e.g., 04:00 and 16:00 EAT).
Uses Terminal 1 only. Opens a random 0.01 lot trade, waits 5 minutes, closes it.

Usage: py -3.12 vps/keepalive.py
"""

import MetaTrader5 as mt5
import time
import random
from datetime import datetime

# Configuration
TERMINAL_PATH = r"C:\MetaTrader\Terminal 1\terminal64.exe"
BASE_ACCOUNT = 435924397
BASE_PASSWORD = "Abc@1234"
BASE_SERVER = "Exness-MT5Trial9"

# Symbols to try (cent account uses 'm' suffix on Exness Trial servers)
SYMBOLS = ["EURUSDm", "GBPUSDm", "USDJPYm", "AUDUSDm", "NZDUSDm", "USDCADm", "EURGBPm"]
VOLUME = 0.01
WAIT_SECONDS = 300  # 5 minutes


def log(msg: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {msg}")


def run_keepalive():
    log("=" * 50)
    log("Keep-Alive Starting")
    log("=" * 50)

    # Initialize terminal
    try:
        mt5.shutdown()
    except:
        pass
    time.sleep(0.5)

    if not mt5.initialize(TERMINAL_PATH):
        error = mt5.last_error()
        log(f"FAILED: Could not initialize terminal: {error}")
        return False

    # Login to base account
    if not mt5.login(BASE_ACCOUNT, password=BASE_PASSWORD, server=BASE_SERVER):
        error = mt5.last_error()
        log(f"FAILED: Could not login to base account: {error}")
        mt5.shutdown()
        return False

    info = mt5.account_info()
    log(f"Logged in — Balance: {info.balance}, Equity: {info.equity}")

    # Wait for terminal to fully sync symbols
    log("Waiting for terminal sync...")
    time.sleep(5)

    # Try to find an available symbol
    symbol = None
    random.shuffle(SYMBOLS)

    for s in SYMBOLS:
        # Try to add to Market Watch
        if mt5.symbol_select(s, True):
            # Verify it's actually available
            time.sleep(0.5)
            si = mt5.symbol_info(s)
            if si and si.trade_mode == mt5.SYMBOL_TRADE_MODE_FULL:
                symbol = s
                log(f"Symbol available: {s}")
                break
            else:
                log(f"  {s} — selected but not tradeable (mode={si.trade_mode if si else 'None'})")
        else:
            log(f"  {s} — not available")

    if not symbol:
        # Last resort: check what symbols ARE available
        all_symbols = mt5.symbols_get()
        if all_symbols:
            tradeable = [s for s in all_symbols if s.trade_mode == mt5.SYMBOL_TRADE_MODE_FULL and "USD" in s.name]
            if tradeable:
                symbol = tradeable[0].name
                mt5.symbol_select(symbol, True)
                time.sleep(0.5)
                log(f"Using auto-detected symbol: {symbol}")
            else:
                log(f"FAILED: No tradeable USD symbols found. Total symbols: {len(all_symbols)}")
                # Log first 10 symbols for debugging
                for s in all_symbols[:10]:
                    log(f"  Available: {s.name} (mode={s.trade_mode})")
                mt5.shutdown()
                return False
        else:
            log("FAILED: No symbols returned from terminal at all")
            mt5.shutdown()
            return False

    # Get symbol info for filling
    symbol_info = mt5.symbol_info(symbol)
    if symbol_info is None:
        log(f"FAILED: Could not get info for {symbol}")
        mt5.shutdown()
        return False

    # Randomly buy or sell
    trade_type = random.choice([mt5.ORDER_TYPE_BUY, mt5.ORDER_TYPE_SELL])
    price = symbol_info.ask if trade_type == mt5.ORDER_TYPE_BUY else symbol_info.bid
    type_name = "BUY" if trade_type == mt5.ORDER_TYPE_BUY else "SELL"

    # Determine correct filling mode for this symbol
    # Exness typically uses FOK for forex pairs
    filling_mode = mt5.ORDER_FILLING_FOK

    log(f"Opening {type_name} {VOLUME} {symbol} @ {price} (filling: {filling_mode})")

    # Open trade
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": VOLUME,
        "type": trade_type,
        "price": price,
        "deviation": 20,
        "magic": 999999,
        "comment": "keepalive",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": filling_mode,
    }

    result = mt5.order_send(request)
    if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
        retcode = result.retcode if result else "None"
        comment = result.comment if result else "No result"
        log(f"FAILED: Order send failed — retcode={retcode}, comment={comment}")
        mt5.shutdown()
        return False

    position_ticket = result.order
    log(f"Trade opened — ticket: {position_ticket}")

    # Wait 5 minutes
    log(f"Waiting {WAIT_SECONDS} seconds...")
    time.sleep(WAIT_SECONDS)

    # Close the trade
    # Get current positions to find our trade
    positions = mt5.positions_get(symbol=symbol)
    if positions:
        for pos in positions:
            if pos.magic == 999999 and pos.comment == "keepalive":
                # Close this position
                close_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
                close_price = symbol_info.bid if pos.type == mt5.ORDER_TYPE_BUY else symbol_info.ask

                # Refresh price
                tick = mt5.symbol_info_tick(symbol)
                if tick:
                    close_price = tick.bid if pos.type == mt5.ORDER_TYPE_BUY else tick.ask

                close_request = {
                    "action": mt5.TRADE_ACTION_DEAL,
                    "symbol": symbol,
                    "volume": pos.volume,
                    "type": close_type,
                    "position": pos.ticket,
                    "price": close_price,
                    "deviation": 20,
                    "magic": 999999,
                    "comment": "keepalive_close",
                    "type_time": mt5.ORDER_TIME_GTC,
                    "type_filling": filling_mode,
                }

                close_result = mt5.order_send(close_request)
                if close_result and close_result.retcode == mt5.TRADE_RETCODE_DONE:
                    log(f"Trade closed — ticket: {pos.ticket}, profit: {pos.profit}")
                else:
                    retcode = close_result.retcode if close_result else "None"
                    log(f"WARNING: Close failed — retcode={retcode}")
    else:
        log("WARNING: No positions found to close (may have been closed by SL/TP)")

    mt5.shutdown()
    log("Keep-Alive Complete")
    log("=" * 50)
    return True


if __name__ == "__main__":
    success = run_keepalive()
    if not success:
        log("Keep-alive FAILED — check terminal and account status")
        exit(1)
