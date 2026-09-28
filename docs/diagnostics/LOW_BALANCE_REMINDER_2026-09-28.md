# Lower pre-start balances: reminders, not disqualification

Final pre-start verification and subsequent WinnerPip evaluations now disqualify only an excess starting balance. Low balances still trigger the existing correction reminder. Both hosted and admin challenges use these paths. Registration validation and unrelated recharge/trading rules are unchanged. Existing disqualifications are not automatically reversed.

For a fixed 100 requirement: 95 remains eligible, 100.99 passes, 101 fails. Reminder and participant dashboard copy explain this distinction.

Validation: 96 unit/regression tests, local PostgreSQL integration (95 accepted, 100.10 accepted, 101 disqualified), backend TypeScript build and frontend production build passed. No real participant notifications or VPS changes were used for testing.

Rollback: revert this release commit and redeploy. No schema/data migration is involved. Previous release: e1489aa9.
