# Host Mode — End-to-End Test Plan

This document is a step-by-step testing guide to verify every piece of the Host Mode system works correctly before onboarding real hosts.

---

## Prerequisites

- Bot running on Railway (or locally with `npx ts-node src/index.ts`)
- WinnerPip frontend deployed (or `npm run dev` locally)
- PostgreSQL database accessible
- VPS Python workers running (for MT5 verification)
- Resend API key set (`RESEND_API_KEY` env var) — or skip email tests
- Broker encryption key set (`BROKER_ENCRYPTION_KEY` env var) — 64-char hex

---

## Phase 1: Admin Creates a Host

### Test 1.1 — Create Host via Admin Panel

**Steps:**
1. Go to `winnerpip.com/admin/panel` (or local)
2. Log in with admin key
3. Click "Hosts" button in the header
4. Click "+ Create Host"
5. Fill: Display Name = "Test Host Co", Email = "testhost@example.com", Password = "TestHost123"
6. Click "Create Host Account"

**Expected:**
- Modal shows solid dark background (no bleed-through)
- Success — modal closes, host appears in the list
- Host list shows: green dot (active), "Test Host Co", "testhost@example.com", "0 active · 0 total"

**Verify in DB:**
```sql
SELECT id, display_name, email, active, has_broker_integration FROM hosts WHERE email = 'testhost@example.com';
```
Should return 1 row, active=true, has_broker_integration=false.

---

### Test 1.2 — Host Management Actions

**Steps:**
1. Click "View" on the host
2. Verify detail panel expands showing: Status (Active), Broker Integration (—), Total Logins (0), Created date
3. Click "Reset Password" → set to "NewPassword1" → click Reset
4. Click "Deactivate" → host dot turns gray
5. Click "Activate" → host dot turns green

**Verify in DB:**
```sql
SELECT active FROM hosts WHERE email = 'testhost@example.com';
-- Should be true after reactivation
```

---

## Phase 2: Host Authentication

### Test 2.1 — Host Login

**Steps:**
1. Go to `winnerpip.com/host/login`
2. Enter email: testhost@example.com, password: NewPassword1
3. Click Login

**Expected:**
- Redirects to `/host/dashboard`
- Header shows "Test Host Co" + "HOST DASHBOARD"
- Empty state: "No challenges yet" with "Create Challenge" button
- `localStorage` has `host_token` and `host_info`

### Test 2.2 — Token Persistence

**Steps:**
1. Refresh the page
2. Dashboard should reload without re-login (token verified via API)

### Test 2.3 — Deactivated Host Rejected

**Steps:**
1. Admin deactivates the host via admin panel
2. Host refreshes dashboard
3. Should redirect to login page (verify-token returns 401)
4. Admin reactivates the host

---

## Phase 3: Host Creates a Challenge

### Test 3.1 — Challenge Creation Form

**Steps:**
1. Host dashboard → click "+ New Challenge" (or "Create Challenge")
2. Fill:
   - Title: "Test Trading Challenge"
   - Type: Hybrid
   - Deposit Mode: Fixed
   - Start Date: tomorrow (set 24h from now)
   - End Date: 7 days from now
   - Starting Balance: 30
   - Target Balance: 60
   - Prize Pool Text: "$500 Prize Pool"
   - Real Prizes: 300, 200
   - Demo Prizes: 200, 100
3. Click "Submit for Approval"

**Expected:**
- Success message: "Submitted for Approval"
- Admin (you) gets a Telegram message:
  ```
  🔐 Challenge Creation Request
  Title: Test Trading Challenge
  Type: hybrid
  Source: winnerpip
  ...
  ⚠️ Confirm to create this challenge.
  [Approve] [Reject]
  ```

### Test 3.2 — Admin Approves Challenge

**Steps:**
1. Click "Approve" on the Telegram message

**Expected:**
- Telegram confirms: "Challenge created successfully"
- Host refreshes dashboard → challenge appears in selector
- Challenge status shows "Draft" initially (or "Registration Open" if start_date logic applies)

