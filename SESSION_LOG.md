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

---

## Session — August 27, 2026 — Per-Category Settings (Full) + Host Pull Progress + Quiz System Fixes

This session had three major work streams. All committed and pushed to `main`.

### PART A — Per-Category Settings for Hybrid Challenges (FRONTEND + BOT + FULL BACKEND)

Building on the backend foundation from the previous session, completed the entire per-category feature so that hybrid challenges can give Demo and Real participants **independent deposit modes, starting balances, targets, and rules**.

**What "split" means now (when "Different settings per category" toggle is ON for a hybrid challenge):**
- The shared Deposit Mode / Starting Balance / Target fields HIDE completely
- Two independent sections appear: **Demo Category** and **Real Category**
- Each has its OWN deposit mode selector (Fixed / Max Limit / Min Limit), its own starting balance, and its own target ($ for fixed, growth % for max/min limit)
- Rules step shows **Demo Rules** and **Real Rules** as separate tabs, each a full independent rule config
- Rules saved as `rule_code='config_demo'` and `rule_code='config_real'`

**Commits (in order):**
- `e31c845` — Initial per-category settings UI (host + admin create/settings/rules tabs, telegram bot registration + admin wizard). Frontend toggle + per-category balance fields; backend saveRules(ruleCode) param, gatekeeper/host INSERT include split fields, GET/PUT rules endpoints accept `?rule_code=` query param, tradingRegistrationHandler uses resolveCategoryBalances, tradingAdminHandler wizard asks about split.
- `1925d6d` — **Enhanced per-category: independent deposit mode + target type + rules per category.** DB migration added 4 columns: `demo_deposit_mode`, `real_deposit_mode` (VARCHAR default 'fixed'), `demo_target_percent`, `real_target_percent` (NUMERIC). categorySettings.ts `resolveCategoryBalances()` now returns `{ startingBalance, targetBalance, depositMode, targetPercent }` + added `resolveCategoryDepositMode()`. Host + admin create forms: split toggle hides shared, shows independent Demo/Real sections with own deposit mode cards. Host SplitRulesEditor component (Demo/Real tabs). Backend evaluation uses categoryBal.depositMode/targetPercent.
- `b769f01` — Admin panel Step 3 shows Demo/Real rules tabs when split ON + review shows both rule sets (admin had been missing the tabs).
- `2e53474` — Host review step shows per-category Demo/Real rules when split ON.
- `e867028` — Review step (both host + admin) shows ALL rules per category, not just a summary subset.
- `8453aae` — **Full backend audit: fixed 7 bugs** where shared `deposit_mode` was read directly instead of per-category resolution:
  1. tradingRegistrationHandler.verifyVpsConnection — depositMode from resolver
  2. tradingScheduler.checkPreStartBalanceWarning — resolve depositMode per-account in loop
  3. server.ts verify-mt5 — uses catBal.depositMode + startingBalance in response
  4. server.ts change-account — query now includes split fields; uses resolved depositMode
  5. server.ts change-registration — resolved depositMode
  6. server.ts CSV bulk registration — resolveCategoryBalances per row
  7. leaderboardService.updateRankings — resolves rankByGrowth per accountType inside loop (demo can be Fixed while real is Max Limit)
  Also cleaned dead depositMode/targetPercent vars in wpEvaluationEngine.
- `2e820b0` — Host overview top card shows per-category balance + target with deposit-mode awareness ($ vs %).
- `049060b` — Host overview card shows Deposit Mode field (single label if same, "D: Fixed  R: Max Limit" if different).
- `2afd73f` — Overview card uses 5-column grid so all fields (Type, Deposit Mode, Balance, Start, End) fit in one row.

**Files touched (Part A):** `src/database/migrate.ts`, `src/utils/categorySettings.ts`, `src/api/server.ts`, `src/services/challengeGatekeeper.ts`, `src/services/wpEvaluationEngine.ts`, `src/services/leaderboardService.ts`, `src/scheduler/tradingScheduler.ts`, `src/bot/tradingRegistrationHandler.ts`, `src/bot/tradingAdminHandler.ts`, `WinnerPip/winnerpip/app/host/dashboard/page.tsx`, `WinnerPip/winnerpip/app/admin/panel/page.tsx`

**Design principle (unchanged):** Toggle OFF or non-hybrid = zero behavior change (falls through to shared values). Only hybrid + toggle ON uses per-category logic. `resolveCategoryBalances(challenge, accountType)` is the single source of truth used everywhere.

### PART B — Host Dashboard Pull Progress Bars + Stop Button

- `e3175e1` — Persistent pull progress bars. Enhanced host `pull-status` endpoint returns stepLabel, processed/total, etaSeconds. On-mount detection polls pull-status when Updates tab loads or challenge changes (survives refresh). useRef-based polling interval persists across re-renders. Auto-dismisses 3s after completion. Credential Failures "Retry All" also persists via retry-all-status on-mount check.
- `6a43c2a` — Progress bar stays INSIDE the Updates tab only (not all tabs), but persists across tab changes / refresh via the on-mount polling.
- `03aa17a` — Added **Stop button** for running pulls: new `POST /api/host/challenge/:id/cancel-pull` endpoint (verifies ownership, calls scheduler.cancelPull(), marks batch cancelled). Red Stop button inline in the progress bar.
- `6aa56d4` — Progress bar uses generic "Step 1/2/3/4" labels (hides internal mechanism from hosts) instead of Pulling/Reconciling/Settling/Evaluating. Update history list now shows duration in seconds per update.

**Files touched (Part B):** `src/api/hostRoutes.ts`, `WinnerPip/winnerpip/app/host/dashboard/page.tsx`

### PART C — Quiz System Fixes (commit `c9120df`)

