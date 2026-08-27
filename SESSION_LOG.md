# BirrForex Challenges Bot - Session Log

This file tracks all discussions, decisions, and changes made across sessions.

---

## Session 1 — August 18, 2026

### Context
- Full system review completed
- Understood the 3 main systems: Weekly Quiz Challenges, Trading Challenges, WinnerPip (real-time leaderboard)
- Supporting components: VPS Pull (12 MT5 terminals), Express API, Next.js frontend, Python workers, PostgreSQL

### System Understanding Confirmed
- Entry point: `src/index.ts` bootstraps DB, Exness, Bot, Schedulers, VPS Pull, API
- Bot routing: `src/bot/bot.ts` (1864 lines) — deep links, commands, callbacks
- Schedulers: quiz (cron), trading (lifecycle), VPS pull (shared-queue, 4hr intervals)
- Evaluation: `wpEvaluationEngine.ts` — configurable rules, instrument-aware pip calc, fake SL detection via M1 candles
- API: Express on Railway serving WinnerPip frontend, Discord integration
- VPS: Python FastAPI router → 12 worker processes (MetaTrader5 API)
- DB: 3 schemas (quiz, trading, winnerpip)

### General Rule Established
- Every response will log what was discussed/changed in this file
- This ensures continuity across sessions

### Changes Made
- Created `SESSION_LOG.md` (this file) for cross-session tracking

---

## Update #1 — Per-Rule ON/OFF Toggle with Tooltips (IMPLEMENTED)

### Requirement
When configuring a trading challenge's rules (via WinnerPip admin panel), each rule should have an ON/OFF toggle. If a rule is turned OFF, that rule is completely skipped during evaluation for that challenge. Also added tooltip (ⓘ) icons that explain what each rule does on hover.

### Files Modified

**Backend (TG Bot):**
1. `src/services/wpEvaluationEngine.ts`
   - Added `RulesEnabled` interface with boolean fields for all toggleable rules
   - Added `rules_enabled?: RulesEnabled` field to `RuleConfig` interface
   - Added `isRuleEnabled()` helper function (defaults to `true` for backward compatibility)
   - Updated `seedDefaultRules()` to include `rules_enabled` with all rules ON
   - Added `isRuleEnabled()` guards to ALL rule enforcement points in `evaluateAccount()`:
     - max_lot_size, max_open_trades, pair_limit, stop_loss_required, daily_loss_cap, max_hold_hours, weekend_trading, min_active_days
   - Updated `getRulesForDisplay()` to only show enabled rules to users
   - Updated `isQualified` determination to skip min_active_days when disabled

2. `src/api/server.ts`
   - Updated JSDoc comment on PUT `/api/admin/:secretPath/challenge/:id/rules` to document `rules_enabled`
   - No structural changes needed — JSON pass-through already supports new field

3. `src/scheduler/vpsPullScheduler.ts`
   - STEP 7 (challenge-ended auto-DQ): checks `rules_enabled.min_active_days` before DQ'ing
   - Mid-challenge auto-DQ: same check added
   - `isWeekendTradingAllowed()`: returns `true` if weekend_trading rule is disabled (no restriction)

**Frontend (WinnerPip):**
4. `WinnerPip/winnerpip/app/admin/panel/page.tsx` (main admin panel)
   - Added `rules_enabled` to state
   - Added ON/OFF toggle (small, royal-colored) next to each rule label
   - Added hover tooltips (ⓘ icon) explaining each rule in detail
   - Input fields are disabled + faded (opacity-40) when rule is OFF
   - `rules_enabled` loaded from API (with backward-compatible defaults)
   - `rules_enabled` sent in PUT body when saving

5. `WinnerPip/winnerpip/app/admin/[id]/page.tsx` (per-challenge admin)
   - Same toggle + tooltip changes as panel page

6. `WinnerPip/winnerpip/app/admin/panel/page.tsx` — `CreateChallengePanel` component (Step 3: Rules)
   - Added `rules_enabled` to `rules` state
   - Replaced `RuleInput` with new `RuleInputWithToggle` — has ON/OFF toggle + tooltip
   - Replaced `RuleToggle` (for SL/Weekend) with new `RuleToggleWithTooltip` — has enable toggle + tooltip
   - Added helper components: `RuleInputWithToggle`, `RuleToggleWithTooltip`
   - `rules_enabled` sent when creating challenge via API

### Design Decisions
- **Backward compatible**: `rules_enabled` is optional. Existing challenges without it default to all rules ON (`isRuleEnabled` returns `true` when `rules_enabled` is undefined)
- **Max Risk per Trade** is tied to the SL Required enable toggle (they're the same rule)
- **Only Cent Account** doesn't have an enable toggle (it's a registration filter, not an evaluation rule)
- **Disabled rules**: input values are preserved even when toggled OFF, so you can turn them back ON without re-entering values

### Pending
- Update #2: Percentage-based SL risk and daily drawdown — confirmed feasible, starting implementation

---

### Verification Audit (Post-Implementation)

After user confirmed toggles are visible, ran a full audit of all files that consume rules. Found and fixed 3 gaps:

**Gaps Fixed:**
1. `src/bot/evaluationHandler.ts` — Legacy evaluation was passing rule values unconditionally. Now passes `99999` (effectively unlimited) for disabled rules, so legacy engine won't flag them. `minActiveDays` gets `0` when disabled.
2. `src/bot/evaluationHandler.ts` — Fake SL candle check now checks `rules_enabled.stop_loss_required !== false` before running.
3. `src/api/server.ts` (line 1630) — Metrics weekend filter now checks `rules_enabled.weekend_trading === false` — if rule is disabled, weekend trades are included in stats.

**Confirmed Fully Compliant (no gaps):**
- `src/services/wpEvaluationEngine.ts` — All 11 rule checks use `isRuleEnabled()`
- `src/scheduler/vpsPullScheduler.ts` — All 3 locations check `rules_enabled`
- `src/scheduler/tradingScheduler.ts` — Does not use rules at all
- `src/api/discordRoutes.ts` — Only uses `only_cent_account` (registration filter, not evaluation rule)
- `src/services/leaderboardService.ts` — Does not read rules at all

---

## Update #2 — Percentage-Based SL Risk & Daily Drawdown (IMPLEMENTED)

### Requirement
Add option to set SL risk and daily loss cap as a percentage of account balance instead of a fixed dollar amount. For SL: percentage of balance at the time each trade is opened. For daily drawdown: percentage of day's opening balance.

### Files Modified

**Backend:**
1. `src/services/wpEvaluationEngine.ts`
   - Added `max_risk_mode`, `max_risk_percent`, `daily_loss_mode`, `daily_loss_percent` to `RuleConfig`
   - Daily drawdown: computes `effectiveDailyCap = dayOpenBalance * (percent/100)` per day
   - SL risk: builds running balance timeline, computes per-position effective max risk from balance at open time
   - `getEffectiveMaxRisk()` helper returns dynamic value for percentage mode, fixed for default
   - All SL checks (Layer A declared SL, Layer B candle, per-trade re-check, escalation, loss-exceeded) use dynamic value
   - Violation messages show both % and calculated $ amount
   - `getRulesForDisplay()` shows "10% of account balance" / "20% of day's balance"
   - `seedDefaultRules()` includes mode fields (default: `'fixed'`)

