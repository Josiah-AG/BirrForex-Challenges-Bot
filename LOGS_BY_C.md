# LOGS BY C
### Change Log — BirrForex Challenges Bot
> Every change made by Claude is documented here in full detail.
> Developers and AI agents: read this file before making changes to understand what was done, why, and how.

---

## FORMAT

Each entry follows this structure:
- **Date** — when the change was made
- **Commit** — git commit hash
- **Files changed** — which files were touched
- **Problem** — what was wrong or missing
- **Solution** — what was done and how
- **Business rule** — the rule or logic behind the decision
- **Watch out** — anything future developers should be careful about

---

---

## SESSION — June 4, 2026

---

### CHANGE 1 — Fix duplicate `orders_by_position` block in VPS worker
**Commit:** `7064f23`
**File:** `vps/worker.py`

**Problem:**
In `do_pull()`, the `orders_by_position` dictionary was built twice. The second block started with `orders_by_position = {}` which completely reset the dictionary, throwing away all the work the first loop did. The intent of the first loop was to iterate all orders for a position and update the SL/TP if a later "modify" order had a non-zero SL (catching SL added after trade was opened). Because of the reset, this never worked.

**Solution:**
Removed the duplicate block (lines 437–457 in the original file). The single remaining loop correctly:
1. On first order for a `position_id` → stores `sl`, `tp`, `open_time`, `open_price`
2. On later orders for same `position_id` → updates `sl`/`tp` only if non-zero (catches SL modifications)

**Business rule:**
When a trader opens a trade at market without SL, then adds SL later via MT5 modify, MT5 can create a modification order in order history. This modification order has the same `position_id` and carries the new SL. The worker needs to pick up this modified SL.

**Watch out:**
Exness does not always create modify orders in `history_orders_get()` for SL changes — this is broker-dependent. The fix helps when modify orders exist, but for many trades the SL still won't appear in order history. The broker comment `[sl price]` is the fallback confirmation that SL existed (see evaluation engine notes).

---

### CHANGE 2 — Rewrite deposit detection & recharging DQ logic
**Commit:** `7064f23`
**File:** `src/services/wpEvaluationEngine.ts` — `evaluateAccount()` method, deposit detection block

**Problem:**
The old logic treated all deposits the same regardless of timing. It took the first deposit in `wp_deals` as `actualStartBalance` and DQ'd on a second deposit. It had no awareness of the challenge start date — a deposit made 3 days before challenge start was treated the same as one made the day after. This caused:
- Pre-challenge deposits being mistakenly counted as recharging
- `actualStartBalance` being set to a single deposit amount even when the user had built up balance before the challenge from multiple deposits
- No check for balance exceeding the allowed starting limit

**Solution:**
Complete rewrite of the deposit detection block. New logic:

```
1. Fetch ALL balance deposits for this registration from wp_deals, ordered by time ASC
2. Split into preDeposits (time < challenge_start) and postDeposits (time >= challenge_start)
3. tolerance = startingBalance × 1% (same as registration check)

IF regBalance > 0 (user had money before challenge):
  actualStartBalance = regBalance + sum(preDeposits)
  Save to DB
  IF actualStartBalance > startingBalance + tolerance → DQ "Starting balance exceeds allowed"
  IF postDeposits.length > 0 → DQ "Account recharged — deposit after challenge start"

IF regBalance == 0 (user registered with nothing):
  IF postDeposits.length == 0 → actualStartBalance = 0 (hasn't deposited yet, keep pulling)
  IF postDeposits.length == 1 → actualStartBalance = first deposit amount
    IF amount > startingBalance + tolerance → DQ "Starting balance exceeds allowed"
  IF postDeposits.length > 1 → actualStartBalance = first deposit, DQ on second
```

**Business rules:**
- Pre-challenge deposits are always allowed — user can deposit multiple times before start
- `actualStartBalance` = the balance the user has at the moment the challenge starts
- Any deposit AFTER challenge start with pre-existing balance = recharging = DQ immediately
- Users who registered with $0 get one deposit after start (their actual starting point); second deposit = DQ
- If deposit exceeds the allowed starting balance (even before challenge) = DQ

**Cent account handling:**
`regBalance` (from `registration_balance`) and `wp_deals.profit` are raw VPS values — cents for USC accounts (e.g. `1000` = 1000¢). The `startingBalance` parameter passed into `evaluateAccount()` is already ×100 for cent users (conversion happens in `evaluate()` and `evaluateSingleAccount()` before calling `evaluateAccount()`). So all comparisons are in the same units — no extra conversion needed inside this block.

**Watch out:**
The `preDeposits` from `wp_deals` only covers deposits within the pull window (challenge_start - 1 hour onwards). Deposits made before that window won't appear in `wp_deals`. `regBalance` is the snapshot at registration time. Together they cover: registration balance + any top-ups in the hour before challenge start. Deposits between registration and the 1-hour window are captured in `regBalance` itself (since `regBalance` is a live VPS snapshot at registration time, it already reflects all prior deposits).

---

### CHANGE 3 — Overhaul SL detection logic in evaluation engine
**Commit:** `bcd976f`
**File:** `src/services/wpEvaluationEngine.ts`

