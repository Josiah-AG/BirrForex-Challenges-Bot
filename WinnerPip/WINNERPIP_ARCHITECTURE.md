# WinnerPip — Platform Architecture & Implementation Plan

## Core Concept

WinnerPip is a **real-time trading competition platform** that connects to traders' Exness accounts via two APIs:

1. **Exness Partnership API** — Verifies trader identity, allocation, KYC status (same as BirrForex bot)
2. **Exness Traders API (MT5)** — Connects using investor (read-only) password to pull complete trade history in real-time

The platform **automatically monitors every trade**, checks it against challenge rules, flags violations, calculates qualified profit, and maintains a live leaderboard — all without manual intervention.

---

## How It Works (End to End)

### For a Trader

```
1. Sign up on WinnerPip (email, username, password)
2. Browse available challenges on dashboard
3. Join a challenge:
   a. Choose category (Demo / Real) if hybrid
   b. Enter Exness email → auto-verified via Partnership API
   c. Enter MT5 account number + server + investor password
   d. Platform connects to account, confirms access
   e. Registration complete
4. Trade normally on MT5 during challenge period
5. Platform pulls trades in real-time via Traders API
6. Dashboard shows:
   - Live qualified profit
   - Live rank on leaderboard
   - Every trade with status (qualified ✓ or flagged 🚩)
   - Violation details on flagged trades
   - Challenge rules
7. Challenge ends → final standings locked → winners announced
```

### For a Host (You, and future hosts)

```
1. Create a challenge:
   a. Title, type (demo/real/hybrid), dates
   b. Starting balance, target balance
   c. Prize pool per category (1st, 2nd, 3rd...)
   d. Define trading rules (the platform understands them)
   e. Upload PDF rules / video guide (optional)
   f. Publish → registration opens
2. Monitor in real-time:
   - Registration stats (total, demo, real, failed attempts)
   - Live leaderboard across all participants
   - Trade-by-trade view per participant
   - Flagged trades with violation reasons
   - Partner screening status
3. Manage:
   - Disqualify participants
   - Message participants
   - Export data (CSV)
4. End challenge:
   - Review final standings
   - Confirm winners (auto-ranked by qualified profit)
   - Announce results
```

---

## The Rule Engine

This is what makes WinnerPip unique. The host defines rules when creating a challenge, and the platform enforces them automatically.

### How Rules Are Defined

The host selects from a library of rule types and configures parameters:

| Rule Code | Rule Type | Parameters | Example |
|-----------|-----------|------------|---------|
| `MAX_LOT_SIZE` | Maximum lot size per trade | `maxLots: number` | Max 0.02 lots per trade |
| `MAX_OPEN_TRADES` | Max simultaneous open positions | `maxOpen: number` | Max 3 open at same time |
| `REQUIRE_STOP_LOSS` | All trades must have stop loss | `maxLossPerTrade: number` | SL required, max $5 loss |
| `MAX_SAME_PAIR` | Limit trades on same instrument | `maxCount: number` | Max 2 trades on same pair |
| `MAX_HOLD_TIME` | Maximum position hold duration | `maxHours: number` | Cannot hold > 24 hours |
| `MAX_DAILY_LOSS` | Maximum loss allowed per day | `maxLoss: number` | Max $10 loss per day |
| `MIN_ACTIVE_DAYS` | Minimum trading days required | `minDays: number` | Must trade on 7+ days |
| `NO_WEEKEND_TRADING` | No trades on weekends | — | No Saturday/Sunday trades |
| `NO_NEWS_TRADING` | No trading during high-impact news | `minutesBefore: number, minutesAfter: number` | No trading 15min before/after news |
| `MAX_TRADES_PER_DAY` | Limit daily trade count | `maxTrades: number` | Max 10 trades per day |
| `ALLOWED_INSTRUMENTS` | Whitelist of tradeable pairs | `pairs: string[]` | Only major forex pairs |
| `BLOCKED_INSTRUMENTS` | Blacklist of pairs | `pairs: string[]` | No crypto, no indices |
| `MIN_TRADE_DURATION` | Minimum hold time (anti-scalp) | `minMinutes: number` | Must hold at least 5 min |
| `NO_HEDGING` | Cannot have opposing positions | — | No buy+sell on same pair |
| `NO_RECHARGE` | Cannot deposit during challenge | — | Starting balance only |

### How Rules Are Enforced

```
For each trade pulled from MT5:
  1. Run trade through every active rule
  2. If ANY rule is violated:
     - Mark trade as FLAGGED
     - Record which rule(s) were broken
     - Record violation details (e.g., "0.05 lots > 0.02 max")
     - If trade was profitable → profit does NOT count
     - If trade was a loss → loss STILL counts
  3. Calculate qualified profit:
     Qualified Profit = Gross Profit - Flagged Trade Profits
     (Losses from flagged trades are always included)
  4. Update leaderboard rank based on qualified profit
```

### Rule Storage (Database)

