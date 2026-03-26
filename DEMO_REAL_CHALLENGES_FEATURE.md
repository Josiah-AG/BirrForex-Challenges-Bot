# Demo/Real Account Trading Challenges Feature

## Status: Discussion Phase (Updated v3)

---

## PHASE 1 — Admin Creates Challenge

### Command: /createtradingchallenge

```
Step 1: Challenge Type
Admin: /createtradingchallenge
Bot: Select challenge type:
[Demo] [Real] [Hybrid]

Step 1b: Challenge Title
Bot: Send the challenge title:
Admin: HYBRID CHALLENGE #15

Step 2: Winners Configuration
--- If Hybrid ---
Bot: How many Real account winners?
Admin: 3
Bot: Enter prizes for Real account winners (comma separated):
Admin: 400, 350, 300
Bot: How many Demo account winners?
Admin: 2
Bot: Enter prizes for Demo account winners (comma separated):
Admin: 200, 100

--- If Demo or Real only ---
Bot: How many winners?
Admin: 3
Bot: Enter prizes for each position (comma separated):
Admin: 400, 350, 300

Step 3: Challenge Period
Bot: Send the start date and time (Format: YYYY-MM-DD HH:MM):
Admin: 2026-03-20 09:00
Bot: Send the end date and time:
Admin: 2026-04-03 23:59

NOTE: Default = 2 weeks (10 working days Mon-Fri, Mon-Fri).

Step 4: Account Settings
Bot: What is the starting balance?
Admin: 30
Bot: What is the target balance?
Admin: 60

Step 5: Rules PDF (Optional)
Bot: Upload the rules PDF (or send /skip):
Admin: [uploads PDF or /skip]

Step 6: Explanatory Video (Optional)
Bot: Send the video link (or send /skip):
Admin: https://youtube.com/watch?v=xxxxx

Step 7: Confirmation
Bot:
✅ TRADING CHALLENGE SUMMARY

📋 Type: Hybrid
📅 Period: Mar 20, 2026 9:00 AM → Apr 3, 2026 11:59 PM
💰 Starting Balance: $30
🎯 Target: $60

🏆 Real Account Winners: 3
1st: $400 | 2nd: $350 | 3rd: $300

🏆 Demo Account Winners: 2
1st: $200 | 2nd: $100

📄 PDF: ✅ Uploaded (or ⏭️ Skipped)
🎥 Video: ✅ Linked (or ⏭️ Skipped)

[✅ Confirm & Create]
[❌ Cancel]
```

### After Confirm
- Challenge saved to database
- Announcement is NOT posted yet (admin posts manually with /postchallenge)
- Registration opens only after announcement is posted

### /updatechallenge — Edit PDF or Video Link

```
Admin: /updatechallenge
Bot: Select challenge:
[HYBRID CHALLENGE #15]

Bot: What do you want to update?
[📄 Replace Rules PDF]
[🎥 Replace Video Link]

--- Replace PDF ---
Bot: Upload the new rules PDF:
Admin: [uploads PDF]
Bot: ✅ Rules PDF updated!

--- Replace Video ---
Bot: Send the new video link:
Admin: https://youtube.com/watch?v=newlink
Bot: ✅ Video link updated!
```

This also works to ADD a PDF/video if it was skipped during creation.

---

## PHASE 2 — Challenge Announcement Post

NOT auto-posted. Admin triggers with `/postchallenge`.

```
Admin: /postchallenge
Bot: Select challenge:
[HYBRID CHALLENGE #15]
Bot: Post to:
[📢 Main Channel]
[🎯 Challenge Channel]
[📢 Both Channels]
Bot: ✅ Announcement posted!
```

### Exact Announcement Post:

```
<b>🎯 BIRRFOREX TRADING CHALLENGE</b>
<b>HYBRID CHALLENGE #15</b>

📊 <b>Type:</b> Hybrid (Demo & Real Account)
📅 <b>Period:</b> Mar 20 - Apr 3, 2026
💰 <b>Start:</b> $30 → 🎯 <b>Target:</b> $60

<b>🏆 PRIZES</b>

<b>Real Account:</b>
🥇 1st Place: $400
🥈 2nd Place: $350
🥉 3rd Place: $300

<b>Demo Account:</b>
🥇 1st Place: $200
🥈 2nd Place: $100

<b>🎁 BONUS</b>
➡️ All Real Account participants will be invited to join <b>BirrForex Live Trading Team</b>
➡️ Demo traders who hit the target will get an invitation to join <b>BirrForex Live Trading Team</b>

⚠️ <i>Please read the challenge rules carefully before you start the challenge!</i>

📄 Challenge Rules: <a href="pdf_link">Download PDF</a>
🎥 Challenge Guide: <a href="video_link">Watch Video</a>

[🚀 Join Challenge]
[💰 Open Exness Account]
```

KEY RULES:
- PDF and Video are text links in the post body (not buttons)
- Only 2 buttons stacked vertically
- "How to Join" and "After Challenge Ends" sections removed (rules PDF covers this)
- Registration opens when this post goes live
- All promo/countdown/daily posts also embed the PDF and video links

---

## PHASE 3 — Registration Flow

### Entry Point
- Registration ONLY via [🚀 Join Challenge] button on channel posts
- Bot does NOT respond to direct DMs with /register
- Direct DM: "👋 To join a trading challenge, please use the Join Challenge button on @BirrForex_Challenges"

### Step 1 — Account Type (Hybrid only)
```
Bot: 🎯 BIRRFOREX TRADING CHALLENGE
<b>HYBRID CHALLENGE #15</b>

Select your account type:

[Demo Account]
[Real Account]
```

### Step 2 — Email
```
Bot: 📧 Please send your Exness email address:
```

### Email Already Registered
```
Bot: ⚠️ This email is already registered for this challenge.

If you believe this is an error, please contact @birrFXadmin.
```

### Step 3 — API Verification
```
Bot: ⏳ Verifying your account...
```

### API Retry Logic

```
Attempt 1 fails:
Bot: ⚠️ System busy. Trying again in 3 seconds...

Attempt 2 fails:
Bot: ⚠️ System busy. Trying one more time in 3 seconds...

Attempt 3 fails:
Bot: ⚠️ System is currently busy.
Please try again after 30 minutes by tapping
"Join Challenge" on the channel post.

[🔄 Try Again]
```

