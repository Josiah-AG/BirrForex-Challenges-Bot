# Demo/Real Account Trading Challenges Feature

## Status: Discussion Phase

---

## Current Manual Process

### Challenge Types
- **Demo Challenge** - Users trade on demo accounts ($30 → $60 target)
- **Real Challenge** - Users trade on real accounts ($30 or less → $60 target)
- **Hybrid** - Both demo and real in the same challenge, evaluated separately

### Challenge Period
- Runs over multiple days (e.g., Oct 20 - Oct 31, ~10-12 days)
- Not a quick quiz — this is a multi-day trading competition

### Registration (Before Challenge Starts)
- **Demo traders** DM admin: Name, Email, Demo Account Number (MT5)
- **Real traders** DM admin: Name, Email, Real Account Number, Screenshot of deposit
- Admin manually verifies:
  - Account is under BirrForex partner link (Exness allocation)
  - Account is fully verified
  - For real: proper deposit exists
- Registration closes when challenge starts
- Users cannot edit their submission after sending
- One account per person (related accounts = both disqualified)

### During Challenge
- Users trade on their registered accounts following trading rules
- No admin intervention needed during this phase

### After Challenge Ends
- Users who hit the target DM their Read-Only password
- Admin team logs into each account manually
- Team checks if trades followed all rules (lot size, stop loss, max trades, etc.)
- Winners selected based on top balances (per category)

### Prize Distribution
- Real: 1st $400, 2nd $350, 3rd $300
- Demo: 1st $200, 2nd $100
- Transferred to Exness account within 1-2 weeks

### Trading Rules (Example from Challenge 14)
- Max lot size: 0.02 per trade
- Max 3 open trades at same time
- All trades must have stop loss, max loss per trade $5
- Can't open same currency pair more than twice
- Can't keep position open more than 24 hours
- Max daily loss $10 (must stop trading that day if hit)
- Profits on rule-breaking trades don't count
- Can't recharge/top-up account
- Must be actively trading at least 7 days
- No weekend trading

---

## Automation Recommendations

### What the Bot CAN Automate

#### 1. Registration System
- User sends /register command to bot
- Bot asks: Demo or Real?
- Bot collects: Name, Email, Account Number
- For Real: Bot asks for deposit screenshot
- Bot stores all info in database with timestamp
- Bot prevents edits after submission (locked)
- Bot auto-rejects registrations after challenge starts
- Bot prevents duplicate registrations (one account per telegram user)
- Admin gets /registrations command to view all pending/approved registrations
- Admin approves/rejects via bot buttons (after manual Exness verification)

#### 2. Challenge Management (Admin)
- /createtradingchallenge command
- Admin sets: type (demo/real/hybrid), start date, end date, starting balance, target balance, trading rules, prizes
- Bot stores challenge config in database
- Bot auto-posts challenge announcement with rules to channels

#### 3. Scheduled Posts
- Challenge start announcement
- Daily reminders during challenge period
- Registration deadline reminders
- Challenge end announcement
- Results announcement

#### 4. Read-Only Password Collection
- After challenge ends, bot sends message to all registered participants
- Users submit read-only password via bot
- Bot stores passwords for admin review
- Admin gets a list of all submissions with account details + passwords

#### 5. Participant Status Tracking
- Bot tracks: registered, approved, submitted_password, under_review, winner, disqualified
- Users can check their status via /mystatus
- Admin can update status via bot

#### 6. Results & Winner Announcement
- Admin inputs winners via bot after manual review
- Bot auto-posts results to channels
- Bot notifies winners privately

### What CANNOT Be Automated (Requires Manual Work)
- Verifying Exness partner allocation (requires Exness partner dashboard)
- Verifying deposit screenshots (requires human judgment)
- Logging into MT5 with read-only passwords
- Checking trade history against rules (lot sizes, stop loss, daily loss, etc.)
- Final winner selection based on balance + rule compliance

