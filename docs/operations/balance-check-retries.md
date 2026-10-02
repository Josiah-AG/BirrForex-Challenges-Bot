# Balance-check retry policy

Daily/final checks use a durable prestart_balance_rounds record, serialized by the existing challenge advisory lock. One initial round plus two retry rounds are permitted. Retry delay is five minutes after the entire preceding round finishes. Successful accounts are excluded; known credential failures remain excluded until a verified account/password update. Explicit manual rechecks can begin another bounded run.

Credential rejection marks password_changed for the existing admin/host failure list. Credential notifications have independent attempt/delivery timestamps and an email idempotency key. Delivery is marked only after provider acceptance; email failure does not retry broker login. Demo notices explain account replacement before challenge start. Existing unbounded-loop credential errors are adopted without a new login, unless credentials were verified more recently.

Verified updates persist a recovery job and trigger it immediately. Registration-open recovery performs a targeted balance recheck; active-challenge recovery retains the existing history synchronization/evaluation workflow. Locks and the durable job provide fallback when another operation is running.

New retry rounds update one history row. Historical rows are retained. Duration is elapsed time including retry waits. Schema changes are additive; revert the deployment commit to roll back code, leaving the new tables/columns in place. No VPS terminal restart is required.

Validation: build, unit suite, local PostgreSQL prestart-balance and balance-retry-rounds integration tests with mocked broker and email calls. The latter verifies 21 accounts, 2 transient retry rounds, independent credential email delivery, admin failure visibility, and immediate verified credential recovery. Tests never send real email.