```sql
CREATE TABLE challenge_rules (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES challenges(id),
    rule_code VARCHAR(50) NOT NULL,        -- e.g., 'MAX_LOT_SIZE'
    rule_label VARCHAR(200) NOT NULL,       -- e.g., 'Maximum lot size per trade is 0.02'
    parameters JSONB NOT NULL,              -- e.g., {"maxLots": 0.02}
    penalty VARCHAR(20) DEFAULT 'flag',     -- 'flag' | 'disqualify' | 'warn'
    order_number INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Two Exness API Integrations

### 1. Partnership API (Already Built in Bot)

**Purpose**: Verify trader identity and partnership allocation

**Endpoints used**:
- `POST /api/v2/auth/` — Authenticate as partner
- `POST /api/partner/affiliation/` — Check if email is under your partnership
- `GET /api/v2/reports/clients/filters/` — Get full client UUID
- `GET /api/v2/reports/clients/` — Get KYC status, balance, FTD status
- `GET /api/reports/clients/accounts/` — Verify specific account number

**Flow**: Email → check allocation → check KYC → verify account → approved

### 2. Traders API (NEW for WinnerPip)

**Purpose**: Connect to trader's MT5 account and pull trade history in real-time

**Connection**: Using account number + server + investor (read-only) password

**What we get**:
- Complete trade history (open and closed trades)
- For each trade: ticket, symbol, type (buy/sell), lots, open time, close time, open price, close price, stop loss, take profit, profit, commission, swap
- Account balance, equity, margin
- Open positions in real-time

**How it works**:
```
1. Trader provides: account_number + mt5_server + investor_password
2. Platform connects via MT5 Manager API or WebSocket
3. On connection success → registration confirmed
4. Background job polls trade history every 5-15 minutes
5. New trades are processed through the rule engine
6. Results update on dashboard in near real-time
```

**Options for MT5 connection**:
- **MetaApi.cloud** — Third-party service that provides REST API access to MT5 accounts via investor password. Most practical option. Pay per account.
- **Direct MT5 Manager API** — Requires MT5 Manager license from broker. More control but complex setup.
- **MT5 WebAPI** — Broker-side API. Would need Exness to provide access.

**Recommended**: Start with MetaApi.cloud — it's the fastest path to production. You provide account number + server + investor password, and their API gives you full trade history via REST.

---

## Database Schema (Core Tables)

```
users
├── id, email, username, password_hash, display_name
├── role (trader | host | admin)
├── profile_picture_url
└── created_at, updated_at

challenges
├── id, host_id (references users)
├── title, type (demo | real | hybrid)
├── status (draft | registration_open | active | submission_open | reviewing | completed)
├── start_date, end_date
├── starting_balance, target_balance
├── real_winners_count, demo_winners_count
├── real_prizes (JSONB), demo_prizes (JSONB)
├── prize_pool_text
├── pdf_url, video_url
├── description
└── created_at, updated_at

challenge_rules
├── id, challenge_id
├── rule_code, rule_label, parameters (JSONB)
├── penalty (flag | disqualify | warn)
└── order_number

registrations
├── id, challenge_id, user_id
├── account_type (demo | real)
├── exness_email, account_number, mt5_server
├── investor_password (encrypted)
├── client_uid
├── connection_status (connected | disconnected | error)
├── last_sync_at
├── disqualified, disqualified_reason, disqualified_at
└── registered_at

trades
├── id, registration_id, challenge_id
├── ticket (MT5 trade ticket number)
├── symbol, trade_type (buy | sell)
├── lots, open_time, close_time
├── open_price, close_price
├── stop_loss, take_profit
├── profit, commission, swap
├── is_qualified (boolean)
├── violations (JSONB array of rule codes + details)
└── synced_at

leaderboard_cache
├── challenge_id, registration_id
├── category (demo | real)
├── qualified_profit, gross_profit
├── total_trades, qualified_trades, flagged_trades
├── best_trade_profit, best_instrument
├── rank
└── updated_at

winners
├── id, challenge_id, registration_id
├── category (demo | real)
├── position, prize_amount
├── claimed, claimed_at
└── created_at

daily_stats (for host analytics)
├── challenge_id, date
├── new_registrations, demo_registrations, real_registrations
├── new_trades_synced, new_violations
├── active_traders (traded today)
└── created_at
```

---

## Platform Architecture

```
┌─────────────────────────────────────────────────┐
│                   FRONTEND                       │
│              (Next.js + React)                   │
│                                                  │
│  Landing ─ Auth ─ Trader Dashboard ─ Challenge   │
│  Host Dashboard ─ Admin Dashboard ─ Settings     │
└──────────────────────┬──────────────────────────┘
                       │ API calls
