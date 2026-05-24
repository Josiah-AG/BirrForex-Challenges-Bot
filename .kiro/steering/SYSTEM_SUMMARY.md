---
inclusion: auto
---

# BirrForex Challenges System — Complete Reference

## ARCHITECTURE OVERVIEW

Three interconnected projects + VPS bridge, all sharing one PostgreSQL database on Railway.

```
┌─────────────────────────────────────────────────────────────────┐
│                        RAILWAY (Cloud)                           │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ TG Bot + API     │  │ Discord Bot      │  │ WinnerPip    │ │
│  │ (Node.js/TS)     │  │ (Python)         │  │ (Next.js 14) │ │
│  │ Port: 3000       │  │                  │  │              │ │
│  └────────┬─────────┘  └────────┬─────────┘  └──────┬───────┘ │
│           │                      │                    │         │
│           └──────────┬───────────┘                    │         │
│                      ▼                                │         │
│           ┌──────────────────┐                        │         │
│           │ PostgreSQL (DB)  │◄───────────────────────┘         │
│           └──────────────────┘                                  │
└─────────────────────────────────────────────────────────────────┘
                      │
                      │ HTTP (VPS_API_URL)
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   WINDOWS VPS (108.181.184.223)                  │
│                                                                 │
│  Router (port 8000) → Workers (ports 8001-8010)                 │
│  Each worker owns 1 MT5 terminal (C:\MetaTrader\Terminal 1-10)  │
│  Base Account: 435924397 / Exness-MT5Trial9 / Abc@1234 (USD)    │
└─────────────────────────────────────────────────────────────────┘
```

## REPOSITORIES

| Project | Repo | Railway Service |
|---------|------|-----------------|
| TG Bot + API | `Josiah-AG/BirrForex-Challenges-Bot` | "BirrForex-Challenges-Bot" |
| Discord Bot | `Josiah-AG/BirrForex-Teams-Monitoring-Discord-Bot` | Separate Railway service |
| WinnerPip | Same repo as TG Bot (`WinnerPip/winnerpip/`) | "web" service |
| VPS | Same repo (`vps/`) | NOT on Railway — runs on Windows VPS |

## CRITICAL CREDENTIALS & IDs

- **VPS IP:** 108.181.184.223, port 8000
- **VPS API Key:** wp-k8x2m9f4v7j3n6q1w5t8r2y4u7i0p3
- **Base Account (Demo, USD):** 435924397 / Exness-MT5Trial9 / Abc@1234
- **Test Cent Account (Real, USC):** 161584895 / Exness-MT5Real21 / Aa@11221234
- **Discord MEMBER_ROLE_ID:** 1477959520759189647
- **Discord CHALLENGES_CHANNEL_ID:** 1505636919948738693
- **Discord MODERATOR_CHANNEL_ID:** 1477956636525068423
- **Admin Telegram ID:** 2138352441

## TIMING (ALL IN EAT = UTC+3)

- **Pull Schedule:** 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 EAT
- **Cron (UTC):** `0 21,1,5,9,13,17 * * *`
- **Discord Announcements:** Polled every 1 minute by Discord bot
- **Partnership Screening:** 02:00 AM and 02:00 PM EAT
- **Daily Summary:** 08:00 AM EAT
- **Countdown Posts:** 08:00 EAT (3, 2, 1 day before start)
- **Keep-Alive:** 04:00 and 16:00 EAT (Task Scheduler on VPS)

## PROJECT 1: TG BOT + API (Node.js/TypeScript)

### Entry Point: `src/index.ts`
Starts: Bot → Scheduler → TradingScheduler → VpsPullScheduler → API Server

