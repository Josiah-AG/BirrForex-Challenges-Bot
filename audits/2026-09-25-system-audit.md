# WinnerPip system audit and implementation plan

Date: 25 September 2026. Baseline: `0329a78` (`d297933` application changes).
Scope: primary repository backend, WinnerPip frontend, admin/host creation and management, registration, evaluation, ranking, approval callbacks, scheduling, persistence, and supporting VPS contracts.

## Outcome and evidence

The previous disabled-rule repair remains valid. Challenge 36 was checked read-only: reviewing, fixed-balance Demo, 15 trades, zero flags. It is the only non-deleted/non-completed/non-rejected challenge at inspection time. There is no evidence from this audit that its repaired flags reverted.

There are significant **other** inconsistencies. The most urgent is missing server-side admin authentication. The most direct repeat of the original settings problem is that admin creation discards the separate Demo/Real rule payloads. Because the evaluator now refuses missing category rules, this produces an evaluation error rather than silently enforcing a shared fallback. Creation needs to be brought up to the evaluator's stricter contract.

Evidence used:

- Source tracing across forms → route handlers → services → database → background jobs → displayed results.
- Nine isolated probes executed extracted real TypeScript handlers/methods with mocked database and external services. All nine reproduced the suspected behavior. Script: `/private/tmp/tgbots-audit-probes.cjs`. No live mutation or notification occurred.
- PostgreSQL read-only transaction reproduced the growth-ranking SQL error (`42P01`, missing FROM-clause entry for table `l`). No UPDATE was executed to test it.
- Production configuration checked by presence only: admin key/path configured; admin IP allowlist not configured. No secret values recorded here.
- Production registration indexes inspected read-only.
- Existing tests rerun: **24 pass, zero fail**. They cover the prior rule repair, not the broader contracts found here.

Only this report, the file coverage index, and the session log were written in the repository. No application edits, migrations, commits, pushes, deployment, VPS requests, live registration attempts, or production data repairs were performed for this audit. Existing unrelated changes were preserved.

This is a source and contract audit, not a claim that every runtime behavior has been proven correct. See `2026-09-25-file-coverage.md` for file-by-file depth. Windows MT5 terminal behavior and external broker responses were not exercised. Historical documents were treated as context; current code and later session changes take precedence over older specifications.

## Deeper review — consolidated status

The expanded register contains **32 numbered findings: the original A01–A23 and nine additional findings A24–A32**. Related symptoms and unresolved policy questions are not counted as separate proven bugs. The original issues remain open: this review has not implemented their fixes. The earlier disabled-rule/registration-button repair is separate and remains implemented.

Five further isolated probes executed real evaluator/scheduler methods with a mocked database, reproducing A24–A27 and A31. All five assertions passed. Reproduction script: `/private/tmp/tgbots-deep-audit-probes.cjs` (temporary local diagnostic, not a committed regression suite). A28–A30 and A32 are source-confirmed; they were not reproduced against live accounts. No new production inspection was needed for this extension; the challenge 36 observations above are from the preceding audit, not a fresh live assertion.

| Area | Open findings | Practical consequence |
| --- | --- | --- |
| Authentication and isolation | A01, A08, A11, A20 | Admin operations lack sessions; host tokens survive revocation; wrong broker screening context; credential nonce reuse |
| Creation and management | A02–A07 | Reviewed settings may not persist; defaults still cross category boundaries; invalid transitions and lost approvals |
| Registration and account lifecycle | A09–A10, A21–A23, A29–A30 | Entry paths enforce different requirements; currency mismatch; duplicate/removed accounts; inconsistent credential recovery |
| Scheduling and publishing | A12–A13, A16–A17, A31 | Missed jobs, cross-host cancellation, mutable final results, publication races, silent write loss |
| Scoring and winners | A14–A15, A18–A19, A24–A28, A32 | SQL failure, winner disagreement, calendar/DQ inconsistency, repeat-evaluation drift and incorrect rule/ranking calculations |

Read the individual findings below for triggers, evidence and implementation requirements. P1 findings are conditional: a defect affecting cent withdrawals does not establish that the current Demo challenge has incorrect results.

## Prioritized findings

Severity: **P0** urgent access-control exposure; **P1** can affect eligibility, results, isolation, or operation; **P2** management reliability or misleading presentation. “Confirmed” means demonstrated from actual control flow, isolated execution, or read-only SQL; it does not mean the failure has already occurred in production.

### A01 — P0 — Admin password is not enforced on admin operations

**Evidence:** `src/api/server.ts:79`, `:3580`, `:3592`, `:5059`, `:8656`; `WinnerPip/winnerpip/app/admin/panel/page.tsx:100`; frontend `Dockerfile` exports `NEXT_PUBLIC_ADMIN_PATH`.

Only `/login` checks `ADMIN_KEY`; it returns success without issuing a session. Subsequent admin endpoints use `adminIpCheck` only. That middleware allows all requests when the allowlist is empty, which is the current production configuration. The route path is embedded in client code and is not an authentication secret. Several operations execute immediately, including settings changes, participant management, exports, and host password reset; Telegram approval does not protect all of them.

**Impact:** Requests knowing the frontend-visible path can reach protected admin operations without proving admin login. No exploit was attempted and no unauthorized modification is alleged.

**Fix:** Issue a short-lived, signed admin session after login; enforce a common admin middleware on the entire admin router; update both admin frontends. Prefer an HttpOnly cookie with CSRF protection, or a deliberately scoped bearer design. IP restrictions can be supplementary, using trusted proxy configuration rather than arbitrary headers. Never ship a temporary accept-unauthenticated compatibility fallback.

**Acceptance:** Anonymous, wrong-role, expired, and revoked sessions fail on every admin route; valid admin can still create, approve, edit, and export. Coordinate frontend/backend rollout to avoid admin lockout.

