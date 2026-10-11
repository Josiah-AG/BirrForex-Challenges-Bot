# Sprint 1 evaluation and participant notice audit — 2026-10-11

## Scope and current state
Sprint 1 (#39) remains a draft hybrid BirrForex challenge, with no participants. Demo/real category selection, cent units, monetary risk, realized daily drawdown, credential deadlines, DQ decisions and participant notification routing were checked. No test messages, test registrations, live shadow writes, or historical leaderboard changes were made.

## Corrections
- Standard Exness `m` symbols were incorrectly treated as cent instruments in declared-SL risk. Risk now derives account-currency price value from broker gross P/L and actual closed volume, scaled to the full exposure for partial closes. Commission/swap no longer distort that price conversion. Known USD-quoted fallback contracts remain available; unavailable conversion does not invent an index/JPY contract value.
- Daily drawdown includes trade commission/swap and separate broker commission, fee, swap, tax, interest and dividend entries in chronological order. Transfers and balance resets affect the balance, not realized trading loss. Percentage caps use each challenge-local day's opening balance. Violation labels and warnings use that day's actual cap and account money units.
- Database bigint ticket strings are normalized when checking drawdown flags. A full shadow run caught this issue during development before deployment; a regression test covers it.
- Drawdown notices are queued within evaluation transactions and delivered only after commit. New warnings are limited to the current challenge-local day, avoiding historical replay spam.
- DQ and active credential-failure notices are queued atomically with registration transitions. Failed delivery is retried, not marked sent. Superseded credential/recovery/DQ notices are cancelled. Recipient identity comes from the current registration and challenge: Telegram for Telegram registrations, email for hosted/web/CSV registrations, Discord queue for Discord.
- Admin/host manual DQ uses the same delivery queue. Removed duplicate direct host emails and unsafe admin attempts to send web placeholder IDs Telegram messages.
- Credential recovery notification follows successful recovered-history publication and now supports hosted email too. Original 24-hour deadlines remain unchanged on reminders; expiry checks run every minute.
- The pre-start balance snapshot no longer prematurely disqualifies unresolved credentials two hours before start. That decision occurs transactionally at actual challenge start, excluding removed registrations and including both credential-failure status names.

## Verification
- Backend TypeScript build and frontend TypeScript check passed.
- 222 automated tests passed, including hybrid category separation, cent-only versus mixed cent conversion, native monetary risk, partial closes, non-USD quote conversion, daily fees and timezone boundaries, string ticket IDs, recipient routing, retries, deadline text, and challenge-start enforcement.
- Real PostgreSQL temporary-table/rolled-back migration test passed: one credential event and one DQ event; repeated state writes do not duplicate events; pre-start and existing partner-departure paths do not receive duplicate notices. Production data writes: zero.
- Historical representative demo, real standard and real cent accounts produced identical before/after results in the read-only comparison.
- All 95 active non-DQ accounts evaluated without errors. Six changed under the corrected risk calculation; the remaining 89 were unchanged. See adjacent shadow JSON. No live writes or messages occurred.
- Routing audit: 1,848 historical BirrForex Telegram registrations had positive user IDs; all 101 hosted registrations had email addresses. No hosted placeholder IDs are routed to Telegram.

## Expected active-result changes
| Registration | Previous adjusted balance | Corrected adjusted balance | Reason |
|---|---:|---:|---|
| 5272 | 8,377.7755 | 7,962.0555 | Oversized XAU declared SL previously understated |
| 5277 | 8,014.5579 | 6,516.1079 | Oversized XAU/BTC declared SL previously understated |
| 5282 | 10,489.07 | 9,854.07 | Oversized XAU declared SL; falls below starting-balance floor |
| 5291 | 7,866.53 | 7,509.29 | Index monetary risk calculated from broker P/L |
| 5292 | 6,465.5644 | 5,832.0644 | XAU and cross-currency SL monetary risk corrected |
| 5330 | 11,657.33 | 11,658.03 | UK100 trade incorrectly flagged by generic forex contract assumption |

These are corrected evaluations, not edits to challenge rules. Normal subsequent evaluation uses the corrected code; completed results remain locked. Shadow findings are tied to the snapshot tested, not a guarantee of future balances.

## Operational limits
Telegram cannot deliver to a user who blocks the bot or has never opened it. Such failures remain pending with attempts/error/backoff rather than being reported as delivered. Telegram has no application idempotency key: an ambiguous network failure after provider acceptance can still cause a duplicate retry. No real participant delivery was exercised during this audit. Discord delivery is handed to the existing Discord worker. Unsupported zero-movement instruments lacking a safe conversion remain pending rather than receiving fabricated monetary risk.

Daily drawdown flags subsequent same-day profits; it is not itself an automatic account disqualification. Other DQ rules and minimum-qualified-trade requirements still apply. The early-start credential deadline correction matches the existing pre-start warning promise.

## Primary references
- Exness Standard Cent account: https://get.exness.help/hc/en-us/articles/17537782786588-Standard-Cent-account
- Exness Standard account symbols: https://get.exness-affiliates.help/hc/en-us/articles/360010858660-How-is-Standard-accounts-commission-calculated
- MetaTrader profit calculation in account currency: https://www.mql5.com/en/book/automation/experts/experts_ordercalcprofit
