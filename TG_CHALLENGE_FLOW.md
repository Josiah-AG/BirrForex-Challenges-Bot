# TG CHALLENGE FLOW — Complete Message-by-Message Documentation

> Every single message the bot sends during a Telegram Trading Challenge lifecycle.
> Covers: Admin creation → Channel posts → User registration → Daily posts → Challenge end → Winners

---

## TABLE OF CONTENTS

1. [ADMIN: Create Challenge](#1-admin-create-challenge)
2. [ADMIN: Post Announcement](#2-admin-post-announcement)
3. [CHANNEL: Countdown Posts (3, 2, 1 day before)](#3-channel-countdown-posts)
4. [USER: Registration Flow](#4-user-registration-flow)
5. [CHANNEL: Challenge Start](#5-channel-challenge-start)
6. [CHANNEL: Daily Posts (10 trading days)](#6-channel-daily-posts)
7. [CHANNEL: Challenge End](#7-channel-challenge-end)
8. [USER: Password Change Notification](#8-user-password-change-notification)
9. [USER: Late Change / Switch / Retry](#9-user-late-change-switch-retry)
10. [ADMIN: Winner Announcement](#10-admin-winner-announcement)

---

## 1. ADMIN: Create Challenge

### Step 1 — Admin sends `/createtradingchallenge`

**Bot replies:**
```
🎯 Create Trading Challenge

Select challenge type:

[Demo]
[Real]
[Hybrid]
```

### Step 2 — Admin selects type (e.g. "Hybrid")

**Bot replies:**
```
✅ Type: Hybrid

Send the challenge title:
```

### Step 3 — Admin sends title (e.g. "BirrForex Challenge 16")

**Bot replies (hybrid):**
```
🏆 How many Real account winners?
```

### Step 4 — Admin sends number (e.g. "3")

**Bot replies:**
```
Enter prizes for Real account winners (comma separated):
```

### Step 5 — Admin sends prizes (e.g. "400, 350, 300")

**Bot replies:**
```
🏆 How many Demo account winners?
```

### Step 6 — Admin sends number (e.g. "3")

**Bot replies:**
```
Enter prizes for Demo account winners (comma separated):
```

### Step 7 — Admin sends prizes (e.g. "200, 100, 50")

**Bot replies:**
```
📅 Send the start date and time:
Format: YYYY-MM-DD HH:MM
Example: 2026-03-20 09:00
```

### Step 8 — Admin sends start date (e.g. "2026-07-14 00:00")

**Bot replies:**
```
📅 Send the end date and time:
Format: YYYY-MM-DD HH:MM
Example: 2026-04-03 23:59
```

### Step 9 — Admin sends end date (e.g. "2026-07-25 23:59")

**Bot replies:**
```
💰 What is the starting balance?
```

### Step 10 — Admin sends balance (e.g. "30")

**Bot replies:**
```
🎯 What is the target balance?
```

### Step 11 — Admin sends target (e.g. "60")

**Bot replies:**
```
🏆 Send the Prize Pool text:

This will be displayed on announcement, promo, and countdown posts exactly as you write it.

Example:
🥇 1st: $400
🥈 2nd: $350
🥉 3rd: $300
```

### Step 12 — Admin sends prize pool text

**Bot replies:**
```
📄 Send the Rules PDF link (or send /skip):
```

### Step 13 — Admin sends link or /skip

**Bot replies:**
```
🎥 Send the video link (or send /skip):
```

### Step 14 — Admin sends link or /skip

**Bot replies (confirmation):**
```
✅ TRADING CHALLENGE SUMMARY

📋 Title: BirrForex Challenge 16
📋 Type: Hybrid
📅 Period: Jul 14, 2026, 12:00 AM → Jul 25, 2026, 11:59 PM
💰 Starting Balance: $30
🎯 Target: $60

🏆 Real Account Winners: 3
1st: $400 | 2nd: $350 | 3rd: $300
🏆 Demo Account Winners: 3
1st: $200 | 2nd: $100 | 3rd: $50

🏆 Prize Pool: ✅ Set
📄 PDF: ✅ Linked
🎥 Video: ⏭️ Skipped

[✅ Confirm & Create]
[❌ Cancel]
```

### Step 15 — Admin taps "Confirm & Create"

**Bot replies:**
```
✅ Trading Challenge Created!

ID: 16
Title: BirrForex Challenge 16
Status: Draft

⚠️ IMPORTANT: Before posting the announcement, configure the challenge rules on the WinnerPip admin panel → Rules tab.

Rules cannot be changed once the challenge starts.

Use /postchallenge to post the announcement when ready.
```

### Error Scenarios:
- Invalid number: `❌ Enter a number between 1 and 10.`
- Wrong prize count: `❌ Enter exactly 3 prizes, comma separated. Example: 400, 350, 300 or iPhone 16, $200, AirPods`
- Invalid date format: `❌ Invalid format. Use: YYYY-MM-DD HH:MM`
- Invalid balance: `❌ Enter a valid number.`
- Cancel: `❌ Challenge creation cancelled.`

---

## 1B. COMPARISON: WinnerPip Dashboard Challenge Creation

### How It Differs from Telegram Bot

| Aspect | Telegram Bot (`/createtradingchallenge`) | WinnerPip Admin Panel (Settings → Create) |
|--------|------------------------------------------|---------------------------------------------|
| **Interface** | Sequential chat messages (one field at a time) | 4-step web form (all fields visible at once) |
| **Source selection** | Always creates as `source: 'telegram'` | Lets you pick Telegram or Discord |
| **Team-only flag** | Not supported | Discord option auto-sets `team_only: true` |
| **Rules setup** | NOT included — must do separately on Rules tab | Step 3 lets you set all rules before creating |
| **Date input** | Text format `YYYY-MM-DD HH:MM` | Native datetime-local picker (browser UI) |
| **Timezone** | Admin enters EAT manually, bot subtracts 3h for storage | Form values treated as EAT, `+03:00` added in code |
| **Validation** | Step-by-step (errors per field) | Validates on submit (`Missing required fields: title, type, start_date, end_date, starting_balance`) |
| **After creation** | Tells admin to go to WinnerPip Rules tab to set rules | Rules already saved automatically (Step 3) |
| **Post to channel** | Requires separate `/postchallenge` command | Requires separate status change to `registration_open` on Settings tab |

### WinnerPip Dashboard Flow (4 steps):

**Step 1 — Source:**
- Choose: 📱 Telegram (Public) or 🎮 Discord (Team-only)
- Progress bar: ████░░░░ (1/4)

**Step 2 — Details (single form):**
- Title *
- Type * (dropdown: Hybrid / Demo Only / Real Only)
- Start Date & Time (EAT) * (datetime picker)
- End Date & Time (EAT) * (datetime picker)
- Starting Balance ($) *
- Target Balance ($)
- Prize Pool Text
- Real Winners # / Demo Winners #
- Real Prizes (comma-separated) / Demo Prizes (comma-separated)
- PDF URL (optional)
- Video URL (optional)
- Note: "Registration closes automatically when challenge starts"

**Step 3 — Rules (all toggles and inputs on one screen):**
- Max Lot Size (default: 0.02)
- Max Open Trades (default: 3)
- Pair Limit (default: 2)
- Max Risk $ (default: 5)
- Daily Loss Cap $ (default: 10)
- Max Hold Hours (default: 24)
- Min Active Days (default: 7)
- Stop Loss Required (toggle, default: ON)
- Weekend Trading (toggle, default: OFF)
- Only Cent Account (toggle, default: OFF)

**Step 4 — Review & Confirm:**
Shows all fields + rules in summary. User clicks "✓ Create Challenge".

### What Happens After Dashboard Creation:

1. Challenge is created with `status: 'draft'` (same as bot)
2. Rules are saved automatically via `PUT /api/admin/.../challenge/:id/rules`
3. Admin must manually change status to `registration_open` on the Settings tab
4. No Telegram channel announcement is posted automatically
5. Admin must use `/postchallenge` on the Telegram bot to post the announcement

### Does the System Handle Both the Same Way?

**YES** — both creation methods insert into the same `trading_challenges` table. After creation:
- Same database row regardless of source
- Same pull scheduler monitors it
- Same evaluation engine processes it
- Same leaderboard system ranks it
- Same client dashboard displays it

**Key difference:** The WinnerPip dashboard also saves rules in the same API call, while the Telegram bot requires going to the Rules tab manually afterward. If you forget rules after bot creation, the challenge starts with no rules configured.

### Discord-Source Challenges (team_only):

When `source: 'discord'` is selected on the dashboard:
- `team_only = true` in database
- Challenge appears on winnerpip.com with a blurred/locked card (requires Discord registration)
- **No** Telegram countdown posts
- **No** Telegram start/end announcements
- **No** Telegram daily morning/evening posts
- Registration happens through the Discord bot (not Telegram)
- All pull/evaluation/leaderboard logic is identical

---

## 2. ADMIN: Post Announcement

### Admin sends `/postchallenge`

**Bot replies:**
```
Select challenge to post:

[BirrForex Challenge 16]
```

### Admin selects challenge

**Bot replies:**
```
Post to:

[📢 Main Channel]
[🎯 Challenge Channel]
[📢 Both Channels]
```

### Admin selects target → Bot posts to channel(s):

**Channel post (announcement):**
```
🎯 BIRRFOREX TRADING CHALLENGE
BirrForex Challenge 16

📊 Type: Hybrid (Demo & Real Account)
📅 Period: Jul 14, 2026 - Jul 25, 2026
💰 Start: $30 → 🎯 Target: $60

🏆 PRIZE POOL

🥇 1st Real: $400
🥈 2nd Real: $350
🥉 3rd Real: $300
🥇 1st Demo: $200
🥈 2nd Demo: $100
🥉 3rd Demo: $50

⚠️ Please read the challenge rules carefully before you start the challenge!

📄 Challenge Rules: Download PDF

👉 Tap "Join Challenge" below to register!

[🚀 Join Challenge]
[💰 Open Exness Account]
```

**Bot confirms to admin:**
```
✅ Announcement posted! Registration is now open.
```

---

## 3. CHANNEL: Countdown Posts

Automated posts at 08:00 EAT on the 3 days before challenge starts.

### 3 Days Before:
```
⏰ 3 DAYS REMAINING!

BirrForex Challenge 16 starts in 3 days!

Haven't registered yet? Don't miss out!

📅 Start: Jul 14, 2026, 12:00 AM
💰 $30 → 🎯 $60

🏆 PRIZE POOL

[prize pool text here]

📄 Challenge Rules: Download PDF

👉 Tap "Join Challenge" below to register!

[🚀 Join Challenge]
[💰 Open Exness Account]
```

### 2 Days Before:
```
⏰ 2 DAYS REMAINING!

BirrForex Challenge 16 starts in 2 days!

Time is running out to register!

[same format as above]
```

### 1 Day Before:
```
🚨 LAST CHANCE TO REGISTER!

BirrForex Challenge 16 starts TOMORROW!

After the challenge starts, registration closes and no more entries will be accepted.

Don't miss out — register NOW! 🚀

[same format as above]
```

---

## 4. USER: Registration Flow

### Scenario A: User has no username

**Bot replies:**
```
⚠️ Telegram Username Required

You need to set a Telegram username before registering.

How to set a username:
1. Open Telegram Settings
2. Tap on your profile
3. Set a username (e.g., @yourname)

Once done, tap "Join Challenge" again.
```

### Scenario B: User is already registered

**Bot replies:**
```
✅ You are already registered for this challenge!

📋 Your Registration:
🏷️ Nickname: TraderX
📧 Email: user@example.com
🏦 Real Account: 161584935
🖥️ Server: Exness-MT5Real21
📊 Type: Real

[🔄 Change Account Number]
[🔀 Switch to Demo Account]   ← only for hybrid
```

### Scenario C: Registration closed

**Bot replies:**
```
❌ Registration is closed.
This challenge has already started.

Stay tuned for the next challenge on @BirrForex!
```

### Scenario D: New registration — Hybrid Challenge

**Step 1 — Bot shows type selection:**
```
🎯 BIRRFOREX TRADING CHALLENGE
BirrForex Challenge 16

This is a Hybrid Challenge — you can participate
with either a Demo or Real account.

⚠️ You can only compete in one category.

🏆 Real Account Category Prizes:
🥇 1st Place: $400
🥈 2nd Place: $350
🥉 3rd Place: $300

🏆 Demo Account Category Prizes:
🥇 1st Place: $200
🥈 2nd Place: $100
🥉 3rd Place: $50

Choose your category:

[🏦 Demo Account Challenge]
[💰 Real Account Challenge]
```

**Step 2 — User selects category → Bot asks for email:**
```
📧 Please send your Exness email address:
```

**Step 3 — User sends email → Bot verifies:**
```
⏳ Verifying your account...
```

#### If email verification succeeds:
```
✅ Email verified!

Now send your MT5 Real Account Number:
⚠️ Must be an MT5 trading account.
Only numeric account numbers accepted.
```

#### If NOT allocated (email not under BirrForex):
```
⚠️ Your Exness account is not registered under BirrForex.

First, make sure you spelled your email correctly.

✨ Option 1: Create a New Exness Account
🔗 [partner signup link]

🔄 Option 2: Change Your Partner to BirrForex
➡️ Log in → Live Chat → "Change Partner"
➡️ Paste: [partner change link]
📋 Full guide

After completing, try again:

[📧 Submit Email Again]
```

#### If KYC not verified:
```
❌ Your Exness account is not fully verified.

Please complete KYC:
➡️ Exness → Settings → Verification

Once verified, try again:

[📧 Submit Email Again]
```

#### If email already registered:
```
⚠️ This email is already registered for this challenge.

If you have another email, submit it below.
Contact @birrFXadmin if this is an error.

[📧 Submit Another Email]
```

**Step 4 — User sends account number (Real accounts) → Bot verifies allocation:**
```
⏳ Verifying account allocation...
```

#### If allocation OK → Bot shows server selection:
```
🖥️ Select your MT5 Trading Server:

[MT5Trial7] [MT5Trial8]
[MT5Trial9] [MT5Trial10]
[MT5Real7]  [MT5Real8]
[MT5Real9]  [MT5Real10]
... (more servers)
[✍️ Type Server Manually]
```

#### If account not MT5:
```
⚠️ This account is not MT5. Only MT5 accounts allowed.
Create a new MT5 Real account and try again.

[📝 Submit New Real Account]
```

#### If account not under BirrForex:
```
⚠️ This real account is not under BirrForex.
Create a new Real Account within your Exness and transfer funds there.

[📝 Submit New Real Account]
```

#### If account doesn't match email UID:
```
⚠️ This account does not belong to the email you registered with.

Send your correct MT5 Real Account Number:

[📝 Submit New Real Account]
```

**Step 5 — User selects server → Bot asks for investor password:**
```
🔑 Enter your Investor (Read-Only) Password

This allows view-only access to your MT5 account.
⚠️ NOT your master/trading password.

📋 How to get Investor Password (link)

Send your investor password:
```

**Step 6 — User sends password → Bot asks to confirm:**
```
🔑 Enter the investor password again to confirm:
```

#### If passwords don't match:
```
❌ Passwords don't match. Please enter your investor password again:
```

**Step 7 — User confirms password → VPS verification:**
```
⏳ Verifying MT5 connection...
This may take up to 30 seconds.
```

#### VPS Verification Results:

**Success — balance matches:**
```
✅ MT5 connection verified! Balance: $30.00 ✓

You're all set!
```

**Success — zero balance (real account):**
```
✅ MT5 connection verified!

⚠️ Your account balance is $0.00.

Please deposit before the challenge starts.
```

**Success — below starting balance:**
```
✅ MT5 connection verified!

ℹ️ Your balance is $15.00. The challenge starting balance is $30.

You can still participate — the target remains the same regardless of your starting point.

If you want to deposit more, do it before the challenge starts. After the challenge starts, any additional deposit will result in disqualification.
```

**Success — balance too high:**
```
❌ Balance Too High

Your account balance is $50.00 which exceeds the starting balance of $30.

Please withdraw or transfer funds so your balance is at or below $30, then try registering again.

This ensures fair competition for all participants.
```

**Success — Demo balance mismatch:**
```
❌ Balance Mismatch

Your demo account balance is $5000.00 but the challenge requires exactly $30.

Please set your balance to $30 and try again.

[📝 Submit Another Account]
```

**Failure — invalid credentials:**
```
❌ Connection failed — Invalid credentials

The investor password or account number/server combination is incorrect.

Please double-check:
• Account: 161584935
• Server: Exness-MT5Real21

Send your MT5 Real Account Number:
```

**Failure — server not found:**
```
❌ Server not found

The server "Exness-MT5Real99" could not be reached.

Please select the correct server:

[server buttons]
```

**Failure — timeout:**
```
⚠️ Connection timed out

The MT5 server took too long to respond. This can happen during high traffic.

Please try entering your investor password again:
```

**Account type not allowed (Pro/Raw/Zero):**
```
❌ Account Type Not Allowed

Your account is a Pro account. This challenge only accepts Standard or Standard Cent accounts.

📋 How to create a Standard Account:
1. Open Exness → My Accounts
2. Create New Account → Choose "Standard" or "Standard Cent"
3. Select MT5 platform
4. Fund the account

Once ready, submit your standard account:

[📝 Submit Another Account]
```

**Only Cent Accounts Allowed (challenge is cent-only, user has standard):**
```
❌ Only Cent Accounts Allowed

This challenge requires a Cent Account (currency: USC).

Your account appears to be a Standard account (currency: USD).

📋 How to create a Cent Account:
1. Open Exness → My Accounts
2. Create New Account → Choose "Standard Cent"
3. Select MT5 platform
4. Fund the account

Once ready, submit your cent account:

[📝 Submit Cent Account]
```

**Step 8 — After VPS passes → Bot asks for nickname:**
```
🏷️ Almost done! Choose a Challenge Nickname

This will be displayed on the leaderboard instead of your real name.
• 3-20 characters
• Letters, numbers, underscores only
• Must be unique

Send your nickname:
```

#### Nickname errors:
- Too short/long: `❌ Nickname must be 3-20 characters. Try again:`
- Invalid chars: `❌ Only letters, numbers, and underscores allowed. Try again:`
- Brand impersonation: `❌ You cannot use that nickname — it's too similar to our brand. Please choose a different nickname:`
- Already taken: `❌ "TraderX" is already taken. Choose a different nickname:`

**Step 9 — User sends valid nickname → Registration complete:**
```
✅ Registration Complete!

📋 Your Registration:
🏷️ Nickname: TraderX
📧 Email: user@example.com
🏦 Real Account: 161584935
🖥️ Server: Exness-MT5Real21
📊 Type: Real
🔑 Investor Password: ✅ Saved

⏳ Challenge starts: Jul 14, 2026, 12:00 AM

⚠️ IMPORTANT: Do NOT change your investor password until the challenge ends and winners are announced. We pull your trade data automatically — if we can't access your account, you risk disqualification.

⚠️ Please read the rules before starting the challenge!

You can change your account number before the challenge starts.

📄 Challenge Rules: Download PDF

[🔄 Change Account Number]
[🔀 Switch to Demo Account]
```

### Scenario E: Non-Hybrid (Demo-only or Real-only)

Same flow as above, but skips the type selection step. Goes straight to:
```
📧 Please send your Exness email address:
```

---

## 5. CHANNEL: Challenge Start

Posted automatically at the scheduled start time (with photo if available):

```
🚀 CHALLENGE HAS STARTED!

BirrForex Challenge 16 is officially LIVE! 🔥

The race begins NOW!

💪 Stay focused, follow the rules, and trade smart.
This is your journey — make every trade count!

Good luck, traders! 🍀

📄 Rules: Download PDF

@BirrForex
```

*(Posted to both Main Channel and Challenge Channel with a challengestart.jpg image)*

---

## 6. CHANNEL: Daily Posts

Posted on weekdays only. Morning at 08:00 EAT, Evening at 20:00 EAT.

### MORNING POSTS:

**Day 1 (both channels):**
```
📈 DAY 1 OF 10

BirrForex Challenge 16

Your first trading day! Make it count.
Plan your trades, manage your risk, and stay disciplined.

Every pip matters 🎯

📄 Rules: Download PDF

@BirrForex
```

**Day 2 (challenge channel only):**
```
📈 DAY 2 OF 10

BirrForex Challenge 16

New day, new opportunities!
Stay disciplined and stick to your strategy.

Consistency beats luck every time 🎯

📄 Rules: Download PDF

@BirrForex
```

**Day 3:**
```
📊 DAY 3 OF 10

BirrForex Challenge 16

Midweek momentum! Keep your eyes on the target.
Every pip counts towards your goal 🎯

Trade smart, not hard 💡
```

**Day 4:**
```
💪 DAY 4 OF 10

BirrForex Challenge 16

Almost through the first week!
Stay patient, protect your capital, and trust the process.

The best traders are the most disciplined ones 🏆
```

**Day 5:**
```
🏁 DAY 5 OF 10

BirrForex Challenge 16

Last trading day of Week 1!
Finish the week strong and set yourself up for Week 2.

Have a great weekend! 🌟
```

**Day 6 (both channels):**
```
🚀 WEEK 2 — DAY 6 OF 10

BirrForex Challenge 16

Welcome back! Week 2 is here.
5 more trading days to hit your target!

Stay focused and finish strong 💪
```

**Day 7:**
```
🔥 DAY 7 OF 10

BirrForex Challenge 16

Second week is heating up!
Review your trades, learn from mistakes, and adapt.

The market rewards those who stay sharp 📈
```

**Day 8:**
```
⚡ DAY 8 OF 10

BirrForex Challenge 16

Only 3 days left! The finish line is in sight.
Keep your risk tight and your mind focused.

Champions are made in the final stretch 🏆
```

**Day 9:**
```
🎯 DAY 9 OF 10

BirrForex Challenge 16

Tomorrow is the FINAL DAY!
Protect your gains and position yourself for a strong finish.

You've come this far — don't let up now 💪
```

**Day 10 (both channels):**
```
🏁 FINAL DAY!

BirrForex Challenge 16 — DAY 10 OF 10

This is it! Last trading day of the challenge.
Make it count and finish strong!

⚠️ Challenge closes tonight at 11:59 PM

Give it everything you've got! 🔥
```

---

### EVENING POSTS:

**Days 2, 3, 4, 6, 7, 8 (challenge channel only):**
```
🔥 DAY [WORD] IS ALMOST OVER

How was the Day, traders?

React below:
🔥 If you crushed it today!
😎 If it was decent, but there's room for more
👍 If you had a tough day, but still in the game
✍️ If you hit your daily drawdown

Let's keep pushing 💪

DON'T FORGET TO KEEP THE RULES!

📄 Rules: Download PDF

@BirrForex
```

**Day 5 (both channels):**
```
🔥 WEEK 1 IS ALMOST OVER!

How was the week, traders?

React below:
🔥 If you crushed it this week!
😎 If it was decent, but there's room for more
👍 If you had a tough week, but still in the game
✍️ If you hit your drawdown limit

Enjoy the weekend and come back stronger! 💪

DON'T FORGET — NO WEEKEND TRADING!

📄 Rules: Download PDF

@BirrForex
```

**Day 9 (challenge channel only):**
```
🔥 DAY NINE IS ALMOST OVER

How was the Day, traders?

React below:
🔥 If you crushed it today!
😎 If it was decent, but there's room for more
👍 If you had a tough day, but still in the game
✍️ If you hit your daily drawdown

TOMORROW IS THE FINAL DAY! 🏁

📄 Rules: Download PDF

@BirrForex
```

**Day 10 (both channels):**
```
⏰ CHALLENGE IS ALMOST OVER!

BirrForex Challenge 16

Wrap it up, traders!
The challenge closes in a few hours.

Make your final trades and secure your position.

⚠️ No trades after the challenge ends will be counted.

Good luck on your final trades! 🍀

📄 Rules: Download PDF

@BirrForex
```

---

## 7. CHANNEL: Challenge End

Posted at the scheduled end time. Two modes depending on `evaluation_type`:

### WinnerPip Mode (default — automatic evaluation):

```
🏁 CHALLENGE IS OVER!

BirrForex Challenge 16 has officially ended!

What an exciting race! We hope you all gained valuable experience and sharpened your trading skills throughout this challenge.

Thank you to every participant for your dedication and effort! 💪

📊 Final evaluation is in progress.

Our system is performing a final check on all trade data. Winners will be announced within 24 hours after the final data sync.

⏳ Stay tuned for the results! 🏆

@BirrForex
```

### Legacy Mode (manual evaluation with submission):

```
🏁 CHALLENGE IS OVER!

BirrForex Challenge 16 has officially ended!

What an exciting race! We hope you all gained valuable experience and sharpened your trading skills throughout this challenge.

Thank you to every participant for your dedication and effort! 💪

🎯 If you hit the target ($60), submit your details for evaluation!

⚠️ ONLY participants who reached the target balance should submit results.

➡️ You have 48 HOURS to submit your results
➡️ Click the button below to start your submission
➡️ Late submissions will NOT be accepted

⏰ Submission deadline: Friday, Jul 27, 2026, 11:59 PM

📋 How to get your Investor Password: Guide Link

[📋 Submit Results]
```

---

## 8. USER: Password Change Notification

When the VPS detects a credential failure during a pull cycle, the bot DMs the user:

```
⚠️ We cannot access your trading account.

Your investor password for account 161584935 appears to have changed or expired.

If you changed your password, please update it below so we can continue pulling your trade data:

[🔑 Update Investor Password]

⚠️ If you do not update your password within 48 hours, your account may be disqualified.
```

### User taps "Update Investor Password":

```
🔑 Please enter your new Investor (Read-Only) Password:
```

### User sends new password → Bot verifies:

```
⏳ Verifying new password...
```

#### Success:
```
✅ Password updated successfully!

Your account is now accessible again. We're pulling your full trade history now to backfill anything missed while access was down.

⚠️ Remember: Do NOT change your investor password again until the challenge ends.
```

#### Failure (wrong password):
```
❌ Connection failed — the password you entered is incorrect.

Please enter the correct Investor (Read-Only) Password:
```

#### Already disqualified (48h expired):
```
✅ Password updated and verified.

⚠️ However, this account was disqualified (password was not updated within the 48h window). A working password alone does not automatically reinstate it — please contact @birrFXadmin if you'd like to request reinstatement.
```

---

## 9. USER: Late Change / Switch / Retry

Admin can send `/chanceforlate` which opens a 6-hour window for users to:

### Change Account Number:

**Bot shows:**
```
🔄 Change Account Number

📋 Current: 161584935 (Exness-MT5Real21)

Send your new MT5 Real Account Number:
⚠️ Must be an MT5 trading account.
```
*(Then follows server → password → VPS verification → update confirmation)*

**On success:**
```
✅ Account updated successfully!

🏦 New Account: 287654321
🖥️ Server: Exness-MT5Real9
💰 Balance: $28.50

⚠️ IMPORTANT: Do NOT change your investor password until the challenge ends and winners are announced. We pull your trade data automatically — if we can't access your account, you will be disqualified.
```

### Switch Category (Demo → Real only):

**Bot shows:**
```
⚠️ Switch to Real Account?

Your current Demo registration will be deleted and you will need to register as a Real Account trader.

This cannot be undone.

[✅ Yes, Switch to Real]
[❌ Cancel]
```

### Retry Registration (for previously failed users):

**Bot shows:**
```
🔁 Retry Registration
BirrForex Challenge 16

Welcome back! Let's get you registered.

Choose your category:

[🏦 Demo Account Challenge]
[💰 Real Account Challenge]
```

### Window expired:
```
❌ This window has expired.

The change window is no longer available.
```

---

## 10. ADMIN: Winner Announcement

### Admin sends `/selectwinners`

*(Admin selects challenge, enters winner usernames, confirms)*

### Channel announcement (WinnerPip mode — posted by admin via admin panel "Announce" button):

Winners are posted to both channels. The exact format depends on the challenge type and number of winners, but follows this pattern:

```
🏆 CHALLENGE RESULTS

BirrForex Challenge 16 — WINNERS!

📊 Real Account Category:
🥇 1st Place: @TraderX — $400
   Balance: $68.50 | Profit: $38.50
🥈 2nd Place: @TraderY — $350
   Balance: $65.20 | Profit: $35.20
🥉 3rd Place: @TraderZ — $300
   Balance: $62.10 | Profit: $32.10

📊 Demo Account Category:
🥇 1st Place: @DemoKing — $200
🥈 2nd Place: @DemoAce — $100
🥉 3rd Place: @DemoPro — $50

Congratulations to all winners! 🎉

Thank you to all participants — you all showed incredible skill and dedication.

Stay tuned for the next challenge on @BirrForex!
```

### Winner DM:
```
🎉 Congratulations! You WON!

🏆 BirrForex Challenge 16

You placed 1st in the Real Account category!
💰 Prize: $400

Thank you for your incredible performance!

We will contact you shortly to arrange your prize.
```

### Qualified (not winner) DM:
```
📊 BirrForex Challenge 16 — Results

Your rank: #4 out of 85 participants

You qualified but didn't make it to the prize positions this time.

Keep trading and improving — you're almost there! 💪
```

### Non-qualified DM:
```
📊 BirrForex Challenge 16 — Results

Unfortunately you did not qualify for this challenge.

[violation details if any]

Don't give up! Learn from this experience and come back stronger for the next challenge.

@BirrForex
```

---

## NOTES

- All times are in **EAT (UTC+3)** — East Africa Time
- Messages use **HTML parse mode** (bold = `<b>`, italic = `<i>`)
- Buttons shown as `[Button Text]` are inline keyboard buttons
- Weekend posts are skipped (Saturday/Sunday)
- Pull cycles run 6x daily at 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 EAT
- The WinnerPip dashboard at winnerpip.com shows live data to users
- Discord-source challenges skip all Telegram channel posts

---

*Last updated: July 8, 2026*
