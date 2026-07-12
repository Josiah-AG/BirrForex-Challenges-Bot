// VPS Pull Scheduler v4.0 — unified continuous shared-queue model.
// Single queue, all terminals run continuously until it's empty. -6 credential
// failures get a single same-cycle confirmation on a DIFFERENT terminal (front
// of queue, excluded from the terminal that just failed it). Non-credential
// failures get requeued up to MAX_ACCOUNT_ATTEMPTS times. No separate retry phases.
import cron from 'node-cron';
import axios from 'axios';
import { Bot } from '../bot/bot';
import { tradingChallengeService, TradingChallenge } from '../services/tradingChallengeService';
import { evaluationEngine, candleTerminalManager } from '../services/wpEvaluationEngine';
import { leaderboardService } from '../services/leaderboardService';
import { config } from '../config';
import { db } from '../database/db';
import { Markup } from 'telegraf';

/**
 * VPS Pull Scheduler v2 — Shared Queue Architecture
 *
 * Changes from v1:
 * 1. SHARED QUEUE: All accounts in one queue, terminals grab next as they finish
 *    (fast terminals naturally do more work — work stealing)
 * 2. PER-ACCOUNT EVALUATION: After each successful pull → immediately evaluate
 *    (partial evaluations preserved if cycle crashes)
 * 3. LEADERBOARD TIMING: Rankings update at START of next cycle, not after pull
 *    Exception: Saturday final sync → immediate leaderboard update
 * 4. FAILED-FIRST PRIORITY: Accounts that failed last cycle go to front of queue
 * 5. RETRY WITHIN CYCLE: After all accounts pulled, retry failures (up to 2 passes)
 *
 * Schedule: 06:00, 10:00, 14:00, 18:00, 22:00, 02:00 EAT
 */

const MAX_TERMINALS = 15;
const MAX_RETRIES_PER_ACCOUNT = 3;
const RETRY_DELAY_MS = 3000;
const ACCOUNT_TIMEOUT_MS = 30000;
// resolve-opens/resolve-trades run a full history-cache stabilization wait
// (_wait_history_cache in worker.py) before querying — that alone can take up
// to ~40s on a cold cache, so they need a longer timeout than other endpoints.
const HISTORY_RESOLVE_TIMEOUT_MS = 60000;
const BATCH_DELAY_MS = 1500;
const PASSWORD_WARNING_HOURS = 24;
const TERMINAL_HEALTH_RECHECK_MS = 10 * 60 * 1000;
const TERMINAL_FAILURE_THRESHOLD = 5;
// Unified continuous-queue retry model (replaces the old multi-phase retry system):
//   - Credential failure (-6) on T1 → account is NOT labeled yet. It jumps to the FRONT
//     of the queue, excluded from T1, and the next free terminal confirms it.
//     -6 again on T2 → CONFIRMED invalid_credentials. Success on T2 → was a T1 issue.
//   - Non-credential failure → requeued (back of queue), up to MAX_ACCOUNT_ATTEMPTS total
//     attempts before being marked a final failure.
//   - Pull is "done" only when the shared queue is completely empty — all terminals run
//     continuously, no separate stop-the-world retry phases.
const MAX_ACCOUNT_ATTEMPTS = 5;
const CONFIRMATION_STARVATION_MS = 60000; // if no OTHER terminal frees up within 60s, allow same terminal as last resort

interface PullResult {
  registrationId: number;
  accountNumber: string;
  userId: number;
  username: string | null;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  tradesCount?: number;
  dealsCount?: number;
  balance?: number;
  equity?: number;
  balance_ops?: Array<{ ticket: number; time: string; amount: number; op_type: string; comment: string }>;
  terminalId?: number;
  terminalsAttempted?: number[];
  terminalAttempts?: { terminalId: number; errorCode: string; errorMessage: string }[];
  positionIds?: number[]; // Position IDs returned by VPS for inline reconciliation
}

interface TerminalState {
  id: number;
  isHealthy: boolean;
  consecutiveFailures: number;
  unhealthySince: Date | null;
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
}

interface AccountToPull {
  registrationId: number;
  accountNumber: string;
  server: string;
  investorPassword: string;
  userId: number;
  username: string | null;
  nickname: string | null;
  isPriority: boolean; // Failed in last cycle
  lastPullAt: string | null; // null = never pulled before (first pull uses full range)
  attempts?: number; // non-credential retry attempts so far this cycle (max MAX_ACCOUNT_ATTEMPTS)
  excludedTerminalId?: number; // set after a -6 — this account must NOT go back to this terminal
  excludedSince?: number; // Date.now() when excludedTerminalId was set (starvation guard)
}

/**
 * Shared queue — thread-safe (single-threaded JS, but clear semantics)
 */
/**
 * Normalize an MT5 account number to digits only.
 * Handles "#161600472", "161 600 472", "161,600,472", "161600472" → "161600472"
 * Used as the canonical key for credential failure caching and queue deduplication.
 */
function normalizeAccountNumber(accountNumber: string): string {
  // Strip prefix chars (#, spaces, commas), then parse as float to drop any decimal suffix
  // ("161600553.0" → 161600553, "#161600553" → 161600553, "161 600 553" → 161600553)
  const cleaned = (String(accountNumber || '')).replace(/[^0-9.]/g, '');
  if (!cleaned) return '';
  const n = Math.floor(parseFloat(cleaned));
  return isNaN(n) ? cleaned.replace(/\D/g, '') : String(n);
}

class SharedQueue {
  private queue: AccountToPull[] = [];
  private inProgress = new Set<number>();         // by registrationId
  private inProgressAccounts = new Set<string>(); // by normalized accountNumber — prevents concurrent
                                                  // pulls of the same physical MT5 account when two
                                                  // registrationIds share the same credentials

  load(accounts: AccountToPull[]) {
    // Deduplicate by normalized MT5 account number — if the same physical MT5
    // account has multiple trading_registrations rows (re-registrations, duplicates,
    // or inconsistent "#" prefix formatting), only keep the first entry per account.
    // Pulling the same MT5 account twice gives identical data and wastes terminals.
    const seenAccountNumbers = new Set<string>();
    const deduped = accounts.filter(a => {
      const key = normalizeAccountNumber(a.accountNumber);
      if (!key) return true; // keep accounts with no parseable number (shouldn't happen)
      if (seenAccountNumbers.has(key)) return false;
      seenAccountNumbers.add(key);
      return true;
    });

    if (deduped.length < accounts.length) {
      // Show which raw accountNumber formats were deduplicated (to help debug normalization issues)
      const seen2 = new Set<string>();
      const dropped = accounts.filter(a => {
        const k = normalizeAccountNumber(a.accountNumber);
        if (!k || seen2.has(k)) return true;
        seen2.add(k);
        return false;
      });
      const droppedSample = dropped.slice(0, 5).map(a => `"${a.accountNumber}"→"${normalizeAccountNumber(a.accountNumber)}"`).join(', ');
      console.log(`📊 VPS Pull Queue: deduplicated ${accounts.length - deduped.length} duplicate account entries (${accounts.length} → ${deduped.length} unique MT5 accounts). Dropped: ${droppedSample}`);
    } else {
      console.log(`📊 VPS Pull Queue: ${deduped.length} unique accounts loaded (no duplicates)`);
    }

    // Priority accounts (failed last cycle) go to front
    const priority = deduped.filter(a => a.isPriority);
    const normal = deduped.filter(a => !a.isPriority);
    this.queue = [...priority, ...normal];
    this.inProgress.clear();
    this.inProgressAccounts.clear();
  }

  /** Terminal grabs next available account.
   *  Skips (defers) any account whose normalized MT5 number is already being
   *  processed by another concurrent terminal worker — avoids duplicate real
   *  MT5 logins when two registrationIds share the same account credentials.
   *  Also skips any account excluded from THIS terminal (it just got a -6 here
   *  and is waiting for a DIFFERENT terminal to confirm) — unless this is the
   *  only healthy terminal left, or the account has been waiting too long
   *  (CONFIRMATION_STARVATION_MS) for another terminal to free up. */
  next(terminalId: number, healthyTerminalCount: number): AccountToPull | null {
    const idx = this.queue.findIndex(a => {
      const key = normalizeAccountNumber(a.accountNumber);
      if (key && this.inProgressAccounts.has(key)) return false;
      if (a.excludedTerminalId !== undefined && a.excludedTerminalId === terminalId) {
        if (healthyTerminalCount > 1) {
          const waited = a.excludedSince ? Date.now() - a.excludedSince : 0;
          if (waited < CONFIRMATION_STARVATION_MS) return false; // wait for a different terminal
        }
        // Only one healthy terminal, or waited too long — allow as last resort
      }
      return true;
    });
    if (idx === -1) return null;
    const [account] = this.queue.splice(idx, 1);
    this.inProgress.add(account.registrationId);
    const key = normalizeAccountNumber(account.accountNumber);
    if (key) this.inProgressAccounts.add(key);
    return account;
  }

  /** Mark account as done (success or final failure) */
  done(registrationId: number, accountNumber?: string) {
    this.inProgress.delete(registrationId);
    if (accountNumber) {
      const key = normalizeAccountNumber(accountNumber);
      if (key) this.inProgressAccounts.delete(key);
    }
  }

  /** Return account to queue (terminal itself went unhealthy — not the account's fault,
   *  does not consume a retry attempt). */
  requeue(account: AccountToPull) {
    this.inProgress.delete(account.registrationId);
    const key = normalizeAccountNumber(account.accountNumber);
    if (key) this.inProgressAccounts.delete(key);
    this.queue.push(account);
  }

  /** First -6 on a terminal — NOT yet a confirmed credential failure.
   *  Jump to the FRONT of the queue (priority) but excluded from the terminal
   *  that just failed it, so the next free terminal performs the confirmation. */
  requeueForConfirmation(account: AccountToPull, failedTerminalId: number) {
    this.inProgress.delete(account.registrationId);
    const key = normalizeAccountNumber(account.accountNumber);
    if (key) this.inProgressAccounts.delete(key);
    account.excludedTerminalId = failedTerminalId;
    account.excludedSince = Date.now();
    this.queue.unshift(account);
  }

  /** Non-credential failure — requeue to the back of the queue.
   *  Returns false (and does NOT requeue) once MAX_ACCOUNT_ATTEMPTS is reached —
   *  caller should then record this as a final failure. */
  requeueForRetry(account: AccountToPull): boolean {
    this.inProgress.delete(account.registrationId);
    const key = normalizeAccountNumber(account.accountNumber);
    if (key) this.inProgressAccounts.delete(key);
    account.attempts = (account.attempts ?? 0) + 1;
    if (account.attempts >= MAX_ACCOUNT_ATTEMPTS) return false;
    this.queue.push(account);
    return true;
  }

  get remaining(): number { return this.queue.length; }
  get processing(): number { return this.inProgress.size; }
  get isEmpty(): boolean { return this.queue.length === 0 && this.inProgress.size === 0; }
}

export class VpsPullScheduler {
  private bot: Bot;
  private isRunning = false;
  private cancelRequested = false;
  private abortController: AbortController | null = null;
  private baseUrl: string;
  private apiKey: string;
  terminals: TerminalState[] = [];
  private sharedQueue = new SharedQueue();

  /**
   * Accounts confirmed as credential failures during the current cycle.
   * Keyed by MT5 accountNumber (string) — NOT registrationId — so that multiple
   * DB registrations for the same MT5 account are all blocked by a single cache entry.
   * Any account in this set returns invalid_credentials INSTANTLY — no HTTP
   * request, no terminal contact — regardless of which retry pass calls it.
   * Cleared at the start of every new pull cycle.
   */
  private credentialFailureCache = new Set<string>();

  cancelPull() {
    if (!this.isRunning) return false;
    this.cancelRequested = true;
    this.sharedQueue.load([]); // drain queue so no new accounts are picked up
    this.abortController?.abort(); // abort any in-flight axios requests immediately
    console.log('🛑 VPS Pull: Cancel requested — aborting in-flight requests');
    return true;
  }

  /** Wait until isRunning is false, polling every 500ms. Returns true if idle within timeout. */
  private waitForIdle(timeoutMs: number): Promise<boolean> {
    return new Promise(resolve => {
      if (!this.isRunning) return resolve(true);
      const deadline = Date.now() + timeoutMs;
      const check = setInterval(() => {
        if (!this.isRunning) {
          clearInterval(check);
          resolve(true);
        } else if (Date.now() >= deadline) {
          clearInterval(check);
          resolve(false);
        }
      }, 500);
    });
  }

  constructor(bot: Bot) {
    this.bot = bot;
    this.baseUrl = config.vpsApiUrl;
    this.apiKey = config.vpsApiKey;

    for (let i = 1; i <= MAX_TERMINALS; i++) {
      this.terminals.push({
        id: i,
        isHealthy: true,
        consecutiveFailures: 0,
        unhealthySince: null,
        totalProcessed: 0,
        totalSuccess: 0,
        totalFailed: 0,
      });
    }
  }

  start() {
    if (!this.baseUrl || !this.apiKey) {
      console.log('⚠️ VPS Pull Scheduler: Not configured (missing VPS_API_URL or VPS_API_KEY)');
      return;
    }

    // Per-challenge pull schedule: check every minute if any challenge needs a pull now
    cron.schedule('* * * * *', () => this.checkPullSchedule(), { timezone: 'UTC' });

    // Check for 48h disqualifications every hour
    cron.schedule('30 * * * *', () => this.checkDisqualifications(), { timezone: 'UTC' });

    // Terminal health recheck every 10 min
    cron.schedule('*/10 * * * *', () => this.recheckUnhealthyTerminals(), { timezone: 'UTC' });

    // Auto-start / auto-end challenges based on scheduled EAT times — runs every minute
    cron.schedule('* * * * *', () => this.checkChallengeLifecycle(), { timezone: 'UTC' });

    console.log('✅ VPS Pull Scheduler v2 started (shared queue, per-account eval, staging → live flush)');

    // Resume interrupted cycle on startup (after 5s delay for other services to init)
    setTimeout(() => this.resumeInterruptedCycle(), 5000);
  }

  /**
   * Pull queue — when a pull is triggered while another is running,
   * it's queued here and executed once the current one finishes.
   */
  private pullQueue: Array<{ type: 'scheduled' | 'force' | 'forceChallenge'; challengeId?: number }> = [];

  private queuePull(entry: { type: 'scheduled' | 'force' | 'forceChallenge'; challengeId?: number }) {
    // Don't queue duplicates
    const isDuplicate = this.pullQueue.some(q => q.type === entry.type && q.challengeId === entry.challengeId);
    if (!isDuplicate) {
      this.pullQueue.push(entry);
      console.log(`📋 VPS Pull: Queued ${entry.type}${entry.challengeId ? ` (challenge ${entry.challengeId})` : ''} — ${this.pullQueue.length} in queue`);
    }
  }

  private async drainQueue() {
    if (this.pullQueue.length === 0) return;
    const next = this.pullQueue.shift()!;
    console.log(`📋 VPS Pull: Draining queue — running ${next.type}${next.challengeId ? ` (challenge ${next.challengeId})` : ''} — ${this.pullQueue.length} remaining`);
    if (next.type === 'forceChallenge' && next.challengeId) {
      await this.runPullCycleForChallenge(next.challengeId);
    } else {
      await this.runPullCycle();
    }
  }

  /** Release the running lock and drain the queue if anything is waiting */
  private releaseLock() {
    this.releaseLock();
    // Drain queue after a short delay (let current stack unwind)
    if (this.pullQueue.length > 0) {
      setTimeout(() => this.drainQueue(), 2000);
    }
  }

  /**
   * Per-minute check: compare current EAT time against each challenge's pull_times.
   * If a match is found, trigger runPullCycle(). Queues if already running.
   */
  private pullScheduleTriggered = new Set<string>();