### Key Files:
| File | Purpose |
|------|---------|
| `src/bot/bot.ts` | Telegraf bot, command handlers, callback handlers |
| `src/bot/tradingRegistrationHandler.ts` | Challenge registration DM flow (email → account → server → password → VPS verify → nickname) |
| `src/bot/tradingAdminHandler.ts` | Admin commands for trading challenges |
| `src/bot/adminHandler.ts` | Weekly quiz admin commands |
| `src/bot/quizHandler.ts` | Weekly quiz participation flow |
| `src/bot/evaluationHandler.ts` | Legacy MT5 file evaluation (xlsx upload) |
| `src/api/server.ts` | Express API (WinnerPip endpoints, admin endpoints, auth) |
| `src/api/discordRoutes.ts` | Discord bot API endpoints (challenge CRUD, registration, verify) |
| `src/scheduler/tradingScheduler.ts` | Countdown posts, daily posts, challenge start/end, Discord messages |
| `src/scheduler/vpsPullScheduler.ts` | VPS pull cycles (shared queue, per-account eval, staging→live) |
| `src/scheduler/scheduler.ts` | Weekly quiz scheduling |
| `src/services/wpEvaluationEngine.ts` | Rule engine (lot size, SL, drawdown, hold time, weekend, fake SL detection) |
| `src/services/leaderboardService.ts` | Ranking (4 tiers), staging flush, ensureAllParticipants |
| `src/services/vpsService.ts` | VPS API client (verify, server list, fuzzy match) |
| `src/services/tradingChallengeService.ts` | Challenge CRUD, registration, stats |
| `src/services/exnessService.ts` | Exness Partnership API (allocation check, KYC) |
| `src/database/migrate.ts` | Schema migrations (safe to re-run) |
| `src/database/trading_schema.sql` | Trading challenge tables |
| `src/database/wp_schema.sql` | WinnerPip tables (trades, deals, leaderboard, rules) |
| `src/config.ts` | All env vars with defaults |
| `vps/worker.py` | MT5 worker (one per terminal, FastAPI on ports 8001-8010) |
| `vps/router.py` | VPS router (port 8000, round-robin + failover) |
| `vps/keepalive.py` | Twice-daily trade to prevent demo account archival |
| `vps/start_vps.bat` | Launches 10 terminals + 10 workers + router |

### API Endpoints (server.ts):
| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/auth/login` | Rate limited | User login (account_number + investor_password) |
| `GET /api/challenges/:id` | Token | Challenge info for client dashboard |
| `GET /api/challenges/:id/leaderboard` | Token | Leaderboard data (paginated, per account_type) |
| `GET /api/challenges/:id/my-stats` | Token | User's own stats |
| `GET /api/admin/:path/overview` | IP + path | Admin overview (participants, trades, balance) |
| `GET /api/admin/:path/vps-health?deep=true` | IP + path | VPS health + per-terminal login test |
| `POST /api/admin/:path/challenge/:id/force-pull` | IP + path | Trigger manual pull cycle |
| `POST /api/admin/:path/challenge/:id/verify-account` | IP + path | Shield icon — verify credentials + save balance |

### Discord API Endpoints (discordRoutes.ts):
| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/discord/challenges` | API key | Create challenge |
| `GET /api/discord/challenges/:id` | API key | Get challenge + participant counts |
| `POST /api/discord/challenges/:id/register` | API key | Register participant |
| `POST /api/discord/verify-connection` | API key | Pre-save VPS verify (with cent detection + balance check) |
| `POST /api/discord/challenges/:id/verify/:regId` | API key | Post-save VPS verify |
| `GET /api/discord/pending-announcements` | API key | Polled by Discord bot for new announcements |
| `GET /api/discord/pending-lastchance` | API key | Polled for last-chance-to-register messages |

## PROJECT 2: DISCORD BOT (Python)

### Key Files:
| File | Purpose |
|------|---------|
| `bot.py` | Main bot (8000+ lines): onboarding, attendance, screening, challenge commands |
| `challenge_bot.py` | Challenge module: registration DM flow, scheduled posts, polling |
| `attendance_db.py` | SQLite DB for attendance, excuses, member emails |

### Key Features:
- **Onboarding:** User clicks "Submit Exness Account" → DM flow → email verify → auto-approve or manual review
- **Attendance:** Stage channel tracking, daily summaries, excuse system
- **Partnership Screening:** Twice daily check if members are still under BirrForex
- **Challenge Registration:** Button in #challenges → DM flow → VPS verify → save to PostgreSQL
- **Scheduled Posts:** Polls TG Bot API every 1 min for pending announcements/lastchance

### Key Commands:
| Command | Purpose |
|---------|---------|
| `!help` | Full command list |
| `!createchallenge` | Create new trading challenge |
| `!startchallenge <id>` | Start challenge + post announcement |
| `!lastchance <id>` | Post "Last Chance to Register" with Register button |
| `!challengestatus <id>` | View challenge status |
| `!challengelb <id>` | View leaderboard |
| `!postresults <id>` | Post winners |
| `!deletechallenge` | Delete a challenge |

### Session Persistence:
- `data/challenge_registration_sessions.json` — persists mid-registration users (24h window)
- `data/bot_data.json` — persists submission state, threads, metrics
- On restart: proactively DMs interrupted users with "Register Again" button

## PROJECT 3: WINNERPIP FRONTEND (Next.js 14)

