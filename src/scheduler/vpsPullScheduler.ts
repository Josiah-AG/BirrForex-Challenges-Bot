// VPS Pull Scheduler v3.0 — credentialFailureCache + Step 4c confirmation
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

const MAX_TERMINALS = 10;
const MAX_RETRIES_PER_ACCOUNT = 3;
const RETRY_DELAY_MS = 3000;
const ACCOUNT_TIMEOUT_MS = 30000;
const BATCH_DELAY_MS = 1500;
const PASSWORD_WARNING_HOURS = 48;
const TERMINAL_HEALTH_RECHECK_MS = 10 * 60 * 1000;
const TERMINAL_FAILURE_THRESHOLD = 5;
const CREDENTIAL_CONFIRM_ATTEMPTS = 1; // Detect on first attempt, confirm on a DIFFERENT terminal (Step 4a)
const CYCLE_RETRY_PASSES = 2;
const CYCLE_RETRY_WAIT_MS = 30000; // 30s between retry passes
const HEALTHY_RETRY_PASSES = 5;    // extra passes on healthy-only terminals after main retry
const HEALTHY_RETRY_WAIT_MS = 15000; // 15s between healthy-only retry passes

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
  terminalId?: number;
  terminalsAttempted?: number[];
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
}

/**
 * Shared queue — thread-safe (single-threaded JS, but clear semantics)
 */
class SharedQueue {
  private queue: AccountToPull[] = [];
  private inProgress = new Set<number>();

  load(accounts: AccountToPull[]) {
    // Priority accounts (failed last cycle) go to front
    const priority = accounts.filter(a => a.isPriority);
    const normal = accounts.filter(a => !a.isPriority);
    this.queue = [...priority, ...normal];
    this.inProgress.clear();
  }

  /** Terminal grabs next available account */
  next(): AccountToPull | null {
    if (this.queue.length === 0) return null;
    const account = this.queue.shift()!;
    this.inProgress.add(account.registrationId);
    return account;
  }

  /** Mark account as done (success or final failure) */
  done(registrationId: number) {
    this.inProgress.delete(registrationId);
  }

  /** Return account to queue (for retry) */
  requeue(account: AccountToPull) {
    this.inProgress.delete(account.registrationId);
    this.queue.push(account);
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
  private terminals: TerminalState[] = [];
  private sharedQueue = new SharedQueue();

  /**
   * Accounts confirmed as credential failures during the current cycle.
   * Any account in this set returns invalid_credentials INSTANTLY — no HTTP
   * request, no terminal contact — regardless of which retry pass calls it.
   * Cleared at the start of every new pull cycle.
   */
  private credentialFailureCache = new Set<number>();

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

    // EAT = UTC+3 → UTC times: 21:00, 01:00, 05:00, 09:00, 13:00, 17:00
    // EAT schedule: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00
    cron.schedule('0 21,1,5,9,13,17 * * *', () => this.runPullCycle());

    // Check for 48h disqualifications every hour
    cron.schedule('30 * * * *', () => this.checkDisqualifications());

    // Terminal health recheck every 10 min
    cron.schedule('*/10 * * * *', () => this.recheckUnhealthyTerminals());

    // Auto-start / auto-end challenges based on scheduled EAT times — runs every minute
    cron.schedule('* * * * *', () => this.checkChallengeLifecycle());

    console.log('✅ VPS Pull Scheduler v2 started (shared queue, per-account eval, staging → live flush)');

    // Resume interrupted cycle on startup (after 5s delay for other services to init)
    setTimeout(() => this.resumeInterruptedCycle(), 5000);
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
        this.isRunning = false;
        return;
      }

      const healthyTerminals = this.terminals.filter(t => t.isHealthy);
      if (healthyTerminals.length === 0) { this.isRunning = false; return; }

      // Load remaining into shared queue and process
      this.sharedQueue.load(remaining.map(a => ({ ...a, isPriority: false })));
      const batchId = await this.createPullBatch(challengeId, remaining.length);
      await this.runSharedQueueWorkers(healthyTerminals, challenge, batchId);

