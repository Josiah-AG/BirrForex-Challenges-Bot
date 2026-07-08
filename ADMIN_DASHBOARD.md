# WinnerPip Admin Dashboard — Complete Specification

**URL:** `https://winnerpip.com/admin/panel`
**Auth:** Password-gated (admin key stored in localStorage after login). IP whitelist enforced server-side.

---

## LOGIN GATE

Shown before any dashboard content.

| Element | Description |
|---------|-------------|
| Password field | `type="password"`, autocomplete-friendly |
| **Access Dashboard** button | POSTs `{ key }` to `/api/admin/{secretPath}/login`. On success stores key in `localStorage` and shows dashboard. On `403` shows "IP not whitelisted". On other failure shows "Invalid admin key". |

---

## HEADER (Persistent, Sticky Top)

| Element | What it does |
|---------|-------------|
| WinnerPip icon | Static logo |
| **Challenge selector** (dropdown) | Lists ALL challenges from `/api/admin/{path}/challenges` (including draft/completed). Switching challenge reloads all data for that challenge. |
| `ADMIN PANEL` label | Static badge below challenge name |
| **+ New** button | Switches to the Create Challenge tab |
| Status badge (●) | Shows current challenge status (active/draft/etc.) with colour coding (green = active) |
| Participant count | Total registrations for selected challenge |
| **Logout** (icon) | Clears `localStorage` key and reloads page |

---

## NAVIGATION TABS

Horizontal scrollable tab bar. Tabs:

`Overview` · `Participants` · `Leaderboard` · `Violations` · `Pulls` · `Screening` · `Rules` · `Settings` · `⚡` (Health)

Active tab: highlighted in royal blue.

---

## TAB 1 — OVERVIEW

### Stat Cards Row 1 (4 cards)

| Card | Value | Sub-text |
|------|-------|----------|
| **Participants** | Total registered | Demo count · Real count |
| **Total Trades** | All trades pulled for this challenge | Avg per user · total lots volume |
| **Violations** | Total flagged trades | % violation rate |
| **Above Target** | Qualified participants (adjusted balance ≥ target) | % of total qualified |

### Stat Cards Row 2 (4 cards)

| Card | Value | Sub-text |
|------|-------|----------|
| **Total Balance** | Sum of all current balances | Real total · Demo total (currency auto-detected: ¢ for cent-only challenges) |
| **Pulls Today** | Pull cycles run today | Next scheduled pull time (EAT) |
| **Pull Success** | Successful account pulls | Failed count · Password Changed count |
| **Last Pull** | Time of last pull cycle (EAT) | Terminal health summary |

### Top Rule Violations (bar chart)

Lists the 5 most common violation types with horizontal progress bars showing relative frequency.  
Source: violations tab data, loaded on both overview and violations tab open.

---

## TAB 2 — PARTICIPANTS

### Find User (search)

| Element | What it does |
|---------|-------------|
| Search input | Accepts: username, email, MT5 account number, Telegram ID / Discord user ID |
| **Search** button (or Enter) | GETs `/api/admin/{path}/challenge/{id}/finduser?q=...`. Returns full user card or "not found" state. |
| Clear (×) button | Resets search, returns to participant list |

### Found User Card (when search returns a result)

**Header:** Nickname · account type badge · Rank badge · `@username · email`

**Stats grid (8 tiles):**
Balance · Qualified Profit · Profit Removed · Win Rate · Total Trades · Avg RR · Flagged Trades · Active Days

**Info grid (6 tiles):**
Account # · Server · Telegram/Discord ID · Registered (EAT) · Last Pull (EAT) · Partner status

**Violations list** (if any): Each violation shown as `⚠️ [violation text]`

**Recent Trades list:** Last few trades with type badge (Buy/Sell), symbol, volume, profit

**Action buttons (3):**

