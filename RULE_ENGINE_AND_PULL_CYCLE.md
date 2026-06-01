# Rule Engine & Pull Cycle Specification

---

## PULL CYCLE OVERVIEW

### Schedule
Pulls run 6 times per day at: **00:00, 04:00, 08:00, 12:00, 16:00, 20:00 EAT**
Cron (UTC): `0 21,1,5,9,13,17 * * *`

### Architecture
```
Railway (Node.js) → VPS Router (port 8000) → Workers (ports 8001-8010)
                                                    ↓
                                              MT5 Terminals (1-10)
```

### Pull Cycle Flow:
1. **Flush previous staging → live** (leaderboard update from last cycle)
2. **Build shared queue** of all accounts to pull (failed-first priority)
3. **Workers pull in parallel** (10 terminals, work-stealing pattern)
4. **Per-account evaluation** immediately after each successful pull
5. **Retry failures** (up to 2 passes, 30s between)
6. **Results saved to staging** (not live — flushed at start of NEXT cycle)

### What triggers a pull:
- Scheduled cron (automatic, 6x daily)
- "Force Pull Now" button (admin, incremental)
- "Pull + Update Rankings" button (admin, incremental + flush + rank)
- "Full Pull + Evaluate + Rank" button (admin, resets last_pull_at, full history, works on ANY challenge status)

### Incremental Pull Strategy:
- **First pull** (last_pull_at is NULL): full pull from challenge start date
- **Subsequent pulls**: only last 5 hours (4h window + 1h confidence overlap)
- **Orders**: always fetched from challenge start (lightweight, provides open_time/open_price/SL/TP)
- **After challenge ends**: 2 final FULL pulls (from challenge start), then stops
- **UPSERT**: trades saved with ON CONFLICT DO UPDATE (no data loss, duplicates handled)

### History Sync:
After account login, the worker polls `history_deals_get` until the count stabilizes (two consecutive calls return same count). This ensures the terminal has finished downloading history from the broker before reading it.

---

## VPS PULL RESPONSE

### Endpoint: `POST http://108.181.184.223:8000/pull`

### Request:
```json
{
  "account": "161584935",
  "server": "Exness-MT5Real21",
  "password": "Pass@123",
  "api_key": "wp-k8x2m9f4v7j3n6q1w5t8r2y4u7i0p3",
  "terminal_id": 1,
  "from_date": "2026-05-29T05:00:00Z",
  "orders_from_date": "2026-05-25T00:00:00Z"
}
```
- `from_date`: Deals window (incremental — last 5h, or challenge start for first/final pulls)
- `orders_from_date`: Orders window (always challenge start — provides open_time/open_price/SL for all positions)

### Response:
```json
{
  "success": true,
  "message": "Pulled 5 trades, 12 deals",
  "balance": 985.50,
  "equity": 985.50,
  "trades": [...],
  "deals": [...],
  "terminal_id": 1
}
```

### Trade Object (each closed trade):
```json
{
  "ticket": 2764705092,
  "symbol": "EURUSDm",
  "type": "Sell",
  "volume": 0.01,
  "open_time": "2026-05-25T06:30:00+00:00",
  "close_time": "2026-05-25T07:15:00+00:00",
  "open_price": 1.08542,
  "close_price": 1.08510,
  "stop_loss": 1.08700,
  "take_profit": 1.08400,
  "profit": 0.32,
  "commission": -0.07,
  "swap": 0.00,
  "comment": ""
}
```

### Deal Object (raw MT5 deal — includes deposits, withdrawals, trade entries/exits):
```json
{
  "ticket": 987654321,
  "order": 123456789,
  "time": "2026-05-25T07:15:00+00:00",
  "type": 1,
  "entry": 1,
  "symbol": "EURUSDm",
  "volume": 0.01,
  "price": 1.08510,
  "profit": 0.32,
  "commission": -0.07,
  "swap": 0.00,
  "fee": 0,
  "comment": "",
  "position_id": 2764705092
}
```

### How trades are constructed:
1. VPS calls `mt5.history_deals_get(from_date, now)` — gets deals (polls until count stabilizes)
2. VPS calls `mt5.history_orders_get(orders_from_date, now)` — gets orders for SL/TP/open_time
3. For each deal with `entry == 1` (close) and `symbol` present → creates a trade
4. Each closing deal = its own trade (unique ticket per partial close)
5. Trade direction from the OPENING deal's type (not closing deal — which is inverted)
6. SL/TP resolution (in priority order):
   - Opening order's SL/TP (set at entry time)
   - Closing order's SL/TP (if triggered by SL/TP)
   - `deal.sl`/`deal.tp` fields (MT5 build 4150+, broker-dependent)