Fixed multiple bugs reported from a live challenge (screenshots showed "9/9" corruption, duplicate winner #3 = backup #4, and a 32s user who wasn't chosen).

**Root causes diagnosed:**
- **"9/9" corruption:** `recordAnswer` appended on every tap; double-taps/duplicate Telegram callbacks inflated the answers array. `total_questions` was `session.answers.length` instead of actual question count.
- **Winner = backup duplicate:** backup list sliced from raw perfectScorers by naive `winners.length` offset, misaligned after consecutive-win skips.
- **Consecutive winner got no message:** the skip logic did `continue` silently; the `consecutiveWinner` message template existed but was never called.
- **completion_order race:** `getCompletionOrder` read COUNT(*) before insert, so simultaneous finishers collided.

**Fixes implemented:**
1. `sessionService.recordAnswer` — idempotent via SQL `NOT EXISTS` on jsonb question_id; returns boolean. `quizHandler.handleAnswer` rejects duplicate/stale taps with "Already answered".
2. `quizHandler.completeQuiz` — `total_questions` from actual `getQuestions().length`; score deduped by unique question_id (Map), capped; double-completion guard via hasParticipated + try/catch on unique-constraint error 23505.
3. `participantService.createParticipant` — completion_order assigned atomically via `(SELECT COUNT(*)+1)` subquery inside INSERT. (participants table already has `UNIQUE(challenge_id, telegram_id)`.)
4. `postService.generateResultsPost` — backup list filters out winners by telegram_id Set before slicing.
5. `scheduler.sendResultNotifications` — sends consecutive-win skip DM ("🎯 PERFECT SCORE AGAIN — Consecutive Win Rule Applied") instead of silent continue.
6. **New `/exportquizwinner` admin command** (`adminHandler.exportQuizWinner`, registered in bot.ts) — CSV of ALL attempts for the current/most-recent quiz challenge: Rank, Username, Telegram_ID, Score, Total_Questions, Response_Time (from challenge post to finish — anti-cheat metric), Completion_Order, Completed_At. Ordered first→last.

**Ranking metric (confirmed with user, UNCHANGED):** time measured from **challenge post time (`challenge.started_at`) to each user's finish**, for everyone equally. NOT per-user start→end (that would let cheaters preview questions on one account then speed-run on another). This is the existing `ORDER BY completed_at ASC` behavior — it was never the bug; the corruption was.

**Files touched (Part C):** `src/services/sessionService.ts`, `src/bot/quizHandler.ts`, `src/services/participantService.ts`, `src/services/postService.ts`, `src/scheduler/scheduler.ts`, `src/bot/adminHandler.ts`, `src/bot/bot.ts`

### KNOWN REMAINING / NOT DONE (pick up here when we return)

- **Quiz — minor:** A consecutive-win-skipped perfect scorer could still appear in the channel BACKUP LIST (postService only excludes actual winners, not skipped-ineligible users). The scheduler passes raw `perfectScorers` to `generateResultsPost` and doesn't pass the eligible/skipped info. Low priority display issue; the reported duplicate bug IS fixed.
- **Per-category:** User dashboard (`/challenge/[id]`) already shows correct per-category target via API — no change was needed. Not independently re-verified this session.
- **Host system:** User said "lets go to the host system" next — we were about to start a NEW host-system work stream but pivoted to another project. **Return point: begin the host-system task the user will describe.**
- All migrations are code-level; the 4 new per-category columns (`demo_deposit_mode`, `real_deposit_mode`, `demo_target_percent`, `real_target_percent`) are added via `migrate.ts` and run on deploy.

### VERIFICATION STATUS
- Backend TypeScript: compiles clean (`npx tsc --noEmit --skipLibCheck`)
- Frontend: `npx next build` passes (only a pre-existing unused-var warning for `recentPullErrors`)
- All changes committed and pushed to `main`. Latest commit: `c9120df`

---

## Session — September 22, 2026 — Per-Category Settings Read Bug + Optional (Disable-able) Target

Three related pieces of work, all additive and backward-compatible. Backend `tsc --noEmit --skipLibCheck` clean; frontend `next build` clean.

### 1. Fixed per-category settings not persisting/displaying (READ bug)
Root cause: the create flow saved split values correctly (overview banner was right), but the **list endpoint that feeds the Settings tab and challenge cards didn't SELECT the per-category columns**, so the UI fell back to the literal `?? "30"` / `?? "60"` defaults and the "Different settings per category" toggle initialized OFF.

- `src/services/hostService.ts` — `getHostChallenges()` SELECT now includes `split_category_settings`, `demo/real_starting_balance`, `demo/real_target_balance`, `demo/real_deposit_mode`, `demo/real_target_percent`, and the new target-flag columns. This alone repairs the Settings tab.
- `src/api/server.ts` — public `GET /api/challenges` SELECT + response mapping now expose `depositMode`, `targetPercent`, `targetEnabled`, `splitCategorySettings`, and camelCase per-category fields (`demoStartingBalance`, `demoTargetBalance`, `demoDepositMode`, `demoTargetPercent`, `demoTargetEnabled`, and the real equivalents) so the challenge card can render per-category / no-target.
- `WinnerPip/winnerpip/app/challenges/page.tsx` — card now shows **two target lines** (Demo / Real) when split is ON and the categories actually differ, and **"No target — ranked by balance/growth %"** when the target is disabled. Falls back to the single `$start → $target` line otherwise.

### 2. Ability to disable / not set a target
New nullable/defaulted columns (`src/database/migrate.ts`), all preserving today's behavior:
- `target_enabled BOOLEAN DEFAULT TRUE`, `allow_below_start BOOLEAN DEFAULT FALSE`
- Per-category (nullable, fall back to shared): `demo_target_enabled`, `real_target_enabled`, `demo_allow_below_start`, `real_allow_below_start`

Threaded through the single source of truth `src/utils/categorySettings.ts` — `ChallengeBalances` now carries `targetEnabled` + `allowBelowStart` (with a `toBool()` normalizer and per-category → shared fallback).

Evaluation gate in `src/services/wpEvaluationEngine.ts` `evaluateAccount` (signature extended with `targetEnabled=true, allowBelowStart=false`; both call sites pass `categoryBal.*`). New branch in the `isQualified` determination:
```
if (!targetEnabled) {
  const meetsFloor = allowBelowStart ? true : (adjustedBalance >= effectiveStartBalance);
  isQualified = meetsFloor && activeDays >= minDaysRequired;   // ranked by metric, no target
} else if (depositMode !== 'fixed' && targetPercent) { ...growth% } else { ...adjustedBalance >= targetBalance }
```
Ranking is unchanged (leaderboardService ranks by balance for fixed, growth% for max/min). Winner endpoint (`/api/challenges/:id/winners`) already filters `is_qualified = true` + rank, so it's driven automatically. The `aboveTarget` overview stat just reads 0 for no-target challenges (harmless info count). Deposit-cap DQ paths (min_limit under-balance, over-limit) are untouched — those are deposit rules, not target.

### 3. "Allow accounts below starting balance to qualify" sub-option
Only relevant when target is disabled. OFF (default) = only breakeven-or-profitable accounts eligible (`adjustedBalance >= startingBalance` floor). ON = even net-loss accounts can win by ranking.

### Persistence
- `src/api/server.ts` host create INSERT — added the 6 new columns (`$28–$33`), defaulting to `true/false/null` when not sent.
- `src/services/challengeGatekeeper.ts` admin create INSERT — added the 6 new columns (`$33–$38`), same safe defaults (so admin-created challenges are unaffected).
- `src/api/server.ts` `PUT /api/host/challenge/:id/settings` — `allowed` whitelist now includes `starting_balance` (was silently dropped before) + all six new flags.

### Frontend (host dashboard `WinnerPip/winnerpip/app/host/dashboard/page.tsx`)
- Create modal: shared **"Require a target"** toggle; when OFF, hides the target input (shows "No target") and reveals **"Allow accounts below starting balance to qualify"**. Per-category Demo/Real sections each got their own require-target + allow-below toggles.
- Settings tab: reads the new fields (with safe defaults), shared require-target block when split OFF, per-category Demo/Real cards with the toggles when split ON, and the save handler sends `starting_balance` + all target flags.

### Safety
Every new field defaults to current behavior (`target_enabled = true`, `allow_below_start = false`; per-category variants null → inherit shared). No existing challenge changes unless a host explicitly turns these on.

### Follow-up (same session) — Participant dashboard: growth view when target is disabled

When a host disables the target, the participant dashboard's "Progress to Target" bar was meaningless (measured against a target that doesn't exist) and could divide-by-zero if start==target. Fixed by switching that card to an **Account Growth** view for no-target challenges.

**Backend (`src/api/server.ts`, `GET /api/me/dashboard`):**
- Reg SELECT now also pulls `target_enabled, allow_below_start, demo_target_enabled, real_target_enabled, demo_allow_below_start, real_allow_below_start`.
- `challenge` response now includes `targetEnabled`, `allowBelowStart`, and `depositMode` — each **resolved per the logged-in participant's account type** via `resolveCategoryBalances(registration, account_type)`. So a hybrid split challenge that disables the target for only Demo (or only Real) sends the correct boolean to each participant.

