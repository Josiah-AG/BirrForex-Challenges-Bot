# Host Mode — Step-by-Step Test Checklist

Test this in order. Each step depends on the previous one passing. Mark each box as you go.

---

## SETUP (before you start)

Make sure these are running:
- [ ] Bot is running (Railway or local `npx ts-node src/index.ts`)
- [ ] WinnerPip frontend is deployed (or local `npm run dev`)
- [ ] VPS Python workers are running
- [ ] You have an MT5 demo account ready (account number, server, investor password)

---

## TEST 1: Create a Host

1. Go to the admin panel (winnerpip.com/admin/panel)
2. Log in with your admin key
3. Click the **"Hosts"** button in the header (next to "+ New")
4. Click **"+ Create Host"**
5. Fill in:
   - Display Name: `Test Host`
   - Email: `testhost@test.com`
   - Password: `TestHost123`
6. Click **"Create Host Account"**

**Check:**
- [ ] Modal had a solid dark background (no page showing through)
- [ ] After creating, the host appears in the list with a green dot
- [ ] The list shows "0 active · 0 total"

---

## TEST 2: Host Login

1. Open a new browser tab (or incognito)
2. Go to winnerpip.com/host/login
3. Enter email: `testhost@test.com`, password: `TestHost123`
4. Click Login

**Check:**
- [ ] Redirected to /host/dashboard
- [ ] Header shows "Test Host" and "HOST DASHBOARD"
- [ ] Empty state shows "No challenges yet" with a Create Challenge button

---

## TEST 3: Host Creates a Challenge (Details Step)

1. Click **"Create Challenge"** (or "+ New Challenge")
2. Modal opens with progress bar showing step 1/3 "Details"
3. Fill in:
   - Title: `Host Test Challenge`
   - Type: Hybrid
   - Deposit Mode: click "Fixed Deposit" button
   - Start Date: set to **tomorrow** (any time)
   - End Date: set to **7 days from now**
   - Starting Balance: `30`
   - Target Balance: `60`
   - Real Winners: `1`
   - Demo Winners: `1`
   - Real Prizes: `100`
   - Demo Prizes: `50`
4. Click **"Next: Rules"**

**Check:**
- [ ] Deposit mode buttons are colored (Fixed = blue, Max = gold, Min = green)
- [ ] Info box below deposit mode shows explanation text
- [ ] "Next: Rules" button was disabled until title + dates were filled
- [ ] Moved to step 2 (progress bar updated)

---

## TEST 4: Host Creates a Challenge (Rules Step)

1. You should be on step 2/3 "Rules"
2. Toggle OFF: "Min Trade Duration" and "Min Total Trades"
3. Set Max Lot Size: `0.05`
4. Set Max Open Trades: `5`
5. Set Daily Loss Cap: click "%" button, set to `20`
6. Leave the rest as defaults
7. Click **"Review"**

**Check:**
- [ ] Each rule row has a blue toggle on the left
- [ ] Hovering the info icon (i) shows a tooltip with explanation
- [ ] Disabled rules have faded inputs
- [ ] Max Risk shows Fixed/% buttons
- [ ] Moved to step 3 (progress bar updated)

---

## TEST 5: Host Submits Challenge for Approval

1. You should be on step 3/3 "Review"
2. Verify the summary shows correct values
3. Click **"Submit for Approval"**

**Check:**
- [ ] Loading spinner appears
- [ ] Success message: "Submitted for Approval"
- [ ] YOU (admin) receive a Telegram message with "Challenge Creation Request" and Approve/Reject buttons

---

## TEST 6: Admin Approves the Challenge

1. Go to your Telegram
2. Find the approval message from the bot
3. Click **"Approve"**

**Check:**
- [ ] Bot replies confirming challenge was created
- [ ] Go back to the host dashboard and refresh
- [ ] The challenge now appears in the dropdown selector
- [ ] Status shows (could be "draft" or "registration_open" depending on start date)

