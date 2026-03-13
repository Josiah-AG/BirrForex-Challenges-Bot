# Railway Deployment Guide - BirrForex Challenges Bot

## Prerequisites

Before deploying, ensure you have:
- ✅ Railway account
- ✅ PostgreSQL database on Railway (or existing database)
- ✅ Telegram Bot Token
- ✅ Admin User ID
- ✅ Channel IDs (Main and Challenge channels)
- ✅ Exness signup link

## Deployment Steps

### Step 1: Prepare Your Railway Project

1. **Stop the old bot** (if replacing existing bot):
   - Go to your Railway project
   - Click on the bot service
   - Click "Settings" → "Pause Service" or delete it

2. **Keep your database**:
   - DO NOT delete the PostgreSQL database
   - Note down the database connection string

### Step 2: Deploy New Bot

#### Option A: Deploy from GitHub (Recommended)

1. **Push code to GitHub**:
   ```bash
   cd "BirrForex Challenges Bot"
   git init
   git add .
   git commit -m "Initial commit - BirrForex Challenges Bot"
   git branch -M main
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Deploy on Railway**:
   - Go to Railway dashboard
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Railway will auto-detect the configuration

#### Option B: Deploy from Local (CLI)

1. **Install Railway CLI**:
   ```bash
   npm install -g @railway/cli
   ```

2. **Login and deploy**:
   ```bash
   cd "BirrForex Challenges Bot"
   railway login
   railway link  # Link to existing project or create new
   railway up
   ```

### Step 3: Configure Environment Variables

In Railway dashboard, go to your bot service → Variables tab and add:

```env
# Bot Configuration
BOT_TOKEN=your_bot_token_here
ADMIN_USER_ID=2138352441

# Channels
MAIN_CHANNEL_ID=-1003738692599
CHALLENGE_CHANNEL_ID=-1003634710332

# Database (use Railway's PostgreSQL)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Bot Settings
TIMEZONE=Africa/Addis_Ababa
DEFAULT_PRIZE_AMOUNT=20
CHALLENGE_DURATION_MINUTES=10
PRIZE_CLAIM_DEADLINE_HOURS=1
BACKUP_LIST_SIZE=5

# External Links
EXNESS_SIGNUP_LINK=your_exness_link_here

# Schedule (EAT - East Africa Time)
MORNING_POST_TIME=10:00
TWO_HOUR_REMINDER_TIME=18:00
THIRTY_MIN_REMINDER_TIME=19:30
CHALLENGE_TIME=20:00
RESULTS_TIME=20:10
```

**Important**: 
- Replace `your_bot_token_here` with your actual bot token
- Replace `your_exness_link_here` with your Exness referral link
- The `DATABASE_URL` will auto-populate from your PostgreSQL service

### Step 4: Run Database Migration

After deployment, run the migration to add the `challenge_time` column:

1. **Using Railway CLI**:
   ```bash
   railway run node dist/database/migrate_challenge_time.js
   ```

2. **Or connect to database directly**:
   ```sql
   ALTER TABLE challenges ADD COLUMN IF NOT EXISTS challenge_time TIME DEFAULT '20:00:00';
   ```

### Step 5: Upload Banner Image

The bot needs the weekly challenges banner image:

1. **Using Railway CLI**:
   ```bash
   # SSH into your Railway service
   railway shell
   
   # Create assets directory
   mkdir -p assets
   
   # Exit and upload image
   exit
   railway run --service <your-service-name> cp assets/weekly_challenges_banner.jpg /app/assets/
   ```

2. **Or rebuild with image**:
   - Ensure `assets/weekly_challenges_banner.jpg` exists in your repo
   - Push to GitHub
   - Railway will rebuild automatically

### Step 6: Verify Deployment

1. **Check logs**:
   ```bash
   railway logs
   ```

   You should see:
   ```
   🚀 Starting BirrForex Challenges Bot...
   ✅ Database connected
   ✅ Scheduler started
   ```

2. **Test the bot**:
   - Send `/start` to your bot (should show access restriction message)
   - As admin, send `/settings` to verify configuration
   - Use `/createchallenge` to test challenge creation

### Step 7: Set Bot Commands

The bot automatically sets commands, but verify:

1. Open your bot in Telegram
2. Type `/` to see available commands
3. Regular users should see NO commands
4. Admin should see all admin commands

## Post-Deployment Checklist

- [ ] Bot responds to messages
- [ ] Database connection working
- [ ] Scheduler started successfully
- [ ] Admin commands accessible
- [ ] Regular users see access restriction
- [ ] Banner image displays in morning posts
- [ ] Test challenge creation works
- [ ] Notifications system working

## Troubleshooting

### Bot not starting
- Check `railway logs` for errors
- Verify all environment variables are set
- Ensure DATABASE_URL is correct

### Database connection failed
- Check if PostgreSQL service is running
- Verify DATABASE_URL format
- Run migration if needed

### Scheduler not working
- Check timezone setting (TIMEZONE=Africa/Addis_Ababa)
- Verify cron expressions in logs
- Ensure bot has been running for at least 1 minute

### Images not showing
- Verify `assets/weekly_challenges_banner.jpg` exists
- Check file permissions
- Rebuild deployment if needed

## Monitoring

### View Logs
```bash
railway logs --follow
```

### Check Service Status
```bash
railway status
```

### Restart Service
```bash
railway restart
```

## Updating the Bot

### From GitHub
1. Push changes to GitHub
2. Railway auto-deploys on push

### From CLI
```bash
railway up
```

## Database Backup

**Important**: Always backup before major changes!

```bash
# Export database
railway run pg_dump $DATABASE_URL > backup.sql

# Restore if needed
railway run psql $DATABASE_URL < backup.sql
```

## Support

If you encounter issues:
1. Check Railway logs: `railway logs`
2. Verify environment variables
3. Test database connection
4. Check bot token validity

## Migration from Old Bot

If replacing an existing bot:

1. **Backup old database**:
   ```bash
   railway run pg_dump $DATABASE_URL > old_bot_backup.sql
   ```

2. **Deploy new bot** (follow steps above)

3. **Run migration**:
   ```bash
   railway run node dist/database/migrate_challenge_time.js
   ```

4. **Test thoroughly** before going live

5. **Update bot token** in channels if needed

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| BOT_TOKEN | Yes | - | Telegram bot token |
| ADMIN_USER_ID | Yes | - | Admin's Telegram user ID |
| MAIN_CHANNEL_ID | Yes | - | Main channel ID |
| CHALLENGE_CHANNEL_ID | Yes | - | Challenge channel ID |
| DATABASE_URL | Yes | - | PostgreSQL connection string |
| TIMEZONE | No | Africa/Addis_Ababa | Bot timezone |
| DEFAULT_PRIZE_AMOUNT | No | 20 | Default prize in USD |
| CHALLENGE_DURATION_MINUTES | No | 10 | Challenge duration |
| PRIZE_CLAIM_DEADLINE_HOURS | No | 1 | Prize claim deadline |
| BACKUP_LIST_SIZE | No | 5 | Number of backup winners |
| EXNESS_SIGNUP_LINK | Yes | - | Exness referral link |

## Success Indicators

Your bot is successfully deployed when:
- ✅ Logs show "Bot started successfully"
- ✅ Scheduler is running
- ✅ Database connected
- ✅ Bot responds to admin commands
- ✅ Regular users see access restriction
- ✅ Morning posts include banner image
- ✅ Challenges can be created and run

---

**Ready to deploy!** 🚀