### A02 — P1 — Admin creation silently drops category rules and target flags

**Evidence:** admin form `app/admin/panel/page.tsx:2739`; API `server.ts:4807`; gatekeeper `challengeGatekeeper.ts:108`.

The form sends `rules_demo` and `rules_real`. The admin route constructs a fresh `data` object containing only `rules`, dropping both category rule objects. It also fails to forward optional-target flags. The gatekeeper supports these values, but never receives them from this route. A mock execution confirmed their absence.

**Impact:** A newly approved split challenge lacks its category rules, despite the creation review showing them. Evaluation now correctly refuses those missing configurations. Optional-target behavior also lacks admin creation parity.

**Fix:** One typed creation contract shared by admin/host/approval consumers; forward and validate all supported fields. Persist challenge plus every required ruleset in one transaction.

**Acceptance:** Create split challenge with distinctly different Demo/Real rules and targets, approve it, reload settings, and evaluate both categories. Saved values must exactly match the review.

### A03 — P1 — Creation/settings can accept incomplete or invalid configurations

**Evidence:** `server.ts:3299`, `:3374`, `:4807`, `:5059`; `challengeGatekeeper.ts:173`; `wpEvaluationEngine.ts:1851`.

Creation mostly checks presence. Rules are saved after the challenge INSERT, with errors swallowed. Rule saving validates category names and boolean switch types, but accepts negative thresholds, fractional trade counts, invalid risk modes, incomplete objects, and missing required category fields. A probe confirmed invalid numeric/mode data is persisted by `saveRules`. Start/open paths do not preflight required configuration. Host concurrency limits are a separate count followed by INSERT, permitting a race.

**Impact:** Apparent creation success can hide a partial challenge; malformed rules can invert checks or disable intended restrictions. Multiple simultaneous creates can exceed a host's configured limit.

**Fix:** Shared schema validation, valid date ordering/timezones/enums, explicit finite numeric bounds and integer counts, enabled-rule dependent requirements, complete category configuration, consistent prize count rules. Persist atomically and enforce concurrency limit with a host-scoped lock. Require readiness before opening registration/starting.

**Acceptance:** Invalid requests fail with field-specific errors and leave no challenge/rule fragments. Simulate a rule-save failure and two simultaneous creates.

### A04 — P2 — Host settings show success for ignored fields and failed responses

**Evidence:** host dashboard `:312`, `:1589`, `:1633`; `server.ts:2718`; `hostService.ts:219`; admin settings `app/admin/panel/page.tsx:3179`.

The host form offers and sends `type` and `start_date`, but the route allowlist excludes both. The form displays prize-pool data from the challenge list, but that list does not select it, and the save payload omits it. Shared deposit/percentage fields are not fully represented through the editing flow. The save handler does not check `response.ok` and marks success even for HTTP errors; it also does not reload persisted challenge data. Admin settings omit several per-category/percentage controls that creation supports.

**Impact:** Users believe changes are saved when they were ignored or rejected; stale exports/screens can disagree with the database.

**Fix:** Match editable UI fields to an explicit server contract. Reject unsupported changes, display errors, return canonical saved configuration, and replace local state from that response. Add reload-based roundtrip tests for every editable field.

### A05 — P1 — Split-mode changes do not provision rules, and monetary settings still inherit shared values

**Evidence:** `categorySettings.ts:40`; settings routes `server.ts:2718`, `:5059`; evaluator `wpEvaluationEngine.ts:1838`.

Settings can switch split mode without creating/validating `config_demo` and `config_real`. Rule resolution is now strict, but `resolveCategoryBalances` still inherits shared balance, target, mode, percentage and target flags when category fields are absent. A probe confirmed a split Real category with missing fields silently takes shared 30/60 values. Host UI still tells users empty category values use shared fallback.

**Impact:** Displayed “independent settings” are not actually independent for all settings. A mode change can stop evaluation or alter eligibility unexpectedly.

**Fix:** An explicit pre-start configuration transition that materializes two complete independent category configurations, with a review of the resulting values. Do not silently copy defaults on reads or backfill live competitions. Freeze the configuration revision once started. Existing incomplete records require an inventory and explicit migration decision.

**Acceptance:** Enable/disable split before start, reload, and compare effective settings across registration/evaluation/display. Missing category values must be reported, never silently inherited.

### A06 — P1 — Status changes can bypass creation approval and reopen started challenges

**Evidence:** `hostRoutes.ts:699`; host dashboard `:1639`; `server.ts:4885`, `:4979`, `:5059`; `challengeGatekeeper.ts:108`, `:261`.

The host direct-status endpoint checks ownership and the destination string only; it does not inspect current status, approval state, prior start, or readiness. A pending/rejected/deleted/completed owned challenge can be set active or registration_open. Settings locks depend on the current status, so reopening also unlocks fields. Admin settings have no equivalent started-state guard. Approving an old queued action writes the destination without checking the source state; approving creation after host deletion can restore the deleted record to draft.

**Impact:** Creation approval, registration closure, and rules/target immutability can be bypassed; historical results can be changed through ordinary controls.

**Fix:** Central state-transition service with expected revision/status checks and persistent `started_at`/configuration freeze. Direct host controls were added in later sessions, so preserve legitimate direct management rather than blindly restoring the oldest “all changes require approval” specification. Explicitly define which transitions need approval; none may bypass creation approval or silently reopen final results.

**Acceptance:** Reject pending→active, deleted→open, stale approvals, and ordinary completed→open. Legitimate start/end performs the same side effects from all entry points.

### A07 — P1 — Approval requests disappear on restart/expiry and can leave stuck challenges

**Evidence:** `challengeGatekeeper.ts:28`, `:39`; `server.ts:3395`, `:3500`; `bot.ts:532`.

