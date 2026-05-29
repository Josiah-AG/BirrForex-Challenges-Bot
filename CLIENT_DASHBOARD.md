# Client Dashboard — Complete Assessment

## Architecture

- **Framework:** Next.js 14.2.35 (App Router), React 18, Tailwind CSS
- **UI Theme:** Custom glass-morphism dark theme (bg `#0a0e1a`), Lucide icons, Radix UI primitives
- **API:** All data fetched from TG Bot backend at `NEXT_PUBLIC_API_URL` (port 3001). No server-side rendering for data — all client-side fetches.
- **Auth:** JWT token stored in `localStorage` (`wp_token`), user data as `wp_user`
- **Location:** `WinnerPip/winnerpip/` directory

---

## Page 1: Login (`/login`)

**How users authenticate:**
- Enter MT5 Account Number (numeric only) + Investor Password (read-only MT5 password)
- POST to `/api/auth/login` with `{ account_number, investor_password }`
- On success: stores JWT + redirects to `/challenge/{id}`

**Features:**
- Show/hide password toggle
- If `?challenge=X` param present, checks if challenge is team-only
- **Team-only:** Shows Discord registration link
- **Regular:** Shows "Register via Telegram" deep link

**Error states:** Not registered (401), Registration removed (403), Disqualified (403)

---

## Page 2: Challenges List (`/challenges`)

**API:** GET `/api/challenges`

**Each challenge card shows:**
| Element | What it reveals |
|---------|----------------|
| Title | Challenge name |
| Status badge | Coming Soon / Registration Open / Ongoing (Live) / Final Review / Ended |
| Type badge | demo / real / hybrid |
| Period | Start date → End date |
| Target | Starting balance → Target balance (e.g., $30 → $60) |
| Participants | Total registered count |
| Prize pool | Real prizes + Demo prizes with medal emojis (🥇🥈🥉) |

**Team-only challenges:** Values are blurred, shows "BirrForex Team Only" badge

**On click:** Redirects to `/login?challenge={id}`

---

## Page 3: Challenge Dashboard (`/challenge/[id]`) — THE MAIN PAGE

### Dashboard States