2. `src/bot/evaluationHandler.ts`
   - Legacy engine approximation: computes effective value from `starting_balance * percent/100`
   - Acceptable since legacy `/evaluate` is a manual quick-check, not primary evaluation

**Frontend:**
3. `WinnerPip/winnerpip/app/admin/panel/page.tsx`
   - Both Rules tab AND creation stepper (Step 3) updated
   - Mode fields added to `rulesConfig` and `rules` states + API load logic
   - New `RuleInputWithMode` component: shows "Fixed $" / "% Balance" toggle buttons
   - Input switches between dollar field and percentage field based on mode
   - Review step (Step 4) shows mode-appropriate display

### Design Decisions
- **Percentage SL risk**: uses running balance (sum of profits from trades closed before this one opened) — accurate per-trade dynamic calculation
- **Percentage daily loss**: uses `dayOpenBalance` which is already tracked — clean fit
- **Legacy engine**: uses starting balance approximation since it doesn't track per-trade balance
- **Cent accounts**: percentages auto-scale correctly (10% of 5000¢ = 500¢)
- **Backward compatible**: `undefined` mode = `'fixed'` behavior, existing challenges unaffected

---

## Update #3 — Minimum Trade Duration & Minimum Total Trades (IMPLEMENTED)

### Requirement
1. **Min Trade Duration**: Trades held shorter than X minutes are flagged, profits removed (per-trade enforcement)
2. **Min Total Trades**: Users need X total trades to qualify. Blue flag during challenge, DQ at end if not met.

### Files Modified

**Backend:**
1. `src/services/wpEvaluationEngine.ts`
   - Added `min_trade_duration_minutes` and `min_total_trades` to RuleConfig
   - Added `min_trade_duration` and `min_total_trades` to RulesEnabled
   - Per-trade min duration check (after max hold hours check)
   - End-of-challenge min_total_trades DQ logic (only DQs when challenge over)
   - Undo incorrect DQ if user meets requirement later
   - getRulesForDisplay shows both rules
   - seedDefaultRules includes both (null = not active)

2. `src/services/evaluationEngine.ts` (legacy)
   - Added `minTradeDurationMinutes` to EvaluationConfig
   - Added per-trade min duration check in hold-time loop

3. `src/bot/evaluationHandler.ts`
   - Passes `minTradeDurationMinutes` to legacy engine (respects rules_enabled)

4. `src/scheduler/vpsPullScheduler.ts`
   - End-of-challenge DQ for min_total_trades (STEP 7 block)

5. `src/api/server.ts`
   - Leaderboard response includes `minTotalTrades` from rules (for frontend blue flag)

**Frontend:**
6. `WinnerPip/winnerpip/app/admin/panel/page.tsx`
   - Creation stepper (Step 3): added inputs for both rules with ON/OFF + tooltips
   - Rules tab: added inputs for both rules with ON/OFF + tooltips
   - States + API loading updated

7. `WinnerPip/winnerpip/app/challenge/[id]/page.tsx` (user dashboard)
   - Blue info banner: "Minimum Trades Not Met — X/Y trades" (shown during active challenge)
   - Blue flag in leaderboard user detail modal when viewing someone who hasn't met min
   - `minTotalTrades` state stored from leaderboard API response

### Behavior Summary
- **Min Trade Duration**: e.g., min 2 minutes — trade held 45 seconds → flagged, profit removed
- **Min Total Trades**: e.g., min 10 trades
  - During challenge: blue info banner on dashboard, blue badge in leaderboard detail
  - At challenge end: hard DQ ("Did not meet minimum 10 trades (completed 7 trades)")
  - If user later meets it: DQ automatically cleared on next evaluation

---

## Update #4 Phase 1 — Deposit Mode Data Layer (IMPLEMENTED)

### What was done
Added `deposit_mode` and `target_percent` fields to the system without changing any existing evaluation, leaderboard, or registration logic. This is the safe foundation for Phase 2.

### Files Modified
1. `src/database/migrate.ts` — ALTER TABLE adds `deposit_mode` (DEFAULT 'fixed') and `target_percent` (nullable)
2. `src/services/challengeGatekeeper.ts` — executeCreate INSERT includes new columns; buildCreateMessage shows mode
3. `src/api/server.ts` — POST /challenges accepts and forwards `deposit_mode` + `target_percent`
4. `WinnerPip/winnerpip/app/admin/panel/page.tsx` — Deposit mode selector in Step 2, conditional target input

### What's safe
- All existing challenges default to `deposit_mode = 'fixed'` automatically
- No evaluation logic changes — `isQualified` still uses `adjustedBalance >= targetBalance`
- No leaderboard ranking changes — still ranks by `normalized_balance`
- No registration validation changes — still checks against `starting_balance`

### Phase 2 (next session)
Will implement the actual logic for `max_limit` and `min_limit` modes:
- Evaluation: growth % qualification check
- Leaderboard: rank by growth %
- Registration: adjusted validation per mode
- Pre-start: inverted DQ for min_limit
- Frontend: growth % display on leaderboard

---

## Update #4 Phase 2 — Deposit Modes Logic (IMPLEMENTED)

### What was done
Full implementation of `max_limit` and `min_limit` deposit modes across the entire system.

### Files Modified (8 files)
1. `src/services/wpEvaluationEngine.ts` — evaluateAccount accepts depositMode/targetPercent, deposit DQ respects mode, isQualified uses growth %, growth_percent stored in staging
2. `src/services/leaderboardService.ts` — Rankings use growth_percent for non-fixed modes, flush copies growth_percent
3. `src/services/tradingChallengeService.ts` — TradingChallenge interface updated with deposit_mode + target_percent
4. `src/api/server.ts` — Leaderboard returns depositMode + growthPercent, challenge creation passes new fields
5. `src/scheduler/tradingScheduler.ts` — Pre-start snapshot and balance warning respect deposit mode
6. `src/bot/tradingRegistrationHandler.ts` — Registration balance validation per mode
7. `src/database/migrate.ts` — growth_percent column on leaderboard + staging tables
8. `WinnerPip/winnerpip/app/challenge/[id]/page.tsx` — Shows growth % on leaderboard when applicable

### Behavior by Mode
| Aspect | fixed | max_limit | min_limit |
|--------|-------|-----------|-----------|
| Deposit DQ | above limit | above max | below min |
| Target | adjustedBalance >= $ | growth % >= target % | growth % >= target % |
| Leaderboard rank | by balance | by growth % | by growth % |
| Leaderboard display | $45.20 | ↑ 85.2% ($45.20) | ↑ 85.2% ($45.20) |
| Registration real | reject if above | reject if above | accept any (DQ at pre-start if below) |
| Registration demo | exact match | reject if above | reject if below |
| Pre-start DQ | above = DQ | above = DQ | below = DQ |
| SL/DD rules | fixed $ or % | must be % (frontend enforces) | must be % (frontend enforces) |

