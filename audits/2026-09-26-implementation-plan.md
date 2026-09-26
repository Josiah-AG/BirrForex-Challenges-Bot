# Authorized hardening implementation — 26 September 2026

Baseline: 0329a78. User authorized implementation of A01–A32, local tests, then direct-main push after validation. Existing unrelated work is preserved; initial diff backed up outside Git under ../.repair-backups/2026-09-26-system-hardening.

## Binding decisions

- Empty admin IP allowlist is intentional: optional restriction, never a substitute for authentication.
- Remove backend admin path from browser bundles; protected operations require verified sessions. Browser navigation URL itself cannot be secret from its user.
- Complete independent category configurations; no runtime category fallbacks.
- Registration requires actual successful VPS verification; unavailable is not success.
- Hybrid / non-cent-only configuration uses standard money units, converted for cent accounts. Real-only cent-only inputs are already cents.
- Host-specific broker credentials, jobs, and permissions; no cross-host cancellation.
- Ordinary publication obeys final lock; preserve explicit authenticated admin override commands with audit records.
- Challenge timezone for business dates; non-crypto trades are not weekend violations merely due to timestamp weekend inference. Crypto weekend rule remains configurable.
- Daily percentage loss uses actual day-opening balance; realized events use closing order.
- Recovery from any credential-update entry point backfills and evaluates missing history.
- Data changes need journals separate from Git rollback. No historical bulk recalculation on startup/deploy.

## Ordered work and release gates

1. A01/A08/A20/A23: authenticated admin proxy and sessions; revocable host sessions; safe encryption; retire legacy admin.
2. A02–A07/A09–A11/A21: validated atomic configuration/creation; durable approval/state transitions; verified atomic registration and currency policy; tenant broker screening.
3. A12/A13/A22/A29–A31: durable inclusive scheduling, isolated jobs, participant filtering, credential recovery and honest ingestion errors.
4. A14–A19/A24–A28/A32: atomic scoped publication, consistent ranking/winners, explicit final overrides, deterministic scoring/funding and typed DQ.
5. Regression suite, backend/frontend builds, synthetic SQL integration, production read-only inventory and calculation previews; document remaining policy decisions.
6. Back up affected production state privately; apply only reviewed additive migrations/corrections with journal; commit only task-owned changes; push main; verify deployments and authorized health checks.

Each group must be reviewed/tested before release. No deployment until cross-layer flows pass. Existing code and database rollback paths must be documented; a security rollback must not intentionally reopen anonymous admin access.

## Progress

- Implemented, tested and deployed directly to main. Final application commit: 290c8f2. Production authentication, unchanged historical-data fingerprints and journaled broker cipher migration verified; deployment IDs are recorded in SESSION_LOG.md.

## Implemented acceptance map (deployed and verified)

The September 25 audit remains a historical report. This map describes the implementation, not a claim that external services were exercised live.

