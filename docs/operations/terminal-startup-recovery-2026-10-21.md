# Terminal 11 recovery — 2026-10-21

Terminal 11 repeatedly timed out during MT5 startup. Its worker reported
`connection_timeout` after 120 seconds; restarting the same terminal did not
restore service. An earlier journal startup took almost seven minutes before
broker authorization. During recovery, allowing MT5 to continue without the
worker's repeated IPC calls produced broker authorization and an EA load about
four minutes after launch. This demonstrates that the former startup allowance
was insufficient. It does not establish why MT5 itself was slow.

Cache-only, window-settings, and separate-desktop trials did not independently
restore service. The complete original profile is retained on the VPS at
`C:\BirrForex\backups\terminal11-profile-20261021`. Terminal 11 now uses a fresh
local profile with its existing reader EA. No challenge database or broker trade
records were changed. An unrelated Caddy certificate prompt was declined, not
accepted.

## Prevention

- Persist consecutive IPC startup timeouts per installation.
- After two IPC timeouts, allow a bounded 600-second startup attempt, including
  up to 480 seconds of passive waiting for a fresh EA heartbeat. A heartbeat
  ends the passive wait immediately.
- Keep normal startup at 120 seconds. Credential rejection does not activate
  this policy. Verified startup resets the counter.
- Keep account identity, EA nonce, and native history acknowledgement checks.
  A running process alone is never considered ready.
- Allow the deployment verifier enough time for the longer startup attempt.
- Preserve operation/recovery locks and the existing stall guard; no evaluation,
  reconciliation, or credential-classification logic was changed.

## Verification and rollback

24 recovery/policy tests pass, including a simulated five-minute EA startup
that completes without premature IPC calls. Terminal 11 passed live IPC, EA,
and native history verification and returned to the router queue. Worker-only
refreshes load the policy without restarting healthy MT5 processes.

VPS code backups are in `C:\BirrForex\backups\reader-startup-20261021`.
To roll back, restore `terminal_recovery.py` and `reader_recovery_rollout.ps1`
from that directory, then use the guarded `Refresh` mode on idle workers.
The added policy module and state files are inert with the old recovery module.
Retain the original profile backup for forensic investigation or a guarded
profile rollback; never replace a profile while its MT5 process is running.