If [🔄 Try Again] also fails 3 times → MANUAL VERIFICATION:
```
Bot: ⚠️ Automatic verification is temporarily unavailable.
We'll verify your account manually.

📧 Email: user@example.com
📊 Type: Demo

Please send your MT5 account number:
⚠️ It must be an MT5 trading account.
If you don't have one, create an MT5 account
within your Exness. Other account types are
not allowed.
User: 12345678

Bot: Please send your MT5 Trading Server:
Example: ExnessMT5Trial9 (demo) or ExnessMT5Real9 (real)
⚠️ Only MT5 servers are allowed.
User: ExnessMT5Trial9

Bot: 📸 Please upload a screenshot of your Exness account
showing your account is verified and active.
User: [uploads screenshot]

Bot: ✅ Submission received!
Your registration is pending manual review.
You'll be notified once approved.
```

Admin receives:
```
📋 MANUAL REVIEW REQUIRED

👤 User: @username (Telegram ID: 123456)
📧 Email: user@example.com
🏦 Account: 12345678
🖥️ Server: ExnessMT5Trial9
📊 Type: Demo
📸 Screenshot: [attached]

⚠️ Automatic verification failed — manual review needed

[✅ Approve]
[❌ Reject]
[💬 Reply to User]
```

### Allocation Check Failed

```
Bot: ⚠️ Your Exness account is not registered under BirrForex.

First, please make sure you spelled your email correctly.
If it was wrong, you can submit it again below.

If your email was correct, you have two options:

✨ Option 1: Create a New Exness Account
➡️ Open a new account using our partner link below
➡️ You can use a different email
➡️ Same phone number and documents can be reused
🔗 https://one.exnesstrack.org/boarding/sign-up/a/bqsuza6sq1/?campaign=32092

🔄 Option 2: Change Your Partner to BirrForex
➡️ Log in to your Exness account
➡️ Open Live Chat → Type "Change Partner"
➡️ Paste this link in the form:
   https://one.exnessonelink.com/a/bqsuza6sq1/?campaign=32092
➡️ Submit and verify with SMS code
➡️ Wait for confirmation (usually within 24 hours)

📋 Full guide: How to Change Partner on Exness
[link to guide]

After completing one of the options, try again:

[📧 Submit Email Again]
```

### KYC Check Failed

```
Bot: ❌ Your Exness account is not fully verified.

Please complete your KYC verification first:
➡️ Log in to your Exness Personal Area
➡️ Go to Settings → Verification
➡️ Upload your ID and proof of address
➡️ Wait for approval (usually a few minutes)

Once verified, try again:

[📧 Submit Email Again]
```

### Balance Check Failed (Real account only)

```
Bot: ❌ No positive equity found on your account.

For Real Account challenges, you need to have
funds deposited in your Exness account.

Please deposit funds and try again:

[📧 Submit Email Again]
```

### All Checks Pass → Account Number

#### Demo Account:
```
Bot: ✅ Email verified!

Now send your MT5 Demo Account Number:
⚠️ It must be an MT5 trading account.
Check if your account is MT5. If it is not,
please create an MT5 trading account within
your Exness. Other account types are not allowed.
```
User: 12345678

```
Bot: Please send your MT5 Trading Server:
Example: ExnessMT5Trial9
⚠️ Only MT5 servers are allowed.
```
User: ExnessMT5Trial9

→ Registration saved (see confirmation below)

#### Real Account:
```
Bot: ✅ Email verified!

Now send your MT5 Real Account Number:
⚠️ It must be an MT5 trading account.
Check if your account is MT5. If it is not,
please create an MT5 trading account within
your Exness. Other account types are not allowed.
```
User: 87654321

```
Bot: Please send your MT5 Trading Server:
Example: ExnessMT5Real9
⚠️ Only MT5 servers are allowed.
```
User: ExnessMT5Real9

```
Bot: ⏳ Verifying your real account...
```

Bot checks via `GET /api/reports/clients/accounts/?client_account={number}`:
1. Is this account allocated under BirrForex? (`data` array not empty)
2. Is this account MT5? (`platform === "mt5"`)
(Same API retry protocol as email check)

#### Real Account NOT Allocated:
```
Bot: ⚠️ This real account is not under BirrForex.

Please create a new Real Account within your Exness
(not a new Exness account — a new Real trading account
within your existing Exness) and transfer your funds there.

Make sure the new real account is under the email
you used for registration.

[📝 Submit New Real Account]
```

User taps [📝 Submit New Real Account] → bot asks for new account number + server → checks again.

If still not allocated:
```
Bot: ⚠️ This account is still not under BirrForex.

Please come back after 15 minutes and try again.
It may take a few minutes for the new account
to be linked.

Make sure the real account you submitted is under
the email you used for registration.

[📝 Submit New Real Account]
```

After 15 min retry, if still not allocated → same message repeats.
User keeps retrying until account is properly allocated.

#### Real Account Allocated but NOT MT5:
```
Bot: ⚠️ This account is not an MT5 trading account.

Only MT5 accounts are allowed for this challenge.
Please create a new MT5 Real trading account within
your Exness and transfer your funds there.

[📝 Submit New Real Account]
```

User taps [📝 Submit New Real Account] → bot asks for new account number + server → checks again.

If new account is allocated but still not MT5 → same message repeats.

If new account is MT5 but NOT allocated:
```
Bot: ⚠️ This account is not yet under BirrForex.

It may take a few minutes for a newly created account
to be linked. Please come back after 15 minutes
and try again.

Make sure the real account you submitted is under
the email you used for registration.

[📝 Submit New Real Account]
```

#### Real Account Allocated ✅ + MT5 ✅ → Registration saved

### Registration Confirmed (Demo)

```
Bot: ✅ <b>Registration Complete!</b>

📋 <b>Your Registration:</b>
📧 <b>Email:</b> user@example.com
🏦 <b>Demo Account:</b> 12345678
🖥️ <b>Server:</b> ExnessMT5Trial9
📊 <b>Type:</b> Demo

⏳ <b>Challenge starts:</b> Mar 20, 2026 9:00 AM

⚠️ <i>Please read the rules and understand them well
before starting the challenge!</i>

You can change your account number before the
challenge starts if you need to.

💡 Want to compete in the <b>Real Account</b> category
instead? Use the switch button below.

📄 Challenge Rules: <a href="pdf_link">Download PDF</a>
🎥 Challenge Guide: <a href="video_link">Watch Video</a>

[🔄 Change Account Number]
[🔀 Switch to Real Account]
```