  private async checkPullSchedule() {
    try {
      const now = new Date();
      const eatTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      const currentHHMM = `${String(eatTime.getUTCHours()).padStart(2, '0')}:${String(eatTime.getUTCMinutes()).padStart(2, '0')}`;
      const dateKey = eatTime.toISOString().split('T')[0];

      const challenges = await db.query(
        `SELECT id, status, pull_times, end_date, evaluation_type, winners_posted_at
         FROM trading_challenges
         WHERE status IN ('active', 'reviewing')
           AND (status = 'active' OR (winners_posted_at IS NULL AND end_date > NOW() - INTERVAL '48 hours'))`
      );

      for (const challenge of challenges.rows) {
        const pullTimes: string[] = challenge.pull_times || ['00:00','04:00','08:00','12:00','16:00','20:00'];
        const dedupKey = `${challenge.id}_${currentHHMM}_${dateKey}`;

        if (pullTimes.includes(currentHHMM) && !this.pullScheduleTriggered.has(dedupKey)) {
          this.pullScheduleTriggered.add(dedupKey);
          for (const key of this.pullScheduleTriggered) {
            if (!key.includes(dateKey)) this.pullScheduleTriggered.delete(key);
          }
          console.log(`⏰ VPS Pull: Scheduled pull triggered for challenge ${challenge.id} at ${currentHHMM} EAT`);
          if (this.isRunning) {
            this.queuePull({ type: 'scheduled' });
          } else {
            this.runPullCycle();
          }
          return;
        }
      }
    } catch (e) {
      // Silent — runs every minute
    }
  }

  /**
   * Check if there's an incomplete pull cycle from before a reboot/deploy.
   * If staging has data but cycle wasn't completed, resume pulling remaining accounts.
   */
  private async resumeInterruptedCycle() {
    try {
      // Check if staging has data (means a cycle was in progress)
      const staging = await db.query(
        `SELECT DISTINCT challenge_id FROM wp_leaderboard_staging LIMIT 1`
      );
      if (staging.rows.length === 0) return; // No interrupted cycle

      const challengeId = staging.rows[0].challenge_id;

      // Get accounts already in staging (already pulled this cycle)
      const alreadyPulled = await db.query(
        `SELECT registration_id FROM wp_leaderboard_staging WHERE challenge_id = $1`,
        [challengeId]
      );
      const pulledIds = new Set(alreadyPulled.rows.map((r: any) => r.registration_id));

      // Get all accounts that should be pulled
      const allAccounts = await this.getAccountsToPull(challengeId);
      const remaining = allAccounts.filter(a => !pulledIds.has(a.registrationId));

      if (remaining.length === 0) {
        console.log(`📊 VPS Pull: Interrupted cycle for challenge ${challengeId} was actually complete. Staging ready for next flush.`);
        return;
      }

      console.log(`🔄 VPS Pull: Resuming interrupted cycle — ${remaining.length} accounts remaining (${pulledIds.size} already done)`);

      // Resume pulling remaining accounts
      if (this.isRunning) return;
      this.isRunning = true;

      const challenge = await this.resolveChallengeForPull();
      if (!challenge || challenge.id !== challengeId) {
        this.releaseLock();
        return;
      }

      const healthyTerminals = this.terminals.filter(t => t.isHealthy);
      if (healthyTerminals.length === 0) { this.releaseLock(); return; }

      // Load remaining into shared queue and process
      this.sharedQueue.load(remaining.map(a => ({ ...a, isPriority: false })));
      const batchId = await this.createPullBatch(challengeId, remaining.length);
      const allResults = await this.runSharedQueueWorkers(healthyTerminals, challenge, batchId);

      const successful = allResults.filter(r => r.success);
      const failed = allResults.filter(r => !r.success);
      const successfulAccounts = remaining.filter(a => successful.some(r => r.registrationId === a.registrationId));
      await this.inlineReconcile(challengeId, batchId, successfulAccounts, successful, healthyTerminals);
      await this.resolveNullOpenTimes(challengeId, batchId, successfulAccounts, healthyTerminals, challenge);
      await this.evaluateAllAccounts(challengeId, successfulAccounts, batchId);
      const newTrades = successful.reduce((sum, r) => sum + (r.tradesCount || 0), 0);
      await this.completePullBatch(batchId, successful.length, failed.length, newTrades, 'completed');

      console.log(`✅ VPS Pull: Resumed cycle complete — ${remaining.length} accounts processed`);

      this.releaseLock();
    } catch (error) {
      console.error('⚠️ VPS Pull: Resume interrupted cycle error:', error);
      this.releaseLock();
    }
  }

  /**
   * Main pull cycle — shared queue architecture
   */
  async runPullCycle() {
    if (this.isRunning) {
      this.queuePull({ type: 'scheduled' });
      return;
    }
    this.isRunning = true;
    this.cancelRequested = false;
    this.abortController = new AbortController();
    const startTime = Date.now();

    try {
      const challengeToPull = await this.resolveChallengeForPull();
      if (!challengeToPull) {
        this.releaseLock();
        return;
      }

      // Weekend logic
      if (await this.shouldSkipWeekend(challengeToPull)) {
        this.releaseLock();
        return;
      }

      // Determine if this is a final sync (Saturday OR challenge ended)
      const isChallengeEnded = challengeToPull.status === 'reviewing' || challengeToPull.status === 'completed';
      const isFinalSync = this.isSaturdayFinalSync() || isChallengeEnded;

      // === STEP 1: Build shared queue with failed-first priority ===
      const accounts = await this.getAccountsToPull(challengeToPull.id);
      if (accounts.length === 0) {
        console.log('📊 VPS Pull: No accounts to pull');
        this.releaseLock();
        return;
      }

      // Mark priority accounts (failed in last cycle)
      const lastFailures = await leaderboardService.getLastCycleFailures(challengeToPull.id);
      const prioritySet = new Set(lastFailures);
      const accountsWithPriority = accounts.map(a => ({
        ...a,
        isPriority: prioritySet.has(a.registrationId),
      }));

      const priorityCount = accountsWithPriority.filter(a => a.isPriority).length;
      console.log(`📊 VPS Pull: Starting — ${accounts.length} accounts (${priorityCount} priority), ${this.getHealthyTerminalCount()} healthy terminals`);

      // Reset per-cycle state
      this.terminals.forEach(t => { t.totalProcessed = 0; t.totalSuccess = 0; t.totalFailed = 0; t.isHealthy = true; t.consecutiveFailures = 0; });
      this.credentialFailureCache.clear();
      await this.clearRouterCredentialCache();

      // Create batch record
      const batchId = await this.createPullBatch(challengeToPull.id, accounts.length);

      // Load shared queue
      this.sharedQueue.load(accountsWithPriority);

      // === STEP 3: Process with shared queue (terminals grab work) ===
      const healthyTerminals = this.terminals.filter(t => t.isHealthy);
      console.log(`📊 VPS Pull: ${healthyTerminals.length} healthy terminals available: ${healthyTerminals.map(t => `T${t.id}`).join(', ')}`);
      if (healthyTerminals.length === 0) {
        console.error('❌ VPS Pull: ALL terminals unhealthy! Aborting.');
        await this.completePullBatch(batchId, 0, accounts.length, 0, 'all_terminals_unhealthy');
        await this.reportCriticalFailure(challengeToPull, 'All 10 terminals are unhealthy.');
        this.releaseLock();
        return;
      }

      // Launch terminal workers (they pull from shared queue)
      const allResults = await this.runSharedQueueWorkers(healthyTerminals, challengeToPull, batchId);

      // If admin cancelled — skip retry, leaderboard, and reporting; just clean up
      if (this.cancelRequested) {
        console.log('🛑 VPS Pull: Cancelled — skipping retry/leaderboard steps');
        this.releaseLock();
        this.cancelRequested = false;
        return;
      }

      // === STEP 4: Retry + credential confirmation are now handled INSIDE the shared
      // queue itself (see terminalWorker / SharedQueue.requeueForRetry /
      // requeueForConfirmation). runSharedQueueWorkers() above only returns once the
      // queue is completely empty — every account is either a final success, a
      // CONFIRMED invalid_credentials, or a retry_exhausted failure after
      // MAX_ACCOUNT_ATTEMPTS attempts. No separate retry phases needed here.
      {
        const stillUnresolved = allResults.filter(r => !r.success && r.errorCode === 'credential_suspect');
        if (stillUnresolved.length > 0) {
          // Should not normally happen — queue only empties once every account reaches
          // a terminal state. Log loudly so it's visible if it ever does.
          console.warn(`⚠️ VPS Pull: ${stillUnresolved.length} accounts ended in credential_suspect (unconfirmed) — investigate`);
        }
      }

      // === STEP 5: Categorize final results ===
      const successful = allResults.filter(r => r.success);
      const credentialFailures = allResults.filter(r => !r.success && r.errorCode === 'invalid_credentials');
      const otherFailures = allResults.filter(r => !r.success && r.errorCode !== 'invalid_credentials');

      // Handle credential failures — notify users.
      // NOTE: terminalWorker already calls handleCredentialFailure() immediately the
      // instant each account is confirmed (so the DB write survives an interrupted
      // cycle). handleCredentialFailure() is idempotent — this loop is just a safety
      // net in case any slipped through (e.g. an error swallowed the immediate call).
      for (const failure of credentialFailures) {
        await this.handleCredentialFailure(failure, challengeToPull);
      }

      // Bulk update pull statuses
      await this.bulkUpdatePullStatus(allResults);

      // Log errors
      for (const failure of [...credentialFailures, ...otherFailures]) {
        await this.logPullError(batchId, failure);
      }

      // === PHASES 2-5 with timing ===
      const phaseTimes: { pull: number; resolve: number; settle: number; ohlc: number; evaluate: number } = { pull: 0, resolve: 0, settle: 0, ohlc: 0, evaluate: 0 };
      phaseTimes.pull = Math.round((Date.now() - startTime) / 1000); // Phase 1 just finished

      const successfulAccounts = accountsWithPriority.filter(a => successful.some(r => r.registrationId === a.registrationId));

      // Phase 2: Inline reconcile + resolve null open times
      const resolveStart = Date.now();
      await db.query(`UPDATE wp_pull_batches SET phase = 'resolving' WHERE id = $1`, [batchId]).catch(() => {});
      await this.inlineReconcile(challengeToPull.id, batchId, successfulAccounts, successful, healthyTerminals);
      await this.resolveNullOpenTimes(challengeToPull.id, batchId, successfulAccounts, healthyTerminals, challengeToPull);
      phaseTimes.resolve = Math.round((Date.now() - resolveStart) / 1000);

      // Phase 3: 30s settle delay
      const settleStart = Date.now();
      await db.query(`UPDATE wp_pull_batches SET phase = 'settling' WHERE id = $1`, [batchId]).catch(() => {});
      console.log('📊 VPS Pull: Waiting 30s for terminals to settle before OHLC...');
      await this.delay(30000);
      phaseTimes.settle = Math.round((Date.now() - settleStart) / 1000);

      // Phase 4: OHLC UPDATE
      const ohlcStart = Date.now();
      await db.query(`UPDATE wp_pull_batches SET phase = 'ohlc' WHERE id = $1`, [batchId]).catch(() => {});
      await this.updateOhlcCandles(challengeToPull).catch(e =>
        console.error('⚠️ OHLC update error (non-fatal):', e)
      );
      phaseTimes.ohlc = Math.round((Date.now() - ohlcStart) / 1000);

      // Phase 5: Evaluate
      const evalStart = Date.now();
      await db.query(`UPDATE wp_pull_batches SET phase = 'evaluating' WHERE id = $1`, [batchId]).catch(() => {});
      await this.evaluateAllAccounts(challengeToPull.id, successfulAccounts, batchId, successful);
      phaseTimes.evaluate = Math.round((Date.now() - evalStart) / 1000);

      // === POST-EVAL: Retry SL checks for trades still pending (missing OHLC) ===
      await this.postEvalSlRetry(challengeToPull);

      // Complete batch — save phase timings
      const newTrades = successful.reduce((sum, r) => sum + (r.tradesCount || 0), 0);
      await this.completePullBatch(batchId, successful.length, credentialFailures.length + otherFailures.length, newTrades, 'completed');
      await db.query(
        `UPDATE wp_pull_batches SET phase_times = $1 WHERE id = $2`,
        [JSON.stringify(phaseTimes), batchId]
      ).catch(() => {});
      await this.savePullTerminalStats(batchId);

      // Log phase breakdown
      console.log(`📊 Phase timing: Pull=${phaseTimes.pull}s | Resolve=${phaseTimes.resolve}s | Settle=${phaseTimes.settle}s | OHLC=${phaseTimes.ohlc}s | Evaluate=${phaseTimes.evaluate}s | Total=${phaseTimes.pull + phaseTimes.resolve + phaseTimes.settle + phaseTimes.ohlc + phaseTimes.evaluate}s`);

      // === STEP 6: Flush staging → live + update rankings after every cycle ===
      // Runs immediately after pull+evaluation so users always see current data,
      // not data from the previous cycle. The start-of-cycle flush (step 1) stays
      // as a safety net but will be a no-op once staging is cleared here.
      if (successful.length > 0) {
        const flushLabel = isFinalSync ? 'Final sync' : 'Cycle complete';
        console.log(`📊 VPS Pull: ${flushLabel} — flushing staging + updating leaderboard`);
        await leaderboardService.flushStagingToLive(challengeToPull.id);
        await leaderboardService.ensureAllParticipantsHaveEntries(challengeToPull.id);
        await leaderboardService.updateRankings(challengeToPull.id);
      }

      // === STEP 7: Auto-DQ users who can't meet min_active_days (challenge ended) ===
      if (isChallengeEnded) {
        try {
          const rulesResult = await db.query(
            `SELECT parameters FROM wp_challenge_rules WHERE challenge_id = $1 AND rule_code = 'config'`,
            [challengeToPull.id]
          );
          const minActiveDays = rulesResult.rows[0]?.parameters?.min_active_days || 0;

          if (minActiveDays > 0) {
            // DQ users with fewer active days than required (including 0 trades)
            const underperformers = await db.query(
              `SELECT r.id, r.account_number, r.username, COALESCE(l.active_days, 0) as active_days
               FROM trading_registrations r
               LEFT JOIN wp_leaderboard l ON r.id = l.registration_id
               WHERE r.challenge_id = $1
                 AND r.disqualified = false
                 AND (COALESCE(l.active_days, 0) < $2)`,
              [challengeToPull.id, minActiveDays]
            );

            if (underperformers.rows.length > 0) {
              for (const u of underperformers.rows) {
                await db.query(
                  `UPDATE trading_registrations SET disqualified = true, disqualified_at = NOW(), disqualified_reason = $1 WHERE id = $2 AND disqualified = false`,
                  [`Did not meet minimum ${minActiveDays} active trading days (traded ${u.active_days} days)`, u.id]
                );
                await db.query(
                  `UPDATE wp_leaderboard SET is_disqualified = true, disqualify_reason = $1 WHERE registration_id = $2`,
                  [`Did not meet minimum ${minActiveDays} active days (${u.active_days}/${minActiveDays})`, u.id]
                );
              }
              console.log(`📊 VPS Pull: Auto-DQ'd ${underperformers.rows.length} users for insufficient active days`);

              // Re-rank after DQs
              await leaderboardService.updateRankings(challengeToPull.id);
            }
          }
        } catch (e) {
          console.error('⚠️ Auto-DQ check error:', e);
        }
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      const terminalSummary = this.terminals.map(t => `T${t.id}:${t.isHealthy ? '✓' : '✗'}`).join(' ');
      console.log(`✅ VPS Pull: Done in ${duration}s — ${successful.length}✓ ${credentialFailures.length}🔑 ${otherFailures.length}✗ | ${terminalSummary}`);

      // Log per-terminal distribution (verify work stealing is balanced)
      const terminalStats = this.terminals
        .filter(t => t.totalProcessed > 0)
        .map(t => `T${t.id}:${t.totalSuccess}✓/${t.totalProcessed}`)
        .join(' ');
      if (terminalStats) {
        console.log(`📊 Terminal distribution: ${terminalStats}`);
      }

      // === POST-CYCLE: Report unresolved candle check failures to admin ===
      await this.reportCandleFailures(challengeToPull.id, duration);

      // Report to admin
      await this.maybeReportToAdmin(challengeToPull, successful, credentialFailures, otherFailures, duration);

    } catch (error) {
      console.error('❌ VPS Pull: Cycle crashed:', error);
      try {
        await this.bot.bot.telegram.sendMessage(config.adminUserId,
          `❌ <b>VPS Pull Cycle Crashed</b>\n\n<code>${(error as Error).message}</code>`,
          { parse_mode: 'HTML' });
      } catch (e) {}
    } finally {
      this.releaseLock();
      this.cancelRequested = false;
      this.abortController = null;
    }
  }

  /**
   * Run pull cycle for a specific challenge ID — bypasses status checks.
   * Used by admin "Full Pull + Evaluate + Rank" button.
   */
  async runPullCycleForChallenge(challengeId: number) {
    if (this.isRunning) {
      console.log('🛑 VPS Pull: Admin force pull — cancelling running cycle...');
      this.cancelPull();
      // Wait up to 60s for the running cycle to release the lock
      const waited = await this.waitForIdle(60000);
      if (!waited) {
        console.error('❌ VPS Pull: Running cycle did not release within 60s — forcing lock reset');
        this.releaseLock();
        this.cancelRequested = false;
        this.abortController = null;
      }
      console.log('✅ VPS Pull: Previous cycle cleared — starting admin force pull');
    }
    this.isRunning = true;
    this.cancelRequested = false;
    this.abortController = new AbortController();
    const startTime = Date.now();
    let batchId: number | null = null;
    let accounts: AccountToPull[] = [];

    try {
      // Load challenge directly by ID — no status check (force pulls work at any status)
      const challengeResult = await db.query(
        `SELECT id, title, type, status, start_date, end_date, starting_balance, target_balance, evaluation_type, winners_posted_at FROM trading_challenges WHERE id = $1`,
        [challengeId]
      );
      if (challengeResult.rows.length === 0) {
        console.log(`⚠️ VPS Pull: Challenge ${challengeId} not found`);
        return;
      }
      const challengeToPull = challengeResult.rows[0];
      console.log(`📊 VPS Pull: Admin full pull for "${challengeToPull.title}" (status: ${challengeToPull.status})`);

      // Build shared queue — forceAll=true bypasses all filters (admin override)
      accounts = await this.getAccountsToPull(challengeId, true);
      if (accounts.length === 0) {
        console.log('📊 VPS Pull: No accounts to pull');
        return;
      }

      console.log(`📊 VPS Pull: ${accounts.length} accounts, ${this.getHealthyTerminalCount()} healthy terminals`);
      this.terminals.forEach(t => { t.totalProcessed = 0; t.totalSuccess = 0; t.totalFailed = 0; t.isHealthy = true; t.consecutiveFailures = 0; });
      this.credentialFailureCache.clear();
      await this.clearRouterCredentialCache();

      batchId = await this.createPullBatch(challengeId, accounts.length);
      this.sharedQueue.load(accounts.map(a => ({ ...a, isPriority: false })));

      const healthyTerminals = this.terminals.filter(t => t.isHealthy);
      console.log(`📊 VPS Pull (admin): ${healthyTerminals.length} healthy terminals: ${healthyTerminals.map(t => `T${t.id}`).join(', ')}`);
      if (healthyTerminals.length === 0) {
        console.error('❌ VPS Pull: ALL terminals unhealthy');
        await this.completePullBatch(batchId, 0, accounts.length, 0, 'all_terminals_unhealthy');
        batchId = null;
        return;
      }

      const allResults = await this.runSharedQueueWorkers(healthyTerminals, challengeToPull, batchId);

      if (this.cancelRequested) {
        console.log('🛑 VPS Pull: Admin pull cancelled');
        await this.completePullBatch(batchId, 0, accounts.length, 0, 'cancelled').catch(() => {});
        batchId = null;
        return;
      }

      // Retry + credential confirmation already happened INSIDE the shared queue
      // (runSharedQueueWorkers only returns once the queue is fully empty — every
      // account is success, confirmed invalid_credentials, or retry_exhausted).
      const adminUnconfirmed = allResults.filter(r => !r.success && r.errorCode === 'credential_suspect');
      if (adminUnconfirmed.length > 0) {
        console.warn(`⚠️ VPS Admin Pull: ${adminUnconfirmed.length} accounts ended in credential_suspect (unconfirmed) — investigate`);
      }

      const successful = allResults.filter(r => r.success);
      const failed = allResults.filter(r => !r.success);

      // === PHASES 2-5 with timing ===
      const phaseTimes: { pull: number; resolve: number; settle: number; ohlc: number; evaluate: number } = { pull: 0, resolve: 0, settle: 0, ohlc: 0, evaluate: 0 };
      phaseTimes.pull = Math.round((Date.now() - startTime) / 1000);

      const successfulAccounts = accounts.filter(a => successful.some(r => r.registrationId === a.registrationId));

      // Phase 2: Resolve
      const resolveStart = Date.now();
      await db.query(`UPDATE wp_pull_batches SET phase = 'resolving' WHERE id = $1`, [batchId]).catch(() => {});
      await this.inlineReconcile(challengeId, batchId, successfulAccounts, successful, healthyTerminals);
      await this.resolveNullOpenTimes(challengeId, batchId, successfulAccounts, healthyTerminals, challengeToPull);
      phaseTimes.resolve = Math.round((Date.now() - resolveStart) / 1000);

      // Phase 3: Settle
      const settleStart = Date.now();
      await db.query(`UPDATE wp_pull_batches SET phase = 'settling' WHERE id = $1`, [batchId]).catch(() => {});
      console.log('📊 VPS Pull: Waiting 30s for terminals to settle before OHLC...');
      await this.delay(30000);
      phaseTimes.settle = Math.round((Date.now() - settleStart) / 1000);

      // Phase 4: OHLC
      const ohlcStart = Date.now();
      await db.query(`UPDATE wp_pull_batches SET phase = 'ohlc' WHERE id = $1`, [batchId]).catch(() => {});
      await this.updateOhlcCandles(challengeToPull).catch(e =>
        console.error('⚠️ OHLC update error (non-fatal):', e)
      );
      phaseTimes.ohlc = Math.round((Date.now() - ohlcStart) / 1000);

      // Phase 5: Evaluate
      const evalStart = Date.now();
      await db.query(`UPDATE wp_pull_batches SET phase = 'evaluating' WHERE id = $1`, [batchId]).catch(() => {});
      await this.evaluateAllAccounts(challengeId, successfulAccounts, batchId);
      phaseTimes.evaluate = Math.round((Date.now() - evalStart) / 1000);

      // === POST-EVAL: Retry SL checks for trades still pending (missing OHLC) ===
      await this.postEvalSlRetry(challengeToPull);

      const newTrades = successful.reduce((sum, r) => sum + (r.tradesCount || 0), 0);
      await this.completePullBatch(batchId, successful.length, failed.length, newTrades, 'completed');
      await db.query(`UPDATE wp_pull_batches SET phase_times = $1 WHERE id = $2`, [JSON.stringify(phaseTimes), batchId]).catch(() => {});
      const completedBatchId = batchId;
      batchId = null;
      await this.savePullTerminalStats(completedBatchId);

      // Log phase breakdown
      console.log(`📊 Phase timing: Pull=${phaseTimes.pull}s | Resolve=${phaseTimes.resolve}s | Settle=${phaseTimes.settle}s | OHLC=${phaseTimes.ohlc}s | Evaluate=${phaseTimes.evaluate}s | Total=${phaseTimes.pull + phaseTimes.resolve + phaseTimes.settle + phaseTimes.ohlc + phaseTimes.evaluate}s`);

      // Handle credential failures — set pull_status='password_changed' and notify users.
      // NOTE: terminalWorker already calls handleCredentialFailure() immediately the
      // instant each account is confirmed, so this survives the admin pull being
      // cancelled/interrupted partway through. This loop is just a safety net.
      const adminCredentialFailures = allResults.filter(r => !r.success && r.errorCode === 'invalid_credentials');
      for (const failure of adminCredentialFailures) {
        await this.handleCredentialFailure(failure, challengeToPull);
      }
      if (adminCredentialFailures.length > 0) {
        console.log(`🔑 VPS Admin Pull: ${adminCredentialFailures.length} credential failure(s) handled — users notified`);
      }

      await this.bulkUpdatePullStatus(allResults);
      await this.reportCandleFailures(challengeToPull.id, 0);

      // === FORCE PULL ONLY: Flush staging to live + update rankings immediately ===
      // Regular scheduled cycles flush at the START of the next cycle.
      // Force pull flushes right now so the admin sees correct stats instantly.
      await leaderboardService.flushStagingToLive(challengeToPull.id);
      await leaderboardService.ensureAllParticipantsHaveEntries(challengeToPull.id);
      await leaderboardService.updateRankings(challengeToPull.id);
      console.log(`📊 VPS Pull: Staging flushed to live — leaderboard updated`);

      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`✅ VPS Pull: Admin full pull done in ${duration}s — ${successful.length}✓ ${failed.length}✗ | ${newTrades} trades`);

    } catch (error) {
      console.error('❌ VPS Pull: Admin full pull crashed:', error);
      // Always mark batch as failed so pull-status stops showing it as running
      if (batchId !== null) {
        await this.completePullBatch(batchId, 0, accounts.length, 0, 'failed').catch(() => {});
      }
    } finally {
      this.releaseLock();
      this.cancelRequested = false;
      this.abortController = null;
    }
  }