### Future Possibility (Advanced)
- Exness API integration to auto-verify partner allocation
- MT5 API integration to auto-pull trade history and validate rules
- These would require API access and significant development

---

## Database Changes Needed
- New table: `trading_challenges` (type, start_date, end_date, balance, target, rules, prizes, status)
- New table: `trading_registrations` (user_id, challenge_id, account_type, name, email, account_number, deposit_screenshot, status, read_only_password, submitted_at)
- New table: `trading_winners` (challenge_id, registration_id, position, prize_amount, category)

---

## User Flow (Automated)

### Registration
```
User: /register
Bot: Select challenge type:
     [Demo Account] [Real Account]
User: [Demo Account]
Bot: Please send your full name:
User: John Doe
Bot: Please send your Exness email:
User: [email]
Bot: Please send your MT5 Demo Account Number:
User: 12345678
Bot: ✅ Registration submitted!
     Name: John Doe
     Email: [email]
     Account: 12345678
     Type: Demo
     
     ⏳ Waiting for admin approval.
     You'll be notified once verified.
     
     ⚠️ You cannot edit this submission.
```

### Admin Approval
```
Admin: /registrations
Bot: 📋 PENDING REGISTRATIONS (5)
     
     1. John Doe - Demo - 12345678
     [✅ Approve] [❌ Reject]
     
     2. Jane Smith - Real - 87654321
     [✅ Approve] [❌ Reject]
```

### After Challenge Ends
```
Bot (to all approved participants):
     ⏰ Challenge is over!
     Please submit your Read-Only password.
     Send it here:

User: mypassword123
Bot: ✅ Password received!
     Our team will review your account.
     Results will be announced within 1-2 weeks.
```

---

## Challenge Management - /createtradingchallenge

### Step-by-Step Admin Flow

```
Step 1: Challenge Type
Admin: /createtradingchallenge
Bot: Select challenge type:
     [Demo] [Real] [Hybrid]

Step 1b: Challenge Title
Bot: Send the challenge title:
     Example: HYBRID CHALLENGE #15
Admin: HYBRID CHALLENGE #15

Step 2: Winners Configuration
--- If Demo or Real ---
Bot: How many winners?
Admin: 3
Bot: Enter prizes for each position (comma separated):
     Example: 400, 350, 300
Admin: 400, 350, 300

--- If Hybrid ---
Bot: How many Real account winners?
Admin: 3
Bot: Enter prizes for Real account winners (comma separated):
Admin: 400, 350, 300
Bot: How many Demo account winners?
Admin: 2
Bot: Enter prizes for Demo account winners (comma separated):
Admin: 200, 100

Step 3: Challenge Period
Bot: Send the start date and time:
     Format: YYYY-MM-DD HH:MM
     Example: 2026-03-20 09:00
Admin: 2026-03-20 09:00
Bot: Send the end date and time:
     Format: YYYY-MM-DD HH:MM
     Example: 2026-03-31 23:59
Admin: 2026-03-31 23:59

Step 4: Account Settings
Bot: What is the starting balance?
Admin: 30
Bot: What is the target balance?
Admin: 60

Step 5: Challenge Rules
Bot: Send the challenge rules text:
     (This will be posted in the channel as you write it)
Admin: [sends rules text - admin formats it however they want]

Step 6: Rules PDF (Optional)
Bot: Upload the rules PDF (or send /skip):
Admin: [uploads PDF file or /skip]

Step 7: Explanatory Video (Optional)
Bot: Send the video link (or send /skip):
Admin: https://youtube.com/watch?v=xxxxx

Step 8: Confirmation
Bot: ✅ TRADING CHALLENGE SUMMARY

     📋 Type: Hybrid
     📅 Period: Mar 20, 2026 9:00 AM → Mar 31, 2026 11:59 PM
     💰 Starting Balance: $30
     🎯 Target: $60
     
     🏆 Real Account Winners: 3
     1st: $400 | 2nd: $350 | 3rd: $300
     
     🏆 Demo Account Winners: 2
     1st: $200 | 2nd: $100
     
     📖 Rules: ✅ Attached
     📄 PDF: ✅ Uploaded
     🎥 Video: ✅ Linked
     
     [✅ Confirm & Create] [❌ Cancel]
```

