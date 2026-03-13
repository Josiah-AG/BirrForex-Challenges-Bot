# Deployment Guide

## Prerequisites

1. **Telegram Bot Token**
   - Talk to [@BotFather](https://t.me/BotFather) on Telegram
   - Create a new bot with `/newbot`
   - Save the bot token

2. **PostgreSQL Database**
   - Railway provides free PostgreSQL
   - Or use any PostgreSQL provider

3. **Admin User ID**
   - Talk to [@userinfobot](https://t.me/userinfobot) on Telegram
   - Get your Telegram user ID

4. **Channels**
   - Create two Telegram channels:
     - Main channel (e.g., @BirrForex)
     - Challenge channel (e.g., @BirrForex_Challenges)
   - Add your bot as admin to both channels

## Local Development

1. **Install dependencies**
   ```bash
   cd "BirrForex Challenges Bot"
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and fill in your values:
   ```
   BOT_TOKEN=your_bot_token
   ADMIN_USER_ID=your_telegram_id
   DATABASE_URL=postgresql://user:password@localhost:5432/birrforex
   MAIN_CHANNEL_ID=@BirrForex
   CHALLENGE_CHANNEL_ID=@BirrForex_Challenges
   ```

3. **Run database migrations**
   ```bash
   npm run migrate
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

## Railway Deployment

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your repository

3. **Add PostgreSQL**
   - Click "New"
   - Select "Database"
   - Choose "PostgreSQL"
   - Railway will automatically set DATABASE_URL

4. **Set Environment Variables**
   - Go to your service settings
   - Add these variables:
     ```
     BOT_TOKEN=your_bot_token
     ADMIN_USER_ID=your_telegram_id
     MAIN_CHANNEL_ID=@BirrForex
     CHALLENGE_CHANNEL_ID=@BirrForex_Challenges
     EXNESS_SIGNUP_LINK=your_exness_link
     ```

5. **Run Migrations**
   - In Railway dashboard, go to your service
   - Click "Settings" → "Deploy"
   - Add a one-time command: `npm run migrate`
   - Or SSH into the service and run it manually

6. **Deploy**
   - Railway will automatically deploy on push to main branch
   - Check logs to ensure bot started successfully

## Post-Deployment

1. **Test the bot**
   - Send `/start` to your bot
   - Verify menu appears

2. **Create first challenge**
   - Send `/createchallenge` to the bot
   - Follow the prompts

3. **Verify channels**
   - Ensure bot can post to both channels
   - Check bot has admin rights

4. **Monitor logs**
   - Watch Railway logs for any errors
   - Check scheduled posts are working

## Troubleshooting

### Bot not responding
- Check BOT_TOKEN is correct
- Verify bot is running in Railway logs
- Ensure no other instance is running

### Database errors
- Verify DATABASE_URL is set
- Check migrations ran successfully
- Ensure PostgreSQL is running

### Channel posting fails
- Verify bot is admin in both channels
- Check channel IDs are correct (with @)
- Ensure bot has permission to post

### Scheduled posts not working
- Check timezone is correct (Africa/Addis_Ababa)
- Verify cron expressions in scheduler.ts
- Ensure bot is running continuously

## Maintenance

### Backup Database
```bash
pg_dump $DATABASE_URL > backup.sql
```

### View Logs
```bash
# In Railway dashboard
# Go to your service → Logs
```

### Update Bot
```bash
git push origin main
# Railway auto-deploys
```

## Support

For issues, check:
1. Railway logs
2. Database connection
3. Environment variables
4. Bot permissions in channels
