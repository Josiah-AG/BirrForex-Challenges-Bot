# Railway Pull System Rebuild Plan

## VPS STATUS: ✅ COMPLETE
- Worker v6.3: Persistent IPC, self-healing, lock-free health
- Router v6.3: Smart retry (2x same terminal, 3 different terminals), credential vs terminal error classification
- Stress test: 500 pulls in 11.7 min, 99.2% success, 42.9 req/min
- Task Scheduler: auto-start on boot + keepalive twice daily
- Shared queue: fast terminals help slow ones (work stealing)

## RAILWAY CHANGES NEEDED

### 1. Shared Queue Pattern (vpsPullScheduler.ts)
- Replace static round-robin distribution with shared queue
- All accounts go into one queue, terminals grab next as they finish
- Fast terminals naturally do more work
- **Failed accounts from last cycle get PRIORITY (front of queue)**

### 2. Per-Account Evaluation (streaming)
- After each account's data is pulled successfully → immediately run rule check on that account
- Don't wait for all 3000 to finish
- Evaluation results saved to DB immediately
- If cycle crashes halfway, partial evaluations are preserved

### 3. Leaderboard Update Timing
- **NOT after each pull** — only at the START of the next cycle
- Flow at each scheduled time (e.g., 10:00 EAT):
  1. Update leaderboard rankings from PREVIOUS cycle's evaluated data
  2. Start new pull cycle
- Exception: Final pull (Saturday sync) → update leaderboard immediately after (challenge is over)
- User dashboard shows "Data from: [previous cycle time]"

### 4. Retry Within Same Cycle
- After all accounts are pulled, collect failures (non-credential)
- Wait 30 seconds
- Retry failed accounts (they go through the router's smart retry which tries 3 terminals)
- Up to 2 retry passes within same cycle
- Still failing after retries → mark as failed, report to admin

### 5. Admin Dashboard — Failed Accounts Section
- Shows: account number, failure reason, error type, timestamp, terminals tried
- "Retry Now" button per account:
  1. Triggers immediate pull for that account
  2. If successful → runs rule check
  3. Asks: "Update leaderboard now?" or "Add to next update?"
- Failed accounts get priority in next cycle (pulled first)

### 6. Pull Schedule (unchanged)
- 06:00, 10:00, 14:00, 18:00, 22:00, 02:00 EAT
- Weekend: Saturday 06:00 always runs (final sync), rest skipped unless weekend_trading=true
- Final leaderboard: Saturday ~06:30 after sync pull completes

## FILES TO MODIFY
- `src/scheduler/vpsPullScheduler.ts` — shared queue, per-account eval, leaderboard timing, failed-first priority
- `src/services/wpEvaluationEngine.ts` — expose `evaluateSingleAccount()` as public method
- `src/bot/adminHandler.ts` — add retry button handler, failed accounts view
- Possibly new: `src/services/leaderboardService.ts` — separate leaderboard update logic

## TEST ACCOUNTS (for reference)
- Real: 133643354 / Aa@12345 / Exness-MT5Real9
- Real: 407434926 / Aaa@112212 / Exness-MT5Real10
- Demo: 435923524 / Aa@11221234 / Exness-MT5Trial9
- Base: 435924397 / Abc@1234 / Exness-MT5Trial9

## VPS API
- URL: http://108.181.184.223:8000
- Key: wp-k8x2m9f4v7j3n6q1w5t8r2y4u7i0p3
- Endpoints: GET /health, POST /verify, POST /pull
