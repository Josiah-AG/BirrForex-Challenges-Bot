# Registration routing and dashboard refresh

Registration links now open the hosted wizard independently of an existing participant token. Participant dashboard requests carry the selected challenge ID; the API rejects a token for another challenge with HTTP 409. Scheduled challenges have a pre-start view instead of an empty page.

Admin and host dashboards discard responses from previous challenge/tab selections and clear challenge-specific data when switching. Both have a Refresh data control, refresh visible read-only views every 30 seconds, and refresh when returning to the window. Editable settings/rules are excluded from automatic reloads to preserve drafts. This is periodic refresh, not a push subscription.

Registration confirmation popups retain notices and display account details and verified balance. The CSV approval registration email now also receives the verified balance.

Validation: backend build, frontend production build, 70 existing tests; mocked browser checks in Chromium and WebKit for registration with an existing token; Chromium delayed-response tests for both admin and host challenge switching and manual refresh selection preservation. No real registrations or emails were sent by browser tests.

Rollback: revert this commit and redeploy both services. No database migration or VPS process changes are included.