**CRITICAL DB CHECK** (run this SQL):
```sql
SELECT id, title, host_id, status FROM trading_challenges ORDER BY id DESC LIMIT 1;
```
- [ ] `host_id` is NOT NULL (matches the host's ID)

---

## TEST 7: Admin Opens Registration

1. Go to admin panel
2. Select "Host Test Challenge" from the challenge dropdown
3. If status is "draft", change it to "registration_open":
   - You can use the admin status change (Settings tab or API)
   - Or wait for the registration deadline logic

Alternative: set the start date to the past so auto-start kicks in.

**Check:**
- [ ] Challenge status is now "registration_open"
- [ ] Host dashboard shows "Registration Open" badge

---

## TEST 8: Challenge Visible on Public Page

1. Go to winnerpip.com/challenges
2. Look for "Host Test Challenge"

**Check:**
- [ ] Card shows the challenge title
- [ ] Blue badge says "Hosted by Test Host"
- [ ] Button says "Register Now"

---

## TEST 9: Register a Participant via Web

1. Click **"Register Now"** on the challenge card
2. Registration modal opens
3. Fill with your test MT5 account:
   - Email: any valid email you can check
   - Nickname: `TestTrader1`
   - Account Number: (your real MT5 demo account)
   - MT5 Server: (the server name)
   - Investor Password: (the investor/read-only password)
   - Account Type: Demo
4. Click **"Register"**

**Check:**
- [ ] Shows "Verifying..." while connecting
- [ ] Success: "Registration Successful!" with green checkmark
- [ ] Safety note is visible under the investor password field (lock icon + explanation)
- [ ] You receive a confirmation email (check inbox or Resend dashboard)

---

## TEST 10: Host Sees the Participant

1. Go back to host dashboard
2. Click **"Participants"** tab

**Check:**
- [ ] TestTrader1 appears in the table
- [ ] Shows account number, type (demo), status (Connected)
- [ ] Registered date is today

---

## TEST 11: Host Configures Rules (Rules Tab)

1. Click **"Rules"** tab on host dashboard
2. Rules should load (showing the values you set during creation)

**Check:**
- [ ] Values match what you set in step 4 (max lot 0.05, max open 5, daily loss 20%, etc.)
- [ ] If challenge hasn't started yet: inputs are editable
- [ ] If challenge is active: inputs are locked with message

---

## TEST 12: Host Edits Settings

1. Click **"Settings"** tab
2. Change "Demo Winners #" to `2`
3. Click **"Save Settings"**

**Check:**
- [ ] "Saved" confirmation appears
- [ ] Refresh page, go back to Settings — value is still `2`

---

## TEST 13: Challenge Starts + Pull Runs

1. Wait for the start date to pass
   - OR manually set status to 'active' via SQL:
   ```sql
   UPDATE trading_challenges SET status = 'active' WHERE title = 'Host Test Challenge';
   ```
2. Wait for the next pull schedule time (check bot logs)
   - OR trigger manually via admin panel "Full Pull + Evaluate + Rank" button

**Check:**
- [ ] Bot logs show: "Scheduled pull triggered for challenge [ID]"
- [ ] Pull completes (check "Updates" tab on host dashboard)
- [ ] If participant has trades: they appear on the Leaderboard tab

---

## TEST 14: Host Views Leaderboard

1. Click **"Leaderboard"** tab on host dashboard

**Check:**
- [ ] Shows participant(s) with rank, balance/growth, trades, flagged count
- [ ] If no trades yet: "Leaderboard will appear after the first data update"

---

## TEST 15: Host Views Updates

1. Click **"Updates"** tab

**Check:**
- [ ] Shows at least one update entry with: update number, timestamp, accounts processed, success count
- [ ] No "pull" or "VPS" text visible — only "update" terminology

---

## TEST 16: Duplicate Registration Blocked

1. Go back to winnerpip.com/challenges
2. Try registering the same account number or email again

**Check:**
- [ ] Error: "You are already registered for this challenge..."

---

## TEST 17: Admin Panel Shows Hosted Challenge

1. Go to admin panel
2. Check the challenge dropdown

**Check:**
- [ ] "Host Test Challenge" appears in the admin's challenge list
- [ ] Admin can view participants, leaderboard, violations for it
- [ ] Admin can change status if needed

---

## TEST 18: Two Challenges Active at Same Time (optional)

Only if you have a BirrForex challenge also active:

1. Both challenges should have the same pull schedule
2. Wait for a pull time to hit

**Check:**
- [ ] Bot logs show pulls triggered for BOTH challenge IDs
- [ ] Both leaderboards update independently

---

## CLEANUP

After testing is complete:
1. Admin panel → Hosts → View → Delete the test host
2. Or leave it for future reference

---

## CONFIDENCE CHECKLIST

After all tests pass, you can be confident that:

- [ ] Hosts can be created and managed by admin
- [ ] Hosts can log in and see their dashboard
- [ ] Challenge creation flows through Telegram approval correctly
- [ ] **host_id is properly saved** (the critical bug we fixed)
- [ ] Challenges appear on the public page with "Hosted by" badge
- [ ] Web registration works (VPS verify + email confirmation)
- [ ] Host can see participants, configure rules, edit settings
- [ ] Pull scheduler picks up hosted challenges
- [ ] Evaluation and leaderboard work for hosted challenges
- [ ] Admin retains full control over hosted challenges
- [ ] No internal terminology leaks to the host

**If all boxes are checked, the system is ready for real hosts.**
