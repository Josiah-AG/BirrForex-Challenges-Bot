# ⚡ Quick Deploy to Railway

## 🚀 5-Minute Deployment

### Step 1: Push to GitHub (30 seconds)

```bash
cd "BirrForex Challenges Bot"
git init
git add .
git commit -m "Deploy BirrForex Challenges Bot"
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

### Step 2: Deploy on Railway (2 minutes)

1. Go to [railway.app](https://railway.app)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your repository
5. Wait for auto-detection

### Step 3: Add Environment Variables (2 minutes)

Click on your bot service → **Variables** tab → **Raw Editor** → Paste:

```env
BOT_TOKEN=8747510882:AAHdN5OpYGH2EQWIfsyHqYEnaKzn_go7Btw
ADMIN_USER_ID=2138352441
MAIN_CHANNEL_ID=-1003738692599
CHALLENGE_CHANNEL_ID=-1003634710332
DATABASE_URL=${{Postgres.DATABASE_URL}}
TIMEZONE=Africa/Addis_Ababa
DEFAULT_PRIZE_AMOUNT=20
CHALLENGE_DURATION_MINUTES=10
PRIZE_CLAIM_DEADLINE_HOURS=1
BACKUP_LIST_SIZE=5
EXNESS_SIGNUP_LINK=https://one.exnesstrack.org/boarding/sign-up/a/bqsuza6sq1/?campaign=15636&track1=Birrforex
```

Click **Save**

### Step 4: Run Migration (30 seconds)

Install Railway CLI:
```bash
npm install -g @railway/cli
```

Run migration:
```bash
railway login
railway link
railway run node dist/database/migrate_challenge_time.js
```

### Step 5: Verify (30 seconds)

```bash
railway logs --follow
```

Look for:
```
✅ Database connected
✅ Scheduler started
✅ Bot started successfully!
```

## ✅ Done!

Your bot is now live on Railway!

Test it:
- Send `/start` to bot (should show restriction)
- As admin, send `/settings`
- Create a test challenge with `/createchallenge`

---

## 🔄 Replacing Existing Bot?

**Before deploying:**
```bash
# Backup database
railway link  # Link to existing project
railway run pg_dump $DATABASE_URL > backup.sql
```

**After deploying:**
1. Stop old bot in Railway dashboard
2. Keep the database running
3. Run migration (Step 4 above)

---

## 📚 Need More Details?

See `RAILWAY_DEPLOYMENT_GUIDE.md` for complete instructions.

---

**Ready in 5 minutes! 🚀**
