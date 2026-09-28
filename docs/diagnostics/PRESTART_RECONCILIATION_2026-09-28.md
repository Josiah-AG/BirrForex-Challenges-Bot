# Final-check gap reconciliation and pre-start trade exclusion

Scope: new decimal-policy admin/hosted challenges. Production challenge 38 is registration_open with no final snapshot yet; VPS_VERIFIED_HISTORY is true. Historical legacy-policy trade windows remain unchanged.

Final checks now save an immutable balance and verification request time interval. At evaluation, verified raw broker deals reconcile that balance against the latest verified cash balance. Request-time activity is matched by complete timestamp groups; missing or ambiguous evidence fails evaluation and uses the existing durable history retry/review path. It never creates a speculative disqualification. Broker credit does not change cash balance; fees, commission, swap and other economic adjustments are included. Cancelled-deal corrections require reconciliation.

Between snapshot and start, trading/non-funding gains are removed from the competition baseline and excess-funding test. Losses reduce the baseline and may be restored before start. Deposits/withdrawals remain in the funding calculation. Example: 100 + 50 pre-start trading profit remains a 100 competition baseline; adding 20 cash creates a 120 funding baseline and exceeds the fixed 100 requirement. A 95 snapshot plus 5 cash is allowed. The decimal allowance remains unchanged. Existing post-start recharge rules remain in force.

Trades opened before the exact start timestamp are flagged "Opened before challenge start — excluded from challenge results" and excluded from P/L, counts, active days and rule calculations, including trades closed after start. Both winning and losing trades are excluded. No automatic historical DQ reversal is performed.

Validation: 103 unit/regression tests passed; local PostgreSQL pre-start integration exercised snapshot persistence, excluded gain, actual ledger reconciliation, missing-history rollback, and excess-deposit DQ. Existing hardening database integration passed. Backend build passed. No live notifications, real participant data edits or VPS restarts were used in tests. Detection happens at the first successful post-start pull/evaluation, and repeats with later verified history.

Performance: one additional local deal query and in-memory reconciliation per evaluated snapshot account, plus one bulk exclusion update. No additional VPS verification call or terminal deployment. No large-account timing claim has been made.

Rollback: revert this release to 05ec43c and redeploy the backend. Three additive nullable registration columns may remain. Existing pull operation journals retain before/after financial states for targeted review if a published result must be rolled back; do not blanket-clear disqualifications or delete audit history.