Pending actions exist only in a process-local Map. Hosted challenges are inserted as pending_approval before queueing. Restart or 30-minute cleanup removes the actionable token without transitioning the stored pending challenge. Several notification failures are swallowed while reporting successful submission. Callbacks remove the token after awaited work rather than atomically claiming it.

**Impact:** Approval buttons expire across normal deployments; challenges can remain pending and consume host capacity. Repeated callbacks can race or repeat side effects.

**Fix:** Durable approval rows with request payload/configuration revision, pending/processing/approved/rejected/expired states, expiry reconciliation, idempotent claim, visible delivery status and retry. Return “pending approval,” not “created/deleted,” until committed.

**Acceptance:** Request survives a restart; duplicate callbacks execute once; expired/failed-delivery requests have a recoverable dashboard state.

### A08 — P1 — Deactivated hosts and reset passwords do not revoke existing sessions

**Evidence:** `server.ts:2127`, `:2169`, `:2243`; `hostService.ts:108`, `:116`.

Host middleware validates only signature/expiry. Active-account checks occur at login/verify-token, not each protected operation. Password resets do not change a session revision. A previously issued token remains usable for up to 24 hours even after deactivation or password reset. Confirmed in an isolated middleware probe.

**Fix:** Validate current host existence/active state and session version in common middleware; increment version on reset/deactivation/revocation. Do not rely on the dashboard voluntarily calling verify-token.

**Acceptance:** Previously valid token immediately fails after deactivation/reset; another host's resources remain inaccessible.

### A09 — P1 — Registration eligibility depends on which endpoint is used

**Evidence:** `server.ts:664`, `:772`, `:904`, `:1078`, `:1129`, `:1223`, `:3030`, `:8700`; `vpsService.ts:173`; `vps/worker.py:764`.

Final web registration assumes earlier wizard checks happened, but requires no proof and does not repeat rule/deposit validation. A mock registered a $100,000 standard-currency professional account into a $30-cap challenge without querying eligibility rules. `registration_blocked` is checked in an earlier step only; final registration also ignores registration mode. Allocation failures can fail open. Old change-category simply changes the category field. Full change-registration does not enforce the new category against challenge type; account-change validates a different subset/tolerance. CSV allows active challenges, lacks challenge-category matching, and its legacy approval path performs fewer checks. VPS supplies actual `trade_mode`, but the TypeScript verification result discards it. Missing VPS configuration even returns verification success.

**Impact:** Accounts may be accepted that the wizard rejects; Demo/Real labeling and eligibility can differ across entry points. This is separate from the corrected closed-registration button.

**Fix:** Shared authoritative registration/change/import validator using actual verified account mode/currency/subtype, category rules, deposit policy, host integration and registration state. Revalidate at commit after slow verification to close start-time races. Distinguish unavailable verification from valid eligibility; explicitly define any approved late CSV import workflow.

**Acceptance:** Same account gets the same decision via wizard final submit, direct API, CSV and account replacement. Test broker/VPS outages, category mismatch, manual-only registration, host blocking and challenge starting during verification.

### A10 — P1 — Cent-only monetary units disagree between registration and evaluation

**Evidence:** `wpEvaluationEngine.ts:527`; `server.ts:857`, `:1310`; `tradingScheduler.ts:1805`; rule display `wpEvaluationEngine.ts:1921`.

The engine treats Real-only + cent-only input amounts as already in cents. Registration and pre-start checks generally multiply configured starting balance by 100 for any cent account. Example: a configured limit of 30 can mean 30 cents to the evaluator but 3,000 cents to registration. Hybrid Real-cent settings use a different conversion branch again.

**Impact:** An account accepted under one monetary interpretation can later be rejected under another; balance/risk labels can mislead operators.

**Fix:** Explicit stored configuration units and one normalization function for thresholds, money, lot sizing, previews and exports. Preserve legacy challenge interpretations with a version field; never multiply existing live thresholds blindly.

**Acceptance:** Test Demo/Real/hybrid × standard/cent × fixed/max/min modes from creation through registration, pre-start validation, evaluation and reporting. Boundary amounts must agree.

### A11 — P1 — Automatic partner screening uses BirrForex credentials for hosted challenges

**Evidence:** `tradingScheduler.ts:1061`, `:1113`, `:1200`; `exnessService.ts:61`; host-specific manual screening `server.ts:2923`; broker-removal text `server.ts:2854`.

Automatic screening checks every active challenge without a host guard and calls the global Exness service. Manual host screening correctly loads that host's credentials. The automatic path can warn or DQ using “left BirrForex,” even though a hosted challenge belongs to another partner. Removing host integration promises to stop daily verification but does not gate this global scheduled path.

**Impact:** Wrong-tenant allocation checks; possible incorrect warnings/disqualifications or missed screening. This is a confirmed code-path mismatch, not proof any participant has already been wrongly removed.

**Fix:** Challenge-scoped broker context and explicit screening policy. Use each host's integration; skip only when its policy permits no screening. Persist tenant-qualified screening events; do not infer DQ from service failure.

**Acceptance:** Two hosts with distinct mock allocations, plus no-integration host and native BirrForex challenge, cannot affect one another.

### A12 — P1 — Concurrent scheduled challenges can miss every matching update slot

**Evidence:** `vpsPullScheduler.ts:381`.

Scheduler matches exact HH:MM, starts the first matching challenge, then returns. “Next minute will pick up others” is false: 00:01 no longer matches 00:00. It also returns while any pull is running without remembering due work. Two-challenge mock reproduced only the first being scheduled.

**Fix:** Durable per-challenge due-job queue keyed by challenge and scheduled slot; enqueue all due work, then process with bounded shared terminal capacity. Recover missed slots after long runs/restarts without duplicate pulls.

**Acceptance:** Multiple hosts sharing all six daily slots each get one job per slot; long jobs and restarts do not lose or duplicate work.

