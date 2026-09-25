# Rule isolation and disabled-rule repair — September 25, 2026

## Scope

Split hybrid challenges resolve Demo exclusively to `config_demo`, Real exclusively to `config_real`. Single-category/non-split challenges use `config`. Missing configuration stops evaluation; reading/evaluating no longer silently seeds rules. Historical configurations without an enable map retain their previous semantics. Explicit OFF always overrides retained numeric values.

The main evaluator, SL retry, manual-upload evaluator, scheduler minimum requirements/weekend pulls, registration filters and rule displays use the relevant category. The legacy manual evaluator's existing percentage approximation is not converted into a new pricing engine by this change; its OFF states and rule-category selection are corrected. Exact per-trade percentage evaluation remains in the WinnerPip evaluator used by the live challenge.

No automatic reversal of historical/manual DQs is attempted. Challenge 36 has no DQ to reverse. The repair tool refuses any registration-state change and refuses configurations that are not explicitly all-OFF.

## Verification

- `npm test`: rule-by-rule ON/OFF, screenshot regression, category isolation, missing-config preflight, cent conversion, percentage risk, mixed settings, legacy weekend behavior and journal conflict checks.
- `npm run build`: backend build.
- `npm run build --prefix WinnerPip/winnerpip`: production frontend build.
- `tests/browser-smoke.cjs`: local mocked-API browser checks for open/active/reviewing/draft login and closed direct registration URL. Requires Playwright/Chrome; not part of default unit tests.
- Production preview and roundtrip run the actual evaluator against existing records in a transaction. Neither publishes results; both roll back.

## Production evidence and private backups

At inspection, challenge 36 `TRIAL` was reviewing, non-split Demo, all ten enable switches false. One participant, 15 trades, seven incorrect max-risk flags, no DQs. Preview: seven flags become zero, adjusted balance remains 9386.25, rank remains 1. A roundtrip restored all snapshotted records exactly before rolling back.

Private backups are outside Git at `../.repair-backups/` (directory 0700, journals 0600). They contain evaluation records and must not be committed or shared. Investor passwords are excluded. Deployment baseline is in `deployment-baseline.json`; initial production commit is `5227787fd002ec6771a8a37071b9b70bbe110b95`.

## Apply and restore

Only run after checking the correct Railway project/production environment. `web` is the backend/API; `BirrForex-Challenges-Bot` is the frontend despite its name. Do not stop Postgres.

1. Ensure no running pull/evaluation batch. Stop backend `web` during the brief repair/deployment window; reviewing challenges can still perform final pulls.
2. `node scripts/repair-rules.cjs apply 36 ../.repair-backups/challenge-36-applied.json`
3. The tool verifies the backend is stopped, locks affected tables, checks exact rules, captures before state, evaluates without notifications, checks mutation scope, saves/fsyncs a private journal, then commits.
4. Deploy the tested main commit and verify backend/frontend health and published flags/balance/rank. Do not restart the old buggy code over corrected results.

Rollback requires BOTH code and data when evaluation results were published:

1. Stop backend writers and verify no running batches.
2. `node scripts/repair-rules.cjs restore 36 ../.repair-backups/challenge-36-applied.json`
3. Restoration first verifies every changed field still equals its post-repair value. A newer evaluation or changed value aborts the whole transaction; investigate instead of forcing a restore. Unrelated fields are not overwritten. Unsupported deleted-row restoration is refused.
4. Redeploy the recorded pre-change backend/frontend revisions, or revert the implementation commit(s) on main using ordinary revert commits. Do not reset shared history. Preserve pre-existing local edits.
5. Verify results and service health before resuming normal use.

The roundtrip mode proves database-type restoration in a rolled-back transaction. It does not guarantee blind rollback after unrelated subsequent production changes. Raw MT5 trade history, real losses and challenge configuration are not changed by this repair. No repair notifications are sent.