### Safety
- All existing challenges have `deposit_mode = 'fixed'` (DB default)
- Every code path defaults to `'fixed'` when field is null/undefined
- Fixed mode logic is completely unchanged — no conditional branches affect it

---

## Update #5 — Past Challenges Tab with Winner Popup (IMPLEMENTED)

### What was done
Added "Past Challenges" tab to the WinnerPip challenges page with winner popup modal.

### Files Modified
1. `src/api/server.ts`
   - GET /api/challenges now accepts `?include_past=true` to skip 7/14-day visibility filter
   - New endpoint: GET /api/challenges/:id/winners — returns winner data for completed challenges
   - Challenge 15 winners hardcoded (Eyobgere, Therealteme89, Amanxspat, Devaman00, Romeo5121, Bella4x19)
   - For other challenges: queries wp_leaderboard for top N qualified users by rank

2. `WinnerPip/winnerpip/app/challenges/page.tsx` (full rewrite)
   - Two tabs: "Current Challenges" (default) and "Past Challenges"
   - Past challenge cards show "Completed" badge with checkmark
   - Clicking a past challenge opens winner modal showing rank + nickname + trades/flagged + prize
   - No winners → "No participant hit the target" message
   - Team-only challenges: prizes blurred in the modal
   - Current challenges tab: shows existing active/upcoming cards unchanged

---

## Update #6 — Host Mode (MAJOR FEATURE — SPEC)

### Vision
Turn WinnerPip into a multi-tenant platform where external partners ("Hosts") pay to run their own trading challenges using the evaluation infrastructure, without knowing the internal mechanism.

### Architecture Decisions
- **Multi-tenant via host_id FK** on trading_challenges (NULL = BirrForex, set = hosted)
- **Separate host dashboard route** (`/host/dashboard`) — not conditional admin panel
- **Terminology sanitized**: "pull" → "update", no VPS/OHLC/candle/terminal references
- **Credential encryption**: AES-256-GCM with Railway env master key
- **Email notifications via Resend** for hosted challenge participants (from challenges@winnerpip.com)
- **Internal payment structure** prepared but not exposed in UI yet

### Database: New Tables
```
hosts:
  id, display_name, email, password_hash,
  broker_email_encrypted, broker_password_encrypted, broker_api_key_encrypted,
  encryption_iv, has_broker_integration (boolean),
  active, created_at, last_login_at

host_login_history:
  id, host_id, login_at, ip_address
```

### Database: Modified Tables
- `trading_challenges` → add `host_id INTEGER REFERENCES hosts(id)` (nullable)
- `trading_registrations` → allow `user_id` and `username` to be nullable (for WinnerPip web registrations)
- `trading_registrations` → add `email` column for notifications (already exists but used for Exness email — may need a `notification_email` field)

### Host Account Lifecycle
1. Admin creates host via admin panel (display_name, email, password)
2. Admin sends credentials to host manually
3. Host logs in at winnerpip.com/host/login
4. Host creates challenge → admin approves via Telegram
5. Host status changes → admin approves
6. Admin can pause/cancel/delete host's challenge (non-payment, etc.)

### Host Dashboard Tabs
- **Overview**: challenge stats (same as admin overview but for their challenge only)
- **Participants**: list of registered users
- **Leaderboard**: same as admin leaderboard view
- **Screening**: only visible if broker integrated (partner allocation check)
- **Rules**: rule configuration (same UI as admin rules tab)
- **Settings**: challenge settings (dates, prizes, etc.)
- **Updates**: renamed "Pulls" tab — shows update cycles without revealing mechanism

### Admin Host Management
- "Create Host" button on admin panel
- Host list: display_name, email, active challenges, login history, status
- Can: reset credentials, deactivate, delete host
- Can: pause/cancel/delete any host's challenge
- Sees ALL challenges (host + BirrForex) in the challenge list

### Challenge Card Display (Public)
- Shows challenge title
- Badge: "Hosted by [HostName]"
- "Register" button (leads to web registration form)
- Non-BirrForex challenges don't show BirrForex branding

### Registration Flow for Hosted Challenges (on WinnerPip web)
- Form: Email (Exness), Nickname, Account Number, MT5 Server, Investor Password, Account Type
- If host has broker integration: system verifies partner allocation using host's encrypted credentials
- System verifies MT5 connection via VPS (same as current)
- On success: registration saved with source='winnerpip', telegram_id=null
- Error messages: same as Telegram bot flow

### CSV Upload Path (No Broker Integration)
- Host uploads CSV: nickname, account_type, account_number, server, investor_password
- Admin approves the upload
- System verifies each account (VPS connection, fuzzy server match)
- Reports: which succeeded, which failed (with reasons)
- Failed accounts can be corrected and re-uploaded
- telegram_id/username = null for CSV participants

### Email Notifications (via Resend)
- From: challenges@winnerpip.com
- Events: registration confirmation, balance warning, DQ notification, challenge start, challenge end
- Only for hosted challenge participants (BirrForex participants still use Telegram DMs)

### Broker Credential Security
- AES-256-GCM encryption
- Master key: Railway environment variable (BROKER_ENCRYPTION_KEY)
- Per-host unique IV stored in DB
- Decrypted only at runtime for allocation checks
- Never logged, never returned via API
- Audit trail: log every decryption access

### Constraints
- Host can run ONE challenge at a time (can create next immediately after completion)
- Pull schedule: fixed 6x/day (host cannot change)
- Every challenge creation + status change requires admin approval
- Admin has full control over all challenges regardless of owner

### Implementation Phases
- **Phase 1**: Database schema + Host model + encryption utils + admin host management
- **Phase 2**: Host authentication (login page, session, middleware)
- **Phase 3**: Host dashboard (overview, participants, leaderboard, rules, settings, updates)
- **Phase 4**: WinnerPip web registration flow for hosted challenges
- **Phase 5**: CSV upload path + email notifications (Resend integration)
- **Phase 6**: Host landing page (`/host`) + footer link + terminology cleanup
- **Phase 7**: Admin approval flow for host actions + billing structure (internal)

### Key Principle
The evaluation engine, VPS pull scheduler, leaderboard service — NONE of these change. They already work per-challenge. A hosted challenge is just another challenge with `host_id` set. The only new code is the access layer (who can see what) and registration path (web vs Telegram).

---

## Host Mode Implementation Progress (Session 1)