### A13 — P1 — Scheduled and host updates use the global force-pull path

**Evidence:** `vpsPullScheduler.ts:414`, `:810`, `:844`, `:963`; `hostRoutes.ts:504`.

Normal scheduled work calls the force method: it uses `forceAll=true`, full-history pulls and immediate publication, bypassing normal weekend/exclusion behavior. Host force updates can cancel the globally running cycle for another challenge and clear its queue. After timeout the method can forcibly reset the global lock while old work may still be unwinding.

**Impact:** Routine work behaves as admin override; cross-host disruption, extra terminal load, and possible concurrent write races. Normal weekend/min-days filters in `runPullCycle` are not reliably reached by this scheduled entry point.

**Fix:** Separate normal jobs from explicit administrative recovery overrides; host-scoped cancellation and job ownership; no forced lock reset while workers retain write capability. Reuse the queue from A12.

**Acceptance:** A host action cannot stop another host's job; normal pulls obey scheduling/filter policy; explicit admin override is audited and reports its scope.

### A14 — P1 — Percentage-growth ranking throws SQL error

**Evidence:** `leaderboardService.ts:125`.

Tier 2b sorts by `COALESCE(l.growth_percent, 0)` but selects `FROM wp_leaderboard` without alias `l`. PostgreSQL rejects the query even when no matching negative-balance rows exist. Confirmed read-only with SQLSTATE 42P01. Earlier ranking writes can already have occurred because the ranking operation is not transactional.

**Fix:** Correct alias and execute rank computation/publication atomically; preferably derive all tiers in one deterministic query.

**Acceptance:** Real PostgreSQL tests for fixed and growth modes, empty tiers, mixed categories, withdrawals, blown and DQ accounts, and stable tie-breaks. Mock query success cannot catch SQL name-resolution errors.

### A15 — P1 — Winner selection can disagree with the leaderboard and public winners

**Evidence:** `tradingAdminHandler.ts:3558`, `:3571`; `server.ts:586`.

WP Telegram winner preview sorts by normalized balance, regardless of growth-ranking mode. Public winners use stored rank, but limit by prize-array length rather than configured winner count and read mutable live data. Telegram preview also does not repeat the registration DQ check used by the public route. A trader growing 100→150 (50%) can lose the Telegram selection to 1,000→1,100 (10%), despite ranking higher under growth rules. The public endpoint also special-cases any title containing “Challenge 15,” not one immutable historical ID.

**Fix:** One canonical eligibility/ranking/winner selection service; validate prize/count agreement; snapshot final selected winners with configuration/result revision. Replace title-based historical overrides with explicit historical records.

**Acceptance:** Admin preview, Telegram announcement, host view and public winners return identical identities/order/prizes for fixed and growth competitions; later title edits cannot change historical winners.

### A16 — P1 — “Leaderboard locked” does not actually freeze published results

**Evidence:** `tradingScheduler.ts:682`; `vpsPullScheduler.ts:381`, `:810`; `server.ts:586`.

The lock worker writes `leaderboard_locked_at` after two completed batches, even if its final ranking call fails. Scheduled force-pull selection ignores that lock and continues reviewing challenges within the 48-hour window; manual operations can still publish. The separate two-final-pulls stop condition is in another path. Completed winner presentation remains derived from mutable live rows.

**Fix:** Define finalized result revision, only finalize after successful evaluation/ranking and required reconciliation; enforce the lock in all ordinary write/publication paths. Explicit admin reopen should create a new audited revision rather than silently modifying the final snapshot.

**Acceptance:** No scheduled/host/manual ordinary action changes finalized results; failed final ranking never marks them locked.

### A17 — P1 — Staging publication is not transactional or scoped to an approval

**Evidence:** `leaderboardService.ts:297`, `:330`; `hostRoutes.ts:599`; `server.ts:7748`, `:7789`; `wpEvaluationEngine.ts:2050`.

Bulk flush performs copy, delete and DQ synchronization as separate pool queries. A concurrent staging write between copy and delete can be discarded. Single-user reevaluation/approval sometimes flushes the entire challenge, potentially publishing another user's unapproved staged result. Rejecting an individual pull only deletes staging, while raw trades, trade flags and some registration effects may already have changed. Host reject is explicitly a no-op because it applied inline.

**Fix:** Version staging by run and registration; transactionally publish only the intended completed revision under a challenge publication lock. Distinguish “preview” from already-applied operations in UI. True rejection must avoid mutations until commit or have a verified compensating journal.

**Acceptance:** Two simultaneous account previews, approval of one, rejection of the other, concurrent batch evaluation, and failure between copy/delete cannot lose work or publish unrelated rows.

### A18 — P1 — Daily loss and active-day calendars disagree

**Evidence:** `wpEvaluationEngine.ts:1048`, `:1517`, `:1527`, `:1766`; `vpsPullScheduler.ts:1783`; `evaluationEngine.ts:298`.

WinnerPip groups daily loss and active days by UTC close date, while weekend prohibition uses challenge timezone. Legacy evaluation counts weekday opening and closing dates; scheduler feasibility counts weekdays; engine feasibility counts remaining calendar-day durations. Weekend-permitted crypto and positions spanning midnight therefore get different “days” depending on the path. Example: 23:30 and 00:30 Nairobi trades are on two local dates but one UTC date.

**Fix:** Explicit challenge calendar and active-day definition, applied consistently to daily drawdown, qualification, feasibility and display. Enabled weekend permission must be reflected in available-day calculations. Avoid speculative irreversible early DQ based on incomplete live history.

**Acceptance:** Local midnight, UTC midnight, DST zones, weekends allowed/prohibited, multi-day positions and end-date boundaries yield one result across paths.

### A19 — P1 — DQ recovery can clear manual disqualifications by matching text