### What Happens After Confirm
- Challenge saved to database
- Registration opens immediately
- Bot posts challenge announcement to both channels (formatted, with rules, PDF, video link)
- Bot starts accepting /register commands
- Registration auto-closes when challenge start time is reached

### Challenge Announcement Post (Auto-posted to both channels)

```
🎯 BIRRFOREX TRADING CHALLENGE
HYBRID CHALLENGE #15

📊 Type: Hybrid (Demo & Real Account)
📅 Period: Mar 20 - Mar 31, 2026
💰 Start: $30 → 🎯 Target: $60

🏆 PRIZES

Real Account:
🥇 1st Place: $400
🥈 2nd Place: $350
🥉 3rd Place: $300

Demo Account:
🥇 1st Place: $200
🥈 2nd Place: $100

🎁 BONUS
➡️ All Real Account participants will be invited to join BirrForex Live Trading Team after the challenge
➡️ Demo Account traders who hit the target will get an invitation to join BirrForex Live Trading Team

� CHALLENGE RULES

[Admin's rules text posted here exactly as provided]

📌 HOW TO JOIN

➡️ Open Exness account using our link below
➡️ Create MT5 Demo or Real account with $30 balance
➡️ Send /register to @BirrForexChallengeBot
➡️ Wait for admin approval
➡️ Start trading when challenge begins!

📌 AFTER CHALLENGE ENDS

➡️ Submit your Read-Only password via the bot
➡️ Our team will review your trades
➡️ Winners announced within 1-2 weeks

🎥 Watch the challenge guide video:
[video link here]

[💰 Open Exness Account]
[� Download Rules PDF]
[🚀 Register Now → @BirrForexChallengeBot]
```

### Decisions Confirmed
1. Hybrid challenges have completely separate winner pools (Real and Demo evaluated independently)
2. Registration opens immediately after challenge creation
3. Rules posted as one formatted message with organized sections
4. Challenge title is set by admin each time (not auto-numbered)
5. Admin provides rules text as-is (bot posts it exactly as given)
6. Bonus: Real account participants → invited to live trading team. Demo traders who hit target → invited to live trading team

---

## Registration Flow

### Separate Database
- Trading challenges use completely separate tables from weekly quiz challenges
- No shared data between the two systems
- Separate tables: `trading_challenges`, `trading_registrations`, `trading_winners`

### Registration Order (Both Demo & Real)
1. Bot asks for Exness email FIRST
2. Bot runs Exness API checks (allocation, KYC, and balance for real)
3. Only if ALL checks pass → Bot asks for MT5 account number
4. Save to database

This order avoids collecting account numbers from unverified/ineligible users.

### Demo Account Registration Flow

```
User: /register (or taps Register button on announcement post)
Bot: Select account type:
     [Demo Account] [Real Account]
User: [Demo Account]

Step 1 - Email
Bot: Please send your Exness email:
User: [email]

Step 2 - API Verification (automatic, user waits)
Bot: ⏳ Verifying your account...

--- Bot checks via Exness Partnership API ---
Check 1: Allocation - Is this email registered under BirrForex partner?
Check 2: KYC - Is the Exness account fully verified?

If allocation fails:
Bot: ❌ This email is not registered under BirrForex.
     Please register using our partner link:
     [💰 Open Exness Account]
     (Registration cancelled)

If KYC fails:
Bot: ❌ Your Exness account is not fully verified.
     Please complete verification first.
     [📋 How to Verify]
     (Registration cancelled)

If both checks pass:
Step 3 - Account Number
Bot: ✅ Email verified!
     Now send your MT5 Demo Account Number:
User: 12345678

Step 4 - Save & Confirm
Bot: ✅ Registration Complete!
     
     📋 Your Registration:
     📧 Email: [email]
     🏦 Demo Account: 12345678
     📊 Type: Demo
     
     ⏳ Challenge starts: Mar 20, 2026 9:00 AM
     
     [🔄 Change Account Number]
```