      const duration = Math.round((Date.now() - Date.now()) / 1000);
      console.log(`✅ VPS Pull: Resumed cycle complete — ${remaining.length} accounts processed`);

      this.isRunning = false;
    } catch (error) {
      console.error('⚠️ VPS Pull: Resume interrupted cycle error:', error);
      this.isRunning = false;
    }
  }

  /**
   * Main pull cycle — shared queue architecture
   */
  async runPullCycle() {
    if (this.isRunning) {
      console.log('⚠️ VPS Pull: Already running, skipping');
      return;
    }
    this.isRunning = true;
    this.cancelRequested = false;
    this.abortController = new AbortController();
    const startTime = Date.now();

    try {
      const challengeToPull = await this.resolveChallengeForPull();
      if (!challengeToPull) {
        this.isRunning = false;
        return;
      }

      // Weekend logic
      if (await this.shouldSkipWeekend(challengeToPull)) {
        this.isRunning = false;
        return;
      }

      // Determine if this is a final sync (Saturday OR challenge ended)
      const isChallengeEnded = challengeToPull.status === 'reviewing' || challengeToPull.status === 'completed';
      const isFinalSync = this.isSaturdayFinalSync() || isChallengeEnded;

      // === STEP 1: Flush previous cycle's staging data to live + update rankings ===
      await leaderboardService.flushStagingToLive(challengeToPull.id);
      await leaderboardService.ensureAllParticipantsHaveEntries(challengeToPull.id);
      await leaderboardService.updateRankings(challengeToPull.id);

      // === STEP 2: Build shared queue with failed-first priority ===
      const accounts = await this.getAccountsToPull(challengeToPull.id);
      if (accounts.length === 0) {
        console.log('📊 VPS Pull: No accounts to pull');
        this.isRunning = false;
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
      this.terminals.forEach(t => { t.totalProcessed = 0; t.totalSuccess = 0; t.totalFailed = 0; });
      this.credentialFailureCache.clear();

      // Create batch record
      const batchId = await this.createPullBatch(challengeToPull.id, accounts.length);

      // Load shared queue
      this.sharedQueue.load(accountsWithPriority);

      // === STEP 3: Process with shared queue (terminals grab work) ===
      const healthyTerminals = this.terminals.filter(t => t.isHealthy);
      if (healthyTerminals.length === 0) {
        console.error('❌ VPS Pull: ALL terminals unhealthy! Aborting.');
        await this.completePullBatch(batchId, 0, accounts.length, 0, 'all_terminals_unhealthy');
        await this.reportCriticalFailure(challengeToPull, 'All 10 terminals are unhealthy.');
        this.isRunning = false;
        return;
      }

      // === PRE-CYCLE: Login candle accounts to their designated terminals ===
      await candleTerminalManager.setup(challengeToPull.id, healthyTerminals.map(t => t.id));

      // Launch terminal workers (they pull from shared queue)
      const allResults = await this.runSharedQueueWorkers(healthyTerminals, challengeToPull, batchId);

      // If admin cancelled — skip retry, leaderboard, and reporting; just clean up
      if (this.cancelRequested) {
        console.log('🛑 VPS Pull: Cancelled — skipping retry/leaderboard steps');
        await candleTerminalManager.restore();
        this.isRunning = false;
        this.cancelRequested = false;
        return;
      }

      // === STEP 4: Retry within same cycle (non-credential failures) ===
      const nonCredentialFailures = allResults.filter(
        r => !r.success && r.errorCode !== 'invalid_credentials'
      );

      if (nonCredentialFailures.length > 0) {
        const retryResults = await this.retryCycleFailures(
          nonCredentialFailures, accounts, challengeToPull, batchId
        );
        // Merge retry results
        for (const rr of retryResults) {
          const idx = allResults.findIndex(r => r.registrationId === rr.registrationId);
          if (idx >= 0) allResults[idx] = rr;
          else allResults.push(rr);
        }
      }

      // === STEP 4b: Healthy-only retry — up to 5 extra passes on recovered terminals ===
      const stillFailingAfterRetry = allResults.filter(
        r => !r.success && r.errorCode !== 'invalid_credentials'
      );
      if (stillFailingAfterRetry.length > 0) {
        console.log(`🔁 VPS Pull: ${stillFailingAfterRetry.length} still failing — starting healthy-only retry loop`);
        const healthyRetryResults = await this.retryOnHealthyTerminals(
          stillFailingAfterRetry, accounts, challengeToPull, batchId
        );
        for (const rr of healthyRetryResults) {
          const idx = allResults.findIndex(r => r.registrationId === rr.registrationId);
          if (idx >= 0) allResults[idx] = rr;
          else allResults.push(rr);
        }
      }

      // === STEP 4c: Confirm credential failures on ONE different healthy terminal ===
      // Worker v9.0 guarantees -6 never kills a terminal (direct base login recovery),
      // so sending bad credentials to a second terminal is now safe — it returns
      // error_type:"credential_failure" and recovers itself without any restart.
      //
      // Logic:
      //   success on T2      → was a T1 terminal issue, not credentials → treat as success
      //   invalid_credentials on T2 → confirmed bad password → final label, notify user
      //   other error on T2  → keep as invalid_credentials (safer assumption)
      const toConfirm = allResults.filter(r => !r.success && r.errorCode === 'invalid_credentials');
      if (toConfirm.length > 0) {
        console.log(`🔑 VPS Pull: Confirming ${toConfirm.length} credential failure(s) on different terminals`);
        const healthyNow = this.terminals.filter(t => t.isHealthy);
        for (const failure of toConfirm) {
          const confirmTerminal = healthyNow.find(t => t.id !== failure.terminalId);
          if (!confirmTerminal) continue;
          const account = accounts.find(a => a.registrationId === failure.registrationId);
          if (!account) continue;
          console.log(`🔑 Confirming ${failure.accountNumber} on T${confirmTerminal.id} (originally failed on T${failure.terminalId})`);

          // Temporarily remove from cache so pullSingleAccount makes the real HTTP request.
          // We re-add immediately after regardless of outcome — this is the ONE allowed
          // confirmation attempt on a different terminal.
          this.credentialFailureCache.delete(account.registrationId);
          const confirmResult = await this.pullSingleAccount(account, confirmTerminal.id, challengeToPull, this.abortController?.signal);
          this.credentialFailureCache.add(account.registrationId); // re-lock after confirmation

          const idx = allResults.findIndex(r => r.registrationId === failure.registrationId);
          if (confirmResult.success) {
            // Succeeded on T2 — T1 had a terminal issue, not credentials
            console.log(`✅ ${failure.accountNumber} succeeded on T${confirmTerminal.id} — was terminal issue, treating as success`);
            this.credentialFailureCache.delete(account.registrationId); // clear cache — account is fine
            if (idx >= 0) allResults[idx] = { ...confirmResult, terminalId: confirmTerminal.id };
            try { await evaluationEngine.evaluateSingleAccount(challengeToPull.id, account.registrationId); } catch (e) {}
          } else if (confirmResult.errorCode === 'invalid_credentials') {
            console.log(`🔑 ${failure.accountNumber} confirmed bad credentials on T${confirmTerminal.id}`);
          } else {
            console.log(`⚠️ ${failure.accountNumber} got different error on T${confirmTerminal.id}: ${confirmResult.errorCode} — keeping as credential failure`);
          }
        }
      }

      // === STEP 5: Categorize final results ===
      const successful = allResults.filter(r => r.success);
      const credentialFailures = allResults.filter(r => !r.success && r.errorCode === 'invalid_credentials');
      const otherFailures = allResults.filter(r => !r.success && r.errorCode !== 'invalid_credentials');

      // Handle credential failures — notify users
      for (const failure of credentialFailures) {
        await this.handleCredentialFailure(failure, challengeToPull);
      }

      // Bulk update pull statuses
      await this.bulkUpdatePullStatus(allResults);

      // Log errors
      for (const failure of [...credentialFailures, ...otherFailures]) {
        await this.logPullError(batchId, failure);
      }

      // Complete batch
      const newTrades = successful.reduce((sum, r) => sum + (r.tradesCount || 0), 0);
      await this.completePullBatch(batchId, successful.length, credentialFailures.length + otherFailures.length, newTrades, 'completed');
      await this.savePullTerminalStats(batchId);

      // === STEP 6: Final sync → immediate leaderboard update ===
      if (isFinalSync && successful.length > 0) {
        console.log('📊 VPS Pull: Final sync — flushing staging + updating leaderboard immediately');
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

      // === POST-CYCLE: Auto-recheck any trades still pending from previous cycles ===
      await this.autoRecheckPendingSlTrades(challengeToPull.id);

      // === POST-CYCLE: Restore candle terminals back to base account ===
      await candleTerminalManager.restore();

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
      this.isRunning = false;
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
        this.isRunning = false;
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
      this.terminals.forEach(t => { t.totalProcessed = 0; t.totalSuccess = 0; t.totalFailed = 0; });
      this.credentialFailureCache.clear();

      batchId = await this.createPullBatch(challengeId, accounts.length);
      this.sharedQueue.load(accounts.map(a => ({ ...a, isPriority: false })));

      const healthyTerminals = this.terminals.filter(t => t.isHealthy);
      if (healthyTerminals.length === 0) {
        console.error('❌ VPS Pull: ALL terminals unhealthy');
        await this.completePullBatch(batchId, 0, accounts.length, 0, 'all_terminals_unhealthy');
        batchId = null;
        return;
      }

      await candleTerminalManager.setup(challengeToPull.id, healthyTerminals.map(t => t.id));
      const allResults = await this.runSharedQueueWorkers(healthyTerminals, challengeToPull, batchId);

      if (this.cancelRequested) {
        console.log('🛑 VPS Pull: Admin pull cancelled');
        await candleTerminalManager.restore();
        await this.completePullBatch(batchId, 0, accounts.length, 0, 'cancelled').catch(() => {});
        batchId = null;
        return;
      }

      await candleTerminalManager.restore();

      // Healthy-only retry — up to 5 extra passes on recovered terminals
      const adminStillFailing = allResults.filter(r => !r.success && r.errorCode !== 'invalid_credentials');
      if (adminStillFailing.length > 0) {
        console.log(`🔁 VPS Admin Pull: ${adminStillFailing.length} still failing — starting healthy-only retry loop`);
        const healthyRetryResults = await this.retryOnHealthyTerminals(
          adminStillFailing, accounts, challengeToPull, batchId!
        );
        for (const rr of healthyRetryResults) {
          const idx = allResults.findIndex(r => r.registrationId === rr.registrationId);
          if (idx >= 0) allResults[idx] = rr;
          else allResults.push(rr);
        }
      }

      const successful = allResults.filter(r => r.success);
      const failed = allResults.filter(r => !r.success);
      const newTrades = successful.reduce((sum, r) => sum + (r.tradesCount || 0), 0);
      await this.completePullBatch(batchId, successful.length, failed.length, newTrades, 'completed');
      const completedBatchId = batchId;
      batchId = null;
      await this.savePullTerminalStats(completedBatchId);
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
      this.isRunning = false;
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
   * Single terminal worker — keeps grabbing from shared queue until empty
   */
  private async terminalWorker(
    terminal: TerminalState,
    challenge: TradingChallenge,
    batchId: number,
    resultsMutex: { results: PullResult[] }
  ): Promise<void> {
    while (true) {
      if (this.cancelRequested) break; // Admin cancelled

      const account = this.sharedQueue.next();
      if (!account) break; // Queue empty

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

        // Save VPS balance and mark pull time for progress tracking
        if (result.balance !== undefined) {
          await db.query(`UPDATE trading_registrations SET last_known_balance = $1, last_pull_at = NOW() WHERE id = $2`, [result.balance, account.registrationId]).catch(() => {});
        } else {
          await db.query(`UPDATE trading_registrations SET last_pull_at = NOW() WHERE id = $1`, [account.registrationId]).catch(() => {});
        }

        // === PER-ACCOUNT EVALUATION (streaming) ===
        try {
          await evaluationEngine.evaluateSingleAccount(challenge.id, account.registrationId);
        } catch (evalErr) {
          console.error(`⚠️ Eval error for ${account.accountNumber}:`, evalErr);
          // Non-fatal — evaluation saved partially
        }
      } else {
        if (result.errorCode === 'invalid_credentials') {
          // Do NOT update last_pull_at — preserve the last successful pull timestamp
          // so the next cycle's incremental window covers from the last real pull
          resultsMutex.results.push(result);
          terminal.totalFailed++;
        } else {
          // Terminal/network error
          terminal.consecutiveFailures++;
          if (terminal.consecutiveFailures >= TERMINAL_FAILURE_THRESHOLD) {
            terminal.isHealthy = false;
            terminal.unhealthySince = new Date();
            console.log(`⚠️ Terminal ${terminal.id} marked UNHEALTHY`);
            // Put account back for another terminal
            this.sharedQueue.requeue(account);
            break;
          }
          // Do NOT update last_pull_at — preserve the last successful pull timestamp
          // so the next cycle's incremental window covers from the last real pull
          resultsMutex.results.push(result);
          terminal.totalFailed++;
        }
      }

      this.sharedQueue.done(account.registrationId);
      await this.delay(BATCH_DELAY_MS);
    }
  }

  /**
   * Retry failed accounts within the same cycle.
   * Up to CYCLE_RETRY_PASSES passes, 30s wait between passes.
   * Uses router's smart retry (tries multiple terminals).
   */
  private async retryCycleFailures(
    failures: PullResult[],
    allAccounts: AccountToPull[],
    challenge: TradingChallenge,
    batchId: number
  ): Promise<PullResult[]> {
    let toRetry = failures.map(f =>
      allAccounts.find(a => a.registrationId === f.registrationId)
    ).filter(Boolean) as AccountToPull[];

    const finalResults: PullResult[] = [];

    for (let pass = 1; pass <= CYCLE_RETRY_PASSES; pass++) {
      if (toRetry.length === 0) break;

      console.log(`🔄 VPS Pull: Retry pass ${pass}/${CYCLE_RETRY_PASSES} — ${toRetry.length} accounts`);
      await this.delay(CYCLE_RETRY_WAIT_MS);

      const stillFailing: AccountToPull[] = [];
      const healthyTerminals = this.terminals.filter(t => t.isHealthy);
      if (healthyTerminals.length === 0) break;

      // Try each account on up to 3 different terminals (smart retry)
      for (const account of toRetry) {
        let succeeded = false;
        const terminalsAttempted: number[] = [];

        for (let t = 0; t < Math.min(3, healthyTerminals.length); t++) {
          const terminal = healthyTerminals[t % healthyTerminals.length];
          terminalsAttempted.push(terminal.id);

          const result = await this.pullSingleAccount(account, terminal.id, challenge, this.abortController?.signal);
          if (result.success) {
            result.terminalsAttempted = terminalsAttempted;
            finalResults.push(result);
            succeeded = true;

            // Per-account evaluation on retry success
            try {
              await evaluationEngine.evaluateSingleAccount(challenge.id, account.registrationId);
            } catch (e) {}
            break;
          }

          if (result.errorCode === 'invalid_credentials') {
            result.terminalsAttempted = terminalsAttempted;
            finalResults.push(result);
            succeeded = true; // Don't retry credentials
            break;
          }

          await this.delay(RETRY_DELAY_MS);
        }

        if (!succeeded) {
          stillFailing.push(account);
        }
        await this.delay(BATCH_DELAY_MS);
      }

      toRetry = stillFailing;
    }

    // Mark remaining as final failures
    for (const account of toRetry) {
      finalResults.push({
        registrationId: account.registrationId,
        accountNumber: account.accountNumber,
        userId: account.userId,
        username: account.username,
        success: false,
        errorCode: 'retry_exhausted',
        errorMessage: `Failed after ${CYCLE_RETRY_PASSES} retry passes`,
      });
    }

    // Report persistent failures to admin
    if (toRetry.length > 0) {
      try {
        const failList = toRetry.slice(0, 10).map(a =>
          `• ${a.accountNumber} (@${a.username || 'unknown'})`
        ).join('\n');
        await this.bot.bot.telegram.sendMessage(config.adminUserId,
          `⚠️ <b>${toRetry.length} accounts still failing after ${CYCLE_RETRY_PASSES} retry passes</b>\n\n${failList}${toRetry.length > 10 ? `\n<i>+${toRetry.length - 10} more</i>` : ''}`,
          { parse_mode: 'HTML' });
      } catch (e) {}
    }

    return finalResults;
  }

  /**
   * Healthy-only retry loop — runs AFTER retryCycleFailures.
   * Takes whatever is still failing and runs up to HEALTHY_RETRY_PASSES additional
   * passes using ONLY healthy terminals (shared queue, parallel).
   * Before each pass, unhealthy terminals are rechecked so recovered ones re-join.
   * Credential failures are never retried here.
   *
   * Example: 20 fail → pass1 → 10 fail → pass2 → 5 fail → ... → up to 5 passes.
   */
  private async retryOnHealthyTerminals(
    failures: PullResult[],
    allAccounts: AccountToPull[],
    challenge: TradingChallenge,
    batchId: number
  ): Promise<PullResult[]> {
    // Only non-credential failures enter this loop
    let toRetry = failures
      .filter(f => !f.success && f.errorCode !== 'invalid_credentials')
      .map(f => allAccounts.find(a => a.registrationId === f.registrationId))
      .filter(Boolean) as AccountToPull[];

    if (toRetry.length === 0) return [];

    const finalResults: PullResult[] = [];

    for (let pass = 1; pass <= HEALTHY_RETRY_PASSES; pass++) {
      if (toRetry.length === 0) break;
      if (this.cancelRequested) break;

      // Short wait between passes — gives unhealthy terminals time to recover
      await this.delay(HEALTHY_RETRY_WAIT_MS);

      // Recheck unhealthy terminals — a terminal that recovered gets included
      await this.recheckUnhealthyTerminals();

      const healthyTerminals = this.terminals.filter(t => t.isHealthy);
      if (healthyTerminals.length === 0) {
        console.log(`⚠️ VPS Healthy-Retry pass ${pass}: no healthy terminals — stopping`);
        break;
      }

      console.log(`🔁 VPS Healthy-Retry pass ${pass}/${HEALTHY_RETRY_PASSES} — ${toRetry.length} accounts, ${healthyTerminals.length} healthy terminals`);

      // Load only the failing accounts into the shared queue
      this.sharedQueue.load(toRetry.map(a => ({ ...a, isPriority: true })));

      // Run all healthy terminals in parallel (same shared queue pattern)
      const passResults = await this.runSharedQueueWorkers(healthyTerminals, challenge, batchId);

      // Separate successes from still-failing
      const stillFailing: AccountToPull[] = [];
      for (const account of toRetry) {
        const result = passResults.find(r => r.registrationId === account.registrationId);
        if (result) {
          finalResults.push(result);
          if (!result.success && result.errorCode !== 'invalid_credentials') {
            stillFailing.push(account);
          }
        } else {
          // Not processed this pass (queue may have been aborted) — keep for next pass
          stillFailing.push(account);
        }
      }

      const passSucceeded = toRetry.length - stillFailing.length;
      console.log(`🔁 VPS Healthy-Retry pass ${pass}: ${passSucceeded} recovered, ${stillFailing.length} still failing`);

      toRetry = stillFailing;
    }

    // Any accounts still failing after all passes — mark as exhausted
    for (const account of toRetry) {
      finalResults.push({
        registrationId: account.registrationId,
        accountNumber: account.accountNumber,
        userId: account.userId,
        username: account.username,
        success: false,
        errorCode: 'retry_exhausted',
        errorMessage: `Failed after ${CYCLE_RETRY_PASSES} standard + ${HEALTHY_RETRY_PASSES} healthy-only retry passes`,
      });
    }

    return finalResults;
  }

  /**
   * Pull a single account with retry logic
   */
  private async pullSingleAccount(account: AccountToPull, terminalId: number, challenge?: any, abortSignal?: AbortSignal): Promise<PullResult> {
    // Cache hit — this account's credentials are already confirmed bad this cycle.
    // Return instantly with zero HTTP requests and zero terminal contact.
    if (this.credentialFailureCache.has(account.registrationId)) {
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

    let credentialFailCount = 0;

    for (let attempt = 1; attempt <= MAX_RETRIES_PER_ACCOUNT; attempt++) {
      try {
        // Pull strategy:
        // - Challenge ended (status = reviewing): FULL pull from challenge start (final sync)
        // - First pull (lastPullAt is null): FULL pull from challenge start
        // - Subsequent pulls during active challenge: incremental (5h window)
        // - Orders always fetch from challenge start (lightweight, provides open_time/open_price)
        const challengeStartDate = challenge?.start_date ? new Date(challenge.start_date).toISOString() : undefined;
        const isChallengeEnded = challenge?.status === 'reviewing' || challenge?.status === 'completed';
        let fromDate: string;

        if (isChallengeEnded || !account.lastPullAt) {
          // Full pull: challenge ended (final sync) OR first-ever pull
          fromDate = challengeStartDate || new Date(2020, 0, 1).toISOString();
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
            terminalId,
          };
        }

        // Credential failure check — prefer explicit error_type field, fall back to message parsing
        const err = (data.message || '').toLowerCase();
        if (data.error_type === 'credential_failure' || err.includes('authorization') || err.includes('invalid') || err.includes('password') || err.includes('credential')) {
          credentialFailCount++;
          if (credentialFailCount < CREDENTIAL_CONFIRM_ATTEMPTS) {
            await this.delay(RETRY_DELAY_MS);
            continue;
          }
          // Cache this account — any further calls this cycle return instantly
          this.credentialFailureCache.add(account.registrationId);
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
          credentialFailCount++;
          if (credentialFailCount < CREDENTIAL_CONFIRM_ATTEMPTS) {
            await this.delay(RETRY_DELAY_MS);
            continue;
          }
          this.credentialFailureCache.add(account.registrationId);
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

    for (let i = 0; i < Math.min(3, healthyTerminals.length); i++) {
      const terminal = healthyTerminals[i];
      // Load challenge for from_date
      const challengeData = await db.query(`SELECT start_date FROM trading_challenges WHERE id = $1`, [challengeId]);
      const result = await this.pullSingleAccount(account, terminal.id, challengeData.rows[0]);

      if (result.success) {
        // Update status
        await db.query(
          `UPDATE trading_registrations SET last_pull_at = NOW(), pull_status = 'success', pull_error = NULL WHERE id = $1`,
          [registrationId]
        );

        // Run evaluation
        let evaluated = false;
        try {
          await evaluationEngine.evaluateSingleAccount(challengeId, registrationId);
          evaluated = true;
        } catch (e) {}

        return { ...result, evaluated };
      }

      if (result.errorCode === 'invalid_credentials') {
        return result;
      }

      await this.delay(RETRY_DELAY_MS);
    }

    return {
      registrationId, accountNumber: account.accountNumber,
      userId: account.userId, username: account.username,
      success: false, errorCode: 'retry_exhausted', errorMessage: 'Failed on all terminals',
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
            `Healthy terminals: ${this.getHealthyTerminalCount()}/10`,
            { parse_mode: 'HTML' });
        } catch (e) {}
        terminal.unhealthySince = new Date();
      }
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

    // forceAll = admin override: pull every account that has credentials, regardless of
    // balance/blown state or DQ status. Evaluation engine preserves DQ flags — it writes
    // to staging which is then flushed without clearing the disqualified column.
    const disqualifiedFilter = forceAll ? '' : 'AND r.disqualified = false';
    const connectionFilter = forceAll ? '' : 'AND r.connection_verified = true';
    const zeroBalanceFilter = forceAll
      ? ''
      : 'AND (l.zero_balance_at IS NULL OR l.total_trades = 0 OR l.id IS NULL OR r.actual_starting_balance IS NULL)';

    const result = await db.query(
      `SELECT r.id, r.account_number, r.mt5_server, r.investor_password, r.user_id, r.username, r.nickname, r.last_pull_at
       FROM trading_registrations r
       LEFT JOIN wp_leaderboard l ON r.id = l.registration_id
       WHERE r.challenge_id = $1
         ${disqualifiedFilter}
         AND r.investor_password IS NOT NULL
         ${connectionFilter}
         ${zeroBalanceFilter}
         AND (r.pull_status IS NULL OR r.pull_status != 'password_changed')
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
             open_time = EXCLUDED.open_time,
             close_time = EXCLUDED.close_time,
             open_price = EXCLUDED.open_price,
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
          `UPDATE trading_registrations SET disqualified = true, disqualified_at = NOW(), disqualified_reason = 'Investor password changed — no update within 48h' WHERE id = $1`,
          [reg.id]
        );

        try {
          await this.bot.bot.telegram.sendMessage(reg.user_id,
            `🚫 <b>Registration Disqualified — ${activeChallenge.title}</b>\n\n` +
            `Account <b>${reg.account_number}</b> has been disqualified.\n\n` +
            `📛 <b>Reason:</b> Investor password was changed and not updated within 48 hours.\n\n` +
            `<i>Contact @birrFXadmin if you believe this is an error.</i>`,
            { parse_mode: 'HTML' });
        } catch (e) {}

        try {
          await this.bot.bot.telegram.sendMessage(config.adminUserId,
            `🚫 Auto-DQ: @${reg.username || 'unknown'} (${reg.account_number}) — password not updated in 48h`);
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
        if (t.totalProcessed === 0 && t.isHealthy) continue; // skip idle healthy terminals — not useful
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
    text += `⏱️ ${durationSec}s | Terminals: ${this.getHealthyTerminalCount()}/10 healthy\n`;
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
          `Healthy terminals: ${this.getHealthyTerminalCount()}/10\n` +
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
      // Use sl_check_pending trades as the source of truth (DB-persisted)
      const result = await db.query(
        `SELECT DISTINCT r.id as registration_id, r.account_number, r.nickname, r.account_subtype,
                COUNT(t.id) as pending_count
         FROM trading_registrations r
         JOIN wp_trades t ON t.registration_id = r.id AND t.challenge_id = $1 AND t.sl_check_pending = true
         WHERE r.challenge_id = $1
         GROUP BY r.id, r.account_number, r.nickname, r.account_subtype`,
        [challengeId]
      );
      if (result.rows.length === 0) return;

      const lines = result.rows
        .map((r: any) => `• ${r.nickname || r.account_number} (${r.account_subtype || 'standard'}) — ${r.pending_count} trade(s)`)
        .join('\n');

      // Build inline keyboard — one retry button per account, callback data is self-contained
      const { Markup } = require('telegraf');
      const buttons = result.rows.map((r: any) =>
        [Markup.button.callback(
          `🔄 Retry: ${r.nickname || r.account_number}`,
          `sl_retry_${challengeId}_${r.registration_id}`
        )]
      );

      await this.bot.bot.telegram.sendMessage(
        config.adminUserId,
        `⚠️ <b>Fake SL Check Incomplete</b>\n\n` +
        `${result.rows.length} account(s) had candle fetch failures.\n` +
        `Benefit of doubt applied — trades not penalised yet.\n\n` +
        `${lines}\n\n` +
        `<i>Click a button to retry the SL check for that account now.\n` +
        `Unretried accounts will be auto-checked on the next pull cycle.</i>`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
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

  // ==================== UTILITY ====================

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
