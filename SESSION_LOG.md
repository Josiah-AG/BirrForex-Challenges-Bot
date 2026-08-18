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

### Design Decisions
- **Backward compatible**: `rules_enabled` is optional. Existing challenges without it default to all rules ON (`isRuleEnabled` returns `true` when `rules_enabled` is undefined)
- **Max Risk per Trade** is tied to the SL Required enable toggle (they're the same rule)
- **Only Cent Account** doesn't have an enable toggle (it's a registration filter, not an evaluation rule)
- **Disabled rules**: input values are preserved even when toggled OFF, so you can turn them back ON without re-entering values

### Pending
- Waiting for user's next update requirement
