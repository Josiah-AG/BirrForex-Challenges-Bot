# BirrForex Weekly Challenge Bot - Complete User Flow & Framework

## 📋 TABLE OF CONTENTS
1. [Bot Overview](#bot-overview)
2. [Terminology](#terminology)
3. [Admin Workflow](#admin-workflow)
4. [Challenge Day Timeline](#challenge-day-timeline)
5. [User Participation Flow](#user-participation-flow)
6. [Ranking & Notification Logic](#ranking--notification-logic)
7. [All Bot Messages](#all-bot-messages)
8. [Admin Commands](#admin-commands)
9. [User Commands](#user-commands)
10. [Technical Requirements](#technical-requirements)

---

## 🎯 BOT OVERVIEW

### Purpose
Automate BirrForex weekly quiz challenges in Telegram with prizes for perfect scorers.

### Schedule
- **Days**: Wednesday & Sunday
- **Challenge Time**: 2:00 PM EAT (adjustable)
- **Duration**: 10 minutes
- **Morning Posts**: 10:00 AM EAT
- **2-Hour Reminder**: 12:00 PM EAT (calculated from challenge time)
- **30-Min Reminder**: 1:30 PM EAT (calculated from challenge time)

### Channels
- **Main Channel**: @BirrForex (announcements)
- **Challenge Channel**: @BirrForex_Challenges (quiz posts & results)

### Key Features
- Multiple choice questions (3-10 questions, flexible)
- Answer choices shuffled per user (not questions)
- Perfect score (100%) required to win
- Speed-based ranking among perfect scorers
- No consecutive wins allowed
- 1-hour prize claim deadline
- Automatic backup winner system

---

## 📖 TERMINOLOGY

### Completion Order
- The order in which users finish answering the quiz
- Shown immediately when user completes
- Example: "You were the 13th to complete the challenge"
- Independent of score

### Rank
- Final ranking calculated after challenge ends (2:10 PM)
- First ranked by score (5/5 > 4/5 > 3/5, etc.)
- Within same score, ranked by completion time
- Example: User completes 1st but scores 3/5 → Rank could be 200th
- Example: User completes 30th but scores 5/5 fastest → Rank is 1st

### Perfect Score Ranking
- Ranking among only users with perfect scores (5/5)
- Used to determine winner and backup list
- Based purely on completion time

---

## 👨‍💼 ADMIN WORKFLOW

### Before Challenge Day

**Admin Input Format:**
```
Topic: Weekend Gold Analysis
Short Text: Today's challenge will be about the weekend analysis I posted for you.
Topic Link: https://youtube.com/watch?v=xyz123
Number of Questions: 5
Questions + Answers: [Admin inputs via bot]
```

### Admin Reminders (If Questions Not Configured)

**Reminder 1: Challenge Day 8:00 AM**
```
⚠️ REMINDER

Today's challenge (Wednesday) is scheduled for 2:00 PM.

❌ Questions not yet configured!

Please use /createchallenge to set up today's quiz.

⏰ Next reminder: 12:00 PM
```

**Reminder 2: Challenge Day 12:00 PM**
```
🚨 URGENT REMINDER

Today's challenge starts in 2 HOURS!

❌ Questions still not configured!

Use /createchallenge now or the challenge will be auto-cancelled.

⏰ Auto-cancel at: 1:50 PM (if not configured)
```

**Auto-Cancel: 1:50 PM (if not configured)**
```
❌ Challenge Cancelled

Wednesday's challenge has been cancelled due to missing configuration.

Next scheduled challenge: Sunday, 2:00 PM
```

---

## 📅 CHALLENGE DAY TIMELINE

### 10:00 AM - Morning Announcements

**POST 1: Main Channel (@BirrForex)**
```
🚀 BirrForex Weekly Challenge – Wednesday

Topic: Weekend Gold Analysis

Today's challenge will be about the weekend analysis I posted for you. 📊

🔹 The challenge will be posted on @BirrForex_Challenges at 2:00 PM sharp
🔹 It will contain 5 questions taken directly from the content
🔹 First person to answer correctly wins a reward 🎁

👉 Check it out and get ready:

Good luck, traders! 🍀

[📊 Weekend Gold Analysis] [🚀 Join Challenge]
```

**Clickable Links:**
- "Weekend Gold Analysis" (after "Topic:") → Links to Topic Link
- Button `📊 Weekend Gold Analysis` → Links to Topic Link
- Button `🚀 Join Challenge` → Links to t.me/BirrForex_Challenges

**POST 2: Challenge Channel (@BirrForex_Challenges)**
```
📖 How to Join:

• Check out the content posted on our main channel @BirrForex and get ready
• Challenge questions will come directly from that content
• The challenge will stay open for only 10 minutes ⏰
• Be the first to answer correctly and win a reward! 🎁

📝 Terms & Conditions

👉 Rewards will be sent ONLY via internal transfer on Exness to users who are verified and registered through the links shared in our channel. 😊

💡 Already joined from our past challenges or social media links? You're all set! ✅

🎯 Note:
If the first winner is not eligible, the reward will go to the next eligible participant (up to the 5th person).

📌 Ready to join the fun? Open your Exness account here 👇

https://one.exnesstrack.org/boarding/sign-up/a/bqsuza6sq1/?campaign=15636&track1=Birrforex

ARE YOU READY? TAP 🔥 if you are

#TurnKnowledgeToProfit
```

### 12:00 PM - 2 Hour Reminder

**POST 3: Challenge Channel (@BirrForex_Challenges)**
```
⏰ 2 HOURS Remaining for Today's Challenge

📖 How to Join:

• Study the topic content Weekend Gold Analysis (Questions will be from it)
• Join 👉 @BirrForex_Challenges
• The challenge will be posted sharp at 2:00 PM ⏰
• Be the first to answer correctly and win a reward! 🎁

📝 Read the Terms & Conditions before you start

👉 Not ready yet? Check it out now:

[📊 Weekend Gold Analysis] [🚀 Join Challenge]
```

**Clickable Links:**
- "Weekend Gold Analysis" (in text) → Links to Topic Link
- "📝 Read the Terms & Conditions before you start" → Links to t.me/BirrForex_Challenges
- Button `📊 Weekend Gold Analysis` → Links to Topic Link
- Button `🚀 Join Challenge` → Links to t.me/BirrForex_Challenges

### 1:30 PM - 30 Minute Reminder

**POST 4: Challenge Channel (@BirrForex_Challenges)**
```
⏰ 30 MIN Remaining for Today's Challenge

📖 How to Join:

• Study the topic content Weekend Gold Analysis (Questions will be from it)
• Join 👉 @BirrForex_Challenges
• The challenge will be posted sharp at 2:00 PM ⏰
• Be the first to answer correctly and win a reward! 🎁

📝 Read the Terms & Conditions before you start

⚡ Get ready! Challenge starts soon!

[📊 Weekend Gold Analysis] [🚀 Join Challenge]
```

**Clickable Links:** (Same as 2-hour reminder)

### 2:00 PM - Challenge Goes LIVE

**POST 5: Challenge Channel (@BirrForex_Challenges)**
```
🎯 BIRRFOREX WEEKLY CHALLENGE 🎯
Wednesday Round is LIVE NOW!

💰 Prize: $20
⏰ Time Limit: 10 Minutes
📝 Questions: 5
🏆 Winners: 1

📊 Topic: Weekend Gold Analysis

⚡ RULES:
✓ Perfect score (5/5) required to win
✓ One attempt only
✓ Fastest correct submission wins
✓ No consecutive wins allowed

⏱️ Challenge closes at 2:10 PM

[🚀 JOIN CHALLENGE NOW]
```

**Button:**
- `🚀 JOIN CHALLENGE NOW` → Opens t.me/BirrForexChallengeBot?start=challenge_wed_mar11

### 2:10 PM - Challenge Closes & Results Posted

**POST 6: Challenge Channel (@BirrForex_Challenges)**
```
⏰ BirrForex Weekly Challenge - Wednesday Round IS CLOSED

━━━━━━━━━━━━━━━━━━━━

📊 CHALLENGE RESULTS 📊
Wednesday, March 11, 2026

🏆 WINNER:
@username1 - 5/5 in 2m 34s

💰 Prize: $20

📋 BACKUP LIST (Perfect Scores):
🥈 @username2 - 5/5 in 2m 45s
🥉 @username3 - 5/5 in 3m 12s
4️⃣ @username4 - 5/5 in 3m 28s
5️⃣ @username5 - 5/5 in 3m 45s
6️⃣ @username6 - 5/5 in 3m 58s

📈 STATS:
• Total Participants: 47
• Perfect Scores: 7 (14.9%)
• Average Score: 3.8/5
• Average Completion Time: 4m 18s

🎉 Congratulations to the winner!

Next Challenge: Sunday, 2:00 PM

[📖 VIEW CORRECT ANSWERS] [🏅 VIEW YOUR RANK]
```

**Buttons:**
- `📖 VIEW CORRECT ANSWERS` → Opens bot with answers
- `🏅 VIEW YOUR RANK` → Opens bot with user's rank details

**Note:** Only 1 winner + 5 backups shown (6 total), even if more perfect scores exist

---

## 👤 USER PARTICIPATION FLOW

### Step 1: User Clicks "JOIN CHALLENGE NOW" from Channel

**Bot Welcome Message:**
```
🎯 Welcome to BirrForex Challenge!

📊 Topic: Weekend Gold Analysis
⏰ Time Limit: 10 minutes from your first answer
📝 Questions: 5 multiple choice

⚡ Remember:
• You can only attempt once
• Perfect score (5/5) required to win
• Fastest correct submission wins

Ready? Let's go! 🚀

[START QUIZ]
```

### Step 2: User Clicks "START QUIZ"

**Question 1 Appears:**
```
Question 1/5 ⏱️

According to the video, what is the key resistance level for Gold?

[A) $2,650]
[B) $2,680]
[C) $2,700]
[D) $2,720]
```

**Important:** Answer choices are shuffled for each user (not questions)

### Step 3: User Selects Answer

**Immediate Response:**
```
✓ Answer recorded

Question 2/5 ⏱️

What was the main trend direction mentioned?

[A) Bullish continuation]
[B) Bearish reversal]
[C) Sideways consolidation]
[D) Uncertain/Mixed]
```

**Process continues until all 5 questions answered**

### Step 4: Immediate Feedback After Completion

**If Score is NOT Perfect (4/5 or lower):**
```
📊 CHALLENGE COMPLETED

Your Score: 4/5 ❌
Time Taken: 3m 15s
📍 Completion Order: You were the 13th to complete the challenge

Unfortunately, a perfect score (5/5) is required to win.

💪 Study the material and try again next time!

📅 Next Challenge: Sunday, 2:00 PM

⏳ Your final rank will be available after 2:10 PM

[View My Rank] [📊 My Stats] [🏆 Winners]
```

**Note:** 
- NO automatic notification at 2:10 PM
- "View My Rank" button disabled until 2:10 PM

**If Score is Perfect (5/5):**
```
🎉 PERFECT SCORE! 🎉

Your Score: 5/5 ✅
Time Taken: 2m 34s
📍 Completion Order: You were the 1st to complete the challenge

⏳ Challenge ends at 2:10 PM
Your final rank will be determined after the challenge closes.

We'll notify you here when results are posted!

Stay tuned... 🏆
```

**Note:** Will receive automatic notification at 2:10 PM

### Step 5: Edge Cases

**Late Arrival (After 2:10 PM):**
```
⏰ CHALLENGE CLOSED

This challenge ended at 2:10 PM.

You can no longer participate in this round.

📅 Next Challenge:
Sunday, March 14, 2026 at 2:00 PM

💡 Tip: Set a reminder so you don't miss it!

[SET REMINDER] [VIEW RESULTS]
```

**Duplicate Attempt:**
```
⚠️ ALREADY ATTEMPTED

You've already participated in this challenge.

One attempt per challenge is allowed.

📅 Next chance: Sunday, 2:00 PM

[VIEW MY RESULT] [VIEW LEADERBOARD]
```

---

## 🏆 RANKING & NOTIFICATION LOGIC

### Automatic Notifications at 2:10 PM

**Who Gets Notified:**
- ✅ 1st place (Winner)
- ✅ 2nd-6th place (5 Backups)
- ✅ Consecutive winners (disqualified message)
- ❌ 7th+ place perfect scorers (must click "View My Rank")
- ❌ All non-perfect scorers (must click "View My Rank")

### Winner Notification (1st Place)
```
🏆 CONGRATULATIONS! 🏆

You WON today's challenge!

💰 Prize: $20
📊 Final Score: 5/5
⚡ Your Time: 2m 34s
📍 Completion Order: You were the 1st to complete the challenge
🏅 Final Rank: 1st out of 47 participants
👥 Total Participants: 47
🎯 Total Perfect Scores: 7

📸 TO CLAIM YOUR PRIZE:
DM @birrFXadmin with this screenshot

⚠️ Important:
• Prize must be claimed within 1 HOUR
• Sent via Exness internal transfer only
• Must be verified Exness user
• Terms and conditions apply

[📖 View Answers] [📊 My Stats] [🏆 All Winners]
```

### Backup List Notification (2nd-6th Place)
```
✨ EXCELLENT PERFORMANCE!

📊 Final Score: 5/5 ✅
⚡ Your Time: 2m 45s
📍 Completion Order: You were the 12th to complete the challenge
🏅 Final Rank: 2nd out of 47 participants
👥 Total Participants: 47
🎯 Total Perfect Scores: 7

You're on the BACKUP LIST!

If the winner is found ineligible or doesn't claim the prize within 1 hour, you may receive it.

We'll contact you here if that happens.

Great job! 🎉

[📖 View Answers] [📊 My Stats] [🏆 All Winners]
```

### Consecutive Winner Notification (Disqualified)
```
🎯 PERFECT SCORE AGAIN!

📊 Your Score: 5/5 ✅
⚡ Your Time: 2m 15s
📍 Completion Order: You were the 1st to complete the challenge
🏅 Final Rank: Would be 1st, but ineligible
👥 Total Participants: 47
🎯 Total Perfect Scores: 7

However...

⚠️ Consecutive Win Rule Applied

You won the last challenge (Sunday). To keep things fair and give everyone a chance, the prize passes to the next eligible participant.

🎉 Amazing performance! You can win again in the next round.

📅 Next Challenge: Sunday, 2:00 PM

[📖 View Answers] [📊 My Stats] [🏆 All Winners]
```

### Ranking Calculation Logic

**Step 1: Score-Based Ranking**
- All 5/5 scores ranked first
- Then all 4/5 scores
- Then all 3/5 scores
- Then all 2/5 scores
- Then all 1/5 scores

**Step 2: Time-Based Ranking (Within Same Score)**
- Among users with same score, fastest time ranks higher
- Example: Two users with 4/5, one finishes in 3m, other in 4m → 3m ranks higher

**Step 3: Perfect Score Winner Selection**
- Among all 5/5 scores, fastest time wins
- Check consecutive win rule
- If winner ineligible, move to next fastest 5/5

**Example Scenario:**

| User | Score | Time | Completion Order | Final Rank |
|------|-------|------|------------------|------------|
| @user1 | 5/5 | 2m 34s | 5th | 1st (Winner) |
| @user2 | 5/5 | 2m 45s | 12th | 2nd (Backup) |
| @user3 | 5/5 | 3m 12s | 23rd | 3rd (Backup) |
| @user4 | 4/5 | 2m 10s | 1st | 4th |
| @user5 | 4/5 | 3m 00s | 8th | 5th |
| @user6 | 3/5 | 2m 05s | 2nd | 18th |
| @user7 | 2/5 | 4m 30s | 40th | 33rd |

**Key Insights:**
- @user4 completed 1st but scored 4/5 → Ranked 4th (behind all 5/5 scorers)
- @user6 completed 2nd but scored 3/5 → Ranked 18th
- @user1 completed 5th but scored 5/5 fastest → Ranked 1st (Winner!)

---

## 📖 ALL BOT MESSAGES

### View Correct Answers (When button clicked)
```
✅ CORRECT ANSWERS
Wednesday Challenge - March 11, 2026

Topic: Weekend Gold Analysis

━━━━━━━━━━━━━━━━━━━━

Q1: According to the video, what is the key resistance level for Gold?
✓ B) $2,680

Q2: What was the main trend direction mentioned?
✓ A) Bullish continuation

Q3: Which timeframe was used for the main analysis?
✓ C) 4-Hour chart

Q4: What was the suggested entry point?
✓ D) $2,665

Q5: What is the target profit level?
✓ A) $2,720

━━━━━━━━━━━━━━━━━━━━

📚 Study these for next time!
📊 Rewatch: Weekend Gold Analysis

Next Challenge: Sunday, 2:00 PM

[📊 Weekend Gold Analysis] [📊 My Stats] [🏆 Winners]
```

### View Your Rank - Non-Perfect Scorer (4/5)
```
🏅 YOUR RANK
Wednesday Challenge - March 11, 2026

📊 Your Score: 4/5
⚡ Your Time: 3m 15s
📍 Completion Order: 13th to complete
🏅 Final Rank: 13th out of 47 participants

━━━━━━━━━━━━━━━━━━━━

📊 RANKING BREAKDOWN:

🥇 Rank 1-5: Perfect Scores (5/5)
• 5 users

🥈 Rank 6-17: High Scores (4/5)
• 12 users
• You ranked 8th in this group

🥉 Rank 18-32: Medium Scores (3/5)
• 15 users

📊 Rank 33-42: Low Scores (2/5)
• 10 users

📉 Rank 43-45: Lowest Scores (1/5)
• 3 users

━━━━━━━━━━━━━━━━━━━━

💡 To improve your rank:
• Study the topic content thoroughly
• Answer faster (within same score group)
• Aim for perfect score (5/5)

📅 Next Challenge: Sunday, 2:00 PM

[📖 View Answers] [📊 My Full Stats] [🏆 View Winners]
```

### View Your Rank - Perfect Scorer (7th+ place, no notification)
```
✨ PERFECT SCORE!

📊 Final Score: 5/5 ✅
⚡ Your Time: 4m 15s
📍 Completion Order: You were the 35th to complete the challenge
🏅 Final Rank: 7th out of 47 participants
👥 Total Participants: 47
🎯 Total Perfect Scores: 7

You answered everything correctly!

However, you ranked 7th among perfect scorers, which is beyond the backup list (top 6).

🚀 Next time, try to be even faster!

📅 Next Challenge: Sunday, 2:00 PM

[📖 View Answers] [📊 My Stats] [🏆 All Winners]
```

### View Your Rank - Did Not Participate
```
🏅 CHALLENGE RANK
Wednesday Challenge - March 11, 2026

⚠️ You did not participate in this challenge.

📊 CHALLENGE RESULTS:

🏆 Winner: @username1 - 5/5 in 2m 34s
👥 Total Participants: 47
🎯 Perfect Scores: 7
📊 Average Score: 3.8/5

━━━━━━━━━━━━━━━━━━━━

📅 Next Challenge: Sunday, 2:00 PM

💡 Don't miss it! Set a reminder.

[📖 View Answers] [🔔 Set Reminder] [🏆 View Winners]
```

---

## 👨‍💼 ADMIN COMMANDS

### /createchallenge

**Step-by-Step Flow:**
```
📝 CREATE NEW CHALLENGE

Which day is this for?
[Wednesday] [Sunday]

You: [Wednesday]

━━━━━━━━━━━━━━━━━━━━

📊 Challenge Topic
Enter the topic name (e.g., "Weekend Gold Analysis"):

You: Weekend Gold Analysis

━━━━━━━━━━━━━━━━━━━━

📝 Short Description
Enter a short text for the announcement:

You: Today's challenge will be about the weekend analysis I posted for you.

━━━━━━━━━━━━━━━━━━━━

🔗 Topic Link
Enter the reference link (YouTube, website, etc.):

You: https://youtube.com/watch?v=xyz123

━━━━━━━━━━━━━━━━━━━━

📝 Number of Questions
How many questions? (3-10):

You: 5

━━━━━━━━━━━━━━━━━━━━

Question 1/5
Enter the question text:

You: According to the video, what is the key resistance level for Gold?

━━━━━━━━━━━━━━━━━━━━

Answer Choices for Question 1
Enter option A:

You: $2,650

Enter option B:

You: $2,680

Enter option C:

You: $2,700

Enter option D:

You: $2,720

━━━━━━━━━━━━━━━━━━━━

Which option is correct? (A/B/C/D):

You: B

✅ Question 1 saved!

[Continue to Question 2]

━━━━━━━━━━━━━━━━━━━━

... (repeats for all 5 questions)

━━━━━━━━━━━━━━━━━━━━

✅ CHALLENGE CREATED!

📊 Summary:
• Day: Wednesday, March 11, 2026
• Topic: Weekend Gold Analysis
• Questions: 5
• Posting Time: 2:00 PM EAT

📅 Scheduled Posts:
• 10:00 AM - Announcement (both channels)
• 12:00 PM - 2 hour reminder
• 1:30 PM - 30 min reminder
• 2:00 PM - Challenge goes live

[Preview Posts] [Edit Challenge] [Confirm & Schedule]
```

### /passwinner

**Flow:**
```
🔄 PASS WINNER TO NEXT

Current Winner: @username1

Reason for passing:
[Not Eligible] [Didn't Claim (1hr)] [Other]

You: [Didn't Claim (1hr)]

━━━━━━━━━━━━━━━━━━━━

Confirm passing prize to next eligible user?

Next Winner: @username2 (2nd place)
Score: 5/5 in 2m 45s

[✅ Confirm] [❌ Cancel]

━━━━━━━━━━━━━━━━━━━━

✅ Winner Updated!

• Old Winner: @username1 (disqualified)
• New Winner: @username2

Actions taken:
✅ @username2 notified in bot (1hr claim deadline)
✅ Channel post updated
✅ Database updated
✅ Consecutive win tracker updated

[View Updated Results]
```

**Channel Update Post:**
```
📢 WINNER UPDATE

The 1st place winner was found ineligible.

The prize has been passed to the 2nd backup.

🏆 NEW WINNER:
@username2 - 5/5 in 2m 45s

💰 Prize: $20

⏰ Prize must be claimed within 1 hour

Congratulations! 🎉
```

**New Winner Notification (Bot DM):**
```
🎉 CONGRATULATIONS! 🎉

You are now the WINNER!

The previous winner was found ineligible, and the prize has been passed to you.

💰 Prize: $20
📊 Your Score: 5/5
⚡ Your Time: 2m 45s
🥈 Original Rank: 2nd

📸 TO CLAIM YOUR PRIZE:
DM @birrFXadmin with this screenshot

⚠️ Prize must be claimed within 1 HOUR from now

[View Full Results]
```

### /cancelchallenge

**Flow:**
```
⚠️ CANCEL CHALLENGE

Which challenge do you want to cancel?
[Today's Challenge (Wednesday)]
[Next Challenge (Sunday)]

You: [Today's Challenge (Wednesday)]

━━━━━━━━━━━━━━━━━━━━

⚠️ WARNING

This will cancel the Wednesday challenge scheduled for 2:00 PM today.

A cancellation notice will be posted on:
• @BirrForex (main channel)
• @BirrForex_Challenges

Next challenge: Sunday, March 14, 2026

[✅ Confirm Cancellation] [❌ Go Back]

━━━━━━━━━━━━━━━━━━━━

✅ Challenge Cancelled

Cancellation notices posted to both channels.

Next challenge: Sunday, 2:00 PM
```

**Cancellation Post (Both Channels):**
```
⚠️ CHALLENGE CANCELLED

Sorry, today's challenge (Wednesday) will not take place due to internal reasons.

The challenge will resume on the next scheduled day.

📅 Next Challenge: Sunday, March 14, 2026 at 2:00 PM

Thank you for your understanding! 🙏
```

### /settings

**Display:**
```
⚙️ BOT SETTINGS

📅 SCHEDULE:
• Challenge Days: Wednesday, Sunday
• Challenge Time: 2:00 PM EAT
• Morning Post: 10:00 AM EAT
• 2hr Reminder: 12:00 PM EAT (calculated)
• 30min Reminder: 1:30 PM EAT (calculated)

💰 REWARDS:
• Default Prize: $20
• Winners per Challenge: 1
• Backup List Size: 5

⏰ TIMING:
• Challenge Duration: 10 minutes
• Prize Claim Deadline: 1 hour

📢 CHANNELS:
• Main Channel: @BirrForex
• Challenge Channel: @BirrForex_Challenges

🔗 LINKS:
• Exness Signup: [configured]

[Edit Settings]
```

### Admin Report (Sent at 2:12 PM to @birrFXadmin)
```
📊 ADMIN REPORT
Wednesday Challenge - March 11, 2026

⏰ TIMING:
• Started: 2:00:00 PM
• Ended: 2:10:00 PM
• Duration: 10 minutes

👥 PARTICIPATION:
• Total Attempts: 47
• Completed: 45
• Incomplete: 2 (timed out)
• Late Attempts: 8 (rejected)
• Duplicate Attempts: 3 (rejected)

🎯 SCORING:
• Perfect Scores (5/5): 7 users (15.6%)
• 4/5: 12 users (26.7%)
• 3/5: 15 users (33.3%)
• 2/5: 10 users (22.2%)
• 1/5: 1 user (2.2%)
• Average Score: 3.8/5

⚡ PERFECT SCORE RANKINGS (by completion time):
1st: @username1 - 2m 34s ✅ Winner
2nd: @username2 - 2m 45s (Backup)
3rd: @username3 - 3m 12s (Backup)
4th: @username4 - 3m 28s (Backup)
5th: @username5 - 3m 45s (Backup)
6th: @username6 - 3m 58s (Backup)
7th: @username7 - 4m 15s (Not notified)

⚡ COMPLETION ORDER (all participants):
• Total Completed: 45
• Average Completion Time: 4m 18s
• Fastest Completion: 2m 15s (@username8 - consecutive winner, disqualified)
• Slowest Completion: 9m 45s

📋 QUESTION ACCURACY:
Q1: 89% correct (40/45)
Q2: 76% correct (34/45)
Q3: 45% correct (20/45) ⚠️ Hardest
Q4: 67% correct (30/45)
Q5: 82% correct (37/45)

🏆 WINNERS:
✅ 1st: @username1 (2m 34s) - Eligible
📋 2nd: @username2 (2m 45s) - Backup
📋 3rd: @username3 (3m 12s) - Backup
📋 4th: @username4 (3m 28s) - Backup
📋 5th: @username5 (3m 45s) - Backup
📋 6th: @username6 (3m 58s) - Backup

⚠️ DISQUALIFICATIONS:
• @username8 - Consecutive winner (completed 1st overall, time: 2m 15s, perfect score)

💰 PRIZE STATUS:
• Amount: $20
• Winner: @username1
• Claimed: ⏳ Pending (1hr deadline: 3:10 PM)

📈 TREND:
• Last Challenge (Sunday): 52 participants
• Change: -9.6% ↓

📊 Topic: Weekend Gold Analysis
🔗 Reference: https://youtube.com/watch?v=xyz123

[EXPORT DETAILED DATA] [SEND CLAIM REMINDER]
```

---

## 👤 USER COMMANDS

### Main Menu (Always visible in bot)
```
🎯 BirrForex Challenge Bot

What would you like to do?

[📊 My Stats]
[🏆 Previous Winners]
[📖 Previous Questions]
[📅 Next Challenge]
[📋 Rules & Terms]
[🔔 Notifications]
```

### /mystats or [📊 My Stats]
```
📊 YOUR STATISTICS

👤 Username: @username1

🎯 PARTICIPATION:
• Total Challenges: 12
• Perfect Scores: 3 (25%)
• Average Score: 4.2/5
• Average Time: 3m 45s

🏆 WINS:
• Total Wins: 1
• Last Win: March 8, 2026
• Total Prizes: $20

📈 RANKING:
• Best Rank: 1st
• Average Rank: 8th
• Current Streak: 3 challenges

⚡ FASTEST TIME:
• Personal Best: 2m 15s
• Challenge: March 8, 2026

[📖 View My History] [🏆 View Leaderboard]
```

### /winners or [🏆 Previous Winners]
```
🏆 PREVIOUS WINNERS

📅 March 11, 2026 (Wednesday)
@username1 - 5/5 in 2m 34s
Topic: Weekend Gold Analysis

📅 March 8, 2026 (Sunday)
@username2 - 5/5 in 2m 15s
Topic: Risk Management

📅 March 4, 2026 (Wednesday)
@username3 - 5/5 in 3m 02s
Topic: Candlestick Patterns

[View More] [🏆 All-Time Leaderboard]
```

### /questions or [📖 Previous Questions]
```
📖 PREVIOUS QUESTIONS

📅 March 11, 2026 (Wednesday)
Topic: Weekend Gold Analysis
Questions: 5
[View Questions & Answers]

📅 March 8, 2026 (Sunday)
Topic: Risk Management
Questions: 5
[View Questions & Answers]

📅 March 4, 2026 (Wednesday)
Topic: Candlestick Patterns
Questions: 5
[View Questions & Answers]

[View More]
```

### /next or [📅 Next Challenge]
```
📅 NEXT CHALLENGE

🗓️ Date: Sunday, March 14, 2026
⏰ Time: 2:00 PM EAT
📊 Topic: TBA (will be announced on challenge day)

⏳ Time Until Challenge:
2 days, 15 hours, 23 minutes

🔔 Want a reminder?
[Set Reminder 1 Hour Before]
[Set Reminder 30 Min Before]

[View Rules] [Back to Menu]
```

### /rules or [📋 Rules & Terms]
```
📋 CHALLENGE RULES

⚡ HOW IT WORKS:
• Challenges posted twice weekly (Wed & Sun)
• Posted at 2:00 PM EAT sharp
• Duration: 10 minutes only
• Questions: 3-10 (varies per challenge)

🏆 WINNING CRITERIA:
• Perfect score required (100%)
• Fastest correct submission wins
• One attempt per challenge only
• No consecutive wins allowed

💰 PRIZES:
• Sent via Exness internal transfer
• Must be verified Exness user
• Must claim within 1 hour
• Terms and conditions apply

📋 ELIGIBILITY:
• Must be channel member
• Must have started bot
• Cannot win two challenges in a row
• Admin decision is final

[View Full Terms] [Back to Menu]
```

### /notify or [🔔 Notifications]
```
🔔 NOTIFICATION SETTINGS

Current Status: ✅ Enabled

You will receive reminders:
✅ 1 hour before challenge
✅ 30 minutes before challenge
✅ When challenge goes live

[Disable Notifications]
[Back to Menu]
```

---

## 🔧 TECHNICAL REQUIREMENTS

### Technology Stack
- **Language**: TypeScript
- **Framework**: Telegraf (Telegram Bot Framework)
- **Database**: PostgreSQL
- **Scheduling**: node-cron or node-schedule
- **Hosting**: Railway
- **Environment**: Node.js

### Database Schema

**Tables Required:**

1. **challenges**
   - id (primary key)
   - day (wednesday/sunday)
   - date
   - topic
   - short_text
   - topic_link
   - status (scheduled/active/completed/cancelled)
   - created_at
   - updated_at

2. **questions**
   - id (primary key)
   - challenge_id (foreign key)
   - question_text
   - option_a
   - option_b
   - option_c
   - option_d
   - correct_answer (A/B/C/D)
   - order_number

3. **participants**
   - id (primary key)
   - challenge_id (foreign key)
   - user_id (telegram user id)
   - username
   - score
   - completion_time (seconds)
   - completion_order
   - rank
   - started_at
   - completed_at
   - answers (JSON array)

4. **winners**
   - id (primary key)
   - challenge_id (foreign key)
   - user_id
   - username
   - position (1st, 2nd, 3rd, etc.)
   - prize_amount
   - claimed (boolean)
   - claimed_at
   - disqualified (boolean)
   - disqualification_reason

5. **users**
   - id (primary key)
   - telegram_id
   - username
   - first_name
   - last_name
   - total_participations
   - total_wins
   - total_perfect_scores
   - last_win_date
   - notifications_enabled
   - created_at

6. **settings**
   - id (primary key)
   - key (unique)
   - value
   - updated_at

### Key Features to Implement

1. **Deep Linking**
   - Channel button → Bot with challenge ID parameter
   - Format: `t.me/BirrForexChallengeBot?start=challenge_wed_mar11`

2. **Answer Shuffling**
   - Shuffle answer positions per user
   - Store original order in database
   - Track user's shuffled order for validation

3. **Timing System**
   - Track start time on first question
   - Track completion time on last answer
   - Calculate total time in seconds
   - Enforce 10-minute window

4. **Ranking Algorithm**
   - Primary sort: Score (descending)
   - Secondary sort: Time (ascending)
   - Calculate rank after challenge closes

5. **Notification System**
   - Scheduled posts (10 AM, 12 PM, 1:30 PM, 2 PM)
   - Automatic DMs to perfect scorers at 2:10 PM
   - Admin reminders if challenge not configured
   - Winner notifications

6. **Consecutive Win Prevention**
   - Check user's last win date
   - If last win was previous challenge, disqualify from current win
   - Still show in results but mark as ineligible

7. **Prize Claim Tracking**
   - 1-hour deadline from result posting
   - Admin command to pass to next winner
   - Update channel post when winner changes

8. **Admin Interface**
   - /createchallenge - Guided challenge creation
   - /passwinner - Transfer prize to backup
   - /cancelchallenge - Cancel scheduled challenge
   - /settings - Configure bot parameters
   - Receive detailed reports after each challenge

9. **User Interface**
   - Main menu with buttons
   - Personal statistics
   - Previous winners/questions
   - Rank viewing system
   - Notification preferences

### Environment Variables
```
BOT_TOKEN=your_telegram_bot_token
DATABASE_URL=postgresql://user:password@host:port/database
ADMIN_USER_ID=your_telegram_user_id
MAIN_CHANNEL_ID=@BirrForex
CHALLENGE_CHANNEL_ID=@BirrForex_Challenges
TIMEZONE=Africa/Addis_Ababa
DEFAULT_PRIZE_AMOUNT=20
EXNESS_SIGNUP_LINK=https://one.exnesstrack.org/boarding/sign-up/a/bqsuza6sq1/?campaign=15636&track1=Birrforex
```

### Cron Jobs Required

1. **Admin Reminders**
   - 8:00 AM on challenge days (if not configured)
   - 12:00 PM on challenge days (if not configured)

2. **Scheduled Posts**
   - 10:00 AM - Main channel + Challenge channel posts
   - 12:00 PM - 2-hour reminder
   - 1:30 PM - 30-minute reminder
   - 2:00 PM - Challenge goes live
   - 2:10 PM - Challenge closes, results posted

3. **Auto-Cancel**
   - 1:50 PM - Cancel if not configured

### Error Handling

1. **User Errors**
   - Already attempted
   - Challenge closed
   - Invalid answer selection
   - Timeout during quiz

2. **Admin Errors**
   - Invalid question count
   - Missing required fields
   - Invalid date/time
   - Channel posting failures

3. **System Errors**
   - Database connection issues
   - Telegram API rate limits
   - Scheduling failures
   - Data consistency checks

### Security Considerations

1. **Admin Authentication**
   - Verify admin user ID before allowing commands
   - Secure admin-only endpoints

2. **Data Validation**
   - Sanitize user inputs
   - Validate challenge parameters
   - Prevent SQL injection

3. **Rate Limiting**
   - Prevent spam attempts
   - Limit command usage per user

4. **Data Privacy**
   - Store minimal user data
   - Comply with Telegram's privacy policy
   - Secure database connections

---

## 📝 IMPLEMENTATION CHECKLIST

### Phase 1: Core Setup
- [ ] Initialize TypeScript project
- [ ] Set up Telegraf bot framework
- [ ] Configure PostgreSQL database
- [ ] Create database schema and migrations
- [ ] Set up environment variables
- [ ] Configure Railway deployment

### Phase 2: Admin Features
- [ ] Implement /createchallenge command
- [ ] Build question input flow
- [ ] Create challenge scheduling system
- [ ] Implement /settings command
- [ ] Add /cancelchallenge command
- [ ] Build admin reminder system

### Phase 3: Challenge Posting
- [ ] Implement scheduled posts (10 AM, 12 PM, 1:30 PM, 2 PM)
- [ ] Create dynamic post generation from challenge data
- [ ] Add deep linking to bot
- [ ] Implement clickable links in posts
- [ ] Test all post formats

### Phase 4: User Participation
- [ ] Build quiz flow (sequential questions)
- [ ] Implement answer shuffling
- [ ] Add timing system
- [ ] Create immediate feedback messages
- [ ] Handle edge cases (late, duplicate, timeout)

### Phase 5: Ranking & Results
- [ ] Implement ranking algorithm
- [ ] Build consecutive win checker
- [ ] Create automatic notifications (2:10 PM)
- [ ] Generate results post for channel
- [ ] Build "View Your Rank" feature

### Phase 6: Winner Management
- [ ] Implement /passwinner command
- [ ] Create winner update posts
- [ ] Build prize claim tracking
- [ ] Add admin report generation

### Phase 7: User Commands
- [ ] Build main menu
- [ ] Implement /mystats
- [ ] Create /winners command
- [ ] Add /questions archive
- [ ] Build /next challenge info
- [ ] Add notification preferences

### Phase 8: Testing & Deployment
- [ ] Test all user flows
- [ ] Test all admin commands
- [ ] Test edge cases
- [ ] Load testing
- [ ] Deploy to Railway
- [ ] Monitor first live challenge

---

## 🎯 SUCCESS CRITERIA

### User Experience
- ✅ Users can join challenge from channel with one click
- ✅ Quiz is intuitive and fast
- ✅ Results are clear and immediate
- ✅ Rank viewing is informative
- ✅ All buttons work correctly

### Admin Experience
- ✅ Challenge creation is simple and guided
- ✅ All posts are automatic
- ✅ Winner management is easy
- ✅ Reports are comprehensive
- ✅ Settings are adjustable

### System Reliability
- ✅ All posts go out on time
- ✅ No duplicate participations
- ✅ Accurate ranking calculations
- ✅ Consecutive win rule enforced
- ✅ Database consistency maintained

### Performance
- ✅ Bot responds within 2 seconds
- ✅ Handles 100+ concurrent users
- ✅ No message delays
- ✅ Efficient database queries

---

## 📞 SUPPORT & MAINTENANCE

### Monitoring
- Track bot uptime
- Monitor error logs
- Check database performance
- Review user feedback

### Regular Tasks
- Backup database weekly
- Review challenge statistics
- Update Exness link if needed
- Adjust settings based on participation

### Future Enhancements
- Practice mode with old questions
- All-time leaderboard
- Streak tracking
- Multiple prize tiers
- Team challenges
- Monthly champions

---

**Document Version**: 1.0  
**Last Updated**: March 11, 2026  
**Status**: Ready for Implementation ✅
