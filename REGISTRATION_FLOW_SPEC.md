# Complete Registration Flow Specification

This document defines every step, message, and button for challenge registration.
Telegram and Discord flows are IDENTICAL in logic — only UI mechanism differs.

---

## COMMON STEPS (All Paths Start Here)

### Pre-check: Username Required (Telegram only)
If user has no Telegram username:
```
⚠️ Telegram Username Required

You need to set a Telegram username before registering.

How to set a username:
1. Open Telegram Settings
2. Tap on your profile
3. Set a username (e.g., @yourname)

Once done, tap "Join Challenge" again.
```
→ STOP

### Pre-check: Already Registered
If user already registered for this challenge:
```
✅ You are already registered for this challenge!

📋 Your Registration:
🏷️ Nickname: TraderX
📧 Email: user@example.com
🏦 Real Account: 161584935
🖥️ Server: Exness-MT5Real21
📊 Type: Real

[🔄 Change Account Number]
[🔀 Switch to Demo Account]  ← only in hybrid
```
→ STOP

---

## PATH A: DEMO ONLY CHALLENGE

### A1. Start
```
📧 Please send your Exness email address:
```

### A2. Email Verification
User sends email. System calls Exness API.

**If NOT allocated:**
```
⚠️ Your Exness account is not registered under BirrForex.

First, make sure you spelled your email correctly.

✨ Option 1: Create a New Exness Account
🔗 https://one.exnesstrack.org/...

🔄 Option 2: Change Your Partner to BirrForex
➡️ Log in → Live Chat → "Change Partner"
➡️ Paste: https://one.exnessonelink.com/...

After completing, try again:

[📧 Submit Email Again]
```

**If KYC not passed:**
```
❌ Your Exness account is not fully verified.

Please complete your KYC verification first:
➡️ Log in to your Exness Personal Area
➡️ Go to Settings → Verification
➡️ Upload your ID and proof of address
➡️ Wait for approval (usually a few minutes)

Once verified, try again:

[📧 Submit Email Again]
```
If user fails KYC check 2+ times:
```
(same message above +)
If you are sure your account is verified, contact @birrFXadmin with a screenshot of this message.
```

**If allocated + KYC passed:**
```
✅ Email verified!

Now send your MT5 Demo Account Number:
⚠️ Must be an MT5 trading account.
Only numeric account numbers accepted.
```

### A3. Account Number
User sends account number (numeric only).

→ Proceed to server selection (no allocation check for demo)

### A4. Server Selection
```
🖥️ Select your MT5 Trading Server:

[MT5Trial2] [MT5Trial3]
[MT5Trial7] [MT5Trial9]
[✍️ Type Server Manually]
```

**If user types manually and fuzzy matches:**
```
Is your server Exness-MT5Trial9?

[✅ Yes]  [❌ No, let me type again]
```

**If no match:**
```
❌ Could not match "trial 9" to a known server.
Please select from the buttons or type the exact server name:
```
→ Show server buttons again

### A5. Investor Password
```
🔑 Enter your Investor (Read-Only) Password

This is the password that allows view-only access to your MT5 account.
⚠️ NOT your master/trading password.

📋 How to get your Investor Password (link)

Send your investor password:
```

### A6. VPS Verification
```
⏳ Verifying MT5 connection...
This may take up to 30 seconds.
```

System calls VPS `/verify`. Returns: success, currency, account_subtype, balance, equity.

**If login failed:**
```
❌ Connection failed — Invalid credentials

The investor password or account number/server combination is incorrect.

Please double-check:
• Account: 435924397
• Server: Exness-MT5Trial9

Send your MT5 Demo Account Number:
```
→ Back to A3 (account number)

**If account subtype is NOT standard (Pro/Raw/Zero):**
```
❌ Account Type Not Allowed

Your account is a Pro/Raw Spread account. This challenge only accepts Standard accounts.

📋 How to create a Standard Account:
1. Open Exness → My Accounts
2. Create New Account → Choose "Standard"
3. Select MT5 platform

Once ready, submit your standard account:

[📝 Submit Another Account]
```
→ Back to A3

**If balance ≠ starting_balance (±1% tolerance):**
```
❌ Balance Mismatch

Your demo account balance is $25.00 but the challenge requires exactly $30.00.

Please set your balance to $30.00 and try again.

[📝 Submit Another Account]
```
→ Back to A3

**If all checks pass:**
```
✅ MT5 connection verified! Balance: $30.00 ✓
```
→ Proceed to A7

### A7. Nickname
```
🏷️ Almost done! Choose a Challenge Nickname

This will be displayed on the leaderboard instead of your real name.
• 3-20 characters
• Letters, numbers, underscores only
• Must be unique

Send your nickname:
```

**If too short/long:** `❌ Nickname must be 3-20 characters. Try again:`
**If invalid chars:** `❌ Only letters, numbers, and underscores allowed. Try again:`
**If taken:** `❌ "TraderX" is already taken. Choose a different nickname:`
**If brand impersonation:** `❌ You cannot use this nickname. Please choose a different one:`

