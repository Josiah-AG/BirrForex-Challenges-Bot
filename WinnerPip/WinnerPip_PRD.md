# WinnerPip — Product Requirements Document (PRD)
## Trade, Compete, Win

**Version:** 1.0  
**Last Updated:** March 13, 2026  
**Status:** Draft — Living Document

---

## 1. Product Overview

### 1.1 What is WinnerPip?
WinnerPip is a web-based Trading Competition Management Platform that automates the hosting, verification, monitoring, and ranking of forex trading challenges. It replaces manual processes with automated systems — from trader registration and verification to rule enforcement and leaderboard calculation.

### 1.2 Problem Statement
Running trading competitions with 1000+ traders involves:
- **Manual registration verification** — checking partner links, KYC status, and deposits
- **Manual rule monitoring** — checking lot sizes, drawdowns, stop losses, holding times across hundreds of accounts
- **Lack of transparency** — traders can't see real-time rankings or understand why trades were flagged
- **Human error** — with 1000+ accounts, mistakes are inevitable

### 1.3 Solution
An automated platform that:
- Verifies trader eligibility via Exness Partnership API
- Fetches trade data via Exness Trading API
- Enforces challenge rules automatically via a configurable Rule Engine
- Displays real-time leaderboards with full transparency
- Allows any host to create and manage competitions

### 1.4 Target Users
| Role | Description |
|------|-------------|
| **Trader** | Joins challenges, trades, views performance and rankings |
| **Host** | Creates challenges, defines rules, monitors participants, announces winners |
| **Admin** | Platform-level control, manages hosts, resolves disputes |


---

## 2. Core Concepts

### 2.1 Challenge Types
- **Demo Account Challenge** — No deposit required, traders compete with demo accounts
- **Real Account Challenge** — Requires minimum deposit, traders compete with real money
- **Hybrid Challenge** — Both demo and real accounts compete, evaluated separately

### 2.2 Rule Engine Philosophy
**Flexible & Configurable** — Hosts define rules when creating a challenge. The system enforces them automatically.

**Key Principle:**
- **Illegal trades** = Trades that violate any rule
- **Qualified Profit** = Gross Profit - Profits from illegal trades
- **Losses always count** — Even if a trade is illegal, losses are included in calculations

### 2.3 Profit Calculation Logic
```
Gross Profit = Sum of all trade profits (legal + illegal)
Illegal Trade Profit = Sum of profits from flagged trades (only positive values)
Qualified Profit = Gross Profit - Illegal Trade Profit
Leaderboard Rank = Based on Qualified Profit
```

**Example:**
- Trade 1: +$10 (legal)
- Trade 2: +$15 (illegal — exceeded lot size)
- Trade 3: -$5 (illegal — no stop loss)
- Trade 4: +$8 (legal)

**Calculation:**
- Gross Profit = $10 + $15 - $5 + $8 = $28
- Illegal Profit = $15 (only Trade 2's profit)
- Qualified Profit = $28 - $15 = $13
- Losses from Trade 3 (-$5) still count



---

## 3. User Roles & Permissions

### 3.1 Trader
**Can:**
- Browse available challenges
- Register for challenges
- Connect Exness trading account
- View personal dashboard
- View trade history with violation flags
- View leaderboard
- View challenge rules

**Cannot:**
- Create challenges
- Modify rules
- Access other traders' detailed data

### 3.2 Host
**Can:**
- Everything a Trader can do, plus:
- Create new challenges
- Define custom rules
- Set challenge duration, prizes, entry requirements
- View all participants in their challenges
- Monitor rule violations
- View detailed participant statistics
- Announce winners
- Export challenge data

**Cannot:**
- Access challenges created by other hosts (unless admin)
- Modify platform settings

### 3.3 Admin
**Can:**
- Everything a Host can do, plus:
- View all challenges across all hosts
- Manage user accounts
- Resolve disputes
- Access platform analytics
- Manage host permissions
- Platform-level configuration



---

## 4. Feature Specifications

### 4.1 Challenge Discovery (Trader View)

When a trader logs in, they see a **feed of available challenges** showing:
- Challenge name and host
- Challenge type (Demo / Real / Hybrid)
- Start and end dates
- Starting balance and target
- Prize pool summary
- Number of participants
- Status badge (Upcoming / Active / Ended)
- "Join Challenge" button

**Filtering:**
- By status (Upcoming, Active, Ended)
- By type (Demo, Real, Hybrid)
- By host

### 4.2 Challenge Registration Flow

```
Trader clicks "Join Challenge"
    ↓
Submits: Email, Exness Account, Trading Account Number
    ↓
System checks via Exness Partnership API:
    ✓ Is client under host's partner link
    ✓ Is KYC verified
    ✓ Is account type correct (demo/real)
    ✓ Is balance within allowed range (for real accounts)
    ↓
If all pass → Auto Approved
If any fail → Rejected with specific reason
```

### 4.3 Trader Dashboard (In-Challenge View)

After registration, the trader sees a dashboard with the following cards:

#### Card 1 — Qualified Profit (Primary)
- Large number showing qualified profit
- Smaller text below showing gross profit
- Color: Green if positive, Red if negative

#### Card 2 — Leaderboard Rank
- Current rank number
- Total participants count (e.g., "Rank #12 of 847")
- Category label (Demo / Real)

#### Card 3 — Trade Count
- Total number of trades taken
- Breakdown: Legal vs Illegal

#### Card 4 — Illegal Trades
- Count of flagged trades
- Warning icon
- Link to view details

#### Card 5 — Best Trade
- Highest profit from a single qualified trade
- Instrument and date

#### Card 6 — Best Instrument
- Most profitable trading pair
- Total profit from that pair

#### Trade History Table
Full list of all trades with columns:
- Date/Time (Open & Close)
- Instrument (pair)
- Type (Buy/Sell)
- Lot Size
- Open Price / Close Price
- Profit/Loss
- Stop Loss
- Status: ✅ Legal or 🚩 Flagged

**When a trade is flagged:**
- Red/orange highlight on the row
- Flag icon with tooltip or expandable section
- Shows which rule(s) were violated (e.g., "TR1: Lot size exceeded — 0.05 > 0.02 max")
- Profit from flagged trades shown in strikethrough



### 4.4 Challenge Creation (Host View)

Hosts can create challenges through a multi-step form:

#### Step 1 — Basic Information
- Challenge name
- Description
- Challenge type (Demo / Real / Hybrid)
- Start date & time
- End date & time
- Starting balance
- Target balance (optional)
- Prize details (text field)

#### Step 2 — Entry Requirements
- Exness partner link (auto-filled for host)
- Account type allowed (Demo / Real / Both)
- Minimum deposit (for real accounts)
- KYC verification required (yes/no)
- Additional requirements (text field)

#### Step 3 — Trading Rules (Configurable)

**Position Management Rules:**
- Max lot size per trade (number input)
- Max open positions simultaneously (number input)
- Mandatory stop loss (yes/no)
- Max stop loss distance in $ (number input)
- Max loss per trade in $ (number input)
- Same pair trade limit (number input, e.g., max 2 trades on EURUSD)
- Max holding time in hours (number input)

**Risk Management Rules:**
- Daily drawdown limit in $ (number input)
- Overall drawdown limit in % (number input)
- Allow account recharge (yes/no)

**Activity Rules:**
- Minimum active days (number input)
- Minimum trades required (number input)

**Time Restrictions:**
- Allow weekend trading (yes/no)
- Allowed trading hours (time range picker)
- Restricted trading days (multi-select)

**Instrument Restrictions:**
- Allowed pairs (multi-select or "All")
- Restricted pairs (multi-select)

#### Step 4 — Review & Publish
- Preview all settings
- Publish challenge

**Rule Builder UI:**
Each rule has:
- Toggle to enable/disable
- Input field(s) for parameters
- Help text explaining the rule
- Preview of how it will appear to traders



### 4.5 Host Dashboard

Hosts see an overview of their challenges:

#### Challenge List View
- All challenges created by the host
- Status indicators (Draft / Upcoming / Active / Ended)
- Quick stats per challenge (participants, violations, leaders)

#### Challenge Detail View
Tabs:

**1. Overview Tab**
- Challenge info summary
- Timeline (days remaining)
- Total participants
- Total trades processed
- Total violations

**2. Participants Tab**
Table showing:
- Trader name/email
- Account number
- Registration status (Pending / Approved / Rejected)
- Current qualified profit
- Current rank
- Violation count
- Actions (View details, Disqualify manually)

**3. Leaderboard Tab**
- Real-time rankings
- Separate tabs for Demo/Real (if hybrid)
- Export to CSV

**4. Violations Tab**
- All rule violations across all participants
- Filterable by rule type, trader, date
- Shows: Trader, Trade ID, Rule violated, Details, Timestamp

**5. Analytics Tab** (Future)
- Most violated rules
- Average profit
- Participation trends



### 4.6 Leaderboard (Public View)

Accessible to all participants and potentially public:

**Display:**
- Rank number
- Trader name (or anonymous ID)
- Qualified profit
- Number of trades
- Status (Active / Disqualified)

**Features:**
- Real-time updates (or hourly refresh)
- Separate tabs for Demo/Real in hybrid challenges
- Pagination for large participant lists
- Search/filter by trader name
- Highlight current user's position

**Disqualified Section:**
- Separate section or tab
- Shows disqualified traders
- Reason for disqualification



---

## 5. Technical Architecture

### 5.1 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Trader     │  │     Host     │  │    Admin     │      │
│  │  Dashboard   │  │   Dashboard  │  │   Dashboard  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                    Backend API (Next.js API Routes)          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │     Auth     │  │  Challenge   │  │     Rule     │      │
│  │   Service    │  │   Service    │  │    Engine    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Registration │  │  Leaderboard │  │    Trade     │      │
│  │   Service    │  │   Service    │  │   Service    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                    Background Jobs (Node-cron)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Trade Fetch  │  │ Rule Check   │  │ Leaderboard  │      │
│  │  (Hourly)    │  │  (Hourly)    │  │   Update     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                    Database (PostgreSQL)                     │
│  Users | Challenges | Registrations | Trades | Violations   │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                    External APIs                             │
│  ┌──────────────────────┐  ┌──────────────────────┐         │
│  │  Exness Partnership  │  │  Exness Trading API  │         │
│  │        API           │  │                      │         │
│  └──────────────────────┘  └──────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Tech Stack

**Frontend:**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui (component library)
- React Query (data fetching)
- Zustand (state management)

**Backend:**
- Next.js API Routes
- TypeScript
- Prisma ORM
- Node-cron (scheduled jobs)

**Database:**
- PostgreSQL
- TimescaleDB extension (for time-series trade data)

**Authentication:**
- NextAuth.js or Clerk

**Hosting:**
- Vercel (frontend + API)
- Railway/Render (database + background workers)

**External Services:**
- Exness Partnership API
- Exness Trading API
- Email service (SendGrid/Resend)
- File storage (S3/Cloudinary for deposit screenshots)



### 5.3 Database Schema

#### Users
```sql
id: UUID (PK)
email: STRING (unique)
password_hash: STRING
name: STRING
role: ENUM (trader, host, admin)
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

#### Challenges
```sql
id: UUID (PK)
host_id: UUID (FK → Users)
name: STRING
description: TEXT
type: ENUM (demo, real, hybrid)
status: ENUM (draft, upcoming, active, ended)
start_date: TIMESTAMP
end_date: TIMESTAMP
starting_balance: DECIMAL
target_balance: DECIMAL (nullable)
prize_details: TEXT
rules: JSONB (flexible rule configuration)
entry_requirements: JSONB
partner_link: STRING
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

#### Rules (JSONB structure in Challenges)
```json
{
  "position_management": {
    "max_lot_size": 0.02,
    "max_open_positions": 3,
    "mandatory_stop_loss": true,
    "max_stop_loss_distance": 5,
    "max_loss_per_trade": 5,
    "same_pair_limit": 2,
    "max_holding_hours": 24
  },
  "risk_management": {
    "daily_drawdown_limit": 10,
    "overall_drawdown_percent": 20,
    "allow_recharge": false
  },
  "activity": {
    "min_active_days": 7,
    "min_trades": 10
  },
  "time_restrictions": {
    "allow_weekend_trading": false,
    "trading_hours": { "start": "00:00", "end": "23:59" },
    "restricted_days": []
  },
  "instruments": {
    "allowed_pairs": ["*"],
    "restricted_pairs": []
  }
}
```

#### Registrations
```sql
id: UUID (PK)
challenge_id: UUID (FK → Challenges)
user_id: UUID (FK → Users)
exness_account: STRING
trading_account: STRING
account_type: ENUM (demo, real)
starting_balance: DECIMAL
verification_status: ENUM (pending, approved, rejected)
verification_details: JSONB
kyc_verified: BOOLEAN
deposit_verified: BOOLEAN
deposit_screenshot_url: STRING (nullable)
disqualified: BOOLEAN (default false)
disqualification_reason: TEXT (nullable)
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

#### Trades
```sql
id: UUID (PK)
registration_id: UUID (FK → Registrations)
trade_id: STRING (from Exness)
symbol: STRING (e.g., EURUSD)
type: ENUM (buy, sell)
lot_size: DECIMAL
open_time: TIMESTAMP
close_time: TIMESTAMP (nullable if still open)
open_price: DECIMAL
close_price: DECIMAL (nullable)
stop_loss: DECIMAL (nullable)
take_profit: DECIMAL (nullable)
profit: DECIMAL
is_qualified: BOOLEAN (default true)
rule_violations: JSONB (array of violation codes)
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

#### RuleViolations
```sql
id: UUID (PK)
registration_id: UUID (FK → Registrations)
trade_id: UUID (FK → Trades)
rule_code: STRING (e.g., TR1_LOT_SIZE)
rule_description: TEXT
violation_details: JSONB
severity: ENUM (warning, critical)
timestamp: TIMESTAMP
```

#### DailyStats
```sql
id: UUID (PK)
registration_id: UUID (FK → Registrations)
date: DATE
total_trades: INTEGER
qualified_trades: INTEGER
illegal_trades: INTEGER
gross_profit: DECIMAL
qualified_profit: DECIMAL
daily_loss: DECIMAL
drawdown_hit: BOOLEAN
was_active: BOOLEAN
```

#### Leaderboard (Cached)
```sql
id: UUID (PK)
challenge_id: UUID (FK → Challenges)
registration_id: UUID (FK → Registrations)
account_type: ENUM (demo, real)
rank: INTEGER
qualified_profit: DECIMAL
gross_profit: DECIMAL
total_trades: INTEGER
qualified_trades: INTEGER
illegal_trades: INTEGER
best_trade_profit: DECIMAL
best_instrument: STRING
last_updated: TIMESTAMP
```



---

## 6. Rule Engine Specification

### 6.1 Rule Categories

#### Position Management Rules

**TR1 — Max Lot Size**
- **Check:** `trade.lot_size <= rules.max_lot_size`
- **When:** On trade open
- **Violation:** Flag trade as illegal

**TR2 — Max Open Positions**
- **Check:** `count(open_trades) <= rules.max_open_positions`
- **When:** On trade open
- **Violation:** Flag trade as illegal

**TR3 — Mandatory Stop Loss**
- **Check:** `trade.stop_loss !== null`
- **When:** On trade open
- **Violation:** Flag trade as illegal

**TR4 — Max Stop Loss Distance**
- **Check:** `abs(trade.open_price - trade.stop_loss) * lot_size <= rules.max_stop_loss_distance`
- **When:** On trade open
- **Violation:** Flag trade as illegal

**TR5 — Same Pair Limit**
- **Check:** `count(trades where symbol = trade.symbol) <= rules.same_pair_limit`
- **When:** On trade open
- **Violation:** Flag trade as illegal

**TR6 — Max Holding Time**
- **Check:** `(trade.close_time - trade.open_time) <= rules.max_holding_hours * 3600000`
- **When:** On trade close
- **Violation:** Flag trade as illegal

#### Risk Management Rules

**TR7 — Daily Drawdown Limit**
- **Check:** `sum(losses_today) <= rules.daily_drawdown_limit`
- **When:** On trade close (if loss)
- **Violation:** Flag all subsequent trades that day as illegal

**TR8 — Overall Drawdown**
- **Check:** `(starting_balance - current_balance) / starting_balance <= rules.overall_drawdown_percent`
- **When:** Continuously
- **Violation:** Auto-disqualify

**TR9 — No Recharge**
- **Check:** Monitor balance changes not from trades
- **When:** Continuously
- **Violation:** Auto-disqualify

#### Activity Rules

**TR10 — Minimum Active Days**
- **Check:** `count(unique_days_with_trades) >= rules.min_active_days`
- **When:** At challenge end
- **Violation:** Disqualify if not met

**TR11 — Minimum Trades**
- **Check:** `count(qualified_trades) >= rules.min_trades`
- **When:** At challenge end
- **Violation:** Disqualify if not met

#### Time Restriction Rules

**TR12 — Weekend Trading**
- **Check:** `!isWeekend(trade.open_time) || rules.allow_weekend_trading`
- **When:** On trade open
- **Violation:** Flag trade as illegal

**TR13 — Trading Hours**
- **Check:** `trade.open_time within rules.trading_hours`
- **When:** On trade open
- **Violation:** Flag trade as illegal

#### Instrument Rules

**TR14 — Restricted Pairs**
- **Check:** `!rules.restricted_pairs.includes(trade.symbol)`
- **When:** On trade open
- **Violation:** Flag trade as illegal

### 6.2 Rule Checking Flow

```
New Trade Detected
    ↓
Fetch Challenge Rules
    ↓
Run All Applicable Rule Checks
    ↓
Collect Violations
    ↓
If violations.length > 0:
    - Mark trade as is_qualified = false
    - Store violations in trade.rule_violations
    - Create RuleViolation records
    - Update DailyStats
    ↓
Calculate Qualified Profit:
    - If is_qualified = true: Add profit to qualified_profit
    - If is_qualified = false AND profit > 0: Exclude from qualified_profit
    - If is_qualified = false AND profit < 0: Include loss in qualified_profit
    ↓
Update Leaderboard
```

### 6.3 Rule Violation Response

**For Traders:**
- Trade row highlighted in red/orange
- Flag icon with tooltip
- Expandable section showing:
  - Rule code (e.g., TR1)
  - Rule name (e.g., "Max Lot Size Exceeded")
  - Details (e.g., "Used 0.05 lot, maximum allowed is 0.02 lot")
  - Impact: "Profit from this trade will not count toward your qualified profit"

**For Hosts:**
- Violation appears in Violations tab
- Can see all violations across all traders
- Can manually review and override if needed (future feature)



---

## 7. API Integration

### 7.1 Exness Partnership API

**Purpose:** Verify trader eligibility during registration

**Endpoints Needed:**
- Check if client is under partner link
- Verify KYC status
- Check account balance (for real accounts)

**Integration Points:**
- Registration verification (auto-approve/reject)

**Error Handling:**
- API timeout → Manual review required
- Invalid account → Reject with reason
- KYC not verified → Reject with instructions

### 7.2 Exness Trading API

**Purpose:** Fetch trade data for rule checking

**Endpoints Needed:**
- Get account trades (by date range)
- Get open positions
- Get account balance history

**Integration Points:**
- Hourly cron job to fetch new trades
- Real-time updates (future)

**Data Mapping:**
```
Exness Trade → WinnerPip Trade
{
  trade_id: exness.id,
  symbol: exness.symbol,
  type: exness.cmd (0=buy, 1=sell),
  lot_size: exness.volume,
  open_time: exness.open_time,
  close_time: exness.close_time,
  open_price: exness.open_price,
  close_price: exness.close_price,
  stop_loss: exness.sl,
  take_profit: exness.tp,
  profit: exness.profit
}
```

**Error Handling:**
- API rate limit → Queue requests
- Invalid credentials → Notify trader
- Connection timeout → Retry with exponential backoff



---

## 8. User Flows

### 8.1 Trader Registration Flow

```
1. Trader logs in / signs up
2. Browses available challenges
3. Clicks "Join Challenge"
4. Fills registration form:
   - Exness account email
   - Trading account number
   - Account type (demo/real)
   - [If real] Upload deposit screenshot
5. Submits form
6. System calls Exness Partnership API
7. System validates:
   ✓ Account under partner link
   ✓ KYC verified
   ✓ Balance requirements met
8. If approved:
   - Status: "Approved"
   - Trader can connect trading account
   - Trader sees dashboard
9. If rejected:
   - Status: "Rejected"
   - Shows specific reason
   - Provides instructions to fix
```

### 8.2 Host Challenge Creation Flow

```
1. Host logs in
2. Navigates to "Create Challenge"
3. Step 1: Basic Info
   - Name, description, dates, balance, prizes
4. Step 2: Entry Requirements
   - Account types, KYC, deposit requirements
5. Step 3: Trading Rules
   - Toggle and configure each rule
   - Preview how rules appear to traders
6. Step 4: Review
   - Preview all settings
   - Edit if needed
7. Publish challenge
8. Challenge appears in feed (if start date is future: "Upcoming")
```

### 8.3 Trade Processing Flow

```
Hourly Cron Job Runs
    ↓
For each active challenge:
    ↓
    For each approved registration:
        ↓
        Fetch new trades from Exness API
        ↓
        For each new trade:
            ↓
            Save to database
            ↓
            Run rule engine
            ↓
            Mark as qualified/illegal
            ↓
            Update DailyStats
    ↓
Recalculate leaderboard
    ↓
Cache results
```

### 8.4 Leaderboard Update Flow

```
After trade processing:
    ↓
For each registration in challenge:
    ↓
    Calculate:
        - Gross profit (sum all trades)
        - Illegal profit (sum profits from illegal trades)
        - Qualified profit (gross - illegal)
        - Trade counts
        - Best trade
        - Best instrument
    ↓
    Sort by qualified profit (DESC)
    ↓
    Assign ranks
    ↓
    Cache in Leaderboard table
    ↓
    Update timestamp
```



---

## 9. UI/UX Specifications

### 9.1 Design Principles
- **Clarity:** Trading data must be easy to read and understand
- **Transparency:** Show exactly why trades are flagged
- **Performance:** Fast loading, especially for leaderboards
- **Mobile-friendly:** Responsive design for all screen sizes
- **Accessibility:** WCAG 2.1 AA compliance

### 9.2 Color Scheme
- **Primary:** Blue (#2563EB) — Trust, professionalism
- **Success:** Green (#10B981) — Profits, qualified trades
- **Danger:** Red (#EF4444) — Losses, violations
- **Warning:** Orange (#F59E0B) — Flagged trades, warnings
- **Neutral:** Gray (#6B7280) — Text, borders

### 9.3 Key Components

#### Dashboard Card
```
┌─────────────────────────────────┐
│ QUALIFIED PROFIT                │
│                                 │
│        $127.50                  │
│     Gross: $142.30              │
│                                 │
└─────────────────────────────────┘
```

#### Trade Row (Legal)
```
✅ Oct 25, 10:30 AM | EURUSD | Buy | 0.02 lot | +$12.50
```

#### Trade Row (Illegal)
```
🚩 Oct 25, 2:45 PM | GBPUSD | Sell | 0.05 lot | +$18.30
   ⚠ TR1: Lot size exceeded (0.05 > 0.02 max)
   💡 Profit from this trade will not count
```

#### Leaderboard Row
```
#1  John Doe        $245.80    127 trades    ✅ Active
#2  Jane Smith      $198.50     89 trades    ✅ Active
#3  Mike Johnson    $176.20    156 trades    ✅ Active
```

### 9.4 Responsive Breakpoints
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

### 9.5 Loading States
- Skeleton loaders for cards and tables
- Spinner for API calls
- Progress bar for background jobs



---

## 10. Development Phases

### Phase 1 — MVP (Weeks 1-4)

**Goal:** Single-host platform with core functionality

**Features:**
- User authentication (email/password)
- Role-based access (trader/host/admin)
- Challenge creation with configurable rules
- Registration with Exness Partnership API verification
- Manual trade data entry (CSV upload or form)
- Rule engine checking all defined rules
- Trader dashboard with 6 cards + trade history
- Host dashboard with participant management
- Leaderboard (separate for demo/real)
- Basic admin panel

**Deliverables:**
- Functional web app
- Database schema implemented
- Exness Partnership API integrated
- Rule engine working
- Deployed to staging environment

### Phase 2 — Automation (Weeks 5-6)

**Goal:** Automated trade fetching and processing

**Features:**
- Exness Trading API integration
- Hourly cron job for trade fetching
- Automatic rule checking
- Real-time leaderboard updates
- Email notifications (registration approved, violations, rankings)

**Deliverables:**
- Fully automated trade processing
- Background job system
- Email service integrated

### Phase 3 — Multi-Host Platform (Weeks 7-8)

**Goal:** Allow multiple hosts to create challenges

**Features:**
- Host registration and approval
- Host-specific partner links
- Host dashboard improvements
- Platform analytics for admin
- Host billing/subscription (future consideration)

**Deliverables:**
- Multi-tenant architecture
- Host management system
- Admin analytics dashboard

### Phase 4 — Enhancements (Weeks 9-12)

**Goal:** Polish and advanced features

**Features:**
- Real-time updates (WebSockets)
- Advanced analytics (charts, trends)
- Mobile app (React Native)
- Payment integration for prizes
- Telegram bot integration
- Social features (comments, chat)
- Dispute resolution system

**Deliverables:**
- Production-ready platform
- Mobile apps (iOS/Android)
- Payment system
- Full documentation



---

## 11. Security & Compliance

### 11.1 Authentication & Password Security

**Password Requirements:**
- Minimum 12 characters
- Must contain: uppercase, lowercase, number, special character
- Password strength meter during registration
- Common password blacklist (top 10,000 weak passwords)
- Password breach detection (HaveIBeenPwned API integration)
- Real-time password strength feedback

**Password Storage:**
- Bcrypt hashing (cost factor 12+)
- Salted hashes
- No plain text storage ever
- Secure password reset flow with time-limited tokens

**Multi-Factor Authentication (MFA):**
- TOTP-based 2FA (Google Authenticator, Authy)
- Backup codes for account recovery
- Mandatory for admin accounts
- Optional but recommended for hosts
- SMS 2FA (future enhancement)

**Session Management:**
- JWT tokens with short expiration (15 minutes)
- Refresh tokens (7 days)
- Secure, httpOnly cookies
- Automatic logout on inactivity (30 minutes)
- Device tracking and management
- Force logout from all devices option

### 11.2 DDoS Protection & Rate Limiting

**Application-Level Rate Limiting:**
- Login attempts: 5 per 15 minutes per IP
- Registration: 3 per hour per IP
- API endpoints: 100 requests per minute per user
- Password reset: 3 per hour per email
- Challenge creation: 10 per day per host
- Trade data fetch: 60 per hour per account

**Infrastructure-Level Protection:**
- Cloudflare DDoS protection (recommended)
- WAF (Web Application Firewall) rules
- IP reputation filtering
- Geographic blocking (if needed)
- Request size limits (10MB max)

**Rate Limiting Implementation:**
```typescript
// Example rate limit configuration
{
  "login": { "max": 5, "window": "15m", "block": "1h" },
  "api": { "max": 100, "window": "1m", "block": "5m" },
  "registration": { "max": 3, "window": "1h", "block": "24h" }
}
```

**Response to Rate Limit Violations:**
- HTTP 429 (Too Many Requests)
- Exponential backoff suggestions
- Clear error messages with retry time
- Automatic IP blocking after repeated violations
- Admin notification for suspicious patterns

### 11.3 Admin Panel Security

**IP Whitelisting:**
- Admin panel accessible only from whitelisted IPs
- IP whitelist managed in environment variables or database
- Support for IP ranges (CIDR notation)
- Automatic blocking of non-whitelisted IPs
- Audit log of all admin access attempts

**Admin Authentication:**
- Mandatory 2FA for all admin accounts
- Separate admin login page (not /login, use /admin/auth)
- Additional password verification for sensitive actions
- Session timeout: 15 minutes (shorter than regular users)
- No "Remember Me" option for admins

**Admin Activity Logging:**
- Log all admin actions with timestamps
- Track: User modified, action taken, IP address, user agent
- Immutable audit logs
- Regular audit log reviews
- Alerts for suspicious admin activity

**Admin Panel Features:**
- View-only mode for junior admins
- Role-based permissions (super admin, moderator)
- Require password re-entry for destructive actions
- Confirmation dialogs for critical operations
- Export restrictions (require approval)

### 11.4 Data Protection & Encryption

**Data at Rest:**
- Database encryption (PostgreSQL TDE)
- Encrypted backups
- Secure key management (AWS KMS, HashiCorp Vault)
- Trading account credentials encrypted with AES-256

**Data in Transit:**
- HTTPS/TLS 1.3 only
- HSTS (HTTP Strict Transport Security)
- Certificate pinning for mobile apps
- Secure WebSocket connections (WSS)

**Sensitive Data Handling:**
- PII encryption in database
- Tokenization of trading account numbers
- Secure deletion (overwrite, not just delete)
- Data retention policies
- Regular data purging of old challenges

### 11.5 Input Validation & Injection Prevention

**SQL Injection Prevention:**
- Prisma ORM with parameterized queries
- No raw SQL queries (or strictly validated)
- Input sanitization on all user inputs

**XSS Prevention:**
- Content Security Policy (CSP) headers
- Input sanitization (DOMPurify)
- Output encoding
- React's built-in XSS protection

**CSRF Prevention:**
- CSRF tokens on all state-changing requests
- SameSite cookie attribute
- Origin header validation

**Command Injection Prevention:**
- No shell command execution from user input
- Whitelist validation for file uploads
- Secure file handling

### 11.6 API Security

**Authentication:**
- Bearer token authentication
- API key rotation
- Webhook signature verification (HMAC)

**Rate Limiting:**
- Per-endpoint rate limits
- Per-user quotas
- Burst protection

**Request Validation:**
- JSON schema validation
- Request size limits
- Content-type validation
- Malformed request rejection

**Response Security:**
- No sensitive data in error messages
- Consistent error responses (avoid info leakage)
- Response size limits

### 11.7 Third-Party Security

**Exness API Integration:**
- Secure credential storage
- API key rotation schedule
- Request signing
- Response validation
- Timeout handling
- Retry with exponential backoff

**Dependency Management:**
- Regular dependency updates
- Automated vulnerability scanning (Snyk, Dependabot)
- Lock file usage (package-lock.json)
- Audit npm packages before installation

### 11.8 Monitoring & Incident Response

**Security Monitoring:**
- Failed login attempt tracking
- Unusual activity detection
- API abuse monitoring
- Error rate monitoring
- Real-time alerts for security events

**Logging:**
- Centralized logging (ELK stack, CloudWatch)
- Log retention: 90 days minimum
- Sensitive data redaction in logs
- Tamper-proof logs

**Incident Response Plan:**
1. Detection and alerting
2. Containment (block IPs, disable accounts)
3. Investigation (audit logs, forensics)
4. Remediation (patch vulnerabilities)
5. Communication (notify affected users)
6. Post-mortem and improvements

**Backup & Recovery:**
- Daily automated backups
- Backup encryption
- Offsite backup storage
- Regular restore testing
- Disaster recovery plan (RTO: 4 hours, RPO: 1 hour)

### 11.9 Compliance & Privacy

**GDPR Compliance (if EU users):**
- Clear privacy policy
- Cookie consent
- Right to access data
- Right to deletion
- Right to data portability
- Data processing agreements

**Data Collection:**
- Only collect necessary data
- Clear purpose for each data point
- User consent for optional data
- Anonymous analytics option

**Data Sharing:**
- No sharing with third parties (except Exness for verification)
- Clear disclosure of data usage
- Opt-out options where applicable

**User Rights:**
- View personal data
- Export personal data
- Delete account and data
- Opt-out of marketing

### 11.10 Terms of Service

**Key Points:**
- Challenge rules are binding
- Automated disqualification is final (with appeal process)
- Prize distribution terms
- Liability limitations
- Dispute resolution process
- Acceptable use policy
- Account termination conditions
- Intellectual property rights

### 11.11 Security Checklist (Pre-Launch)

- [ ] SSL/TLS certificate installed and configured
- [ ] All passwords hashed with bcrypt
- [ ] 2FA implemented for admins
- [ ] Rate limiting on all endpoints
- [ ] Admin panel IP whitelist configured
- [ ] CSRF protection enabled
- [ ] XSS protection headers set
- [ ] SQL injection testing completed
- [ ] Dependency vulnerability scan passed
- [ ] Security audit completed
- [ ] Penetration testing performed
- [ ] Backup and restore tested
- [ ] Incident response plan documented
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] GDPR compliance verified (if applicable)
- [ ] Monitoring and alerting configured
- [ ] Audit logging enabled
- [ ] DDoS protection activated
- [ ] API security tested



---

## 12. Success Metrics

### 12.1 Platform Metrics
- Number of active challenges
- Total registered traders
- Number of hosts
- Total trades processed
- Average trades per challenge
- Platform uptime

### 12.2 User Engagement
- Daily active users (DAU)
- Challenge completion rate
- Average time on platform
- Repeat participation rate

### 12.3 Technical Metrics
- API response time (< 200ms)
- Trade processing time (< 1 hour)
- Leaderboard update frequency
- Error rate (< 0.1%)
- API uptime (99.9%)

### 12.4 Business Metrics (Future)
- Host subscription revenue
- Average challenge size
- Host retention rate
- Trader satisfaction score



---

## 13. Open Questions & Decisions Needed

### 13.1 Technical Decisions
- [ ] Database: PostgreSQL or MongoDB?
- [ ] Authentication: NextAuth.js or Clerk?
- [ ] File storage: AWS S3 or Cloudinary?
- [ ] Email service: SendGrid or Resend?
- [ ] Hosting: Vercel + Railway or all-in-one DigitalOcean?

### 13.2 Business Decisions
- [ ] Pricing model for multi-host platform?
- [ ] Commission on prizes?
- [ ] Free tier limitations?
- [ ] Host approval process?

### 13.3 Feature Decisions
- [ ] Allow traders to appeal violations?
- [ ] Show real names or anonymous IDs on leaderboard?
- [ ] Allow hosts to manually override rule violations?
- [ ] Support multiple currencies (USD, EUR, etc.)?
- [ ] Telegram bot integration priority?

### 13.4 Rule Engine Decisions
- [ ] TR6 (Daily drawdown): Auto-close positions or just flag?
- [ ] TR4 (Same pair limit): Total trades or concurrent trades?
- [ ] Should hosts be able to create custom rules beyond predefined ones?
- [ ] How to handle edge cases (e.g., trade opened before challenge, closed during)?



---

## 14. Risks & Mitigation

### 14.1 Technical Risks

**Risk:** Exness API downtime during challenge
- **Impact:** Cannot fetch trades, leaderboard outdated
- **Mitigation:** Retry logic, queue system, manual data entry fallback

**Risk:** High API rate limits with 1000+ accounts
- **Impact:** Cannot fetch all trades in time
- **Mitigation:** Batch processing, request queuing, caching

**Risk:** Database performance with millions of trades
- **Impact:** Slow queries, poor user experience
- **Mitigation:** Indexing, TimescaleDB, query optimization, caching

**Risk:** Rule engine bugs causing incorrect disqualifications
- **Impact:** Loss of trust, disputes
- **Mitigation:** Extensive testing, manual review option, audit logs

### 14.2 Business Risks

**Risk:** Legal issues with trading competitions
- **Impact:** Platform shutdown, fines
- **Mitigation:** Legal review, clear ToS, compliance checks

**Risk:** Fraud (fake accounts, manipulation)
- **Impact:** Unfair competitions, reputation damage
- **Mitigation:** KYC verification, duplicate detection, manual review

**Risk:** Low host adoption
- **Impact:** Platform remains single-host
- **Mitigation:** Marketing, host incentives, easy onboarding

### 14.3 User Experience Risks

**Risk:** Complex rule configuration confuses hosts
- **Impact:** Poorly configured challenges
- **Mitigation:** Templates, presets, clear documentation, tooltips

**Risk:** Traders don't understand why trades are flagged
- **Impact:** Disputes, frustration
- **Mitigation:** Clear violation messages, educational content, FAQ



---

## 15. Future Enhancements

### 15.1 Advanced Features
- **AI-powered insights:** Suggest optimal trading strategies based on challenge rules
- **Social features:** Trader profiles, following, comments
- **Live streaming:** Watch top traders in real-time
- **Team challenges:** Groups compete against each other
- **Bracket tournaments:** Single-elimination style competitions
- **Copy trading:** Follow successful challenge winners

### 15.2 Platform Expansion
- **Mobile apps:** Native iOS and Android apps
- **Multi-broker support:** Beyond Exness (MetaTrader, cTrader)
- **Multi-language:** Support for multiple languages
- **Regional challenges:** Country or region-specific competitions
- **Educational content:** Trading courses, webinars

### 15.3 Monetization
- **Host subscriptions:** Tiered pricing based on features
- **Platform commission:** Small percentage of prize pools
- **Premium features:** Advanced analytics, custom branding
- **Advertising:** Broker partnerships, sponsored challenges

### 15.4 Integrations
- **Telegram bot:** Notifications, quick stats, registration
- **Discord bot:** Community integration
- **TradingView:** Chart integration, strategy testing
- **Payment gateways:** Stripe, PayPal for automated prize distribution
- **Analytics:** Google Analytics, Mixpanel



---

## 16. Glossary

**Challenge:** A trading competition with defined rules, duration, and prizes

**Host:** User who creates and manages challenges

**Trader:** User who participates in challenges

**Registration:** A trader's enrollment in a specific challenge

**Qualified Profit:** Profit calculated only from trades that follow all rules

**Gross Profit:** Total profit from all trades (legal + illegal)

**Illegal Trade:** A trade that violates one or more challenge rules

**Rule Violation:** A specific instance of a rule being broken

**Leaderboard:** Ranked list of participants based on qualified profit

**Disqualification:** Removal from challenge due to severe violations

**Partner Link:** Exness referral link used to verify trader accounts

**KYC:** Know Your Customer — identity verification process

**Demo Account:** Practice trading account with virtual money

**Real Account:** Live trading account with real money

**Lot Size:** Trading volume (0.01 = 1 micro lot)

**Stop Loss:** Price level at which a losing trade is automatically closed

**Drawdown:** Reduction in account balance from peak

**Holding Time:** Duration a trade remains open

**Active Day:** A day on which a trader opens or closes at least one trade

---

## 17. Appendix

### 17.1 Example Challenge Configuration

```json
{
  "name": "BirrForex Challenge 15",
  "type": "hybrid",
  "start_date": "2026-04-01T00:00:00Z",
  "end_date": "2026-04-15T23:59:59Z",
  "starting_balance": 30,
  "target_balance": 60,
  "prizes": {
    "real": ["$400", "$350", "$300"],
    "demo": ["$200", "$100"]
  },
  "rules": {
    "position_management": {
      "max_lot_size": 0.02,
      "max_open_positions": 3,
      "mandatory_stop_loss": true,
      "max_loss_per_trade": 5,
      "same_pair_limit": 2,
      "max_holding_hours": 24
    },
    "risk_management": {
      "daily_drawdown_limit": 10,
      "allow_recharge": false
    },
    "activity": {
      "min_active_days": 7
    },
    "time_restrictions": {
      "allow_weekend_trading": false
    }
  }
}
```

### 17.2 Example Trade with Violation

```json
{
  "id": "trade_123",
  "symbol": "EURUSD",
  "type": "buy",
  "lot_size": 0.05,
  "open_time": "2026-04-05T14:30:00Z",
  "close_time": "2026-04-05T18:45:00Z",
  "open_price": 1.0850,
  "close_price": 1.0920,
  "profit": 35.00,
  "stop_loss": 1.0800,
  "is_qualified": false,
  "rule_violations": [
    {
      "code": "TR1_LOT_SIZE",
      "description": "Lot size exceeded maximum allowed",
      "details": {
        "used": 0.05,
        "max_allowed": 0.02
      }
    }
  ]
}
```

**Impact:**
- Gross Profit: +$35.00
- Qualified Profit: $0 (profit excluded)
- Trade flagged in history

---

## Document Control

**Version History:**
- v1.0 (2026-03-13): Initial draft

**Contributors:**
- Product Owner: [Your Name]
- Technical Lead: Kiro AI

**Review Status:**
- [ ] Product Owner Approval
- [ ] Technical Review
- [ ] Stakeholder Sign-off

**Next Steps:**
1. Review and approve this PRD
2. Clarify open questions (Section 13)
3. Finalize tech stack decisions
4. Begin Phase 1 development

---

**End of Document**