7. Open_time/open_price from orders, fallback to opening deal

---

## DATA SAVED TO DATABASE

### `wp_trades` table (one row per closed trade):
| Column | Source |
|--------|--------|
| challenge_id | From registration |
| registration_id | From registration |
| account_number | From registration |
| ticket | trade.ticket (position_id) |
| symbol | trade.symbol |
| trade_type | trade.type (Buy/Sell) |
| volume | trade.volume |
| open_time | trade.open_time |
| close_time | trade.close_time |
| open_price | trade.open_price |
| close_price | trade.close_price |
| stop_loss | trade.stop_loss |
| take_profit | trade.take_profit |
| profit | trade.profit |
| commission | trade.commission |
| swap | trade.swap |
| comment | trade.comment |
| is_qualified | Set by evaluation (true/false) |
| violations | Set by evaluation (JSON array of violation strings) |

### `wp_deals` table (one row per raw deal):
| Column | Source |
|--------|--------|
| challenge_id | From registration |
| registration_id | From registration |
| account_number | From registration |
| ticket | deal.ticket |
| deal_type | deal.type (0=buy, 1=sell, 2=balance, etc.) |
| symbol | deal.symbol |
| direction | deal.entry (0=in, 1=out) |
| volume | deal.volume |
| price | deal.price |
| profit | deal.profit |
| balance | Not stored separately |
| comment | deal.comment |
| time | deal.time |

---

## RULE ENGINE EVALUATION

### When it runs:
- Immediately after each successful account pull (per-account, streaming)
- Results written to `wp_leaderboard_staging` (not live)

### Evaluation Steps (per account):

#### Step 1: Load rules
```sql
SELECT parameters FROM wp_challenge_rules WHERE challenge_id = X AND rule_code = 'config'
```
Returns: `{ max_lot_size, max_open_trades, pair_limit, stop_loss_required, max_risk_dollars, daily_loss_cap, max_hold_hours, weekend_trading, min_active_days, only_cent_account }`

#### Step 2: Determine effective rules (cent conversion)
- If user is cent AND challenge is NOT "Real + cent-only": multiply ×100 for lot_size, risk_dollars, daily_loss_cap
- Otherwise: use rules as-is

#### Step 3: Load trades within challenge period
```sql
SELECT * FROM wp_trades
WHERE challenge_id = X AND registration_id = Y
  AND close_time >= (challenge_start - 3 hours)  -- grace window
  AND close_time <= challenge_end
ORDER BY open_time ASC
```

#### Step 4: Deposit detection
- Query `wp_deals` for balance deposits
- First deposit → set `actual_starting_balance`
- Second deposit → DQ

#### Step 5: Evaluate each trade against rules

For each trade:

**1. Max Lot Size**
```
if trade.volume > rules.max_lot_size → FLAG
```

**2. Max Open Trades (simultaneous)**
Pre-compute using time events (open/close times of all trades):
- Build timeline of opens and closes
- At any point if open count > max_open_trades → flag ALL trades that were part of the violation

**3. Pair Limit (same symbol simultaneous)**
Same as above but per-symbol.

**4. Stop Loss Required — Two-Layer Detection**

**Layer 1: SL at Entry Check**
```
if opening_order.sl == 0 → FLAG "No SL set (SL not detected on entry)"
```
The opening order's SL field reliably shows whether SL was placed when the trade was opened. If SL=0, the user opened without SL — violation.

**Layer 2: SL Violation Candle Check (runs on ALL trades)**
Even if SL was set at entry, the user might remove or widen it after. This check verifies that price never exceeded the max allowed risk level during the trade.

```
maxSlPrice = entry_price ± (max_risk / (volume × contractSize))
  // For BUY: maxSlPrice = entry - priceMove (below entry)
  // For SELL: maxSlPrice = entry + priceMove (above entry)

// Fetch candles during trade period (adaptive timeframe)
// Exclude first and last candle
for each safe candle:
  if BUY and candle.low <= maxSlPrice → FLAG
  if SELL and candle.high >= maxSlPrice → FLAG
```

**Flag message:**
`"SL violated. Price exceeded the maximum allowed risk (¢500, SL should be @ 4791.958) on the H1 candle formed at 13:00 EAT. Trade should have been closed at that point"`

**When candle check fails (VPS timeout, symbol not found):**
- Log to `wp_pull_errors` with `error_code = 'sl_check_failed'`
- Fall back to Layer 1 check only (SL presence on opening order)

