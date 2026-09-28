# Idle worker recovery (2026-09-28)

Workers previously relied on incoming requests for IPC recovery. Once the router
excluded a disconnected worker, it could remain disconnected indefinitely.

The idle watchdog checks every 15 seconds, taking both recovery and operation
locks without waiting. Busy workers are left alone. It reconnects to the saved
base account, then escalates after three failed attempts to restarting only its
own MT5 executable with the existing EA startup configuration. Failed attempts
back off up to several minutes; hard restarts are separated by at least five
minutes. Existing dead-mode recovery retains ownership in dead mode.

Visible worker CMDs now restart an exited Python process after 15 seconds.
Closing the CMD still intentionally stops that supervisor. The desktop launcher
continues to replace its own previous consoles. The Python deployment script
also stops the matching old console before starting a replacement, preventing
duplicate supervisors.

Health includes `idle_recovery` (version, last check, result, recovered count).
This is separate from EA verification: connected IPC alone does not prove the
EA is responding. An OS-level hang, closed supervisor, VPS outage, or unavailable
broker is not guaranteed recoverable by this watchdog.

## Validation

- 60 Python tests pass, including idle recovery without routed requests,
  operation/recovery lock exclusion, backoff, failed restart retry, and errors.
- Terminal 1 isolated from routing during live fault injection. Killing its
  Python child recovered automatically in 19.2 seconds with the CMD retained.
- Killing only its MT5 process required retries and a scoped terminal restart;
  IPC then recovered automatically, followed by a verified EA probe. This took
  several minutes, not an immediate recovery. No other MT5 was killed.
- Rollout uses one drained worker at a time and stops on health/EA failure.

## Emergency disable and rollback

Live backups: `C:\ProgramData\WinnerPip\idle-recovery-20260928` contains
`worker.py.before` and `start_vps.bat.before` from before this change.

1. To disable a worker's idle watchdog immediately, create an empty file
   `C:\BirrForex\vps\watchdog_N.disabled` (N is the terminal number).
   Remove it to re-enable. This does not stop ordinary account operations.
2. To stop Python auto-respawn while keeping the CMD, create
   `C:\BirrForex\vps\stop_worker_N.flag` before stopping Python.
   Remove the flag before restarting through the desktop launcher.
3. For full rollback, restore the two `.before` files to their original names
   under `C:\BirrForex\vps`. Drain and replace each worker's CMD one at a time,
   wait for IPC and EA verification, then remove its drain. Do not reuse the
   rollout script's version-1 requirement with the old worker. The optional
   `idle_recovery.py` file can remain unused.
4. No database/schema/account-history changes are part of this patch.

The shared startup/code paths cover installed terminals 1–15; inactive 13–15
load the same recovery code when started. They need not be activated to deploy.
