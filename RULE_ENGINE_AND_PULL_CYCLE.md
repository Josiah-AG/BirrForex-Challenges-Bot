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
- "Full Pull + Evaluate + Rank" button (admin, resets last_pull_at, full history)

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
  "from_date": "2026-05-25T00:00:00Z"
}
```
- `from_date`: If provided, only pulls deals/orders after this time (incremental). If NULL, pulls entire history.

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
1. VPS calls `mt5.history_deals_get(from_date, now)` — gets all deals
2. VPS calls `mt5.history_orders_get(from_date, now)` — gets all orders (for SL, TP, open_time)
3. For each deal with `entry == 1` (close entry) and `symbol` present → creates a trade
4. Matches `open_time`, `open_price`, `stop_loss`, `take_profit` from orders by `position_id`
5. Fallback: if orders don't have data, matches from entry==0 deals

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

**4. Stop Loss Required**
```
if !trade.stop_loss || trade.stop_loss == 0 → FLAG "No stop loss set"
```

**5. Max SL Risk (dollar amount)**
Uses ratio method:
```
slDistance = |entry_price - sl_price|
closeDistance = |entry_price - close_price|
if closeDistance > 0:
    slRisk = |actual_profit| × (slDistance / closeDistance)
else:
    slRisk = pip-based calculation (fallback)

tolerance = rules.max_risk > 50 ? 20 : 0.5  // 20¢ for cent, $0.50 for standard
if slRisk > rules.max_risk + tolerance → FLAG
```

**6. Fake SL Detection (Candle-based verification)**

Checks if price actually crossed the SL level during the trade's open period. If it did but the trade wasn't closed by SL, the SL was "fake" (set after the fact or moved).

**Adaptive Timeframe Selection (based on hold duration):**

| Hold Duration | Timeframe | Reason |
|---|---|---|
| < 20 min | M1 | Short trade, need precision |
| 20 min – 1 hr | M5 | ~12 candles max |
| 1 hr – 6 hr | M15 | ~24 candles max |
| 6 hr – 24 hr | H1 | ~24 candles max |
| > 24 hr (if max_hold_hours allows) | H4 | Keeps data small |
| > 24 hr (if max_hold_hours does NOT allow) | SKIP | Trade already flagged for hold time violation |

**Candle Exclusion Rule:**
- **EXCLUDE the first candle** (where trade opened) — high/low may have been printed before trade was actually opened
- **EXCLUDE the last candle** (where trade closed) — high/low may have been printed after trade was already closed
- **Only check candles FULLY within the trade period** — candles that started AFTER trade opened AND ended BEFORE trade closed

**Logic:**
```
holdMinutes = (close_time - open_time) / 60000

// Select timeframe
if holdMinutes < 20: timeframe = "M1"
elif holdMinutes < 60: timeframe = "M5"
elif holdMinutes < 360: timeframe = "M15"
elif holdMinutes < 1440: timeframe = "H1"
elif max_hold_hours allows > 24h: timeframe = "H4"
else: SKIP (already flagged for hold time)

// Fetch candles
candles = fetchCandles(symbol, timeframe, open_time, close_time)

// Filter: exclude first and last candle
// First candle = the one whose time <= open_time
// Last candle = the one whose time + period > close_time
safeCandles = candles where:
  candle.time > open_time  (started AFTER trade opened)
  AND candle.time + candlePeriod <= close_time  (ended BEFORE trade closed)

// Check each safe candle
for candle in safeCandles:
  if trade is BUY:
    if candle.low <= SL → FLAG "SL not active — price reached {low} below SL {sl}"
  if trade is SELL:
    if candle.high >= SL → FLAG "SL not active — price reached {high} above SL {sl}"
```

**Graceful degradation:** If VPS candles endpoint fails or returns empty → skip fake SL check for that trade (don't flag, don't block evaluation). BUT log the failure for admin visibility.

**Failed SL Check Reporting (Admin Pulls Tab):**

When fake SL detection fails for any trade, the system logs it to `wp_pull_errors` with `error_code = 'sl_check_failed'`. The admin Pulls tab shows a section:

```
⚠️ Fake SL Check Incomplete (3 accounts)

• Bella FX (161584947) — 5 trades unchecked — Candles timeout
• olanzo (161584905) — 2 trades unchecked — VPS unavailable
• CR7 (161584935) — 1 trade unchecked — Symbol not found

[🔄 Retry SL Check]
```

The "Retry SL Check" button re-runs ONLY the fake SL detection for the listed accounts (fetches candles and re-evaluates those specific trades). It does NOT re-pull trade data — just the candle verification step.

**Data stored for retry:**
- `wp_pull_errors` table: `error_code = 'sl_check_failed'`, `registration_id`, `error_message` = JSON with trade tickets that failed

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