### Registration Confirmed (Real)

```
Bot: ✅ <b>Registration Complete!</b>

📋 <b>Your Registration:</b>
📧 <b>Email:</b> user@example.com
🏦 <b>Real Account:</b> 87654321
🖥️ <b>Server:</b> ExnessMT5Real9
📊 <b>Type:</b> Real

⏳ <b>Challenge starts:</b> Mar 20, 2026 9:00 AM

⚠️ <i>Please read the rules and understand them well
before starting the challenge!</i>

You can change your account number before the
challenge starts if you need to.

📄 Challenge Rules: <a href="pdf_link">Download PDF</a>
🎥 Challenge Guide: <a href="video_link">Watch Video</a>

[🔄 Change Account Number]
[🔀 Switch to Demo Account]
```

NOTE: [🔀 Switch] button only shown in Hybrid challenges.
In demo-only or real-only challenges, only [� Change Account Number] is shown.

### Switch Category (Hybrid only, before challenge starts)

```
User taps [🔀 Switch to Real Account]

Bot: ⚠️ Are you sure you want to switch to Real Account?

If you proceed, your current Demo registration will
be deleted and you will need to register again as
a Real Account trader.

[✅ Yes, Switch]
[❌ Cancel]
```

User taps [✅ Yes, Switch]:
- Previous registration deleted from database
- Bot restarts registration flow from account type selection
- User goes through Real account registration (email already verified, but real account allocation check still needed)

After challenge starts:
```
Bot: ❌ Challenge has started. Changes are no longer allowed.
```

### Change Account Number (Before challenge starts)

```
User taps [🔄 Change Account Number]

Bot: Send your new MT5 [Demo/Real] Account Number:
⚠️ Must be an MT5 trading account.
User: 99887766

Bot: Send your MT5 Trading Server:
User: ExnessMT5Trial9
```

For Real accounts: bot re-checks allocation of new account (same flow as above).

```
Bot: ✅ Account number updated!

📋 Updated Registration:
📧 Email: user@example.com
🏦 Demo Account: 99887766
🖥️ Server: ExnessMT5Trial9
📊 Type: Demo

[🔄 Change Account Number]
[🔀 Switch to Real Account]
```

### Change Account Number (After challenge starts)

```
Bot: ❌ Challenge has started. Changes are no longer allowed.
```

### Already Registered

```
Bot: ✅ You are already registered for this challenge!

📋 Your Registration:
📧 Email: user@example.com
🏦 Demo Account: 12345678
🖥️ Server: ExnessMT5Trial9
📊 Type: Demo

[🔄 Change Account Number]
[🔀 Switch to Real Account]
```

### Registration Closed

```
Bot: ❌ Registration is closed.
This challenge has already started.

Stay tuned for the next challenge on @BirrForex!
```

### User DMs Bot Directly

```
Bot: 👋 To join a trading challenge, please use the
"Join Challenge" button on the channel post.

📢 @BirrForex_Challenges
```

### /unregister — Admin Removes a Registration

```
Admin: /unregister
Bot: Enter username or email to remove:
Admin: @john (or john@example.com)

Bot: Found registration:
👤 @john
📧 john@example.com
🏦 Account: 12345678
📊 Type: Demo

[✅ Confirm Remove]
[❌ Cancel]

Admin: [✅ Confirm Remove]
Bot: ✅ Registration removed.
User has been notified.
```

User receives:
```
⚠️ Your registration for HYBRID CHALLENGE #15 has been
removed by an administrator.

If you believe this is an error, please contact @birrFXadmin.
```

---

## PHASE 4 — Pre-Challenge Countdown Posts

All countdown posts include PDF + video links and 2 buttons.
Posted to BOTH channels. Triggered automatically.

### 3 Days Before Start

```
<b>⏰ 3 DAYS REMAINING!</b>

<b>HYBRID CHALLENGE #15</b> starts in <b>3 days!</b>

📅 <b>Start:</b> Mar 20, 2026 9:00 AM
💰 $30 → 🎯 $60

Haven't registered yet? Don't miss out!

📄 Challenge Rules: <a href="pdf_link">Download PDF</a>
🎥 Challenge Guide: <a href="video_link">Watch Video</a>

[🚀 Join Challenge]
[💰 Open Exness Account]
```

### 2 Days Before Start

```
<b>⏰ 2 DAYS REMAINING!</b>

<b>HYBRID CHALLENGE #15</b> starts in <b>2 days!</b>

📅 <b>Start:</b> Mar 20, 2026 9:00 AM
💰 $30 → 🎯 $60

Time is running out to register!

📄 Challenge Rules: <a href="pdf_link">Download PDF</a>
🎥 Challenge Guide: <a href="video_link">Watch Video</a>

[🚀 Join Challenge]
[💰 Open Exness Account]
```

### 1 Day Before Start

```
<b>🚨 LAST CHANCE TO REGISTER!</b>

<b>HYBRID CHALLENGE #15</b> starts <b>TOMORROW!</b>

📅 <b>Start:</b> Mar 20, 2026 9:00 AM
💰 $30 → 🎯 $60

After the challenge starts, registration closes
and no more entries will be accepted.

Don't miss out — register <b>NOW!</b> 🚀

📄 Challenge Rules: <a href="pdf_link">Download PDF</a>
🎥 Challenge Guide: <a href="video_link">Watch Video</a>

[🚀 Join Challenge]
[💰 Open Exness Account]
```

---

## PHASE 5 — During Challenge (Daily Automated Posts)

### Schedule
- Morning posts: 8:00 AM EAT (weekdays)
- Evening posts: 8:00 PM EAT (weekdays)
- Day 1 morning + Day 6 morning: BOTH channels
- Day 5 evening + Day 10 morning + Day 10 evening: BOTH channels
- All other posts: Challenge channel only
- Weekend: No posts
- All posts embed PDF + video links

### Day 1 (Monday, Week 1) — Morning on BOTH channels