### Key Pages:
| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/challenges` | List of active challenges |
| `/challenge/[id]` | Client dashboard (login required) |
| `/login` | Login with account_number + investor_password |
| `/admin/panel` | Admin panel (accessed via secret path `/{WINNERPIP_ADMIN_PATH}`) |

### Admin Panel Tabs:
Overview | Participants | Leaderboard | Violations | Pulls | Screening | Rules | Settings | Health (⚡)

### Middleware:
- Blocks direct `/admin/*` access (returns 404)
- Rewrites `/{secretPath}` → `/admin/panel`

## VPS SYSTEM (Windows Server)

### Architecture:
```
start_vps.bat
  ├── Launches 10 MT5 terminals (C:\MetaTrader\Terminal 1-10)
  ├── Starts 10 workers (py -3.12 vps\worker.py 1 8001 ... 10 8010)
  └── Starts router (py -3.12 vps\router.py on port 8000)
```

### Worker (worker.py):
- Each worker owns ONE terminal exclusively
- Persistent IPC: no shutdown between requests, direct login switch
- Self-healing: if terminal gets stuck, kill and relaunch
- Idle restore: login to base account after 30s of no activity
- Returns: `balance`, `equity`, `currency`, `server`, `account_name`

### Router (router.py):
- Round-robin for `/verify` (or target specific terminal with `terminal_id`)
- Smart retry for `/pull`: assigned terminal → failover to 2 others
- Credential errors: return immediately, no retry
- Terminal errors: retry same terminal, then switch

### Cent Detection:
- VPS `/verify` returns `"currency": "USC"` for cent accounts, `"currency": "USD"` for standard
- Used at registration to detect account type and enforce cent-only challenges

## EVALUATION ENGINE (wpEvaluationEngine.ts)

### Rules Checked Per Trade:
1. Max lot size
2. Max simultaneous open trades
3. Same-pair limit
4. Stop loss required + max SL risk (ratio-based calculation)
5. Fake SL detection (M1 candle data)
6. Daily drawdown cap (profits after breach don't count)
7. Max hold time
8. No weekend trading

### Profit Calculation:
- `profit = currentBalance - actualStartingBalance`
- `adjustedBalance = actualStartingBalance + qualifiedProfit` (flagged trade profits removed)
- 0 trades = $0 profit (hasn't started)
- Deposit detection: first deposit = starting balance, second deposit = DQ (recharging)

### Ranking (4 Tiers per account_type):
1. Active traders (has trades, balance > 0) — by normalized_balance DESC
2. Haven't started (0 trades) — by registration date ASC
3. Blown accounts (had trades, balance ≤ 0) — by zero_balance_at DESC
4. Disqualified — by disqualified_at DESC

### Staging Architecture:
- Evaluation writes to `wp_leaderboard_staging`
- Flush to live happens at START of next pull cycle
- Client sees "Data from: 00:00 – 04:00 EAT • Next update: 08:00 EAT"

## CENT ACCOUNT HANDLING

### Detection:
- VPS returns `currency` field: `USC` = cent, `USD` = standard
- Saved as `is_cent = true` on `trading_registrations`

### Challenge Types:
- **Cent-only real:** Admin enters values in cent terms. Only USC accounts accepted.
- **Hybrid + cent-only:** Admin enters in $ terms. System converts ×100 for cent users.
- **Mixed (cent-only OFF):** Users can choose cent or standard. System detects per-user.

### Display:
- Cent users: all values shown with `¢` suffix (profit, balance, leaderboard)
- Standard users: all values shown with `$` prefix
- Admin overview "Total Balance": normalized to $ (cent balances ÷ 100)
- Leaderboard ranking uses `normalized_balance` (adjusted balance in $ equivalent)

## EXNESS SUFFIXES

| Suffix | Account Type |
|--------|-------------|
| `-m` | Standard |
| `-c` | Standard Cent |
| `-r` | Raw Spread |
| `-z` | Zero |

## KEY BUSINESS RULES

1. Real accounts: users can start below starting_balance, profit = currentBalance - their actual start
2. Demo accounts: balance must be exactly starting_balance
3. 0 balance + 0 trades = keep pulling (hasn't deposited yet)
4. 0 balance + had trades = stop pulling (blown account)
5. First deposit after challenge start = actual starting balance
6. Second deposit = DQ (recharging)
7. Swap/commission/dividends are NOT deposits but their values count in balance
8. Investor passwords stored as plaintext (read-only MT5 passwords, accepted)
9. Late deposit cutoff: stops pulling users who can't meet min_active_days
10. For Discord challenges: Telegram scheduler skips countdown/engagement posts (source='discord')

## RESTART HANDLING

### Telegram Bot:
- Sessions persisted to `data/tg_registration_sessions.json`
- On startup (5s delay): DMs users with sessions < 24h old with "Register Again" button
- Old "wait for DM" handler removed

### Discord Bot:
- Sessions persisted to `data/challenge_registration_sessions.json`
- Account submissions persisted in `data/bot_data.json`
- On startup: DMs both groups with appropriate restart buttons
- Sessions > 24h old are silently discarded

### VPS Pull Scheduler:
- Checks `wp_leaderboard_staging` on startup for interrupted cycles
- If staging has data, resumes pulling remaining accounts