### Real Account Registration Flow

```
User: /register (or taps Register button on announcement post)
Bot: Select account type:
     [Demo Account] [Real Account]
User: [Real Account]

Step 1 - Email
Bot: Please send your Exness email:
User: [email]

Step 2 - API Verification (automatic, user waits)
Bot: ⏳ Verifying your account...

--- Bot checks via Exness Partnership API ---
Check 1: Allocation - Is this email registered under BirrForex partner?
Check 2: KYC - Is the Exness account fully verified?
Check 3: Balance - Does the account have positive equity?

If allocation fails:
Bot: ❌ This email is not registered under BirrForex.
     Please register using our partner link:
     [� Open Exness Account]
     (Registration cancelled)

If KYC fails:
Bot: ❌ Your Exness account is not fully verified.
     Please complete verification first.
     [📋 How to Verify]
     (Registration cancelled)

If balance/equity check fails:
Bot: ❌ No positive equity found on your account.
     Please deposit funds first and try again.
     (Registration cancelled)

If ALL three checks pass:
Step 3 - Account Number
Bot: ✅ Email verified!
     Now send your MT5 Real Account Number:
User: 87654321

Step 4 - Save & Confirm
Bot: ✅ Registration Complete!
     
     📋 Your Registration:
     📧 Email: [email]
     🏦 Real Account: 87654321
     📊 Type: Real
     
     ⏳ Challenge starts: Mar 20, 2026 9:00 AM
     
     [🔄 Change Account Number]
```

### Hybrid Challenge Registration
- User chooses Demo or Real during registration
- Follows the respective flow above based on choice
- Each category tracked separately in the database
- A user picks one category — cannot register for both in the same challenge

### Change Account Number
- After registration, user sees [🔄 Change Account Number] button
- Tapping it asks for the new MT5 account number (demo or real, matching their registration type)
- Only the account number changes — email stays locked
- Bot confirms the change and replaces the old account number in the database
- Available ONLY before challenge start time
- After challenge starts → bot says "❌ Challenge has started. Changes are no longer allowed."

### Registration Restrictions
- One registration per Telegram user per challenge
- Cannot register after challenge starts
- Cannot change email after registration (only account number)
- Cannot change account number after challenge starts
- Email is verified once at registration — no re-verification needed for account number change

## Post-Challenge Flow

### 1. Challenge End Message (Auto-posted when challenge period ends)

```
Bot posts to both channels:

🏁 CHALLENGE IS OVER!

What an exciting race! We hope you all gained valuable experience 
and sharpened your trading skills throughout this challenge.

Thank you to every participant for your dedication and effort! 💪

🎯 Hit the target? Submit your details for evaluation!

➡️ You have 48 HOURS to submit your results
➡️ Click the button below to start your submission
➡️ Late submissions will NOT be accepted

⏰ Submission deadline: [date + 48hrs], [time] 

[📋 Submit Results]
```

- The [📋 Submit Results] button stops working after 48 hours
- After 48 hours, bot responds: "❌ Submission deadline has passed. Late submissions are not accepted."

### 2. Results Submission Flow (User clicks Submit Results button)