```
<b>🚀 CHALLENGE HAS STARTED!</b>

<b>HYBRID CHALLENGE #15</b> is officially <b>LIVE!</b>

<b>Day 1 of 10</b>

💪 Stay focused, follow the rules, and trade smart.
This is your journey — make every trade count!

<i>Good luck, traders!</i> 🍀

📄 Challenge Rules: <a href="pdf_link">Download PDF</a>
🎥 Challenge Guide: <a href="video_link">Watch Video</a>

@BirrForex
```

### Day 1 — Evening (8:00 PM EAT) — Challenge channel

```
<b>🔥 DAY ONE IS ALMOST OVER</b>

How was the Day, traders?

React below:
🔥 If you crushed it today!
😎 If it was decent, but there's room for more
👍 If you had a tough day, but still in the game
✍️ If you hit your daily drawdown

Let's keep pushing 💪

<b>DON'T FORGET TO KEEP THE RULES!</b>

📄 Rules: <a href="pdf_link">Download PDF</a>

@BirrForex
```

### Day 2 (Tuesday) — Challenge channel only

Morning:
```
<b>📈 DAY 2 OF 10</b>

<b>HYBRID CHALLENGE #15</b>

New day, new opportunities!
Stay disciplined and stick to your strategy.

<i>Consistency beats luck every time</i> 🎯

📄 Rules: <a href="pdf_link">Download PDF</a>
🎥 Guide: <a href="video_link">Watch Video</a>

@BirrForex
```

Evening:
```
<b>🔥 DAY TWO IS ALMOST OVER</b>

How was the Day, traders?

React below:
🔥 If you crushed it today!
😎 If it was decent, but there's room for more
👍 If you had a tough day, but still in the game
✍️ If you hit your daily drawdown

Let's keep pushing 💪

<b>DON'T FORGET TO KEEP THE RULES!</b>

📄 Rules: <a href="pdf_link">Download PDF</a>

@BirrForex
```

### Day 3 (Wednesday) — Challenge channel only

Morning:
```
<b>📊 DAY 3 OF 10</b>

<b>HYBRID CHALLENGE #15</b>

<i>Midweek momentum! Keep your eyes on the target.
Every pip counts towards your goal</i> 🎯

<i>Trade smart, not hard</i> 💡

📄 Rules: <a href="pdf_link">Download PDF</a>
🎥 Guide: <a href="video_link">Watch Video</a>

@BirrForex
```

Evening:
```
<b>🔥 DAY THREE IS ALMOST OVER</b>

How was the Day, traders?

React below:
🔥 If you crushed it today!
😎 If it was decent, but there's room for more
👍 If you had a tough day, but still in the game
✍️ If you hit your daily drawdown

Let's keep pushing 💪

<b>DON'T FORGET TO KEEP THE RULES!</b>

📄 Rules: <a href="pdf_link">Download PDF</a>

@BirrForex
```

### Day 4 (Thursday) — Challenge channel only

Morning:
```
<b>💪 DAY 4 OF 10</b>

<b>HYBRID CHALLENGE #15</b>

Almost through the first week!
Stay patient, protect your capital, and trust the process.

<i>The best traders are the most disciplined ones</i> 🏆

📄 Rules: <a href="pdf_link">Download PDF</a>
🎥 Guide: <a href="video_link">Watch Video</a>

@BirrForex
```

Evening:
```
<b>🔥 DAY FOUR IS ALMOST OVER</b>

How was the Day, traders?

React below:
🔥 If you crushed it today!
😎 If it was decent, but there's room for more
👍 If you had a tough day, but still in the game
✍️ If you hit your daily drawdown

Let's keep pushing 💪

<b>DON'T FORGET TO KEEP THE RULES!</b>

📄 Rules: <a href="pdf_link">Download PDF</a>

@BirrForex
```

### Day 5 (Friday, Week 1)

Morning — Challenge channel only:
```
<b>🏁 DAY 5 OF 10</b>

<b>HYBRID CHALLENGE #15</b>

Last trading day of Week 1!
Finish the week strong and set yourself up for Week 2.

<i>Have a great weekend!</i> 🌟

📄 Rules: <a href="pdf_link">Download PDF</a>
🎥 Guide: <a href="video_link">Watch Video</a>

@BirrForex
```

Evening (8:00 PM EAT) — BOTH channels:
```
<b>🔥 WEEK 1 IS ALMOST OVER!</b>

How was the week, traders?

React below:
🔥 If you crushed it this week!
😎 If it was decent, but there's room for more
👍 If you had a tough week, but still in the game
✍️ If you hit your drawdown limit

Enjoy the weekend and come back stronger! 💪

<b>DON'T FORGET — NO WEEKEND TRADING!</b>

📄 Rules: <a href="pdf_link">Download PDF</a>

@BirrForex
```

### Weekend (Sat-Sun) — No posts

### Day 6 / Week 2, Day 1 (Monday) — Morning on BOTH channels

```
<b>🚀 WEEK 2 — DAY 6 OF 10</b>

<b>HYBRID CHALLENGE #15</b>

Welcome back! Week 2 is here.
5 more trading days to hit your target!

<i>Stay focused and finish strong</i> 💪

📄 Rules: <a href="pdf_link">Download PDF</a>
🎥 Guide: <a href="video_link">Watch Video</a>

@BirrForex
```

Evening — Challenge channel:
```
<b>🔥 DAY SIX IS ALMOST OVER</b>

How was the Day, traders?

React below:
🔥 If you crushed it today!
😎 If it was decent, but there's room for more
👍 If you had a tough day, but still in the game
✍️ If you hit your daily drawdown

Let's keep pushing 💪

<b>DON'T FORGET TO KEEP THE RULES!</b>

📄 Rules: <a href="pdf_link">Download PDF</a>

@BirrForex
```

### Day 7 (Tuesday, Week 2) — Challenge channel only

Morning:
```
<b>🔥 DAY 7 OF 10</b>

<b>HYBRID CHALLENGE #15</b>

Second week is heating up!
Review your trades, learn from mistakes, and adapt.

<i>The market rewards those who stay sharp</i> 📈

📄 Rules: <a href="pdf_link">Download PDF</a>
🎥 Guide: <a href="video_link">Watch Video</a>

@BirrForex
```