┌──────────────────────▼──────────────────────────┐
│                  BACKEND API                     │
│              (Next.js API Routes)                │
│                                                  │
│  /api/auth/*          Authentication             │
│  /api/challenges/*    CRUD + join + leave         │
│  /api/trades/*        Trade data + violations     │
│  /api/leaderboard/*   Rankings                   │
│  /api/host/*          Host management            │
│  /api/admin/*         Platform admin             │
└──────┬───────────────┬──────────────────────────┘
       │               │
┌──────▼──────┐ ┌──────▼──────────────────────────┐
│  Database   │ │     Background Workers           │
│ (PostgreSQL)│ │                                   │
│             │ │  Trade Sync Worker (every 5-15m)  │
│  users      │ │  ├─ Connect to MT5 via MetaApi    │
│  challenges │ │  ├─ Pull new trades               │
│  rules      │ │  ├─ Run rule engine               │
│  registr.   │ │  ├─ Update qualified profit       │
│  trades     │ │  └─ Update leaderboard            │
│  leaderboard│ │                                   │
│  winners    │ │  Partner Screening (daily)        │
│             │ │  ├─ Check all active registrations │
│             │ │  └─ Warn / disqualify             │
│             │ │                                   │
│             │ │  Challenge Lifecycle               │
│             │ │  ├─ Auto-start on start_date      │
│             │ │  ├─ Auto-end on end_date          │
│             │ │  └─ Send notifications             │
└─────────────┘ └──────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
   ┌──────▼──────┐ ┌──▼────┐ ┌────▼─────┐
   │  MetaApi    │ │Exness │ │  Email   │
   │  (MT5 data) │ │Partner│ │  Service │
   │             │ │  API  │ │(Resend/  │
   │ Trade hist. │ │       │ │ SendGrid)│
   │ Balances    │ │Verify │ │          │
   │ Open pos.   │ │KYC    │ │Notifs    │
   └─────────────┘ └───────┘ └──────────┘
```

---

## Implementation Phases

### Phase 1 — Foundation (Current + Database)
- Set up PostgreSQL database with schema above
- User authentication (register, login, JWT sessions)
- Basic challenge CRUD for host
- What we have: Landing page, auth pages, dashboard UI (mock data)

### Phase 2 — Exness Partnership API Integration
- Port `exnessService.ts` from bot to Next.js API routes
- Registration flow: email verification → allocation → KYC → account verification
- Store registrations in database
- Replace mock data with real data on dashboards

### Phase 3 — MT5 Trade Sync (MetaApi Integration)
- Integrate MetaApi.cloud for MT5 account access
- Background worker to sync trades every 5-15 minutes
- Store trades in database
- Display real trade history on challenge dashboard

### Phase 4 — Rule Engine
- Build rule evaluation system
- Host can select and configure rules when creating challenge
- Trades are automatically checked against rules on sync
- Flag violations with specific rule code + details
- Calculate qualified profit

### Phase 5 — Live Leaderboard
- Real-time leaderboard based on qualified profit
- Separate demo/real rankings for hybrid challenges
- Leaderboard cache table for fast queries
- Auto-update on every trade sync

### Phase 6 — Challenge Lifecycle Automation
- Auto-transition challenge states based on dates
- Notifications (email + in-app) for:
  - Registration confirmation
  - Challenge start/end
  - Trade violations
  - Rank changes
  - Winner announcement

### Phase 7 — Host Tools
- Full host dashboard with real data
- Registration management (view, export, disqualify)
- Trade-by-trade review per participant
- Partner screening integration
- Winner selection and announcement

### Phase 8 — Multi-Host & Scaling
- Allow other hosts to create challenges
- Host verification/approval by admin
- Revenue model (platform fee per challenge or per participant)
- Multiple broker support beyond Exness

---

## Key Technical Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| MT5 Access | MetaApi.cloud | Fastest to production, REST API, handles connection management |
| Database | PostgreSQL | Relational data, JSONB for flexible rule params, proven at scale |
| Auth | NextAuth.js + JWT | Built for Next.js, supports multiple providers |
| Background Jobs | Bull/BullMQ + Redis | Reliable job queue for trade sync, partner screening |
| Hosting | Vercel (frontend) + Railway (DB + workers) | Same stack as your bot |
| Email | Resend or SendGrid | Transactional emails for verification + notifications |
| Encryption | AES-256 for investor passwords | Passwords stored encrypted, decrypted only for MT5 connection |

---

## What Makes This Different From the Bot

| Aspect | Telegram Bot | WinnerPip |
|--------|-------------|-----------|
| Trade verification | Manual (screenshot + investor password at end) | Automatic real-time via MT5 API |
| Rule enforcement | Manual review by host | Automated rule engine |
| Leaderboard | Final balance ranking | Live qualified profit ranking |
| Violation detection | Host reviews trade history manually | Platform flags violations instantly |
| User experience | Telegram chat flow | Full web dashboard with charts |
| Scalability | Single host (you) | Multi-host platform |
| Data | End-of-challenge snapshot | Complete trade-by-trade history |

The fundamental shift: **the bot trusts the final balance screenshot, WinnerPip verifies every single trade.**
