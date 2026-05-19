"""
WinnerPip VPS Keep-Alive — Prevents Exness Demo Account Archival

Run twice daily via Task Scheduler (e.g., 04:00 and 16:00 EAT).
Uses Terminal 1 only. Opens a random 0.01 lot trade, waits 5 minutes, closes it.

Usage: py -3.12 vps\keepalive.py
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

# Symbols to trade (pick one randomly)
SYMBOLS = ["EURUSD", "GBPUSD", "AUDUSD"]
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

    # Pick random symbol
    symbol = random.choice(SYMBOLS)
    log(f"Selected symbol: {symbol}")

    # Ensure symbol is visible
    if not mt5.symbol_select(symbol, True):
        log(f"WARNING: Could not select {symbol}, trying next...")
        for s in SYMBOLS:
            if mt5.symbol_select(s, True):
                symbol = s
                log(f"Using fallback symbol: {symbol}")
                break
        else:
            log("FAILED: No symbols available")
            mt5.shutdown()
            return False

    time.sleep(1)

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

    log(f"Opening {type_name} {VOLUME} {symbol} @ {price}")

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
        "type_filling": mt5.ORDER_FILLING_IOC,
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
                    "type_filling": mt5.ORDER_FILLING_IOC,
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