| Finding | Implemented behavior | Evidence |
| --- | --- | --- |
| A01 | Common signed admin-session boundary; private runtime proxy; HttpOnly cookie and Origin checks; empty IP allowlist remains allowed | 76 actual anonymous Express operations rejected; role/expiry tests; production Next proxy smoke |
| A02 | Admin/host creation saves independent category rules, flags and monetary settings atomically | SQL approval/create tests, independent rule-resolution test |
| A03 | Reject invalid thresholds, counts, modes, dates, timezone and missing required configuration; unused absolute targets explicitly zero | Validation tests; injected rule-save failure leaves no challenge |
| A04 | Settings validate allowed fields and return saved data; UI checks responses; status/delete return pending approval honestly | SQL failed-save rollback; frontend build and source contract review |
| A05 | Split categories require their own values; inactive rules can be prepared before mode switch | Split-mode SQL test, no-fallback unit tests; management target counters use same units |
| A06 | Central transitions, expected prior state, persistent freeze, durable lifecycle event and pull job | SQL reopen/finalization/duplicate-transition tests |
| A07 | Durable one-time approval records and admin pending list; orphan pending host requests recovered without approval | Concurrent decision test; challenge 37 migration recovery |
| A08 | Current host active state/version checked on each request; reset/deactivation revoke sessions | Actual HTTP role/revocation/tenant tests |
| A09 | Final web/native/Discord/CSV/change paths require successful VPS verification and common policy | Registration-policy tests; source tracing; no live account creation |
| A10 | Real-only cent-only configuration remains cents; other cent accounts convert standard inputs ×100 | Monetary-policy and management counter tests |
| A11 | Automatic screening resolves the owning host's broker credentials; unavailable configured integrations fail closed | Broker context source review; no live broker calls |
| A12 | Durable unique challenge/slot jobs; all due challenges queued; coordinator serializes shared terminals | SQL job/lifecycle tests and scheduler-path review |
| A13 | Host cancellation/progress/participants scoped to owned challenge; normal jobs separate from explicit admin override | Actual cross-host HTTP tests; global lease integration test |
| A14 | Valid growth SQL and transactional deterministic ranking | Real PostgreSQL growth ranking test |
| A15 | WinnerPip public/Telegram selection shares published rank and eligibility; final snapshots; historical IDs fixed | Winner-selection source review and snapshot SQL test |
| A16 | Ordinary evaluation/publication and host writes refuse locks or completed results; explicit admin overrides create snapshots | Locked/completed SQL tests and host HTTP test |
| A17 | Atomic scoped staging consumption; individual refresh publishes only itself; obsolete reject/approve endpoints retired | Concurrent-account scope and failed-batch isolation tests |
| A18 | Challenge-local scoring dates, schedule times and form conversion; crypto-only weekend inference; no speculative early minimum-day DQ | Local-midnight/DST/weekend tests |
| A19 | Typed automatic/manual sources; automatic recovery never matches prose or clears manual DQ | Source review; funding supersedes recoverable minimum-rule causes |
| A20 | Fresh nonce per encrypted field, dual-format reader and private conflict-aware migration journal | Legacy/current crypto tests; real synthetic apply/restore/conflict test |
| A21 | Serialized canonical account checks and active case-insensitive nickname/email indexes; archived trading history cannot mix with a replacement | Concurrent duplicate, removed/re-register and history guard SQL tests |
| A22 | Removed registrations excluded from ordinary jobs and counts; raw history retained; live/staging removal atomic | SQL removal-history test and selection review |
| A23 | Old admin detail page retired; one authenticated management UI | Frontend production build/proxy smoke |
| A24 | Stable funding interpretation, repeated evaluation consistency; read failure stops evaluation | Repeated-funding and funding-failure unit tests |
| A25 | Position exposure reconstructed from entry/exit deals; aggregate closed-volume fallback when metadata incomplete | Partial-close/scale-in/incomplete-history tests; VPS payload contract review |
| A26 | Daily realized loss processed in closing order | Permuted/overlapping close fixtures |
| A27 | Daily percentage cap based on actual opening balance for each local day | Actual-deposit, day boundary and subsequent-day withdrawal tests |
| A28 | Raw cent withdrawals normalized in all ranking tiers; ingestion cannot update live results | Unit policy and SQL publication/ingestion tests |
| A29 | Verified password and durable recovery request commit together; full backfill/evaluate/publish; final results require admin publication | SQL busy lease, restartable queue and locked recovery tests |
| A30 | First confirmed credential failure starts grace clock; each challenge handled; generic invalid errors no longer imply bad credentials | Credential parser/source review; recovery queue tests |
| A31 | Atomic account import; write/evaluation failures propagate; no-terminal failure retries; cancellation truthful | Failure-injection, no-terminal/cancellation and publication-isolation tests |
| A32 | Latest actual close timestamp and stable registration ID resolve ties | Close-order unit test; SQL ranking execution |

Additional release safeguards: startup no longer guesses old winners, infers cent status from account prefixes/rules, flips trade directions, or deletes old-format trades. A full startup migration repeated twice preserves synthetic historical trades and challenge status exactly. Required hardening migration errors fail startup.

## Deliberate behavior and remaining limits

- Completed challenge 36 is preserved, not recalculated. Challenge 37 remains pending approval; migration restores its missing approval record only.
- Individual refresh now applies immediately and reports the published change. It is not a reversible preview. Full Pull Replace is retired in favor of non-destructive full history import. Obsolete approval/rejection endpoints return 410 instead of deleting somebody else's staged work.
- A removed account with archived trade/deal history cannot be recreated in the same challenge: its original record must be restored through a reviewed operation. This avoids the existing account/ticket uniqueness keys mixing histories.
- Password repair never automatically reinstates DQ. Admin reinstatement is explicit. User/host recovery for final results imports history but waits for admin publication.
- First funding, existing scoring-window grace, minimum-trade counting by closed rows, and no-trade ineligibility retain existing policy. Changing those separate policies is not inferred from these bug fixes.
- Legacy manual evaluation remains separate; WinnerPip determines WinnerPip winners. External Discord clients must send complete valid creation/rules payloads; malformed legacy payloads now receive errors instead of partial creation.
- Lifecycle delivery uses durable receipts and retries. A crash after an external send but before its receipt can repeat that message; exactly-once external delivery is not guaranteed. Lifecycle start/end messages are now concise text; winner messages retain their existing path.
- Tests use synthetic records and mocked broker/MT5/notification boundaries. They cannot prove external MT5 availability or every production account's historical metadata completeness. Existing historical deal entry/position metadata is filled by subsequent authorized full imports, not guessed in a migration.
- Existing frontend lint warnings remain. Unrelated quiz concurrency/promotion and broader export formatting findings are separate from A01–A32 and are not claimed fixed here.
- Rollback preserves current data using a maintenance backend plus field-level conflict checks; a whole-database restore is disaster recovery and would require reconciling activity since its timestamp. Already-delivered messages cannot be made unseen.
