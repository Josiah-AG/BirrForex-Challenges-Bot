# Pull history integrity release — 2026-09-26

## Scope and behavior

Protocol 2 is explicitly enabled with `VPS_VERIFIED_HISTORY=true` after compatible VPS workers are healthy. An absent/false setting retains the previous pull path for coordinated deployment and emergency code rollback.

A successful protocol-2 response requires a live broker connection, matching account/server, stable ticket/economic manifest, agreement with the broker history count, a signed full-account cash ledger matching the observed balance, independently queried position/window ticket agreement, execution-based opening metadata, and an unchanged final account/history read. `None` history is an error, never an empty success. A zero balance with genuinely empty history remains valid.

The ledger includes deposits, withdrawals, profit/loss, commissions, swaps and fees. Broker credit is separate from balance. The full cash ledger is checked each time; only relevant position reconstruction and returned rows are incremental. If history before the previous cutoff changes, reconstruction automatically widens to the registration/challenge window. This detects backdated and zero-net corrections visible in a later broker response. It cannot establish the existence of records the broker never exposes through any query. Truncated account history or unsupported cancelled-deal corrections remain explicit incomplete states requiring source investigation; no guessed balancing trade is created.

Closed trades include ordinary exits, close-by exits, and reversal exits. Opening times/prices come from executed exposure, including volume-weighted scale-ins. Entry charges are allocated across closed volume; residual reversal exposure retains its share. Order placement is never substituted for execution time. Recorded SL/TP evidence is restricted to orders completed by the exit time. Raw entry/commission/swap/fee/millisecond evidence is retained. Definitions: https://www.mql5.com/en/docs/constants/tradingconstants/dealproperties and https://www.mql5.com/en/docs/python_metatrader5/mt5historydealsget_py .

## Persistence, recovery and publication

- Identity, request, financial, timestamp and exact closing-ticket checks run before source persistence.
- Source rows, observed balance, broker cutoff and snapshot manifest commit in one account transaction. Trade/deal upserts use chunks of 500, preserve identifiers and count actual newly inserted trades.
- Challenge cash operations exclude operations before registration; withdrawals are not confused with old account-wide funding history.
- Status writes preserve the verified source cutoff instead of advancing it to server NOW.
- Each account evaluation is transactional. A failed account does not stop other successfully evaluated accounts from publishing.
- The public trade endpoints and dashboard read the last published history, atomically replaced with leaderboard publication. Imports and failed evaluations remain invisible there. Parameterized account-specific readers avoid expanding other accounts' JSON histories.
- Durable incomplete/evaluation-failed/verified-but-unpublished states are retried by the minute scheduler, up to three due registrations per pass, using the existing global advisory lease and exponential delay capped at 60 minutes. Recovery requires a verified connection, active/reviewing unlocked challenge, and an eligible registration. Completed/deleted challenges are not automatically rescored.
- Client copy explains that recovery is running and retains last published results. Admin pull errors retain the reason. Persistent broker/authentication failures may need intervention; automatic retries are not a guarantee that an unavailable source will recover.
- Strict dispatch uses the requested worker, one bounded broker login and one router request; the worker rejects busy work rather than queuing duplicate terminal operations. Only a fresh broker credential rejection on a distinct actual terminal can confirm a password failure. Generic IPC failures do not count as credential failures.
- Router health checks run concurrently and inspect worker health bodies. Strict history bypasses the old repeated reconciliation/metadata repair passes and fixed 30-second settling delay. Native MT5 calls cannot be forcibly cancelled by the Python budget; a late/timed-out response cannot commit backend data, and the worker lock prevents overlapping terminal use.

The existing competition-balance calculation remains distinct from broker cash balance: withdrawals, open-position charges and challenge rules can legitimately make these amounts differ. Ledger verification proves agreement with the broker snapshot, not a new ranking policy.

## Reversibility

Code baseline: `3d178e6830099b4b128997ed4db45f6d7c28195a`. Prior VPS checkout: `69cf9adb1b9af92402164e1a0e15a7c243644917` (VPS source matched the baseline before this release).

Private backup directory: `../.repair-backups/2026-09-26-pull-integrity/`, outside Git. Contains preexisting-work patch/status, database fingerprints, and `production-before-pull-history.dump` (31,151,656 bytes). SHA-256: `b9b53bf8fe125c81a0722ba277d920889c3d19f19622dce3b439192a9b7585e7`. Archive listing validated with pg_restore. No production database clone was used for tests.

Schema additions are additive. No mass historical rewrite runs on startup. `wp_pull_operations` records each transaction's before/after account data; `scripts/rollback-pull-history.cjs` restores operations in reverse order and compares changed fields with their recorded after-values. It aborts the whole restore on conflicting later changes, including admin changes between transactions. It preserves unrelated fields. Default execution performs a transactional preview and rolls it back; `--apply` commits the restore. Stop the updater and revert/disable the new code path first. Supply DATABASE_URL securely through the environment, never in shell history. An optional registration ID limits the restore. Recalculate rankings from restored leaderboard rows afterward; do not run full reevaluation merely to restore ranks. Retain additive tables for audit/rollback rather than dropping them.

Git rollback alone does not restore already published data. Whole-database restore is a last resort because it would remove unrelated newer work. External notifications already delivered cannot be recalled. Account-level conflicting changes require reviewed restoration from the preserved operation records; the tool intentionally does not overwrite them.

## Deployment procedure

1. Verify tests, backup, current jobs and lifecycle status. Latest inspection: no active challenge/running pull job; challenge 37 pending approval, prior challenges deleted/completed.
2. Push only release files to main. Preserve unrelated local files and edits.
3. Fetch the exact release commit on VPS, verify tracked worktree clean, fast-forward only. Validate Python syntax and PowerShell parser before stopping anything.
4. Run `vps/restart_python.ps1` via an interactive scheduled task in the existing Administrator desktop session, with the full expected commit. Default mode only inspects. Apply restarts one owned Python listener at a time, checks commit/health, then restarts the router. The worker deployment attachment mode never kills/relaunches MT5 on startup failure. The script requires the existing machine API key and restricts deployment log ACLs.
5. Verify all workers/router, authenticated protocol behavior and Railway deployments. Enable `VPS_VERIFIED_HISTORY=true` only after compatible workers pass checks.
6. Verify production historical integrity and append actual release results to SESSION_LOG. Do not claim the release deployed before these steps finish.

## Local verification

Backend build; 59 Node tests; 22 Python tests (including actual endpoint AST with mocked MT5); frontend production build; synthetic PostgreSQL ingestion/publication/recovery/rollback integration; existing hardening integration covering failure isolation, cancellation, final locks, credential recovery, settings and lifecycle; two complete startup migrations preserving historical fixture data. Additional changes require rerunning their affected checks. Live deployment results are recorded separately in SESSION_LOG.

## Executed deployment

Implementation `fd5a77d` and restart argument correction `9636fd5` were pushed to main and pulled to VPS. The first guarded restart found the missing port argument and halted after worker 1; it was restored, the correction was committed centrally, and the repeated rollout passed all ten workers plus router. All MT5 process IDs were preserved. Protocol-2 broker smoke returned 26 trades/54 deals and passed signed-ledger and backend validation without database ingestion. The feature was then enabled on Railway; backend and frontend deployments succeeded. Original-column fingerprints matched for all six historical tables (including 100,187 deals). No active challenge was present, so no full production challenge batch was run. SESSION_LOG contains deployment IDs and detailed evidence. Documentation-only follow-ups are pulled to VPS without restarting unchanged Python code.
