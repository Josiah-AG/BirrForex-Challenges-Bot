# Pull system assessment — September 26, 2026

Report only. No application code edits, deployments, account pulls, broker logins, scoring, notifications, or production database writes were performed for this assessment. Production SQL ran inside READ ONLY transactions. SSH inspected the VPS filesystem/process inventory only; the temporary SSH listener remains necessary.

## Scope and verified environment

Reviewed scheduler queue/retries, router dispatch, MT5 history extraction, raw ingestion, reconciliation, opening metadata repair, evaluation and leaderboard publication; sampled API balance/history reads. Read the session log and current release history. Local main: 3d178e6. VPS C:/BirrForex: 69cf9adb1b9af92402164e1a0e15a7c243644917, tracked worktree clean; only untracked vps/vps_metrics.json. Git diff between these commits under vps/ is empty: the older VPS commit is deployment drift, but does not explain these Python defects. Both deployed backend setting and router report configure 10 terminals. Current telemetry interval has zero requests, so it cannot measure current load or establish broker correctness. Challenge 37 is pending approval; there is no active challenge to observe in flight.

## Current flow

Durable challenge job -> global database lease -> select eligible registrations -> shared queue across terminals -> router/worker account login -> history extraction -> transaction saves raw trades/deals/balance operations and registration balance/cursor -> inline position comparison -> opening metadata repair -> balance reconciliation -> fixed 30-second settle -> OHLC -> account evaluation -> SL retry -> transactional account-scoped staging publication and ranking.

Good foundations: idempotent ticket upserts; raw ingestion transaction; persistent challenge/recovery jobs; database coordination; preserved last successful pull timestamp on transport/credential failure; bounded retry intentions; separate score staging; final-result guards. These protect database consistency but do not prove the broker response is complete. Some scheduler comments still describe an obsolete next-cycle publication flow; current canonical path publishes at the end of the same cycle.

## Confirmed findings

### P01 — MT5 history errors become successful empty pulls (critical)
Evidence: vps/worker.py do_pull, lines 815–868 and 1023–1032. history_deals_get returning None is converted to count zero, then stabilized and returned with success=True. account_info absence also defaults financial values to zero. No account login/server identity is rechecked on the returned account_info. Scheduler lines 888–909 retries an empty response with changed balance only before its final attempt, then accepts it and advances last_pull_at. A nonempty partial response bypasses that heuristic entirely.
Example: known balance 1000, broker balance 1100, history temporarily fails. Worker says success with balance 1100 and no trades; scheduler can save the new balance with no matching history. Local execution of the actual extracted do_pull function reproduced success=True, balance=1100, trades=0 when history_deals_get returned None.
Fix: distinguish error, empty verified history, and incomplete snapshot. Require matching account/server, valid account_info, explicit source cutoff and error metadata; no verified cursor advancement or fresh-score publication on incomplete history. Bounded count stability is only a heuristic, not completeness proof. Retry with durable work and explicit uncertainty.

### P02 — Batch reconciliation checks its own output (critical)
Evidence: worker response position_ids is derived from trades_list; scheduler inlineReconcile (2176+) compares those IDs with the rows just persisted. A missing source trade appears in neither set, so the comparison cannot find it. Position membership also cannot detect a missing second partial close on a position already represented.
Example: MT5 returns position A but omits B. Database saves A. Comparison reports no missing positions. If A has three closes and only one arrives, position membership still passes.
Fix: independent bounded history verification and deal-ticket manifests/hashes for the same snapshot window, including partial closes; compare exact tickets and fields, not positions alone. A second broker read still needs consistency checks because it shares terminal cache state.