### Completed Phases:
- **Phase 1** ✅ — Database (hosts, host_login_history tables), host_id FK on trading_challenges, AES-256-GCM encryption utility, hostService CRUD, admin API endpoints (6 endpoints for host management)
- **Phase 2** ✅ — Host authentication (login/verify-token API, JWT tokens with 24h expiry, hostAuthMiddleware, frontend login + register pages)
- **Phase 3** ✅ — Host dashboard (5 protected API endpoints + frontend with 4 tabs: Overview, Participants, Leaderboard, Updates)
- **Phase 4** ✅ — Web registration for hosted challenges (POST /api/challenges/:id/register with VPS verify, 'Hosted by' badge on cards, registration modal on frontend)
- **Phase 5** ✅ — CSV upload (host_csv_uploads + host_csv_rows tables, upload/approve/status endpoints, frontend CSV parser, email notifications for DQ + drawdown via Resend)
- **Phase 6** ✅ — Host landing page (/host) + 'Host' link in footer

### Remaining:
- **Phase 7** — Admin approval flow for host challenge creation + status changes (gatekeeper integration for host-created challenges)
- **Additional** — Host challenge creation UI on host dashboard (create challenge button + form)
- **Additional** — Admin panel host management UI (Create Host button, host list, login history view)
- **Additional** — Terminology cleanup in host dashboard (ensure no "pull" references leak)

### Key Files Created This Session:
- `src/database/host_schema.sql` — hosts, host_login_history, host_csv_uploads, host_csv_rows
- `src/utils/encryption.ts` — AES-256-GCM for broker credentials
- `src/services/hostService.ts` — Full CRUD + credential encryption
- `src/services/emailService.ts` — Resend integration (5 email types)
- `WinnerPip/winnerpip/app/host/page.tsx` — Landing page
- `WinnerPip/winnerpip/app/host/login/page.tsx` — Login
- `WinnerPip/winnerpip/app/host/register/page.tsx` — Register (contact support)
- `WinnerPip/winnerpip/app/host/dashboard/page.tsx` — Dashboard with 4 tabs

### Key Environment Variables Required:
- `BROKER_ENCRYPTION_KEY` — 64-char hex string for AES-256 (Railway)
- `RESEND_API_KEY` — Resend API key for email (Railway)

### Next Session: Start with Phase 7 (admin approval for host actions)


---

## Host Mode Phase 7 — Admin Approval Flow (IMPLEMENTED)

- POST /api/host/challenges — host creates challenge, queued via gatekeeper for admin Telegram approval
- PATCH /api/host/challenge/:id/status — host requests status change, admin approves on Telegram
- Gatekeeper updated: queueStatusChange + executeStatusChange unified with optional hostName
- Frontend: Create Challenge modal on host dashboard with full form
- Bot callback already handles status_change type approvals

## All 7 Host Mode Phases COMPLETE

### Summary of Deliverables:
- Phase 1: DB schema, encryption, host service, admin API
- Phase 2: Host JWT auth (login, verify, middleware)
- Phase 3: Host dashboard (4 tabs, protected API)
- Phase 4: Web registration for hosted challenges
- Phase 5: CSV upload + email notifications (Resend)
- Phase 6: Landing page + footer + SEO
- Phase 7: Admin approval via Telegram gatekeeper

### Additional Work This Session:
- About, Terms, Privacy pages (legally comprehensive)
- SEO (meta, OG, structured data, sitemap, robots)
- Resend email integration with branded templates
- Past Challenges tab with winner popup
- Deposit modes (fixed/max_limit/min_limit) fully implemented
- Per-rule ON/OFF toggles + tooltips
- Percentage-based SL risk and daily drawdown
- Min trade duration + min total trades rules

### Remaining Work (for future sessions):
- Admin panel UI for host management (Create Host button, host list with stats)
- Host dashboard: Rules tab configuration form
- Host dashboard: Settings tab for challenge edits
- Broker credential setup UI for hosts
- Test end-to-end host flow with a real host account

---

## Session 2 — August 19, 2026

### Host Mode UI Completion

Completed all remaining Host Mode UI work outlined at the end of Session 1.

### Changes Made

**1. Admin Panel — Hosts Tab** (`WinnerPip/winnerpip/app/admin/panel/page.tsx`)
- Added "Hosts" to nav tabs (between "settings" and "health")
- New `HostsManagementPanel` component:
  - "Create Host" button + modal (display name, email, password)
  - Host list with status indicator (green/gray dot), email, active/total challenge counts
  - Expandable detail panel per host: stats grid, login history (last 10 entries with timestamps + IPs), challenges list
  - Management actions: Reset Password (modal with new password input), Deactivate/Activate toggle, Delete (with confirmation)
  - All wired to existing admin API endpoints (GET/POST/PATCH/DELETE `/api/admin/:secretPath/hosts`)

**2. Host Dashboard — Rules Tab** (`WinnerPip/winnerpip/app/host/dashboard/page.tsx`)
- Added "Rules" tab with full rule configuration form (same capabilities as admin)
- `RuleRow` helper component: ON/OFF toggle, label, tooltip (ⓘ hover), input slot
- All 10 rules configurable: max lot size, max open trades, pair limit, SL required + max risk (Fixed $ / % Balance), daily loss cap (Fixed $ / % Balance), max hold hours, min trade duration, weekend trading, min active days, min total trades, only cent account
- Locked state: when challenge is active, all inputs disabled with explanatory text
- Save button with loading spinner + success confirmation

**3. Host Dashboard — Settings Tab** (`WinnerPip/winnerpip/app/host/dashboard/page.tsx`)
- Added "Settings" tab for editing challenge details
- Form fields: title, end date, target balance, target percent, prize pool text, real/demo winners count, real/demo prizes (comma separated)
- Save button sends only populated fields to API

**4. Host Dashboard — Broker Credential Setup** (`WinnerPip/winnerpip/app/host/dashboard/page.tsx`)
- `BrokerCredentialsSection` component in Settings tab
- States: not configured (show "Setup" button), configured (show green "active" badge + Update/Remove actions), form (email, password, API key inputs)
- AES-256 encryption note shown in form
- Remove with confirmation dialog

**5. Backend API Endpoints Added** (`src/api/server.ts`)
- `GET /api/host/challenge/:id/rules` — fetch rules with ownership verification + locked status
- `PUT /api/host/challenge/:id/rules` — save rules (blocked when challenge active + rules already exist)
- `PUT /api/host/challenge/:id/settings` — update challenge details (limited to host-safe fields: title, end_date, target_balance, target_percent, prize_pool_text, winners counts, prizes)
- `GET /api/host/broker-status` — check if host has broker integration
- `POST /api/host/broker-credentials` — save encrypted broker credentials
- `DELETE /api/host/broker-credentials` — remove broker integration

### Terminology Audit
- Scanned all host-facing files (`/host/**`) and host API response fields
- **Result: Clean** — no 'pull', 'VPS', 'OHLC', 'candle', or 'terminal' references leak to hosts
- The updates tab correctly queries `wp_pull_batches` internally but exposes sanitized field names (`updateNumber`, `startedAt`, `successful`, `failed`, `totalAccounts`)

### Git
- Branch: `feature/host-mode-ui`
- Commit: `1f1c664` — "feat: add Host Mode UI — admin Hosts tab, host Rules/Settings/Broker tabs"
- Pushed to origin

