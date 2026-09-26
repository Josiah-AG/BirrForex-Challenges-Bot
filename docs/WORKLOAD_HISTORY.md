# Persistent workload history

Added 2026-09-26. This instruments outgoing VPS operations and durable pull/sync job state transitions. It does not change terminal allocation, schedules, retries, evaluation, or publishing.

## Stored data
- workload_requests: arrival/completion, operation allowlist, outcome, HTTP duration, status, returned terminal and trade count, correlation ID where available.
- workload_job_events: job creation time, state transitions and attempt count. No foreign key: operational pruning cannot erase history.
- Existing jobs receive explicitly marked baseline events; earlier history is not reconstructed.
- No passwords, API keys, request bodies, URLs, raw trades, account numbers or free-text errors.
- No automatic history deletion. Review storage growth with the first load review and set a retention policy then.
- These are VPS workload records, not every website HTTP request. Rejected/deduplicated submissions that create no job and no VPS call are not recorded.
- Individual HTTP attempts include retries. They must not be counted as unique user demand; use job IDs and job transitions.
- A response_received outcome does not prove complete history/publication. Consult job outcomes and existing batch records. Crashes leave unfinished records.
- HTTP time includes router queueing and broker processing, not a separate measurement of each. App queue wait measures observed queued-to-running transitions, including retry backoff.
- Both databases remain independent; combine exports by timestamp to inspect overlapping demand.

## Admin reports
Authenticated admin API endpoints appended to the existing admin base path:
- GET /workload-report?days=7 : operation/outcome counts, p50/p95/max timing, hourly request volume, app queue wait, coverage and capture health.
- GET /workload-events?days=7&kind=requests&offset=0 : raw request history, 500 rows/page.
- GET /workload-events?days=7&kind=jobs&offset=0 : job events.
Use next_offset until null. Days is bounded to 1–90. Data older than the report window remains stored in SQL.
No new public endpoint or credentials are introduced.

## Failure isolation and rollback
HTTP telemetry uses a separate pool of at most two connections with 1-second connection/query timeouts. Writes are best effort: a DB outage must not turn a successful account update into failure. This can add bounded latency; normal overhead should be checked from live measurements. Failed writes are counted per process in report capture status and logged without sensitive details. Job trigger failures emit a generic database warning. Capture is not guaranteed during a database outage or abrupt process termination.

Set WORKLOAD_TELEMETRY_ENABLED=false and restart the backend to disable request capture and remove the job trigger during startup. Existing history stays intact. To roll code back directly, first remove the workload_job_event trigger from the relevant operational job table (challenge_pull_jobs on WinnerPip; broker_sync_jobs on MyFxPath); preserve both history tables. Reverting the application commit is then sufficient. No VPS worker restart or trading database restore is needed.

## Review
After 7–14 representative days, compare demand by hour, queue p95, request latency p95, retries, unfinished requests, outcomes and full cycle duration from existing batch records. Include broker outages and peak overlap. Use those observations to decide capacity/sharing changes; daily request totals alone are insufficient.