Evening:
```
<b>🔥 DAY SEVEN IS ALMOST OVER</b>

How was the Day, traders?

React below:
🔥 If you crushed it today!
😎 If it was decent, but there's room for more
👍 If you had a tough day, but still in the game
✍️ If you hit your daily drawdown

Let's keep pushing 💪

<b>DON'T FORGET TO KEEP THE RULES!</b>

📄 Rules: <a href="pdf_link">Download PDF</a>

@BirrForex
```

### Day 8 (Wednesday, Week 2) — Challenge channel only

Morning:
```
<b>⚡ DAY 8 OF 10</b>

<b>HYBRID CHALLENGE #15</b>

Only 3 days left! The finish line is in sight.
Keep your risk tight and your mind focused.

<i>Champions are made in the final stretch</i> 💡

📄 Rules: <a href="pdf_link">Download PDF</a>
🎥 Guide: <a href="video_link">Watch Video</a>

@BirrForex
```

Evening:
```
<b>🔥 DAY EIGHT IS ALMOST OVER</b>

How was the Day, traders?

React below:
🔥 If you crushed it today!
😎 If it was decent, but there's room for more
👍 If you had a tough day, but still in the game
✍️ If you hit your daily drawdown

Let's keep pushing 💪

<b>DON'T FORGET TO KEEP THE RULES!</b>

📄 Rules: <a href="pdf_link">Download PDF</a>

@BirrForex
```

### Day 9 (Thursday, Week 2) — Challenge channel only

Morning:
```
<b>🎯 DAY 9 OF 10</b>

<b>HYBRID CHALLENGE #15</b>

Tomorrow is the FINAL DAY!
Protect your gains and position yourself for a strong finish.

You've come this far — don't let up now 💪

📄 Rules: <a href="pdf_link">Download PDF</a>
🎥 Guide: <a href="video_link">Watch Video</a>

@BirrForex
```

Evening:
```
<b>🔥 DAY NINE IS ALMOST OVER</b>

How was the Day, traders?

React below:
🔥 If you crushed it today!
😎 If it was decent, but there's room for more
👍 If you had a tough day, but still in the game
✍️ If you hit your daily drawdown

<b>TOMORROW IS THE FINAL DAY!</b> 🏁

📄 Rules: <a href="pdf_link">Download PDF</a>

@BirrForex
```

### Day 10 (Friday, Week 2 — FINAL DAY)

Morning — BOTH channels:
```
<b>🏁 FINAL DAY!</b>

<b>HYBRID CHALLENGE #15</b> — <b>DAY 10 OF 10</b>

This is it! Last trading day of the challenge.
Make it count and finish strong!

⚠️ <b>Challenge closes tonight at 11:59 PM</b>

Give it everything you've got! 🔥

📄 Rules: <a href="pdf_link">Download PDF</a>
🎥 Guide: <a href="video_link">Watch Video</a>

@BirrForex
```

Evening (8:00 PM EAT) — BOTH channels:
```
<b>⏰ CHALLENGE IS ALMOST OVER!</b>

<b>HYBRID CHALLENGE #15</b>

Wrap it up, traders!
The challenge closes in a few hours.

Make your final trades and secure your position.

⚠️ <b>No trades after the challenge ends will be counted.</b>

<i>Good luck on your final trades!</i> 🍀

📄 Rules: <a href="pdf_link">Download PDF</a>

@BirrForex
```

---

## PHASE 6 — Challenge Ends (Saturday 12:00 AM)

Auto-posted to BOTH channels:

```
<b>🏁 CHALLENGE IS OVER!</b>

<b>HYBRID CHALLENGE #15</b> has officially ended!

What an exciting race! We hope you all gained valuable
experience and sharpened your trading skills throughout
this challenge.

<i>Thank you to every participant for your dedication
and effort!</i> 💪

🎯 <b>If you hit the target ($60), submit your details
for evaluation!</b>

⚠️ <b>ONLY</b> participants who reached the target balance
should submit results.

➡️ You have <b>48 HOURS</b> to submit your results
➡️ Click the button below to start your submission
➡️ Late submissions will <b>NOT</b> be accepted

⏰ <b>Submission deadline:</b> Monday, [date], 12:00 AM

📋 How to get your Investor Password: <a href="investor_password_guide_link">Guide Link</a>

[📋 Submit Results]
```

### Submission Deadline Closed (Auto-posted after 48 hours — BOTH channels)

```
<b>⏰ SUBMISSION DEADLINE HAS ENDED</b>

The 48-hour submission window for
<b>HYBRID CHALLENGE #15</b> is now closed.

<b>No further submissions will be accepted.</b>

Our team will now review all submissions
and announce the results soon.

<i>Thank you for your patience!</i> 🙏

@BirrForex
```

---

## PHASE 7 — Results Submission (48-Hour Window)

### User taps [📋 Submit Results]

#### Step 1 — Email Verification
```
Bot: 📧 Please enter your Exness email to verify your identity:
```

If email NOT found in registrations:
```
Bot: ❌ This email is not registered for this challenge.
Only registered participants can submit results.
```

If email belongs to a different Telegram user:
```
Bot: ❌ This email is registered under a different account.
Please use the Telegram account you registered with.
```

If email matches:

#### Step 2 — Final Balance
```
Bot: ✅ Identity verified!

💰 What is your final account balance?
(Enter the number only, e.g., 67.50)
```

If balance is below target:
```
Bot: ❌ Sorry, the target for this challenge is $60.

Your balance of $45.00 has not reached the target.
Only participants who hit the target can submit results.

Better luck next time! 💪
```

If balance meets or exceeds target:

#### Step 3 — Balance Screenshot
```
Bot: 📸 Upload a screenshot of your final balance.
Make sure it clearly shows:
➡️ Account number
➡️ Final balance/equity
```

#### Step 4 — Investor Password
```
Bot: 🔑 Enter your Investor (Read-Only) password:
This allows view-only access to your trading account.

📋 Don't know how to get it?
[How to Get Investor Password](investor_password_guide_link)
```

#### Step 5 — Confirm Password
```
Bot: 🔑 Please enter the password again to confirm:
```

If mismatch:
```
Bot: ❌ Passwords don't match. Please try again.
🔑 Enter your Investor (Read-Only) password:
```

