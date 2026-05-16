"""
VPS API — Candle Endpoint
Add this to your existing VPS API (FastAPI or Flask).

This endpoint fetches M1 OHLC candle data from MT5 for SL validation.
The WinnerPip evaluation engine calls this to verify if a stop loss
was truly active during a trade's open period.

Usage:
POST /api/v1/candles
{
    "symbol": "EURUSDm",
    "timeframe": "M1",
    "from_time": "2026-05-14 10:15:00",
    "to_time": "2026-05-14 14:30:00",
    "terminal_id": 1
}

Returns:
{
    "success": true,
    "candles": [
        {"time": "2026-05-14 10:15:00", "open": 1.08450, "high": 1.08480, "low": 1.08420, "close": 1.08460},
        ...
    ],
    "count": 255
}
"""

# ============================================================
# FastAPI version
# ============================================================

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime
import MetaTrader5 as mt5
from typing import Optional

router = APIRouter()


class CandleRequest(BaseModel):
    symbol: str
    timeframe: str = "M1"  # M1, M5, M15, H1, etc.
    from_time: str  # "2026-05-14 10:15:00"
    to_time: str    # "2026-05-14 14:30:00"
    terminal_id: Optional[int] = 1


TIMEFRAME_MAP = {
    "M1": mt5.TIMEFRAME_M1,
    "M5": mt5.TIMEFRAME_M5,
    "M15": mt5.TIMEFRAME_M15,
    "M30": mt5.TIMEFRAME_M30,
    "H1": mt5.TIMEFRAME_H1,
    "H4": mt5.TIMEFRAME_H4,
    "D1": mt5.TIMEFRAME_D1,
}


@router.post("/api/v1/candles")
async def get_candles(req: CandleRequest):
    """
    Fetch OHLC candle data from MT5 for a given symbol and time range.
    Used by the evaluation engine to validate stop loss authenticity.
    """
    try:
        # Parse times
        from_dt = datetime.strptime(req.from_time, "%Y-%m-%d %H:%M:%S")
        to_dt = datetime.strptime(req.to_time, "%Y-%m-%d %H:%M:%S")

        # Get timeframe
        tf = TIMEFRAME_MAP.get(req.timeframe.upper(), mt5.TIMEFRAME_M1)

        # Ensure MT5 is initialized
        if not mt5.initialize():
            raise HTTPException(status_code=500, detail="MT5 initialization failed")

        # Fetch rates
        rates = mt5.copy_rates_range(req.symbol, tf, from_dt, to_dt)

        if rates is None or len(rates) == 0:
            # Try without the 'm' suffix (some symbols differ)
            alt_symbol = req.symbol.rstrip('m').rstrip('c')
            rates = mt5.copy_rates_range(alt_symbol, tf, from_dt, to_dt)

        if rates is None or len(rates) == 0:
            return {
                "success": True,
                "candles": [],
                "count": 0,
                "message": f"No candle data available for {req.symbol} in the requested range"
            }

        # Convert to list of dicts
        candles = []
        for rate in rates:
            candles.append({
                "time": datetime.utcfromtimestamp(rate['time']).strftime("%Y-%m-%d %H:%M:%S"),
                "open": float(rate['open']),
                "high": float(rate['high']),
                "low": float(rate['low']),
                "close": float(rate['close']),
                "volume": int(rate['tick_volume']),
            })

        return {
            "success": True,
            "candles": candles,
            "count": len(candles),
        }

    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "candles": [],
            "count": 0,
        }


# ============================================================
# If using Flask instead of FastAPI, here's the equivalent:
# ============================================================
"""
from flask import Blueprint, request, jsonify

candles_bp = Blueprint('candles', __name__)

@candles_bp.route('/api/v1/candles', methods=['POST'])
def get_candles():
    data = request.json
    symbol = data.get('symbol')
    from_time = data.get('from_time')
    to_time = data.get('to_time')
    
    from_dt = datetime.strptime(from_time, "%Y-%m-%d %H:%M:%S")
    to_dt = datetime.strptime(to_time, "%Y-%m-%d %H:%M:%S")
    
    if not mt5.initialize():
        return jsonify({"success": False, "error": "MT5 init failed"}), 500
    
    rates = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M1, from_dt, to_dt)
    
    if rates is None or len(rates) == 0:
        return jsonify({"success": True, "candles": [], "count": 0})
    
    candles = [{"time": datetime.utcfromtimestamp(r['time']).strftime("%Y-%m-%d %H:%M:%S"),
                "open": float(r['open']), "high": float(r['high']),
                "low": float(r['low']), "close": float(r['close'])} for r in rates]
    
    return jsonify({"success": True, "candles": candles, "count": len(candles)})
"""