**Problem:**
The old SL check logic had several issues:
1. Ran candle check on ALL trades regardless of whether SL was set at entry
2. If candle check passed but `stop_loss == 0`, still flagged the trade — false positive
3. Used a flat `$0.50` tolerance for all accounts regardless of max_risk value
4. `calculateMaxSlPrice()` used a hardcoded pip/contract formula which was wrong for non-USD quoted pairs (USDJPY, XAUUSD on cent accounts, etc.)
5. Candle check ran on losing trades where there's no cheating benefit
6. Inconsistent tolerance between Layer A (SL risk check) and Layer B (candle check)

**Solution:**

**New flow:**
```
if stop_loss_required:

  Step 1 — SL presence (immediate, no candle check)
    if stop_loss == 0:
      → FLAG "No stop loss set on entry"
      → STOP — skip Steps 2 and 3

  Step 2 — SL risk check / Layer A (stop_loss != 0)
    effectiveMaxRisk = maxRiskDollars × 1.10  ← 10% tolerance, internal only
    slRisk = calculateSlDollars() using ratio method
    if slRisk > effectiveMaxRisk:
      → FLAG "SL risk $X exceeds max $Y"  ← message shows raw admin-set value

  Step 3 — Fake SL candle check / Layer B (stop_loss != 0 AND tradeNet > 0 only)
    effectiveMaxRisk = maxRiskDollars × 1.10
    maxSlPrice = calculateMaxSlPrice() using ratio method
    fetch candles (adaptive timeframe), exclude first + last candle
    if candle breached maxSlPrice:
      → FLAG "SL violated. Price exceeded the maximum allowed risk ($X, SL should be @ Y.YYYYY) on the TF candle formed at HH:MM EAT. Trade should have been closed at that point"
```

**`calculateMaxSlPrice()` — ratio method:**
Old: `priceMove = maxRiskDollars / (volume × contractSize)` — only accurate for USD-quoted pairs.

New: uses the trade's own profit and price movement to derive the conversion:
```
priceMove_for_maxRisk = |close - open| × (maxRiskDollars / |tradeNet|)
maxSlPrice = open ± priceMove_for_maxRisk
```
This works because MT5's `profit` field is already in account currency (USD or USC), regardless of the pair's quote currency. The ratio encodes whatever conversion rate applied during the trade. Fallback to pip-based formula when `closeDistance` or `tradeNet` is near zero.

**10% tolerance — internal only:**
The check fires at `maxRiskDollars × 1.10` but all violation messages show the raw admin-set `maxRiskDollars`. The tolerance absorbs spread, slippage, and minor SL adjustments without changing what the user sees.

**Candle check only on winning trades:**
Fake SL cheat only benefits the user on winning trades (run without SL, price goes in your favour, you win). Losing trades already took their loss — no cheat benefit. Running candle check on losing trades would produce false positives (price naturally went past max SL level because that's why it's a loss).

**Candle check failure:**
If VPS candle endpoint fails (timeout, symbol not found), logs to `wp_pull_errors` with `error_code = 'sl_check_failed'` and gives benefit of doubt — no penalty. Does not auto-flag.

**Watch out:**
The ratio method requires `|tradeNet| > 0` and `|close - open| > 0`. Trades that close at exactly the entry price (profit = 0, price = 0) fall back to pip-based formula. The pip-based fallback is only accurate for standard USD-quoted forex pairs. For gold and JPY pairs with tiny movement, the fallback may be slightly off — acceptable since those edge cases rarely have a meaningful SL risk calculation anyway.

---

### CHANGE 4 — Fix all violation messages (¢/$ support, wording cleanup)
**Commit:** `bcd976f`
**File:** `src/services/wpEvaluationEngine.ts`

**Changes to each message:**

| Rule | Old message | New message |
|------|-------------|-------------|
| No SL | `No SL set (SL not detected on entry)` | `No stop loss set on entry` |
| SL risk | `SL risk $X exceeds max $Y` (always `$`) | `SL risk ¢X exceeds max ¢Y` for cent, `$` for standard |
| Lot size | `Lot size X exceeds max Y` | `Lot size X exceeds max Y lots` |
| Max open trades | `Exceeded N simultaneous trades` | `Exceeded max N simultaneous open trades (also open: ...)` |
| Pair limit | `Exceeded N simultaneous SYM trades` | `Exceeded max N simultaneous SYM trades (also open: ...)` |
| Daily drawdown | `Profit after daily $X drawdown breach` | `Profit after daily ¢X.XX drawdown breach` for cent, `.toFixed(2)` added |
| Fake SL | `SL violated. Price exceeded...` | Same format, kept — already detailed and specific |

---

### CHANGE 5 — Add co-offending trade IDs to simultaneous violation messages
**Commit:** `61d111f`
**File:** `src/services/wpEvaluationEngine.ts`

**Problem:**
Simultaneous violation messages only said "Exceeded max 4 simultaneous open trades" with no indication of WHICH other trades were open at the same time. Users couldn't cross-reference on the WinnerPip dashboard.