### A8. Registration Complete
```
✅ Registration Complete!

📋 Your Registration:
🏷️ Nickname: TraderX
📧 Email: user@example.com
🏦 Demo Account: 435924397
🖥️ Server: Exness-MT5Trial9
📊 Type: Demo
🔑 Investor Password: ✅ Saved

⏳ Challenge starts: May 25, 2026, 12:00 AM

⚠️ IMPORTANT: Do NOT change your investor password until the challenge ends and winners are announced.

⚠️ Please read the rules before starting the challenge!

You can change your account number before the challenge starts.

[🔄 Change Account Number]
```

---

## PATH B: REAL ONLY CHALLENGE (Cent-Only ON)

Admin entered rules in CENT terms. Only cent accounts accepted.

### B1-B2. Same as A1-A2 (Email + Allocation + KYC check)

All email verification outcomes apply (not allocated, KYC failed, success).
On success:
### B3. Account Number
```
✅ Email verified!

Now send your MT5 Real Account Number:
⚠️ Must be an MT5 trading account.
Only numeric account numbers accepted.
```

### B4. Real Account Allocation Check
```
⏳ Verifying account allocation...
```

System calls Exness API to verify real account is under BirrForex.

**If not allocated:**
```
⚠️ This real account is not under BirrForex.
Create a new Real Account within your Exness and transfer funds there.

[📝 Submit New Real Account]
```

**If not MT5:**
```
⚠️ This account is not MT5. Only MT5 accounts allowed.
Create a new MT5 Real account and try again.

[📝 Submit New Real Account]
```

**If allocated + MT5:** → Proceed to B5

### B5-B6. Server Selection + Password (Same as A4-A5 but with Real servers)
Servers shown: `Exness-MT5Real9, Real15, Real21, Real22, Real23, Real24, Real25, Real26, Real27, Real28, Real29, Real30`

### B7. VPS Verification
```
⏳ Verifying MT5 connection...
```

**If login failed:**
```
❌ Connection failed — Invalid credentials

The investor password or account number/server combination is incorrect.

Please double-check:
• Account: 161584935
• Server: Exness-MT5Real21

Send your MT5 Real Account Number:
```
→ Back to B3

**If currency = USD (not cent):**
```
❌ Only Cent Accounts Allowed

This challenge requires a Cent Account (currency: USC).
Your account is a Standard account (currency: USD).

📋 How to create a Cent Account:
1. Open Exness → My Accounts
2. Create New Account → Choose "Standard Cent"
3. Select MT5 platform
4. Fund the account

Once ready, submit your cent account:

[📝 Submit Cent Account]
```
→ Back to B3

**If currency = USC (cent) ✓:**
- Account subtype check (should be standard_cent, safety check)
- Balance check against starting_balance (admin entered in ¢):

**If balance > starting_balance:**
```
❌ Balance Too High

Your account balance is 1500¢ which exceeds the starting balance of 1000¢.

Please withdraw or transfer funds so your balance is at or below 1000¢, then try registering again.

[📝 Submit Another Account]
```
→ Back to B3

**If balance = 0:**
```
✅ MT5 connection verified!

⚠️ Your account balance is 0.00¢.

Please deposit before the challenge starts.
```
→ Proceed to B8

**If balance < starting_balance and > 0:**
```
✅ MT5 connection verified!

ℹ️ Your balance is 500¢. The challenge starting balance is 1000¢.

You can still participate — the target remains the same regardless of your starting point.

If you want to deposit more, do it before the challenge starts. After the challenge starts, any additional deposit will result in disqualification.
```
→ Proceed to B8

**If balance = starting_balance:**
```
✅ MT5 connection verified! Balance: 1000¢ ✓

You're all set!
```
→ Proceed to B8

### B8-B9. Nickname + Complete (Same as A8-A9 but shows "Real Account" and ¢ values)

---

## PATH C: REAL ONLY CHALLENGE (Flexible — Cent-Only OFF)

Admin entered rules in STANDARD terms. Users can use standard OR cent.

### C1-C6. Same as B1-B6 (Email + Allocation + KYC → Account → Allocation Check → Server → Password)

### C7. VPS Verification

**If login failed:** Same as before

**If currency = USC:** `is_cent = true`
**If currency = USD:** `is_cent = false` → check account subtype

**Account subtype check (USD accounts only):**
- Check if `EURUSDm` is available → Standard ✓
- If `EURUSD` (no suffix) available → Pro/Raw Spread ✗
- If `EURUSDz` available → Zero ✗

**If Pro/Raw/Zero:**
```
❌ Account Type Not Allowed

Your account is a Pro/Raw Spread account. This challenge only accepts Standard or Standard Cent accounts.

📋 How to create a Standard Account:
1. Open Exness → My Accounts
2. Create New Account → Choose "Standard" or "Standard Cent"
3. Select MT5 platform
4. Fund the account

[📝 Submit Another Account]
```
→ Back to C3

**Balance check:**

FOR CENT USERS (USC): compare to `starting_balance × 100`
- balance > starting_balance×100: `❌ Balance Too High. Your balance is 15000¢, max is 10000¢ ($100)...` [Submit Another Account]
- balance = 0: `✅ MT5 verified! ⚠️ Balance is 0.00¢. Please deposit before challenge starts.`
- balance < starting_balance×100: `✅ MT5 verified! ℹ️ Balance is 5000¢. Starting balance is 10000¢ ($100). You can still participate...`
- balance ≈ starting_balance×100: `✅ MT5 verified! Balance: 10000¢ ✓`

FOR STANDARD USERS (USD): compare to `starting_balance`
- balance > starting_balance: `❌ Balance Too High. Your balance is $150, max is $100...` [Submit Another Account]
- balance = 0: `✅ MT5 verified! ⚠️ Balance is $0.00. Please deposit before challenge starts.`
- balance < starting_balance: `✅ MT5 verified! ℹ️ Balance is $50. Starting balance is $100. You can still participate...`
- balance = starting_balance: `✅ MT5 verified! Balance: $100.00 ✓`

### C8-C9. Nickname + Complete

---

## PATH D: HYBRID CHALLENGE (Cent-Only ON)

Admin entered rules in STANDARD terms. Demo = standard. Real = cent only.

### D1. Category Selection
```
🎯 BIRRFOREX TRADING CHALLENGE
Challenge Title

This is a Hybrid Challenge — you can participate
with either a Demo or Real account.

⚠️ You can only compete in one category.

🏆 Real Account Category Prizes:
🥇 1st Place: $50
🥈 2nd Place: $30
🥉 3rd Place: $20

🏆 Demo Account Category Prizes:
🥇 1st Place: $20
🥈 2nd Place: $10

Choose your category:

[🏦 Demo Account Challenge]  [💰 Real Account Challenge]
```

### D2a. IF DEMO CHOSEN:
→ Follow Path A (Demo Only) from A1 onwards

### D2b. IF REAL CHOSEN:
→ Follow Path B steps BUT with these differences:
- Currency check: Must be USC (cent only for real)
- Balance comparison: `starting_balance × 100` (admin entered in $ terms, convert for cent)
  - balance > starting_balance×100: reject
  - balance = 0: allow with deposit message
  - balance < starting_balance×100: allow with info
  - balance ≈ starting_balance×100: perfect

---

## PATH E: HYBRID CHALLENGE (Flexible — Cent-Only OFF)

Admin entered rules in STANDARD terms. Demo = standard. Real = standard OR cent.

### E1. Category Selection (Same as D1)

### E2a. IF DEMO CHOSEN:
→ Follow Path A (Demo Only) from A1 onwards

### E2b. IF REAL CHOSEN:
→ Follow Path C (Real Flexible) from C1 onwards

---

## VPS VERIFY ENDPOINT RESPONSE FORMAT

**Endpoint:** `POST http://108.181.184.223:8000/verify`
**Auth:** `api_key` in body

### Actual Response (Cent Account — tested May 25, 2026):
```json
{
    "success": true,
    "message": "Credentials verified successfully",
    "account_name": "TC1",
    "balance": 0.0,
    "equity": 0.0,
    "server": "Exness-MT5Real21",
    "currency": "USC",
    "account_subtype": "standard_cent",
    "leverage": 2000,
    "margin_free": 0.0,
    "profit": 0.0,
    "login": 161584895,
    "trade_mode": 2,
    "terminal_id": 1,
    "terminal_used": 1,
    "retries": 0,
    "terminals_tried": 1
}
```

### Actual Response (Standard Demo Account — tested May 25, 2026):
```json
{
    "success": true,
    "message": "Credentials verified successfully",
    "account_name": "Standard",
    "balance": 909867.38,
    "equity": 909866.87,
    "server": "Exness-MT5Trial9",
    "currency": "USD",
    "account_subtype": "standard",
    "leverage": 500,
    "margin_free": 909862.22,
    "profit": -0.51,
    "login": 435924397,
    "trade_mode": 0,
    "terminal_id": 2,
    "terminal_used": 2,
    "retries": 0,
    "terminals_tried": 1
}
```

### Failed Login Response:
```json
{
    "success": false,
    "message": "Login failed: (error_code, 'error description')",
    "terminal_used": 3
}
```

### Field Descriptions:

| Field | Type | Description |
|-------|------|-------------|
| success | bool | Whether login succeeded |
| message | string | Status message |
| account_name | string | MT5 account display name |
| balance | float | Account balance (raw — in cents for USC, dollars for USD) |
| equity | float | Account equity |
| server | string | Connected server name |
| currency | string | `"USC"` = cent account, `"USD"` = standard |
| account_subtype | string | `"standard"`, `"standard_cent"`, `"pro"`, `"zero"`, `"unknown"` |
| leverage | int | Account leverage (e.g., 500, 2000) |
| margin_free | float | Free margin |
| profit | float | Current floating P/L |
| login | int | MT5 login number |
| trade_mode | int | 0=demo, 2=real |
| terminal_id | int | Which terminal processed the request |
| terminal_used | int | Same as terminal_id (router adds this) |
| retries | int | Number of retries before success |
| terminals_tried | int | How many different terminals were attempted |

### Detection Logic (on VPS worker):
```
if currency == "USC":
    account_subtype = "standard_cent"
elif symbol_info("EURUSDm") exists:
    account_subtype = "standard"
elif symbol_info("EURUSDz") exists:
    account_subtype = "zero"
elif symbol_info("EURUSD") exists:
    account_subtype = "pro"
else:
    account_subtype = "unknown"
```

---

## DATA SAVED ON SUCCESSFUL REGISTRATION

| Field | Value |
|-------|-------|
| `account_type` | 'demo' or 'real' |
| `is_cent` | true if currency=USC, false otherwise |
| `account_subtype` | 'standard', 'standard_cent', etc. (NEW) |
| `registration_balance` | VPS balance at registration time |
| `last_known_balance` | Same as registration_balance initially |
| `connection_verified` | true |
| `investor_password` | Stored as plaintext (read-only password) |
| `mt5_server` | Server name |
| `nickname` | User's chosen nickname |

---

## EDGE CASES

### Server timeout during VPS verify:
```
⚠️ Connection timed out

The MT5 server took too long to respond. This can happen during high traffic.

Please try entering your investor password again:
```
→ Back to password step

### VPS API completely down:
Proceed without verification (graceful degradation). Log the issue.
→ Skip to nickname step

### Nickname race condition (taken between check and save):
```
❌ Nickname "TraderX" was just taken! Choose a different one:
```
→ Back to nickname step


---

## FAILED ATTEMPTS & RE-ENGAGEMENT (Telegram Only)

Failed attempt tracking and re-engagement DMs are **Telegram-only** features. Discord does NOT track failed attempts or send re-engagement messages.

### What Gets Logged:
When a user fails at any verification step, the system logs it to `trading_failed_attempts`:
- **allocation** — Email not under BirrForex
- **kyc** — KYC verification not passed
- **real_acct** — Real account not allocated under BirrForex / not MT5

### Table: `trading_failed_attempts`
| Column | Description |
|--------|-------------|
| challenge_id | Which challenge |
| telegram_id | User's Telegram ID (always Telegram — Discord doesn't use this) |
| username | Telegram username |
| email | Email they tried |
| failure_type | 'allocation', 'kyc', or 'real_acct' |
| attempted_at | When they failed |
| engage_count | How many re-engagement DMs sent |
| last_engaged_at | When last DM was sent |
| engage_successful | Whether DM was delivered |
| converted | Whether they later registered successfully |
| converted_at | When they converted |