  /**
   * Shared queue workers — each terminal grabs next account as it finishes
   * Fast terminals naturally process more accounts (work stealing)
   */
  private async runSharedQueueWorkers(
    healthyTerminals: TerminalState[],
    challenge: TradingChallenge,
    batchId: number
  ): Promise<PullResult[]> {
    const allResults: PullResult[] = [];
    const resultsMutex = { results: allResults }; // Reference for workers
    const batchStart = Date.now();
    const WATCHDOG_NO_PROGRESS_MS = 5 * 60 * 1000; // 5 min with 0 processed = auto-cancel

    // Watchdog: if no account finishes within 5 minutes, abort the entire batch
    const watchdog = setInterval(() => {
      if (resultsMutex.results.length === 0 && Date.now() - batchStart > WATCHDOG_NO_PROGRESS_MS) {
        console.error('🚨 VPS Pull Watchdog: No progress in 5 minutes — auto-cancelling stuck batch');
        this.cancelRequested = true;
        this.abortController?.abort();
      }
    }, 30000); // check every 30s

    const workerPromises = healthyTerminals.map(terminal =>
      this.terminalWorker(terminal, challenge, batchId, resultsMutex)
    );

    await Promise.all(workerPromises);
    clearInterval(watchdog);
    return resultsMutex.results;
  }

  /**
   * Single terminal worker — keeps grabbing from shared queue until it's truly empty.
   *
   * Unified continuous-queue model:
   *   - credential_suspect (first -6) → requeueForConfirmation: front of queue, excluded
   *     from THIS terminal, so a different terminal confirms it next. No final result yet.
   *   - invalid_credentials (confirmed — either a 2nd -6 on a different terminal, or a
   *     cache hit) → final result, notify user later in Step 5.
   *   - other failures → requeueForRetry: back of queue, up to MAX_ACCOUNT_ATTEMPTS total
   *     attempts before being recorded as a final failure.
   *   - success → final result.
   *
   * The worker only stops when sharedQueue.next() returns null AND the queue is truly
   * empty. If next() returns null but the queue still has items (all of them currently
   * excluded from this terminal, awaiting a different terminal), it waits briefly and
   * checks again — this terminal simply has no eligible work RIGHT NOW.
   */
  private async terminalWorker(
    terminal: TerminalState,
    challenge: TradingChallenge,
    batchId: number,
    resultsMutex: { results: PullResult[] }
  ): Promise<void> {
    while (true) {
      if (this.cancelRequested) break; // Admin cancelled

      const account = this.sharedQueue.next(terminal.id, this.getHealthyTerminalCount());
      if (!account) {
        if (this.sharedQueue.isEmpty) break; // Truly done
        // Queue has work, but none of it is eligible for this terminal right now
        // (e.g. the only remaining items are excluded from this terminal, awaiting
        // a different terminal to free up). Wait briefly and check again.
        await this.delay(300);
        continue;
      }

      // Check terminal health
      if (!terminal.isHealthy) {
        // Put account back and stop this worker
        this.sharedQueue.requeue(account);
        break;
      }

      const result = await this.pullSingleAccount(account, terminal.id, challenge, this.abortController?.signal);
      terminal.totalProcessed++;

      if (result.success) {
        terminal.totalSuccess++;
        terminal.consecutiveFailures = 0;
        resultsMutex.results.push(result);
        this.sharedQueue.done(account.registrationId, account.accountNumber);

        // Save VPS balance/equity and mark pull time for progress tracking
        if (result.balance !== undefined || result.equity !== undefined) {
          await db.query(
            `UPDATE trading_registrations
             SET last_known_balance = COALESCE($1, last_known_balance),
                 last_known_equity  = COALESCE($2, last_known_equity),
                 last_pull_at = NOW()
             WHERE id = $3`,
            [result.balance ?? null, result.equity ?? null, account.registrationId]
          ).catch(() => {});
        } else {
          await db.query(`UPDATE trading_registrations SET last_pull_at = NOW() WHERE id = $1`, [account.registrationId]).catch(() => {});
        }

        // Store balance operations (deposits / withdrawals) from this pull
        await this.storeBalanceOps(challenge.id, account.registrationId, account.accountNumber, result.balance_ops || [], result.balance ?? 0);

        // NOTE: per-account evaluation used to run here immediately (streaming).
        // It now runs in a deferred phase 3, AFTER the phase 2 null-open-time
        // resolution pass completes for the whole batch — see resolveNullOpenTimes()
        // and evaluateAllAccounts(), called from each pull-cycle entry point once
        // runSharedQueueWorkers() returns. This guarantees evaluation never reads a
        // trade with a still-fixable NULL open_time.
      } else if (result.errorCode === 'credential_suspect') {
        // First -6 on this terminal — NOT a final result. Terminal stays healthy
        // (this was a clean credential rejection, not a terminal fault).
        // Route to a different terminal for confirmation.
        console.log(`🔑 VPS Pull: ${account.accountNumber} got -6 on T${terminal.id} — routing to a different terminal for confirmation`);
        this.sharedQueue.requeueForConfirmation(account, terminal.id);
      } else if (result.errorCode === 'invalid_credentials') {
        // Confirmed (2nd terminal also -6, or cache hit). Do NOT update last_pull_at —
        // preserve the last successful pull timestamp so the next cycle's incremental
        // window covers from the last real pull.
        resultsMutex.results.push(result);
        terminal.totalFailed++;
        this.sharedQueue.done(account.registrationId, account.accountNumber);

        // Persist pull_status='password_changed' to the DB IMMEDIATELY — do not wait
        // for the end of the cycle. Confirmation state (credentialFailureCache, the
        // SharedQueue exclusion bookkeeping) lives only in memory and is wiped the
        // instant this cycle is interrupted (VPS reboot, scheduler redeploy/restart,
        // or an admin force-pull cancelling the running cycle via cancelPull()). If we
        // wait until Step 5's batch loop to write this, an interrupted cycle forgets
        // the confirmation entirely and the account burns ANOTHER two real logins on
        // two more terminals the next time anything touches it. Writing it here makes
        // the confirmation durable the moment it happens, no matter what happens after.
        // handleCredentialFailure() is idempotent (checks pull_status before doing
        // anything), so the Step 5 loop calling it again afterward is a harmless no-op.
        try {
          await this.handleCredentialFailure(result, challenge);
        } catch (e) {
          console.error(`⚠️ VPS Pull: Immediate credential-failure persistence failed for ${result.accountNumber}:`, e);
        }
      } else {
        // Non-credential (terminal/network) error
        terminal.consecutiveFailures++;
        if (terminal.consecutiveFailures >= TERMINAL_FAILURE_THRESHOLD) {
          terminal.isHealthy = false;
          terminal.unhealthySince = new Date();
          console.log(`⚠️ Terminal ${terminal.id} marked UNHEALTHY`);
          // Terminal itself is the problem — plain requeue, doesn't consume an attempt
          this.sharedQueue.requeue(account);
          break;
        }
        this.sharedQueue.done(account.registrationId, account.accountNumber);
        const requeued = this.sharedQueue.requeueForRetry(account);
        if (!requeued) {
          // Exhausted MAX_ACCOUNT_ATTEMPTS — final failure
          result.errorCode = 'retry_exhausted';
          result.errorMessage = `Failed after ${MAX_ACCOUNT_ATTEMPTS} attempts: ${result.errorMessage || ''}`;
          resultsMutex.results.push(result);
          terminal.totalFailed++;
        }
      }

      await this.delay(BATCH_DELAY_MS);
    }
  }

  // NOTE: retryCycleFailures() and retryOnHealthyTerminals() were removed — the
  // unified continuous shared-queue model (SharedQueue.requeueForRetry /
  // requeueForConfirmation, driven from terminalWorker) now handles all retries
  // and credential confirmation INSIDE runSharedQueueWorkers(). See terminalWorker
  // for the full logic.