**Evidence:** `wpEvaluationEngine.ts:690`, `:1538`; host manual DQ `hostRoutes.ts:620`.

Active-days recovery clears any DQ reason whose lowercased text contains “active.” A manual reason such as “inactive account — host decision” contains that substring and can be cleared if day feasibility is met. Sources of DQ are not represented independently.

**Fix:** Typed DQ reason codes, provenance, timestamps and independent active reasons. Recovery may clear only its own automatic reason; manual exclusions persist until explicitly reversed. Backfill ambiguous old prose conservatively.

**Acceptance:** Recover automatic active-days DQ without clearing manual, credential, recharge or partner DQ; mixed reasons stay disqualified until all applicable reasons are resolved.

### A20 — P1 — Broker encryption reuses a GCM IV for three fields

**Evidence:** `hostService.ts:130`; `utils/encryption.ts:51`.

One IV is generated, then reused with the same key to encrypt broker email, password and API key separately. GCM requires nonce uniqueness per encryption under a key; per-host uniqueness does not solve reuse within the host record.

**Fix:** Versioned encryption envelope with a fresh random nonce per ciphertext, or encrypt one structured credential document once. Keep old-format read compatibility during migration, verify decrypted equality privately, then retire legacy fields. Avoid logging plaintext.

**Acceptance:** Multiple fields/saves have distinct nonces; old and new records decrypt correctly; interrupted migration can resume and roll back. Source defect confirmed; no cryptographic attack or credential disclosure was attempted.

### A21 — P1 — Registration duplicate checks are not enforced atomically

**Evidence:** registration routes `server.ts:930`, `:3126`; `migrate.ts:109`; production index inventory.

Account-number and case-insensitive nickname checks are SELECT-before-INSERT. Production has uniqueness for challenge/email, challenge/user_id, and case-sensitive challenge/nickname, but no account-number uniqueness index. Concurrent requests with different emails can register the same account, and differently cased nicknames can race past the intended check. Removed-record handling varies between routes.

**Fix:** Choose canonical account identity (include broker/server if required), normalized nickname/email and active-registration scope. Audit existing duplicates first; add suitable unique indexes and handle conflicts as friendly 409 responses. Use transaction-safe registration IDs instead of relying on randomized timestamp sentinels as identity policy.

**Acceptance:** Concurrent duplicate submissions across web/CSV/Telegram result in one active registration without deleting historical records.

### A22 — P2 — Removed registrations remain eligible for background work

**Evidence:** `hostRoutes.ts:661`; `vpsPullScheduler.ts:1868`; `leaderboardService.ts:217`; `wpEvaluationEngine.ts:436`; `tradingChallengeService.ts:560`.

Removal changes status and deletes leaderboard rows, but several pull/evaluation/entry-seeding/screening queries omit `status != 'removed'`. Removed rows can be pulled using the modified account identifier, seeded again before cleanup, or included in screening. CSV re-registration can hard-delete old removed registrations, risking loss of dependent history.

**Fix:** One active-registration selection predicate and soft-removal policy across all jobs. Preserve immutable history; do not hard-delete prior registrations to bypass uniqueness.

**Acceptance:** Removing an account prevents all future ordinary verification/evaluation/notifications and survives refresh/restart while retaining its audit history.

### A23 — P2 — Two admin interfaces expose different rule behavior and mock data

**Evidence:** `app/admin/[id]/page.tsx:21`, `:65`, `:212`, `:225`; primary admin `app/admin/panel/page.tsx`.

The older route is still a page with live API calls mixed with hardcoded participants/violations and older rule controls. Its login sends an X-Admin-Key that the server does not validate, and its network-error handler has a demo-access fallback. It is not an inert file outside the app build.

**Fix:** Redirect/decommission the legacy page or migrate it to the same authenticated components/contracts. Keep sample data exclusively in explicitly labeled development fixtures.

**Acceptance:** Every reachable admin entry point uses current authentication and canonical rules; no network failure turns into apparent successful login or believable fake results.

## Newly confirmed findings from the deeper review

### A24 — P1 — Identical deposit history can pass once and disqualify on the next evaluation

**Evidence:** `src/services/wpEvaluationEngine.ts:744–858`; isolated two-pass evaluation reproduced the change.

**Scenario:** A participant registers with zero balance. The first permitted post-start deposit is $100. On the first evaluation, the engine correctly treats it as initial funding and caches `actual_starting_balance = 100`. On the next evaluation, the same cached value is treated as proof that the account was funded before challenge start. The unchanged first deposit is then classified as recharging and the participant is disqualified. No additional deposit or trade is needed.

**Cause/impact:** Cached amount and funding provenance are conflated. Evaluation is not idempotent: polling itself changes eligibility. This applies independently of the optional trade-rule toggles because recharge detection is always enforced. It does not show that challenge 36 had this funding history.

**Fix:** Store or deterministically reconstruct the baseline snapshot time, initial funding transaction identity and funding origin. Detect recharges from subsequent distinct transactions, never from the presence of a cached balance. Bound balance reconstruction to the baseline interval so deposits already included in a snapshot cannot be counted again. Introduce typed recharge reasons for safe targeted correction.

**Acceptance/rollback:** Evaluate unchanged history repeatedly with cache present/absent: same balance and DQ outcome every time. Test zero-funded first deposit, second deposit, pre-funded account, duplicate ingestion and out-of-order ingestion. Inventory affected accounts read-only; preview corrections and journal exact changed fields. Do not bulk clear all recharge DQs.

### A25 — P1 — Partial closes can bypass the maximum lot-size rule

**Evidence:** `wpEvaluationEngine.ts:896–904`, `:1289`; isolated evaluation reproduced a pass.

**Scenario:** A 1.0-lot position closes in two 0.5-lot portions. The configured maximum is 0.6 lots. The evaluator groups the position but uses the largest individual closing portion, 0.5, as its position volume. Both portions pass.