```
Step 1 - Identity Check
User clicks [📋 Submit Results]
Bot checks: Is this Telegram user registered for this challenge?
  → Looks up telegram_id in trading_registrations table
  
If NOT registered:
Bot: ❌ You are not registered for this challenge.
     Only registered participants can submit results.

If registered:
Step 2 - Final Balance
Bot: 💰 What is your final account balance?
     (Enter the number only, e.g., 67.50)
User: 67.50

Step 3 - Balance Screenshot
Bot: 📸 Upload a screenshot of your final balance.
     Make sure it clearly shows:
     ➡️ Account number
     ➡️ Final balance/equity
User: [uploads screenshot]

Step 4 - Investor Password (Read-Only)
Bot: 🔑 Enter your Investor (Read-Only) password:
     This is the password that allows view-only access to your account.
User: mypassword123

Step 5 - Confirm Password
Bot: 🔑 Please enter the password again to confirm:
User: mypassword123

If passwords don't match:
Bot: ❌ Passwords don't match. Please try again.
     🔑 Enter your Investor (Read-Only) password:
(Repeat steps 4-5)

If passwords match:
Step 6 - Save & Confirm
Bot: ✅ Results Submitted Successfully!

     📋 Your Submission:
     📧 Email: [email from registration]
     🏦 Account: [account number from registration]
     📊 Type: Demo / Real
     💰 Final Balance: $67.50
     📸 Screenshot: ✅ Received
     🔑 Password: ✅ Saved

     ⏳ Our team will review your account and announce results.
     Thank you for participating! 🎉
```

### 3. Admin Report (Auto-sent 48 hours after challenge ends)

```
Bot sends to admin (@birrfxadmin) after 48-hour submission window closes:

📊 TRADING CHALLENGE REPORT
[Challenge Title]

📅 Challenge Period: Mar 20 - Mar 31, 2026
📊 Type: Hybrid (Demo & Real)
👥 Total Registered: 45
📋 Total Submissions: 32

--- Downloadable CSV/Excel report attached ---

Report contains (sorted by balance, descending):
| # | Name | Email | Type | Account # | Investor Password | Final Balance | Screenshot |
|---|------|-------|------|-----------|-------------------|---------------|------------|
| 1 | ...  | ...   | Real | ...       | ...               | $89.50        | [link]     |
| 2 | ...  | ...   | Demo | ...       | ...               | $78.20        | [link]     |
| ...                                                                                    |

Real Account Submissions: 15 (sorted by balance desc)
Demo Account Submissions: 17 (sorted by balance desc)

⏳ Review accounts and select winners using:
/selectwinners
```

- Report is a downloadable file (CSV) attached to the message
- Sorted by final balance in descending order
- Separated by category (Real and Demo) if hybrid
- Includes all info needed for manual review: email, account number, investor password, balance, screenshot links

### 4. Winner Selection (Admin command)

```
Admin: /selectwinners
Bot: Select the challenge:
     [HYBRID CHALLENGE #15 (Mar 20-31)]

Bot: 📊 REAL ACCOUNT SUBMISSIONS (sorted by balance):
     1. John - $89.50 - Acct: 12345678
     2. Jane - $78.20 - Acct: 87654321
     3. Bob - $72.10 - Acct: 11223344
     ...

     Select winners (enter position numbers, comma separated):
     Example: 1, 3, 5
Admin: 1, 2, 3

Bot: 📊 DEMO ACCOUNT SUBMISSIONS (sorted by balance):
     1. Alice - $85.00 - Acct: 55667788
     2. Charlie - $71.30 - Acct: 99887766
     ...

     Select Demo winners:
Admin: 1, 2

Bot: ✅ WINNERS SELECTED

     🏆 Real Account Winners:
     🥇 1st: John - $89.50 - Prize: $400
     🥈 2nd: Jane - $78.20 - Prize: $350
     🥉 3rd: Bob - $72.10 - Prize: $300

     🏆 Demo Account Winners:
     🥇 1st: Alice - $85.00 - Prize: $200
     🥈 2nd: Charlie - $71.30 - Prize: $100

     [✅ Confirm & Announce] [❌ Cancel]
```

### 5. Winner Announcement (After admin confirms)