| State | When | What shows |
|-------|------|-----------|
| Auth Gate | Not logged in | Sign In button + Register via Telegram link |
| Not Started | Challenge status = draft/registration_open | Registration confirmation (nickname, account#, type, server) + start date countdown |
| Active | Challenge status = active | Full trading dashboard (below) |
| Completed | Challenge status = completed/submission_open/reviewing | Final rank, profit, balance, total trades |

---

### Active Dashboard — Top Stats Cards (4 cards)

| Card | Metric | What it reveals | Interaction |
|------|--------|----------------|-------------|
| 🏆 Rank | `#X of Y` | User's current position among all participants in their category | Clickable → opens leaderboard modal |
| 📈 Profit | Qualified profit | Net profit after flagged trade profits are removed. Sub-text shows gross profit | Color: green if positive, red if negative |
| 🎯 Balance | Current balance | Live MT5 balance from last pull. Sub-text shows target balance | Shows ¢ for cent accounts |
| ⏰ Time Left | Days remaining | Days until challenge end date | — |

---

### Progress Bar

- Visual bar from starting balance → target balance
- Shows percentage completion
- Only appears when user has trades AND is not blown/DQ'd
- If no trades: shows "Deposit and start trading to track progress"

---

### Mini Stats Row (6 items)

| Stat | What it reveals |
|------|----------------|
| Trades | Total closed trades count |
| Qualified | Trades that passed all rules |
| Removed | Dollar amount of profit removed from flagged trades |
| Flagged | Count of trades that violated rules (clickable → violations modal) |
| Gross | Total profit before any removals |
| Net | Qualified profit (gross minus removed) |

---

### Tab 1: Trades

**Table columns:** Date, Symbol, Type (Buy/Sell badge), Profit, Volume, Status (✓ or 🚩)

**What each trade row reveals:**
- When it closed (EAT timezone)
- What instrument was traded
- Direction (buy/sell)
- Net profit/loss (green/red)
- Lot size
- Whether it passed rules or was flagged

**On tap → Trade Detail Modal:**
| Field | What it shows |
|-------|--------------|
| Ticket | MT5 position ID |
| Opened/Closed | Timestamps in EAT |
| Volume | Lot size |
| Entry/Exit | Open and close prices |
| Commission | Trading commission |
| Swap | Overnight swap charges |
| Net P/L | Final profit/loss |
| Status | Qualified (green) or Flagged (red) with violation reason |

**Footer:** "Data from: HH:00 – HH:00 EAT • Next update: HH:00 EAT"

---

### Tab 2: Leaderboard

**Each entry shows:**
- Rank number (gold/silver/bronze for top 3)
- Nickname
- Trade count + qualified count + account type
- Adjusted balance
- "YOU" badge for current user
- "DQ" badge for disqualified users
- "💀" for blown accounts

**On tap → User Detail View:**
| Metric | What it reveals |
|--------|----------------|
| Rank | Position in leaderboard |
| Trades / Qualified / Flagged | Trade breakdown |
| Qualified Profit | Net profit after removals |
| Gross Profit | Total profit before removals |
| Profit Removed | How much was taken away |
| Account Type | demo or real |
| Recent Trades | Last 5 trades (symbol, type, date, profit, volume) |
| DQ Reason | If disqualified, shows why |

**Pagination:** Load More button (50 per page)

---

### Tab 3: Flagged (Violations)

**Each violation card shows:**
- Symbol + Type badge + Date
- Violation reason (e.g., "SL risk $10.00 exceeds max $5")
- Lot size
- Profit removed amount

**If no violations:** Shows green shield "No violations! All your trades follow the rules"

**Header note:** "Profits from flagged trades are removed. Losses still count."

---

### Modals

| Modal | Trigger | Content |
|-------|---------|---------|
| Rules | "Rules" button in header | List of all challenge rules + penalty explanation |
| Trade Detail | Tap any trade row | Full trade info (ticket, prices, times, P/L, status) |
| Leaderboard | Tap rank card or leaderboard tab user | Full leaderboard + user drill-down |
| Violations | Tap "Flagged" mini stat | All flagged trades with reasons |

---

### Special Banners

| Banner | When it appears | What it shows |
|--------|----------------|---------------|
| Password Update Required | `pullStatus === "password_changed"` | Input field to enter new investor password. 24h deadline warning. |
| Disqualified | `disqualified === true` | DQ reason + "You can still view data and leaderboard" (dismissable) |
| Blown Account | Balance ≤ 0 AND has trades | "Your account balance reached $0" (dismissable) |
| No Data | 0 trades AND challenge active | "No trade data yet. Next sync: HH:00 EAT" |

---

## API Endpoints Called by Frontend

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/login` | POST | No | Authenticate with account_number + investor_password |
| `/api/challenges` | GET | No | List all challenges (for challenges page + team-only check) |
| `/api/me/dashboard` | GET | Bearer token | User's stats + challenge info + recent trades |
| `/api/challenges/{id}/leaderboard` | GET | No | Paginated leaderboard (params: limit, offset, category) |
| `/api/challenges/{id}/rules` | GET | No | Challenge rules for display |
| `/api/challenges/{id}/user-trades` | GET | No | Other user's recent trades (leaderboard drill-down) |
| `/api/me/update-password` | POST | Bearer token | Submit new investor password |

---

## Data Types (What the API Returns)

### `/api/me/dashboard` response:
```
{
  challenge: { id, title, status, startDate, endDate, startingBalance, targetBalance },
  me: {
    nickname, accountNumber, accountType, server,
    rank, currentBalance, adjustedBalance,
    qualifiedProfit, grossProfit, profitRemoved,
    totalTrades, qualifiedTrades, flaggedTrades,
    isQualified, lastUpdated, pullStatus,
    disqualified, disqualifiedReason, isCent
  },
  recentTrades: [{ ticket, symbol, type, volume, openPrice, closePrice, openTime, closeTime, profit, commission, swap, isQualified, violations[] }]
}
```

### Leaderboard entry:
```
{
  nickname, accountType, rank,
  currentBalance, adjustedBalance,
  qualifiedProfit, grossProfit, profitRemoved,
  totalTrades, qualifiedTrades, flaggedTrades,
  isQualified, isDisqualified, disqualifyReason,
  isBlown, isCent, lastTradeTime, lastUpdated
}
```

---

## Cent Account Handling

- Uses `isCent` flag from API (not heuristic)
- Cent accounts: values displayed with `¢` suffix (e.g., `1500.00¢`)
- Standard accounts: values displayed with `$` prefix (e.g., `$15.00`)
- Leaderboard shows each user's values in their own currency

---

## Data Freshness

- Pull schedule: Every 4 hours (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 EAT)
- Dashboard footer shows: "Data from: HH:00 – HH:00 EAT • Next update: HH:00 EAT"
- Staging → Live flush happens at start of each cycle
- Client sees data from the PREVIOUS cycle (not real-time)

---

## Current Limitations / Known Issues

1. **No real-time updates** — Data only refreshes on page load or manual refresh. No WebSocket/polling.
2. **No trade history pagination** — All recent trades loaded at once (could be slow for 100+ trades).
3. **Leaderboard shows only user's category** — No toggle to view other category (demo vs real).
4. **No chart/graph** — Balance over time not visualized.
5. **No notification system** — User doesn't know when new data arrives without refreshing.
6. **Password update banner** — No countdown timer showing remaining hours.
7. **No export** — User can't download their trade history.
8. **Cent display** — Some places may still show `$` instead of `¢` for cent users (legacy).
9. **No "last updated" timestamp** — User can't see exactly when their data was last synced.
10. **Leaderboard user detail** — Only shows last 5 trades, no pagination for more.


---

## IMPROVEMENTS TO IMPLEMENT

---

### Improvement 1: Rules-First Experience

#### Before Challenge Starts (ALL logins — first or returning)

When user signs in and challenge status is `registration_open` or `draft`:

- Render the full active dashboard layout in the background with **blur + dark overlay** (gives user a preview of what the dashboard will look like)
- On top of the blurred background, show a centered overlay card:
  ```
  ⏳ Challenge Hasn't Started Yet

  "{Challenge Title}" starts on {start date}.

  See the rules and be familiar before the challenge starts.

  [📋 See Rules]
  ```
- "See Rules" button opens the rules modal (same one from the header)
- This overlay is NOT dismissable — it always shows until challenge status changes to `active`
- Set `localStorage` key: `rules_seen_{challengeId} = true` (marks that user has visited the dashboard)

#### First Login After Challenge Started (user never signed in before)

When user signs in, challenge is `active`, AND `localStorage` does NOT have `rules_seen_{challengeId}`:

- Show a popup/modal before the dashboard loads:
  ```
  📋 Before You Start

  Read the challenge rules carefully.
  Trades that violate rules will have their profits removed.

  [📋 See Rules]    [✓ I've Read the Rules]
  ```
- "See Rules" opens the rules modal
- "I've Read the Rules" dismisses the popup and shows the dashboard
- Set `localStorage` key: `rules_seen_{challengeId} = true`

#### Returning Login After Challenge Started (already seen rules)

If `localStorage` has `rules_seen_{challengeId} = true`:
- Go straight to dashboard — no popup, no overlay

#### Logic Summary:

```
if (challenge not started) {
  → Show blurred dashboard + "not started" overlay (always)
  → Set rules_seen_{challengeId} = true on visit
}
else if (challenge active AND !rules_seen_{challengeId}) {
  → Show rules popup (first-time user who never visited before start)
  → On dismiss: set rules_seen_{challengeId} = true, show dashboard
}
else {
  → Show dashboard normally
}
```

---

### Improvement 2: Leaderboard User Detail — Full Trade View

When user taps a person in the leaderboard:

**Current behavior:** Shows stats + last 5 trades (no pagination, no violation details)

**New behavior:**
- Show ALL trades for that user (paginated, load more button)
- Each trade row shows: Date, Symbol, Type, Volume, Profit, Status
- **Flagged trades:** Red background highlight + violation reason shown directly below the trade row (not hidden)
- **Qualified trades:** Normal styling with green checkmark
- Trades sorted by close_time DESC (most recent first)
- Show trade count: "Showing X of Y trades" with Load More

**User detail layout:**
```
← Back to leaderboard

#3  TraderName
    Balance: $85.42

[Trades: 45] [Qualified: 38] [Flagged: 7]

Qualified Profit: $35.42    Gross Profit: $52.18
Profit Removed: $16.76      Account Type: Real

─── All Trades ───────────────────────────

Apr 29 | XAUUSDm | Sell | 0.02 | +$40.00 ✓
Apr 29 | XAUUSDm | Sell | 0.02 | -$5.00  ✓
Apr 29 | XAUUSDm | Buy  | 0.02 | +$22.74 🚩
  ⚠️ Profit after daily drawdown breach
Apr 28 | XAUUSDm | Sell | 0.02 | -$8.09  🚩
  ⚠️ No stop loss set
...

[Load More (showing 20 of 45)]
```

---

### Improvement 3: Flagged Trades — Visible Red Highlight Everywhere

Flagged trades must be visually distinct with violation reason visible WITHOUT tapping, in ALL places they appear:

#### In Trades Tab (user's own trades):
- Flagged row: Red-tinted background (`bg-loss/5`), red left border
- Below the trade row: violation reason text in red, visible immediately (no tap needed)
- Example:
  ```
  Apr 28 | XAUUSDm | Sell | 0.02 | -$8.09  🚩
  ⚠️ No stop loss set
  ```

#### In Leaderboard User Detail (other user's trades):
- Same treatment — red highlight + reason visible inline

#### In Trade Detail Modal:
- If flagged: red border on modal, violation reason prominently displayed at top
- Show which specific rule was violated and the exact values (e.g., "SL risk $10.00 exceeds max $5.00")

#### In Violations Tab:
- Already shows violations — keep as-is but ensure consistency with the new inline style

---

### Implementation Notes

- **localStorage key format:** `rules_seen_{challengeId}` (e.g., `rules_seen_15`)
- **Blurred dashboard for pre-start:** Use the same dashboard layout with placeholder/zero values, apply `blur-md` + dark overlay
- **API for user trades:** Already exists at `/api/challenges/{id}/user-trades?nickname={name}` — needs pagination support (add `limit` and `offset` params)
- **Flagged trade inline reason:** The `violations[]` array is already returned in trade data — just render it visibly instead of hiding behind a tap
