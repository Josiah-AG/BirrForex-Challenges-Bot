# MT5 startup outage, 4 October 2026

MT5 journals recorded a broker disconnect and a subsequent Service is not available response. Workers remained alive and listened on their HTTP ports, but most terminals repeatedly failed IPC initialization after restart. Repeated MT5 restarts and an interactive startup did not resolve it. Omitting the EA startup directive and resetting the window layout did not resolve it either.

On Terminal 2, backing up and removing the local `config/accounts.dat` login cache allowed MT5 to start and authenticate again. Its previous cache was approximately 12.6 MB. Other failed terminals received the same reversible repair, retaining server configuration, profiles, EA files, and all application database records. This demonstrates a local cache-related startup failure; it does not prove the underlying binary corruption mechanism. Broker-side trade history is not stored solely in this cache.

The worker now escalates repeated IPC initialization failures after two unsuccessful hard restarts to a login-cache rebuild. Successful IPC initialization resets the counters, so broker authentication failure alone does not trigger this step. The terminal is stopped before its cache is renamed. A unique origin.txt match is required. Backups are retained beside the original file. A marker limits this to once per 24 hours. Failure to identify or rename the cache is logged and leaves the normal restart path intact.

Live rollout keeps the existing visible worker BAT supervisors and updates one worker at a time. Inactive terminals 13–15 use the same worker/helper when next started.

## Rollback

Restore `C:\ProgramData\WinnerPip\worker-before-cache-recovery-20261004.py` to `C:\BirrForex\vps\worker.py`, then restart workers gradually. The helper may remain unused. To restore a login cache, drain that terminal, stop its worker and MT5, preserve its new accounts.dat, and copy the relevant `accounts.dat.outage-*.bak` or `accounts.dat.recovery-*.bak` back to accounts.dat. Restoring the faulty cache may reproduce the hang. Backups contain sensitive account-cache data and must stay private on the VPS.