**Frontend (`WinnerPip/winnerpip/app/challenge/[id]/page.tsx`):**
- `ChallengeInfo` gained `targetEnabled?`, `allowBelowStart?`, `depositMode?`.
- New derived `noTarget = challenge.targetEnabled === false` and `growthPercent` (from the participant's OWN starting balance, guarded against a zero denominator).
- Progress card: when `noTarget`, renders **"Account Growth"** — a centered bar (green right for gains, red left for losses), `▲ +X% / ▼ -X%`, Start → Now labels, and the note "This challenge has no target — winners are decided by ranking." If the host also left "allow below start" OFF, a below-start account sees "▼ below start — not eligible". Otherwise the original "Progress to Target" bar is unchanged.
- `isWinner()`: for no-target challenges, winners = top-N **qualified** by rank (drops the `>= target` balance check). `isAboveTarget()` returns false for no-target (no light-green "above target" row highlighting).

Verified: backend `tsc --noEmit` clean; frontend `next build` clean. Target-bearing challenges are completely unaffected (all changes gate on `targetEnabled === false`).

### Verification pass — full consistency audit of the optional-target feature

Ran a comprehensive audit (context-gatherer + manual review) of every path that reads target columns or decides qualified/winner/above-target, to confirm the no-target feature is synchronous end-to-end. Confirmed the engine's `is_qualified` (in `wpEvaluationEngine.evaluateAccount`) is the single authority; `leaderboardService.updateRankings` ranks by metric only and carries `is_qualified` through staging→live; the winners endpoint (`/api/challenges/:id/winners`) filters on `is_qualified=true`+rank. Fixed the inconsistencies the audit surfaced:

**Must-fix (real):**
- `src/api/server.ts` admin overview — `qualified` was derived from the above-target count (`aboveTarget.cnt`), which misreports for no-target and growth-mode challenges. Added an authoritative `qualifiedCount` query from `wp_leaderboard.is_qualified` and made `qualified` use it. Kept `aboveTarget`/`realAboveTarget`/`demoAboveTarget` as separate info-only fields.
- `WinnerPip/winnerpip/app/admin/panel/page.tsx` — overview state was mapping BOTH `aboveTarget` and `qualifiedCount` from `od.qualified`. Now `aboveTarget` reads `od.aboveTarget` and `qualifiedCount` reads `od.qualified` (semantically correct). The "Above Target" StatCard relabels to "Qualified" (with "ranked by growth") when `selectedChall.targetEnabled === false`. Admin leaderboard row `eIsWinner`/`eIsAboveTarget` now use `e.isQualified` (rank + floor) when no-target instead of a phantom `>= target` compare.

**Host overview:**
- `src/api/hostRoutes.ts` full-overview — added an authoritative `qualified` count from `is_qualified`; response now returns it alongside `aboveTarget`.
- `WinnerPip/winnerpip/app/host/dashboard/page.tsx` — stores `qualified`; the "Above Target" StatCard relabels to "Qualified" (ranked by growth) when `overview.challenge.target_enabled === false`.

**Latent must-fix (legacy manual-upload path):**
- `src/services/evaluationEngine.ts` — added optional `targetEnabled`/`allowBelowStart` to `EvaluationConfig`; `isQualified` now gates the same way (no-target → floor at start unless allow-below-start). Display strings show "no target — ranked by growth" when disabled.
- `src/bot/evaluationHandler.ts` — the manual MT5-upload config now resolves `targetEnabled`/`allowBelowStart` via `resolveCategoryBalances(challenge, accountType)` (challenge loaded with `SELECT *`, so the flags are present).

**Telegram team-invite eligibility:**
- `src/bot/tradingAdminHandler.ts` `processTeamInvites` — demo/hybrid eligibility was `adjusted_balance >= target_balance`; now uses `l.is_qualified = true AND l.is_disqualified = false` (respects growth mode + no-target). Removed the now-unused `targetBalance` local. (Only affects `source='telegram'` challenges; host challenges are excluded by the source filter, but this keeps it correct if BirrForex ever runs a no-target telegram challenge.)

**Left as-is (cosmetic, out of scope for host no-target flow):** static "Demo traders who hit the target…" bonus copy and the "If you hit the target ($X)" final-verification message in `tradingAdminHandler.ts` — these are BirrForex telegram-only announcement templates; host challenges are announced via the web dashboard, so they never render for a hosted no-target challenge.

Verified: backend `tsc --noEmit --skipLibCheck` clean; frontend `next build` clean.

---

## Session — September 22, 2026 — Host System Polish + Bug Fixes (Major Session)

All changes committed and pushed to `main`. Backend `tsc --noEmit` clean; frontend `next build` clean throughout.

---

### 1. Per-category settings read bug fixed + Optional/disable-able target (`9c2967d`)

**Root cause:** `hostService.getHostChallenges()` SELECT omitted all split/per-category columns. Settings tab and challenge card read from this list, so they fell back to literal `?? "30"` / `?? "60"` defaults. Create flow was already saving correctly (overview banner was right).

**Changes:**
- `src/services/hostService.ts` — `getHostChallenges` SELECT now includes all split + new target columns. This alone fixes the Settings 30/60 fallback.
- `src/database/migrate.ts` — Added `target_enabled BOOLEAN DEFAULT TRUE`, `allow_below_start BOOLEAN DEFAULT FALSE`, plus nullable per-category variants `demo/real_target_enabled`, `demo/real_allow_below_start`.
- `src/utils/categorySettings.ts` — `ChallengeBalances` extended with `targetEnabled`/`allowBelowStart` (via `toBool()` normalizer + per-category fallback to shared).
- `src/services/wpEvaluationEngine.ts` — Both challenge SELECTs now include the new target columns + previously-missing `demo/real_deposit_mode` & `demo/real_target_percent`. `evaluateAccount` signature extended: `targetEnabled=true, allowBelowStart=false`. New NO TARGET branch in `isQualified`: `meetsFloor = allowBelowStart ? true : adjustedBalance>=effectiveStartBalance; isQualified = meetsFloor && activeDays>=minDaysRequired`.
- `src/api/server.ts` — Host create INSERT, PUT settings whitelist (adds `starting_balance`), public GET `/api/challenges` SELECT+mapping.
- `src/services/challengeGatekeeper.ts` — Admin create INSERT updated.
- Frontend (`host/dashboard/page.tsx`, `challenges/page.tsx`) — Create modal "Require a target" toggle + allow-below sub-toggle (per-category aware); Settings tab reads/saves new fields; challenge card shows split targets or "No target".

**Verification audit** (commit `9c2967d` follow-up, all in `main`):
- Admin overview `qualified` was derived from above-target count → fixed to use `is_qualified` from leaderboard.
- `admin/panel/page.tsx` — `aboveTarget` now reads `od.aboveTarget` (true above-target), `qualifiedCount` reads `od.qualified` (authoritative). Winner highlighting uses `e.isQualified` in no-target mode.
- Host overview `aboveTarget` + `qualified` — same fix applied in `hostRoutes.ts`.
- Telegram team-invite eligibility — switched from `adjusted_balance >= target_balance` to `l.is_qualified = true`.
- Legacy `evaluationEngine.ts` — gated same way; display strings updated.
- Participant dashboard (`challenge/[id]/page.tsx`) — Progress bar switches to "Account Growth" view when `targetEnabled === false` (centered bar, no cap, "No target" note). `isWinner`/`isAboveTarget` use `isQualified` in no-target mode.

---

### 2. Shared (Fallback) rules tab removed from host and admin (`dd09872`, `cc991d2`)

Split hybrid challenges now show only **Demo Rules / Real Rules**. No shared fallback tab.
- `host/dashboard/page.tsx` — Removed "Shared (Fallback)" button; defaults to `config_demo` when split ON; save label cleaned.
- `admin/panel/page.tsx` — Same fix; admin rules tab is now consistent with host.
- `challenge/[id]/page.tsx` — Participant rules modal now fetches `?rule_code=config_demo` or `config_real` based on `myStats.accountType`, so split challenges show the participant's own category rules (and percentage-mode SL/daily-loss display as "X% of balance" not a dollar figure).
- `src/services/wpEvaluationEngine.ts` `getRulesForDisplay` — now accepts optional `ruleCode`; `GET /api/challenges/:id/rules` passes the param through.

---

### 3. Create review shows per-category detail (`fa5cc6e`)

Create modal review step was hardcoding shared 30/60. Now:
- Split hybrid → **Demo — Deposit Mode / Balance / Target** + **Real — ...** rows per category.
- Non-split → single row; shows "No target" when target disabled.

---

### 4. Admin approval message shows full detail + host gets approved email (`6061a2d`, `fd0b15b`)

- Admin Telegram approval message: per-category deposit mode / balance / target (split-aware), winners, prizes, registration mode, timezone, **full RULES section** (per-category Demo/Real when split).
- On admin approve, host receives a short congratulations email: "🎉 Challenge Approved — now in Draft, go to Settings to open registration."
- `emailService.sendChallengeApproved` added. `bot.ts` approve handler fires it for host challenges.

---

### 5. Web registration duplicate key bug fixed (`6b5759c`)

Web registrants were inserted with `user_id = 0`. The `UNIQUE(challenge_id, user_id)` constraint rejected every second registration. Fixed: web registrants now get a unique negative sentinel (matching the CSV upload path).

---

### 6. Host pre-start leaderboard + over-balance reset email (`5d9636a`)

- Host leaderboard endpoint: pre-start branch ranking registrants from `trading_registrations` by `last_known_balance` (cent-aware, DQ-last, reg-time tiebreak). Matches admin.
- Nightly 2 AM balance check: removed `!host_id` guard so hosted/web over-balance participants now receive the reset email. "Balance OK" clear DM now guarded to `user_id > 0` to avoid pointless failed sends.
- Participant dashboard "Balance Too High" banner already drove via `balance_warning` flag — confirmed working for host participants.

---

### 7. Host challenge times now stored/displayed in chosen timezone (`3700bfd`, `60b29c0`)

**Root cause:** `datetime-local` sends a naive wall-clock string. System stores/reads as UTC. Host typing "5:00 PM" + EAT was stored as 17:00 UTC → displayed as 20:00 EAT (wrong).

**Fix:**
- Module-level `wallClockToUtcISO(local, tz)` + `utcToWallClock(iso, tz)` helpers (DST-aware via `Intl.DateTimeFormat`).
- Create submit converts `start_date`/`end_date` from wall-clock-in-chosen-tz to UTC.
- Settings populate uses `utcToWallClock` so editing shows the right time.
- Settings save converts back to UTC.
- Admin create already handled correctly (hardcoded +03:00); host form is now generic for any IANA zone.
- Host dashboard displays (participant panel, trade modals, MT5 export, "Next update" stat) all updated to use `challengeTz` / `fmtDateTime` instead of hardcoded `+3h EAT`.

---

### 8. Host Updates tab: last-update summary card (`f26e3b6`)

`pull-history` endpoint now returns a `summary` object with live account breakdown:
- **Accounts Updated** (eligible active accounts) / **Skipped — Disqualified** / **Skipped — Credential** / **Total Skipped**.
- Frontend: "Last Update Summary" card renders above Update History. History rows relabeled "X updated · Y failed · Z processed".

---

### 9. Host HTML export polish + above-target no-target-aware (`3879dc2`)

- Stats report: WinnerPip logo only (dropped BirrForex logo), footer "WinnerPip".
- Stats report + overview: Above Target hidden/zeroed per-category when that category has no target.
- Above-target SQL in `hostRoutes.ts` and admin `server.ts` gated on `COALESCE(demo/real_target_enabled, target_enabled, true)`.
- Rules export rewritten: split → two pages (Demo + Real) each with own rules, balance, target; non-split → single page. Target shows "No target" when disabled. `getRulesForDisplay` + `GET /api/challenges/:id/rules` accept `rule_code` param.

---

### 10. Client rules modal per-category + admin Shared tab removed (`cc991d2`)

Covered in item #2 above.

---

### 11. Host settings: balance/target locked after start; shared row hidden when split (`30d742d`)

- `balanceLocked = ['active','reviewing','completed'].includes(status)` — all balance/target/split inputs and toggles disabled when locked. Lock note shown.
- Shared Starting/Target row hidden when "Different settings per category" is ON (redundant).
- `PUT /api/host/challenge/:id/settings` server-side strips locked fields when challenge has started.

---

### 12. Per-category % target in settings & rules export; dates locked after start (`a611010`)

- Settings tab was showing $60 for a max_limit (75%) Real target. Root cause: deposit mode + target percent were never loaded into the settings form. Fixed: form now loads `demo/real_deposit_mode` + `demo/real_target_percent`; shows "% growth" input for non-fixed deposit modes; save persists them.
- Rules export fixed: per-category target now shows "75% growth" for max/min-limit instead of "$0".
- Start and End date inputs disabled after start; server strips `start_date`/`end_date` from the locked fields on PUT settings.
- Start/End labels now show the challenge's timezone abbreviation (not hardcoded "EAT").

---

### 13. Overview qualified/above-target card per-category for split challenges (`e186612`)

- For a split hybrid, the card now shows a **Demo/Real breakdown** (e.g. "D: 0 above target · R: 1 ranked") so it's clear which category each count is about and how it qualifies.
- Backend: `hostRoutes.ts` full-overview now returns `realAboveTarget`/`demoAboveTarget`/`realQualified`/`demoQualified` per category (gated on that category's target-enabled flag).
- Non-split unchanged (single "Above Target" or "Qualified" card).

---

### 14. Host delete after start: admin approval flow fixed (`6149c3c`)

**Root cause:** The delete endpoint called `queueStatusChange({ challenge_id, new_status, hostName })` (object — wrong signature) with stale `../../src/...` require paths. Nothing happened.

**Fix:**
- Now calls `queueDelete(challengeId, title)` which creates a `type: 'delete'` pending — the bot approve handler at `bot.ts:569` already handled this: `executeDelete(challengeId)` → marks status `'deleted'`.
- Fixed require paths: `require('../services/challengeGatekeeper')`, `require('../config')` (named export `{ config }`), global bot via `(global as any).__bot?.bot?.telegram`.
- Frontend: delete button now has its own handler showing "Deletion request submitted — awaiting admin approval" for started challenges, and deletes immediately for drafts. No more incorrect pull polling.

**Full flow:**
1. Host clicks Delete on active challenge → backend queues gatekeeper delete token.
2. Admin receives Telegram DM with challenge name + status + Confirm/Reject buttons.
3. Admin taps ✅ Confirm Delete → `executeDelete` sets status to `'deleted'`.
4. Admin taps ❌ Reject → challenge unchanged; gatekeeper entry cleared.

---

### Files Modified This Session (all committed, pushed to `main`, tsc + next build clean)

**Backend:**
- `src/database/migrate.ts`
- `src/utils/categorySettings.ts`
- `src/services/wpEvaluationEngine.ts`
- `src/services/challengeGatekeeper.ts`
- `src/services/hostService.ts`
- `src/services/evaluationEngine.ts`
- `src/services/emailService.ts`
- `src/api/server.ts`
- `src/api/hostRoutes.ts`
- `src/bot/bot.ts`
- `src/bot/evaluationHandler.ts`
- `src/bot/tradingAdminHandler.ts`
- `src/scheduler/tradingScheduler.ts`

**Frontend:**
- `WinnerPip/winnerpip/app/host/dashboard/page.tsx`
- `WinnerPip/winnerpip/app/admin/panel/page.tsx`
- `WinnerPip/winnerpip/app/challenge/[id]/page.tsx`
- `WinnerPip/winnerpip/app/challenges/page.tsx`

**Latest commit:** `6149c3c` (HEAD → main, origin/main)

---

## Session — September 24, 2026 — Growth % Color + Sign + Admin Leaderboard Ordering

### What Was Done

Two fixes for `max_limit` / `min_limit` (growth-%) challenges, both verified clean (backend `tsc --noEmit --skipLibCheck` + frontend `next build`).

---

### 1. Growth % color + sign in ALL leaderboard displays

**Problem:** Several inline growth % strings used plain `<span>` (no color) and showed only the arrow + absolute value, without `+`/`-` sign. `fmtEntryValue` was already correctly updated in a prior commit, but 7 other inline spots were still using the old pattern.

**Pattern applied everywhere:**
- Positive growth → `<span className="text-profit">↑ +X.X%</span>`
- Negative growth → `<span className="text-loss">↓ -X.X%</span>`
- Detail-panel `<p>` elements that previously hardcoded `text-white` now use a dynamic className (`text-profit` / `text-loss`) when in growth mode.

**Files modified:**

1. `WinnerPip/winnerpip/app/challenge/[id]/page.tsx`
   - **Leaderboard tab row** (~line 837): converted template literal `<span>` to colored JSX span with `+`/`-` sign
   - **selectedUser detail modal** (~line 1586): `Growth:` sub-line now wraps the value in `<span className={... text-profit/text-loss}>` with `+`/`-`

2. `WinnerPip/winnerpip/app/admin/panel/page.tsx`
   - **Admin leaderboard table row** (~line 748): template literal replaced with colored JSX span + sign
   - **foundUser detail panel** (~line 842): `<p>` className changed from hardcoded `text-white` to dynamic profit/loss color; template literal → JSX fragment
   - **selectedParticipant detail panel** (~line 1471): same fix

3. `WinnerPip/winnerpip/app/host/dashboard/page.tsx`
   - **Host leaderboard table row** (~line 1042): template literal replaced with colored JSX span + sign
   - **selectedParticipant detail panel** (~line 1822): `<p>` className changed to dynamic profit/loss color; template literal → JSX fragment

---

### 2. Admin leaderboard ordering for growth-% challenges

**Problem:** Admin leaderboard (`GET /api/admin/:secretPath/challenge/:id/admin-leaderboard`) was always ordering by `normalized_balance` / `l.rank`, even for growth-% challenges where the correct ranking metric is `growth_percent`.

**Fix (already applied to `src/api/server.ts` before this session, now committed):**
- Fetches `deposit_mode` from the challenge row
- `rankByGrowth = depositMode !== 'fixed'`
- When `rankByGrowth`: sorts by `COALESCE(l.growth_percent, 0) DESC NULLS LAST`
- When fixed: existing `l.rank ASC + normalized_balance DESC` sort unchanged
- Applied to both the pre-start and post-start branches of the query

---

### Verification
- Backend: `tsc --noEmit --skipLibCheck` → exit 0
- Frontend: `next build` → exit 0 (only pre-existing unused-var/hooks warnings, no new errors)

### Latest commit (this session)
- See commit below


---

## Session — September 24, 2026 (continued) — Admin Settings Fix + 5 Bug Fixes

All changes committed and pushed to `main`. Backend `tsc --noEmit --skipLibCheck` clean; frontend `next build` clean throughout.

---

### Admin Settings Panel: `challenge` object was missing fields

**Root cause:** `ChallengeSettingsPanel` receives a `challenges` array prop and does its own `challenges.find()` internally. The parent's manually-constructed `challenge` object (only `id/title/status/type`) was never used inside the component. However, `editForm` initializes from `challenge.*` via `useState` — which runs **once on mount**, before the `challenges` array is populated from the API. So all fields defaulted to hardcoded fallbacks (`target_enabled: true`, `target_balance: "60"`, etc.).

**Fixes applied across multiple commits:**

1. `admin/panel/page.tsx` — Added all missing fields to the parent's `challenge` object passed as a prop context (though the component does its own find, this was the first attempt).

2. `admin/panel/page.tsx` — Added `useEffect` that re-syncs `editForm` whenever `challengeId` or `challenges` changes. This is the actual fix — once `challenges` loads from the API, the form is re-populated with real DB values.

3. `admin/panel/page.tsx` — Added `target_enabled` to `editForm` state; added "Require a target" toggle to the settings form UI; added `target_enabled` to the `handleSave` PUT body; added `target_enabled` and all `allow_below_start` / per-category target flags to the admin PUT `/challenge/:id` `allowed` list in `server.ts` (they were silently ignored before).

4. `admin/panel/page.tsx` — `target_balance` default changed from `"60"` to `""` so no-target challenges don't show 60.

5. `src/api/server.ts` — `GET /api/admin/:secretPath/challenges` SELECT was missing `target_enabled`, `host_id`, `real_prizes`, `demo_prizes`, `timezone`, and all `allow_below_start` columns. The response mapping also omitted them, so `challenge.targetEnabled` and `challenge.hostId` were always `undefined` in the admin panel. Fixed: all columns now included in SELECT and response map.

6. `host/dashboard/page.tsx` — Settings form `target_balance` load changed from `?? "60"` to `!= null ? String() : ""`; `target_enabled` normalization hardened against string `"false"` coercion; overview Balance cell now checks `target_enabled !== false` before rendering `→ target`; review step Rewards rows guarded by challenge type (`type !== 'demo'` for Real Winners, etc.); "Require a target" toggle hardened.

**Files modified:** `src/api/server.ts`, `WinnerPip/winnerpip/app/admin/panel/page.tsx`, `WinnerPip/winnerpip/app/host/dashboard/page.tsx`

**Commits (in order):** `92e1606`, `c6c6d63`, `0527e5d`, `7ed4461`, `fc989ac`, `9a5031f`, `3e8a146`, `2c691c4`

---

### 5 Bug Fixes — Commit `e2022f8`

#### 1. Evaluation engine: disabled rules still firing (MAJOR)

**Root cause:** `seedDefaultRules()` was seeding `rules_enabled` with all values `true`. When `evaluate()` or `evaluateSingleAccount()` found no `wp_challenge_rules` row for a challenge, it called `seedDefaultRules()` then retried — resulting in all rules being enforced at their seeded default values (e.g., `max_risk_dollars: 5`, `stop_loss_required: true`). This happened to host challenges that had `getRulesForDisplay()` auto-seed before the host configured their rules, and also to challenges where the rules row was missing for any reason.

**Fix:** `seedDefaultRules()` now seeds all `rules_enabled` values as `false`. The seeded default values (lot size, risk, etc.) remain unchanged for reference, but no rule is enforced unless explicitly enabled. Any challenge that was already configured by admin/host is unaffected (their saved row has the intended `rules_enabled` values).

**File:** `src/services/wpEvaluationEngine.ts`

#### 2. Telegram approval message showed wrong winners for demo/real-only challenges

**Root cause:** The `Real Winners / Demo Winners` line in the host challenge approval Telegram message was unconditional — always showed both, even for demo-only challenges.

**Fix:** Line now filtered by `type`: demo-only shows only "Demo Winners", real-only shows only "Real Winners", hybrid shows both. Same filter applied to the prizes lines.

**File:** `src/api/server.ts` (line ~3473)

#### 3. `pending_approval` challenges appeared on public challenges page

**Root cause:** `GET /api/challenges` WHERE clause only filtered `status != 'deleted'`. Challenges pending admin approval were visible on the public page with a `pending_approval` status badge.

**Fix:** Added `AND c.status != 'pending_approval'` to the WHERE clause.

**File:** `src/api/server.ts`

#### 4. "Register Now" shown for active challenges

**Root cause:** Active hosted winnerpip challenges navigated to the challenge page on card click, with no message that registration is closed.

**Fix:**
- Added `showRegClosedPopup` state to `challenges/page.tsx`.
- Card `onClick` for active hosted winnerpip challenges now shows popup: "Registration is Over — This challenge is already underway. Registration is closed — stay tuned for the next challenge!"
- CTA label for these challenges changed to "Registration Closed".

**File:** `WinnerPip/winnerpip/app/challenges/page.tsx`

#### 5. Rules modal showed "Trades against rules" penalty when all rules are disabled

**Root cause:** `getRulesForDisplay()` unconditionally pushed the "Trades against the rules will have profits disqualified" bullet and the Penalty box was always shown on the client.

**Fix:**
- `getRulesForDisplay()` now tracks `hasActiveRules` (whether any enforcement rule string was added before the always-shown lines). Only pushes the "Trades against rules" bullet when `hasActiveRules = true`. Also changes "Unlimited trades per day — as long as all rules are followed" to "Unlimited trades per day" when no rules are active.
- Return type updated: `Promise<{ rules: string[]; isCent: boolean; hasActiveRules: boolean }>`.
- `challenge/[id]/page.tsx` now stores `rulesHaveEnforcement` from the API response. The Penalty box shows "No restrictions: All trades count fully — no rules are enforced in this challenge." when `rulesHaveEnforcement = false`.

**Files:** `src/services/wpEvaluationEngine.ts`, `WinnerPip/winnerpip/app/challenge/[id]/page.tsx`

---

### Verification
- Backend `tsc --noEmit --skipLibCheck` → exit 0
- Frontend `next build` → exit 0 (only pre-existing unused-var/hooks warnings)
- Latest commit: `e2022f8`



---

## Session — September 25, 2026 — Codex Orientation + Git Access Check

- Read the session history and inspected the backend, WinnerPip frontend, category settings resolver, VPS layout, and Git state.
- Confirmed working repository: `TG Bots/BirrForex Challenges Bot`; frontend: `WinnerPip/winnerpip`. A nested backend repository also exists and should not be confused with this working repository.
- Current HEAD: `5227787` on `main`: active hosted challenge cards navigate to the dashboard, superseding the registration-closed popup described in the September 24 log.
- Existing uncommitted changes were preserved: system summary, host test plan, host dashboard target-balance fallback (`parseFloat(...) || 0`), and untracked registration documentation/assets.
- `git push --dry-run origin main` succeeded with "Everything up-to-date". No actual commit or push was performed. New commits may still be subject to remote branch policies.
- No application changes or runtime/build tests performed in this orientation session. Awaiting the user's requested fixes.

---

## Session — September 25, 2026 — Rule OFF Audit, Strict Category Isolation, Registration Closure

### User requirements and authorization
- Investigate screenshots before changing code; then explicitly authorized implementation and direct main deployment.
- Audit every configurable rule, not only SL. Split Demo/Real rules must never inherit shared configuration.
- Correct the current production challenge without a staging database copy; preserve rollback capability and document all work.

### Confirmed root causes
- Losing-trade max-risk branch checked `stop_loss_required` but omitted `rules_enabled.stop_loss_required`; reproduced exact screenshot loss ($98.51) against retained $5 threshold with toggle OFF.
- SL retry used shared rules and a separate risk calculation path without the enable guard.
- Scheduler minimum-days/minimum-trades and weekend scheduling read shared config, contrary to split category settings.
- Legacy manual evaluation used 99999 substitutes for OFF and always enforced weekend crypto prohibition.
- Login registration CTA ignored challenge status; closed direct links could suppress sign-in or display a Telegram fallback.

### Implementation
- Added `src/utils/rulePolicy.ts` with common rule types/enable helpers; updated main/manual evaluators and scheduler.
- Exact rules loading, `requireRules`/`rulesForAccount`, no implicit seeding on reads/evaluation, no shared category fallback. Invalid split account category errors explicitly. Batch evaluation preflights required category configs before evaluation writes.
- Fixed losing-trade risk guard; disabled SL clears stale pending/conflicting candle state. Retry now invokes canonical account evaluation for matching category, percentage timeline and cent conversion, then publishes/ranks using leaderboardService.
- Single-account publication now carries growth_percent to live leaderboard.
- Main zero-trade path handles enabled min-total-trades at challenge end. Manual evaluator explicitly gates configurable checks, adds min-trades end requirement, and honors weekend permission. Its existing percentage approximation remains a legacy limitation; the live WinnerPip engine is the authoritative precise calculation path.
- Scheduler minimum requirements scope candidate queries to each account category; shared pull runs on weekends if either category permits it.
- Category-aware account filters/display/cent queries in Telegram, Discord, public/admin/host APIs. Legacy migration cent backfill excludes split challenges so shared rules cannot reinterpret their verified account currency.
- Public minimum-trades warnings carry category-specific thresholds; client clears obsolete warnings. Missing rule configurations are visibly reported in admin/host/client rather than displayed as another category's settings.
- Login now loads status in useEffect and disables closed registration, preserving sign-in. Closed direct registration links show authentication UI without Telegram fallback. Losing-trade flag wording no longer falsely claims profit was removed.

### Production investigation (read-only)
- User signed into Railway locally; no credentials were shared or logged.
- Correct project: BirrForex Challenge Bot. Service `web` is backend; `BirrForex-Challenges-Bot` is frontend; `Postgres` is database.
- Original backend/frontend deployed commit: `5227787fd002ec6771a8a37071b9b70bbe110b95`.
- Challenge 36 `TRIAL` is now `reviewing`, Demo/non-split, all ten enable switches explicitly false.
- One registration (5248), 15 trades, seven incorrect flags, no disqualifications. Screenshot ticket 2722833495 belongs to it.
- Latest observed pull batch 628 completed. Reviewing challenges can still perform final pulls, so writers must be stopped during apply/restore.

### Tests and rollback preparation
- Added 24 passing Node tests: each rule ON/OFF, exact screenshot, split isolation, missing config, mixed rules, percentage risk, cent conversion, legacy weekend/large values, scheduler policy, and repair journal conflict handling.
- Backend build and TypeScript checks pass. Frontend production build passes with existing lint warnings.
- Browser smoke passes for active/reviewing/registration_open/draft login and direct closed registration URL, using mocked API responses on localhost.
- Added `scripts/repair-rules.cjs` and `repair-journal.cjs`; preview/roundtrip always roll back, apply/restore require backend stopped. Repair restricted to explicitly all-OFF rulesets; rejects registration-state and raw trade mutations. No guessed DQ reversals. Notifications suppressed.
- Private backups outside repository: `../.repair-backups/` (0700), journals 0600, investor passwords excluded. Includes deployment baseline, preview and rollback-verification journals. Pre-existing working-tree diff also saved privately in `/private/tmp/tgbots-before-rule-fix.patch`.
- Production preview: seven flags → zero; balance stays 9386.25; rank stays 1; nine affected rows (seven trades + staging/live leaderboard). Roundtrip verified exact restoration inside a transaction, then rolled back.
- `RULES_FIX_ROLLBACK.md` documents scope, commands, deployment identities, and conflict-aware restoration. Git revert alone is insufficient after publishing repaired data.

### Working tree preservation
- Existing SYSTEM_SUMMARY, HOST_MODE_TEST_PLAN, registration document/assets, and host-dashboard `target_balance || 0` edit are not part of this implementation commit.
- Deployment and actual production correction are pending at this entry; follow-up below will record verified outcomes.

### Verified production outcome — September 25, 2026
- Stopped backend service `web` after checking no pull batch was running, preventing evaluation writers during repair. Postgres remained running.
- Ran final transactional rollback roundtrip successfully before applying: affected rows restored exactly, transaction rolled back.
- Applied `node scripts/repair-rules.cjs apply 36 '../.repair-backups/challenge-36-applied.json'`: one account, nine changed rows; seven incorrect flags cleared. Balance remained $9,386.25 and rank remained 1. Raw trades and registration state preserved; no notifications sent.
- Actual before/after rollback journal saved and synced before database commit at `../.repair-backups/challenge-36-applied.json` (private, outside Git). Restore refuses conflicting subsequent changes; do not overwrite later legitimate activity blindly.
- Committed and pushed implementation directly to `main`: `d297933c44cef58c4db669bdbc9ef30583d36e09`.
- Railway backend deployment `16cf8fbf-0e76-4229-a29c-67c6225cfb40` and frontend deployment `d0bbab99-6cc9-49db-9dec-602d7be4484f` both reached SUCCESS at that commit; backend resumed service.
- Live API verification: `/api/health` HTTP 200; challenge 36 `config_demo` rules request correctly resolves this non-split challenge's own config with `hasActiveRules: false`; Demo leaderboard shows 15 total/qualified trades, zero flags, zero removed profit, balance 9386.25, rank 1, no disqualification, disabled minimum-trades threshold null.
- Real browser verification against winnerpip.com without mocks: login challenge 36 has disabled Registration Closed and Sign In present; direct `?register=true` link has disabled Registration Closed, Sign In with Account present, and no Telegram registration fallback.
- Challenge is reviewing at verification time. Active-state behavior also covered by local browser smoke tests; production challenge status was not changed for testing.
- Validation completed: 24 Node tests, backend TypeScript/build, frontend production build and browser smoke. Existing frontend lint warnings remain. Legacy manual percentage approximation is documented above, not claimed to have been replaced.
- This documentation follow-up records completed production verification; its push may trigger routine Railway redeployment of identical application code.
- Existing unrelated local changes remain uncommitted and intact.

## Session — September 25, 2026 — Admin/Host System Audit (report only)

- User requested a broad file-by-file system review, especially admin/host creation and management, followed by a problem report and implementation plan. No implementation authorization for new findings was inferred.
- Produced `audits/2026-09-25-system-audit.md` with 23 prioritized findings, source references, impacts, fixes, acceptance tests, additional policy questions, and a phased direct-main rollout/rollback plan.
- Produced `audits/2026-09-25-file-coverage.md`: 124 tracked source/configuration files inventoried, 46 with detailed relevant-path review; others explicitly labeled structural/static or test-artifact coverage. No claim that every runtime branch was verified. Nested historical backend checkout was not mistaken for deployed code.
- Nine isolated probes executed actual extracted route/method code with mocked DB and external calls: admin creation loses category rules/target flags; host settings ignore fields; direct status lacks transition checks; host middleware lacks revocation lookup; final registration omits eligibility validation; same-minute scheduling misses second challenge; invalid rule values accepted; staging flush nontransactional; category balance/target fallback persists. Probe script is `/private/tmp/tgbots-audit-probes.cjs`.
- Read-only PostgreSQL query confirmed growth ranking SQLSTATE 42P01 (undefined table alias l); inspected actual registration uniqueness indexes. All production SQL was in READ ONLY transactions; no live mutation tests.
- Production config presence check confirmed admin key/path configured but no admin IP allowlist. Source confirms protected admin operations have no authenticated-session middleware. No secret values or attack attempts included in the report.
- Verified challenge 36 remains reviewing/fixed Demo with 15 trades and zero flags. No additional repair was performed or assumed necessary.
- Existing 24 Node tests all pass; TypeScript source syntax scans had no parse diagnostics and 15 Python files parsed without importing/executing them. No live broker/MT5 calls or notification tests.
- Important additional findings: host-specific partner screening mismatch; cent-unit inconsistency; dropped creation payloads; approval persistence; host session revocation; lifecycle bypasses; global pull override/cancellation; winner/ranking disagreement; ineffective final lock; staging publication races; daily/active-day calendar and DQ provenance issues; reused broker GCM nonce; duplicate registration races; removed-account processing; legacy admin UI.
- Prioritized plan: authenticated admin access/host isolation first, creation and registration contracts second, durable scheduling third, authoritative publication/finalization fourth, credential/presentation/legacy cleanup fifth. Currency/calendar/scoring-window decisions must not silently rewrite existing results.
- Changed documentation only. No application code edits, production data changes, migrations, commits, pushes or deployments for this audit. Existing unrelated worktree changes preserved. Awaiting user's decision on implementation scope.

## Session — September 25, 2026 — Deeper audit extension (report only)

- Expanded the existing consolidated audit to 32 numbered findings: original A01–A23 retained, new A24–A32 documented with scenarios, evidence, fixes and acceptance criteria.
- New findings: cached initial deposits later become recharge DQs; partial-close max-lot bypass; daily-loss close-order error; percentage daily cap uses configuration rather than actual baseline; mixed cent/normalized withdrawal arithmetic; self-service credential repair skips canonical backfill; credential deadline uses last successful pull and first active challenge only; swallowed ingestion errors; wrong last-close ranking timestamp.
- Executed five isolated actual-method probes using mocked database and services, all reproduced: two-pass deposit DQ drift, partial-close lot bypass, missed close-order loss breach, wrong percentage baseline, silent trade INSERT failure. Diagnostic script: `/private/tmp/tgbots-deep-audit-probes.cjs`. No live records or notifications used.
- Clearly separated unresolved trade-count definition, zero-trade eligibility, replacement-account history/metadata and deposit-window policy from confirmed findings.
- Updated direct-main plan with result previews, per-account affected-row review, bounded writer pauses, transactional correction and conflict-aware data rollback. No staging production database clone proposed.
- No new live production check in this extension; earlier challenge 36 observations remain explicitly time-scoped. No code fixes, commits, pushes, deployments, migrations or production mutations. Existing unrelated local changes preserved.

## Session — September 26, 2026 — A01–A32 implementation in progress (NOT DEPLOYED)

Authorization: user approved implementation, careful testing, direct-main release only after validation, reversibility and detailed logging. Empty Railway admin IP allowlist is intentional. No production mutation, push or deployment has occurred in this implementation checkpoint.

- Baseline main is `0329a78`. Preserved unrelated user work; private initial binary diff and baseline record are under `../.repair-backups/2026-09-26-system-hardening/`. Implementation plan: `audits/2026-09-26-implementation-plan.md`.
- Read-only Railway inventory found challenge 36 is now completed; only challenge 37 is nonfinal (pending approval). Historical canonical account duplicates exist in completed challenges 5 and 18. Nothing was deleted, merged or recalculated. Historical Challenge 15 title matches IDs 5 and 17; legacy display data has been bound to those IDs rather than allowing new similarly titled challenges to inherit winners.
- Added role-bound signed admin/host sessions, common protection for all admin operations, revocable host session versions, same-origin HttpOnly-cookie frontend management proxy and server-only backend admin path. Optional IP restriction remains optional. Legacy admin detail page retired. Host balance-history requests now use host ownership/authentication. Host deletion archives/deactivates instead of dropping ownership.
- New broker ciphertexts use independent random nonces and a versioned envelope; reader accepts old ciphertexts. Existing production ciphertexts have NOT yet been migrated. Rollback must preserve the compatible reader once new ciphertexts exist.
- Added transaction-scoped database client propagation, validated independent category settings/rules, atomic challenge creation/settings, durable one-time approvals, guarded transitions and configuration freeze. Rule saves lock the challenge against concurrent start. Host save responses are checked and canonical persisted challenge data is returned. Further frontend roundtrip review remains required.
- Added authoritative VPS registration validation, actual account-mode/currency checks, strict category/deposit eligibility and common cent-unit multiplier. Real-only cent-only inputs remain cents; hybrid/non-cent-only inputs convert for cent accounts. Removed competing web/CSV deposit checks; pre-start checks use category-specific mode and unit policy. Native Telegram/Discord registration now verifies through the service before inserting; Discord caller-provided verification flags are not trusted. Manual approval without investor credentials cannot bypass verification.
- Added host-scoped allocation checking that fails closed when an enabled integration is unavailable; automatic screening uses host credentials. Optional absent integration stays optional. Decryption failure no longer masquerades as absent integration.
- Added synthetic-tested registration identity guard for concurrent canonical account/nickname duplicates, category checks, required verified status, and registration-state locking. Historical existing duplicates are retained. Remaining removed-registration/index compatibility review is a release gate.
- Added durable scheduled/manual challenge pull jobs. Host updates queue honestly instead of reporting started while busy; cancellation requires the running challenge to match ownership. Legacy resume no longer resolves another challenge; old generic cycle callers enqueue eligible challenges through the same coordinator. Concurrent multi-process/job and cancellation review remains required.
- Trade/deal write failures now propagate; account ingestion is transactional. Evaluation errors are not reported as successful single-account refreshes; terminal error details are retained. Publication and ranking complete before the new cycle batch is marked completed.
- Scoped atomic staging consumption prevents a single-account action from flushing unrelated staged accounts. The older evaluator publication/ranking helpers delegate to the canonical service. Withdrawal state is rebuilt after first live-row insertion as well as later publication; cent withdrawal arithmetic is normalized. Negative-tier membership uses the same effective balance as the positive tier. Stable identity tie-breaks added; user dashboard reads published rank rather than recalculating a different rank.
- Funding checks use the same path for zero/many trades and distinguish cached first funding from recharge evidence. Partial-close lot exposure reconstructs position peaks from entry/exit deals where available. Daily loss uses closing chronology and actual day-opening baseline; last trade is maximum close timestamp. Challenge timezone is used for business-date grouping and scheduler per-challenge decisions. Further calendar/display and historical-history completeness checks remain required.
- Recovery requests now persist in `credential_recovery_jobs`, retry after restart, use a per-registration database advisory lease and track completion versus awaiting final-results admin action. Recovery only announces published success after successful import/evaluation/publication. A password repair does not reverse DQ; explicit admin reinstatement remains separate. Bot/host/client recovery paths were aligned; full failure/restart/locked-result test coverage remains to be completed.
- Synthetic PostgreSQL only: local port 55436, no production database copy. Latest checks: backend TypeScript build passed; 38 Node tests passed; SQL integration passed for durable duplicate approval, concurrent identity duplication, single-account staging scope, growth SQL, transitions and final override; actual Express routing test passed for all 76 anonymous admin operations plus wrong-role/revoked/deactivated sessions and authenticated access with empty IP allowlist. Frontend production build passed before the latest backend-only changes. No live broker/MT5 calls or real test notifications were sent.
- NOT release-ready yet: complete remaining A01–A32 acceptance review, native creation adapter compatibility, account replacement/removed-registration behavior, all final-lock writers/admin exceptions, scheduling concurrency and lifecycle side effects, frontend field roundtrips, pending challenge 37 approval recovery, live config presence checks, private backups, migration/reader-compatible rollback rehearsal and exact deployment verification. No claim that all 32 findings are closed. Do not push this checkpoint without finishing these gates.

### Continuation checkpoint — September 26 (still NOT DEPLOYED)

- Private full PostgreSQL custom-format backup completed (31,082,711 bytes; SHA256 `b001d6f27c8db17f377a167a4c81a1ea14659d538252a39b7c63835f21ff2221`). Archive decoding to `/dev/null` passed. Backup and environment snapshot remain outside Git under `../.repair-backups/2026-09-26-system-hardening/`, directory 0700/files 0600. Production data was not restored to a test database.
- Latest production read-only preview: challenge 37 remains pending approval and its configuration validates. Challenge 36 has one account, 15 trades, zero flags, qualified profit approximately -613.75. Sixteen hypothetical writes were intercepted; zero production writes. Preview simulated newly added metadata as absent; it is not a historical-data migration or recalculation.
- Completed synthetic tests for failed-evaluation publication isolation, successful-account-only publication, raw balance ingestion without live publication, durable recovery waiting for the coordinator, and locked-result recovery awaiting admin action. Actual Express tests cover 76 anonymous admin operations, wrong roles, revoked/deactivated hosts and authenticated access with intentionally empty IP allowlist. Actual production Next proxy test passed cookie/login/session/CSRF behavior.
- Frontend production build passed. Unit suite reached 46 passing tests. Final backend changes are being rebuilt/retested; these counts are checkpoints rather than a release claim.
- Broker cipher migration tool uses independent per-field nonces, journals exact old/new ciphertext privately before commit, and rejects restoration after newer edits. Synthetic apply/restore/reapply/conflict test passed. Existing production ciphertexts remain unchanged.
- Prepared and compiled a private emergency backend rollback bundle with the dual-format cipher reader, management endpoints returning maintenance 503, and pull/trading schedulers paused. This intentionally degraded rollback avoids reopening anonymous management access or letting old scoring rules run. It is not deployed.
- Additional review corrections: removed an unused unverified account-number update helper; registration removal now preserves raw financial history and removes live/staging entries atomically. Identity replacement now refuses existing trades, deals OR balance operations. No-terminal jobs now fail for retry; explicit cancellation is recorded as cancelled instead of completed/requeued.
- Frontend settings now preserve independent category values and use challenge-timezone conversions. Rules forms can prepare inactive category configurations before switching mode. Registration deadlines are checked by service and database guard. Pending legacy approvals receive durable recovery records through the additive migration; no challenge is automatically approved.
- Still pending: final acceptance/release review, current tests, private Railway runtime variables, controlled release/migration verification, cipher migration and detailed rollback/release record. No hardening commit, push, deployment or production mutation has occurred at this checkpoint.

### Final local validation and release preparation — September 26

- Completed 48 passing unit tests and backend/frontend production builds. Actual Express tests reject all 76 anonymous admin operations and additionally cover cross-role sessions, host deactivation/revocation, cross-host challenge/cancellation access, wrong participant IDs and host writes to locked results. The built Next application passes private-path navigation, HttpOnly/Secure/Strict cookie, Origin check, token-hiding and cookie-expiry tests.
- Expanded synthetic PostgreSQL integration verifies: rollback after an injected post-insert rule-save failure; invalid settings/rules leave persisted values unchanged; independent Demo/Real rules survive a mode switch; concurrent duplicates are rejected; removed registration funding history survives removal; replacements cannot mix recorded history; lifecycle receipts suppress acknowledged repeats; failed evaluations do not publish; successful account publication leaves another account's staging intact; no-terminal/cancelled updates fail honestly; verified password plus durable recovery commits atomically; coordinator-busy recovery resumes; final recovery waits for admin; explicit overrides produce snapshots; completed historical challenges without a lock timestamp still reject ordinary evaluation/publication.
- Added target-counter regression test for split growth/fixed modes, OFF targets and cent-only versus ordinary cent units. Admin/host overview counters now use canonical category thresholds instead of shared SQL fallbacks.
- Retired obsolete individual-pull approve/reject routes (410) because refresh now publishes its own account immediately. Corrected its diff/rank summary to read the published row rather than emptied staging. Error responses retain actual failure descriptions. Host post-publication rejection no longer falsely reports success.
- Credential updates on admin/client/host paths now commit a persistent recovery request with the verified password. Missing scheduler availability cannot lose the request. DQ remains until explicit reinstatement; recovery does not infer permission to clear it.
- Admin status/deletion requests now return 202/pending approval and UI explains that state. Hosted announcements do not post through BirrForex's native channels. Approval dates use the challenge timezone.
- Removed old automatic startup data rewrites: currency inference from account prefixes/shared rules, historical trade deletion/direction flipping, and guessed winner completion based on age. Two complete startup migrations were executed against synthetic historical fixtures and preserved their rows exactly. No production historical correction is implied by this removal.
- Read-only production preview remains unchanged: challenge 36, registration 5248, 15 trades, zero flags, qualified profit approximately -613.75. Challenge 37 remains pending approval and validates. Captured fingerprints for 48,407 historical trades, 1,976 leaderboard entries, 1,799 balance operations, 4,900 registrations and 27 challenges (IDs <=36); no current running pull batch was found.
- Safe rollback bundle was rebuilt with old migrations disabled, compiled, and its actual Express admin/host boundaries verified to return maintenance 503. Cipher migration/restore/conflict rehearsal passed earlier. Full DB backup remains intact; no production data clone was created.
- Updated implementation acceptance map and explicit limits in `audits/2026-09-26-implementation-plan.md`; documented emergency code rollback, field-conflict restoration, environment recovery and database restore limitations in `audits/2026-09-26-hardening-rollback.md`.
- Railway private runtime proxy variables are being prepared using `--skip-deploys`, with exact before/after values journaled privately. Empty admin IP allowlist is intentionally preserved. This is release preparation, not a deployment or a historical score mutation. Deployment IDs, final commit and post-release integrity checks will be recorded below after verification.

### Verified first hardening deployment — September 26, 2026

- Implementation commit `e2da846f3f6c319da4d2a6d57b2a75b01612783c` pushed directly to main after local gates passed. Backend deployment `c749fae5-79e1-4747-afd8-76bf004cf970` and frontend deployment `6ae7debb-31b7-41e8-9835-d57b8331f181` both reached SUCCESS at this commit.
- Backend startup log confirms required migration succeeded, with zero reported database query failures in the captured startup window. Private runtime admin path/origin and matching proxy signing secret were prepared with `--skip-deploys`; intentionally empty admin IP allowlist stayed empty.
- Live verification: backend health 200; anonymous backend/frontend admin requests 401; private admin navigation 200; retired direct admin route 404; cross-origin login 403; real authenticated admin session/list/approval requests 200; token absent from browser response body; cookie HttpOnly/Secure/SameSite Strict. Initial smoke harness used the wrong field (`password` instead of the UI's `key`); correcting the harness and a subsequent transient fetch failure required retries, not an application auth change. Added an actual login-contract assertion to the local Express test.
- Challenge 37's pending approval is now durably visible and remains unapproved. Challenge 36 public rules remain OFF and its public leaderboard has the same single participant.
- Historical integrity comparison passed exactly for the captured columns of all 48,407 trades, 1,976 leaderboard rows, 1,799 balance operations, 4,900 registrations and 27 challenges with IDs <=36. No historic scoring or registration data was changed by deployment. No running pull batch was observed.
- Broker migration preview identified three integrated hosts/nine legacy encrypted fields. Applied the versioned encryption migration after healthy deployment. Private journal `../.repair-backups/2026-09-26-system-hardening/production-broker-cipher-v2.json` was fsynced before the transaction committed and is mode 0600. All nine resulting fields match the recorded after-state and decrypt to exactly the previous plaintext in a read-only check. No plaintext was logged and no live broker request was made.
- Release review found remaining UTC-based admin/host most/least-active-day display queries. Small follow-up aligns their SQL grouping with each challenge's configured timezone; backend rebuild and real SQL local-midnight test passed. This does not rescore trades or change stored results. Follow-up deployment verification is recorded separately below.
- Pre-existing documentation/assets and the user's host-dashboard target-balance hunk remain uncommitted and unchanged. No unrelated work was included in the implementation commit.

### Verified timezone follow-up and final race checks

- Commit `67a82c43e98eed701e519436f634c2dc0fa03d9c` deployed successfully: backend `e630ec1f-f24e-4925-a9b8-9aabcbab73be`, frontend `21e3a033-5dda-4fe1-88db-a13fa7b878dd`. Live login/session/public-rule checks passed again, and authenticated admin overview requests for both challenges 36 and 37 returned 200.
- Final race review tightened automatic DQ recovery to include its typed source in the UPDATE predicate, so a manual DQ written after its initial read cannot be cleared. Credential-expiry UPDATE now rechecks current password status, first-failure deadline, active registration and DQ state; a concurrent successful password repair wins and prevents an erroneous DQ notification.
- Both races reproduced and passed against synthetic PostgreSQL using the actual evaluator/scheduler methods with an intervening write. The complete integration suite and 48 unit tests pass; backend build passed. These guards do not update existing production rows on deploy.

### Final verified application outcome — September 26, 2026

- Final application commit: `290c8f29e05b74b03a913313861e81a58b044c7f`, pushed to main. Railway backend `2cc8d4f8-da0e-4117-9511-d58b2e09a7f1` and frontend `29207128-cc61-418d-a453-57aec38bf442` both reached SUCCESS at that commit.
- Repeated live verification after the final application deployment: health 200; anonymous admin 401; authenticated session, challenge list, approval list and challenge 36/37 overview 200; private navigation 200; direct old admin path 404; cross-origin mutation 403; secure cookie confirmed. Logged out the verification session afterward.
- Repeated historical integrity check after the final deployment: all five captured table fingerprints still match the pre-release state exactly. Challenge 36 remains completed, rules OFF, single participant, 15 trades and zero flags. Challenge 37 remains pending approval with its recovered durable request; no approval was performed. No running pull batch was observed.
- Cipher migration verified three hosts/nine fields with unchanged decrypted values. Private full backup, environment before/after journal, cipher field journal and compiled/smoke-tested maintenance rollback bundle remain available. A Git revert alone is not the data rollback; use the documented conflict-aware recovery procedure.
- Validation totals: 48 unit tests; real synthetic PostgreSQL integration including atomic creation failure, duplicate registration, independent settings, publication failure/isolation, recovery/final-lock and manual-DQ/password-repair races; repeated startup migration preservation; encrypted-field apply/restore/conflict; actual 76-route admin authentication plus host isolation tests; built Next proxy smoke; backend/frontend production builds; production read-only calculations and live HTTP smoke. External broker/MT5 actions and real test notifications were deliberately not exercised.
- Synthetic local PostgreSQL instance at port 55436 was stopped after validation. No production database was cloned or restored. Unrelated user edits and assets remain untouched and uncommitted.
- This final documentation-only follow-up records completed verification and may trigger Railway to redeploy identical application code. Implementation details and explicit remaining policy/coverage limits are in the acceptance map; rollback commands and limitations are in the rollback document.


## Session — September 26, 2026 — VPS access and pull-system assessment (report only)

- Established key-authenticated temporary SSH access from this Mac to the VPS after user installed OpenSSH and configured source-IP-restricted Windows/Contabo rules. Verified ED25519 server fingerprint against user-provided server output and logged in as Administrator. Private deployment key remains outside repository. Windows SSH service still fails with 1067; temporary foreground listener works and remains necessary. No MT5 restart, application deployment or VPS application edit performed.
- User requested efficiency/accuracy assessment of pull, balance reconciliation and opening-time repair. Report: `audits/2026-09-26-pull-system-assessment.md`, with 12 findings, examples, evidence limits and sequenced reversible implementation plan. No implementation approval inferred from this assessment request.
- Read-only VPS inspection: C:/BirrForex at 69cf9ad, tracked files clean; untracked runtime metrics JSON preserved. Local main 3d178e6; tracked vps/ files have no diff between these commits. Backend/router both configured for 10 terminals. Current router telemetry interval has zero requests; not a load benchmark.
- Actual-method local mocked probes reproduced MT5 None history returning success/balance/no trades; omitted entry=3 closes; main vs repair pending-order fill-time disagreement; non-independent position reconciliation. No MT5 login or account pull used for tests.
- Read-only production queries found 48,407 trades, 73 missing opening times, 75 missing/zero opening prices; reconciliation states 212 failed, one resolved, 4687 unset. Challenge 33 accounts show baseline plus recorded trade net exactly matching current balances while positive-deposit re-addition generates false reconciliation failures. Historical large batch: 1187 accounts/4346 seconds; recent small batches spend 30 seconds settling. These are observations, not permission to rewrite history.
- No production DB writes, rescoring, notifications, commits or pushes. Only assessment documentation and this session log added; existing unrelated user changes preserved.

### 2026-09-26 — Pull integrity implementation and deployment preparation (not yet deployed)
- User approved the assessed pull-system fixes, safe rollout and reversible changes. Local baseline main: `3d178e6830099b4b128997ed4db45f6d7c28195a`; unrelated existing edits/assets preserved.
- Implemented opt-in verified history protocol, full signed broker-ledger checks, stable and independently compared deal manifests, execution-based partial/close-by/reversal reconstruction, bounded worker dispatch, batched raw persistence, durable recovery, per-account evaluation transactions and atomic public history publication.
- Added per-transaction rollback records and a conflict-checking reverse-order restore tool. Added an inspection-first Python-only VPS restart script with existing-session/port ownership/commit/health checks and restricted logs.
- Detailed design, limitations, backup and rollback procedure: `audits/2026-09-26-pull-history-release.md`. Assessment: `audits/2026-09-26-pull-system-assessment.md`.
- Local checks passed: backend build, 59 Node tests, 22 Python tests, frontend build, real synthetic PostgreSQL pull/rollback integration, existing hardening integration, repeated startup migrations. No production account was pulled or rescored during preparation.
- New private production backup: 31,151,656 bytes; SHA-256 `b9b53bf8fe125c81a0722ba277d920889c3d19f19622dce3b439192a9b7585e7`; archive listing verified. Latest live check found no active challenge or running pull job; challenge 37 pending approval.
- Mac source IP changed; user updated Contabo and Windows SSH firewall rules. Pinned-key SSH access was restored. VPS still has 10 workers/router on previous code in desktop session 2. SSH remains dependent on its foreground listener; Windows service startup failure is not claimed fixed.
- Release execution and live verification remain pending at this checkpoint; do not treat local test success as production deployment.

### 2026-09-26 — Pull integrity release deployed and verified

- Pushed implementation `fd5a77da4a3837d0f235657097878600cc932a8f` to main after the final backend build, 59 unit tests, synthetic pull-history integration and existing hardening regression suite passed. Python's 22 tests, frontend production build and repeated startup-migration tests also passed during preparation. Production was not cloned for testing.
- Railway initially deployed compatible code with the new protocol disabled. Backend deployment `2681cf3f-c3a4-4cfc-8420-1345809b8195` and frontend `e9a43956-d627-4b92-a700-1fa7aeff8bd7` reached SUCCESS. Additive migration created history/publication/journal infrastructure without rewriting historical account data.
- Restored pinned-key SSH after the user's Contabo and Windows source-IP changes. Fast-forwarded clean tracked VPS checkout from `69cf9ad` to release main; preserved untracked runtime metrics. Windows Python compilation and PowerShell parsing passed. An interactive Administrator-session inspection identified all ten worker listeners and router before stopping any process.
- First guarded restart stopped at worker 1 because the restart script omitted the worker's required port argument. The safety guard halted the rollout immediately; the other nine workers and all MT5 processes continued running. Restored worker 1 using its correct arguments, existing machine API key and attachment-only startup. Fixed the script locally, committed/pushed `9636fd5cdae22ffa8246a90b30edb5dc4d95bd5e`, pulled that exact commit on VPS and reran the guarded procedure successfully. No application file was edited only on VPS.
- All ten worker ports 8001–8010 and router 8000 passed commit/health checks at `9636fd5`; workers reported protocol 2 and live IPC. Scheduled task exited 0. All eleven terminal64 PIDs matched before/after deployment, confirming no MT5 process restart. Python workers were restarted individually in desktop session 2; SSH foreground listener was left alone.
- Live read-only protocol smoke used the existing worker home broker account through the router: invalid API key rejected with 401; authenticated request returned 26 trades and 54 deals, exact signed ledger reconciliation, matching request/account/terminal identity, and passed the actual backend snapshot validator. Duration 2.823 seconds for this account only, not a fleet performance benchmark. No challenge database ingestion, scoring or notification was invoked by this test.
- Enabled backend `VPS_VERIFIED_HISTORY=true` only after compatible live workers and broker smoke passed. Backend deployment `e65d3860-cc98-4299-91f2-96731d91a13c` reached SUCCESS at `9636fd5`; frontend deployment `5fb6fd42-bc78-44cf-98df-85554a315852` reached SUCCESS at the same commit.
- Live application smoke passed: health 200; anonymous admin 401; authenticated admin/session/overview/approvals 200; cross-origin login 403; private admin page 200; retired direct route 404; secure HttpOnly SameSite cookie. Verification session logged out afterward. Challenge 37 remains pending approval.
- Exact pre-release fingerprints for original columns matched after migration/deployment: 28 challenges, 4,900 registrations, 48,407 trades, 100,187 raw deals, 1,799 balance operations and 1,976 leaderboard rows. The comparison reconstructs original column order from backup schema (including quoted `time`) so new additive columns do not cause false differences. No active/reviewing challenge or running pull job existed; deleted/completed challenges were not rescored.
- Backup and recovery details remain in `audits/2026-09-26-pull-history-release.md`. The private 31,151,656-byte production archive and per-transaction conflict-checking restore tool provide separate code/data recovery. Disable the feature and stop account updates before restoring data; a Git revert alone cannot undo published data. Preserve newer unrelated edits; conflicts deliberately abort restoration rather than overwrite them. Existing external notifications cannot be recalled.
- Remaining limits: a source that never exposes missing records cannot be proven complete; persistent broker truncation/authentication failures need investigation. The controlled live test is not a full active-challenge load test. Windows sshd service startup error 1067 remains unresolved; SSH still relies on the foreground listener and current source-IP firewall rules. Unrelated local edits/assets remain uncommitted and preserved.
- This final documentation-only commit is also pulled to VPS. Running Python reports its startup code commit `9636fd5`; the documentation-only follow-up does not change its code or require another restart.

### 2026-09-26 — Visible-console preference and login-health investigation (pending)
- User requires visible CMD/worker windows in the Administrator desktop, started through the BAT file; hidden launches are not acceptable. Prepared local edits to `vps/start_vps.bat` and `vps/restart_python.ps1` to launch visible BAT-backed CMD consoles, preserve rolling ownership/health checks, use UTF-8 output, and refuse duplicate full-launch listeners. These edits are not yet committed/deployed or Windows-tested.
- User's screenshot confirms listeners on ports 8000–8010. Live router still reports ten healthy workers, but an actual terminal-1 `/verify` request reproduces `Expecting value: line 1 column 1 (char 0)`. This is a separate failing login-verification path; basic health must not be presented as proof that all account operations work. Root exception still needs restricted VPS log inspection.
- SSH timed out. Current Mac public IP observed as 196.188.241.76; requested matching /32 Contabo rule and Windows WinnerPip-SSH-Mac remote-address update. Awaiting access restoration before restarting or deploying. Existing processes left running; BAT was not launched on top of them.
- Access restored after the user updated both firewalls. Restricted worker-1 traceback identifies the login failure precisely: `login_user` prints U+2192, redirected CP1252 stdout raises UnicodeEncodeError, worker `/verify` returns HTTP 500, and router JSON parsing hides it behind `Expecting value`. Added worker stdout/stderr backslash-replacement handling independent of launch mode; BAT additionally selects UTF-8 and visible CMD consoles. A regression using the actual worker logging functions and a CP1252 TextIOWrapper reproduces the environment and now passes; all 23 Python tests pass. Deployment/live all-terminal verification follows.

### 2026-09-26 — Visible BAT launch and admin deep-health repair verified
- Deployed `aaaa83c45568fb61c2aed430bdc62f8141185ec8` from local main through Git to VPS. Worker logging now tolerates unsupported console glyphs; BAT sets UTF-8 and opens normal visible CMD consoles. The guarded Python restart invokes the BAT's per-worker/router modes, rather than restarting MT5 or creating duplicate listeners. Full BAT launch checks for occupied worker/router ports before launching.
- Windows checkout uses sparse checkout (`vps`); added `tests/python` to run the regression there. Initial unittest discovery found the test absent and stopped before any restart; after checking out the tracked test directory, the Windows logging regression and Python syntax checks passed. PowerShell parser passed. No VPS-only application edit was made.
- Interactive restart task `WinnerPip-Visible-aaaa83c` exited 0. All ten worker ports and router passed code/IPC health checks. Verified nonzero window handles and visible titled CMD windows for WinnerPip Worker 1–10 and WinnerPip Router, all in Administrator session 2. The prior MT5 process IDs remained unchanged.
- Called the actual authenticated frontend management proxy `/api/management/vps-health?deep=true`, the same operation used by the admin panel: HTTP 200, `10/10 terminals working`, all ten login tests successful with null errors, 7.805 seconds total. Logged out the temporary verification session afterward. This validates the previously failing operation, beyond the basic router-health endpoint.
- No challenge ingestion, evaluation or database repair was invoked. Historical fingerprints and no-running-job check passed before restart. User's unrelated local edits remain preserved. Existing backup and release journal remain available; source changes are individually revertible through Git. Final documentation is synced to VPS without restarting unchanged code.