#### Step 6 — Confirmation
```
Bot: ✅ Results Submitted Successfully!

📋 Your Submission:
📧 Email: user@example.com
🏦 Account: 12345678
🖥️ Server: ExnessMT5Trial9
📊 Type: Demo
💰 Final Balance: $67.50
📸 Screenshot: ✅ Received
🔑 Password: ✅ Saved

⏳ Our team will review your account and announce results.
Thank you for participating! 🎉
```

### After 48 hours:
```
Bot: ❌ Submission deadline has passed.
Late submissions are not accepted.
```

---

## PHASE 8 — Admin Report (Auto-generated after 48 hours)

```
<b>📊 TRADING CHALLENGE REPORT</b>
<b>HYBRID CHALLENGE #15</b>

📅 <b>Period:</b> Mar 20 - Apr 3, 2026
📊 <b>Type:</b> Hybrid (Demo & Real)
👥 <b>Total Registered:</b> 45 (Real: 20 | Demo: 25)
📋 <b>Total Submissions:</b> 12 (Real: 5 | Demo: 7)

📎 <i>Downloadable report attached below</i>

⏳ Review accounts and select winners using:
/selectwinners
```

CSV contains (sorted by balance desc, separated by category):

| # | Username | Email | Type | Account # | Server | Investor Password | Final Balance | Screenshot |
|---|----------|-------|------|-----------|--------|-------------------|---------------|------------|

---

## PHASE 9 — Admin Review (Manual)

- Team logs into MT5 with investor passwords
- Checks trade history against rules
- `/messageuser` for additional info
- `/disqualify` for rule breakers

### /messageuser — Admin types username directly

```
Admin: /messageuser
Bot: Select challenge:
[HYBRID CHALLENGE #15]
Bot: Enter the username of the participant:
Admin: @john

Bot: Type your message:
Admin: We need a screenshot of your trade history.

Bot: ✅ Message sent to @john
```

User receives:
```
📩 MESSAGE FROM BIRRFOREX CHALLENGE TEAM

Regarding: HYBRID CHALLENGE #15

We need a screenshot of your trade history.

⚠️ Please reply to @birrFXadmin with the requested
information. Include a screenshot of this message.
```

### /disqualify

```
Admin: /disqualify
Bot: Select challenge:
[HYBRID CHALLENGE #15]
Bot: Enter the username:
Admin: @john
Bot: Enter reason:
Admin: Related accounts found

Bot: ✅ User disqualified. User notified.
```

User receives:
```
❌ DISQUALIFIED

You have been disqualified from HYBRID CHALLENGE #15.

Reason: Related accounts found

If you believe this is an error, please contact @birrFXadmin.
```

---

## PHASE 10 — Winner Selection

Admin types usernames directly (no list selection).

```
Admin: /selectwinners
Bot: Select challenge:
[HYBRID CHALLENGE #15]

Bot: 📊 REAL ACCOUNT SUBMISSIONS (by balance):
1. @john - $89.50
2. @jane - $78.20
3. @bob - $72.10

Enter Real account winner usernames (comma separated):
Admin: @john, @jane, @bob

Bot: 📊 DEMO ACCOUNT SUBMISSIONS (by balance):
1. @alice - $85.00
2. @charlie - $71.30

Enter Demo account winner usernames:
Admin: @alice, @charlie

Bot: ✅ WINNERS SELECTED

🏆 Real Account:
🥇 1st: @john - $89.50 - Prize: $400
🥈 2nd: @jane - $78.20 - Prize: $350
🥉 3rd: @bob - $72.10 - Prize: $300

🏆 Demo Account:
🥇 1st: @alice - $85.00 - Prize: $200
🥈 2nd: @charlie - $71.30 - Prize: $100

[✅ Confirm & Announce]
[❌ Cancel]
```

---

## PHASE 11 — Winner Announcement

### Channel Post (BOTH channels)

```
<b>🏆 TRADING CHALLENGE RESULTS 🏆</b>
<b>HYBRID CHALLENGE #15</b>

📅 <b>Period:</b> Mar 20 - Apr 3, 2026

<b>🏆 REAL ACCOUNT WINNERS</b>

🥇 <b>1st Place:</b> @john - $89.50 → <b>Prize: $400</b>
🥈 <b>2nd Place:</b> @jane - $78.20 → <b>Prize: $350</b>
🥉 <b>3rd Place:</b> @bob - $72.10 → <b>Prize: $300</b>

<b>🏆 DEMO ACCOUNT WINNERS</b>

🥇 <b>1st Place:</b> @alice - $85.00 → <b>Prize: $200</b>
🥈 <b>2nd Place:</b> @charlie - $71.30 → <b>Prize: $100</b>

<b>🎁 BONUS</b>
➡️ All Real Account participants are invited to join <b>BirrForex Live Trading Team</b>
➡️ Demo traders who hit the target are invited to join <b>BirrForex Live Trading Team</b>

👥 <b>Total Participants:</b> 45 (Real: 20 | Demo: 25)
📋 <b>Submissions Received:</b> 12 (Real: 5 | Demo: 7)

<i>Congratulations to all winners!</i> 🎉
<i>Thank you to everyone who participated!</i>

Stay tuned for the next challenge on <b>@BirrForex</b>
```

### Private DM to Each Winner

```
<b>🏆 CONGRATULATIONS! 🏆</b>

You won <b>1st Place</b> in <b>HYBRID CHALLENGE #15!</b>

📊 <b>Your Results:</b>
💰 <b>Final Balance:</b> $89.50
🏦 <b>Account:</b> 12345678
📊 <b>Type:</b> Real Account

🎁 <b>Your Prize: $400</b>

📸 <b>TO CLAIM YOUR PRIZE:</b>
DM <b>@birrFXadmin</b> with a screenshot of this message
within <b>24 HOURS.</b>

⚠️ <i>Prize must be claimed within 24 HOURS</i>

<i>Thank you for participating and congratulations!</i> 🎉
```

---

## PHASE 12 — Prize Distribution (Manual)

- Winner DMs @birrFXadmin with screenshot
- Admin verifies and sends prize
- Challenge complete

---

## PROMO MESSAGES FEATURE

### /promo Command — 3 Pre-installed Messages

