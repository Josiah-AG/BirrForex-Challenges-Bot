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

### A6. Confirm Password
```
🔑 Enter the investor password again to confirm:
```

**If mismatch:**
```
❌ Passwords don't match. Please enter your investor password again:
```

### A7. VPS Verification
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

🔑 Enter your Investor (Read-Only) Password again:
```
→ Back to A5

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
→ Proceed to A8

### A8. Nickname
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
**If brand impersonation:** `❌ You cannot use that nickname — it's too similar to our brand.`

### A9. Registration Complete
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

### B5-B6. Server Selection + Password (Same as A4-A6 but with Real servers)
Servers shown: `Exness-MT5Real9, Real15, Real21, Real22, Real23, Real24, Real25, Real26, Real27, Real28, Real29, Real30`

### B7. VPS Verification
```
⏳ Verifying MT5 connection...
```

**If login failed:** Same as A7 login failed → back to B5

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

```json
{
  "success": true,
  "balance": 1000.0,
  "equity": 1000.0,
  "currency": "USC",
  "account_subtype": "standard_cent",
  "server": "Exness-MT5Real21",
  "leverage": 2000,
  "login": 161584935
}
```

`account_subtype` values:
- `standard` — EURUSDm available (Standard account)
- `standard_cent` — EURUSDc available (Standard Cent)
- `pro` — EURUSD available, no suffix (Pro account)
- `raw_spread` — EURUSD available, no suffix (Raw Spread)
- `zero` — EURUSDz available (Zero account)

Detection logic on VPS:
1. If currency = USC → `standard_cent`
2. If currency = USD:
   - Check `mt5.symbol_info("EURUSDm")` → if exists → `standard`
   - Check `mt5.symbol_info("EURUSDz")` → if exists → `zero`
   - Check `mt5.symbol_info("EURUSD")` → if exists → `pro` (or `raw_spread`)
   - None found → `unknown`

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