### Host Mode — FULLY COMPLETE

All 7 phases + all additional UI work are now implemented:
- Phase 1 ✅ DB schema, encryption, host service, admin API
- Phase 2 ✅ Host JWT auth (login, verify, middleware)
- Phase 3 ✅ Host dashboard (6 tabs: Overview, Participants, Leaderboard, Rules, Settings, Updates)
- Phase 4 ✅ Web registration for hosted challenges
- Phase 5 ✅ CSV upload + email notifications (Resend)
- Phase 6 ✅ Landing page + footer + SEO
- Phase 7 ✅ Admin approval via Telegram gatekeeper
- Admin panel Hosts management tab ✅
- Host Rules configuration ✅
- Host Settings (challenge edits) ✅
- Broker credential setup ✅
- Terminology sanitization ✅

### Remaining (non-blocking, future)
- End-to-end test with a real host account
- Optional: in-panel admin approval view (currently Telegram-only — fully functional)

---

## Session 3 — August 19-20, 2026

### Host Mode UI Completion + Bug Fixes + Timezone + Dashboard API

#### UI Work Done:
- Admin Hosts tab moved to header button
- Host Create Challenge rebuilt as multi-step form (Details → Rules → Review)
- Deposit mode as colored button cards with info box
- Rules step with admin-style toggles + tooltips
- Registration Mode selector (Online vs Manual based on broker status)
- Settings button in host header for broker integration
- Timezone selector dropdown in challenge creation
- Create Host modal fixed (solid background, centered popup)
- Modals mobile-friendly
- Landing page: real stats from DB, security section, natural copy, prizes shown

#### Critical Bugs Fixed:
- `host_id` not saved in executeCreate() — challenge was created with NULL host_id
- `req.host` is a read-only getter in Express — renamed to `req.hostAccount`
- Pull scheduler only pulled first active challenge — now targets specific challenge ID
- JSON body limit 10kb too small — increased to 50kb
- Stop Loss Required toggle removed from creation (redundant with Max Risk)

#### Timezone Implementation (Full):
- DB: `timezone` column on trading_challenges (default Africa/Nairobi)
- Host creation: timezone picker with all IANA zones
- API: returns timezone in challenge responses
- Telegram approval: shows selected timezone
- New utility: `src/utils/timezone.ts` with native Intl functions
- vpsPullScheduler: checkPullSchedule(), shouldSkipWeekend(), isSaturdayFinalSync(), isMidnightRun() all use per-challenge timezone
- wpEvaluationEngine: isWeekend() uses challenge timezone for weekend trade detection
- formatCandleTimeEAT: uses challenge timezone for violation messages
- User dashboard (/challenge/[id]): all time helpers use challenge.timezone
- Host dashboard: last update + updates tab use challenge timezone
- Backward compatible: all existing challenges default to Africa/Nairobi

#### Host Dashboard API (16 new endpoints):
Created `src/api/hostRoutes.ts` mounted at `/api/host` with ownership verification:
- GET /challenge/:id/full-overview
- GET /challenge/:id/full-participants (paginated)
- GET /challenge/:id/violations
- GET /challenge/:id/failed-accounts
- GET /challenge/:id/pull-history
- GET /challenge/:id/user-trades
- GET /challenge/:id/export-registrations (limited fields)
- GET /challenge/:id/export-user-trades (MT5 report)
- POST /challenge/:id/force-update
- POST /challenge/:id/force-update-rank
- POST /challenge/:id/re-evaluate-user
- POST /challenge/:id/disqualify
- POST /challenge/:id/unverify
- POST /challenge/:id/retry-credentials
- PATCH /challenge/:id/direct-status
- DELETE /challenge/:id

#### Other Changes:
- Challenge now inserts to DB immediately as 'pending_approval' (host sees it right away)
- Rejection updates status to 'rejected' (visible on dashboard)
- Telegram approval message shows all details in AM/PM format
- Allow Professional Accounts toggle added to host creation
- Removed API Key from broker setup (only email + password needed for Exness)
- Email notifications: balance warning, challenge start/end for web participants
- Screening tab + allocation check during registration

### REMAINING (Next Session):
- **Frontend rebuild of host dashboard** — port admin panel UI (Overview, Participants, Leaderboard, Violations, Updates, Settings tabs) to match admin exactly, using the 16 new API endpoints
- This is the final piece — API is ready, just needs the UI

### REMAINING (Critical — Next Session Priority):
- **Host dashboard visual parity with admin** — the structure/tabs/API calls are all correct but the UI within each tab needs to match admin's visual density:
  - Overview: needs the same StatCard component with icons + colored text, same grid layout
  - Participants: needs search bar, category filter tabs (Total/Demo/Real/Due For), full table with all columns (nickname, username, email, account, type, balance, profit, trades, actions), proper detail modal with balance chart
  - Leaderboard: needs full table layout (not cards) with columns: rank, nickname, account, type, balance/gross, trades, pass%, profit, violations. Clickable rows.
  - Violations: needs same card layout as admin (nickname + account + flag count + $ removed)
  - Updates: needs more action buttons matching admin (Full Update + Evaluate + Rank, View Failed Accounts button). Credential failures need Retry + Update PW buttons per account.
  - Rules: needs 2-column grid layout matching admin exactly (with Fixed/%Balance toggles, descriptions under each rule, "Always enforced" notes)
  - Settings: needs full form matching admin (title, type, start/end dates, balance, target, prize pool text) + colored status action buttons (Open Reg green, Start blue gradient, End + Review gold, Completed gray) + exports section (Registrations CSV, Leaderboard CSV) + no Announce button + no OHLC + no debug log
  
  Reference: read admin/panel/page.tsx lines 571-1780 for the exact UI patterns to port.
  The host file currently at WinnerPip/winnerpip/app/host/dashboard/page.tsx has the correct API wiring — just needs the JSX within each tab section to be replaced with admin-matching markup.


---

## Session 4 — August 21, 2026

### Host Dashboard Visual Parity + Data Accuracy + Email System

Major session focused on making the host dashboard work identically to the admin panel — both visually and in data computation.

### Host Dashboard Rewrite (Visual Parity)
- **Participant Detail Modal**: Rewritten with BalanceChart (account growth), Gross profit stat, RKR percentage, Win Rate + Avg RR calculation, full trade history with balance operations (deposits/withdrawals/swaps), clickable trades opening Trade Detail Modal, Export MT5 Trade History button
- **Trade Detail Modal**: New modal showing ticket details, direction, lots, open/close prices+times, SL/TP, profit, commission, swap, violations
- **Verify Popup Modal**: Top-level modal showing connection verification results with balance/equity
- **Verify button in participants table**: Now pipes results into popup modal and updates balance in local state
- **Trading Insights section**: Full metrics matching admin — best/worst trade with cur(), win rates, most traded pair, RKR, active days (per category for hybrid)