| Button | What it does |
|--------|-------------|
| **Export User Summary (CSV)** | Downloads CSV with all user stats (nickname, account, type, balances, trades, violations, timestamps in EAT) |
| **Export Evaluation Report** | GETs `/api/admin/{path}/challenge/{id}/user-evaluation?registration_id=X` → downloads `.txt` evaluation report |
| **Export MT5 Trade History** | GETs `/api/admin/{path}/challenge/{id}/user-trades-mt5?registration_id=X` → downloads MT5-format tab-separated trade history CSV (`ReportHistory-{account}.csv`) |

---

### Participant Counts (when no search active)

4 mini cards: Total · Demo · Real · Qualified

---

### All Participants Table (paginated, when no search active)

**Filter dropdown:** All · Demo · Real · Disqualified · Password Changed

**Columns:** Rank · Nickname · @Username · Email · Account # · Type · Balance (+ Adj Balance + last pull time) · Qualified Profit · Trades · Actions

**Row click** → auto-fills search with that participant's nickname and triggers search (showing the full user card).

**Actions column (per row — 3 buttons):**

| Button | Icon | What it does |
|--------|------|-------------|
| **Verify** | Shield | GETs `/api/admin/{path}/challenge/{id}/verify/{regId}`. Opens a popup modal showing: Verified/Failed status, balance, equity, pull status warning if any, attempt count. |
| **Remove Registration** | UserMinus | Opens Action Modal (type = unverify). Requires a reason. POSTs to `/api/admin/{path}/challenge/{id}/unverify` with `{ registrationId, reason }`. Sends DM to user if applicable. |
| **Disqualify** | Ban | Opens Action Modal (type = disqualify). Requires a reason. POSTs to `/api/admin/{path}/challenge/{id}/disqualify`. Marks disqualified in DB, optionally DMs user. |

**Pagination:** Previous/Next buttons, shows page X of Y.

**Action Modal (Unverify / Disqualify):**
- Title shows action type
- Shows target participant name
- Textarea for reason (required before confirming)
- Cancel and Confirm buttons
- Shows success/failure result inline, auto-closes after 1.5s on success

---

### Verify Connection Popup

Triggered from the verify button in the participants table. Rendered at the top-level z-index (above all modals).

Shows:
- ✅ Verified / ❌ Failed status
- Balance and equity (if verified)
- Pull status warning (if `pull_status != "success"`)
- Number of attempts taken
- Credential issue flag if relevant
- Close button

---

## TAB 3 — LEADERBOARD

Full leaderboard table for the selected challenge.

**Category filter:** All · Real · Demo (fetches from `/api/challenges/{id}/leaderboard?category=X`)

**Columns:** Rank · Nickname (DQ badge if disqualified) · Account Type · Adjusted Balance · Total Trades · Win% (qualified/total) · Qualified Profit · Violations count

**Row click** → opens Participant Detail Modal (mini card with rank, balance, profit, gross, trades, flagged count, account type badge)

**Currency:** Shows ¢ for cent users, $ for standard. DQ users show "DQ" instead of balance. Top 3 ranks shown in gold.

---

## TAB 4 — VIOLATIONS

Lists all participants who have at least one flagged trade.

**Per participant (collapsible `<details>`):**
- Header: Nickname · Account # · violation count · profit removed
- Expanded: each flagged trade showing ticket, symbol, profit, and per-trade violation messages

**Source:** `/api/admin/{path}/challenge/{id}/violations`

Currency adapts to cent vs standard per challenge type.

---

## TAB 5 — PULLS

Pull history table and terminal status grid.

**Source:** `/api/admin/{path}/challenge/{id}/pulls`

### Pull History Table

Columns: Time (EAT) · Success · Failed · Password Changed · New Trades · Duration · Status

### Terminal Status Grid

10 terminal slots (T1–T10). Shows per terminal: healthy status, accounts processed, success/fail counts, avg time, last error.

> Note: Terminal health is currently hardcoded to "all healthy" since per-terminal live data is not persisted to DB between cycles. Real-time state only exists during an active pull cycle.