```
Admin: /promo
Bot: Select promo message:
[1️⃣ Challenge Awareness]
[2️⃣ Registration Push]
[3️⃣ Deadline Approaching]

Bot: Post to:
[📢 Main Channel]
[🎯 Challenge Channel]
[📢 Both Channels]

Bot: ✅ Promo posted!
```

#### Promo 1 — Challenge Awareness
```
<b>🎯 BIRRFOREX TRADING CHALLENGE IS HERE!</b>

<b>HYBRID CHALLENGE #15</b>

💰 Start with <b>$30</b> → 🎯 Hit <b>$60</b>
🏆 Win up to <b>$400!</b>

📅 <b>Challenge Period:</b> Mar 20 - Apr 3, 2026

Open to Demo & Real account traders!
Register now and show your trading skills 💪

📄 Challenge Rules: <a href="pdf_link">Download PDF</a>
🎥 Challenge Guide: <a href="video_link">Watch Video</a>

[🚀 Join Challenge]
[💰 Open Exness Account]
```

#### Promo 2 — Registration Push
```
<b>📢 HAVE YOU REGISTERED YET?</b>

<b>HYBRID CHALLENGE #15</b> is coming up!

🏆 <b>Real Account Prizes:</b> $400 / $350 / $300
🏆 <b>Demo Account Prizes:</b> $200 / $100

Registration is <b>FREE</b> and takes 2 minutes!

Don't miss your chance to compete 🔥

📄 Challenge Rules: <a href="pdf_link">Download PDF</a>
🎥 Challenge Guide: <a href="video_link">Watch Video</a>

[🚀 Join Challenge]
[💰 Open Exness Account]
```

#### Promo 3 — Deadline Approaching
```
<b>⏰ DEADLINE IS APPROACHING!</b>

<b>HYBRID CHALLENGE #15</b> registration is closing soon!

📅 <b>Start:</b> Mar 20, 2026 9:00 AM

After the challenge starts, registration closes.
Don't wait until the last minute!

Secure your spot <b>NOW</b> 🚀

📄 Challenge Rules: <a href="pdf_link">Download PDF</a>
🎥 Challenge Guide: <a href="video_link">Watch Video</a>

[🚀 Join Challenge]
[💰 Open Exness Account]
```

All promo messages include PDF + video links and 2 buttons stacked vertically.

---

## FLOW DIAGRAM — Registration to End

```
┌─────────────────────────────────────────────────────────────────┐
│                    ADMIN CREATES CHALLENGE                       │
│                  /createtradingchallenge                         │
│            (saved to DB, NOT posted yet)                         │
└──────────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              ADMIN POSTS ANNOUNCEMENT                             │
│                  /postchallenge                                   │
│         [🚀 Join Challenge]  [💰 Open Exness Account]           │
│         Registration opens                                       │
└──────────────────────────┬──────────────────────────────────────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    3 Days Before  2 Days Before  1 Day Before
    Countdown      Countdown      "Deadline
                                   Approaching"
         └────────────┼────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              USER TAPS [🚀 Join Challenge]                       │
└──────────────────────────┬──────────────────────────────────────┘
                      │
    ┌─────────────────┼─────────────────┐
    ▼                 ▼                 ▼
    Closed?           Already reg?      Open → proceed
    "Registration      "Already           │
is closed"        registered!"       │
                  [🔄 Change]        │
                                     ▼
                             ┌───────────────┐
                             │ Type? (hybrid) │
                             │ [Demo] [Real]  │
                             └───────┬───────┘
                                     │
                                     ▼
                             ┌───────────────┐
                             │  Enter Email   │
                             └───────┬───────┘
                                     │
                         ┌───────────┼───────────┐
                         ▼           ▼           ▼
                    Already      API verify   Email OK
                    registered   (3 retries)     │
                    "Email        │              │
                     already      ▼              │
                     registered"  Fail→30min     │
                                  →manual        │
                                  fallback       │
                                     │           │
                         ┌───────────┼───────────┘
                         ▼           ▼
                    ALLOCATION   ALLOCATION ✅
                    FAILED       KYC ✅
                    "Not under   Balance ✅ (real)
                     BirrForex"      │
                    [📧 Submit       │
                     Email Again]    │
                         │           ▼
                         │   ┌───────────────────┐
                         │   │ Enter MT5 Acct #   │
                         │   │ Enter MT5 Server   │
                         │   └───────┬───────────┘
                         │           │
                         │     (Real only: check
                         │      acct allocation)
                         │           │
                         │     ┌─────┼─────┐
                         │     ▼           ▼
                         │  Allocated   Not allocated
                         │     ✅       "Create new
                         │     │         real acct"
                         │     │        [📝 Submit
                         │     │         New Real Acct]
                         │     │         (retry loop)
                         │     │
                         │     ▼
                         │  ┌──────────────────────┐
                         │  │ ✅ REGISTERED          │
                         │  │ Rules PDF + Video     │
                         │  │ [🔄 Change Account #] │
                         │  └──────────┬───────────┘
                         │             │
                         └─────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CHALLENGE STARTS                               │
│              Registration closes                                 │
│              Daily posts begin (10 working days)                 │
│                                                                  │
│  Week 1: Day 1-5 (Mon-Fri)                                     │
│    8AM: morning motivational post                                │
│    8PM: evening reaction poll                                    │
│    Day 1 AM: BOTH channels                                      │
│    Day 5 PM: "Week 1 almost over" BOTH channels                │
│                                                                  │
│  Weekend: No posts, no trading                                   │
│                                                                  │
│  Week 2: Day 6-10 (Mon-Fri)                                    │
│    Day 6 AM: "Week 2" BOTH channels                             │
│    Day 10 AM: "FINAL DAY" BOTH channels                         │
│    Day 10 PM: "Wrap it up" BOTH channels                        │
└──────────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              CHALLENGE ENDS (Saturday 12:00 AM)                  │
│         "Challenge is over!" (BOTH channels)                     │
│         Only target-hitters should submit                        │
│              [📋 Submit Results]                                  │
└──────────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              48-HOUR SUBMISSION WINDOW                            │
│                                                                  │
│  User taps [📋 Submit Results]                                   │
│    ├── Enter email (identity check)                              │
│    ├── Enter final balance (must meet target)                    │
│    ├── Upload balance screenshot                                 │
│    ├── Enter investor password                                   │
│    ├── Confirm password                                          │
│    └── ✅ Submission saved                                       │
└──────────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              ADMIN REPORT (auto after 48h) + CSV                 │
│              /selectwinners (admin types usernames)               │
│              /messageuser + /disqualify                           │
└──────────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              WINNER ANNOUNCEMENT (BOTH channels)                 │
│              DM to each winner (24h to claim)                    │
│              Prize distribution (manual)                         │
│              CHALLENGE COMPLETE ✅                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Admin Commands Summary

| Command | Description |
|---------|-------------|
| `/createtradingchallenge` | Create new trading challenge (step-by-step) |
| `/postchallenge` | Post announcement to channel(s) |
| `/updatechallenge` | Replace rules PDF or video link |
| `/selectwinners` | Select winners (type usernames) |
| `/messageuser` | Send message to participant (type username) |
| `/disqualify` | Disqualify participant (type username) |
| `/unregister` | Remove a registration (by username or email) |
| `/promo` | Post pre-installed promo message |
| `/registrations` | View all registrations for a challenge |
| `/exportregistrations` | Download CSV of all registrations |
| `/regsummary` | Get total registration summary on demand |
| `/tradingstatus` | View challenge status and stats |

---

## Daily Registration Summary (Auto — 8:00 AM EAT)

During the registration period, bot sends admin a daily summary at 8:00 AM EAT.
Covers the last 24 hours (8:00 AM to 8:00 AM) plus totals.

```
<b>📊 DAILY REGISTRATION SUMMARY</b>
<b>HYBRID CHALLENGE #15</b>
📅 <b>Period:</b> Mar 18, 2026 8:00 AM → Mar 19, 2026 8:00 AM

