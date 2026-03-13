# 🚀 Railway Deployment Checklist

## Pre-Deploymentication

### ✅ Code & Configuration
- [x] All features implemented and tested
- [x] `Procfile` created for Railway
- [x] `nixpacks.toml` configured
- [x] `railway.json` configured
- [x] `.gitignore` excludes sensitive files
- [x] `.env.example` provided as template
- [x] TypeScript compilation working (`npm run build`)
- [x] All dependencies in `package.json`

### ✅ Assets
- [x] Banner image exists: `assets/weekly_challenges_banner.jpg`
- [x] Assets README documented

### ✅ Database
- [x] Schema file ready: `src/database/schema.sql`
- [x] Migration script ready: `src/database/migrate_challenge_time.ts`
- [x] Database connection configured

### ✅ Bot Configuration
- [x] Bot token configured
- [x] Admin user ID set
- [x] Channel IDs configured
- [x] Timezone set to Africa/Addis_Ababa
- [x] All schedule times configured

### ✅ Features Verified
- [x] Dynamic challenge times
- [x] Multiple challenges per day support
- [x] Morning posts with banner
ur and 30-min reminders
- [x] Challenge live posting
- [x] Results posting with milliseconds
- [x] Winner and backup notifications
- [x] User notification system
- [x] Admin commands (create, list, edit, delete, post now)
- [x] Past challenges management
- [x] Ranking system based on completion time
- [x] HTML formatted messages

---

## Railway Deployment Steps

### Step 1: Prepare Repository

```bash
cd "BirrForex Challenges Bot"

# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Production ready - BirrForex Challenges Bot"

# Add remote (replace with your repo URL)
git remote add origin https://github.com/yourusername/birrforex-challenges-bot.git

# Push to GitHub
push -u origin main
```

### Step 2: Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
jobs respect this timezone
- Challenge times are in 24-hour format

---

**Version**: 1.0.0  
**Status**: Production Ready ✅  
**Last Updated**: March 2026

**Ready to deploy!** 🚀
Update dependencies** - Keep packages up to date

### Environment Variables Priority

Railway uses this precedence:
1. Service variables (highest priority)
2. Shared variables
3. Plugin variables (like DATABASE_URL)

### Database Connection

The `DATABASE_URL` variable is automatically provided by Railway's PostgreSQL plugin. Use the reference syntax:
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

### Timezone

All times are in EAT (East Africa Time). The bot uses:
- `TIMEZONE=Africa/Addis_Ababa`
- All cron ays correctly

---

## Support Resources

- **Railway Docs**: https://docs.railway.app
- **Telegram Bot API**: https://core.telegram.org/bots/api
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Node.js Docs**: https://nodejs.org/docs/

---

## Final Notes

### Important Reminders

1. **Keep .env file secure** - Never commit to git
2. **Backup database regularly** - Before major changes
3. **Test in development first** - Before deploying to production
4. **Monitor logs** - Check for errors regularly
5. **ata
SELECT * FROM challenges ORDER BY date DESC LIMIT 5;
```

---

## Success Indicators

Your bot is successfully deployed when:

✅ Logs show "Bot started successfully"
✅ Scheduler is running
✅ Database connected
✅ Bot responds to admin commands
✅ Regular users see access restriction
✅ Morning posts include banner image
✅ Challenges can be created with custom times
✅ All scheduled posts work correctly
✅ Notifications send properly
✅ Rankings calculate correctly
✅ Winner selection works
✅ HTML formatting displ
railway restart
```

### Check Environment Variables
```bash
railway variables
```

---

## Maintenance

### Update Bot Code

```bash
# Make changes locally
git add .
git commit -m "Update: description"
git push

# Railway auto-deploys on push
```

### Database Backup

```bash
# Regular backup
railway run pg_dump $DATABASE_URL > backup.sql

# Restore if needed
railway run psql $DATABASE_URL < backup.sql
```

### View Database

```bash
# Connect to database
railway run psql $DATABASE_URL

# List tables
\dt

# Query dld
git add assets/
git commit -m "Add banner image"
git push
```

### Commands Not Working

**Check:**
- Bot commands are set
- User has correct permissions
- Session not expired

**Fix:**
```bash
# Restart bot to reset commands
railway restart
```

---

## Monitoring

### View Logs
```bash
# Follow logs in real-time
railway logs --follow

# View last 100 lines
railway logs --lines 100

# Filter logs
railway logs | grep "ERROR"
```

### Check Service Status
```bash
railway status
```

### Restart Service
```bashShowing

**Check:**
- `assets/weekly_challenges_banner.jpg` exists
- File path is correct
- File permissions

**Fix:**
```bash
# Verify file exists
railway run ls -la assets/

# If missing, rebuionnection Failed

**Check:**
- DATABASE_URL is correct
- PostgreSQL service is running
- Network connectivity

**Fix:**
```bash
# Verify database URL
railway variables

# Restart database
railway restart --service postgres
```

### Scheduler Not Working