### Data Accuracy Fixes (Backend)
- **Overview crash fixed**: `violations` column is JSON string not PostgreSQL array — `unnest()` crashed endpoint, replaced with `string_to_array(regexp_replace(...))` matching admin
- **Trade stats date-filtered**: Only counts trades within `start_date - 3h` to `end_date` (was counting ALL trades)
- **Cent volume division**: Divides cent user volumes by 100 in trade stats (matching admin)
- **Above Target**: Uses cent-aware comparison (multiplies target×100 for cent users) with proper JOINs
- **Pull stats**: Uses 24h window with accumulated success/failed counts (was using current-date only)
- **Balance card**: Shows only real balance as main value (admin pattern), sub shows Real + Demo
- **Balance query**: Copied exactly from admin — no leaderboard JOIN, only registrations, divides cents by 100, `disqualified=false` + `investor_password IS NOT NULL`
- **Updates Today card**: Added "Next: HH:00 EAT" sub-text

### Cent Account Detection
- Per-user `isCent` flag from participant data determines currency format (not challenge-wide)
- `cur()` helper shows `116.00¢` for cent accounts, `$500.00` for standard
- Applied to: overview, participants table, leaderboard, detail modal, trade modal, found-user card
- Cent accounts can participate in ANY challenge — detection is per-user

### Check-Balance Persistence
- Verify/check-balance endpoint now saves `last_known_balance` + `pull_status` + `last_pull_at` to DB
- Balance persists across refreshes/tab changes
- Credential failures also marked (`pull_status = 'password_changed'`)

### CSV Upload Improvements
- **Deposit validation**: Validates balance against challenge rules (fixed/max_limit/min_limit) with cent awareness + 5% tolerance
- **Balance saved to DB**: INSERT now includes `registration_balance` and `last_known_balance`
- **Professional account validation**: Rejects pro/raw_spread/zero accounts if `allow_professional` not enabled
- **Cent account validation**: Rejects non-cent real accounts if `only_cent_account` enabled
- **Re-upload after unregister**: Deletes previously removed registrations before INSERT to avoid unique constraint conflicts

### Email System
- **Registration confirmation**: Sent on CSV upload success + web registration. Shows balance, host name (clickable), account details
- **Disqualification email**: Sent with actual reason from textarea. Host name is clickable link to contact_link
- **Removal email**: New `sendUnregistered()` template. Orange header, shows reason, clickable host name
- **Host contact_link**: New DB column on hosts table. All emails make host name a clickable link to this URL
- **Admin Edit Host**: New modal in admin panel to edit display_name + contact_link

### Unregister Fix
- Sets `email = 'removed_<id>_<email>'` and `account_number = '<num>_removed_<id>'` to avoid unique constraint (NOT NULL constraint on email prevented NULLing)
- Properly allows re-registration of same user after removal

### Other Fixes
- Challenge card participant count now excludes removed/unregistered (`status != 'removed'`)
- Host landing page: "Real-Time Leaderboard" → "Live Leaderboard", "multiple times a day" wording
- `buildMetricsForCategory()` in host overview matches admin exactly (all 12 metric types)

### Files Modified
- `src/api/hostRoutes.ts` — Full overview rewrite, deposit validation, email integration, unregister fix
- `src/api/server.ts` — CSV email calls, deposit validation, pro account check, participant count fix, admin host edit endpoint
- `src/services/emailService.ts` — Updated all templates with hostName/hostLink, added sendUnregistered(), balance in registration email
- `src/services/hostService.ts` — Added contact_link to getAllHostsWithStats query
- `src/database/migrate.ts` — Added contact_link column migration
- `WinnerPip/winnerpip/app/host/dashboard/page.tsx` — Complete visual parity (BalanceChart, trade modal, verify popup, cur() helper, full metrics)
- `WinnerPip/winnerpip/app/admin/panel/page.tsx` — Edit Host modal (display_name + contact_link)
- `WinnerPip/winnerpip/app/host/page.tsx` — Landing page wording fix

### Commits (in order)
- `047f1f5` — Host dashboard admin parity (BalanceChart, trade detail modal, verify popup)
- `91d194c` — Overview shows Total Balance, verify button updates table
- `54d3b35` — Check-balance persists to DB, overview balance uses registrations fallback
- `f0af4c3` — Overview crash fix (JSON violations not pg array)
- `c65490c` — Trade volume details, rejected status filter
- `cbacb24` — Cent account detection, pro account validation, last pull time
- `d34a5f3` — Per-user cent detection, overview balance divides cents by 100
- `1af7971` — Full admin-matching metrics (buildMetricsForCategory)
- `1bb8d6e` — Balance query copied exactly from admin
- `b7b664b` — Total Balance shows only real balance (admin pattern)
- `7b3488c` — Updates Today "Next: HH:00 EAT" sub-text
- `90ced7b` — Date-filtered trades, cent volume division, cent-aware above-target, 24h pull stats
- `45d300d` — Registration confirmation email on CSV upload
- `558ef69` — DQ and removal emails with reason
- `5c4c734` — Unregister mangles email/account_number for unique constraint
- `dd47d4e` — Delete removed registrations before CSV re-insert
- `11d03c9` — Unregister mangles email (NOT NULL fix)
- `f22ae73` — Deposit validation, balance saved to DB, balance in email
- `bd692a8` — Emails show host display name clickable, reason from textarea
- `c1c4a34` — Host contact_link feature (clickable in emails, admin edit modal, DB migration)
- `0828b43` — Challenge card participant count excludes removed
- `15c2e3a` — Host landing page wording fix

### Remaining Work
- End-to-end test with real host flow (challenge lifecycle: create → approve → open reg → upload CSV → start → pull → evaluate → review → complete)
- Host leaderboard could include registrationId and rankChange for fuller parity
- Balance warning emails during challenge (already implemented in scheduler but verify for hosted)
- Challenge start/end email notifications for hosted participants

---

## Session — August 21, 2026 — Web Registration Wizard + Account Changes

### What Was Done

**5-Step Registration Wizard (WinnerPip hosted challenges):**
- Step 1: Email → allocation check via broker API (returns rich error with host name/links)
- Step 2: Username → uniqueness check
- Step 3: Account category (hybrid picker or locked for single-type)
- Step 4: MT5 credentials → VPS verification with live balance/type display + server dropdown with fuzzy matching
- Step 5: Review & confirm (shows all details, low balance warning for fixed real)
- Success page with sign-in instructions + "Go to Dashboard" link

**Registration Flow UX Fixes:**
- Card click goes to login page (not directly to wizard)
- Login page shows "Register Now" button (blue) for winnerpip hosted challenges
- "Register Now" links to `/challenge/{id}?register=true` → auto-opens wizard on clean background
- Draft challenges show "Registration Opening Soon" popup on card click
- No flash of wrong register button (loading state while fetching challenge info)
- "Hosted by" badge is gold, link uses `stopPropagation()` + `https://` prefix