---

## TAB 6 — SCREENING

Partner affiliation screening results. Source: `/api/admin/{path}/challenge/{id}/screening`

### Currently Changing Partners panel

Users detected as currently in the process of changing their Exness partner affiliation. Shows: @username · account # · account type · email · date flagged (EAT).

### Disqualified (Partner Left) panel

Users DQ'd because they removed the required partner affiliation. Shows same fields plus DQ reason preview.

### Screening History table

Columns: Date + time (EAT) · Total Screened · All Good · Changing · Left

Clicking a "Changing" or "Left" count expands an inline dropdown showing the specific users (@username · account · type · email).

Runs automatically twice daily at 10:00 AM and 10:00 PM EAT.

---

## TAB 7 — RULES

Configuration form for the selected challenge's evaluation rules.

> Rules are locked after challenge status moves past `registration_open`.

### Input Fields

| Field | Input | Description |
|-------|-------|-------------|
| Max Lot Size | Number (step 0.01) | Trades over this have profits removed |
| Max Open Trades | Number | Max simultaneous open trades at any moment |
| Pair Limit | Number | Max simultaneous trades on the same symbol |
| Max Risk per Trade ($) | Number (step 0.5) | Max SL distance in $ (or ¢ for cent). Used for both static SL check and fake SL candle detection |
| Daily Loss Cap ($) | Number | Max drawdown from day's opening balance. Profits after breach are removed |
| Max Trade Duration (hours) | Number | Trades held longer have profits removed |
| Min Active Trading Days | Number | Minimum unique trade days to qualify for prizes |

### Toggles

| Toggle | Default | Effect |
|--------|---------|--------|
| Stop Loss Required | ON | All trades must have SL at entry or profits are removed |
| Weekend Trading | OFF | Trades opened/closed on weekend have profits removed |
| Only Cent Account | OFF | Real category requires cent accounts. When ON, admin enters values in ¢ instead of $ |

### Fixed Rules notice

Always shown to users regardless of settings:
- No recharging during challenge
- Unlimited trades per day (if rules followed)
- No leverage limit
- Profits removed on violations, losses always count

### Save Rules button

PUTs to `/api/admin/{path}/challenge/{id}/rules`. After saving, button changes to "✓ Rules Saved — Locked" and is disabled (rules are immutable once active challenge starts).

---

## TAB 8 — SETTINGS

Edit settings for the currently selected challenge.

### Edit Fields

| Field | Type |
|-------|------|
| Title | Text |
| Type | Select: Hybrid / Demo / Real |
| Start Date & Time (EAT) | datetime-local |
| End Date & Time (EAT) | datetime-local |
| Starting Balance ($) | Number |
| Target Balance ($) | Number |
| Prize Pool Text | Text (displayed on public pages) |

**Save Changes** button → PUTs to `/api/admin/{path}/challenge/{id}`

---

### Status Actions (6 buttons)

| Button | Status it sets | Effect |
|--------|---------------|--------|
| **Open Reg** | `registration_open` | Opens registration, bot starts accepting entries |
| **Start** | `active` | Marks challenge as active, VPS pull scheduler picks it up |
| **End → Review** | `reviewing` | Stops new pulls, admin reviews results |
| **Completed** | `completed` | Finalises challenge |
| **📢 Announce** | — | POSTs to `.../announce` → sends challenge announcement to Telegram/Discord. Sets status to `registration_open`. |

---

### Export Buttons (4)

| Button | What it exports |
|--------|----------------|
| **📥 Registrations** | All participant registration data as CSV (`challenge_{id}_registrations.csv`) |
| **📊 Leaderboard** | Full leaderboard snapshot as CSV (`challenge_{id}_leaderboard.csv`) |
| **📋 Evaluation** | Per-participant evaluation data as CSV (`challenge_{id}_evaluation.csv`) |

---

### Social Media Exports (2)