  /**
   * Pull a single account with retry logic
   */
  private async pullSingleAccount(account: AccountToPull, terminalId: number, challenge?: any, abortSignal?: AbortSignal): Promise<PullResult> {
    // Cache hit — this account's credentials are already confirmed bad this cycle.
    // Keyed by NORMALIZED accountNumber (digits only) so "#161600472", "161 600 472",
    // and "161600472" all resolve to the same key regardless of DB formatting.
    // Return instantly with zero HTTP requests and zero terminal contact.
    if (this.credentialFailureCache.has(normalizeAccountNumber(account.accountNumber))) {
      console.log(`🔑 VPS Pull: ${account.accountNumber} skipped — credential failure cached (no terminal contact)`);
      return {
        registrationId: account.registrationId,
        accountNumber: account.accountNumber,
        userId: account.userId,
        username: account.username,
        success: false,
        errorCode: 'invalid_credentials',
        errorMessage: 'Credential failure confirmed earlier this cycle',
        terminalId,
      };
    }

    // Is this dispatch the SECOND-terminal confirmation of an earlier -6?
    // (account.excludedTerminalId is only ever set by SharedQueue.requeueForConfirmation,
    // and next() guarantees this dispatch went to a DIFFERENT terminal than the one that
    // set it — so reaching here with excludedTerminalId set means this terminal IS the
    // confirmation attempt.)
    const isConfirmation = account.excludedTerminalId !== undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES_PER_ACCOUNT; attempt++) {
      try {
        // Pull strategy:
        // - Challenge ended (status = reviewing): FULL pull from challenge start (final sync)
        // - First pull (lastPullAt is null): FULL pull from challenge start
        // - Midnight (00:00 EAT) run, NOT the challenge's first night: 25h safety pull
        //   (previous day's midnight -1h to now), with extended_sync so the VPS worker
        //   waits longer for MT5 history sync. Skipped on the first night since
        //   auto-start already does its own full pull that night.
        // - Subsequent pulls during active challenge: incremental (5h window)
        // - Orders always fetch from challenge start (lightweight, provides open_time/open_price)
        const challengeStartDate = challenge?.start_date ? new Date(challenge.start_date).toISOString() : undefined;
        const isChallengeEnded = challenge?.status === 'reviewing' || challenge?.status === 'completed';
        let fromDate: string;
        let extendedSync = false;

        if (isChallengeEnded || !account.lastPullAt) {
          // Full pull: challenge ended (final sync) OR first-ever pull
          fromDate = challengeStartDate || new Date(2020, 0, 1).toISOString();
        } else if (challenge && this.isMidnightEATRun() && !this.isFirstNightSinceChallengeStart(challenge)) {
          // 25h daily safety pull: yesterday's midnight EAT, minus 1h overlap, to now.
          const now = new Date();
          const nowEAT = new Date(now.getTime() + 3 * 60 * 60 * 1000);
          const yesterdayMidnightEAT = new Date(Date.UTC(
            nowEAT.getUTCFullYear(), nowEAT.getUTCMonth(), nowEAT.getUTCDate() - 1, 0, 0, 0
          ));
          // Convert back to UTC instant, then subtract 1h overlap.
          const yesterdayMidnightUTC = new Date(yesterdayMidnightEAT.getTime() - 3 * 60 * 60 * 1000);
          const safetyFrom = new Date(yesterdayMidnightUTC.getTime() - 60 * 60 * 1000);
          fromDate = safetyFrom.toISOString();
          extendedSync = true;
          console.log(`🌙 VPS Pull: 25h midnight safety pull for ${account.accountNumber} — from ${fromDate}`);
        } else {
          // Incremental: last 5 hours (4h window + 1h overlap for confidence)
          const now = new Date();
          const incrementalFrom = new Date(now.getTime() - 5 * 60 * 60 * 1000);
          fromDate = incrementalFrom.toISOString();
        }

        const ordersFromDate = challengeStartDate || fromDate;

        const requestBody: any = {
          account: account.accountNumber,
          server: account.server,
          password: account.investorPassword,
          api_key: this.apiKey,
          terminal_id: terminalId,
          from_date: fromDate,
          orders_from_date: ordersFromDate,
        };
        if (extendedSync) {
          requestBody.extended_sync = true;
        }

        const response = await axios.post(
          `${this.baseUrl}/pull`,
          requestBody,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: ACCOUNT_TIMEOUT_MS,
            signal: abortSignal,
          }
        );

        const data = response.data;

        if (data.success) {
          const tradesCount = data.trades?.length || 0;
          const dealsCount = data.deals?.length || 0;
          if (tradesCount > 0) await this.saveTrades(account, data.trades);
          if (dealsCount > 0) await this.saveDeals(account, data.deals);

          return {
            registrationId: account.registrationId,
            accountNumber: account.accountNumber,
            userId: account.userId,
            username: account.username,
            success: true,
            tradesCount,
            dealsCount,
            balance: data.balance,
            equity: data.equity,
            balance_ops: data.balance_ops || [],
            positionIds: data.position_ids || [],
            terminalId,
          };
        }

        // Credential failure check — prefer explicit error_type field, fall back to message parsing
        const err = (data.message || '').toLowerCase();
        if (data.error_type === 'credential_failure' || err.includes('authorization') || err.includes('invalid') || err.includes('password') || err.includes('credential')) {
          if (isConfirmation) {
            // Second terminal also got -6 — CONFIRMED bad credentials.
            // Cache by normalized accountNumber — blocks all DB registrations for this MT5 account
            // regardless of formatting differences (#, spaces, commas)
            this.credentialFailureCache.add(normalizeAccountNumber(account.accountNumber));
            return {
              registrationId: account.registrationId,
              accountNumber: account.accountNumber,
              userId: account.userId,
              username: account.username,
              success: false,
              errorCode: 'invalid_credentials',
              errorMessage: data.message || 'Invalid credentials',
              terminalId,
            };
          }
          // First -6 on this terminal — not yet confirmed. The terminalWorker will route
          // this account to a DIFFERENT terminal for confirmation (front of queue, excluded
          // from this terminal). No caching yet, no notification yet.
          return {
            registrationId: account.registrationId,
            accountNumber: account.accountNumber,
            userId: account.userId,
            username: account.username,
            success: false,
            errorCode: 'credential_suspect',
            errorMessage: data.message || 'Possible invalid credentials — awaiting confirmation on a different terminal',
            terminalId,
          };
        }

        if (attempt < MAX_RETRIES_PER_ACCOUNT) {
          await this.delay(RETRY_DELAY_MS * attempt);
          continue;
        }

        return {
          registrationId: account.registrationId,
          accountNumber: account.accountNumber,
          userId: account.userId,
          username: account.username,
          success: false,
          errorCode: 'api_error',
          errorMessage: data.message || 'API returned failure',
          terminalId,
        };
      } catch (error: any) {
        // Abort signal fired (admin cancelled) — exit immediately, no retry
        if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED' || abortSignal?.aborted) {
          return {
            registrationId: account.registrationId,
            accountNumber: account.accountNumber,
            userId: account.userId,
            username: account.username,
            success: false,
            errorCode: 'cancelled',
            errorMessage: 'Pull cancelled by admin',
            terminalId,
          };
        }

        if (error.response?.status === 401 || error.response?.status === 422) {
          if (isConfirmation) {
            this.credentialFailureCache.add(normalizeAccountNumber(account.accountNumber));
            return {
              registrationId: account.registrationId,
              accountNumber: account.accountNumber,
              userId: account.userId,
              username: account.username,
              success: false,
              errorCode: 'invalid_credentials',
              errorMessage: error.response?.data?.message || 'Authentication failed',
              terminalId,
            };
          }
          return {
            registrationId: account.registrationId,
            accountNumber: account.accountNumber,
            userId: account.userId,
            username: account.username,
            success: false,
            errorCode: 'credential_suspect',
            errorMessage: error.response?.data?.message || 'Possible authentication failure — awaiting confirmation on a different terminal',
            terminalId,
          };
        }

        if (attempt < MAX_RETRIES_PER_ACCOUNT) {
          await this.delay(RETRY_DELAY_MS * attempt);
          continue;
        }