**Channel Post (both channels):**
```
🏆 TRADING CHALLENGE RESULTS 🏆
[Challenge Title]

📅 Challenge Period: Mar 20 - Mar 31, 2026

🏆 REAL ACCOUNT WINNERS

🥇 1st Place: @username - $89.50 → Prize: $400
🥈 2nd Place: @username - $78.20 → Prize: $350
🥉 3rd Place: @username - $72.10 → Prize: $300

🏆 DEMO ACCOUNT WINNERS

🥇 1st Place: @username - $85.00 → Prize: $200
🥈 2nd Place: @username - $71.30 → Prize: $100

🎁 BONUS
➡️ All Real Account participants are invited to join BirrForex Live Trading Team
➡️ Demo traders who hit the target are invited to join BirrForex Live Trading Team

👥 Total Participants: 45
📋 Submissions Received: 32

Congratulations to all winners! 🎉
Thank you to everyone who participated!

Stay tuned for the next challenge on @BirrForex
```

**Private DM to each winner:**
```
🏆 CONGRATULATIONS! 🏆

You won [1st / 2nd / 3rd] Place in [Challenge Title]!

📊 Your Results:
💰 Final Balance: $89.50
🏦 Account: 12345678
📊 Type: Real Account

🎁 Your Prize: $400

📸 TO CLAIM YOUR PRIZE:
DM @birrFXadmin with a screenshot of this message within 24 HOURS.

⚠️ Prize must be claimed within 24 HOURS
⚠️ Sent via Exness internal transfer only

Thank you for participating and congratulations! 🎉
```

### 6. Admin Communication with Participants

**Command: /messageuser**
```
Admin: /messageuser
Bot: Select challenge:
     [HYBRID CHALLENGE #15]

Bot: Select user to message:
     [Search by name/email/account]

Admin: [selects user]

Bot: Type your message:
Admin: We need additional verification for your account. 
       Please send a screenshot of your trade history.

Bot: ✅ Message sent to [username]
```

**What the user receives:**
```
📩 MESSAGE FROM BIRRFOREX CHALLENGE TEAM

Regarding: [Challenge Title]

[Admin's message text here]

⚠️ Please reply to @birrFXadmin with the requested information.
(Include a screenshot of this message)
```

- The bot tells the user to reply to @birrFXadmin directly (not to the bot)
- User screenshots the bot message and sends it to admin along with their response
- This keeps the review process in admin DMs where they can have a back-and-forth conversation

### 7. Disqualification (Admin command)

```
Admin: /disqualify
Bot: Select challenge:
     [HYBRID CHALLENGE #15]
Bot: Select user:
     [list of registered participants]
Admin: [selects user]
Bot: Enter reason for disqualification:
Admin: Related accounts found - both disqualified per rules

Bot: ✅ User disqualified
     ➡️ Status updated to "disqualified" in database
     ➡️ User notified via DM

User receives:
❌ DISQUALIFIED

You have been disqualified from [Challenge Title].

Reason: Related accounts found - both disqualified per rules

If you believe this is an error, please contact @birrFXadmin.
```

### Post-Challenge Timeline
```
Challenge End Time
  │
  ├── Bot posts challenge end message with Submit button
  │
  ├── 48 hours: Submission window
  │   └── Users submit: balance, screenshot, investor password
  │
  ├── 48 hours later: Submission closes
  │   ├── Bot sends admin report (downloadable CSV)
  │   └── Submit button stops working
  │
  ├── Admin review period (manual)
  │   ├── Team logs into accounts with investor passwords
  │   ├── Checks trades against rules
  │   ├── /messageuser for additional info if needed
  │   ├── /disqualify rule breakers
  │   └── /selectwinners to pick winners
  │
  ├── Winner announcement
  │   ├── Channel post with results
  │   ├── Private DM to each winner
  │   └── Winners have 24 hours to claim prize via @birrFXadmin
  │
  └── Prize distribution (manual via Exness internal transfer)
```

---

## Exness Partnership API Integration

### Source
Extracted from the existing Discord bot (`ExnessAPI` class). The same API will be reused in the Telegram bot.

### Environment Variables Needed
```
EXNESS_API_BASE_URL=https://my.exnessaffiliates.com
EXNESS_PARTNER_EMAIL=<partner login email>
EXNESS_PARTNER_PASSWORD=<partner login password>
```

