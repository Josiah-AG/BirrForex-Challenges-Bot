# Pacer Accounts — Complete System Design

## Purpose

Prevent leaders from coasting. When a trader reaches the top of the leaderboard and feels safe, they stop trading (only placing instant-close trades to avoid inactivity disqualification). Pacer accounts create constant competitive pressure so **all traders push to their maximum potential until the end of the challenge**.

## What Are Pacers?

Pacer accounts are system-generated fake participants. They appear on the leaderboard as normal users — with realistic nicknames, trade histories, and balance progression. No real MT5 account exists. All data lives only in our database.

- Only the admin knows they are pacers (marked on admin leaderboard only)
- Clients see them as normal competitors on WinnerPip and the client dashboard
- When clicked, their trade history and profile look like any real participant
- They are excluded from submission and evaluation phases — they simply don't submit
- **Fully automated** — no manual intervention needed

---

## Scaling

| Participants | Number of Pacers |
|---|---|
| < 50 | 4 |
| 50 - 500 | 6 |
| > 500 | 8 |

The participant count is checked at challenge start. Pacers are created during registration phase.

For **hybrid challenges**: pacers exist in BOTH demo and real categories.

---

## Lifecycle

### Phase 1: Registration (Before Challenge Starts)

- Pacers are created during registration phase at **even hour intervals** (e.g., every 2 hours)
- They appear in the registration list as if they signed up normally
- Each pacer gets:
  - A random nickname from a **pool of 200 realistic nicknames**
  - A fake account number (large IDs: 9000000001, 9000000002...)
  - A fake server name (looks real, e.g., "Exness-MT5Real15")
  - The challenge starting balance
  - A fake Telegram user ID (large numbers: 9000000001+)
  - `is_pacer = true` flag (hidden from clients, visible to admin only)

### Phase 2: First 25% of Challenge Period — Mid-Range Positioning

