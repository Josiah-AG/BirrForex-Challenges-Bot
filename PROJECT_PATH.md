# PROJECT PATH — BirrForex Challenges Bot → WinnerPip Platform

> This document traces the complete evolution of the project from initial commit to present.
> Use it as reference for understanding how the system grew, what decisions were made, and why.

---

## TIMELINE OVERVIEW

| Phase | Dates | Summary |
|-------|-------|---------|
| Phase 1 | Mar 13, 2026 | Initial Quiz Bot — weekly Telegram challenges |
| Phase 2 | Mar 14–18, 2026 | Quiz bot polish — scheduler, timezones, UI fixes |
| Phase 3 | Mar 26–28, 2026 | Trading Challenge System added to bot |
| Phase 4 | Apr 5–22, 2026 | Registration hardening, admin tools, engagement |
| Phase 5 | Apr 29 – May 5, 2026 | Trade Evaluation Engine (manual, file-based) |
| Phase 6 | May 8–14, 2026 | Multi-winner weekly quizzes, /passwinner rework |
| Phase 7 | May 15–16, 2026 | WinnerPip integration begins — VPS, schema, frontend |
| Phase 8 | May 16–24, 2026 | WinnerPip frontend + admin panel buildout |
| Phase 9 | May 25 – Jun 5, 2026 | VPS Pull System hardening (v3→v6→v9) |
| Phase 10 | Jun 5–18, 2026 | Credential failure handling, fake SL detection |
| Phase 11 | Jun 27 – Jul 7, 2026 | Partial closes, reconciliation, leaderboard polish |

---

## PHASE 1 — THE ORIGINAL QUIZ BOT (Mar 13, 2026)

**What it was:**
A standalone Telegram bot for BirrForex that ran weekly quiz challenges in a Telegram channel.

**Tech stack:**
- TypeScript + Telegraf (Telegram Bot API)
- PostgreSQL database
- node-cron scheduler
- Railway hosting