### Re-Engagement Logic:
- **First DM:** 24 hours after failure (if user hasn't registered)
- **Subsequent DMs:** Every 48 hours (or 24 hours in last 3 days before challenge start)
- **Stops when:** User registers (converted=true) OR challenge starts
- **Message content:** Tailored to failure type (allocation → partner change guide, KYC → verification guide, real_acct → create new account guide)
- **Each DM includes:** "Register Now" deep link button

### Admin Commands:
- `/engagefailedusers` — Manually trigger re-engagement DMs
- `/exportfailedattempts` — Export CSV of all failed attempts
- `/regstats` — Shows failure counts alongside registration stats

### Why Telegram Only:
- Discord team members are already onboarded (email verified, allocation confirmed during onboarding)
- Discord users rarely fail at allocation/KYC since they're pre-screened
- Discord bot doesn't have deep link mechanism for re-engagement
- The `trading_failed_attempts` table uses `telegram_id` column (not `user_id`) — it's exclusively for Telegram users

---

## DISCORD-SPECIFIC DIFFERENCES

The flow is identical to Telegram in logic, but Discord has these UI/UX differences:

---

### D-1. Registration Trigger
- **Telegram:** User clicks deep link button → bot DMs them
- **Discord:** User clicks "🚀 Register Now" button in #challenges → bot DMs them

---

### D-2. Email Step (Discord has extra option)

Discord users are already team members with emails in the attendance database.
So Discord shows an EXTRA choice before email:

```
📋 Challenge Registration
"BFX Teams Challenge 1"
Type: REAL

How would you like to register?

[✅ Use my team Exness account]  [📧 Use another Exness account]
```

**If "Use my team Exness account":**
- System looks up `member_emails` table in Discord's SQLite DB
- If email found: auto-fills email, skips to account type (if hybrid) or account number
- Allocation + KYC check still runs on this email (via Discord bot's own ExnessAPI class)
- If email NOT found in DB: "⚠️ We couldn't find an email linked to your team registration. Please enter your Exness email address below:"

**If "Use another Exness account":**
- Proceeds to manual email entry (same as Telegram)
- Allocation + KYC check runs on the entered email

---

### D-3. Account Type Selection (Hybrid only)

```
What type of account are you registering with?

[📊 Demo Account]  [💰 Real Account]
```
(Discord buttons, same as Telegram inline buttons)

---

### D-4. Server Selection

Discord uses a **Select Menu (dropdown)** instead of many buttons:

For Demo:
```
🖥️ Select your MT5 Trading Server:

[▼ Select Server]
  - Exness-MT5Trial2
  - Exness-MT5Trial3
  - Exness-MT5Trial7
  - Exness-MT5Trial9
  - ✍️ Type Manually
```

For Real:
```
🖥️ Select your MT5 Trading Server:

[▼ Select Server]
  - Exness-MT5Real9
  - Exness-MT5Real15
  - Exness-MT5Real21
  - Exness-MT5Real22
  - ... (all real servers)
  - ✍️ Type Manually
```

**If "Type Manually" selected:**
```
Type your MT5 server name below:
Example: Exness-MT5Real21
```

**Fuzzy match confirmation (buttons, NOT text):**
```
Is your server Exness-MT5Real21?

[✅ Yes]  [❌ No, let me type again]
```

---

### D-5. All Error/Retry States Use Buttons

Every error state that needs user action uses Discord buttons:

```
❌ Only Cent Accounts Allowed
...message...

[📝 Submit Cent Account]  [❌ Cancel]
```

```
❌ Account Type Not Allowed
...message...

[📝 Submit Another Account]  [❌ Cancel]
```

```
❌ Balance Too High
...message...

[📝 Submit Another Account]  [❌ Cancel]
```

```
❌ Connection failed — Invalid credentials
...message...

[🔄 Try Again]  [❌ Cancel]
```
"Try Again" goes back to account number step.

---

### D-6. Allocation + KYC Check

Discord bot has its own `ExnessAPI` class (in `bot.py`) that can:
- `check_allocation(email)` — returns affiliation data
- `get_kyc_status(full_uuid)` — returns KYC status
- `verify_user(email)` — full flow (allocation → UUID → KYC)

For challenge registration, Discord bot calls its own `exness_api.verify_user(email)`:
- If `status == "not_allocated"`: show allocation failed message + buttons
- If `status == "pending_kyc"` (kyc_passed = false): show KYC message + buttons
- If `status == "verified"`: proceed

Messages are IDENTICAL to Telegram (same text, same buttons).

---

### D-7. Real Account Allocation Check

Discord currently does NOT check real account allocation before server/password.
This needs to be added. Two options:

**Option A:** Add `/api/discord/verify-real-account` endpoint on TG Bot API
**Option B:** Discord bot calls its own ExnessAPI to check account allocation

Recommended: **Option A** — add API endpoint. The TG Bot already has `exnessService.verifyRealAccount()` which checks if a specific account number is under BirrForex + is MT5. Expose it as an API endpoint for Discord to call.

New endpoint:
```
POST /api/discord/verify-real-account
Body: { account_number }
Response: { status: "allocated_mt5" | "allocated_not_mt5" | "not_allocated" | "api_error" }
```

---

### D-8. VPS Verify

Discord already calls `POST /api/discord/verify-connection` which does VPS check.
This endpoint needs to be enhanced to also return `account_subtype` (already planned in VPS worker update).

The Discord bot then checks the response and shows appropriate messages with buttons.

---

### D-9. Nickname

Same as Telegram — user types nickname, bot validates:
- Length (3-20)
- Characters (alphanumeric + underscore)
- Uniqueness (API check)
- Brand check

---

### D-10. Registration Complete

Same message as Telegram but without the deep link button (Discord doesn't need it):
```
✅ Registration Complete!

📋 Your Registration:
🏷️ Nickname: TraderX
📧 Email: user@example.com
🏦 Real Account: 161584935
🖥️ Server: Exness-MT5Real21
📊 Type: Real
🔑 Investor Password: ✅ Saved

⏳ Challenge starts: May 25, 2026, 12:00 AM

⚠️ IMPORTANT: Do NOT change your investor password until the challenge ends.

[🔄 Change Account Number]
```

---

## IMPLEMENTATION PLAN FOR DISCORD

### Approach:
- **Email verification (allocation + KYC):** Use Discord bot's own `ExnessAPI` class (already in `bot.py`, already works for onboarding). No API call to TG Bot needed.
- **Real account allocation check:** Add `POST /api/discord/verify-real-account` endpoint on TG Bot API (reuses existing `exnessService.verifyRealAccount()` logic).
- **VPS verify:** Already uses `POST /api/discord/verify-connection` — just needs `account_subtype` handling (VPS worker already returns it).
- **Server selection:** Replace text input with Discord Select Menu (dropdown).
- **All confirmations/errors:** Use Discord buttons (no text-based yes/no).

### Files to modify:

**TG Bot (Node.js):**
- `src/api/discordRoutes.ts` — Add `POST /api/discord/verify-real-account` endpoint

**Discord Bot (Python):**
- `challenge_bot.py` — Rewrite `handle_registration_message()` and `start_registration_dm()`:
  1. Add email verification using `_exness_api.verify_user(email)`
  2. Add real account allocation check (call TG Bot API)
  3. Replace server text input with Select Menu
  4. Add account subtype rejection handling from VPS response
  5. Add all balance check messages with proper ¢/$ display
  6. Remove password confirmation (already done)
  7. Ensure all error states have buttons (Submit Another Account, Cancel)
  8. Add fuzzy match confirmation with buttons (already partially done)
  9. Handle "Use team email" vs "Use another email" flow

### Order of implementation:
1. Add `POST /api/discord/verify-real-account` to TG Bot API
2. Update VPS `verify-connection` response handling in Discord bot
3. Rewrite Discord registration flow in `challenge_bot.py` step by step
4. Test each path (Demo, Real+cent, Real+flex, Hybrid+cent, Hybrid+flex)


---

## DATABASE: What Gets Saved After Successful Registration

### Table: `trading_registrations`

#### Scenario 1: Demo Only Challenge (Standard account, balance $30)

| Column | Value |
|--------|-------|
| challenge_id | 1 |
| user_id | 2138352441 |
| username | @traderX |
| nickname | TraderX |
| account_type | `demo` |
| email | user@example.com |
| account_number | 435924397 |
| mt5_server | Exness-MT5Trial9 |
| investor_password | Abc@1234 |
| client_uid | abc123-short-uid |
| source | `telegram` |
| status | NULL (active) |
| is_cent | `false` |
| account_subtype | `standard` |
| registration_balance | 30.00 |
| last_known_balance | 30.00 |
| actual_starting_balance | NULL (set later by evaluation on first deposit detection) |
| connection_verified | `true` |
| connection_verified_at | 2026-05-25 00:00:00 |
| pull_status | `never_pulled` |
| disqualified | `false` |
| registered_at | 2026-05-25 00:00:00 |

**Note:** `user_id` + `source` tells us the platform. If `source = 'telegram'`, user_id is a Telegram ID. If `source = 'discord'`, user_id is a Discord ID. `username` is the platform username (@handle).

---

#### Scenario 2: Real Only + Cent-Only (Cent account, balance 1000¢)

| Column | Value |
|--------|-------|
| challenge_id | 2 |
| user_id | 123456789 |
| username | @centTrader |
| nickname | CentKing |
| account_type | `real` |
| email | cent@example.com |
| account_number | 161584935 |
| mt5_server | Exness-MT5Real21 |
| investor_password | Pass@123 |
| client_uid | def456-short-uid |
| source | `telegram` |
| is_cent | `true` |
| account_subtype | `standard_cent` |
| registration_balance | 1000.00 (raw cents from VPS) |
| last_known_balance | 1000.00 |
| actual_starting_balance | NULL |
| connection_verified | `true` |
| pull_status | `never_pulled` |
| disqualified | `false` |

**Note:** Balance stored as raw VPS value (1000 = 1000¢). The system knows it's cents because `is_cent = true`.

---

#### Scenario 3: Real Only + Flexible — User chose CENT account

| Column | Value |
|--------|-------|
| challenge_id | 3 |
| account_type | `real` |
| account_number | 161584895 |
| mt5_server | Exness-MT5Real21 |
| is_cent | `true` |
| account_subtype | `standard_cent` |
| registration_balance | 10000.00 (raw cents = $100 equivalent) |
| last_known_balance | 10000.00 |

**Note:** Admin set starting_balance = 100 ($). User has 10000¢ = $100. Stored as raw 10000.

---

#### Scenario 4: Real Only + Flexible — User chose STANDARD account

| Column | Value |
|--------|-------|
| challenge_id | 3 |
| account_type | `real` |
| account_number | 133643354 |
| mt5_server | Exness-MT5Real9 |
| is_cent | `false` |
| account_subtype | `standard` |
| registration_balance | 100.00 (dollars) |
| last_known_balance | 100.00 |

---

#### Scenario 5: Hybrid + Cent-Only — User chose DEMO

| Column | Value |
|--------|-------|
| challenge_id | 4 |
| account_type | `demo` |
| account_number | 435924397 |
| mt5_server | Exness-MT5Trial9 |
| is_cent | `false` |
| account_subtype | `standard` |
| registration_balance | 30.00 |
| last_known_balance | 30.00 |

---

#### Scenario 6: Hybrid + Cent-Only — User chose REAL (must be cent)

| Column | Value |
|--------|-------|
| challenge_id | 4 |
| account_type | `real` |
| account_number | 161584935 |
| mt5_server | Exness-MT5Real21 |
| is_cent | `true` |
| account_subtype | `standard_cent` |
| registration_balance | 3000.00 (raw cents = $30 equivalent, admin set starting_balance=30) |
| last_known_balance | 3000.00 |

---

#### Scenario 7: Hybrid + Flexible — User chose REAL with CENT account

| Column | Value |
|--------|-------|
| challenge_id | 5 |
| account_type | `real` |
| is_cent | `true` |
| account_subtype | `standard_cent` |
| registration_balance | 3000.00 (raw cents) |

---

#### Scenario 8: Hybrid + Flexible — User chose REAL with STANDARD account

| Column | Value |
|--------|-------|
| challenge_id | 5 |
| account_type | `real` |
| is_cent | `false` |
| account_subtype | `standard` |
| registration_balance | 30.00 (dollars) |

---

#### Scenario 9: User registered with $0 balance (hasn't deposited yet)

| Column | Value |
|--------|-------|
| registration_balance | 0 |
| last_known_balance | 0 |
| actual_starting_balance | NULL (will be set when first deposit detected during pulls) |

---

#### Scenario 10: Discord registration (team email used)

| Column | Value |
|--------|-------|
| user_id | 987654321012345 (Discord user ID) |
| username | traderX (Discord username, no @) |
| source | `discord` |
| (all other fields same as equivalent Telegram scenario) |

**Note:** Same `user_id` column — `source` tells us it's a Discord ID. No separate `discord_user_id` column needed.

---

### New Column: `account_subtype` (TO BE ADDED)

```sql
ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS account_subtype VARCHAR(20) DEFAULT 'standard';
```

Values: `standard`, `standard_cent`, `pro`, `raw_spread`, `zero`, `unknown`

### Schema Change: Rename `telegram_id` → `user_id`, Remove `discord_user_id`

```sql
-- Rename telegram_id to user_id (holds either Telegram or Discord ID based on source)
ALTER TABLE trading_registrations RENAME COLUMN telegram_id TO user_id;
-- Drop discord_user_id (redundant — user_id + source is sufficient)
ALTER TABLE trading_registrations DROP COLUMN IF EXISTS discord_user_id;
```

The `source` column (`telegram` or `discord`) tells the system which platform the `user_id` and `username` belong to.

**Impact:** All code that references `telegram_id` must be updated to `user_id`. The `wp_leaderboard` table also has `telegram_id` → rename to `user_id`.

---

### How Balance is Stored vs Interpreted

| is_cent | registration_balance | What it means | How evaluation uses it |
|---------|---------------------|---------------|----------------------|
| false | 30.00 | $30.00 | Compare directly to rules (in $) |
| false | 100.00 | $100.00 | Compare directly to rules (in $) |
| true | 1000.00 | 1000¢ ($10) | If Real+cent-only: compare to rules as-is (admin entered in ¢). Otherwise: rules ×100 then compare |
| true | 10000.00 | 10000¢ ($100) | Same logic |

---

### How `actual_starting_balance` Gets Set Later

During VPS pulls, the evaluation engine detects the first deposit:
1. Looks at `wp_deals` for balance deposits (deal_type = 'balance' or '2', profit > 0)
2. First deposit amount = `actual_starting_balance`
3. Saved: `UPDATE trading_registrations SET actual_starting_balance = $1`
4. Second deposit = DQ (recharging)

If user registered with balance > 0 and no deposits detected:
- `actual_starting_balance` = `registration_balance`

---

## BALANCE FIELDS EXPLAINED

### `registration_balance`
The balance the VPS reported at the exact moment of registration. This is a one-time snapshot taken during the VPS verify step. It NEVER changes after registration. It records what the user had when they signed up.

### `last_known_balance`
The most recent balance from the VPS. Updated every pull cycle (6 times per day). This is the "live" balance. Used for:
- Admin overview "Total Balance" display
- Shield icon verification
- Leaderboard `current_balance` (via evaluation)

### `actual_starting_balance`
The balance the system uses as the user's starting point to calculate profit. This is the REAL baseline for the challenge. Determined by deposit detection logic (see below). Once set, it doesn't change.

**Profit formula:** `profit = current_balance - actual_starting_balance`

---

## FIRST DEPOSIT DETECTION LOGIC

Runs during each evaluation cycle. Determines the user's true starting balance.

### How it works:

1. Query `wp_deals` for this user's balance deposits:
   ```sql
   SELECT profit, time FROM wp_deals
   WHERE challenge_id = X AND registration_id = Y
     AND (deal_type ILIKE '%balance%' OR deal_type = '2')
     AND profit > 0
   ORDER BY time ASC
   ```
   This finds all explicit deposit operations (NOT swap, commission, or dividends).

2. **If deposits found:**
   - First deposit amount → saved as `actual_starting_balance`
   - Second deposit → **DQ for recharging** (additional deposit not allowed)

3. **If NO deposits found but `registration_balance` > 0:**
   - User registered with money already in account
   - `actual_starting_balance = registration_balance`

4. **If NO deposits found and `registration_balance` = 0:**
   - User hasn't deposited yet
   - `actual_starting_balance` stays NULL
   - Profit = $0 (hasn't started)
   - System keeps pulling, waiting for first deposit

### Scenarios:

| Registered with | Deposits after start | actual_starting_balance | Result |
|----------------|---------------------|------------------------|--------|
| 1000¢ | None | 1000 (from registration_balance) | Normal |
| 0¢ | 800¢ on day 2 | 800 (first deposit) | Normal |
| 0¢ | 800¢ day 2, then 200¢ day 3 | 800 (first deposit) | **DQ** (recharging) |
| 500¢ | 500¢ more after start | 500 (from registration_balance) | **DQ** (recharging — any deposit after start with existing balance) |
| 0¢ | None (never deposits) | NULL | Stays at 0 profit, keeps pulling |

### What counts as a deposit:
- `deal_type = 'balance'` or `deal_type = '2'` with `profit > 0`

### What does NOT count as a deposit:
- Swap (deal_type = swap)
- Commission (deal_type = commission)
- Dividends
- Trade profits/losses


---

## CSV EXPORT FORMAT (Export Registrations)

Accessible from: Telegram `/exportregistrations` command OR WinnerPip Admin Panel Settings tab.
Shows ALL participants for a challenge regardless of source (Telegram + Discord unified).

### Column Order:

```
#, Registered, Source, Nickname, Username, User ID, Email, Type, Acct Type, Account, Server, Investor Password, Initial Balance, Last Pulled Balance, Status
```

### Example CSV:

```csv
#,Registered,Source,Nickname,Username,User ID,Email,Type,Acct Type,Account,Server,Investor Password,Initial Balance,Last Pulled Balance,Status
1,2026-05-24 08:30 EAT,telegram,MK,@mk_kaizen,2138352441,mekuanent@gmail.com,real,standard_cent,161584921,Exness-MT5Real21,Pass@123,1000¢,985¢,Active
2,2026-05-24 09:15 EAT,discord,Bella FX,bella_fx,987654321012345,bella@gmail.com,real,standard_cent,161584947,Exness-MT5Real21,Abc@456,1000¢,704¢,Active
3,2026-05-24 09:20 EAT,discord,CR7,kete7227,876543210987654,haliketemaw@gmail.com,real,standard_cent,161584935,Exness-MT5Real21,Xyz@789,1000¢,1000¢,Active
4,2026-05-24 10:00 EAT,telegram,kidus_t_w,@kidus_tilahun,1234567890,kidus@gmail.com,real,standard,161585319,Exness-MT5Real9,Kid@321,$100.00,$95.50,Active
5,2026-05-24 10:30 EAT,discord,Soberboy,herand1318,765432109876543,henochs@gmail.com,real,standard_cent,161584898,Exness-MT5Real21,Sob@111,1000¢,NA,Active
6,2026-05-24 11:00 EAT,telegram,TraderPro,@traderpro,9876543210,pro@gmail.com,demo,standard,435924397,Exness-MT5Trial9,Pro@222,$30.00,$30.00,Active
7,2026-05-24 12:00 EAT,discord,FireMan,feron11,654321098765432,fireman@gmail.com,real,standard_cent,161584895,Exness-MT5Real21,Fire@333,0¢,0¢,DQ
```

### Column Definitions:

| # | Column | Description |
|---|--------|-------------|
| 1 | # | Row number |
| 2 | Registered | Registration date/time in EAT |
| 3 | Source | `telegram` or `discord` |
| 4 | Nickname | Challenge leaderboard display name |
| 5 | Username | Platform username (TG: @handle, Discord: username) |
| 6 | User ID | Platform user ID (Telegram ID or Discord ID) |
| 7 | Email | Exness registered email |
| 8 | Type | `real` or `demo` (competition category) |
| 9 | Acct Type | `standard`, `standard_cent`, `pro`, `zero`, `unknown` |
| 10 | Account | MT5 account number |
| 11 | Server | MT5 server name |
| 12 | Investor Password | Read-only MT5 password (plaintext) |
| 13 | Initial Balance | `actual_starting_balance` or `registration_balance` with ¢/$ |
| 14 | Last Pulled Balance | `last_known_balance` from most recent VPS pull (NA if never pulled) |
| 15 | Status | `Active` or `DQ` |

### Notes:
- Initial Balance = `actual_starting_balance` if set (first deposit detected), otherwise `registration_balance`
- Last Pulled Balance = `last_known_balance` updated every pull cycle. Shows `NA` if pulls haven't started
- Balance shows with ¢ for cent accounts, $ for standard
- DQ users included at the bottom with Status = DQ
- Telegram usernames show with `@` prefix, Discord without