- Pacers are **evenly distributed in the mid-range** of the leaderboard
- Their balance grows moderately — not top performers, not bottom
- Trade mix: **both winning and losing trades** (realistic distribution)
- Some pacers may still be at starting balance (haven't "traded" yet)
- **SL hits happen here** — 1-2 trades per pacer close at SL for realism
- This makes pacers look like average traders warming up

### Phase 3: Next 50% of Challenge Period (25%-75%) — Dynamic Swarm Pressure

This is the core competitive phase. Pacers act as a **swarm** — rotating around different real traders each cycle to pressure everyone in the money zone:

- **No fixed assignment** — each cycle, each active pacer randomly picks a real trader to target
- **They don't just chase #1** — they pressure #2, #3, #4, etc. Every real trader should feel someone breathing down their neck
- **Interchangeable overtaking**: On any given day, a pacer might:
  - Be just above their target (the real trader sees someone ahead)
  - Be just below (the real trader sees someone about to pass them)
  - Briefly overtake then fall back (creates urgency)
- **Different pacers rotate targets each cycle** — not the same pacer always threatening the same person. Sometimes 2 pacers cluster around the same trader, sometimes none.
- **SL hits continue** — some trades genuinely get stopped out. Price hits SL during the trade, trade closes at SL price. Realistic.
- **Some rule violations** — intentionally:
  - A pacer might get flagged for exceeding lot size once
  - A pacer might have a trade flagged for missing SL
  - This makes evaluation results look natural (perfect compliance = suspicious)

### Phase 4: Last 25% of Challenge Period (75%-100%) — Gradual Dropout

- Pacers **slightly drop down** in the leaderboard
- They don't blow up dramatically — they take more losses naturally
- **SL hits increase** — more trades hit stop loss as pacers "struggle"
- Some pacers take several consecutive losses
- Others go flat (stop trading, like a discouraged trader would)
- By the end, pacers are naturally below the real top performers
- This clears the prize positions for genuine winners
- **The drop is NOT sudden** — it happens over multiple days/pulls

### Phase 5: Submission & Evaluation

- Pacers do NOT submit
- They are excluded from winner selection automatically
- No special cleanup needed — they just look like participants who didn't submit
- Admin can see them marked as pacers in the admin dashboard

---

## Trade Generation — Constructed from OHLC Candle Data

Trades are **constructed from real market OHLC data** that the system already collects. This is superior because:

- Fully independent — no dependency on other users trading first
- No cold start problem — OHLC data exists from Day 1
- Zero duplicate risk — every trade is unique
- Guaranteed to pass verification — prices come from real candles
- Anyone checking "Was gold at $3325 at 14:31?" → Yes, provably
- SL placement is logical — always within candle boundaries

### How It Works

1. **Pick a symbol** — from the challenge's allowed instruments (XAUUSD, EURUSD, etc.)
2. **Pick a time window** — select recent closed candles from the OHLC data
3. **Choose entry candle** — set `open_time` to a random second within this candle's period
4. **Choose exit candle** — set `close_time` to a random second within a later candle's period
5. **Set open_price** — any price within the entry candle's High-Low range (verifiable)
6. **Set close_price** — any price within the exit candle's High-Low range (verifiable)
7. **Choose direction** — BUY or SELL based on whether this trade needs to win or lose
8. **Place SL** — at a logical level (details below for winning vs SL-hit trades)
9. **Calculate profit** — exact: `(close - open) x volume x contract_size` for BUY, inverse for SELL

### Contract Size Reference (from evaluation engine)

| Symbol | Pip Size | Contract Size |
|---|---|---|
| XAUUSD (Gold) | 0.01 | 100 |
| XAGUSD (Silver) | 0.01 | 5000 |
| EURUSD, GBPUSD, etc. | 0.0001 | 100,000 |
| JPY pairs | 0.01 | 100,000 |
| US30, DE30 | 1 | 1 (or 100 for x100) |
| USTEC, US500 | 0.1 | 1 (or 100 for x100) |
| BTC, ETH | 0.1 | 1 |
| Cent accounts | Same | / 100 |

---

## Three Types of Pacer Trades

### Type 1: Winning Trade (SL Never Hit)

The standard profitable trade. SL is placed safely outside the price range.

```
Entry candle (14:30): O:3321.43 H:3322.20 L:3320.76 C:3321.76
...5 candles later...
Exit candle (14:55):  O:3326.52 H:3326.68 L:3326.22 C:3326.64

Generated trade:
  direction  = BUY
  open_time  = 14:31:23 (within entry candle)
  close_time = 14:56:47 (within exit candle)
  open_price = 3321.10 (within entry candle L-H: 3320.76-3322.20)
  close_price = 3326.45 (within exit candle L-H: 3326.22-3326.68)
  volume     = 0.15
  SL         = 3319.50 (below LOWEST low of all candles in duration)
  profit     = (3326.45 - 3321.10) x 0.15 x 100 = +$80.25

SL check: Did price ever reach 3319.50 during trade? 
  Lowest low across all candles = 3320.76 → NO → PASSES
```

### Type 2: Losing Trade (SL Hit — Realistic Stop Out)

The trade goes against the pacer. Price DOES reach the SL level. The trade closes AT the SL price (not at the exit candle). This is how real SL hits work.

```
Entry candle (08:30): O:3318.36 H:3318.68 L:3317.47 C:3318.12
Candle (08:35):       O:3318.12 H:3318.72 L:3317.66 C:3318.28
Candle (08:40):       O:3318.28 H:3318.93 L:3318.22 C:3318.87
Candle (08:45):       O:3318.87 H:3319.55 L:3318.37 C:3319.50
...price goes up...

Generated trade (SL HIT):
  direction  = SELL (entered expecting price to go down, but it went up)
  open_time  = 08:31:14
  close_time = 08:46:32 (when SL was hit)
  open_price = 3317.80 (within entry candle L-H)
  close_price = 3319.50 (= SL price, because SL was hit)
  volume     = 0.10
  SL         = 3319.50 (above some candles' highs — price DID reach it)
  profit     = (3317.80 - 3319.50) x 0.10 x 100 = -$17.00

How to construct: 
  1. Find candles where price moves AGAINST the trade direction
  2. Set SL at a level that IS within the candle range (will be "hit")
  3. close_price = SL price (this is what happens on a real SL hit)
  4. close_time = timestamp when the SL-hitting candle occurs
```

**Key difference from Type 1:** In Type 1, SL is placed OUTSIDE all candle ranges (never hit). In Type 2, SL is placed WHERE the price actually goes (gets hit). The evaluation engine will see the SL was hit and this is a valid losing trade.

### Type 3: Losing Trade (Bad Direction, No SL Hit)

Trade just goes wrong but SL is far enough to not get hit. Trader closes at a loss manually.

```
Entry candle (10:00): O:3324.68 H:3324.86 L:3323.61 C:3323.83
Exit candle (10:15):  O:3323.21 H:3323.95 L:3322.62 C:3323.80

Generated trade:
  direction  = BUY (but price went sideways/down)
  open_time  = 10:01:33
  close_time = 10:16:22
  open_price = 3324.50 (within entry candle range)
  close_price = 3323.00 (within exit candle range — below entry)
  volume     = 0.12
  SL         = 3321.00 (far below — never hit)
  profit     = (3323.00 - 3324.50) x 0.12 x 100 = -$18.00

SL check: Lowest low = 3322.62 → SL at 3321.00 never reached → PASSES
This is a manual close at a loss (trader cut losses before SL hit).
```

---

## Intentional Rule Violations (For Realism)

A perfect trading account with zero flags looks suspicious. Real traders make mistakes. Pacers should too.

### Types of Intentional Violations

| Violation | How Often | Implementation |
|---|---|---|
| **Slightly over max lot size** | 1-2 trades per pacer per challenge | Set volume to max_lot + 0.01 or 0.02. Gets flagged. |
| **Missing SL** | 0-1 trades per pacer | Set SL = null on one trade. Gets flagged. |
| **Hold time exceeded** | 0-1 trades per pacer | Generate a trade that spans longer than max_hold_hours. Gets flagged. |
| **Pair limit exceeded** | Rare (0-1 per challenge) | Open 3 simultaneous trades on same symbol when limit is 2. Gets flagged. |

### Rules for Violations

1. **Never violate daily loss cap** — that leads to disqualification. Pacers should not get DQ'd.
2. **Never blow the account** — balance should never go below 20% of starting balance.
3. **Violations should happen in Phase 2-3** — when the pacer is active, not during ramp-up.
4. **Flagged trades lose their profit** — the evaluation engine strips profit from flagged trades. Account for this in balance targeting (the trade's profit won't count).
5. **Max 3 total violations per pacer** — more than that looks like a bot, not a careless trader.

### Example Violation Schedule for One Pacer

```
Day 3: Trade with volume 0.27 (max is 0.25) — flagged for lot size → profit stripped
Day 5: Trade with no SL set — flagged for missing SL → profit stripped
Day 7: Normal trades (no violations)
Day 9: Trade held for 26 hours (max is 24) — flagged → profit stripped

Total flags: 3 — looks like a real but slightly careless trader
```

---

## Dynamic Swarm Targeting (Not Static Slot Assignment)

### The Core Idea

Pacers do NOT have fixed assignments like "Pacer A always chases Trader #1." That looks robotic and is detectable. Instead, pacers behave like a **swarm** — they dynamically rotate around different real traders across cycles, creating natural-looking competitive dynamics.

**No pacer is permanently assigned to any slot. Every cycle is a fresh shuffle.**

### How Dynamic Targeting Works

```
Each cycle, the system:
1. Gets current real trader leaderboard positions
2. Picks a RANDOM subset of pacers to be "active chasers" this cycle (not all)
3. Each active pacer picks a RANDOM real trader to target THIS cycle
4. Next cycle — different pacer, different target

No pacer is permanently assigned to any slot.
```

### Example: 4 Pacers, 2 Real Traders Over 5 Cycles

```
Cycle 1:
  Pacer A → targets Real Trader #1 (pushes just below him)
  Pacer B → idle this cycle
  Pacer C → targets Real Trader #2 (pushes just above him)
  Pacer D → targets Real Trader #1 (pushes just above him!)
  
Cycle 2:
  Pacer A → idle this cycle
  Pacer B → targets Real Trader #2 (overtakes him briefly)
  Pacer C → targets Real Trader #1 (falls just below)
  Pacer D → idle this cycle
  
Cycle 3:
  Pacer A → targets Real Trader #2 (appears from behind)
  Pacer B → targets Real Trader #1 (challenges from above)
  Pacer C → idle this cycle
  Pacer D → targets Real Trader #2 (sandwiches him with Pacer A)
  
Cycle 4:
  Pacer A → targets Real Trader #1 (now A is threatening #1)
  Pacer B → idle this cycle
  Pacer C → targets Real Trader #1 (two pacers on #1 — feels crowded!)
  Pacer D → targets Real Trader #2
  
Cycle 5:
  Everyone shuffles again...
```

### What Real Traders Experience

**Real Trader #1 sees over 5 days:**
- Day 1: "GoldRush_ET" and "PipChaser_7" both near me
- Day 2: "ScalpX_Pro" appeared out of nowhere, almost passed me
- Day 3: "FxHunter23" is gaining, now only $1 behind
- Day 4: Two people right on my tail!
- **Feels like a dynamic, busy competition — not one stalker**

**Real Trader #2 sees over 5 days:**
- Day 1: "ScalpX_Pro" just passed me!
- Day 2: "FxHunter23" came from behind
- Day 3: "GoldRush_ET" dropped down near me, "PipChaser_7" too
- Day 4: Different name again threatening
- **Different names appearing and disappearing — feels completely organic**

### Targeting Rules Per Cycle

```
For each pacer:
  1. Roll for activity: should this pacer trade this cycle?
     - Was active last cycle → 40% chance of being idle this cycle
     - Was idle last cycle → 70% chance of being active this cycle
     - Result: natural on/off pattern, not constant pressure
     
  2. If active, pick target:
     - Select a random real trader from the top N (money zone)
     - Constraint: max 2 pacers targeting the same real trader per cycle
     - At least 1 pacer must be idle each cycle
     
  3. Roll for position relative to target:
     - 40% chance: target slightly ABOVE the real trader
     - 40% chance: target slightly BELOW the real trader
     - 20% chance: same level (within $1-2 — dead heat)
     
  4. Calculate balance delta needed to reach position
  5. Generate trades to achieve it (or as close as possible)
```

### Phase-Adjusted Swarm Behavior

**Phase 2 (25-75% of challenge) — Maximum pressure:**
```
Active pacers per cycle: 50-75% of total pacers
Target range: real_trader.balance x random(0.95, 1.08)
  — sometimes above, sometimes below, sometimes briefly overtaking
Overtake frequency: ~30% of targeting attempts result in briefly being ABOVE
Multiple pacers can cluster around the same real trader (feels like a crowded race)
```

**Phase 3 (75-100% of challenge) — Winding down:**
```
Active pacers per cycle: 30-50% of total (fewer active)
Target range: current_pacer_balance x random(0.94, 1.00)
  — drifting down, fewer wins, more SL hits
Overtake frequency: drops to ~10% (rarely above real traders now)
Real traders naturally pull ahead as pacers decline
```

### Why This Works Better Than Fixed Slots

| Fixed Slot Assignment | Dynamic Swarm |
|---|---|
| Same pacer always near you — suspicious | Different pacers rotate — organic |
| Predictable pattern | Unpredictable — like real competition |
| Feels like being followed | Feels like a crowded race |
| One pacer can't cover all scenarios | Multiple pacers take turns applying pressure |
| Trader might notice "this guy always matches me" | No detectable pattern to find |

### The Psychological Effect

- **Creates FOMO**: "That guy who was behind me yesterday just jumped to #1 today!"
- **Multiple threats**: Sometimes 2 pacers near you, sometimes none. Unpredictable.
- **No safe harbor**: Even if you pass one "competitor," another appears next cycle
- Trader at #1: Different names rotating near the top → can't ever relax
- Trader at #2: Gets sandwiched by pacers from both directions → pushes harder
- **Every real trader is motivated to keep pushing, all the time**

---

## Activity Behavior — Mirrors Real Traders

Pacers DO NOT all behave identically. Each pacer is an independent "personality":

- **Activity level scales with challenge activity:** If the challenge is busy, pacers trade more. If quiet, pacers are quiet.
- **Not all pacers trade every cycle:** On any given pull, some pacers are active, some are idle.
- **Gradual ramp-up:** At challenge start, most pacers are idle. 1-2 might create a trade. As days progress, more become active.
- **Natural timing:** Trades are placed during market hours only. No trades during weekends or outside forex session times.
- **Varied trade durations:** Mix of scalps (5-30 min), intraday (1-4 hours), and swing trades (4+ hours).
- **Varied styles:** One pacer might be a scalper (many small trades), another a swing trader (few big trades).

### Cold Start — No Problem

Since trades are constructed from OHLC data (not borrowed from users), pacers can start trading from Day 1. They still ramp up gradually:
- Day 1-2: Only 1-2 pacers create 1-2 trades each
- Day 3-5: More pacers activate, 2-4 trades each
- Week 2+: Full activity across all pacers

---

## Win/Loss/SL-Hit Distribution

### Target Ratios Per Pacer

| Metric | Target Range | Notes |
|---|---|---|
| Win rate | 40-60% | Matches typical retail trader |
| SL hit rate | 15-30% of losses | Not all losses are SL hits — some are manual closes |
| Violation rate | 2-5% of total trades | Only 1-3 total per challenge |
| Average trade duration | 15 min - 4 hours | Mix of scalps and intraday |
| Trades per day (active days) | 2-6 | Varies by pacer "personality" |
| Idle days | 10-20% of challenge days | Real traders don't trade every day |

### How Balance Goes Up and Down Naturally

```
Example pacer over 10 days:

Day 1:  +$2.50 (1 small win)              Balance: $32.50
Day 2:  -$1.20 (1 SL hit)                 Balance: $31.30
Day 3:  +$5.80 (2 wins, 1 small loss)     Balance: $37.10
Day 4:  idle (no trades)                   Balance: $37.10
Day 5:  +$8.20 (3 wins, violation flagged) Balance: $45.30*
Day 6:  -$3.40 (2 SL hits)                Balance: $41.90
Day 7:  +$4.60 (2 wins)                   Balance: $46.50
Day 8:  +$2.10 (1 win, 1 loss)            Balance: $48.60
Day 9:  -$5.80 (3 losses, dropping phase) Balance: $42.80
Day 10: -$2.30 (1 SL hit, 1 manual loss)  Balance: $40.50

*Day 5 violation: profit of flagged trade stripped from evaluated balance
```

This looks completely natural — ups and downs, idle days, SL hits mixed in.

---

## Balance Targeting Logic

The target is **approximate, not exact**. Work with what's mathematically achievable using reasonable trade sizes.

### Phase-Based Targeting

```
Phase 1 (0-25% of challenge period):
  target = median_balance of all real participants +/- random(1-3%)
  Some pacers may still be at starting balance (haven't "traded" yet)
  Goal: blend in with the middle of the pack
  
Phase 2 (25-75% of challenge period):
  For each active pacer this cycle:
    randomly_chosen_target = random real trader from top N
    target_balance = randomly_chosen_target.balance x random(0.95, 1.08)
    
  Position roll (per pacer, per cycle):
    40% chance: aim slightly ABOVE the target trader
    40% chance: aim slightly BELOW the target trader  
    20% chance: aim at same level (dead heat)
    
  Key: Don't force unrealistic jumps. If a $15 jump is needed but max 
  achievable with reasonable lots is $8, do $8 this cycle and catch up next.
  Different pacer targets a different real trader next cycle (swarm behavior).
  
Phase 3 (75-100% of challenge period):
  target = current_pacer_balance x random(0.94, 1.00)
  Generate more losing trades than winning ones
  Net balance goes DOWN over multiple cycles
  Rate of decline: -2% to -5% per cycle
  Fewer pacers active per cycle (winding down)
```

### How to Hit a Balance Target

1. Calculate delta: `target_balance - current_pacer_balance = P/L needed`
2. Determine trade count: split delta across 2-4 trades (not one huge trade)
3. For each trade:
   - **If P/L needed is positive:** Find candles with clear directional move, enter early, exit late
   - **If P/L needed is negative:** Generate SL-hit trade or wrong-direction trade
   - Volume calculated: `desired_profit / (price_move x contract_size)`
   - Cap volume at challenge max_lot_size (or slightly above for intentional violation)
4. Include 1 loss for every 2-3 wins (even when targeting positive P/L)
5. Net P/L of all trades ≈ target delta (doesn't need to be exact)

### Achievability Check

Before generating trades, verify the target is achievable:

```
max_single_trade_profit = max_lot_size x average_candle_range x contract_size
max_daily_profit = max_single_trade_profit x max_trades_per_day

If needed_delta > max_daily_profit:
  Cap at max_daily_profit
  Carry remainder to next cycle
  
This prevents suspicious single-trade gains like +$50 on 0.01 lots
```

---

## SL Hit Mechanics (Detailed)

### How Real SL Hits Work in MT5

When a stop loss is hit:
1. Price reaches the SL level during an open trade
2. Trade automatically closes at the SL price (or nearby due to slippage)
3. `close_price` = SL price (or very close, within 1-3 pips for slippage)
4. The trade is a loss

### How We Construct SL-Hit Trades

```
Step 1: Find candles where price makes a sharp move in one direction
  Example: 3 candles where price goes from 3320 up to 3328

Step 2: Open a SELL trade at the start of this move
  open_price = 3320.50 (within first candle range)
  
Step 3: Place SL at a level the price WILL reach
  SL = 3325.00 (price goes up past this in candle 2 or 3)
  
Step 4: Set close_price = SL price (or within 1-3 pips for realism)
  close_price = 3325.00 (exact SL hit) or 3325.12 (small slippage)
  
Step 5: Set close_time = time of the candle that breached SL level
  Find the first candle whose High >= 3325.00 → that's when SL was hit
  close_time = random second within that candle

Step 6: Calculate loss
  profit = (3320.50 - 3325.00) x volume x 100 = -$4.50 per 0.01 lot
```

### Slippage Realism

Real SL hits have small slippage (especially on Gold during volatility):
- 80% of the time: close_price = SL price exactly
- 15% of the time: close_price = SL +/- 0.5 to 2 pips (small slippage)
- 5% of the time: close_price = SL +/- 3-5 pips (larger slippage during news)

### SL Hit Frequency

```
Per pacer, across entire challenge:
  Total trades: ~30-60
  SL hit trades: 4-10 (roughly 15-20% of total trades)
  
Distribution:
  Phase 1: 1-2 SL hits (looks like learning/warming up)
  Phase 2: 2-3 SL hits (normal trading losses)
  Phase 3: 3-5 SL hits (more losses as pacer drops)
```

---

## Evaluation of Pacer Accounts

Pacers ARE evaluated — they go through the same evaluation engine as real traders. This is critical for realism.

### Rules That Pacers RESPECT (most of the time)

| Rule | How |
|---|---|
| Max lot size | Trades generated within limit (except intentional violations) |
| Max simultaneous trades | Don't generate overlapping trades exceeding the limit |
| Pair limit | Don't exceed per-symbol open trade limit |
| Hold time | Most trades within max_hold_hours |
| Daily loss cap | NEVER exceed — would trigger DQ |
| SL required | Most trades have SL (except intentional 0-1 violation) |
| Weekend trading | Respect weekend close if rule is enabled |
| Min active days | Generate trades across enough days to meet minimum |

### Rules That Pacers Intentionally Violate (rarely)

| Rule | Frequency | Effect |
|---|---|---|
| Max lot size | 1-2 per challenge | Profit stripped from flagged trade |
| SL required | 0-1 per challenge | Profit stripped |
| Hold time | 0-1 per challenge | Profit stripped |
| Pair limit | 0-1 per challenge | Profit stripped |

### SL Check — Two Scenarios

**Normal winning/losing trades (SL NOT hit):**
- SL placed outside candle range → evaluation engine confirms SL was never reached → PASSES

**SL-hit trades:**
- SL IS within candle range → evaluation engine confirms price DID reach SL
- close_price = SL → this is consistent with a real SL hit → PASSES
- The evaluation engine sees this as a legitimate stop-out

---

## Complete System Flow Per Pull Cycle

```
┌─────────────────────────────────────────────────────────────┐
│                     PULL CYCLE                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. VPS Pull (get real trades from MT5)                      │
│  2. Resolve Null Open Times (fix missing open_time)          │
│  3. OHLC Candle Data (validate & store candle data)          │
│                                                              │
│  4. ▶▶▶ PACER TRADE GENERATION ◀◀◀                          │
│     a) Determine challenge phase (1/2/3/4/5)                 │
│     b) Get current leaderboard state                         │
│     c) For each active pacer:                                │
│        - Should this pacer trade this cycle? (random)        │
│        - Calculate target balance                            │
│        - Determine P/L needed                                │
│        - Generate trades from OHLC data                      │
│        - Include wins/losses/SL hits per distribution        │
│        - Include 0-1 intentional violation (if scheduled)    │
│        - Insert trades into wp_trades table                  │
│        - Update pacer balance                                │
│                                                              │
│  5. Evaluate All Accounts (including pacers)                 │
│     - Lot size check                                         │
│     - Simultaneous trades check                              │
│     - Pair limit check                                       │
│     - SL check (candle-based)                                │
│     - Hold time check                                        │
│     - Daily loss check                                       │
│     - Flag violating trades                                  │
│                                                              │
│  6. Update Leaderboard Rankings                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Deployment Modes

On challenge creation, admin has a toggle: **Enable Pacers**

When enabled, admin selects visibility mode:

| Mode | Description |
|---|---|
| **Admin Only** | Pacers visible ONLY on admin leaderboard. Client dashboard, WinnerPip, exports, registration counts — all exclude pacers. For testing. |
| **Full** | Pacers appear everywhere as normal users. Only admin leaderboard marks them. For production. |

### Admin Only Mode (First Implementation)

- Admin leaderboard: shows pacers with pacer badge
- Client leaderboard: pacers completely hidden — real #1 shows as #1
- Registration count: real participants only
- Exports (CSV, leaderboard export): exclude pacers
- Overviews and stats: real data only
- Pacers still generate trades and are evaluated internally

### Full Mode (Future)

- Pacers appear on all leaderboards as normal users
- Only admin leaderboard shows the pacer badge
- Registration count includes pacers
- Exports include pacers (with pacer flag column for admin)

---

## Trade Construction Rules (Complete Reference)

| Field | How It's Set |
|---|---|
| `open_time` | Random second within the entry candle's timeframe |
| `close_time` | Random second within exit candle (or SL-hit candle for SL trades) |
| `open_price` | Random price between entry candle's Low and High |
| `close_price` | For wins/manual losses: within exit candle range. For SL hits: = SL price +/- slippage |
| `trade_type` | BUY or SELL (chosen based on P/L target and candle direction) |
| `volume` | Within challenge max lot size (or slightly above for violation) |
| `stop_loss` | Wins: below lowest Low (BUY) / above highest High (SELL). SL hits: within reachable range |
| `take_profit` | Optional — set beyond close_price in profitable direction, or null |
| `profit` | Exact: `(close - open) x volume x contract_size` (BUY), inverse for SELL |
| `commission` | 0.00 (challenge accounts typically zero commission) |
| `swap` | 0.00 (trades don't hold overnight typically) |
| `ticket` | Unique fake ticket (900000001+) |
| `position_id` | Unique fake position ID (900000001+) |

---

## Nickname Pool (200 Names)

System maintains a pool of 200 realistic-looking trading nicknames:

```
TradeKing_ET, FxHunter23, GoldSniper_, Birr_Trader, MarketWolf_1, 
CandleMaster, PipChaser_7, ScalpX_Pro, SwingTraderAB, ForexMindset,
TradeSmart_21, GoldRush_ET, FxEagle_99, PipMachine_, CashFlow_X,
ChartReader_3, PipKing_77, ScalpGod_ET, ForexNinja_1, TradeVibes,
GoldDigger_X, PipWizard_5, TradeGeek_42, MarketKing_8, FxMaster_11,
Alpha_Pips, BullRunner_9, ProfitHunter, TrendRider_4, SmartMoney_7,
FxWarrior_33, GoldFever_1, PipStorm_22, TradeFlow_X, ScalpKing_88,
ChartPro_14, FxBeast_66, GoldPips_3, TradeMind_5, PipGod_ET,
MoneyMoves_2, FxViper_11, GoldTrader_7, PipStar_44, TradeHawk_9,
Birr_FX_1, MarketPro_6, FxShark_55, GoldBull_ET, PipHero_33,
... (200 total in the system)
```

Names are:
- Mix of English trading jargon + numbers
- Some with underscores, some without
- Various lengths (6-15 characters)
- Never repeated within the same challenge
- For hybrid: different names for demo vs real pacers

---

## Database Schema

```sql
-- Flag on existing registrations table
ALTER TABLE trading_registrations ADD COLUMN is_pacer BOOLEAN DEFAULT FALSE;

-- Pacer mode on challenge table
ALTER TABLE trading_challenges ADD COLUMN pacer_mode VARCHAR(20) DEFAULT 'off';
-- Values: 'off', 'admin_only', 'full'
```

Pacer trades go into the same `wp_trades` table — indistinguishable from real trades.

**Fake IDs (never collide with real data):**
- Telegram user IDs: Start at `9000000001` and increment
- MT5 account numbers: Start at `9000000001` and increment
- Trade tickets: Start at `900000001` and increment
- Position IDs: Start at `900000001` and increment
- Emails: `pacer_1@system.internal`, `pacer_2@system.internal`...

---

## Implementation Components

| Component | Responsibility |
|---|---|
| **Pacer Registration Service** | Creates pacer registrations during reg phase at even-hour intervals |
| **Pacer Trade Engine** | Main orchestrator — decides which pacers trade, how many trades, what type |
| **Pacer Balance Controller** | Determines target balance based on phase + leaderboard state |
| **OHLC Trade Constructor** | Picks candles, generates prices, calculates P/L, ensures rule compliance |
| **Pacer Swarm Controller** | Dynamic random targeting — picks which pacer chases which real trader each cycle |
| **Pacer Violation Scheduler** | Decides when/which violations to inject for realism |
| **Nickname Pool** | 200 pre-defined names, randomly assigned, never repeated per challenge |
| **Admin Marking** | Admin leaderboard shows pacer badge; client sees normal user |

---

## What Pacers Skip

- No VPS verification (no real account)
- No VPS pulling (excluded from pull queue)
- No credential checks
- No balance warnings
- No DMs sent to pacer "users"
- No engagement messages
- No submission required
- No withdrawal/deposit checks

## What Pacers DO Go Through

- Full evaluation (lot size, simultaneous trades, pair limit, hold time, daily loss)
- Leaderboard ranking (appear naturally based on balance)
- Some intentional flagged trades (for realism)
- SL check (passes by construction OR legitimately hits SL)
- Contract size calculations (same formulas as real accounts)
- Balance calculation (starting_balance + sum of all net P/L)

---

## Advantages Over Borrowing From Users

| | Old: Borrow & Tweak | New: Construct from OHLC |
|---|---|---|
| Cold start | Blocked — no trades to borrow | Works from Day 1 |
| Duplicate risk | Possible if users compare | Zero — every trade is unique |
| Independence | Depends on real traders trading | Fully independent |
| SL check | Inverted trades may fail | Guaranteed pass (or legitimate SL hit) |
| SL hit realism | Hard to construct convincing SL hits | Natural — use candles where price reaches SL |
| Violations | Can't easily add without breaking logic | Easy — just tweak one parameter |
| Complexity | Inversion logic, source selection | Simpler — just read candles |
| Verification | Shifted times/prices might not align | Perfect — prices from actual candle data |
| Symbol coverage | Limited to what users trade | Any symbol with OHLC data |

---

## Edge Cases & Safety

| Scenario | Handling |
|---|---|
| No OHLC data available | Pacers skip this cycle — try again next pull |
| Not enough candle coverage | Generate fewer trades (only what's provable) |
| Real leader jumps massively | Pacer catches up over 2-3 cycles, not instantly |
| All real traders inactive | Pacers also go quiet (mirrors activity) |
| Challenge has 0 real trades | Pacers still create 1-2 small trades (they registered, they'd trade) |
| Pacer balance would go negative | Cap losses — never breach daily loss or blow account |
| Phase transition mid-cycle | Use the new phase's logic from next cycle |
| Admin disables pacers mid-challenge | Stop generating new trades; existing ones stay in history |

---

## Summary: How It All Works Together

1. **Admin creates challenge** with `pacer_mode = 'admin_only'`
2. **During registration**: 4-8 pacers register at even-hour intervals, looking like real users
3. **Challenge starts**: Pacers are quiet for first day or two
4. **Phase 1 (first 25%)**: Pacers make small trades, sit in mid-range. Have some losses and SL hits. Look like average traders warming up.
5. **Phase 2 (25-75%)**: Pacers activate as a swarm. Each cycle, random pacers target random real traders — interchangeably rotating, sometimes overtaking, sometimes falling behind. Include SL hits, a couple violations. Real traders see a crowded, competitive race.
6. **Phase 3 (last 25%)**: Pacers take more losses, more SL hits. Balance declines naturally. Real winners climb above them organically.
7. **Challenge ends**: Real winners are on top. Pacers didn't submit. Nobody knows they existed.
8. **Result**: Every real trader pushed to their maximum because they always saw different competitors nearby, rotating and unpredictable.

---

## Implementation Roadmap

### Step 1: Database Schema (30 min)
- Add `is_pacer` column to `trading_registrations`
- Add `pacer_mode` column to `trading_challenges`
- Create nickname pool table or constant array

### Step 2: Pacer Registration Service (2-3 hours)
- Service that creates pacer registrations during registration phase
- Even-hour interval scheduling
- Random nickname assignment from pool
- Fake IDs generation (9000000001+ range)

### Step 3: OHLC Trade Constructor (4-5 hours)
- Core trade generation from candle data
- Type 1: Winning trades (SL never hit)
- Type 2: SL-hit trades (realistic stop-outs)
- Type 3: Manual-close losing trades
- Profit calculation using contract sizes from evaluation engine
- Volume selection within challenge rules

### Step 4: Pacer Swarm Controller (3-4 hours)
- Phase determination (what % of challenge has elapsed)
- Activity roll (which pacers are active this cycle)
- Target selection (random real trader from leaderboard)
- Position roll (above/below/same level)
- Balance delta calculation

### Step 5: Pacer Balance Controller (2-3 hours)
- Phase-based targeting logic
- Achievability checks (don't force impossible jumps)
- Trade count splitting (2-4 trades per target delta)
- Win/loss/SL-hit distribution per trade batch

### Step 6: Violation Scheduler (1-2 hours)
- Schedule 2-3 violations per pacer across challenge
- Types: lot size, missing SL, hold time
- Only in Phase 2-3
- Account for profit stripping in balance calculations

### Step 7: Integration with Pull Cycle (2-3 hours)
- Hook into scheduler after OHLC step, before evaluation
- Exclude pacers from VPS pull queue
- Ensure evaluation runs on pacer trades normally

### Step 8: Admin Leaderboard Marking (1-2 hours)
- Show pacer badge on admin leaderboard
- Hide pacers from client leaderboard (admin_only mode)
- Exclude from registration counts and exports

### Step 9: Admin UI Toggle (1 hour)
- Pacer mode selector on challenge creation form
- Options: off / admin_only / full

### Total Estimated: ~18-24 hours of development

---

## Key Design Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Trade source | OHLC construction (not user borrowing) | Independent, no cold start, verifiable |
| Targeting | Dynamic swarm (not fixed slots) | Organic, undetectable, more effective |
| SL hits | Real candle-based SL triggers | Makes losses look authentic |
| Violations | 2-3 intentional per pacer | Perfect compliance looks suspicious |
| Phase 3 behavior | Gradual decline (not sudden) | Natural-looking dropout |
| Balance targeting | Approximate (not exact) | Don't force unrealistic trades |
| Activity pattern | Random active/idle per cycle | Each pacer has its own rhythm |
| First implementation | Admin-only mode | Safe testing before going full |
