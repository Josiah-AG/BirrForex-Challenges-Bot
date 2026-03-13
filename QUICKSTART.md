# Quick Start Guide

## Setup (5 minutes)

### 1. Install Dependencies
```bash
cd "BirrForex Challenges Bot"
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env`:
```env
BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
ADMIN_USER_ID=123456789
DATABASE_URL=postgresql://localhost:5432/birrforex
MAIN_CHANNEL_ID=@BirrForex
CHALLENGE_CHANNEL_ID=@BirrForex_Challenges
```

### 3. Setup Database
```bash
# Start PostgreSQL (if local)
# Then run migrations:
npm run migrate
```

### 4. Start Bot
```bash
npm run dev
```

## First Challenge (2 minutes)

1. **Open Telegram** and find your bot
2. **Send** `/createchallenge`
3. **Follow prompts**:
   - Select day (Wednesday/Sunday)
   - Enter topic: "Test Challenge"
   - Enter short text: "This is a test"
   - Enter link: https://example.com
   - Enter number of questions: 3
   - Enter each question with 4 options
   - Select correct answer for each

4. **Confirm** and the challenge is scheduled!

## Testing

### Test User Flow
1. Click the challenge link from channel
2. Start quiz
3. Answer questions
4. See immediate feedback

### Test Admin Commands
- `/createchallenge` - Create new challenge
- `/passwinner` - Transfer prize to next winner
- `/cancelchallenge` - Cancel today's challenge
- `/settings` - View bot settings

### Test User Commands
- `/start` - Main menu
- `/mystats` - Personal statistics
- `/winners` - Previous winners
- `/next` - Next challenge info
- `/rules` - Challenge rules

## Scheduled Posts

The bot automatically posts:
- **10:00 AM** - Morning announcements
- **12:00 PM** - 2-hour reminder
- **1:30 PM** - 30-minute reminder
- **2:00 PM** - Challenge goes live
- **2:10 PM** - Challenge closes, results posted

## Common Issues

### Bot not starting
```bash
# Check logs
npm run dev

# Common fixes:
# - Verify BOT_TOKEN
# - Check DATABASE_URL
# - Ensure PostgreSQL is running
```

### Database connection failed
```bash
# Test connection
psql $DATABASE_URL

# Run migrations again
npm run migrate
```

### Channel posting fails
- Add bot as admin to both channels
- Verify channel IDs start with @
- Check bot has post permissions

## Next Steps

1. ✅ Create your first challenge
2. ✅ Test the complete user flow
3. ✅ Verify scheduled posts work
4. ✅ Deploy to Railway (see DEPLOYMENT.md)
5. ✅ Monitor first live challenge

## Need Help?

- Check `DEPLOYMENT.md` for detailed setup
- Review `BirrForex_Challenges_Bot_COMPLETE_USERFLOW.md` for full documentation
- Check Railway logs for errors