**Account Change Banner (User Dashboard, pre-start only):**
- Change Category: warning → MT5 credentials → VPS verify → review → confirm (full re-registration)
- Change Account: MT5 credentials → VPS verify → review → confirm
- All checks apply: pro account, cent-only, deposit validation, allocation
- Review shows email, nickname, new category, account, server, balance, type
- Success shows bold "Important" notice with new credentials + "Got it" button (10s auto-reload fallback)
- Email now fetched from database (added `r.email` to dashboard query)

**Deposit Validation (matching admin/telegram exactly):**
- Demo (fixed): balance must match within 1% tolerance (not 5%)
- Demo (max_limit): balance must be ≤ limit
- Demo (min_limit): balance must be ≥ limit
- Real (fixed/max_limit): balance must be ≤ starting_balance (no tolerance, straight comparison)
- Real (min_limit): balance must be ≥ starting_balance
- Low balance warning on review (fixed real, below deposit but allowed)

**Broker Removal Protection:**
- Pre-check endpoint: `GET /api/host/broker-removal-check`
- Warning before removal: contextual messages for open/active challenges
- Registration blocked when broker removed with open registrations
- Re-integration unblocks automatically
- Registrants see: "Registrations are temporarily paused by [Host](link). Contact [Host Support](link) for assistance."

**Allocation Error Messages:**
- "Please double-check your email spelling. If correct, your account is not allocated under [Host Name](link). Contact [Host Support](link) to guide you."
- Error clears when user edits email

**Cent Display Fix:**
- Leaderboard deposit warning now uses `formatBalance()` → shows "3000.00¢" not "$3,000"
- Dashboard API returns `challenge.type` for account change banner

**Server Dropdown:**
- Searchable dropdown for MT5 server selection
- Shows demo servers (Trial2-14) for demo, real servers (Real2-30) for real
- Fuzzy matching: "real21" → Exness-MT5Real21

### Backend Endpoints Added
- `POST /api/challenges/:id/check-allocation`
- `POST /api/challenges/:id/check-username`
- `POST /api/challenges/:id/verify-mt5`
- `POST /api/challenges/:id/change-category`
- `POST /api/challenges/:id/change-account`
- `POST /api/challenges/:id/change-registration` (full re-registration for category change)
- `GET /api/host/broker-removal-check`
- DB migration: `registration_blocked` column on hosts table

### Commits (this session)
- `eecdac5` — 5-step registration wizard + account change banner
- `84e3d71` — Hosted-by link fix, gold badge, draft CTA
- `187e62d` — https prefix, draft popup
- `57301e1` — Card click to login, Register Now on auth gate
- `4676f75` — Login page register button fix
- `6e1477f` — Register auto-opens wizard via ?register=true
- `eb40233` — Clean background for wizard, dismiss → /challenges
- `5b10dfc` — Hide auth gate when ?register=true
- `afb4555` — Rich allocation error with host links
- `395b157` — Broker removal warnings + registration blocking
- `82e3063` — MT5 server searchable dropdown
- `21b47da` — Errors stay on step, allocation asks to check email
- `7262b18` — Low balance warning on review (fixed real)
- `3fab982` — Proper category/account change flow
- `dd8ab37` — Leaderboard cent display fix
- `bdc2622` — Demo exact balance enforcement (initial 5%)
- `c93bac4` — Match admin logic exactly (1% tolerance)
- `efc2c2e` — New credentials notice after change
- `ef64cc4` — Bold prominent credentials notice
- `a35eb8a` — Email from API not localStorage
- `e7e6c47` — Add r.email to dashboard SQL query
- `60d0fd8` — Got it button + 10s auto-reload

### Remaining Work (Web Registration)
- End-to-end test of full registration flow with real host
- Test category change and account change with VPS
- Verify broker removal blocking works in production
- Login page flash fix may need SSR or skeleton approach for slower connections

---

## Session — August 26, 2026 — Host Dashboard Parity + Quiz Fix + Registration Fixes

### Quiz Fix
- **Session expired fix**: Migrated quiz sessions from in-memory Map to PostgreSQL (`quiz_sessions` table). Sessions now survive bot restarts/deploys.

### Host Channel Posts Fix
- Host challenges no longer post to admin Telegram channels (`@BirrForex`, `@BirrForex_Challenges`). Added `host_id` guard to all 7 scheduler functions.

### Registration Wizard Fixes
- Fixed hosted-by link (`stopPropagation` + `https://` prefix)
- Gold badge for host branding
- Draft challenges show "Registration Opening Soon" popup
- Card click goes to login page; "Register Now" on auth gate
- Auto-opens wizard via `?register=true` on clean background
- Rich allocation error with host name/support links
- Registration blocked when host removes broker (with contextual warnings)
- MT5 server searchable dropdown (fuzzy matching, demo/real lists)
- Errors stay on same step, allocation message asks to check email first
- Low balance warning on review (fixed real)
- Demo exact balance enforcement (1% tolerance matching admin)
- Real accounts: no tolerance, straight comparison
- Change-registration fully resets old balance data
- "Got it" button + 10s auto-reload on account change success
- Email fetched from DB (added `r.email` to dashboard query)
- Leaderboard cent display fix (`formatBalance()` not raw `$3,000`)

### Host Dashboard — Full Admin Parity

**Leaderboard:**
- API now returns: accountNumber, email, server, rankChange, totalWithdrawn, isWithdrawn, isBlown, registrationId
- Balance shows dollar amounts with withdrawal deductions (not growth%)
- Above-target highlighting (lighter green)
- Winner logic checks balance >= effective target (cent-aware)
- "withdrew $X" label, Exited/Blown icons
- Blue minimum trades flag (`📊 X/Y trades`) on both admin and host
- Fixed empty leaderboard (removed non-existent `rank_change` column)