        return {
          registrationId: account.registrationId,
          accountNumber: account.accountNumber,
          userId: account.userId,
          username: account.username,
          success: false,
          errorCode: error.code === 'ECONNABORTED' ? 'timeout' : 'network_error',
          errorMessage: error.message || 'Connection failed',
          terminalId,
        };
      }
    }

    return {
      registrationId: account.registrationId,
      accountNumber: account.accountNumber,
      userId: account.userId,
      username: account.username,
      success: false,
      errorCode: 'max_retries',
      errorMessage: 'Exhausted retries',
      terminalId,
    };
  }

  // ==================== MANUAL RETRY (Admin) ====================

  /**
   * Retry a single account on demand (admin button).
   * Returns result for admin display.
   */
  async retrySingleAccount(registrationId: number, challengeId: number): Promise<PullResult & { evaluated?: boolean }> {
    const regResult = await db.query(
      `SELECT id, account_number, mt5_server, investor_password, user_id, username, nickname, last_pull_at
       FROM trading_registrations WHERE id = $1 AND challenge_id = $2`,
      [registrationId, challengeId]
    );
    if (regResult.rows.length === 0) {
      return {
        registrationId, accountNumber: '', userId: 0, username: null,
        success: false, errorCode: 'not_found', errorMessage: 'Registration not found',
      };
    }

    const reg = regResult.rows[0];
    const account: AccountToPull = {
      registrationId: reg.id,
      accountNumber: reg.account_number,
      server: reg.mt5_server,
      investorPassword: reg.investor_password,
      userId: reg.user_id,
      username: reg.username,
      nickname: reg.nickname,
      isPriority: true,
      lastPullAt: reg.last_pull_at ? new Date(reg.last_pull_at).toISOString() : null,
    };

    // Try on up to 3 healthy terminals
    const healthyTerminals = this.terminals.filter(t => t.isHealthy);
    if (healthyTerminals.length === 0) {
      return {
        registrationId, accountNumber: account.accountNumber,
        userId: account.userId, username: account.username,
        success: false, errorCode: 'no_terminals', errorMessage: 'All terminals unhealthy',
      };
    }

    const challengeData = await db.query(`SELECT id, start_date, status FROM trading_challenges WHERE id = $1`, [challengeId]);
    const terminalAttempts: { terminalId: number; errorCode: string; errorMessage: string }[] = [];

    for (let i = 0; i < Math.min(3, healthyTerminals.length); i++) {
      const terminal = healthyTerminals[i];
      const result = await this.pullSingleAccount(account, terminal.id, challengeData.rows[0]);

      if (result.success) {
        // Update status
        await db.query(
          `UPDATE trading_registrations SET last_pull_at = NOW(), pull_status = 'success', pull_error = NULL WHERE id = $1`,
          [registrationId]
        );

        // Store balance ops (deposits / withdrawals / swap / dividend)
        await this.storeBalanceOps(challengeId, registrationId, account.accountNumber, result.balance_ops || [], result.balance ?? 0);

        // Reconcile any missing trades, then resolve any NULL open_time trades, before evaluating
        try {
          await this.reconcileMissingTrades(challengeId, null, [account], [terminal], challengeData.rows[0]);
        } catch (e) {}
        try {
          await this.resolveNullOpenTimes(challengeId, null as any, [account], [terminal], challengeData.rows[0]);
        } catch (e) {}

        // Run evaluation
        let evaluated = false;
        try {
          await evaluationEngine.evaluateSingleAccount(challengeId, registrationId);
          evaluated = true;
        } catch (e) {}

        return { ...result, evaluated };
      }

      terminalAttempts.push({
        terminalId: terminal.id,
        errorCode:    result.errorCode    || 'unknown',
        errorMessage: result.errorMessage || 'Unknown error',
      });

      if (result.errorCode === 'invalid_credentials') {
        return { ...result, terminalAttempts };
      }

      await this.delay(RETRY_DELAY_MS);
    }

    const summary = terminalAttempts.map(a => `T${a.terminalId}: ${a.errorMessage}`).join(' · ');
    return {
      registrationId, accountNumber: account.accountNumber,
      userId: account.userId, username: account.username,
      success: false, errorCode: 'retry_exhausted',
      errorMessage: summary || 'Failed on all terminals',
      terminalAttempts,
    };
  }

  // ==================== HELPER: RESOLVE CHALLENGE ====================

  private async resolveChallengeForPull(): Promise<TradingChallenge | null> {
    const challenges = await tradingChallengeService.getActiveChallenges();
    const activeChallenge = challenges.find(c => c.status === 'active');

    if (activeChallenge) return activeChallenge;

    // Check for recently-ended challenge needing final sync pulls
    // After challenge ends (status = reviewing), do 2 more full pull cycles
    // to ensure all trades are captured with complete data
    const allChallenges = await tradingChallengeService.getAllChallenges();
    const recentlyEnded = allChallenges.find(c =>
      c.status === 'reviewing' &&
      (c.evaluation_type || 'winnerpip') === 'winnerpip' &&
      !c.winners_posted_at &&
      (Date.now() - new Date(c.end_date).getTime()) < 48 * 60 * 60 * 1000
    );

    if (recentlyEnded) {
      // Count how many pull batches have run since challenge ended
      const postEndPulls = await db.query(
        `SELECT COUNT(*) as cnt FROM wp_pull_batches 
         WHERE challenge_id = $1 AND started_at > $2 AND status = 'completed'`,
        [recentlyEnded.id, new Date(recentlyEnded.end_date).toISOString()]
      );
      const pullsSinceEnd = parseInt(postEndPulls.rows[0]?.cnt || '0');

      if (pullsSinceEnd < 2) {
        console.log(`📊 VPS Pull: Final full sync #${pullsSinceEnd + 1}/2 for "${recentlyEnded.title}"`);
        return recentlyEnded;
      } else {
        console.log(`📊 VPS Pull: "${recentlyEnded.title}" — 2 final syncs complete. No more pulls needed.`);
        return null;
      }
    }

    console.log('📊 VPS Pull: No active or recently-ended challenge');
    return null;
  }

  // ==================== HELPER: WEEKEND LOGIC ====================

  private async shouldSkipWeekend(challenge: TradingChallenge): Promise<boolean> {
    const now = new Date();
    const eatTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const dayOfWeek = eatTime.getUTCDay();
    const hourEAT = eatTime.getUTCHours();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (!isWeekend) return false;

    const weekendAllowed = await this.isWeekendTradingAllowed(challenge.id);
    if (weekendAllowed) {
      console.log('📊 VPS Pull: Weekend trading allowed — running normal pull');
      return false;
    }

    // Saturday first pull (06:00 EAT) always runs as sync check
    if (dayOfWeek === 6 && hourEAT === 6) {
      console.log('📊 VPS Pull: Saturday sync check — capturing Friday close data');
      return false;
    }

    console.log(`📊 VPS Pull: Weekend skip (${dayOfWeek === 6 ? 'Sat' : 'Sun'} ${hourEAT}:00 EAT)`);
    return true;
  }

  private isSaturdayFinalSync(): boolean {
    const now = new Date();
    const eatTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    return eatTime.getUTCDay() === 6 && eatTime.getUTCHours() === 6;
  }

  // ==================== HELPER: MIDNIGHT 25H SAFETY PULL ====================

  /**
   * True only during the 00:00 EAT scheduled run (UTC hour 21).
   * This is one of the 6 daily cron slots ('0 21,1,5,9,13,17 * * *').
   */
  private isMidnightEATRun(): boolean {
    const now = new Date();
    const eatTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    return eatTime.getUTCHours() === 0;
  }

  /**
   * True if "today" (EAT) is the same calendar day the challenge started, i.e.
   * this midnight run would be the FIRST midnight since challenge start.
   * On that first night, auto-start already ran its own full pull — so the
   * 25h safety-pull logic should NOT apply (it would just duplicate work).
   * From the next midnight onward, this returns false and the 25h window kicks in.
   */
  private isFirstNightSinceChallengeStart(challenge: TradingChallenge): boolean {
    if (!challenge?.start_date) return true; // safe default: skip 25h logic if unknown
    const now = new Date();
    const nowEAT = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const startEAT = new Date(new Date(challenge.start_date).getTime() + 3 * 60 * 60 * 1000);

    const todayKey = `${nowEAT.getUTCFullYear()}-${nowEAT.getUTCMonth()}-${nowEAT.getUTCDate()}`;
    const startKey = `${startEAT.getUTCFullYear()}-${startEAT.getUTCMonth()}-${startEAT.getUTCDate()}`;

    return todayKey === startKey;
  }

  private async isWeekendTradingAllowed(challengeId: number): Promise<boolean> {
    try {
      const result = await db.query(
        `SELECT parameters FROM wp_challenge_rules WHERE challenge_id = $1 AND rule_code = 'config'`,
        [challengeId]
      );
      if (result.rows.length > 0) {
        return result.rows[0].parameters?.weekend_trading === true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ==================== TERMINAL HEALTH ====================

  private async recheckUnhealthyTerminals() {
    const unhealthy = this.terminals.filter(t => !t.isHealthy && t.unhealthySince);
    if (unhealthy.length === 0) return;

    for (const terminal of unhealthy) {
      const elapsed = Date.now() - (terminal.unhealthySince?.getTime() || 0);
      if (elapsed < TERMINAL_HEALTH_RECHECK_MS) continue;

      console.log(`🔍 VPS Pull: Health-checking terminal ${terminal.id}...`);
      const healthy = await this.checkTerminalHealth(terminal.id);

      if (healthy) {
        terminal.isHealthy = true;
        terminal.consecutiveFailures = 0;
        terminal.unhealthySince = null;
        console.log(`✅ Terminal ${terminal.id} recovered`);
      } else {
        console.log(`❌ Terminal ${terminal.id} still unhealthy`);
        try {
          await this.bot.bot.telegram.sendMessage(config.adminUserId,
            `⚠️ <b>VPS Terminal ${terminal.id} Unhealthy</b>\n\n` +
            `Down since ${terminal.unhealthySince?.toISOString()}\n` +
            `Healthy terminals: ${this.getHealthyTerminalCount()}/${MAX_TERMINALS}`,
            { parse_mode: 'HTML' });
        } catch (e) {}
        terminal.unhealthySince = new Date();
      }
    }
  }

  /**
   * Clears the router-level global credential failure cache.
   * Called at the start of each pull cycle so accounts with recently-fixed
   * credentials get a fresh attempt.
   */
  private async clearRouterCredentialCache(): Promise<void> {
    try {
      await axios.post(`${this.baseUrl}/clear-credential-cache`, { api_key: this.apiKey }, { timeout: 5000 });
      console.log('🗑️ VPS Pull: Router global credential cache cleared');
    } catch (e: any) {
      console.warn('⚠️ VPS Pull: Failed to clear router credential cache (non-fatal):', e.message);
    }
  }

  private async checkTerminalHealth(_terminalId: number): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, { timeout: 15000 });
      return response.status === 200 && response.data?.status === 'ok';
    } catch {
      return false;
    }
  }

  private getHealthyTerminalCount(): number {
    return this.terminals.filter(t => t.isHealthy).length;
  }

  // ==================== DATA HELPERS ====================

  private async getAccountsToPull(challengeId: number, forceAll = false): Promise<AccountToPull[]> {
    // First, clear zero_balance_at for accounts that have 0 trades (haven't started, not blown)
    await db.query(
      `UPDATE wp_leaderboard SET zero_balance_at = NULL WHERE challenge_id = $1 AND total_trades = 0 AND zero_balance_at IS NOT NULL`,
      [challengeId]
    ).catch(() => {});

    // Check if we should exclude late depositors (0 balance, 0 trades, not enough days left)
    // Skip entirely for force pulls — admin override pulls everything without triggering auto-DQ side effects
    let lateExcludeIds: number[] = [];
    if (!forceAll) try {
      const challengeInfo = await db.query(
        `SELECT end_date FROM trading_challenges WHERE id = $1`, [challengeId]);
      const rulesInfo = await db.query(
        `SELECT parameters FROM wp_challenge_rules WHERE challenge_id = $1 AND rule_code = 'config'`, [challengeId]);
      const minActiveDays = rulesInfo.rows[0]?.parameters?.min_active_days || 0;
      const endDate = challengeInfo.rows[0]?.end_date;

      if (minActiveDays > 0 && endDate) {
        // Calculate remaining TRADING days (weekdays only)
        const now = new Date();
        const end = new Date(endDate);
        let tradingDaysLeft = 0;
        const d = new Date(now);
        while (d <= end) {
          const day = d.getDay();
          if (day !== 0 && day !== 6) tradingDaysLeft++;
          d.setDate(d.getDate() + 1);
        }

        // Auto-DQ users who can't possibly meet min_active_days anymore
        // This covers users with 0 trades (never pulled/evaluated) AND users with some trades but not enough
        const cantMeetRequirement = await db.query(
          `SELECT r.id, r.account_number, r.username, COALESCE(l.active_days, 0) as active_days
           FROM trading_registrations r
           LEFT JOIN wp_leaderboard l ON r.id = l.registration_id
           WHERE r.challenge_id = $1
             AND r.disqualified = false
             AND (COALESCE(l.active_days, 0) + $2) < $3`,
          [challengeId, tradingDaysLeft, minActiveDays]
        );

        if (cantMeetRequirement.rows.length > 0) {
          for (const u of cantMeetRequirement.rows) {
            await db.query(
              `UPDATE trading_registrations SET disqualified = true, disqualified_at = NOW(), disqualified_reason = $1 WHERE id = $2 AND disqualified = false`,
              [`Active trading day requirement not fulfilled (${u.active_days} days traded, ${tradingDaysLeft} trading days left, need ${minActiveDays})`, u.id]
            );
            await db.query(
              `UPDATE wp_leaderboard SET is_disqualified = true, disqualify_reason = $1 WHERE registration_id = $2`,
              [`Active trading day requirement not fulfilled (${u.active_days}/${minActiveDays} days)`, u.id]
            );
          }
          console.log(`📊 VPS Pull: Auto-DQ'd ${cantMeetRequirement.rows.length} users — cannot meet ${minActiveDays} active days requirement`);
        }

        // Exclude already-DQ'd users from pull (they'll be filtered by disqualified=false in main query)
        // Also exclude 0-trade + 0-balance users who haven't deposited (no point pulling empty accounts)
        const lateUsers = await db.query(
          `SELECT r.id FROM trading_registrations r
           LEFT JOIN wp_leaderboard l ON r.id = l.registration_id
           WHERE r.challenge_id = $1 AND r.disqualified = false
             AND (l.total_trades = 0 OR l.total_trades IS NULL)
             AND (l.current_balance IS NULL OR l.current_balance <= 0)
             AND r.actual_starting_balance IS NULL`,
          [challengeId]
        );
        lateExcludeIds = lateUsers.rows.map((r: any) => r.id);
      }
    } catch {}

    // forceAll = admin override: pull every account regardless of balance/blown state
    // or DQ status. Evaluation engine preserves DQ flags — it writes to staging which
    // is then flushed without clearing the disqualified column.
    const disqualifiedFilter = forceAll ? '' : 'AND r.disqualified = false';
    // Skip accounts whose MT5 equity has hit zero (or gone negative) — the broker
    // account is genuinely blown. Also skip accounts already marked blown via
    // zero_balance_at (set by evaluation engine). Both conditions require total_trades > 0
    // so new/unstarted accounts aren't skipped just because equity hasn't loaded yet.
    const zeroBalanceFilter = forceAll
      ? ''
      : `AND (
           l.zero_balance_at IS NULL OR l.total_trades = 0 OR l.id IS NULL OR r.actual_starting_balance IS NULL
         )
         AND NOT (
           r.last_known_equity IS NOT NULL AND r.last_known_equity <= 0
           AND l.total_trades > 0
         )
         AND COALESCE(l.is_withdrawn, false) = false`;
    // connection_verified and confirmed credential failures (pull_status='password_changed')
    // are NOT bypassed by forceAll, even for the final post-challenge-end pull or other
    // admin "full pull" actions — an account that has never verified a working connection,
    // or is already confirmed locked out, isn't "qualified for pull" and just wastes a
    // terminal slot retrying a login that's known to fail. Credential-failure accounts get
    // noticed and retried automatically once the user fixes their password and re-verifies
    // (which flips connection_verified back to true / clears pull_status) — see
    // tradingRegistrationHandler.ts's credential-recovery flow.
    const connectionFilter = 'AND r.connection_verified = true';
    const passwordChangedFilter = "AND (r.pull_status IS NULL OR r.pull_status != 'password_changed')";

    const result = await db.query(
      `SELECT r.id, r.account_number, r.mt5_server, r.investor_password, r.user_id, r.username, r.nickname, r.last_pull_at
       FROM trading_registrations r
       LEFT JOIN wp_leaderboard l ON r.id = l.registration_id
       WHERE r.challenge_id = $1
         ${disqualifiedFilter}
         AND r.investor_password IS NOT NULL
         ${connectionFilter}
         ${zeroBalanceFilter}
         ${passwordChangedFilter}
       ORDER BY r.id`,
      [challengeId]
    );

    // Filter out late depositors (skip this filter on admin forceAll — pull everyone)
    const accounts = forceAll
      ? result.rows
      : result.rows.filter((r: any) => !lateExcludeIds.includes(r.id));

    return accounts.map((r: any) => ({
      registrationId: r.id,
      accountNumber: r.account_number,
      server: r.mt5_server,
      investorPassword: r.investor_password,
      userId: r.user_id,
      username: r.username,
      nickname: r.nickname,
      isPriority: false,
      // forceAll=true (admin full pull): set lastPullAt=null so pullSingleAccount
      // always does a full pull from challenge start, not a 5h incremental window
      lastPullAt: forceAll ? null : (r.last_pull_at ? new Date(r.last_pull_at).toISOString() : null),
    }));
  }

  // ==================== TRADE/DEAL PERSISTENCE ====================

  private async saveTrades(account: AccountToPull, trades: any[]) {
    // Get challenge_id for this registration
    const regResult = await db.query(`SELECT challenge_id FROM trading_registrations WHERE id = $1`, [account.registrationId]);
    const challengeId = regResult.rows[0]?.challenge_id;
    if (!challengeId) return;

    // Only save if we actually got trades from VPS
    if (trades.length === 0) return;

    // UPSERT: Insert new trades, update existing ones (by unique constraint: challenge_id, account_number, ticket)
    // This supports incremental pulls — we only get recent trades but don't lose older ones
    for (const trade of trades) {
      try {
        await db.query(
          `INSERT INTO wp_trades
           (challenge_id, registration_id, account_number, ticket, position_id, symbol, trade_type, volume,
            open_time, close_time, open_price, close_price, stop_loss, take_profit,
            profit, commission, swap, comment, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
           ON CONFLICT (challenge_id, account_number, ticket) DO UPDATE SET
             position_id = EXCLUDED.position_id,
             symbol = EXCLUDED.symbol,
             trade_type = EXCLUDED.trade_type,
             volume = EXCLUDED.volume,
             open_time = COALESCE(EXCLUDED.open_time, wp_trades.open_time),
             close_time = EXCLUDED.close_time,
             open_price = CASE WHEN EXCLUDED.open_price IS NULL OR EXCLUDED.open_price = 0
                                THEN wp_trades.open_price ELSE EXCLUDED.open_price END,
             close_price = EXCLUDED.close_price,
             stop_loss = EXCLUDED.stop_loss,
             take_profit = EXCLUDED.take_profit,
             profit = EXCLUDED.profit,
             commission = EXCLUDED.commission,
             swap = EXCLUDED.swap,
             comment = EXCLUDED.comment,
             synced_at = NOW()`,
          [
            challengeId, account.registrationId, account.accountNumber, trade.ticket,
            trade.position_id || trade.ticket,
            trade.symbol || null, trade.type || null, trade.volume || 0,
            trade.open_time || null, trade.close_time || null,
            trade.open_price || 0, trade.close_price || 0,
            trade.stop_loss || null, trade.take_profit || null,
            trade.profit || 0, trade.commission || 0, trade.swap || 0,
            trade.comment || null,
          ]
        );
      } catch (e) {
        // Skip individual trade errors
      }
    }
  }

  private async saveDeals(account: AccountToPull, deals: any[]) {
    // Get challenge_id for this registration
    const regResult = await db.query(`SELECT challenge_id FROM trading_registrations WHERE id = $1`, [account.registrationId]);
    const challengeId = regResult.rows[0]?.challenge_id;
    if (!challengeId) return;

    // Only save if we got deals
    if (deals.length === 0) return;

    // UPSERT: Insert new deals, update existing ones (by unique constraint: challenge_id, account_number, ticket)
    for (const deal of deals) {
      try {
        await db.query(
          `INSERT INTO wp_deals
           (challenge_id, registration_id, account_number, ticket, deal_type, symbol,
            direction, volume, price, profit, balance, comment, time, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
           ON CONFLICT (challenge_id, account_number, ticket) DO UPDATE SET
             deal_type = EXCLUDED.deal_type,
             symbol = EXCLUDED.symbol,
             direction = EXCLUDED.direction,
             volume = EXCLUDED.volume,
             price = EXCLUDED.price,
             profit = EXCLUDED.profit,
             balance = EXCLUDED.balance,
             comment = EXCLUDED.comment,
             time = EXCLUDED.time,
             synced_at = NOW()`,
          [
            challengeId, account.registrationId, account.accountNumber,
            deal.ticket, deal.type || null, deal.symbol || null,
            deal.direction || null, deal.volume || 0, deal.price || 0,
            deal.profit || 0, deal.balance || 0, deal.comment || null, deal.time || null,
          ]
        );
      } catch (e) {}
    }
  }

  // ==================== BALANCE OPS (deposits / withdrawals / swap / dividend) ====================

  private async storeBalanceOps(challengeId: number, registrationId: number, accountNumber: string, balanceOps: any[], currentBalance: number): Promise<void> {
    if (!balanceOps || balanceOps.length === 0) return;
    for (const op of balanceOps) {
      await db.query(
        `INSERT INTO wp_balance_ops (challenge_id, registration_id, account_number, deal_ticket, op_time, amount, op_type, comment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (challenge_id, registration_id, deal_ticket) DO NOTHING`,
        [challengeId, registrationId, accountNumber, op.ticket, op.time, op.amount, op.op_type, op.comment || null]
      ).catch(() => {});
    }
    const withdrawnRes = await db.query(
      `SELECT COALESCE(SUM(ABS(amount)), 0) as total_withdrawn
       FROM wp_balance_ops
       WHERE challenge_id = $1 AND registration_id = $2 AND op_type = 'withdrawal'`,
      [challengeId, registrationId]
    ).catch(() => null);
    const totalWithdrawn = withdrawnRes ? parseFloat(withdrawnRes.rows[0]?.total_withdrawn || '0') : 0;
    const isWithdrawn = totalWithdrawn > 0 && currentBalance <= 0;
    await db.query(
      `UPDATE wp_leaderboard SET total_withdrawn = $1, is_withdrawn = $2
       WHERE challenge_id = $3 AND registration_id = $4`,
      [totalWithdrawn, isWithdrawn, challengeId, registrationId]
    ).catch(() => {});
  }

  // ==================== CREDENTIAL FAILURE HANDLING ====================

  private async handleCredentialFailure(failure: PullResult, challenge: TradingChallenge) {
    const reg = await db.query('SELECT pull_status, source FROM trading_registrations WHERE id = $1', [failure.registrationId]);
    if (reg.rows[0]?.pull_status === 'password_changed') return;

    await db.query(
      `UPDATE trading_registrations SET pull_status = 'password_changed', pull_error = $1 WHERE id = $2`,
      [`Detected at ${new Date().toISOString()}`, failure.registrationId]
    );

    const source = reg.rows[0]?.source || 'telegram';

    // Notify via Telegram (for telegram users only)
    if (source === 'telegram') {
      const botInfo = await this.bot.bot.telegram.getMe();
      try {
        await this.bot.bot.telegram.sendMessage(
          failure.userId,
          `⚠️ <b>Account Access Issue — ${challenge.title}</b>\n\n` +
          `We could not access your MT5 account <b>${failure.accountNumber}</b>.\n\n` +
          `It appears your <b>investor password has been changed</b>.\n\n` +
          `🔑 Please update your investor password using the button below.\n\n` +
          `⏰ <b>You have 24 hours to update.</b>\n` +
          `After 24 hours, your registration will be disqualified.\n\n` +
          `<i>If you did not change your password, contact @birrFXadmin immediately.</i>`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.url('🔑 Update Investor Password', `https://t.me/${botInfo.username}?start=tc_update_password_${failure.registrationId}`)],
            ]),
          }
        );
      } catch (e) {
        console.error(`Could not notify Telegram user ${failure.userId}:`, e);
      }
    }

    // Notify via Discord DM queue (for discord users)
    if (source === 'discord') {
      try {
        await db.query(
          `INSERT INTO discord_dm_queue
             (discord_user_id, registration_id, challenge_id, notification_type, message_title, message_body)
           VALUES ($1, $2, $3, 'password_changed', $4, $5)`,
          [
            String(failure.userId),
            failure.registrationId,
            challenge.id,
            '⚠️ Account Access Issue — Action Required',
            `We could not access your MT5 account **${failure.accountNumber}** for **${challenge.title}**.\n\nYour **investor password** appears to have been changed.\n\n🔑 Please update it on WinnerPip:\nhttps://winnerpip.com/challenge/${challenge.id}\n\nSign in → you will see a banner to update your password.\n\n⏰ **You have 24 hours to fix this or your registration will be disqualified.**\n\nIf you did not change your password, contact an admin immediately.`,
          ]
        );
        console.log(`📬 Discord DM queued for user ${failure.userId} (password_changed)`);
      } catch (e) {
        console.error(`Could not queue Discord DM for user ${failure.userId}:`, e);
      }
    }
  }

  // ==================== CREDENTIAL RECOVERY ====================

  /**
   * Called the moment an account's credentials are confirmed fixed — either the
   * user re-verifying via the bot's tc_update_password flow, or an admin doing it
   * from the dashboard's /update-password route. The MT5 login has already been
   * verified by the caller; this handles everything that needs to happen next.
   *
   * Why this exists: handleCredentialFailure() deliberately freezes last_pull_at
   * while an account is flagged password_changed (see the comment in the
   * terminalWorker invalid_credentials branch). But nothing was ever resetting it
   * afterward — so the very next scheduled pull would just do its normal 5h
   * incremental window from "now", silently skipping every trade that happened
   * during the outage. Nulling last_pull_at here forces pullSingleAccount's
   * incremental-vs-full check to take the full-pull branch instead, and we don't
   * wait for the next cron tick to do it — we pull, evaluate, and re-rank right now.
   */
  async recoverAccountAfterCredentialFix(
    registrationId: number,
    challengeId: number,
    source: 'user' | 'admin' = 'user'
  ): Promise<(PullResult & { evaluated?: boolean }) | null> {
    try {
      await db.query(`UPDATE trading_registrations SET last_pull_at = NULL WHERE id = $1`, [registrationId]);

      const result = await this.retrySingleAccount(registrationId, challengeId);

      if (result.success) {
        try {
          const { leaderboardService } = require('../services/leaderboardService');
          await leaderboardService.flushStagingToLive(challengeId);
          await leaderboardService.ensureAllParticipantsHaveEntries(challengeId);
          await leaderboardService.updateRankings(challengeId);
          console.log(`✅ recoverAccountAfterCredentialFix: backfill pull + rank update done for reg ${registrationId}`);
        } catch (e) {
          console.error(`⚠️ recoverAccountAfterCredentialFix: leaderboard update failed for reg ${registrationId}:`, e);
        }
      } else {
        console.warn(`⚠️ recoverAccountAfterCredentialFix: backfill pull for reg ${registrationId} did not succeed (errorCode=${result.errorCode}) — will resolve on the next scheduled cycle`);
      }

      // Notify regardless of the backfill pull's outcome — the password fix itself
      // is what the user/admin cares about confirming; a transient pull hiccup will
      // just resolve on the next scheduled cycle like any other account.
      await this.notifyAccountRecovered(registrationId, challengeId, source);

      return result;
    } catch (e) {
      console.error(`⚠️ recoverAccountAfterCredentialFix failed for reg ${registrationId}:`, e);
      return null;
    }
  }

  private async notifyAccountRecovered(registrationId: number, challengeId: number, source: 'user' | 'admin') {
    try {
      const regResult = await db.query(
        `SELECT r.user_id, r.account_number, r.source AS notify_source, c.title
         FROM trading_registrations r JOIN trading_challenges c ON c.id = r.challenge_id
         WHERE r.id = $1`,
        [registrationId]
      );
      if (regResult.rows.length === 0) return;
      const reg = regResult.rows[0];
      const notifySource = reg.notify_source || 'telegram';
      const byAdminText = source === 'admin' ? ' by an admin' : '';

      if (notifySource === 'telegram') {
        try {
          await this.bot.bot.telegram.sendMessage(
            reg.user_id,
            `✅ <b>Account Access Restored — ${reg.title}</b>\n\n` +
            `Your investor password was updated${byAdminText} and verified successfully.\n\n` +
            `Account <b>${reg.account_number}</b> is back online. We've already pulled and evaluated your full trade history, ` +
            `so any trades made while access was down are now reflected on the leaderboard.`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {
          console.error(`Could not notify Telegram user ${reg.user_id} of recovery:`, e);
        }
      } else if (notifySource === 'discord') {
        try {
          await db.query(
            `INSERT INTO discord_dm_queue
               (discord_user_id, registration_id, challenge_id, notification_type, message_title, message_body)
             VALUES ($1, $2, $3, 'password_recovered', $4, $5)`,
            [
              String(reg.user_id),
              registrationId,
              challengeId,
              '✅ Account Access Restored',
              `Your investor password was updated${byAdminText} and verified for **${reg.title}**.\n\nAccount **${reg.account_number}** is back online — we've already pulled your full trade history so nothing is missed on the leaderboard.`,
            ]
          );
        } catch (e) {
          console.error(`Could not queue Discord recovery DM for user ${reg.user_id}:`, e);
        }
      }
    } catch (e) {
      console.error(`notifyAccountRecovered failed for reg ${registrationId}:`, e);
    }
  }

  // ==================== DISQUALIFICATION CHECK ====================

  private async checkDisqualifications() {
    try {
      const challenges = await tradingChallengeService.getActiveChallenges();
      const activeChallenge = challenges.find(c => c.status === 'active');
      if (!activeChallenge) return;

      const result = await db.query(
        `SELECT id, user_id, username, account_number
         FROM trading_registrations
         WHERE challenge_id = $1
           AND pull_status = 'password_changed'
           AND disqualified = false
           AND last_pull_at < NOW() - INTERVAL '${PASSWORD_WARNING_HOURS} hours'`,
        [activeChallenge.id]
      );

      for (const reg of result.rows) {
        await db.query(
          `UPDATE trading_registrations SET disqualified = true, disqualified_at = NOW(), disqualified_reason = 'Investor password changed — no update within 24h' WHERE id = $1`,
          [reg.id]
        );

        try {
          await this.bot.bot.telegram.sendMessage(reg.user_id,
            `🚫 <b>Registration Disqualified — ${activeChallenge.title}</b>\n\n` +
            `Account <b>${reg.account_number}</b> has been disqualified.\n\n` +
            `📛 <b>Reason:</b> Investor password was changed and not updated within 24 hours.\n\n` +
            `<i>Contact @birrFXadmin if you believe this is an error.</i>`,
            { parse_mode: 'HTML' });
        } catch (e) {}

        try {
          await this.bot.bot.telegram.sendMessage(config.adminUserId,
            `🚫 Auto-DQ: @${reg.username || 'unknown'} (${reg.account_number}) — password not updated in 24h`);
        } catch (e) {}
      }
    } catch (error) {
      console.error('Error in checkDisqualifications:', error);
    }
  }

  // ==================== BULK STATUS UPDATE ====================

  private async bulkUpdatePullStatus(results: PullResult[]) {
    const successIds = results.filter(r => r.success).map(r => r.registrationId);
    const failedResults = results.filter(r => !r.success && r.errorCode !== 'invalid_credentials');

    if (successIds.length > 0) {
      await db.query(
        `UPDATE trading_registrations SET last_pull_at = NOW(), pull_status = 'success', pull_error = NULL WHERE id = ANY($1)`,
        [successIds]
      );
    }

    // Only update last_pull_at for FAILED results — don't advance the timestamp
    // This ensures the next pull will re-fetch from the same point
    for (const f of failedResults) {
      await db.query(
        `UPDATE trading_registrations SET pull_status = $1, pull_error = $2 WHERE id = $3`,
        [f.errorCode || 'failed', f.errorMessage || 'Unknown', f.registrationId]
      );
    }
  }

  // ==================== DB RECORDS ====================

  /**
   * Save per-terminal stats for the just-completed batch to DB.
   * Creates wp_terminal_stats table on first run if missing.
   */
  private async savePullTerminalStats(batchId: number): Promise<void> {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS wp_terminal_stats (
          id SERIAL PRIMARY KEY,
          pull_batch_id INTEGER NOT NULL REFERENCES wp_pull_batches(id) ON DELETE CASCADE,
          terminal_id INTEGER NOT NULL,
          total_processed INTEGER NOT NULL DEFAULT 0,
          total_success INTEGER NOT NULL DEFAULT 0,
          total_failed INTEGER NOT NULL DEFAULT 0,
          is_healthy BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      for (const t of this.terminals) {
        await db.query(
          `INSERT INTO wp_terminal_stats (pull_batch_id, terminal_id, total_processed, total_success, total_failed, is_healthy)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [batchId, t.id, t.totalProcessed, t.totalSuccess, t.totalFailed, t.isHealthy]
        );
      }
    } catch (e) {
      console.warn('⚠️ Could not save terminal stats:', (e as Error).message);
    }
  }

  /**
   * Targeted /resolve-opens call for one account — one login session resolves
   * every still-null position passed in. Returns a map of position_id -> {open_time, open_price}.
   */
  private async resolveOpensForAccount(
    account: AccountToPull,
    terminalId: number,
    positionIds: number[],
    abortSignal?: AbortSignal
  ): Promise<Record<string, { open_time: string; open_price: number }> | null> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/resolve-opens`,
        {
          account: account.accountNumber,
          server: account.server,
          password: account.investorPassword,
          api_key: this.apiKey,
          terminal_id: terminalId,
          position_ids: positionIds,
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: HISTORY_RESOLVE_TIMEOUT_MS, signal: abortSignal }
      );
      if (response.data?.success) {
        const resolved = response.data.resolved || {};
        if (positionIds.length > 0 && Object.keys(resolved).length === 0) {
          console.warn(`⚠️ VPS Pull: resolveOpensForAccount got empty resolution for ${account.accountNumber} on terminal ${terminalId} despite ${positionIds.length} position(s) requested — terminal history may not have stabilized`);
        }
        return resolved;
      }
      console.warn(`⚠️ VPS Pull: resolveOpensForAccount ${account.accountNumber} responded success=false: ${JSON.stringify(response.data)}`);
      return null;
    } catch (e: any) {
      console.warn(`⚠️ VPS Pull: resolveOpensForAccount ${account.accountNumber} threw: status=${e?.response?.status} code=${e?.code} message=${e?.message}`);
      return null;
    }
  }

  /**
   * Reconciliation window — deliberately WIDER than pullSingleAccount()'s own
   * fromDate (which is just 5h for an incremental pull). A position dropped by
   * a pull a few cycles ago would never be re-checked if reconciliation only
   * looked at the current cycle's narrow window, since each subsequent
   * incremental pull's window has already moved past it. Reuses the same
   * extended scope as the null-open_time scan (24h/30h/full) so strays from
   * recent cycles, not just the current one, get caught.
   */
  private getReconcileFromDate(account: AccountToPull, challenge: TradingChallenge): string {
    const challengeStartDate = challenge?.start_date ? new Date(challenge.start_date).toISOString() : undefined;
    const lookbackHours = this.getNullScanLookbackHours(account, challenge);
    if (lookbackHours === null) {
      return challengeStartDate || new Date(2020, 0, 1).toISOString();
    }
    return new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  }

  /**
   * Targeted /list-positions call — returns the ground-truth set of closed
   * position_ids MT5 has for this account in [fromDate, now], independent of
   * whatever ended up saved in wp_trades.
   */
  private async listMt5Positions(
    account: AccountToPull,
    terminalId: number,
    fromDate: string,
    abortSignal?: AbortSignal
  ): Promise<number[] | null> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/list-positions`,
        {
          account: account.accountNumber,
          server: account.server,
          password: account.investorPassword,
          api_key: this.apiKey,
          terminal_id: terminalId,
          from_date: fromDate,
          to_date: new Date().toISOString(),
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: ACCOUNT_TIMEOUT_MS, signal: abortSignal }
      );
      if (response.data?.success) return (response.data.position_ids || []).map((id: any) => Number(id));
      console.error(`🔍 VPS Pull: ${account.accountNumber} /list-positions responded success=false: ${JSON.stringify(response.data)}`);
      return null;
    } catch (e: any) {
      console.error(`🔍 VPS Pull: ${account.accountNumber} /list-positions threw: status=${e?.response?.status} data=${JSON.stringify(e?.response?.data)} message=${e?.message}`);
      return null;
    }
  }

  /**
   * Targeted /resolve-trades call — fetches complete trade records (open+close
   * time/price, volume, profit, etc.) for specific position_ids via MT5's
   * date-range-independent position= lookups, ready to hand to saveTrades().
   */
  async resolveTradesForAccount(
    account: AccountToPull,
    terminalId: number,
    positionIds: number[],
    abortSignal?: AbortSignal
  ): Promise<any[] | null> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/resolve-trades`,
        {
          account: account.accountNumber,
          server: account.server,
          password: account.investorPassword,
          api_key: this.apiKey,
          terminal_id: terminalId,
          position_ids: positionIds,
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: HISTORY_RESOLVE_TIMEOUT_MS, signal: abortSignal }
      );
      if (response.data?.success) return response.data.trades || [];
      console.warn(`⚠️ VPS Pull: resolveTradesForAccount ${account.accountNumber} responded success=false: ${JSON.stringify(response.data)}`);
      return null;
    } catch (e: any) {
      console.warn(`⚠️ VPS Pull: resolveTradesForAccount ${account.accountNumber} threw: status=${e?.response?.status} code=${e?.code} message=${e?.message}`);
      return null;
    }
  }

  /**
   * Full account pull from a given date, returning all trades filtered by positionId.
   * Used by Pull Trade to reliably fetch all partial closes for a position.
   */
  async pullTradesForPosition(
    account: AccountToPull,
    terminalId: number,
    fromDate: string,
    positionId: number
  ): Promise<any[] | null> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/pull`,
        {
          account: account.accountNumber,
          server: account.server,
          password: account.investorPassword,
          api_key: this.apiKey,
          terminal_id: terminalId,
          from_date: fromDate,
          orders_from_date: fromDate,
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
      );
      if (!response.data?.success) return null;
      const allTrades: any[] = response.data.trades || [];
      // Filter to trades belonging to this position
      return allTrades.filter((t: any) =>
        Number(t.position_id) === positionId || Number(t.ticket) === positionId
      );
    } catch (e: any) {
      console.warn(`⚠️ VPS Pull: pullTradesForPosition ${account.accountNumber} threw: ${e?.message}`);
      return null;
    }
  }


  /**
   * Phase 1.5 — reconciliation. Compares MT5's actual closed-position count for
  /**
   * Inline reconciliation — uses position_ids already returned by /pull (no extra login).
   * Compares VPS-reported position IDs against what's saved in the DB. If any are
   * missing, resolves them via /resolve-trades (which DOES require a login, but only
   * for the few accounts that actually have missing data — typically 0).
   */
  private async inlineReconcile(
    challengeId: number,
    batchId: number | null,
    accounts: AccountToPull[],
    pullResults: PullResult[],
    healthyTerminals: TerminalState[]
  ): Promise<void> {
    if (accounts.length === 0 || healthyTerminals.length === 0) return;

    const tasks: { account: AccountToPull; positionIds: number[] }[] = [];

    for (const account of accounts) {
      if (this.cancelRequested) break;
      const result = pullResults.find(r => r.registrationId === account.registrationId);
      const vpsPositionIds = result?.positionIds || [];
      if (vpsPositionIds.length === 0) continue; // No positions returned by VPS — nothing to reconcile

      // Check which position IDs are already in the DB
      const dbRows = await db.query(
        `SELECT DISTINCT position_id FROM wp_trades WHERE challenge_id = $1 AND account_number = $2`,
        [challengeId, account.accountNumber]
      );
      const dbPositionIds = new Set(dbRows.rows.map((r: any) => Number(r.position_id)));
      const missing = vpsPositionIds.filter((id: number) => !dbPositionIds.has(id));

      if (missing.length > 0) {
        console.log(`🔍 VPS Pull: ${account.accountNumber} inline reconcile: ${missing.length} position(s) missing from DB — will resolve`);
        tasks.push({ account, positionIds: missing });
      }
    }

    if (tasks.length === 0) {
      console.log(`✅ VPS Pull: Inline reconcile — all positions accounted for (0 missing)`);
      return;
    }

    console.log(`🔧 VPS Pull: Inline reconcile — resolving ${tasks.length} account(s) with missing trades`);

    // Resolve missing trades in parallel across healthy terminals
    let totalRecovered = 0;
    const queue = [...tasks];
    const workers = healthyTerminals.map(async terminal => {
      while (true) {
        if (this.cancelRequested) return;
        const task = queue.shift();
        if (!task) return;

        const trades = await this.resolveTradesForAccount(task.account, terminal.id, task.positionIds, this.abortController?.signal);
        if (trades && trades.length > 0) {
          await this.saveTrades(task.account, trades);
          totalRecovered += trades.length;
        }
        await this.delay(BATCH_DELAY_MS);
      }
    });
    await Promise.all(workers);

    console.log(`✅ VPS Pull: Inline reconcile recovered ${totalRecovered} missing trade(s) across ${tasks.length} account(s)`);
  }

  /**
   * Phase 1.5 — reconciliation (LEGACY — used only by retrySingleAccount).
   * For batch pulls, use inlineReconcile() which uses position_ids from /pull response.
   *
   * Compares MT5's actual closed-position count for
   * each account's pull window against what's saved in wp_trades and backfills
   * anything missing (not just null-open_time rows — entire trades that never
   * made it into the DB, e.g. dropped at a windowed-query boundary during the
   * main pull). Runs once per pull cycle, before phase 2's null-time resolution,
   * using the same shared terminal pool. No-op if nothing is missing.
   */
  private async reconcileMissingTrades(
    challengeId: number,
    batchId: number | null,
    accounts: AccountToPull[],
    healthyTerminals: TerminalState[],
    challenge: TradingChallenge
  ): Promise<void> {
    if (accounts.length === 0 || healthyTerminals.length === 0) return;

    const tasks: { account: AccountToPull; positionIds: number[] }[] = [];
    let reconcileTerminalIdx = 0;
    for (const account of accounts) {
      if (this.cancelRequested) break;
      const fromDate = this.getReconcileFromDate(account, challenge);

      // Round-robin list-positions across all healthy terminals (not just T1)
      const terminalForList = healthyTerminals[reconcileTerminalIdx % healthyTerminals.length];
      reconcileTerminalIdx++;
      const mt5Positions = await this.listMt5Positions(account, terminalForList.id, fromDate, this.abortController?.signal);
      if (mt5Positions === null) {
        console.log(`🔍 VPS Pull: ${account.accountNumber} reconcile check: /list-positions returned null (since ${fromDate}) — skipping`);
        continue;
      }
      if (mt5Positions.length === 0) {
        console.log(`🔍 VPS Pull: ${account.accountNumber} reconcile check: MT5 has 0 closed positions (since ${fromDate})`);
        continue;
      }

      const dbRows = await db.query(
        `SELECT DISTINCT position_id FROM wp_trades WHERE challenge_id = $1 AND account_number = $2 AND close_time >= $3`,
        [challengeId, account.accountNumber, fromDate]
      );
      const dbPositionIds = new Set(dbRows.rows.map((r: any) => Number(r.position_id)));
      const missing = mt5Positions.filter(id => !dbPositionIds.has(id));

      console.log(`🔍 VPS Pull: ${account.accountNumber} reconcile check (since ${fromDate}): MT5 has ${mt5Positions.length} [${mt5Positions.join(',')}], DB has ${dbPositionIds.size} [${[...dbPositionIds].join(',')}], missing=${missing.length}`);

      if (missing.length > 0) {
        tasks.push({ account, positionIds: missing });
      }
    }

    if (tasks.length === 0) return;

    if (batchId) {
      await db.query(
        `UPDATE wp_pull_batches SET phase = 'reconciling', phase2_total = $1, phase2_processed = 0, phase2_round = 0 WHERE id = $2`,
        [tasks.length, batchId]
      );
    }

    let totalRecovered = 0;
    const queue = [...tasks];
    let processed = 0;
    const workers = healthyTerminals.map(async terminal => {
      while (true) {
        if (this.cancelRequested) return;
        const task = queue.shift();
        if (!task) return;

        const trades = await this.resolveTradesForAccount(task.account, terminal.id, task.positionIds, this.abortController?.signal);
        if (trades && trades.length > 0) {
          await this.saveTrades(task.account, trades);
          totalRecovered += trades.length;
        }

        processed++;
        if (batchId) {
          await db.query(`UPDATE wp_pull_batches SET phase2_processed = $1 WHERE id = $2`, [processed, batchId]).catch(() => {});
        }
        await this.delay(BATCH_DELAY_MS);
      }
    });
    await Promise.all(workers);

    console.log(`✅ VPS Pull: reconciliation recovered ${totalRecovered} missing trade(s) across ${tasks.length} account(s)`);
  }

  /**
   * Per-account lookback scope for the null-resolution scan — mirrors the exact
   * pull-strategy decision in pullSingleAccount() so phase 2 only rescans the
   * window that account's phase-1 pull actually covered:
   *   - full pull (challenge ended OR first-ever pull for that account): scan all trades
   *   - midnight 25h safety pull: ~30h lookback
   *   - incremental pull: 24h lookback
   */
  private getNullScanLookbackHours(account: AccountToPull, challenge: TradingChallenge): number | null {
    const isChallengeEnded = challenge?.status === 'reviewing' || challenge?.status === 'completed';
    if (isChallengeEnded || !account.lastPullAt) return null; // full scope
    if (challenge && this.isMidnightEATRun() && !this.isFirstNightSinceChallengeStart(challenge)) return 30;
    return 24;
  }

  /**
   * Phase 2 — finds trades with NULL open_time (left over from a bulk windowed
   * pull whose query range missed the position's true opening order/deal) and
   * resolves them via targeted per-position MT5 lookups, up to 5 rounds.
   * Dispatches through the same shared terminal pool used for phase 1 pulls —
   * never holds a terminal open waiting; each round just picks up whatever is
   * still null and requeues unresolved ones for the next round.
   * No-op (and leaves wp_pull_batches.phase untouched) if there's nothing to fix.
   */
  private async resolveNullOpenTimes(
    challengeId: number,
    batchId: number | null,
    accounts: AccountToPull[],
    healthyTerminals: TerminalState[],
    challenge: TradingChallenge
  ): Promise<void> {
    const MAX_ROUNDS = 5;
    if (accounts.length === 0 || healthyTerminals.length === 0) return;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      if (this.cancelRequested) break;

      // Find still-null positions per account, scoped to that account's own
      // phase-1 pull window (full scope vs 24h/30h incremental scope).
      const tasks: { account: AccountToPull; positionIds: number[] }[] = [];
      for (const account of accounts) {
        const lookbackHours = this.getNullScanLookbackHours(account, challenge);
        const params: any[] = [challengeId, account.accountNumber];
        let dateClause = '';
        if (lookbackHours !== null) {
          dateClause = ` AND close_time >= NOW() - INTERVAL '${lookbackHours} hours'`;
        }
        const rows = await db.query(
          `SELECT DISTINCT position_id FROM wp_trades
           WHERE challenge_id = $1 AND account_number = $2 AND open_time IS NULL${dateClause}`,
          params
        );
        if (rows.rows.length > 0) {
          tasks.push({ account, positionIds: rows.rows.map((r: any) => Number(r.position_id)) });
        }
      }

      if (tasks.length === 0) {
        if (round === 1) return; // nothing to fix — phase 2 never starts
        break; // resolved before hitting MAX_ROUNDS
      }

      if (batchId) {
        if (round === 1) {
          await db.query(
            `UPDATE wp_pull_batches SET phase = 'resolving_nulls', phase2_total = $1, phase2_processed = 0, phase2_round = 1 WHERE id = $2`,
            [tasks.length, batchId]
          );
        } else {
          await db.query(
            `UPDATE wp_pull_batches SET phase2_total = $1, phase2_processed = 0, phase2_round = $2 WHERE id = $3`,
            [tasks.length, round, batchId]
          );
        }
      }

      console.log(`🔧 VPS Pull: Phase 2 round ${round}/${MAX_ROUNDS} — resolving null open_time for ${tasks.length} account(s)`);

      const queue = [...tasks];
      let processed = 0;
      const workers = healthyTerminals.map(async terminal => {
        while (true) {
          if (this.cancelRequested) return;
          const task = queue.shift();
          if (!task) return;

          const resolved = await this.resolveOpensForAccount(
            task.account,
            terminal.id,
            task.positionIds,
            this.abortController?.signal
          );
          if (resolved) {
            for (const [posIdStr, data] of Object.entries(resolved)) {
              if (!data?.open_time) continue;
              await db.query(
                `UPDATE wp_trades SET open_time = $1, open_price = COALESCE($2, open_price), synced_at = NOW()
                 WHERE challenge_id = $3 AND account_number = $4 AND position_id = $5 AND open_time IS NULL`,
                [data.open_time, data.open_price ?? null, challengeId, task.account.accountNumber, posIdStr]
              ).catch(() => {});
            }
          }

          processed++;
          if (batchId) {
            await db.query(`UPDATE wp_pull_batches SET phase2_processed = $1 WHERE id = $2`, [processed, batchId]).catch(() => {});
          }
          await this.delay(BATCH_DELAY_MS);
        }
      });
      await Promise.all(workers);
    }
  }

  /**
   * Phase 3 — deferred evaluation, run once phase 2's null-resolution pass has
   * finished (or had nothing to do). Replaces the old per-account streaming
   * evaluate call that used to run inside terminalWorker immediately after pull.
   */
  private async evaluateAllAccounts(challengeId: number, accounts: AccountToPull[], batchId: number | null = null, pullResults?: PullResult[]): Promise<void> {
    // On scheduled (incremental) pulls: skip accounts that got 0 new trades
    let accountsToEval = accounts;
    if (pullResults && pullResults.length > 0) {
      const accountsWithNewTrades = new Set(
        pullResults.filter(r => r.success && (r.tradesCount || 0) > 0).map(r => r.registrationId)
      );
      const skipped = accounts.length - accountsWithNewTrades.size;
      accountsToEval = accounts.filter(a => accountsWithNewTrades.has(a.registrationId));
      if (skipped > 0) {
        console.log(`📊 Evaluation: Skipping ${skipped} account(s) with 0 new trades, evaluating ${accountsToEval.length}`);
      }
    }

    if (batchId && accountsToEval.length > 0) {
      await db.query(
        `UPDATE wp_pull_batches SET phase = 'evaluating', phase2_total = $1, phase2_processed = 0, phase2_round = 0 WHERE id = $2`,
        [accountsToEval.length, batchId]
      ).catch(() => {});
    }
    const EVAL_CONCURRENCY = 10;
    let processed = 0;
    const evalStartTime = Date.now();
    console.log(`📊 Evaluation: Starting ${accountsToEval.length} account(s) with concurrency ${EVAL_CONCURRENCY}`);
    const queue = [...accountsToEval];
    const runWorker = async (workerId: number) => {
      while (queue.length > 0) {
        const account = queue.shift()!;
        const t0 = Date.now();
        try {
          await evaluationEngine.evaluateSingleAccount(challengeId, account.registrationId);
        } catch (evalErr) {
          console.error(`⚠️ Eval error for ${account.accountNumber}:`, evalErr);
        }
        processed++;
        const elapsed = Date.now() - t0;
        console.log(`📊 Eval W${workerId}: ${account.accountNumber} done in ${elapsed}ms (${processed}/${accountsToEval.length})`);
        if (batchId) {
          await db.query(`UPDATE wp_pull_batches SET phase2_processed = $1 WHERE id = $2`, [processed, batchId]).catch(() => {});
        }
      }
    };
    const workers = Array.from({ length: Math.min(EVAL_CONCURRENCY, accountsToEval.length) }, (_, i) => runWorker(i + 1));
    await Promise.all(workers);
    const evalDuration = Math.round((Date.now() - evalStartTime) / 1000);
    console.log(`✅ Evaluation: ${accountsToEval.length} accounts done in ${evalDuration}s (concurrency ${EVAL_CONCURRENCY})`);
  }

  private async createPullBatch(challengeId: number, totalAccounts: number): Promise<number> {
    const result = await db.query(
      `INSERT INTO wp_pull_batches (challenge_id, total_accounts, status) VALUES ($1, $2, 'running') RETURNING id`,
      [challengeId, totalAccounts]
    );
    return result.rows[0].id;
  }

  private async completePullBatch(batchId: number, successful: number, failed: number, newTrades: number, status: string = 'completed') {
    await db.query(
      `UPDATE wp_pull_batches SET completed_at = NOW(), successful = $1, failed = $2, new_trades_found = $3, status = $4 WHERE id = $5`,
      [successful, failed, newTrades, status, batchId]
    );
  }

  private async logPullError(batchId: number, failure: PullResult) {
    try {
      await db.query(
        `INSERT INTO wp_pull_errors (pull_batch_id, registration_id, account_number, error_code, error_message) VALUES ($1, $2, $3, $4, $5)`,
        [batchId, failure.registrationId, failure.accountNumber, failure.errorCode, failure.errorMessage]
      );
    } catch (e) {}
  }

  // ==================== ADMIN REPORTING ====================

  private async maybeReportToAdmin(
    challenge: TradingChallenge,
    successful: PullResult[],
    credentialFailures: PullResult[],
    otherFailures: PullResult[],
    durationSec: number
  ) {
    const totalAttempts = successful.length + credentialFailures.length + otherFailures.length;
    const failureRate = totalAttempts > 0 ? ((credentialFailures.length + otherFailures.length) / totalAttempts) * 100 : 0;

    if (credentialFailures.length === 0 && failureRate <= 30) return;

    let text = `📊 <b>VPS Pull Report</b>\n<b>${challenge.title}</b>\n\n`;
    text += `⏱️ ${durationSec}s | Terminals: ${this.getHealthyTerminalCount()}/${MAX_TERMINALS} healthy\n`;
    text += `✅ ${successful.length} | 🔑 ${credentialFailures.length} | ❌ ${otherFailures.length} | 📉 ${failureRate.toFixed(1)}% fail\n\n`;

    // Terminal distribution (work stealing verification)
    const activeTerminals = this.terminals.filter(t => t.totalProcessed > 0);
    if (activeTerminals.length > 0) {
      text += `<b>🖥️ Terminal distribution:</b>\n`;
      activeTerminals.forEach(t => {
        text += `  T${t.id}: ${t.totalSuccess}✓ / ${t.totalProcessed} total\n`;
      });
      text += '\n';
    }

    if (credentialFailures.length > 0) {
      text += `<b>🔑 Password Changed (notified):</b>\n`;
      credentialFailures.slice(0, 15).forEach(f => { text += `• @${f.username || 'unknown'} — ${f.accountNumber}\n`; });
      if (credentialFailures.length > 15) text += `<i>+${credentialFailures.length - 15} more</i>\n`;
      text += '\n';
    }

    if (otherFailures.length > 0) {
      text += `<b>❌ Other Failures:</b>\n`;
      const grouped = new Map<string, number>();
      otherFailures.forEach(f => grouped.set(f.errorCode || 'unknown', (grouped.get(f.errorCode || 'unknown') || 0) + 1));
      grouped.forEach((count, code) => { text += `• ${code}: ${count}\n`; });
      text += '\n';
    }

    if (text.length > 4000) text = text.substring(0, 4000) + '\n<i>...truncated</i>';

    try {
      await this.bot.bot.telegram.sendMessage(config.adminUserId, text, { parse_mode: 'HTML' });
    } catch (e) {}

    // Critical alert
    if (failureRate > 50 && totalAttempts > 10) {
      try {
        await this.bot.bot.telegram.sendMessage(config.adminUserId,
          `🚨 <b>HIGH FAILURE RATE: ${failureRate.toFixed(0)}%</b>\n\n` +
          `Healthy terminals: ${this.getHealthyTerminalCount()}/${MAX_TERMINALS}\n` +
          `<i>Consider switching to Legacy evaluation via /evaluationtype</i>`,
          { parse_mode: 'HTML' });
      } catch (e) {}
    }
  }

  /**
   * After each pull cycle, check wp_pull_errors for sl_check_failed entries
   * logged during this cycle and report them to the admin with per-account retry buttons.
   */
  private async reportCandleFailures(challengeId: number, durationSec: number) {
    try {
      const { Markup } = require('telegraf');

      // 1. Trades still pending (retrying) — benefit of doubt still active
      const pending = await db.query(
        `SELECT DISTINCT r.id as registration_id, r.account_number, r.nickname, r.account_subtype,
                COUNT(t.id) as pending_count, MAX(t.sl_check_attempts) as max_attempts
         FROM trading_registrations r
         JOIN wp_trades t ON t.registration_id = r.id AND t.challenge_id = $1 AND t.sl_check_pending = true
         WHERE r.challenge_id = $1
         GROUP BY r.id, r.account_number, r.nickname, r.account_subtype`,
        [challengeId]
      );

      // 2. Trades escalated to check_failed — penalty already applied
      const escalated = await db.query(
        `SELECT DISTINCT r.id as registration_id, r.account_number, r.nickname, r.account_subtype,
                COUNT(t.id) as failed_count, MAX(t.sl_check_attempts) as max_attempts
         FROM trading_registrations r
         JOIN wp_trades t ON t.registration_id = r.id AND t.challenge_id = $1 AND t.sl_check_result = 'check_failed'
         WHERE r.challenge_id = $1
         GROUP BY r.id, r.account_number, r.nickname, r.account_subtype`,
        [challengeId]
      );

      if (pending.rows.length === 0 && escalated.rows.length === 0) return;

      let msg = '';

      if (pending.rows.length > 0) {
        const lines = pending.rows
          .map((r: any) => `• ${r.nickname || r.account_number} — ${r.pending_count} trade(s) pending (attempt ${r.max_attempts}/5)`)
          .join('\n');
        msg += `⚠️ <b>Max Risk Check Incomplete</b>\n\n` +
          `${pending.rows.length} account(s) had candle fetch failures — retrying next cycle.\n\n` +
          `${lines}\n\n`;
      }

      if (escalated.rows.length > 0) {
        const lines = escalated.rows
          .map((r: any) => `• ${r.nickname || r.account_number} — ${r.failed_count} trade(s) ❌ penalty applied`)
          .join('\n');
        msg += `🚨 <b>Max Risk Check Failed (Escalated)</b>\n\n` +
          `${escalated.rows.length} account(s) exhausted all retry attempts.\n` +
          `Max-risk penalty has been applied to unverifiable trades.\n\n` +
          `${lines}\n\n`;
      }

      msg += `<i>Click a button to manually retry an account's pending check now.</i>`;

      // Retry buttons only for still-pending accounts
      const buttons = pending.rows.map((r: any) =>
        [Markup.button.callback(
          `🔄 Retry: ${r.nickname || r.account_number}`,
          `sl_retry_${challengeId}_${r.registration_id}`
        )]
      );

      await this.bot.bot.telegram.sendMessage(
        config.adminUserId, msg.trim(),
        { parse_mode: 'HTML', ...(buttons.length > 0 ? Markup.inlineKeyboard(buttons) : {}) }
      );
    } catch (e) {
      console.warn('⚠️ Could not report candle failures to admin:', (e as Error).message);
    }
  }

  /**
   * Auto-recheck sl_check_pending trades from previous cycles that still haven't been resolved.
   * Runs at the end of each pull cycle, using already-setup candle terminals.
   */
  private async autoRecheckPendingSlTrades(challengeId: number) {
    try {
      const pendingAccounts = await evaluationEngine.getPendingSlAccounts(challengeId);
      if (pendingAccounts.length === 0) return;

      console.log(`🔍 Auto-rechecking SL for ${pendingAccounts.length} account(s) with pending trades...`);
      let resolved = 0;

      for (const registrationId of pendingAccounts) {
        const result = await evaluationEngine.recheckSlPendingForAccount(challengeId, registrationId);
        if (result.error) {
          console.warn(`⚠️ SL recheck error for reg ${registrationId}: ${result.error}`);
        } else if (result.checked > 0 || result.cleared > 0) {
          console.log(`✅ SL recheck: ${result.nickname} — ${result.checked} checked, ${result.violations} violations, ${result.cleared} cleared`);
          resolved++;
        }
      }

      if (resolved > 0) {
        console.log(`✅ Auto-recheck: resolved ${resolved}/${pendingAccounts.length} accounts`);
      }
    } catch (e) {
      console.warn('⚠️ Auto-recheck SL error:', (e as Error).message);
    }
  }

  /**
   * Auto-start and auto-end challenges based on their scheduled EAT times.
   * Runs every minute. Dates are stored in UTC in the DB — comparison is direct.
   *
   * Auto-start: registration_open → active when start_date is reached
   * Auto-end:   active → reviewing when end_date is reached
   */
  private async checkChallengeLifecycle() {
    try {
      // Auto-start: challenges whose start_date has passed but are still registration_open
      const toStart = await db.query(
        `SELECT id, title, type, source, start_date, end_date, starting_balance, target_balance
         FROM trading_challenges
         WHERE status = 'registration_open'
           AND start_date <= NOW()
           AND (status != 'active')
         ORDER BY start_date ASC`
      );

      for (const challenge of toStart.rows) {
        try {
          await db.query(
            `UPDATE trading_challenges SET status = 'active', updated_at = NOW() WHERE id = $1 AND status = 'registration_open'`,
            [challenge.id]
          );
          console.log(`🚀 Auto-started challenge ${challenge.id}: "${challenge.title}"`);

          // Send admin notification
          await this.bot.bot.telegram.sendMessage(
            config.adminUserId,
            `🚀 <b>Challenge Auto-Started</b>\n\n<b>${challenge.title}</b>\n\nStatus set to <b>Active</b>. VPS pulls will begin on the next scheduled cycle.\n\n<i>Triggered automatically at scheduled start time.</i>`,
            { parse_mode: 'HTML' }
          ).catch(() => {});

          // Trigger an immediate pull cycle for this challenge
          if (!this.isRunning) {
            this.runPullCycleForChallenge(challenge.id).catch(e =>
              console.error(`Auto-start pull error for challenge ${challenge.id}:`, e)
            );
          }
        } catch (e) {
          console.error(`Auto-start error for challenge ${challenge.id}:`, e);
        }
      }

      // Auto-end: challenges whose end_date has passed but are still active
      const toEnd = await db.query(
        `SELECT id, title, type, source
         FROM trading_challenges
         WHERE status = 'active'
           AND end_date <= NOW()
         ORDER BY end_date ASC`
      );

      for (const challenge of toEnd.rows) {
        try {
          await db.query(
            `UPDATE trading_challenges SET status = 'reviewing', updated_at = NOW() WHERE id = $1 AND status = 'active'`,
            [challenge.id]
          );
          console.log(`🏁 Auto-ended challenge ${challenge.id}: "${challenge.title}"`);

          // Send admin notification
          await this.bot.bot.telegram.sendMessage(
            config.adminUserId,
            `🏁 <b>Challenge Auto-Ended</b>\n\n<b>${challenge.title}</b>\n\nStatus set to <b>Reviewing</b>. Running final pull now.\n\n<i>Triggered automatically at scheduled end time.</i>`,
            { parse_mode: 'HTML' }
          ).catch(() => {});

          // Trigger final full pull
          if (!this.isRunning) {
            this.runPullCycleForChallenge(challenge.id).catch(e =>
              console.error(`Auto-end pull error for challenge ${challenge.id}:`, e)
            );
          }
        } catch (e) {
          console.error(`Auto-end error for challenge ${challenge.id}:`, e);
        }
      }
    } catch (e) {
      // Non-fatal — lifecycle check will retry next minute
    }
  }

  private async reportCriticalFailure(challenge: TradingChallenge, message: string) {
    try {
      await this.bot.bot.telegram.sendMessage(config.adminUserId,
        `🚨 <b>CRITICAL: VPS Pull Failed</b>\n<b>${challenge.title}</b>\n\n${message}`,
        { parse_mode: 'HTML' });
    } catch (e) {}
  }

  // ==================== POST-EVAL SL RETRY ====================

  /**
   * After evaluation, find trades still sl_check_pending.
   * For those: identify missing symbols, update OHLC for them, then re-evaluate those accounts.
   * This ensures all SL checks complete within the same pull cycle.
   */
  private async postEvalSlRetry(challenge: TradingChallenge): Promise<void> {
    try {
      const pendingTrades = await db.query(
        `SELECT DISTINCT symbol, MIN(open_time) as earliest_open, MAX(close_time) as latest_close
         FROM wp_trades
         WHERE challenge_id = $1 AND sl_check_pending = true AND symbol IS NOT NULL
         GROUP BY symbol`,
        [challenge.id]
      );

      if (pendingTrades.rows.length === 0) return;

      const remapToBase = (s: string) => s.replace(/[a-z]$/, '') + 'm';
      const symbolRanges: Array<{ symbol: string; from_time: string; to_time: string }> = [];

      for (const row of pendingTrades.rows) {
        const baseSymbol = remapToBase(row.symbol);
        // Always fetch for the time range of the pending trades — whether
        // the symbol has some data or none, we need THIS specific range covered.
        const from = new Date(new Date(row.earliest_open).getTime() - 60000).toISOString();
        const to = new Date(row.latest_close).toISOString();
        symbolRanges.push({ symbol: baseSymbol, from_time: from, to_time: to });
      }

      console.log(`📊 Post-eval SL retry: Fetching OHLC for ${symbolRanges.length} symbol(s) with pending trades...`);
      await this.delay(5000);
      await this.fetchAndStoreCandles(challenge.id, symbolRanges);

      // Now re-evaluate accounts that have pending SL trades
      const pendingAccounts = await evaluationEngine.getPendingSlAccounts(challenge.id);
      if (pendingAccounts.length > 0) {
        console.log(`📊 Post-eval SL retry: Re-evaluating ${pendingAccounts.length} account(s)...`);
        for (const regId of pendingAccounts) {
          await evaluationEngine.evaluateSingleAccount(challenge.id, regId);
        }
      }

      // Final check
      const stillPending = await db.query(
        `SELECT COUNT(*) as cnt FROM wp_trades WHERE challenge_id = $1 AND sl_check_pending = true`,
        [challenge.id]
      );
      const remaining = parseInt(stillPending.rows[0].cnt);
      if (remaining > 0) {
        console.log(`⚠️ Post-eval SL retry: ${remaining} trade(s) still pending (benefit of doubt applied)`);
      } else {
        console.log(`✅ Post-eval SL retry: All SL checks resolved within this cycle`);
      }
    } catch (e) {
      console.error('⚠️ Post-eval SL retry error (non-fatal):', (e as Error).message);
    }
  }

  // ==================== OHLC CANDLE STORAGE ====================

  async updateOhlcCandles(challenge: TradingChallenge): Promise<void> {
    // Collect all distinct symbols traded in this challenge
    const symbolResult = await db.query(
      `SELECT DISTINCT symbol FROM wp_trades WHERE challenge_id = $1 AND symbol IS NOT NULL AND symbol != ''`,
      [challenge.id]
    );
    if (symbolResult.rows.length === 0) return;

    const symbols: string[] = symbolResult.rows.map((r: any) => r.symbol);
    const challengeStart = new Date(challenge.start_date).toISOString();
    const now = new Date().toISOString();

    // Remap to base account format: strip trailing lowercase suffix, add 'm'.
    const remapToBase = (s: string) => s.replace(/[a-z]$/, '') + 'm';

    // === PASS 1: Forward-fill (fetch from last candle to now) ===
    const symbolRanges: Array<{ symbol: string; from_time: string; to_time: string }> = [];
    const seenFetchSymbols = new Set<string>();
    for (const symbol of symbols) {
      const fetchSymbol = remapToBase(symbol);
      if (seenFetchSymbols.has(fetchSymbol)) continue;
      seenFetchSymbols.add(fetchSymbol);
      const lastRow = await db.query(
        `SELECT MAX(time) as last_time FROM ohlc_candles WHERE challenge_id = $1 AND symbol = $2`,
        [challenge.id, fetchSymbol]
      );
      const lastTime = lastRow.rows[0]?.last_time;
      const fromTime = lastTime
        ? new Date(new Date(lastTime).getTime() + 60 * 1000).toISOString()
        : challengeStart;
      if (new Date(fromTime) >= new Date(now)) continue;
      symbolRanges.push({ symbol: fetchSymbol, from_time: fromTime, to_time: now });
    }

    if (symbolRanges.length > 0 && this.baseUrl) {
      console.log(`📊 OHLC: Pass 1 — Forward-fill for ${symbolRanges.length} symbol(s)...`);
      await this.fetchAndStoreCandles(challenge.id, symbolRanges);
    }

    // === PASS 2: Gap-fill (detect missing ranges from challenge start and fill them) ===
    const gapRanges: Array<{ symbol: string; from_time: string; to_time: string }> = [];
    for (const fetchSymbol of seenFetchSymbols) {
      const firstRow = await db.query(
        `SELECT MIN(time) as first_time FROM ohlc_candles WHERE challenge_id = $1 AND symbol = $2`,
        [challenge.id, fetchSymbol]
      );
      const firstTime = firstRow.rows[0]?.first_time;
      if (!firstTime) {
        // No candles at all — entire range is a gap
        gapRanges.push({ symbol: fetchSymbol, from_time: challengeStart, to_time: now });
        continue;
      }
      // If first stored candle is more than 2 minutes after challenge start, there's a gap at the beginning
      const firstMs = new Date(firstTime).getTime();
      const startMs = new Date(challengeStart).getTime();
      if (firstMs - startMs > 2 * 60 * 1000) {
        gapRanges.push({
          symbol: fetchSymbol,
          from_time: challengeStart,
          to_time: new Date(firstMs - 60 * 1000).toISOString(),
        });
      }
    }

    if (gapRanges.length > 0 && this.baseUrl) {
      console.log(`📊 OHLC: Pass 2 — Gap-fill for ${gapRanges.length} symbol(s) missing early data...`);
      // Wait 3s before retry — gives VPS terminal time to load new symbol charts
      await this.delay(3000);
      await this.fetchAndStoreCandles(challenge.id, gapRanges);

      // Pass 3: If any symbols STILL have 0 candles, try one more time with a longer wait
      const stillEmpty: Array<{ symbol: string; from_time: string; to_time: string }> = [];
      for (const range of gapRanges) {
        const check = await db.query(
          `SELECT COUNT(*) as cnt FROM ohlc_candles WHERE challenge_id = $1 AND symbol = $2`,
          [challenge.id, range.symbol]
        );
        if (parseInt(check.rows[0].cnt) === 0) {
          stillEmpty.push(range);
        }
      }
      if (stillEmpty.length > 0 && this.baseUrl) {
        console.log(`📊 OHLC: Pass 3 — Retry ${stillEmpty.length} symbol(s) that returned 0 (waiting 5s for chart load)...`);
        await this.delay(5000);
        await this.fetchAndStoreCandles(challenge.id, stillEmpty);
      }
    }

    // Final count
    const totalResult = await db.query(
      `SELECT COUNT(*) as total FROM ohlc_candles WHERE challenge_id = $1`, [challenge.id]
    );
    console.log(`✅ OHLC: Total candles stored for challenge ${challenge.id}: ${totalResult.rows[0].total}`);
  }

  /**
   * Fetch candles from VPS and store in DB. Shared by forward-fill and gap-fill passes.
   */
  private async fetchAndStoreCandles(
    challengeId: number,
    symbolRanges: Array<{ symbol: string; from_time: string; to_time: string }>
  ): Promise<number> {
    if (!this.baseUrl || symbolRanges.length === 0) return 0;

    let response: any;
    try {
      const res = await axios.post(`${this.baseUrl}/ohlc-bulk`, {
        symbols: symbolRanges,
        timeframe: 'M1',
        api_key: this.apiKey,
      }, { timeout: 180000 });
      response = res.data;
    } catch (e: any) {
      console.error(`⚠️ OHLC: VPS request failed:`, e?.message || e);
      return 0;
    }

    if (!response?.results) {
      console.error('⚠️ OHLC: Invalid response from VPS');
      return 0;
    }

    let totalInserted = 0;
    for (const [symbol, data] of Object.entries(response.results) as [string, any][]) {
      if (!data.success || !data.candles?.length) continue;
      const candles = data.candles as Array<{ time: string; open: number; high: number; low: number; close: number; volume: number }>;
      const CHUNK = 500;
      for (let i = 0; i < candles.length; i += CHUNK) {
        const chunk = candles.slice(i, i + CHUNK);
        const values: any[] = [];
        const placeholders = chunk.map((c, idx) => {
          const base = idx * 8;
          values.push(challengeId, symbol, c.time, c.open, c.high, c.low, c.close, c.volume);
          return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`;
        });
        await db.query(
          `INSERT INTO ohlc_candles (challenge_id, symbol, time, open, high, low, close, volume)
           VALUES ${placeholders.join(',')}
           ON CONFLICT (challenge_id, symbol, time) DO NOTHING`,
          values
        ).catch(e => console.error(`⚠️ OHLC insert error for ${symbol}:`, e));
        totalInserted += chunk.length;
      }
      console.log(`📊 OHLC: ${symbol} — ${candles.length} candles saved`);
    }
    return totalInserted;
  }

  // ==================== UTILITY ====================

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