### P03 — Balance reconciliation is not a correct accounting identity (critical)
Evidence: scheduler 2518–2672 computes baseline + all saved trade net + positive balance deals. It ignores withdrawals and other relevant account ledger movements, can double-count original funding, mixes full-account imports with a challenge baseline, and uses stale last_known_balance after repair responses. The repair imports trades/deals but not response balance/equity or balance_ops through the canonical transaction.
Production example: challenge 33 registration 5246 has start=500, trade net=16.01, current=516.01; registration 5247 has start=200, trade net=23.30, current=223.30. Both are marked failed. Formula adds positive deposits of 1095 and 500 respectively, producing discrepancies even though baseline plus recorded trading net explains each observed balance exactly. This is strong evidence of false reconciliation alarms, not independent proof of complete broker history.
Fix: reconcile an account ledger from a known balance anchor at a known time to one common cutoff. Include signed movements, entry/exit charges, fees and broker corrections; separate physical balance reconciliation from challenge scoring and currency normalization. Do not infer missing trades solely from profit totals.

### P04 — Reconciliation deliberately skips several missing-history cases (high)
Evidence: candidates require positive balance above baseline, gap exceeding max(1, balance*3%), and status not resolved. No current source resets resolved on later imports. Final failed-marker SQL is challenge-wide rather than restricted to attempted accounts.
Examples: a lost 100 trade on a 1000 account gives balance 900 and never enters repair. Missing 20 on a 1000 account may pass tolerance. Missing +100 and -100 cancel, leaving no balance gap. A resolved account can become incomplete tomorrow but remain excluded.
Fix: per-snapshot reconciliation status; signed, currency-appropriate rounding tolerance; independent ticket completeness for net-zero omissions; every account gets an explicit attempted/skipped/deferred state. Never use balance agreement alone as proof.

### P05 — Opening-time/price repair paths disagree (high)
Evidence: worker do_pull prefers deal time then order.time_setup; do_resolve_opens prefers earliest opening deal; do_resolve_trades prefers order.time_setup and order.price_open whenever present. In do_pull, the map retains the last opening deal per position, which can differ from earliest execution for scale-ins. Scheduler repairs only missing/zero values, with 24/30-hour lookbacks for normal incremental runs, so plausible but wrong non-null values escape repair. Some repair UPDATE failures are swallowed.
Probe: pending order setup at time 100 and fill at 200 produced main-pull open=200, trade-repair open=100, opening-repair open=200. Price provenance differs too.
Fix: shared position reconstruction for all endpoints, with earliest execution and scale-in/reversal semantics explicitly defined; store metadata source/confidence. Resolve suspect as well as null values. Persist unresolved repair tasks across age windows; do not overwrite confirmed fills with order-placement fallback.

### P06 — Trade conversion omits supported closing events and charges (high)
Evidence: do_pull and do_resolve_trades create closes only for entry==1. Close-by and reversal events require separate handling. The actual method probe returned two raw deals but zero trades for an opening plus entry=3 close-by. Worker raw payload includes fee/commission/swap, but saveDeals persists none of those charge fields; derived trades use closing commission/swap only and omit fee. Balance operation mapping handles only a subset of MT5 ledger types.
Fix: retain complete raw economic fields; explicitly support normal exit, close-by and netting reversal with volume attribution, entry charges, fees and corrections. Unsupported events must become visible incomplete states, not silent successful omissions. Historical entry/position metadata is absent in stored deals sampled here; do not guess old values.

### P07 — Timeouts and retries multiply work (high; load impact inferred)
Evidence: scheduler ordinary HTTP deadline is 30 seconds; router worker deadline is 120 seconds, with same-worker and alternate-worker retries. Worker normal pre-wait is 6–20 seconds, extended is 12–40 seconds, then deal stabilization can run roughly 40 seconds (two consecutive sleep(1) calls per changing iteration), plus order reads/login. Scheduler itself has three attempts per dispatch and up to five queue dispatches. Worker operations serialize on one lock; router can reroute into another occupied worker. Client cancellation does not establish cancellation of synchronous MT5 work.
Example: Railway times out at 30 seconds while VPS continues; retry queues more work for a terminal still processing the original request. Increasing terminal count alone cannot solve this.
Fix: one dispatch owner, actual-worker leases, end-to-end deadline budget, request IDs/idempotency, bounded central retries with backoff and explicit server completion/cancellation. Preserve global cross-challenge coordination until measurements justify changing it.