### Authentication
- Endpoint: `POST {base_url}/api/v2/auth/`
- Body: `{ "login": email, "password": password }`
- Returns JWT token valid for ~6 hours
- Bot refreshes token after 5 hours automatically
- Token used as: `Authorization: JWT {token}`

### API Calls Used for Registration

#### 1. Allocation Check (Demo & Real)
- Endpoint: `POST {base_url}/api/partner/affiliation/`
- Body: `{ "email": user_email }`
- Headers: `Authorization: JWT {token}`
- Returns:
  - `affiliation: true/false` — is this email under BirrForex partner?
  - `client_uid` — short UID for further lookups
  - `accounts` — list of trading accounts
- If `affiliation` is false → registration rejected ("not under BirrForex")

#### 2. Get Full UUID (needed for KYC check)
- Endpoint: `GET {base_url}/api/v2/reports/clients/filters/`
- Headers: `Authorization: JWT {token}`
- Returns list of all `client_uid` UUIDs
- Match the short UID from step 1 to find the full UUID
- Full UUID needed for the KYC status endpoint

#### 3. KYC Status Check (Demo & Real)
- Endpoint: `GET {base_url}/api/v2/reports/clients/`
- Params: `client_uid={full_uuid}&limit=1`
- Headers: `Authorization: JWT {token}`
- Returns client data including:
  - `kyc_passed: true/false` — is account fully verified?
  - `client_status` — "ACTIVE", "CHANGING", "LEFT", etc.
  - `client_balance` — balance range ID (0-6)
  - `ftd_received` — first time deposit received
  - `reg_date` — registration date
- If `kyc_passed` is false → registration rejected ("not verified")

#### 4. Balance/Equity Check (Real Only)
- Uses `client_balance` from KYC response
- Balance range mapping:
  ```
  0: "$0"
  1: "$0-10"
  2: "$10-50"
  3: "$50-250"
  4: "$250-1000"
  5: "$1000-5000"
  6: ">$5000"
  ```
- For real account registration: `client_balance` must be > 0 (has positive equity)
- Also checks `ftd_received: true` to confirm deposit exists

### Verification Flow (as implemented in Discord bot)

```
verify_user(email):
  Step 1: check_allocation(email)
    → If no affiliation → FAIL: "not_allocated"
    → Get short_uid
  
  Step 2: get_account_details(short_uid)
    → Get trading volume, commission, country (informational)
  
  Step 3: get_full_uuid(short_uid)
    → Match short_uid to full UUID from filters endpoint
  
  Step 4: get_kyc_status(full_uuid)
    → Get kyc_passed, client_balance, ftd_received, client_status
    → If kyc_passed = false → FAIL: "pending_kyc"
    → If all pass → SUCCESS
```

### For Our Telegram Bot Registration

**Demo Registration:**
1. `check_allocation(email)` → must have `affiliation: true`
2. `get_full_uuid(short_uid)` → get full UUID
3. `get_kyc_status(full_uuid)` → must have `kyc_passed: true`
4. If all pass → ask for MT5 demo account number → save

**Real Registration:**
1. `check_allocation(email)` → must have `affiliation: true`
2. `get_full_uuid(short_uid)` → get full UUID
3. `get_kyc_status(full_uuid)` → must have `kyc_passed: true`
4. Check `client_balance > 0` and `ftd_received: true` → must have positive equity
5. If all pass → ask for MT5 real account number → save

### Retry Logic
- Discord bot retries up to 3 times with 3-second delays on API errors
- We'll implement the same in the Telegram bot
- If all retries fail → show error message, user can try again later

### Token Management
- Authenticate once on bot startup
- Auto-refresh before expiry (5-hour interval)
- Re-authenticate on any 401 response

---

## Complete User Flow — 12 Phases

