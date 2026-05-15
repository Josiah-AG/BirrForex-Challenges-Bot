"""
WinnerPip VPS API — Credential Verification & Trade Pull Service
Runs on the Windows VPS with MT5 terminals installed.

Endpoints:
  POST /verify  — Verify MT5 credentials (account + server + investor password)
  GET  /health  — Health check

Run: python vps/verify_api.py
"""

import MetaTrader5 as mt5
import time
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="WinnerPip VPS API", version="1.0.0")

# Use terminal 1 for verification (dedicated to instant checks)
VERIFY_TERMINAL = r"C:\MT5_1\terminal64.exe"

# API key for security (set this to a random string)
API_KEY = os.environ.get("VPS_API_KEY", "birrfx-vps-secret-key-change-me")


class VerifyRequest(BaseModel):
    account: str
    server: str
    password: str
    api_key: str


class VerifyResponse(BaseModel):
    success: bool
    message: str
    account_name: str | None = None
    balance: float | None = None
    equity: float | None = None
    server: str | None = None


@app.get("/health")
def health():
    return {"status": "ok", "terminals": 10}


@app.post("/verify", response_model=VerifyResponse)
def verify_credentials(req: VerifyRequest):
    """Verify MT5 credentials by attempting to login"""

    # Check API key
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Initialize MT5 terminal
    if not mt5.initialize(VERIFY_TERMINAL):
        error = mt5.last_error()
        return VerifyResponse(
            success=False,
            message=f"MT5 terminal error: {error}",
        )

    # Attempt login
    account_number = int(req.account.replace("#", "").replace(" ", ""))
    if not mt5.login(account_number, password=req.password, server=req.server):
        error = mt5.last_error()
        mt5.shutdown()
        return VerifyResponse(
            success=False,
            message=f"Login failed: {error}",
        )

    # Get account info
    account_info = mt5.account_info()
    if not account_info:
        mt5.shutdown()
        return VerifyResponse(
            success=False,
            message="Could not retrieve account info",
        )

    result = VerifyResponse(
        success=True,
        message="Credentials verified successfully",
        account_name=account_info.name,
        balance=account_info.balance,
        equity=account_info.equity,
        server=account_info.server,
    )

    mt5.shutdown()
    return result


if __name__ == "__main__":
    print("=" * 50)
    print("  WinnerPip VPS API")
    print("  Credential Verification Service")
    print("=" * 50)
    print(f"\n  API Key: {API_KEY}")
    print(f"  Terminal: {VERIFY_TERMINAL}")
    print(f"\n  Starting on http://0.0.0.0:8000")
    print("=" * 50)

    uvicorn.run(app, host="0.0.0.0", port=8000)