**Leaderboard User Detail Modal:**
- Exact admin copy: DQ banner OR stats grid (conditional)
- Trade history grouped by positionId (partial closes together)
- Win Rate & Avg RR always shown when trades exist
- Trades fetch uses public `/api/challenges/:id/user-trades` endpoint (same as admin)
- Removed action buttons from modal (admin doesn't have them there)

**Participants Tab:**
- Row click shows inline detail panel (not modal) — matching admin
- Full stats grid: Balance, Qualified Profit, Profit Removed, Win Rate, Trades, Avg RR, Flagged, Active Days
- Account details: Account #, Server, Registered (EAT), Last Pull (EAT), Partner
- Recent Trades list with type badge, symbol, volume, profit
- View on Leaderboard + Export MT5 Trade History buttons
- Actions: Check Balance, Re-evaluate, Disqualify, Unregister
- `full-participants` endpoint now JOINs `wp_leaderboard` for real stats
- Search support added to endpoint
- Recent trades fetched on row click (useEffect)
- CSV Upload hidden for winnerpip registration mode (`registration_mode` added to API)

**Updates Tab:**
- Credential Failures: collapsed with count badge, expandable, Retry + Update PW
- Update Individual Account: button in action row, expands inline search
- Real-time progress bar (Step 1-4) during updates
- Individual account pull: full admin-style result with trade-level diffs, eval changes, new trades
- Buttons: Update (Incremental), Full Update + Evaluate + Rank (non-DQ), Full Update (All incl. DQ), Evaluate Only, Update Individual, Retry All Failed

**Top Rule Violations:**
- Server-side categorization (matching admin): "Simultaneous pair limit" not raw text
- Ticket IDs filtered out (leaked from comma-split)
- Expandable with nicknames (details with user names)

**Exports:**
- MT5 Trade History HTML: admin's full template (position grouping, SL check columns, eval report, violation breakdown)
- Export endpoint returns camelCase + user/challenge/trades format
- Challenge Stats HTML: admin's full template (all sections: top balance, highest profit, win rate, rule keeping, instruments, most broken rule, most active day)
- Most Broken Rule shows categorized name (not ticket ID) in both admin and host
- Most Active Day formatted as "Wed, Aug 26" (not raw ISO)
- Instruments count from DB query

**Admin Panel Updates:**
- Removed redundant "Full Pull (Non-DQ)" button (same as Full Pull + Evaluate + Rank)
- Added "Full Pull (All incl. DQ)" button
- Blue minimum trades flag on admin leaderboard too

### Commits (this session)
- `0cda9dd` — Quiz sessions → PostgreSQL
- `94c6d96` — Host challenges don't post to admin channels
- `5eb0fd9` — Change-registration resets old balance data
- `ba76d3f` — Host credential failures + individual pull
- `939cd75` — Credential failures collapsed, individual update as button
- `a168661` — Real-time progress bar for host updates
- `49aabf0` — Progress bar fills based on step, remove redundant button
- `610b203` — Individual update full admin-style result with diffs
- `a50d3e2` — Host leaderboard matches admin (API + frontend)
- `b171ef7` — Fix empty leaderboard (rank_change column)
- `b1a57d7` — User detail modal shows all data for DQ'd users
- `b03888a` — Host modal exact admin copy with trade grouping
- `bcf3bd8` — Trades fetch uses registrationId
- `90d977f` — Send both nickname + registration_id
- `3f3c39b` — Use public user-trades endpoint, remove action buttons
- `0c1f84c` — Blue minimum trades flag on both leaderboards
- `046a1e9` — Host Participants tab foundUser panel matches admin
- `d7d0cdf` — Participant row click shows inline detail (not modal)
- `af7c77c` — Host MT5 Export HTML matches admin exactly
- `999b957` — Host export-user-trades returns admin format
- `efdbcba` — Host top violations categorized
- `e13eab9` — Filter ticket IDs from violations
- `593b703` — Challenge stats date format + instruments count
- `48c531a` — Top violations include details with nicknames
- `616ab71` — Full Update (All incl. DQ) button
- `8fa3432` — Rename update buttons
- `793c1ed` — Admin gets Full Pull (All incl. DQ)
- `2824d91` — Remove redundant Non-DQ button from admin
- `b9dac51` — Participant search includes recent trades
- `43fd248` — Trades load on row click, CSV hidden for winnerpip


### Additional Changes (August 26, 2026 continued)

**Quiz Fixes:**
- Duplicate morning post prevention: `morning_post_sent_at` DB flag checked before sending
- Countdown restart prevention: `countdown_started_at` DB flag — if bot restarts mid-countdown, it won't re-start
- Admin winner report: now includes Telegram ID + win history (Xth time winner, previous dates)
- Quiz sessions persisted in PostgreSQL (survive restarts)

**Email System for Hosted Challenges:**
- Credential failure email added: "Account Access Issue" with fix instructions + "Log in to Dashboard" button
- Challenge Started email: has "Log in to Dashboard" button
- Challenge Ended email: has "View Results" button  
- Registration Confirmed email: has "Log in to Dashboard" button
- Balance warning email: skipped for hosted challenges (host_id check added)
- WinnerPip users (`source='winnerpip'`) now get credential failure email notification
- No Telegram DMs sent to winnerpip-source users — confirmed
- Challenge start/end emails fire for all winnerpip users regardless of host_id — confirmed

**Host Credential Failures System:**
- "Retry All" button inside credential failures panel (separate from action row's "Retry All Failed")
- Backend: `POST /challenge/:id/retry-all-credentials` — verifies each failed account individually via VPS
- Backend: `GET /challenge/:id/retry-all-status` — progress polling (running, current, total, recovered, stillFailing, ETA)
- Frontend: real-time progress bar (gold, shows X/Y + recovered + failed + ETA)
- "Update PW" button: now properly uses newPassword param to verify via VPS before saving
- Backend fix: `check-balance` endpoint uses `newPassword` when provided (was ignoring it before)
- When password fixed (by user or host): `pull_status` resets to 'success', account disappears from failures list

**Admin Pull Buttons Cleanup:**
- Removed redundant "Full Pull (Non-DQ)" (same as Full Pull + Evaluate + Rank)
- Added "Full Pull (All incl. DQ)" button on admin
- Host has 3 buttons: Update (Incremental), Full Update + Evaluate + Rank (non-DQ), Full Update (All incl. DQ)

**Commits (this sub-session):**
- `aaf02f0` — Quiz duplicate post + countdown restart prevention (DB flags)
- `e20073d` — Admin winner report with Telegram ID + win history
- `a4c9718` — Credential failure email + dashboard buttons on all hosted emails
- `db56275` — check-balance uses newPassword when provided
- `978ee0c` — Retry All button inside credential failures panel
- `130fc91` — Host retry-all-credentials with real-time progress (like admin)
- `793c1ed` — Admin Full Pull (All incl. DQ) button
- `2824d91` — Remove redundant Non-DQ button from admin

### Status: All Code Complete
- End-to-end manual testing of full host challenge lifecycle is the only remaining task
- No further code changes needed unless bugs found during testing


### Per-Category Settings (Split Category) — Backend Complete

**What's done (backend):**
- DB columns: `split_category_settings`, `demo_starting_balance`, `demo_target_balance`, `real_starting_balance`, `real_target_balance`
- Core utility: `src/utils/categorySettings.ts` — `resolveCategoryBalances()` + `resolveRuleCode()`
- Evaluation engine: per-category rules + balances
- Registration validation: per-category balance checks
- Pre-start DQ: per-category starting balance
- User dashboard: per-category target
- Above-target SQL: per-category comparison
- Rules: `loadRules(challengeId, ruleCode)` supports `config_demo`/`config_real`

**What's remaining (next session):**
- Frontend: Host challenge creation form — split toggle + per-category fields
- Frontend: Host settings page — edit per-category values
- Frontend: User dashboard — display correct target (already handled by API)
- Telegram bot: registration handler per-category values + admin creation wizard
- Admin panel: above-target SQL update (same pattern as host)

**Key design:**
- Toggle OFF (default): zero behavior change — falls through to existing shared values
- Toggle ON + hybrid only: resolves per-category with fallback
- Demo-only/real-only challenges: completely unaffected
- `SELECT *` queries include new columns automatically

**Commit:** `b9634f8`