**Solution:**
Changed `maxOpenViolators` and `pairViolators` from `Set<number>` to `Map<number, coOffenders[]>`. The maps store, for each violating ticket, the list of other tickets that were simultaneously open during the violation window.

**Max open trades** — includes symbol in brackets since trades are from different pairs:
```
Exceeded max 4 simultaneous open trades (also open: #287750871 [XAUUSDc], #287813948 [EURUSDc])
```

**Pair limit** — no symbol needed since it's stated in the violation text already:
```
Exceeded max 2 simultaneous XAUUSDc trades (also open: #284735265, #320350275)
```

**How the map is built:**
Timeline events are walked in order. When `openSet.size > max_open_trades`, every ticket currently in the set is added to `maxOpenViolators` with a list of all OTHER tickets in the set as co-offenders. If a ticket gets added again (multiple violation windows), new co-offenders are merged in without duplicating existing ones.

**Watch out:**
Co-offenders include ALL trades open at the violation moment — both flagged and qualified trades. A qualified trade can appear as a co-offender in another trade's violation message. This is intentional and correct: it shows the full picture of what was open at that time.

---

### CHANGE 6 — Evaluation report: group simultaneous violations
**Commit:** `bcd976f`
**File:** `src/api/server.ts` — `GET /api/admin/:path/challenge/:id/user-evaluation` endpoint

**Problem:**
The evaluation report listed every flagged trade individually. Trades flagged for simultaneous violations were scattered through the list with no visual connection to each other, making it hard to see which trades formed the violation group.

**Solution:**
Report now has two sections:

**Section 1 — `🚩 FLAGGED TRADES`:**
- Trades with SL, lot size, drawdown, hold time, weekend violations listed individually as before
- Trades with simultaneous violation ONLY → removed from this section entirely
- Trades with simultaneous + other violations → show the other violations + `See simultaneous group below`

**Section 2 — `⚡ SIMULTANEOUS TRADE VIOLATIONS`:**
- One group block per distinct cluster of overlapping trades
- Group header: trade count, date, same-pair breach summary (e.g. `Same-pair: 3 EURUSDc, 2 GBPUSDc`)
- Each trade row: `#ticket | symbol | direction | volume | P&L | No SL` (if applicable)
- Groups sorted by earliest open time; trades within group sorted by open time
- Subset groups deduplicated: if all trades in Group A are also in Group B, Group A is dropped

**How groups are built:**
1. Fetch ALL trades for the registration (qualified + flagged) — needed for overlap context
2. For each simultaneous-violating ticket, find all other trades whose open/close periods overlap with it
3. Build a stable key from sorted ticket list; use as Map key to deduplicate identical overlap windows
4. Filter out subset groups
5. Groups that contain only one unique cluster are shown once

**Watch out:**
The regex pattern `SIMUL_PATTERNS` in the report builder must match the violation message format stored in `wp_trades.violations`. If the message format in the engine changes, update the regex in `server.ts` too. Current pattern:
```typescript
const SIMUL_PATTERNS = [
  /Exceeded max \d+ simultaneous open trades/,
  /Exceeded max \d+ simultaneous \S+ trades/
];
```

---

## SYSTEM ARCHITECTURE NOTES (for new agents)

### How evaluation flows end-to-end:
```
VPS Pull (vpsPullScheduler.ts)
  → pulls trades from MT5 via VPS HTTP API
  → saves to wp_trades + wp_deals tables
  → immediately calls evaluateSingleAccount() per account

evaluateSingleAccount() / evaluate() (wpEvaluationEngine.ts)
  → loads rules from wp_challenge_rules
  → applies cent conversion (×100) if user.is_cent AND challenge is NOT real+cent-only
  → deposit detection → actualStartBalance
  → pre-computes simultaneous violations (timeline walk)
  → per-trade rule checks → violations array → saved to wp_trades
  → writes result to wp_leaderboard_STAGING (not live)

Next pull cycle start:
  → flushes staging → wp_leaderboard (goes live)
  → ensureAllParticipants() + updateRankings()
```

### Cent account units:
- `registration_balance` — raw VPS value (1000 = 1000¢ for cent, 10 = $10 for standard)
- `wp_deals.profit` — raw VPS value (same units as account)
- `startingBalance` parameter in `evaluateAccount()` — already ×100 for cent users (converted before calling)
- All comparisons inside `evaluateAccount()` are in the same raw units — do not re-convert

### SL data availability from VPS:
- `stop_loss` field from `history_orders_get()` — only set if SL was placed at entry via a limit/stop order, or if a modify order is captured
- Broker comment `[sl PRICE]` — written by Exness when trade is CLOSED by hitting SL
- `positions_get()` — only available for currently OPEN positions
- For closed trades where SL was added after entry and never hit: SL is NOT recoverable from the API

### Violation message storage:
- Stored as JSON array in `wp_trades.violations` column
- e.g. `["No stop loss set on entry", "Held 26.5h exceeds max 24h"]`
- WinnerPip dashboard reads this directly and renders each string as a separate line
- Admin report reads this same column — no separate storage

---

*Last updated: June 4, 2026*
*Author: Claude (Sonnet 4.5)*