**Cause/impact:** `Math.max` over closing-deal volumes does not reconstruct opened exposure. A participant can exceed the configured lot limit and retain otherwise disallowed profits. This occurs when the lot rule is ON; its OFF behavior is not the defect.

**Fix:** Reconstruct position exposure from entry/exit events and opening-position metadata, with explicit handling for additions, partial exits, still-open remainder and netting accounts. Summing closing portions is sufficient for the simple fully closed example but is not a complete general solution. Share the exposure model with risk/concurrency checks.

**Acceptance:** Whole close versus equivalent partial closes must produce the same max-lot decision; test scale-ins, open remainder, duplicate tickets and equal-to-limit boundary. Preview any historical re-evaluation before changing results.

### A26 — P1 — Daily-loss checks process realized profit/loss in opening order

**Evidence:** `wpEvaluationEngine.ts:579`, `:1045–1075`; isolated evaluation reproduced a missed breach.

**Scenario:** Trade A opens 08:00 and closes 12:00 at +$10. Trade B opens 09:00 and closes 10:00 at −$15. The daily limit is $10. Actual closing order breaches the limit at 10:00. The engine processes A first because it opened first, then B, sees only a $5 net drawdown and never records the breach.

**Impact:** Breaches can be missed and affected later profits can remain counted. Other orderings can produce an incorrect breach time or false breach. Sorting calendar days alone does not fix within-day event order.

**Fix:** Build a separate realized-event stream sorted by close timestamp and stable deal identifier. Keep opening order only for rules that need opening chronology. Apply the agreed challenge-local day boundary (A18) and document treatment of simultaneous closes and fees.

**Acceptance:** Permuting input rows must not alter results. Test the example above, inverse ordering, simultaneous closes and local midnight. Compare both flags and retained/deducted profit.

### A27 — P1 — Percentage daily-loss limits start from the configured limit rather than actual funding

**Evidence:** `wpEvaluationEngine.ts:1053–1060`; isolated evaluation reproduced the missed threshold.

**Scenario:** Configured starting ceiling is $100, actual initial balance is $50, daily cap is 10%. The engine starts its running balance at $100 and uses a $10 cap instead of $5. A $7 loss followed by a profitable trade does not trigger the intended restriction.

**Cause/impact:** The engine has already calculated the participant's effective starting balance, but daily-loss arithmetic uses the original configuration parameter. This especially affects variable-deposit competitions. It is separate from the chronological error in A26 and from cent conversion in A10.

**Fix:** Seed the daily ledger from the authoritative participant baseline; derive subsequent day-opening balances from the agreed balance/event policy. Specify whether non-trading adjustments and already-disallowed profits affect this ledger. Keep rule thresholds and account values in the same declared unit.

**Acceptance:** Same 10% rule with $50/$100 actual deposits must produce $5/$10 first-day caps; test later days, cent accounts, max/min modes and OFF toggles. Do not silently switch a running challenge's baseline policy without a difference preview.

### A28 — P1 — Cent-account withdrawals are subtracted from normalized balances without conversion

**Evidence:** `src/scheduler/vpsPullScheduler.ts:2007–2030`; `src/services/wpEvaluationEngine.ts:1777`; `src/services/leaderboardService.ts:73–135`.

**Scenario:** A cent account has an adjusted balance of 10,000 cents ($100) and withdrawals of 1,000 cents ($10). The evaluator stores normalized balance 100, while the withdrawal accumulator stores raw amount 1000. Ranking subtracts the latter directly: `100 - 1000 = -900`, instead of $90.

**Impact:** A still-positive account can fall outside the positive ranking tier. The negative tier tests the unadjusted normalized balance, so this account can also miss that tier and retain a stale rank. This is distinct from the growth SQL alias defect A14.

**Fix:** Declare units for every stored amount and normalize withdrawals alongside balances, or perform all ranking arithmetic in raw account units before a single conversion. Use one effective-balance expression consistently for tier membership, sorting and display. Recompute withdrawal state from a complete ledger; the current empty-operations early return and live-row-only update also need coverage.

**Acceptance:** Economically identical standard and cent accounts rank identically after partial/full withdrawals. Every eligible participant belongs to exactly one tier, and ranks refresh after publication. Use a versioned result preview before applying recalculated rankings.

### A29 — P1 — Self-service password repair omits the recovery flow used by admin repair

**Evidence:** `src/api/server.ts:8354–8408`, compared with `:8273` and `:8338`; `vpsPullScheduler.ts:2135–2165`.

**Scenario:** A participant fixes their investor password on the client. Successful VPS verification writes the password and `pull_status = success`, then says the account is back online. Admin repair additionally calls the recovery service, resets the incremental cursor and attempts a backfill/evaluation/ranking refresh. The self-service route does not.

**Impact:** The same repair has different data-recovery behavior depending on who performs it. Client success does not establish that missing trades have been reconciled. A subsequent ordinary pull may recover some data, but this route provides no immediate equivalent backfill guarantee.

**Fix:** Route client/admin/bot repair through one recovery operation with separate credential-verified, backfill-pending, evaluated and published states. Fix the challenge-wide staging flush scope in A17 before reusing it for single-account recovery. Clear only explicitly recoverable credential DQs, never unrelated manual DQs.

**Acceptance:** All repair entry points produce equivalent recovery jobs; simulate verification success with backfill failure and retry. UI must accurately report pending synchronization. Journal credential changes privately without logging plaintext secrets.

### A30 — P1 — Password grace-period enforcement uses the wrong clock and only one challenge

**Evidence:** `vpsPullScheduler.ts:43`, `:2220–2242`.