<b>📈 LAST 24 HOURS:</b>
➡️ <b>New Registrations:</b> 12
   ├── Demo: 8
   └── Real: 4
➡️ <b>Failed Registrations:</b> 6
   ├── Allocation Failed: 3
   ├── KYC Failed: 2
   └── Real Acct Not Allocated: 1
➡️ <b>Manual Reviews Pending:</b> 1
➡️ <b>Account Changes:</b> 2
➡️ <b>Category Switches:</b> 1

<b>📊 TOTALS (Since Registration Opened):</b>
➡️ <b>Total Registered:</b> 45
   ├── Demo: 28
   └── Real: 17
➡️ <b>Total Failed Attempts:</b> 23
   ├── Allocation Failed: 12
   ├── KYC Failed: 8
   └── Real Acct Not Allocated: 3
➡️ <b>Pending Manual Reviews:</b> 2

📅 <b>Registration open since:</b> Mar 15, 2026
⏰ <b>Challenge starts:</b> Mar 20, 2026 9:00 AM
```

### /regsummary — On-Demand (Total only, no 24h breakdown)

```
Admin: /regsummary
Bot: Select challenge:
[HYBRID CHALLENGE #15]

<b>📊 REGISTRATION SUMMARY</b>
<b>HYBRID CHALLENGE #15</b>

<b>📊 TOTALS:</b>
➡️ <b>Total Registered:</b> 45
   ├── Demo: 28
   └── Real: 17
➡️ <b>Total Failed Attempts:</b> 23
   ├── Allocation Failed: 12
   ├── KYC Failed: 8
   └── Real Acct Not Allocated: 3
➡️ <b>Pending Manual Reviews:</b> 2

📅 <b>Registration open since:</b> Mar 15, 2026
⏰ <b>Challenge starts:</b> Mar 20, 2026 9:00 AM
```

### /exportregistrations — Download CSV

```
Admin: /exportregistrations
Bot: Select challenge:
[HYBRID CHALLENGE #15]

Bot: 📎 Registration data exported!
[attached: HYBRID_CHALLENGE_15_registrations.csv]
```

CSV contains:
| # | Username | Telegram ID | Email | Type | Account # | Server | Status | Registered At |
|---|----------|-------------|-------|------|-----------|--------|--------|---------------|

---

## Exness Partnership API Integration

### Environment Variables
```
EXNESS_API_BASE_URL=https://my.exnessaffiliates.com
EXNESS_PARTNER_EMAIL=<partner login email>
EXNESS_PARTNER_PASSWORD=<partner login password>
```

### API Endpoints
1. Auth: `POST /api/v2/auth/` → JWT token (refresh every 5h)
2. Allocation (email): `POST /api/partner/affiliation/` → check email under BirrForex
3. Full UUID: `GET /api/v2/reports/clients/filters/` → resolve short UID
4. KYC/Balance: `GET /api/v2/reports/clients/` → kyc_passed, client_balance
5. Account check: `GET /api/reports/clients/accounts/?client_account={number}` → allocation + platform (mt5/null)

### Registration Checks
- Demo: email allocation ✅ + KYC ✅
- Real: email allocation ✅ + KYC ✅ + balance > 0 ✅ + real account allocation ✅ + platform is MT5 ✅

### Retry Protocol
3 attempts (3s delay) → "try after 30 min" → if still fails → manual fallback

### Partner Links
- New account: https://one.exnesstrack.org/boarding/sign-up/a/bqsuza6sq1/?campaign=32092
- Partner change: https://one.exnessonelink.com/a/bqsuza6sq1/?campaign=32092

---

## Database Tables (Separate from weekly quiz)

- `trading_challenges` — type, title, start/end dates, balance, target, prizes, status, pdf_url, video_url
- `trading_registrations` — telegram_id, challenge_id, account_type, email, account_number, mt5_server, status, client_uid, screenshot_url, submitted_at
- `trading_submissions` — registration_id, final_balance, balance_screenshot_url, investor_password, submitted_at
- `trading_winners` — challenge_id, registration_id, position, prize_amount, category, claimed

---

## Placeholder Links (to be provided by admin)
- `investor_password_guide_link` — How to get investor password (Phase 6 & 7)
- `partner_change_guide_link` — How to change partner on Exness (Phase 3)

---

## Open Questions

All resolved:
1. No daily leaderboard posts during challenge
2. Usually one challenge at a time, but system supports multiple (no hard limit)
3. Three pre-installed promo messages are enough

---

## Implementation Plan
(To be filled after discussion is complete)