### Phase 1 — Admin Creates Challenge
1. Admin sends `/createtradingchallenge` to the bot
2. Bot walks through: type → title → winners config (per category if hybrid) → prizes → start date+time → end date+time → starting balance → target balance → rules text → optional PDF → optional video link
3. Bot shows confirmation summary → Admin taps [✅ Confirm & Create]
4. Bot saves to database, posts announcement to both channels
5. Registration opens immediately

### Phase 2 — Users See Announcement
6. Announcement appears on both channels with challenge details, rules, prizes
7. Three buttons: [💰 Open Exness Account] [📄 Download Rules PDF] [🚀 Register Now]
8. Users without Exness account create one via partner link first

### Phase 3 — Registration
9. User taps [🚀 Register Now] or sends `/register` to bot
10. Bot asks: [Demo Account] or [Real Account] (skipped if challenge is demo-only or real-only)
11. Bot asks for Exness email
12. Bot shows "⏳ Verifying your account..."
13. Exness API checks run automatically (allocation → KYC → balance for real)
14. If any check fails → bot tells user exactly what's wrong, registration cancelled
15. If all pass → bot asks for MT5 account number
16. User sends account number → bot saves to database
17. Bot confirms with summary + [🔄 Change Account Number] button

### Phase 4 — Pre-Challenge (Registration Open, Trading Not Started)
18. User can tap [🔄 Change Account Number] anytime before challenge starts
19. Bot replaces old account number in database (email stays locked)
20. Other users continue registering
21. Challenge start time arrives → registration auto-closes
22. New `/register` attempts: "❌ Registration is closed."
23. [🔄 Change Account Number]: "❌ Challenge has started. Changes are no longer allowed."

### Phase 5 — During Challenge (Trading Period)
24. Users trade on their registered MT5 accounts following the rules
25. Bot does nothing — no intervention needed
26. (Optional: daily reminders or leaderboard posts — TBD)

### Phase 6 — Challenge Ends
27. Challenge end time arrives → bot auto-posts end message to both channels
28. Message: exciting race, thank you, submit results within 48 hours
29. Message includes [📋 Submit Results] button

### Phase 7 — Results Submission (48-Hour Window)
30. User taps [📋 Submit Results]
31. Bot checks: is this telegram user registered? If not → rejected
32. Bot asks: final account balance (number)
33. Bot asks: screenshot of final balance
34. Bot asks: investor (read-only) password
35. Bot asks: confirm password (must match)
36. If mismatch → repeat password steps
37. Bot saves to database, confirms submission
38. After 48 hours → button stops working, late submissions rejected

### Phase 8 — Admin Report (Auto-generated)
39. 48 hours after challenge end → bot sends downloadable CSV to admin
40. All submissions sorted by balance (descending), separated by category
41. Includes: email, account number, investor password, balance, screenshot links

### Phase 9 — Admin Review (Manual)
42. Team logs into MT5 accounts with investor passwords
43. Checks trade history against rules
44. `/messageuser` to request additional info from any participant
45. `/disqualify` to disqualify rule breakers (user notified with reason)

### Phase 10 — Winner Selection
46. Admin sends `/selectwinners`
47. Bot shows submissions sorted by balance per category
48. Admin picks winner positions → bot shows confirmation
49. Admin taps [✅ Confirm & Announce]

### Phase 11 — Winner Announcement
50. Bot posts results to both channels (winners, balances, prizes)
51. Bot DMs each winner: congratulations, prize amount, DM @birrFXadmin within 24 hours to claim
52. Winners claim by DMing @birrFXadmin with screenshot

### Phase 12 — Prize Distribution (Manual)
53. Admin verifies winner and sends prize via Exness internal transfer
54. Challenge complete

---

## Open Questions
1. Should trading rules be configurable per challenge or hardcoded?
2. Do you want daily leaderboard posts during the challenge?
3. Should the bot send daily reminders to participants?
4. Do you want the registration to work in DM only or also in the channel?
5. How many challenges run at the same time? (just one, or multiple?)

---

## Implementation Plan
(To be filled after discussion is complete)