### P08 — Partial failures can still look successful, while one evaluation error stalls everyone (high)
Evidence: several repair calls return null/empty or swallow errors; missing metadata is not a hard completion criterion. Conversely evaluateAllAccounts throws after any account evaluation error, preventing the entire final publication transaction although phase-1 balances and cursors have committed. There is no durable per-account snapshot tying source cutoff, repaired history, evaluation and publication together. Individual retry uses a different reconciliation route and suppresses repair errors.
Fix: common single-account state machine for batch, manual and credential recovery; acquired -> validated -> repaired -> evaluated -> published. Keep last good published account snapshot when incomplete. Publish complete accounts with clear freshness and rank policy; final challenge results require a full eligible-account completeness gate. Display observed balance separately from verified score freshness.

### P09 — Credential confirmation may not involve two actual workers (high)
Evidence: scheduler infers confirmation from excludedTerminalId, but router may reroute and reports terminal_used; scheduler returns/logs requested terminalId and does not use actual worker identity for the confirmation decision. SharedQueue also relaxes exclusion with only one healthy terminal or after 60 seconds. Worker login_user has a generic non-IPC/nonrecognized error branch that labels it credential failure. Cache identities use account number without broker/server.
Example: requests aimed at T1 and T2 may both be handled by T3; a cache rejection can be counted as another confirmation. This can remove an account from subsequent scheduled pulls.
Fix: explicit broker authorization error code only, two distinct actual fresh-login evidence records, credential-version and broker/server scoped cache; no same-worker fallback qualifies as independent confirmation.

### P10 — Account coverage and health are incompletely accounted for (high)
Evidence: scheduler excludes disqualified/withdrawn/blown/unverified/password-changed accounts. These may be intentional scoring choices, but frozen ingestion can prevent discovery of later closes or recovery. It resets every terminal healthy at cycle start. Router /health counts HTTP200; worker /health returns HTTP200 even with status=dead. Thus all workers reachable does not prove working broker sessions. SharedQueue.ejectStale deletes in-progress bookkeeping without cancelling work or clearing its account-number guard; watchdog checks zero results since batch start rather than elapsed time since the last progress.
Fix: explicit durable per-registration outcome and skip reason; separate scoring eligibility from history collection. Validate worker status/body, use actual health/capacity, heartbeat work leases and no-progress timer. Check total selected equals completed+failed+deferred+cancelled; do not silently declare queue completion.

### P11 — Efficiency is spent on repeated work rather than verified progress (medium/high)
Evidence: repeated account login/history priming in main pull, up to five opening repairs, up to three full-history balance repairs (from 2020), full opening-price fallback, plus fixed 30-second settle even without candle work. Per-row trade and deal UPSERTs add database round trips. Every account is evaluated in the canonical cycle; counts called new_trades_found count returned rows, not inserted rows. Persisted phase timings omit balance-reconciliation duration.
Observed historical batch 561: 1187 accounts, 4346 seconds total; pull=2932s, OHLC=450s, evaluation=422s, settle=30s, resolve=1s. Reported phases do not cover the whole elapsed time. Recent one-account batches spend 30 of about 48 seconds settling. These historical runs predate today's hardening release and are not a benchmark of a proposed design.
Fix: reuse one account lease for pull+targeted repairs; chunk source history, batch database writes, deduplicate candle work, remove unconditional settle after proving it unnecessary, avoid repeated full-account scans and collect actual stage/queue timings. Coalesce redundant pending scheduled work safely. Report inserted/updated/unchanged and incomplete counts separately.

