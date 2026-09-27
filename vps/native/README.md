# Optional myFXpath closing-level reader

`MyFxPathLevels.mq5` is read-only: no orders, trades, DLLs or WebRequest calls.
Compile with MetaEditor. Install EX5 under each numbered terminal's actual data directory at `MQL5/Experts/MyFxPath/MyFxPathLevels.ex5`, and create `MQL5/Files/MyFxPathLevels`.

Startup configuration uses `[Experts] Enabled=1, AllowLiveTrading=0, AllowDllImport=0, Account=0, Profile=0` and `[StartUp] Expert=MyFxPath\MyFxPathLevels, Symbol=EURUSDm, Period=M1, ShutdownTerminal=0`. The startup chart moves to the local, non-tradable `MyFxPath.Reader` custom symbol so account switches do not depend on broker symbol suffixes. Preserve and remove unused default profile charts when window resources are constrained; keep a complete profile backup first.

The worker regenerates this startup block only when `native_sltp_N.installed` exists beside `worker.py`. Recovery also requires `native_sltp_N.enabled`, `priority=true`, `native_sltp=true`, and protocol 2. WinnerPip requests do not opt in. Removing `.enabled` is an immediate per-terminal kill switch. myFXpath has a separate `NATIVE_SLTP_ENABLED` flag, false by default.

## Isolation and limits

The normal worker lock remains held throughout the read. Requests contain a nonce, account/server identity, expiry, and exact closing-deal/position IDs; no password. Responses must match symbol and close time as well. The terminal-specific sandbox and account checks prevent another account's evidence from being used. Duplicate EA instances share an exclusive file guard. The request is bounded to 5,000 deals and 1.5 seconds by default. Failure leaves the original verified pull intact; zero values are never invented.

Returned levels are protection at closing, not proof of initial SL/TP. Applications must retain that provenance and protect user overrides. Initial-risk/whole-trade level calculations must not treat closing-only evidence as entry protection.

## Rolling maintenance

Create `maintenance_N.drain` beside the router, wait for dispatcher observation and the worker's busy flag to clear, then stop/restart that worker and terminal only. The router excludes drained terminals from new leases and checks the marker again before forwarding. Existing leases finish normally. Remove the marker only after health, fresh reader heartbeat, and a controlled read pass. Never restart the full pool during registration.

A startup connection flag can precede the first EA heartbeat: wait for both. Idle CMD consoles from previous restarts can exhaust desktop resources; close only consoles without application children. Do not terminate unrelated terminals or live service consoles.

## Rollback

1. Remove `.enabled` markers and disable the myFXpath flag to stop new recovery reads.
2. Drain one terminal at a time; restore its original base INI and default chart profile, remove `.installed`, restore original worker code if needed, then restart and verify.
3. Restore the router only when idle. Keep `native_sltp.py` present until no running worker imports it.
4. Do not blindly restore a whole journal snapshot over later manual edits. The application archives pre-enrichment trade/partial-exit data and retains field-level provenance. Retaining the new application with recovery disabled keeps provenance-aware analytics safe while any data rollback is reviewed.

The 2026-09-27 rollout backups and verification records are under `C:\ProgramData\WinnerPip\native-recovery-20260927` (Administrator/SYSTEM only). Original worker is `worker-before.py`; router is `router.py`; configs/profiles are per terminal. Operational test scripts there are specific to the owner's test account and must not be reused as generic account tests.