**Check:**
- Timezone setting (TIMEZONE=Africa/Addis_Ababa)
- Cron expressions in logs
- Bot has been running for 1+ minute

**Fix:**
```bash
# Check logs for scheduler messages
railway logs | grep "Scheduler"

# Restart bot
railway restart
```

### Images Not 
```

### Step 5: Verify
- Check logs for successful startup
- Test admin commands
- Verify scheduled challenges still exist
- Test creating new challenge

---

## Troubleshooting

### Bot Not Starting

**Check logs:**
```bash
railway logs
```

**Common issues:**
- Missing environment variables
- Invalid bot token
- Database connection failed
- Port already in use

**Solutions:**
1. Verify all required env vars are set
2. Check bot token is valid
3. Verify DATABASE_URL format
4. Restart service

### Database C

If you're replacing an existing bot on Railway:

### Step 1: Backup Current Database
```bash
# Connect to Railway
railway link

# Backup database
railway run pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

### Step 2: Stop Old Bot
1. Go to Railway dashboard
2. Find old bot service
3. Click "Settings" → "Pause Service"
4. **DO NOT delete the database**

### Step 3: Deploy New Bot
Follow deployment steps above

### Step 4: Run Migration
```bash
railway run node dist/database/migrate_challenge_time.js
- [ ] Link previews disabled
- [ ] Buttons work
- [ ] Inline keyboards functional

---

## Replacing Existing Boterly
- [ ] Delete functionality works
- [ ] Post now feature works

### ✅ Notifications
- [ ] Morning posts send with banner
- [ ] 2-hour reminder sends to main channel
- [ ] 30-min reminder sends to main channel
- [ ] Challenge goes live in challenge channel
- [ ] Results post correctly
- [ ] User notifications work
- [ ] Winner notifications send
- [ ] Backup notifications send

### ✅ Message Formatting
- [ ] HTML formatting displays correctly
- [ ] Bold text works
- [ ] Italic text works
- [ ] Emojis displaydation works
- [ ] List challenges shows correct data
- [ ] Past challenges displays propment Verification

### ✅ Bot Functionality
- [ ] Bot responds to messages
- [ ] Admin commands work
- [ ] Regular users see access restriction
- [ ] Deep links work from channels

### ✅ Database
- [ ] Connection successful
- [ ] Tables created
- [ ] Migration applied
- [ ] Queries working

### ✅ Scheduler
- [ ] Scheduler started
- [ ] Cron jobs registered
- [ ] No errors in logs

### ✅ Features
- [ ] Challenge creation works
- [ ] Questions can be added
- [ ] Calendar date selection works
- [ ] Time input valiould show access restriction)
2. As admin, send `/settings` (should show configuration)
3. Create a test challenge with `/createchallenge`

---

## Post-DeployThen run:
node dist/database/migrate_challenge_time.js
```

**Option C: Direct Database Connection**
```sql
-- Connect to your PostgreSQL database
-- Run this SQL:
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS challenge_time TIME DEFAULT '20:00:00';
```

### Step 7: Verify Deployment

**Check Logs:**
```bash
railway logs --follow
```

**Expected Output:**
```
🚀 Starting BirrForex Challenges Bot...
✅ Database connected
✅ Scheduler started
✅ Bot started successfully!
```

**Test Bot:**
1. Send `/start` to bot (shSULTS_TIME=20:10
```

### Step 5: Deploy

1. Railway will automatically build and deploy
2. Monitor the deployment logs
3. Wait for "✅ Bot started successfully!" message

### Step 6: Run Database Migration

**Option A: Using Railway CLI**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Run migration
railway run node dist/database/migrate_challenge_time.js
```

**Option B: Using Railway Shell**
```bash
# Open shell in Railway dashboard
# _TIME=18:00
THIRTY_MIN_REMINDER_TIME=19:30
CHALLENGE_TIME=20:00
REOKEN=8747510882:AAHdN5OpYGH2EQWIfsyHqYEnaKzn_go7Btw
ADMIN_USER_ID=2138352441
MAIN_CHANNEL_ID=-1003738692599
CHALLENGE_CHANNEL_ID=-1003634710332
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

**Optional Variables (with defaults):**
```env
TIMEZONE=Africa/Addis_Ababa
DEFAULT_PRIZE_AMOUNT=20
CHALLENGE_DURATION_MINUTES=10
PRIZE_CLAIM_DEADLINE_HOURS=1
BACKUP_LIST_SIZE=5
EXNESS_SIGNUP_LINK=https://one.exnesstrack.org/boarding/sign-up/a/bqsuza6sq1/?campaign=15636&track1=Birrforex
MORNING_POST_TIME=10:00
TWO_HOUR_REMINDER
**Required Variables:**
```env
BOT_T5. Railway will auto-detect configuration

### Step 3: Add PostgreSQL Database

1. In your Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Wait for database to provision
4. Note the connection details

### Step 4: Configure Environment Variables

In Railway dashboard → Your bot service → Variables tab:
