# Sprint 1 readiness review — 11 October 2026

Production configuration inspected read-only: challenge 39, Sprint 1, draft, BirrForex (no host), hybrid, zero registrations at inspection. No challenge business settings or participant data changed.

## Saved rules and dates

- Africa/Nairobi (EAT/UTC+3): 19 October 2026 00:00 through 23 October 2026 23:59. Five trading dates, Monday–Friday.
- Registration deadline: 19 October 00:00 EAT. Draft must be opened for registration before the start; draft challenges intentionally do not auto-start.
- Both categories: minimum starting balance $10; target 50% growth from each participant's actual starting balance. The stored absolute target $60 is inactive under minimum-balance mode. A $10 start therefore needs a $15 qualified balance, plus the other eligibility rules.
- Two real winners ($100 each), two demo winners ($50 each); $300 total.
- Four active trading days; five qualified trades; minimum hold three minutes; maximum hold 24 hours; maximum four concurrent trades.
- Per-trade risk 10% of balance at entry; daily loss limit 30% of day-opening balance. These are substantial allowances and remain the administrator's selected rules.
- Lot-size and pair-count enforcement disabled. The stored 0.02 lot/two-pair values are not enforced. Professional accounts disabled; cent-only restriction disabled. Weekend prohibition toggle disabled, but this challenge has no weekend dates.
- Scheduled pulls: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 challenge time. Existing lifecycle queues final synchronization at the end independently of regular slots.
- No PDF/video attached. In-app rule display is available and was inspected.

## Corrections

- Removed hardcoded ten-day daily Telegram messages and incorrect week-two/final-day wording.
- Added 60 stage-specific templates: six for each of five stages, separately for morning and evening. Selection is randomized among unused recent templates; message choices persist for retries. Cross-challenge recent history reduces repetition.
- Calendar uses actual challenge bounds and timezone; weekend inclusion follows effective category rules. Midnight end does not create another day. Short opening/closing sessions adjust posting hours to stay inside the challenge.
- Morning/evening posts on first and final trading days go to both channels; all other daily posts go to challenge channel only. Hosted and Discord challenges remain excluded from BirrForex daily Telegram delivery.
- Added database-backed selected messages and per-channel receipts, with an advisory lock across scheduler ticks/replicas. Successful recipients are not resent when another recipient fails. Retries occur within a bounded 30-minute posting window.
- Added WinnerPip dashboard/status CTA to public daily, countdown, registration/promo, lifecycle, results, deadline, and additional-post paths. Operational admin alerts are kept operational.
- Corrected minimum/maximum-balance announcements to show percentage targets, including the admin website registration announcement; fixed relevant public announcement dates to use challenge timezone.
- Updated Telegram daily-post controls/sequences to actual duration rather than ten days.

## Validation and limits

- Production configuration validator passed. Production rule display confirmed enabled rules. Main and challenge channels both report bot administrator permission to post. VPS health endpoint responded successfully.
- Backend compilation and automated tests cover five/ten/fifteen-day calendars, weekends, midnight boundaries, short sessions, HTML title escaping, random pool rotation, exact deadlines, routing, hosted/Discord exclusion, concurrency lock, and partial-channel retry with stable content.
- Existing evaluation, pull, lifecycle, balance and minimum-qualified-trade regression tests also pass. No public Telegram test posts were sent. No synthetic trading-account activity was introduced.
- Draft has no participants, so a real Sprint 1 account pull cannot yet be tested. Market/broker downtime, Telegram outage, or infrastructure failure cannot be ruled out. A send accepted by Telegram followed by a lost response/database failure can still cause an ambiguous retry; Telegram has no idempotency key for this API. Outages exceeding the posting window do not replay stale daily posts later.
- This review does not change trading/ranking calculations. Four active days in five means only one day can be missed; qualifying trade count is five qualified trades, not five arbitrary trades.
