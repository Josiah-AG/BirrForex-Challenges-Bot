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