**Core features:**
- Admin creates quiz challenges via `/createchallenge`
- 3–10 multiple choice questions per challenge
- Scheduled announcements (10 AM morning post, reminders, live post)
- Users join from channel, answer in bot DM
- Speed-based ranking among perfect scorers
- Consecutive win prevention (can't win twice in a row)
- Automated winner selection and announcement

**Database:** 6 tables — `users`, `challenges`, `questions`, `participants`, `winners`, `settings`

**Key files:** `src/bot/bot.ts`, `src/bot/quizHandler.ts`, `src/bot/adminHandler.ts`, `src/scheduler/scheduler.ts`

---

## PHASE 2 — QUIZ BOT POLISH (Mar 14–18, 2026)

**Problems solved:**
- Timezone handling (UTC vs EAT) — all dates now stored and displayed in EAT
- Dynamic challenge times (not just 2 PM — any time)
- Channel post formatting (arrows, bold usernames, proper buttons)
- Scheduler preventing duplicate posts with 5-minute windows
- Smart time display — show milliseconds only when users tie at same second
- Live 5-minute countdown before challenge starts

**No architecture changes.** Just reliability and polish for production.

---

## PHASE 3 — TRADING CHALLENGE SYSTEM (Mar 26–28, 2026)

**The big addition:**
A complete trading challenge module was added to the same Telegram bot. This allowed BirrForex to host forex trading competitions alongside the weekly quizzes.

**How it worked (v1, pre-WinnerPip):**
1. Admin creates trading challenge with dates, prize pool, categories (demo/real/hybrid)
2. Users register via bot: provide Exness email → verified via Exness Partnership API
3. Users submit account number → verified as MT5 (not MT4), equity checked
4. During the challenge: daily morning/evening motivational posts
5. At deadline: users submit a results screenshot in bot DM
6. Admin manually evaluates trades using investor password

**Key new files:**
- `src/bot/tradingRegistrationHandler.ts` — multi-step registration conversation
- `src/bot/tradingAdminHandler.ts` — trading challenge admin commands
- `src/services/tradingChallengeService.ts` — challenge CRUD
- `src/services/exnessService.ts` — Exness Partnership API integration
- `src/scheduler/tradingScheduler.ts` — daily posts scheduling

**Exness API integration:** Verified email allocation, KYC status, account ownership, platform (MT5), balance. This was the first time the bot connected to an external trading API.

**Notable features:**
- Hybrid challenges (demo + real categories with separate prizes)
- Submission channel (screenshots posted to private channel)
- Submission override (user can resubmit)
- Export commands (CSV with registrations, submissions)

---

## PHASE 4 — REGISTRATION HARDENING & ADMIN TOOLS (Apr 5–22, 2026)

**Context:** The first live trading challenges exposed edge cases in registration. This phase was all about resilience.

**Registration improvements:**
- `/manualverify` — admin can manually register a user
- Privacy-hidden users handled (can't see forwarded message sender)
- KYC fallback (FTD/FTT alternative paths)
- Account number confirmation step
- Contact admin message on 2nd retry failure
- Session persistence across bot reboots
- Proactive restart DMs to users with interrupted registrations

**Admin tools added:**
- `/finduser` — search by username, email, or Telegram ID
- `/regstats` — registration statistics with failure breakdown
- `/todaysregstat` — today's activity only
- `/retractregistration` — remove a registration with notification
- `/engagefailedusers` + `/exportfailedattempts` — engagement campaigns
- `/viewschedule` — full schedule with countdowns

**Engagement system:**
- Auto-DM failed users at 24h/48h intervals
- 3 message variants, batch sending, conversion tracking
- Mark converted users (not deleted — preserved in data)

**Partner screening:**
- Nightly check at 10 PM via Exness API
- WARN users who are CHANGING partners
- Auto-disqualify users who LEFT partnership
- Morning report to admin at 9 AM

---

## PHASE 5 — TRADE EVALUATION ENGINE v1 (Apr 29 – May 5, 2026)

**What changed:**
Instead of manually reviewing each participant's trades, the admin now feeds trade data to the bot and it evaluates automatically based on rules.

**How it worked (still manual input):**
1. Admin pulls trade history from MT5 (using investor password)
2. Sends the report file to bot via `/evaluateonebyone`
3. Bot parses trades, applies rules, generates detailed report
4. Report shows: qualified trades, flagged trades, violations, profit

**10+ admin evaluation commands added:**
- `/evaluateonebyone` — guided queue with skip/resubmit/DQ buttons
- `/missingevaluation` — unevaluated submissions as CSV
- `/askforresubmission` — request user to resubmit account details
- `/sendeval` — manual send evaluation to specific user
- `/preannouncementnotice` — sends results to all with 48hr complaint window
- `/showwinner`, `/exportrank`, `/findevaluation`, `/deleteevaluation`

**Evaluation rules checked:**
- Stop loss presence
- Max lot size
- Max simultaneous trades
- Same pair limits
- Daily drawdown
- Hold time limits
- Weekend trading
- Starting balance validation
- Recharging detection (deposits during challenge)
- Day-1 balance reset detection

**Winner announcement system:**
- Ranked DMs (winners get congrats + rank, qualified get rank, others get details)
- Channel posts with categories, medals, stats
- Winner.png image attachment
- MT5 footnote and disclaimers

---

## PHASE 6 — MULTI-WINNER QUIZZES & PASSWINNER (May 8–14, 2026)

**Problem:** The weekly quiz system originally supported only 1 winner. The community needed multi-winner support.

**Changes:**
- `num_winners` and `prize_amount` added to challenge creation flow
- Multiple winners in DMs and results posts
- `/passwinner` rewritten: multi-winner selection, channel post, backup fills
- `/fixinvite` — send corrected Discord invite to real participants
- `/invitereal` — invitation commands

---

## PHASE 7 — WINNERPIP INTEGRATION BEGINS (May 15–16, 2026)

**The fundamental shift:** Move from manual trade evaluation (screenshot + file upload) to automatic real-time trade monitoring via MT5.

**What was built:**

### VPS System (108.181.184.223)
- A Windows VPS running 10 MT5 terminal instances
- Python workers (one per terminal) that can log into any Exness account using investor password
- Router (port 8000) distributes requests across workers
- Endpoints: `/verify` (check credentials), `/pull` (get trade history), `/candles` (price data)

### Database Schema Expansion
New tables: `wp_trades`, `wp_deals`, `wp_leaderboard`, `wp_leaderboard_staging`, `wp_pull_batches`, `wp_pull_errors`, `wp_challenge_rules`, `wp_balance_ops`

### WinnerPip Frontend (Next.js 14)
- Landing page at winnerpip.com
- `/challenges` — browse active challenges
- `/login` — MT5 credential login (investor password)
- `/challenge/[id]` — full trader dashboard (balance, rank, trades, violations, rules)
- Admin panel at secret path — overview, participants, leaderboard, pulls, rules, settings

### Pull Scheduler (Railway Node.js)
- Runs 6x daily (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 EAT)
- Pulls trades from all registered accounts via VPS
- Evaluates each account through the rule engine
- Updates leaderboard rankings

**Architecture after this phase:**
```
Telegram Bot (Railway) ──┐
                         ├── PostgreSQL (Railway)
WinnerPip Frontend ──────┤
  (Vercel/Railway)       │
                         └── VPS (Windows, 10 MT5 terminals)
```

---

## PHASE 8 — WINNERPIP FRONTEND + ADMIN PANEL (May 16–24, 2026)

**Front-end buildout:**
- Secret admin path (hidden, IP-whitelisted)
- Real data from API (removed all placeholder/mock data)
- Challenge selector in admin panel
- Participants table with filter, DM, unverify, disqualify
- Leaderboard with category tabs (All | Real | Demo)
- Pulls tab with force pull, retry buttons, progress bar
- Rules tab with save/lock functionality
- Health tab showing VPS terminal status
- Export buttons (CSV registrations, CSV leaderboard, HTML trades)

**Discord integration:**
- API endpoints for Discord bot to create/manage challenges
- Team-only challenges visible on WinnerPip but blurred (register via Discord)
- Discord registration flow mirrors Telegram flow
- Webhook messages to Discord channels

**Client dashboard features:**
- Live balance progress bar
- Rank display
- Recent trades with violation flags
- Rules display with ¢/$ per account type
- Pre-start state (before challenge begins)
- Challenge completion popup

**Registration enhancements:**
- Cent account detection via VPS currency field (USC)
- Account subtype detection (standard/standard_cent/pro/zero)
- Balance check during registration
- Per-user cent/standard display across all views

---

## PHASE 9 — VPS PULL SYSTEM HARDENING (May 25 – Jun 5, 2026)

**Problem:** With 100+ real accounts, the pull system needed to be bulletproof. Terminal failures, credential issues, and history sync problems caused data gaps.

**VPS Evolution:**
- v3.0 → Fixed terminal architecture (one worker per terminal)
- v4.0 → Multi-process with true parallelism, no MT5 conflicts
- v5.0 → 10 independent workers + router with auto-failover
- v6.0 → Persistent IPC (no shutdown between requests)
- v6.1 → Idle restore only
- v6.2 → Direct login switch with fallback reconnect
- v6.3 → Self-healing (kill/relaunch stuck terminals), lock-free health, smart retry

**Scheduler evolution:**
- Shared queue architecture (work-stealing across terminals)
- Failed-first priority (retry previously failed accounts first)
- Incremental pulls (only last 5 hours, not full history every time)
- Staging table → atomic leaderboard updates
- Full pulls after challenge ends (2 final pulls, then stop)

**Key reliability features:**
- History sync stabilization (poll until deal count is stable)
- Per-terminal health monitoring
- 5-pass healthy-only retry loop after standard cycle
- Stop Pull button (cancels in-progress pull)
- Pre-start balance snapshot
- Trigger first pull immediately at challenge start

---

## PHASE 10 — CREDENTIAL FAILURES & FAKE SL DETECTION (Jun 5–18, 2026)

**Credential failure handling:**
The biggest operational headache. When a user changes their investor password, the terminal gets stuck with a Login dialog popup.

**Solution (multi-layered):**
1. Router-level credential attempt tracker with 2-terminal ban
2. Per-worker credential failure cache (10min TTL)
3. Confirm failures on a DIFFERENT terminal before marking
4. Background thread closes Login dialogs immediately
5. Force login to base account on credential failure
6. Kill and relaunch terminal on IPC timeout
7. Auto-backfill on credential recovery
8. Discord DM queue for password-changed notifications
9. Admin tab showing credential-failed accounts with reinstate flow

**Fake SL (Max Risk) detection rewrite:**
- Two-layer system: presence check (did they set SL?) + candle check (was SL real?)
- Ratio-based risk calculation (works for all pairs, not just USD-quoted)
- Adaptive timeframe candle fetch (M5 → M15 → M30 → H1 fallback)
- 10% internal tolerance for spread/slippage
- Candle check only on winning trades (no cheat benefit on losses)
- Dynamic terminal routing for candle requests (different server subtypes)

---

## PHASE 11 — PARTIAL CLOSES, RECONCILIATION & POLISH (Jun 27 – Jul 7, 2026)

**Partial close handling:**
MT5 allows closing part of a position. This creates multiple deals with the same position_id. The system now:
- Groups partial closes under the same position
- Shows them as expandable groups in trade tables and HTML export
- Applies SL checks at position level (not per-partial)
- Handles the "mother trade" concept in UI

**Trade reconciliation:**
After each pull, a reconciliation pass compares trade counts between VPS and database. If trades are missing, targeted resolution is triggered.

**Pull Trade feature:**
Admin can pull a specific trade by ticket or position ID, with dry-run evaluation before committing.

**Account history feed:**
Unified view of all account activity: deposits, withdrawals, swaps, dividends, corrections.

**Leaderboard refinements:**
- Winner/above-target highlighting (trophy + green)
- Blown account badges (💀) and Exited badges (🚪)
- Withdrawn accounts rank below active but above blown
- Tier-based ranking: Tier 1 (positive balance) → Tier 2 (negative/blown) → Tier 3 (DQ)
- Qualified balance for ranking (deducted flagged profits)
- Parallel evaluation with 5 concurrent workers

---

## CURRENT STATE (July 2026)

### Architecture
```
┌─────────────────────────────────────────────────────────┐
│  TELEGRAM BOT (Railway — Node.js/TypeScript)            │
│  ├── Weekly Quiz Challenge System                        │
│  ├── Trading Challenge Registration (TG + Discord)       │
│  ├── VPS Pull Scheduler v4.0 (shared queue, 10 terms)    │
│  ├── WP Evaluation Engine (real-time rule enforcement)   │
│  ├── Leaderboard Service (staging → flush → live)        │
│  ├── Express API (auth, dashboard, admin, Discord)       │
│  └── Partner Screening (auto-DQ on partner change)       │
├─────────────────────────────────────────────────────────┤
│  POSTGRESQL DATABASE (Railway)                           │
│  ├── Quiz tables (users, challenges, questions, etc.)    │
│  └── WinnerPip tables (wp_trades, wp_deals, wp_leader.) │
├─────────────────────────────────────────────────────────┤
│  VPS (Windows — 108.181.184.223:8000)                    │
│  ├── Router (port 8000) — load balancer + retry logic    │
│  └── 10 Workers (ports 8001-8010) — 1 MT5 terminal each │
├─────────────────────────────────────────────────────────┤
│  WINNERPIP FRONTEND (Railway — Next.js 14)               │
│  ├── winnerpip.com — public challenges + client dash     │
│  └── Secret admin panel — full operational control       │
└─────────────────────────────────────────────────────────┘
```

### What the bot does today:
1. **Weekly Quizzes** — fully automated Telegram quiz challenges (unchanged from Phase 1)
2. **Trading Challenges** — forex trading competitions with:
   - Registration via Telegram bot or Discord bot
   - Automatic credential verification via VPS
   - Real-time trade monitoring (6x daily pulls from MT5)
   - Automated rule enforcement (15+ configurable rules)
   - Live leaderboard on winnerpip.com
   - Client dashboard showing rank, trades, violations
   - Admin panel for full operational control

### Key file count: ~50+ source files across bot, VPS, and frontend

---

## KEY DECISIONS LOG

| When | Decision | Why |
|------|----------|-----|
| Mar 2026 | TypeScript + Telegraf | Standard for TG bots, type safety |
| Mar 2026 | PostgreSQL on Railway | Relational data, JSON support, simple hosting |
| Mar 2026 | node-cron for scheduling | Lightweight, runs in same process |
| May 2026 | Own VPS with MT5 terminals | MetaApi.cloud too expensive for 100+ accounts; own infrastructure gives full control |
| May 2026 | 10 parallel MT5 terminals | Single terminal is too slow for 100+ accounts; parallelism needed |
| May 2026 | Python workers on VPS | MT5 Python package only works on Windows; can't run on Railway |
| May 2026 | Next.js for frontend | React ecosystem, SSR, Railway-friendly |
| May 2026 | Staging → Live leaderboard | Prevents users seeing partial data during pull cycle |
| Jun 2026 | Hardcoded base account for terminals | Dynamic home accounts caused too many issues |
| Jun 2026 | Ratio method for SL risk | Works for all pairs (USD, JPY, gold, cent) without conversion tables |
| Jun 2026 | Credential 2-terminal confirmation | Single terminal failure is unreliable (could be terminal issue, not password) |

---

## EVOLUTION SUMMARY

```
v1.0 (Mar 13) — Quiz Bot
     Simple Telegram bot for weekly trivia challenges
     
v2.0 (Mar 26) — + Trading Challenges
     Added forex trading competition module (manual evaluation)
     
v3.0 (May 2)  — + Trade Evaluation Engine
     Bot can parse MT5 reports and auto-evaluate trades
     
v4.0 (May 15) — + WinnerPip / VPS Integration
     Real-time trade monitoring via own VPS with MT5 terminals
     No more manual evaluation — fully automated
     
v5.0 (May 20) — + Web Platform
     WinnerPip frontend with client dashboard and admin panel
     
v6.0 (Jun 5)  — Production Hardening
     Credential failure handling, reconciliation, partial closes
     
v7.0 (Jul 7)  — Current
     Stable production system running live challenges
     with 100+ participants monitored in real-time
```

---

## FOR FUTURE REFERENCE

When starting a new session, read this file first. Key things to know:
- The quiz system and trading system coexist in the same bot process
- The VPS code lives in `/vps/` (Python) — deployed separately to Windows server
- The WinnerPip frontend lives in `/WinnerPip/winnerpip/` (Next.js)
- All trading data flows: VPS → Pull Scheduler → Evaluation Engine → Database → Frontend
- The `LOGS_BY_C.md` file has detailed per-change documentation from June 4 onwards
- The `.kiro/steering/` folder has a system summary for AI agent context

---

*Last updated: July 8, 2026*
*612 commits total on main branch*
