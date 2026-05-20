# BirrForex / WinnerPip — System Audit Report
**Date:** May 20, 2026  
**Version:** Post-Railway Pull Rebuild (v2)

---

## 1. SYSTEM OVERVIEW & CURRENT STATUS

### Architecture
```
┌─────────────────────────────────────────────────────────┐
│  TELEGRAM BOT (Railway)                                  │
│  Node.js + TypeScript + Express API (port 3001)          │
│  ├── Quiz Challenge System (weekly)                      │
│  ├── Trading Challenge System (WinnerPip)                │
│  ├── VPS Pull Scheduler v2 (shared queue, 10 terminals)  │
│  ├── WP Evaluation Engine (per-account streaming)        │
│  ├── Leaderboard Service (cycle-based ranking)           │
│  ├── Discord Bot API (/api/discord/*)                    │
│  └── Admin Panel API (/api/admin/*)                      │
├─────────────────────────────────────────────────────────┤
│  DATABASE: PostgreSQL (Railway)                          │
├─────────────────────────────────────────────────────────┤
│  VPS SERVER: 108.181.184.223:8000                        │
│  10 MT5 terminals, Worker v6.3, Router v6.3              │
├─────────────────────────────────────────────────────────┤
│  WINNERPIP FRONTEND (Vercel)                             │
│  Next.js 14 — winnerpip.com                             │
│  Connects to bot Express API for all data                │
└─────────────────────────────────────────────────────────┘
```

### Component Status

| Component | Status | Notes |
|-----------|--------|-------|
| Telegram Bot | ✅ Production | All commands functional |
| Quiz Challenges | ✅ Production | Create, schedule, run, score, announce |
| Trading Challenges | ✅ Production | Registration, VPS pull, evaluation, leaderboard |
| VPS Pull Scheduler v2 | ✅ Ready to deploy | Shared queue, per-account eval, retry |
| WP Evaluation Engine | ✅ Production | Rule engine, fake SL detection, drawdown |
| Leaderboard Service | ✅ Ready to deploy | Cycle-based ranking updates |
| Express API | ✅ Production | Auth, dashboard, leaderboard, admin, Discord |
| Discord Integration | ✅ Production | Challenge CRUD, registration, verification |
| WinnerPip Frontend | ✅ Production | Challenges, dashboard, admin panel |
| Admin Panel (web) | ✅ Production | Overview, participants, search, DQ, rules |

### Recent Changes (This Session)
- Rebuilt VPS Pull Scheduler with shared queue architecture
- Added per-account streaming evaluation
- Separated leaderboard timing (update at cycle start, not after pull)
- Added failed-first priority queue
- Added in-cycle retry (2 passes, 30s wait, 3 terminals)
- Added `/failedaccounts` admin command with retry buttons
- Wired `/forcepull` command
- Added `dataFrom` field to API responses
- Added terminal distribution logging
- Removed dead host pages and mock data from WinnerPip frontend
- DB migration for `leaderboard_updated_at` column

---

## 2. SECURITY AUDIT

### 🔴 CRITICAL

| # | Issue | Location | Risk | Fix |
|---|-------|----------|------|-----|
| 1 | **VPS API key hardcoded as fallback** | `src/config.ts` line 44 | Key exposed in source code / git history | Remove fallback, require env var |
| 2 | **VPS IP hardcoded as fallback** | `src/config.ts` line 43 | Server IP exposed in source | Remove fallback |
| 3 | **Same key in .env.example** | `.env.example` | Real credentials in example file | Replace with placeholder |
| 4 | **VPS communication over HTTP** | `vpsPullScheduler.ts` | Investor passwords transmitted unencrypted | Add HTTPS/TLS to VPS or use SSH tunnel |
| 5 | **Token comparison timing attack** | `src/api/server.ts` `verifyToken()` | Signature comparison uses `!==` | Use `crypto.timingSafeEqual()` |

### 🟡 MEDIUM

| # | Issue | Location | Risk | Fix |
|---|-------|----------|------|-----|
| 6 | `TOKEN_SECRET` falls back to bot token | `server.ts` | Bot token shouldn't be signing key | Require `WINNERPIP_TOKEN_SECRET` env var |
| 7 | `NEXT_PUBLIC_ADMIN_PATH` exposed in client JS | `middleware.ts` | "Secret" path visible in browser source | Acceptable — IP whitelist is real protection |
| 8 | Investor passwords stored in plaintext | `trading_registrations` table | DB breach exposes all passwords | Encrypt at rest (AES-256) |
| 9 | No input length validation | All API endpoints | Potential DoS via oversized strings | Add max length checks |
| 10 | `@types/*` in production dependencies | `package.json` | Unnecessary attack surface | Move to devDependencies |

### 🟢 GOOD PRACTICES ALREADY IN PLACE