| Button | Output |
|--------|--------|
| **📋 Download Rules** | Downloads an HTML file (1080×1920 portrait + landscape version) designed for screenshot-to-post. Shows challenge name, dates, balance, all rules as styled cards on dark background with BirrForex branding. |
| **🏆 Export Leaderboard** | Downloads a styled HTML leaderboard image (top 10) ready for screenshot-to-post. |

---

### Danger Zone

| Button | What it does |
|--------|-------------|
| **🗑️ Delete Challenge** | First click shows confirmation row ("Are you sure? Cannot be undone."). Second click DELETEs `/api/admin/{path}/challenge/{id}`. Refreshes challenge list after. |

---

## TAB 9 — ⚡ HEALTH

Manual VPS and terminal health check panel.

### Run Health Check button

GETs `/api/admin/{path}/vps-health?deep=true`. Shows spinner during check. Displays last-checked timestamp.

### VPS Status card

- Online/Offline badge with pulse indicator
- If online: terminal count, worker count, uptime, version
- Raw VPS JSON response (expandable `<details>`)
- If offline: error message

### Terminal Login Test card

10 terminal result boxes (T1–T10). Each shows ✓ (green) or ✗ (red).  
Summary badge: "X/10 passed".  
Failed terminals list with error message per terminal.

### Pull Stats — Last 24h card

4 tiles: Batches · Success count · Failed count · Success rate (colour-coded: green ≥90%, gold ≥70%, red <70%)

⚠️ Warning banner if any accounts have `pull_status = 'password_changed'` pending 48h deadline.

Error breakdown table: error code vs count.

### Recent Pull Cycles card

Last 5 pull batches. Per batch: time (EAT) · total accounts · success count · fail count · duration in seconds. Status dot: green (completed) · pulsing gold (running) · red (failed).

---

## CREATE CHALLENGE (+ New button → 4-step wizard)

### Step 1 — Source

Choose where the challenge will run:
- **Telegram** (public) — sets `source: "telegram"`, `team_only: false`
- **Discord** (team-only) — sets `source: "discord"`, `team_only: true`

### Step 2 — Challenge Details

| Field | Notes |
|-------|-------|
| Title | e.g. "Challenge 18 - Hybrid" |
| Type | Hybrid / Demo Only / Real Only |
| Start Date & Time | datetime-local, interpreted as EAT |
| End Date & Time | datetime-local, interpreted as EAT |
| Starting Balance ($) | Budget each participant starts with |
| Target Balance ($) | Threshold to qualify for prizes |
| Prize Pool Text | Display text (e.g. "$1,600 Total Prize Pool") |
| Real Winners # | Only shown if type ≠ Demo |
| Demo Winners # | Only shown if type ≠ Real |
| Real Prizes (comma-separated) | e.g. "500,300,200" |
| Demo Prizes (comma-separated) | e.g. "300,200,100" |
| PDF URL | Optional rules document link |
| Video URL | Optional promo video link |

### Step 3 — Challenge Rules

Same fields as the Rules tab (Max Lot, Max Open Trades, Pair Limit, Max Risk, Daily Loss Cap, Max Hold Hours, Min Active Days, SL Required toggle, Weekend Trading toggle, Only Cent Account toggle).

### Step 4 — Review & Confirm

Read-only summary of all values from steps 2–3. Shows ¢ instead of $ if cent account mode is on.

**✓ Create Challenge** button → POSTs to `/api/admin/{path}/challenges`, then PUTs rules to `/api/admin/{path}/challenge/{id}/rules`. On success, navigates to Overview tab with the new challenge selected.

---

## PARTICIPANT DETAIL MODAL

Opens when clicking a leaderboard row.

| Field | Shown |
|-------|-------|
| Nickname | Header |
| DQ status | If disqualified: reason in red box |
| Rank | Gradient text |
| Adjusted Balance | Currency auto-detected |
| Qualified Profit | Green/red |
| Gross Profit | White |
| Total Trades | — |
| Flagged Trades | Red if >0, green tick if 0 |
| Account Type | Badge (gold = real, blue = demo) |