**Verify in DB:**
```sql
SELECT id, title, host_id, status, starting_balance FROM trading_challenges WHERE title = 'Test Trading Challenge';
```
- `host_id` should NOT be NULL (should match the host's ID)
- `status` should be 'draft'

**THIS IS THE CRITICAL CHECK** — if host_id is NULL, the bug wasn't fixed.

---

## Phase 4: Challenge Configuration

### Test 4.1 — Host Configures Rules

**Steps:**
1. Host dashboard → select the challenge → "Rules" tab
2. Set:
   - Max Lot Size: 0.05 (ON)
   - Max Open Trades: 5 (ON)
   - Stop Loss Required: ON, Fixed $5
   - Daily Loss Cap: ON, Fixed $10
   - Weekend Trading: Blocked (ON)
   - Min Active Days: 5 (ON)
3. Click "Save Rules"

**Expected:**
- "✓ Saved" confirmation appears
- Refresh page → rules persist with same values

**Verify in DB:**
```sql
SELECT rule_value FROM wp_challenge_rules WHERE challenge_id = <ID> AND rule_code = 'config';
```

### Test 4.2 — Host Edits Settings

**Steps:**
1. "Settings" tab → change Prize Pool Text to "$1000 Prize Pool"
2. Click "Save Settings"

**Expected:**
- "✓ Saved" confirmation
- Overview tab reflects updated prize info

### Test 4.3 — Admin Opens Registration

**Steps:**
1. Admin panel → select the hosted challenge from dropdown
2. Change status to "registration_open" (via admin status change endpoint or Telegram)

**Verify:** Challenge status updates. Host dashboard shows "Registration Open" badge.

---

## Phase 5: Participant Registration (Web)

### Test 5.1 — Challenge Visible on Public Page

**Steps:**
1. Go to `winnerpip.com/challenges`
2. Find "Test Trading Challenge"

**Expected:**
- Card shows challenge title
- Badge: "Hosted by Test Host Co"
- Button: "Register Now" (since status = registration_open)

### Test 5.2 — Web Registration Flow

**Steps:**
1. Click "Register Now" on the challenge card
2. Registration modal opens with fields:
   - Email, Nickname, Account Number, MT5 Server, Investor Password, Account Type
3. Fill with a REAL test MT5 account:
   - Email: your-test@email.com
   - Nickname: TestTrader1
   - Account Number: (real MT5 account number)
   - MT5 Server: (real server name)
   - Investor Password: (real investor password)
   - Account Type: demo (or real depending on account)
4. Submit

**Expected:**
- Loading state: "Verifying..."
- VPS connection check passes
- If host has broker integration: allocation check runs
- Success: "Registration Successful!" message
- Confirmation email sent to the email address (check inbox or Resend dashboard)

**Verify in DB:**
```sql
SELECT id, nickname, email, account_number, source, user_id, connection_verified
FROM trading_registrations WHERE challenge_id = <ID>;
```
- source = 'winnerpip'
- user_id = 0
- connection_verified = true

### Test 5.3 — Duplicate Registration Blocked

**Steps:**
1. Try registering same email or account number again

**Expected:** Error: "You are already registered..."

### Test 5.4 — Host Sees Participant

**Steps:**
1. Host dashboard → "Participants" tab

**Expected:** TestTrader1 appears in the table with account number, type, "Connected" status

---

## Phase 6: CSV Upload Path

### Test 6.1 — Host Uploads CSV

**Steps:**
1. Create a CSV file:
   ```
   nickname,accountType,accountNumber,server,investorPassword
   CSVUser1,demo,12345678,Exness-MT5Trial7,TestPass123
   CSVUser2,demo,87654321,Exness-MT5Trial7,TestPass456
   ```
2. Host dashboard → "Participants" tab → upload the CSV file

**Expected:**
- "2 participants uploaded. Awaiting admin approval."
- Admin gets Telegram notification about pending CSV

### Test 6.2 — Admin Approves CSV

**Steps:**
1. Admin panel → use the pending CSV endpoint (or Telegram notification)
2. Approve the upload

**Expected:**
- System verifies each account via VPS
- Valid accounts appear in participants list
- Invalid accounts show as failed with reason

---

## Phase 7: Pull Cycle & Evaluation

### Test 7.1 — Challenge Auto-Starts

**Steps:**
1. Wait for the start_date to pass (or manually UPDATE status to 'active')
2. If auto-start: `vpsPullScheduler` changes status at scheduled check

**Expected:**
- Challenge status → 'active'
- Web-registered participants get "Challenge Started" email
- Admin gets Telegram: "Challenge Auto-Started"

### Test 7.2 — Pull Cycle Runs

**Steps:**
1. Wait for next scheduled pull time (default: every 4 hours at 00:00, 04:00, etc.)
2. Or trigger via admin panel "Full Pull + Evaluate + Rank" button

**Expected:**
- Pull fetches trade data from MT5 accounts via VPS
- Console shows: "⏰ VPS Pull: Scheduled pull triggered for challenge <ID>"
- Trades stored in `wp_trades` table
- Evaluation runs → leaderboard updates

**Verify:**
```sql
SELECT COUNT(*) FROM wp_trades WHERE challenge_id = <ID>;
SELECT * FROM wp_leaderboard WHERE challenge_id = <ID> ORDER BY rank ASC;
```

### Test 7.3 — Host Sees Leaderboard

**Steps:**
1. Host dashboard → "Leaderboard" tab

**Expected:**
- Participants listed with rank, nickname, balance/growth, trades, flagged count
- DQ'd participants shown with red DQ badge

### Test 7.4 — Host Sees Updates

**Steps:**
1. Host dashboard → "Updates" tab

**Expected:**
- Shows update cycles with: update number, timestamp, accounts processed, success/failed counts
- No "pull" or "VPS" terminology visible

---

## Phase 8: Multi-Challenge Concurrency

### Test 8.1 — Two Challenges Active Simultaneously

**Steps:**
1. Have a BirrForex challenge active
2. Have the hosted challenge active at the same time
3. Both should have the same pull_times (default 6x/day)
4. Wait for a scheduled pull time

**Expected:**
- Console shows pull triggered for BOTH challenges (sequentially)
- Both challenges get their accounts pulled and evaluated
- Both leaderboards update independently

**Verify:**
```sql
SELECT id, title, status FROM trading_challenges WHERE status = 'active';
-- Should show 2 rows

SELECT challenge_id, COUNT(*) FROM wp_pull_batches
WHERE started_at > NOW() - INTERVAL '1 hour'
GROUP BY challenge_id;
-- Should show batches for both challenge IDs
```

---

## Phase 9: Challenge End & Emails

### Test 9.1 — Challenge Auto-Ends

**Steps:**
1. Set end_date to pass (or manually trigger)
2. Wait for vpsPullScheduler lifecycle check

**Expected:**
- Status → 'reviewing'
- Web-registered participants get "Challenge Ended" email
- Admin gets Telegram: "Challenge Auto-Ended"
- 2 final sync pulls run after end

---

## Phase 10: Broker Integration (Optional)

### Test 10.1 — Setup Broker Credentials

**Steps:**
1. Host dashboard → "Settings" tab → scroll to "Broker Integration"
2. Click "Setup Broker Credentials"
3. Enter Exness affiliate credentials (email, password, API key)
4. Click "Save Credentials"

**Expected:**
- Green "Broker integration active" badge appears
- "Screening" tab now visible in navigation

### Test 10.2 — Run Screening

**Steps:**
1. "Screening" tab → click "Run Screening"

**Expected:**
- Allocation results per participant (Allocated / Not Allocated / No Email)
- Stats grid shows totals

### Test 10.3 — Registration Blocks Unallocated

**Steps:**
1. Try registering with an email NOT allocated under the host's partnership
2. Submit registration

**Expected:**
- Error: "Your account is not allocated under the required broker partnership..."

---

## Phase 11: Edge Cases

### Test 11.1 — Host Concurrent Challenge Limit

**Steps:**
1. While one challenge is active, try creating another

**Expected:** Error: "You already have an active challenge..."

### Test 11.2 — Rules Locked After Start

**Steps:**
1. After challenge becomes active, go to "Rules" tab

**Expected:**
- All inputs disabled
- Message: "Rules are locked — challenge has already started"

### Test 11.3 — Admin Can Override Host Challenge

**Steps:**
1. Admin panel → select the hosted challenge from dropdown
2. Change status, view participants, view leaderboard

**Expected:** All admin functions work for hosted challenges same as BirrForex ones

---

## Checklist Summary

| # | Test | Status |
|---|------|--------|
| 1.1 | Create host via admin panel | ☐ |
| 1.2 | Host management actions | ☐ |
| 2.1 | Host login | ☐ |
| 2.2 | Token persistence | ☐ |
| 2.3 | Deactivated host rejected | ☐ |
| 3.1 | Challenge creation form | ☐ |
| 3.2 | Admin approves → host_id saved | ☐ |
| 4.1 | Host configures rules | ☐ |
| 4.2 | Host edits settings | ☐ |
| 4.3 | Admin opens registration | ☐ |
| 5.1 | Challenge visible on public page | ☐ |
| 5.2 | Web registration flow | ☐ |
| 5.3 | Duplicate registration blocked | ☐ |
| 5.4 | Host sees participant | ☐ |
| 6.1 | CSV upload | ☐ |
| 6.2 | Admin approves CSV | ☐ |
| 7.1 | Challenge auto-starts | ☐ |
| 7.2 | Pull cycle runs | ☐ |
| 7.3 | Host sees leaderboard | ☐ |
| 7.4 | Host sees updates | ☐ |
| 8.1 | Two challenges active simultaneously | ☐ |
| 9.1 | Challenge auto-ends + emails | ☐ |
| 10.1 | Broker credential setup | ☐ |
| 10.2 | Run screening | ☐ |
| 10.3 | Registration blocks unallocated | ☐ |
| 11.1 | Concurrent challenge limit | ☐ |
| 11.2 | Rules locked after start | ☐ |
| 11.3 | Admin can override host challenge | ☐ |

---

## Notes

- **Test 3.2 is the most critical** — if `host_id` is NULL after admin approval, the entire system breaks
- **Test 8.1** verifies the pull scheduler fix works for concurrent challenges
- **Phase 10** only applicable if you have real Exness affiliate credentials for the test host
- For email tests, check the Resend dashboard if inbox delivery is slow
- The VPS workers must be running for tests 5.2, 6.2, 7.2 to pass