- ✅ All SQL queries use parameterized queries (no injection risk)
- ✅ Rate limiting on all endpoints (global, auth, admin, Discord)
- ✅ Request body size limited to 10kb
- ✅ Admin endpoints protected by IP whitelist + secret path + key
- ✅ CORS restricted to WinnerPip frontend origin
- ✅ Production logs sanitized (no query params/SQL logged)
- ✅ Credential failures confirmed twice before flagging
- ✅ 48h grace period before auto-disqualification
- ✅ Token expiry (72 hours)
- ✅ Trust proxy configured for Railway

---

## 3. PERFORMANCE & RELIABILITY

### VPS Pull System (3000 accounts)
- **Architecture:** 10 parallel terminals, shared queue (work stealing)
- **Expected cycle time:** ~8-10 minutes for 3000 accounts
- **Retry:** 2 passes within cycle, 30s wait, 3 terminals per account
- **Failure handling:** Terminal health monitoring, auto-recovery after 10min
- **Resilience:** Partial evaluations preserved on crash

### Database
- **Pool:** pg.Pool with default 10 connections
- **SSL:** Enabled in production
- **Concern:** No explicit pool size tuning for 3000-account workload
- **Recommendation:** Set `max: 20` for pull cycles with concurrent terminal workers

### Evaluation Engine
- **Per-account streaming:** Each account evaluated immediately after pull
- **Leaderboard:** Rankings update at start of next cycle (not blocking pull)
- **Candle validation:** Graceful degradation if VPS candle API unavailable

---

## 4. RECOMMENDATIONS (Priority Order)

### Immediate (Before Next Deploy)
1. Remove hardcoded VPS key/URL fallbacks from `config.ts`
2. Replace real credentials in `.env.example` with placeholders
3. Fix timing attack in token verification (use `timingSafeEqual`)

### Short-term (Next Sprint)
4. Add HTTPS to VPS server (Let's Encrypt or self-signed + pin)
5. Set explicit `WINNERPIP_TOKEN_SECRET` env var in Railway
6. Add input length validation (max 100 chars for strings)
7. Move `@types/*` to devDependencies
8. Configure DB pool size (`max: 20`)

### Medium-term
9. Encrypt investor passwords at rest (AES-256-GCM)
10. Add request logging/monitoring (structured JSON logs)
11. Add health check endpoint that verifies DB + VPS connectivity
12. Pin dependency versions (remove `^` ranges)

---

## 5. FILE INVENTORY (Key Files)

### Bot Backend (`src/`)
| File | Purpose | Lines |
|------|---------|-------|
| `index.ts` | Entry point, wires all services | ~90 |
| `bot/bot.ts` | Telegram handlers, commands, callbacks | ~1650 |
| `bot/adminHandler.ts` | Quiz challenge admin CRUD | ~600 |
| `bot/tradingAdminHandler.ts` | Trading challenge admin | ~3100 |
| `bot/tradingRegistrationHandler.ts` | User registration flow | ~1500 |
| `scheduler/vpsPullScheduler.ts` | VPS pull v2 (shared queue) | ~1080 |
| `scheduler/scheduler.ts` | Quiz post scheduler | ~400 |
| `services/wpEvaluationEngine.ts` | Rule engine + evaluation | ~600 |
| `services/leaderboardService.ts` | Ranking + failed accounts | ~110 |
| `services/tradingChallengeService.ts` | Challenge CRUD | ~300 |
| `api/server.ts` | Express API (auth, dashboard, admin) | ~1080 |
| `api/discordRoutes.ts` | Discord bot API | ~450 |

### WinnerPip Frontend (`WinnerPip/winnerpip/app/`)
| Route | Purpose | Connected |
|-------|---------|-----------|
| `/` | Landing page | Static |
| `/login` | MT5 credential login | ✅ Real API |
| `/register` | Redirects to Telegram | ✅ |
| `/challenges` | Browse challenges | ✅ Real API |
| `/challenge/[id]` | Full trader dashboard | ✅ Real API |
| `/admin/panel` | Admin panel (secret path) | ✅ Real API |
| `/settings` | User settings | UI only |
| `/PCD/C/*` | Educational demo (mock data) | Intentional |

---

## 6. DEPLOYMENT CHECKLIST

- [ ] Run migration: `ALTER TABLE trading_challenges ADD COLUMN IF NOT EXISTS leaderboard_updated_at TIMESTAMP`
- [ ] Set `WINNERPIP_TOKEN_SECRET` env var in Railway
- [ ] Remove VPS key/URL hardcoded fallbacks from config.ts
- [ ] Update `.env.example` with placeholder values
- [ ] Commit and push to Railway branch
- [ ] Verify with `/forcepull` after deploy
- [ ] Check `/pullstatus` shows "Data from" timestamp
- [ ] Test `/failedaccounts` command