**Note on SL data from VPS:**
- The VPS captures SL from the **opening order** — this is the SL set at entry time
- If user modifies SL after opening, MT5 does NOT store this in order history
- The candle check is the only way to detect removed/widened SL after opening
- This applies equally to ALL users — fair enforcement

**7. Daily Loss Cap**
Track running balance per day:
```
For each day:
  dayOpenBalance = running balance at start of day
  For each trade that day:
    runningBalance += trade net profit
    drawdown = dayOpenBalance - runningBalance
    if drawdown >= daily_loss_cap:
      → All PROFITABLE trades after this point today are FLAGGED
```

**8. Max Hold Hours**
```
if open_time is valid (after year 2000):
    holdHours = (close_time - open_time) / 3600000
    if holdHours > rules.max_hold_hours → FLAG
```

**9. Weekend Trading**
```
if open_time or close_time falls on:
  - Saturday (any time)
  - Sunday before 22:00 UTC
  - Friday after 22:00 UTC
→ FLAG
```

#### Step 6: Calculate results

```
grossProfit = sum of all trade net profits (profit + commission + swap)
profitRemoved = sum of profits from FLAGGED trades (only positive ones)
qualifiedProfit = grossProfit - profitRemoved
adjustedBalance = actualStartingBalance + qualifiedProfit
currentBalance = actualStartingBalance + grossProfit
```

#### Step 7: Write to staging
```sql
INSERT INTO wp_leaderboard_staging (...)
ON CONFLICT (challenge_id, registration_id) DO UPDATE SET ...
```

---

## STAGING → LIVE FLUSH

Happens at the START of each new pull cycle:
1. Copy all rows from `wp_leaderboard_staging` → `wp_leaderboard` (upsert)
2. Clear staging table
3. Run `ensureAllParticipantsHaveEntries()` — adds leaderboard rows for registered users without one
4. Run `updateRankings()` — assigns rank numbers

---

## RANKING ALGORITHM

### Tier 1: Balance > 0 (active, not DQ)
Sorted by: `adjusted_balance DESC`, `total_trades DESC`, `last_trade_time ASC`

### Tier 2: Blown (balance ≤ 0, not DQ)
Sorted by: `zero_balance_at DESC` (most recently blown = higher rank)

### Tier 3: Disqualified
Sorted by: `disqualified_at DESC` (most recently DQ'd = higher rank)

---

## CANDLES ENDPOINT (for Fake SL Detection)

### Endpoint: `POST http://108.181.184.223:8000/api/v1/candles`

### Request:
```json
{
  "symbol": "EURUSDm",
  "timeframe": "M1",
  "from_time": "2026-05-25T06:30:00+00:00",
  "to_time": "2026-05-25T07:15:00+00:00",
  "api_key": "wp-k8x2m9f4v7j3n6q1w5t8r2y4u7i0p3"
}
```

### Response:
```json
{
  "success": true,
  "candles": [
    {
      "time": "2026-05-25T06:30:00+00:00",
      "open": 1.08542,
      "high": 1.08560,
      "low": 1.08520,
      "close": 1.08535,
      "volume": 150
    },
    ...
  ],
  "count": 45
}
```

---

## AUTO-DISQUALIFICATION

### Active Trading Days Check (runs every pull cycle)
```
remaining_trading_days = count weekdays from now to challenge_end
if (user.active_days + remaining_trading_days) < min_active_days:
    → DQ "Active trading day requirement not fulfilled (X days traded, Y left, need Z)"
```
This runs for ALL non-DQ'd users every cycle — including those with 0 trades who are excluded from pulls.

### Password Changed (48h deadline)
If VPS returns credential error → notify user → 48h to update → auto-DQ if not updated.

### Second Deposit (Recharging)
Detected from `wp_deals` balance entries. First deposit = starting balance. Second = DQ.

---

## PENALTY SYSTEM

- **Flagged trade with profit > 0:** Profit is REMOVED from qualified balance
- **Flagged trade with loss:** Loss STILL COUNTS (not removed)
- **Result:** User's adjusted_balance is always ≤ current_balance
- **DQ triggers:** Second deposit (recharging), admin manual DQ

---

## WEEKEND LOGIC

- Saturday: no pulls (except 06:00 EAT sync check)
- Sunday: no pulls until market opens (22:00 UTC Sunday)
- If `weekend_trading` rule is ON: pulls run normally on weekends
- Saturday 06:00 EAT pull = "final sync" → immediate leaderboard update (no staging wait)