Close: click outside modal or × button.

---

## CURRENCY DISPLAY LOGIC

The dashboard auto-detects currency per challenge:
- **Demo challenges:** always `$`
- **Real + Only Cent Account:** always `¢`
- **Hybrid / Real without cent restriction:** `¢` for cent users, `$` for standard users (per-row detection using `is_cent` flag from leaderboard data)

The `cur(amount, userIsCent?)` helper handles this globally.

---

## API ENDPOINTS USED

| Endpoint | Method | Used by |
|----------|--------|---------|
| `/api/admin/{path}/login` | POST | Login gate |
| `/api/admin/{path}/challenges` | GET | Challenge selector |
| `/api/admin/{path}/challenges` | POST | Create challenge |
| `/api/admin/{path}/challenge/{id}` | PUT | Settings — save |
| `/api/admin/{path}/challenge/{id}` | DELETE | Settings — delete |
| `/api/admin/{path}/challenge/{id}/status` | PATCH | Settings — status change |
| `/api/admin/{path}/challenge/{id}/announce` | POST | Settings — announce |
| `/api/admin/{path}/challenge/{id}/overview` | GET | Overview tab |
| `/api/admin/{path}/challenge/{id}/rules` | PUT | Rules tab — save |
| `/api/challenges/{id}/rules` | GET | Rules tab — load + social export |
| `/api/challenges/{id}/leaderboard` | GET | Leaderboard tab + social export |
| `/api/admin/{path}/challenge/{id}/violations` | GET | Violations + Overview |
| `/api/admin/{path}/challenge/{id}/pulls` | GET | Pulls tab |
| `/api/admin/{path}/challenge/{id}/screening` | GET | Screening tab |
| `/api/admin/{path}/challenge/{id}/participants` | GET | Participants list |
| `/api/admin/{path}/challenge/{id}/finduser` | GET | Participants search |
| `/api/admin/{path}/challenge/{id}/verify/{regId}` | GET | Verify button in participants table |
| `/api/admin/{path}/challenge/{id}/unverify` | POST | Remove registration action |
| `/api/admin/{path}/challenge/{id}/disqualify` | POST | Disqualify action |
| `/api/admin/{path}/challenge/{id}/user-evaluation` | GET | Export evaluation report |
| `/api/admin/{path}/challenge/{id}/user-trades-mt5` | GET | Export MT5 trade history |
| `/api/admin/{path}/challenge/{id}/export-registrations` | GET | Settings — export registrations |
| `/api/admin/{path}/challenge/{id}/export-leaderboard` | GET | Settings — export leaderboard |
| `/api/admin/{path}/challenge/{id}/export-evaluation` | GET | Settings — export evaluation |
| `/api/admin/{path}/vps-health` | GET | Health tab |

---

## WHAT IS NOT YET BUILT (PENDING)

| Feature | Status | Notes |
|---------|--------|-------|
| SL Check Failure Reporting panel | ❌ Missing | `wp_pull_errors` with `error_code = 'sl_check_failed'` is logged but no UI section shows it. Needs a panel under Violations or Pulls showing affected accounts + unchecked trade count + retry option. |
| Admin full-pull trigger button | ❌ Missing | Should be in Pulls tab or Health tab. Triggers `/api/admin/{path}/challenge/{id}/trigger-pull`. |
| Per-terminal real-time stats | ⚠️ Partial | Terminal grid in Pulls tab is hardcoded to all-healthy. Real per-terminal processed/failed counts only exist in memory during a pull cycle, not persisted. |
| Telegram DM button on found user | ❌ Missing | Participants tab shows user's Telegram ID but no direct DM action from dashboard. |
| Challenge duplication | ❌ Missing | No "Clone from previous challenge" option in Create wizard. |