**Scenario:** Credential failure is detected today, but the previous successful pull was already over 24 hours ago. Enforcement uses that old `last_pull_at`, so it can disqualify immediately rather than allow 24 hours after detecting the failure. If `last_pull_at` is NULL, the SQL comparison never matches. The routine also selects only the first active challenge with `.find(...)`.

**Impact:** Some participants get a shortened or absent repair window; others evade this enforcement indefinitely, including participants on other simultaneous active challenges.

**Fix:** Persist `credential_failure_detected_at` on the first confirmed failure and a clear recovery state; evaluate deadlines for every eligible challenge. Do not reset the deadline on every failed poll. Establish how reviewing/finalizing challenges handle pending credential recovery.

**Acceptance:** Test old/null last-pull timestamps, repeated failures, two active challenges, recovery immediately before the deadline and scheduler restart. Existing failures without a reliable detection timestamp need an explicit migration policy, not an invented retrospective deadline.

### A31 — P1 — Trade/deal persistence failures can be swallowed as a successful save

**Evidence:** `vpsPullScheduler.ts:1907–2030`; a real `saveTrades` invocation with a mocked INSERT failure resolved successfully.

**Scenario:** The VPS returns a trade, but its database INSERT fails. `saveTrades` catches and discards the error and returns normally. Deal and balance-operation writes have similar swallowed errors. Callers receive no structured indication that the imported history is incomplete.

**Impact:** Missing trades or deposits can feed evaluation and publication. Retrying the pull is not guaranteed if the failure never reaches job status. A successful network response is insufficient evidence of a successful ingestion.

**Fix:** Track fetched, persisted and rejected counts with explicit errors; use an atomic account/batch import or a durable resumable import ledger. Do not advance the successful ingestion cursor or publish authoritative results until required records are persisted and reconciled. Preserve failed payloads securely for bounded retries rather than silently skipping them.

**Acceptance:** Inject failures at trade, deal and balance-operation writes. The job must be incomplete/failed, previous published results must remain intact, and retry must restore all records exactly once. No real database failure injection in production.

### A32 — P2 — The last-trade ranking timestamp can come from a trade that closed earlier

**Evidence:** `wpEvaluationEngine.ts:579`, `:1624–1629`; `leaderboardService.ts` uses `last_trade_time ASC` as a tie-breaker.

**Scenario:** Using the A26 example, the final row in opening order is B, which closed at 10:00; A actually closed last at 12:00. The stored last-trade timestamp becomes 10:00.

**Impact:** Participants tied on the main ranking metrics can receive the wrong tie-break order. This does not imply that an existing non-tied winner changes.

**Fix:** Compute the maximum eligible close timestamp explicitly from the canonical trade set. Decide whether flagged trades count for this tie-break, and use that policy consistently across public/admin/Telegram winner views.

**Acceptance:** Input order does not change the timestamp or tied ranking. Include overlapping trades, partial closes, excluded trades and exact timestamp ties; verify final snapshot ordering.

## Further questions requiring policy or additional runtime evidence

These are deliberately not added to the confirmed-bug count:

- **What counts as one trade?** Minimum-trade eligibility currently counts closing rows (`wpEvaluationEngine.ts:1566`), while lot/concurrency checks group positions. One position with ten partial closes can satisfy a ten-row minimum. Specify deals versus positions before changing eligibility or displayed totals.
- **Zero-trade eligibility:** The no-trades path writes `isQualified = false` even when targets and minimum-trade/day rules are disabled. Decide whether participation without trading can qualify; align the fast path with that explicit policy.
- **Account replacement and stale metadata:** Staging conflict updates at `wpEvaluationEngine.ts:1789` refresh metrics but omit identity/category/baseline fields. Trace and test account/category replacement with pre-existing staging and trades before treating replacement as safe. Preserve the old account's audit trail and prevent mixed histories.
- **Balance-history bounds:** Deposit queries distinguish before/after start but do not establish a registration-snapshot bound or final competition cutoff. Confirm ingestion history bounds and the intended grace policy before correcting pre-start totals or post-end recharge decisions.

## Revised safe implementation sequence

Keep the five phases below, with these additions: treat A24–A28 and A31 as high-priority result-integrity work alongside A14–A19, and address A29–A30 with lifecycle/recovery work. A32 should ship with the canonical ranking fixes. Access-control exposure A01 remains first; avoid a single enormous deployment combining authentication, ingestion and changed scoring.

For every scoring release: (1) deterministic synthetic regression cases; (2) read-only inventory of affected production accounts; (3) calculation-only before/after preview using existing history; (4) review exact affected participants and fields; (5) briefly pause the affected writers and apply only approved corrections atomically; (6) verify every view and retain a conflict-aware restoration journal. No isolated production database copy is required. Never let deployment itself trigger an unreviewed all-challenge recalculation.

A rollback requires both the prior code revision and the matching data journal. Additive funding/recovery metadata should remain readable by the prior release. Once a notification or winner announcement has been sent, it cannot be reversed by Git; preview and withhold those side effects until verification. Safety here means bounded, observable changes with tested recovery—not a promise of zero possible impact.

## Additional confirmed gaps and decisions to settle

These should not be silently folded into the current live challenge's results:

- **Scoring window:** `wpEvaluationEngine.ts:568` accepts closes from three hours before start to 27 hours after end. This is hardcoded and differs from an ordinary displayed competition period. It may encode historic MT5 timing/grace policy; establish the intended trading cutoff separately from the ingestion/reconciliation window before changing it. Do not automatically remove current trades because of this audit.
- **Legacy manual evaluation:** still has approximate percentage-risk conversion and different active-day semantics. Keep it clearly separated from authoritative WinnerPip results until unified. The previous session already documented the percentage limitation.
- **Lifecycle duplication:** TradingScheduler and VpsPullScheduler both start/end challenges with different side effects. Depending on which wins, participant emails or immediate final pulls can be missed. Consolidate into A06/A12 with an idempotent outbox.
- **Startup migrations:** many required migration failures are swallowed while startup continues (`database/migrate.ts`), and runtime ranking performs DDL. Move to versioned migrations, verify required schema, fail clearly on necessary migration errors; do not run destructive migrations casually on startup.
- **Quiz subsystem:** `participantService.ts:27` uses `COUNT(*)+1` without per-challenge serialization, so concurrent inserts can get duplicate completion-order labels despite the comment claiming atomic uniqueness. Actual ranking uses completion timestamp, so this does not by itself prove wrong winners. `winnerService.ts:89` backup promotion does not apply the same prior-winner eligibility pool as the scheduler. Add isolated quiz concurrency/promotion regression tests as a separate work item.
- **Reporting/notifications:** announcements still format shared balances/targets and can send hosted announcements through native BirrForex channels (`server.ts:4979`). HTML/CSV builders interpolate user-provided labels inconsistently. Use canonical category-aware presentation, escaped HTML, correct CSV quoting and spreadsheet-formula treatment. Do not send test announcements to real users.
- **Host deletion:** hard-deleting a host nulls challenge ownership (`migrate.ts:476`), changing downstream host-vs-native behavior for surviving challenges. Prefer deactivation/archive; any ownership transfer needs explicit policy.

## Implementation plan — direct to main, no staging database clone

### Phase 1: Access control and host isolation

Address A01 and A08 first; add authorization inventory tests for every route. Build compatible frontend/backend session changes before rollout and verify admin login access during the release. Fix host-specific screening (A11), and prevent cross-host cancellation (part of A13). These changes should not recalculate balances or flags.

Back up relevant auth/host configuration privately. A security rollback must retain authentication enforcement; do not revert to anonymous admin access as a convenience.

### Phase 2: One creation/settings/registration contract

Address A02–A07, A09–A10 and A21. Introduce a small shared configuration model/validator, transaction helper, readiness check and transition service; adapt existing routes incrementally rather than rewriting the whole 9,000-line API at once. Return persisted configuration and honest pending/error states. Persist approval requests and configuration revisions.

Start with new/draft challenges. Inventory historical split/null/cent configurations read-only; preview any necessary normalization row by row. Do not guess what a host intended when a field was dropped. Existing started challenges keep a frozen legacy interpretation until an explicit, reviewable correction is approved.

### Phase 3: Scheduling and lifecycle reliability

Address A12–A13, lifecycle duplication and A22. Store due jobs by challenge/slot and use one worker coordinator with host ownership, cancellation tokens, bounded retries and persistent job progress. Implement ordinary and override job modes explicitly. Start/end/finalize side effects use an outbox so restart does not lose or duplicate notification work.

Release with current in-flight jobs drained; do not force-reset locks while workers can still write. Avoid introducing a second scheduler process concurrently against live jobs.

### Phase 4: Authoritative results and finalization

Address A14–A19. Correct ranking SQL, centralize winner selection, version staging, publish atomically, and freeze final snapshots. Add typed DQ causes. Define currency/calendar/scoring-window policy before changing those results.

Use pure fixtures and mocks for most tests. For SQL integration, use schema-only fixtures with synthetic data (no production database clone) and read-only SQL validation against production where appropriate. For any live correction: capture before/after rows, preview differences without publication, pause only relevant writers, apply in a short transaction, retain a conflict-aware restore journal, and verify public/admin/host output. Never automatically re-evaluate all historical challenges on deployment.

### Phase 5: Credential storage and presentation cleanup

Address A20 and A23, archive legacy UI, fix exports/announcements, audit host deletion, migration reliability and quiz promotion. Crypto migration must be dual-read/versioned, separately tested, and reversible without exposing secrets. Remove obsolete compatibility code only after all affected records and consumers are verified.

## Required test matrix

| Area | Required cases |
| --- | --- |
| Creation | Admin, host, Telegram/Discord adapters; Demo/Real/hybrid; shared/split; rule-save failure; duplicate approval; restart |
| Configuration | Every field create→persist→reload→evaluate; each toggle OFF/ON; missing rules; split transition; invalid values; concurrent edits |
| Money/targets | Fixed/max/min; standard/cent; enabled/disabled targets; below-start eligibility; independent category settings |
| Registration | Web final API, CSV, account/category change; subtype/actual trade mode; blocked/manual registration; broker/VPS outage; concurrent duplicates |
| Status | Pending/rejected/deleted transitions; start/end races; previously-started reopen; stale approvals; started-field locks |
| Jobs | Several challenges at same slot; delayed job; restart; host cancellation; no cross-tenant effects; ordinary vs force policy |
| Results | Real SQL for all ranking tiers; percentage ordering; winner/count/prize consistency; single vs batch publication; failure/retry; final freeze |
| Days/DQ | Challenge-local midnight/DST; weekends permitted; incomplete data; typed manual/automatic DQ and recovery |
| Security | Every admin/host route unauthorized/wrong-role/revoked cases; no secrets in logs; versioned encryption migration |

## Rollout, reversibility and risk

Use separate reviewed commits per phase, direct-main deployment as requested, with explicit known-good commit/deployment IDs. Keep additive schema changes compatible with both current and new readers; avoid destructive column removal. Back up before any production mutation and record all modified rows/configuration revisions. A git revert restores code, **not** changed database results, so data rollback must use its own checked journal.

Read-only health/UI checks follow each deployment. Halt publication on unexpected eligibility or balance differences. Restore only fields that still match the recorded post-change state; later legitimate activity must not be overwritten. Notifications and already-seen announcements cannot be made unseen, so preview them without sending during validation.

This audit does **not** authorize automatic remediation. Recommended next implementation order: access control → creation/configuration contracts → job isolation → authoritative results/finalization. Challenge 36 needs no further data correction based solely on the findings verified here.