### P12 — Source snapshot boundary and publication boundary are not aligned (high)
Evidence: worker captures date_to before waiting for history sync, then reads balance later; a trade/deposit between those timestamps can change balance outside the fetched window. Scheduler stores NOW() as cursor instead of explicit verified source cutoff. Overlap mitigates ordinary timing drift but does not guarantee recovery once incomplete data ages beyond the overlap. Full-account repairs do not use a matching anchor/cutoff.
Fix: source cutoff and balance-observation timestamps in every response; detect account activity during extraction and retry or mark snapshot unstable. Track last attempt, last verified-history cutoff, last evaluation and last publication separately. Persist gaps requiring wider backfill.

## Read-only production observations

- 48,407 stored trades; 73 missing opening times, 75 missing/zero opening prices, zero reversed open/close times. Counts overlap and are not proof of incorrect historical scores.
- 212 registrations marked reconciliation failed, one resolved, 4687 unset. Not 212 proven missing-history accounts: challenge 33 demonstrates false positives.
- Challenge 36 has 15 trades with complete opening time/price fields; challenge 33 has 12 with complete fields. No new account pull was triggered.
- No non-null wp_deals.entry rows in the queried production data. Existing history cannot retroactively supply the newly supported position/entry fields without a controlled import.
- Most recent stored batches were September 25; some old batches show completed with total_accounts>0 but successful=failed=0. This is historical observability evidence, not proof the newly deployed canonical path still generates those rows.

## Implementation plan, subject to approval

1. Preserve local/Git/VPS commit inventory, runtime settings and backups; add reproducible regression fixtures for the failures above. Keep real credentials outside artifacts.
2. Define a versioned snapshot contract: account/server identity, request ID, actual worker, source cutoff, financial observation time, raw deal manifest, completeness/repair reasons and economic units. Preserve old client compatibility during deployment.
3. Fix extraction errors, close/reversal support and shared opening metadata reconstruction. Retain raw monetary fields and stable deal identity. Build source completeness validation; do not replace a known incomplete response with an empty success.
4. Replace balance heuristic with anchor-based signed ledger reconciliation and exact ticket checks. Add durable outstanding gaps and metadata repairs; retire permanent resolved exclusion and arbitrary 3% tolerance.
5. Route all pull entry points through the same per-account state machine and fenced worker leases. Align deadlines/retries, validate actual-worker credential evidence, preserve known-good account publications on partial failures, and explain skipped accounts.
6. Optimize only after correctness: batch UPSERTs, incremental/chunked history, same-login repairs, candle deduplication and conditional settling. Measure p50/p95 account latency, terminal utilization, repeated logins, bytes/rows, queue wait, reconciliation gaps and published freshness. No unsupported percentage speed promise.
7. Validate with mocked MT5 errors/partial histories, real synthetic DB, timeouts/restarts, simultaneous lanes, partial closes/reversals, zero-net omissions, loss/zero-balance accounts, funding/withdrawals/fees, cents, late history and pending orders. Then use a narrowly scoped authorized live account comparison against broker history; do not launch broad production repulls merely to test.
8. Deploy backward-compatible schema/backend/worker protocol in a coordinated direct-main release. All application changes originate locally and are committed; VPS pulls the exact tested commit. Preserve existing MT5 desktop-session launch mechanism and first stabilize SSH/service deployment access. Verify all components' versions and health.
9. Repair approved affected accounts with per-account before/after previews and journals, retaining source evidence and final-result locks. Do not mass-rescore completed challenges. Recovery uses prior compatible code plus conflict-aware data restoration; ordinary Git rollback alone cannot undo a published score or sent notification.

## Evidence limits

Four local probes executed actual extracted Python methods with fake MT5 responses (no broker calls): None history accepted as success; entry=3 omitted; conflicting pending-order opening time; derived position set cannot independently detect omissions. Source inspection and read-only aggregates establish the defects above, but do not identify every historical missing ticket. An exact missed-account incident needs the relevant account, timestamp and broker history. No claim that ten reachable HTTP workers guarantees ten functional broker connections.

MT5 references: https://www.mql5.com/en/docs/python_metatrader5/mt5historydealsget_py (None is an error); https://www.mql5.com/en/docs/constants/tradingconstants/dealproperties (deal entry and financial types).
