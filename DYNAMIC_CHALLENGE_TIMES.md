# Dynamic Challenge Times Feature

## Overview
Challenges can now be scheduled at custom times instead of the fixed 8:00 PM (20:00) EAT. Each challenge can have its own start time.

## Changes Made

### 1. Database Schema
- Added `challenge_time` column to `challenges` table (TIME type, default '20:00:00')
- Migration script: `src/database/migrate_challenge_time.ts`

### 2. Challenge Creation Flow
When creating a challenge, admins now:
1. Select date (calendar)
2. **NEW:** Enter challenge time (HH:MM format, default 20:00)
3. Enter topic
4. Enter short text
5. Enter topic link
6. Add questions

**Time Format:** 24-hour format (HH:MM)
- Examples: 20:00, 14:00, 18:30
- Validates input format

### 3. Scheduler Updates
- **Old:** Fixed cron jobs at specific times (6 PM, 7:30 PM, 8 PM, 8:10 PM)
- **New:** Dynamic scheduler checks every minute for challenges that need actions

**Scheduler Logic:**
- Checks all challenges scheduled for today
- For each challenge, calculates:
  - 2-hour reminder time (challenge_time - 2 hours)
  - 30-minute reminder time (challenge_time - 30 minutes)
  - Challenge start time (challenge_time)
  - Challenge end time (challenge_time + 10 minutes)
- Triggers appropriate action when current time matches

### 4. Multiple Challenges Per Day
- System now supports multiple challenges on the same day
- Each challenge has its own time
- Morning post (10 AM) shows all challenges for the day
- 2-hour and 30-min reminders sent for each challenge separately
- User notifications (2 PM) sent once per day

### 5. Fixed Schedule Items
These remain at fixed times:
- **Morning Post:** 10:00 AM (shows all challenges for the day)
- **User Notifications:** 2:00 PM (sent once per day)
- **Admin Reminders:** 8:00 AM and 4:00 PM

## Migration Instructions

### Step 1: Run Database Migration
```bash
cd "BirrForex Challenges Bot"
npm run build
node dist/database/migrate_challenge_time.js
```

Or manually run the SQL:
```sql
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS challenge_time TIME DEFAULT '20:00:00';
```

### Step 2: Restart Bot
```bash
npm run build
npm start
```

## Usage Examples

### Creating a Challenge at 8:00 PM (default)
1. `/createchallenge`
2. Select date
3. Enter time: `20:00` (or just press enter for default)
4. Continue with topic, questions, etc.

### Creating a Challenge at 2:00 PM
1. `/createchallenge`
2. Select date
3. Enter time: `14:00`
4. Continue with topic, questions, etc.

### Creating Multiple Challenges on Same Day
1. Create first challenge at 14:00
2. Create second challenge at 20:00
3. Both will have separate reminders and start times

## Timeline Example

For a challenge scheduled at 20:00 (8:00 PM):
- **10:00 AM** - Morning post (all challenges for the day)
- **14:00 PM** - User notifications (once per day)
- **18:00 PM** - 2-hour reminder for this challenge
- **19:30 PM** - 30-minute reminder for this challenge
- **20:00 PM** - Challenge goes live
- **20:10 PM** - Challenge ends, results posted

For a challenge scheduled at 14:00 (2:00 PM):
- **10:00 AM** - Morning post (all challenges for the day)
- **12:00 PM** - 2-hour reminder for this challenge
- **13:30 PM** - 30-minute reminder for this challenge
- **14:00 PM** - Challenge goes live (+ user notifications sent)
- **14:10 PM** - Challenge ends, results posted

## Technical Details

### Challenge Time Storage
- Stored as TIME type in PostgreSQL
- Format: HH:MM:SS (e.g., '20:00:00')
- Displayed to users as HH:MM (e.g., '20:00')

### Scheduler Implementation
- Uses cron job running every minute: `* * * * *`
- Compares current time with calculated reminder/start/end times
- Handles multiple challenges per day automatically
- Prevents duplicate actions by checking challenge status

### API Changes
- `challengeService.createChallenge()` now accepts `challengeTime` parameter
- `challengeService.getChallengesByDate()` returns all challenges for a date
- Scheduler methods now accept optional `challengeId` parameter

## Backward Compatibility
- Existing challenges without `challenge_time` will default to 20:00:00
- Migration adds default value to existing records
- No data loss or breaking changes
