# Starting balance and pre-start warning release

Applies to both hosted and admin challenges. No VPS binaries or terminals change.

## Policy
One shared function compares monetary values in broker account units after existing USD/USC conversion. Fixed mode accepts the configured amount through the rest of that whole-unit decimal range (100.00–100.99); 99.99 and 101.00 fail. Explicit maximum and minimum modes preserve their direction. A cent account limit of 100000 USC accepts 100000.10 USC, not 100001 USC. Comparisons round to displayed two-decimal money values.

Registration, Telegram registration/replacement, manual checks, daily checks, pre-start snapshots, and WinnerPip funding evaluation share the policy. Archived/already-started/pre-start-checked challenges retain their previous evaluation policy; migration changes no balances, trades, or results.

## Schedule and delivery
- <=500 verified participants: warning scan T-5h, final scan T-2h.
- >500: warning scan T-6h, final scan T-3h.
- Final lead time freezes when the warning window is entered, so subsequent participant growth cannot shorten the deadline already communicated. An approved start-date edit resets this choice before final checks have begun. Changing dates remains forbidden once final checks begin.
- Daily local 02:00 checks continue. Manual admin checks use the same category policy and notifications.
- Only mismatched balances receive warnings. Hosted/web users receive email, Telegram users a direct message. The dashboard shows the deadline and correction instructions.
- Per-account durable ledger records checks and confirmed delivery. Five-minute retries reverify failed notices before sending; successful final notices are not repeated. Retries stop at final verification. A missed warning is not a grace period.
- Two concurrent warning challenge jobs, at most three concurrent VPS verification calls across them. Warning scans do not block the lifecycle scheduler. Real check duration still depends on VPS/broker responsiveness; start times are not completion guarantees.
- VPS timeout/API errors leave balances unverified and retryable; they do not set password_changed or disqualify a user.

## Verification
94 unit/regression tests passed. The local PostgreSQL hardening suite passed. A new local PostgreSQL integration test exercises real migration/ledger SQL, failed delivery retry, deduplication, corrected 100.10 accepted versus 101 disqualified at final check, and post-check schedule locking. VPS and message transports in these tests are synthetic. Frontend and backend builds passed. No test emails or Telegram messages were sent to real participants.

## Reversal
Baseline application commit: 1e4f1c79 (before this release). Revert only this release's commit and redeploy both Railway services. Additive columns starting_balance_policy/pre_start_lead_hours and prestart_balance_checks may remain; old code ignores them. Do not delete audit/delivery records or automatically undo real disqualifications/financial data. Review any actual checks performed after rollout before reverting their effects. Preserve pending/delivered ledger state to avoid duplicate messages if re-enabling.
