import cron from 'node-cron';
import axios from 'axios';
import { Bot } from '../bot/bot';
import { tradingChallengeService, TradingChallenge } from '../services/tradingChallengeService';
import { evaluationEngine } from '../services/wpEvaluationEngine';
import { config } from '../config';
import { db } from '../database/db';
import { Markup } from 'telegraf';

/**
 * VPS Pull Scheduler — Optimized for 3000 participants
 *
 * Architecture:
 * - 10 terminals process accounts in PARALLEL (not sequential)
 * - Each terminal handles ~300 accounts per cycle
 * - Accounts are batched within each terminal (sequential per terminal, parallel across terminals)
 * - Unhealthy terminals get a 10-min cooldown then health-check before reporting to admin
 * - Credential failures notify users immediately with 48h deadline
 *
 * Schedule: 6 pulls/day at 06:00, 10:00, 14:00, 18:00, 22:00, 02:00 EAT
 *
 * Weekend logic:
 * - Forex market closes Friday ~22:00 UTC (01:00 EAT Saturday)
 * - Forex market opens Sunday ~22:00 UTC (01:00 EAT Monday)
 * - Saturday first pull (06:00 EAT) always runs as a "sync check" to ensure
 *   all data from Friday's close is captured
 * - Remaining Saturday/Sunday pulls are SKIPPED unless weekend_trading is allowed
 *   in the challenge rules (e.g., crypto-only challenges)
 * - Monday first pull (06:00 EAT) runs normally as the new week starts
 *
 * With 3000 accounts across 10 parallel terminals:
 * - ~300 accounts per terminal
 * - ~1.5s delay between accounts = ~450s (7.5 min) per terminal
 * - Total cycle: ~8-10 min (all terminals run in parallel)
 */

const MAX_TERMINALS = 10;
const MAX_RETRIES_PER_ACCOUNT = 3;
const RETRY_DELAY_MS = 3000;
const ACCOUNT_TIMEOUT_MS = 30000;
const BATCH_DELAY_MS = 1500; // 1.5s between accounts (balances speed vs API load)
const PASSWORD_WARNING_HOURS = 48;
const TERMINAL_HEALTH_RECHECK_MS = 10 * 60 * 1000; // 10 minutes
const TERMINAL_FAILURE_THRESHOLD = 5; // Mark unhealthy after 5 consecutive non-credential failures
const CREDENTIAL_CONFIRM_ATTEMPTS = 2; // Try credential failures twice to be sure

interface PullResult {
  registrationId: number;
  accountNumber: string;
  telegramId: number;
  username: string | null;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  tradesCount?: number;
  dealsCount?: number;
  balance?: number;
  equity?: number;
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
  telegramId: number;
  username: string | null;
  nickname: string | null;
}

export class VpsPullScheduler {
  private bot: Bot;
  private isRunning = false;
  private baseUrl: string;
  private apiKey: string;
  private terminals: TerminalState[] = [];

  constructor(bot: Bot) {
    this.bot = bot;
    this.baseUrl = config.vpsApiUrl;
    this.apiKey = config.vpsApiKey;

    // Initialize terminal states
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

    // Run every day (including weekends) — weekend logic handled inside runPullCycle
    // 6 pulls/day: 06:00, 10:00, 14:00, 18:00, 22:00, 02:00 EAT
    // EAT = UTC+3, so UTC times: 03:00, 07:00, 11:00, 15:00, 19:00, 23:00
    cron.schedule('0 3,7,11,15,19,23 * * *', () => this.runPullCycle());

    // Check for 48h disqualifications every hour
    cron.schedule('30 * * * *', () => this.checkDisqualifications());

    // Terminal health recheck — runs every 10 min to recover unhealthy terminals
    cron.schedule('*/10 * * * *', () => this.recheckUnhealthyTerminals());

    console.log('✅ VPS Pull Scheduler started (6 pulls/day, 10 parallel terminals, weekend-aware)');
  }

  /**
   * Main pull cycle — processes 3000 accounts across 10 parallel terminals
   */
  async runPullCycle() {
    if (this.isRunning) {
      console.log('⚠️ VPS Pull: Already running, skipping');
      return;
    }
    this.isRunning = true;
    const startTime = Date.now();

    try {
      const challenges = await tradingChallengeService.getActiveChallenges();
      const activeChallenge = challenges.find(c => c.status === 'active');
      
      // Also check for recently-ended WinnerPip challenges that need a final Saturday pull
      let challengeToPull = activeChallenge;
      if (!challengeToPull) {
        // Check if there's a WinnerPip challenge in 'reviewing' status that ended within last 48h
        const allChallenges = await tradingChallengeService.getAllChallenges();
        const recentlyEnded = allChallenges.find(c => 
          c.status === 'reviewing' && 
          (c.evaluation_type || 'winnerpip') === 'winnerpip' &&
          !c.winners_posted_at &&
          (Date.now() - new Date(c.end_date).getTime()) < 48 * 60 * 60 * 1000
        );
        if (recentlyEnded) {
          challengeToPull = recentlyEnded;
          console.log(`📊 VPS Pull: Final sync pull for recently-ended challenge "${recentlyEnded.title}"`);
        }
      }

      if (!challengeToPull) {
        console.log('📊 VPS Pull: No active or recently-ended challenge');
        this.isRunning = false;
        return;
      }

      // === WEEKEND LOGIC ===
      const now = new Date();
      const eatTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      const dayOfWeek = eatTime.getUTCDay(); // 0=Sun, 6=Sat
      const hourEAT = eatTime.getUTCHours();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (isWeekend) {
        const weekendAllowed = await this.isWeekendTradingAllowed(challengeToPull.id);

        if (!weekendAllowed) {
          // Saturday first pull (06:00 EAT = UTC hour 3) — always run as sync check
          const isSaturdayFirstPull = dayOfWeek === 6 && hourEAT === 6;

          if (isSaturdayFirstPull) {
            console.log('📊 VPS Pull: Saturday sync check — capturing Friday close data');
            // Fall through to normal pull logic below
          } else {
            console.log(`📊 VPS Pull: Weekend skip (${dayOfWeek === 6 ? 'Sat' : 'Sun'} ${hourEAT}:00 EAT) — forex market closed`);
            this.isRunning = false;
            return;
          }
        } else {
          console.log('📊 VPS Pull: Weekend trading allowed — running normal pull');
        }
      }

      const accounts = await this.getAccountsToPull(challengeToPull.id);
      if (accounts.length === 0) {
        console.log('📊 VPS Pull: No accounts to pull');
        this.isRunning = false;
        return;
      }

      console.log(`📊 VPS Pull: Starting — ${accounts.length} accounts, ${this.getHealthyTerminalCount()} healthy terminals`);

      // Create batch record
      const batchId = await this.createPullBatch(challengeToPull.id, accounts.length);

      // Distribute accounts across HEALTHY terminals only
      const healthyTerminals = this.terminals.filter(t => t.isHealthy);
      if (healthyTerminals.length === 0) {
        console.error('❌ VPS Pull: ALL terminals unhealthy! Aborting cycle.');
        await this.completePullBatch(batchId, 0, accounts.length, 0, 'all_terminals_unhealthy');
        await this.reportCriticalFailure(challengeToPull, 'All 10 terminals are unhealthy. Pull cycle aborted.');
        this.isRunning = false;
        return;
      }

      const terminalBuckets = this.distributeToTerminals(accounts, healthyTerminals);

      // Process all terminals IN PARALLEL
      const terminalPromises = terminalBuckets.map(({ terminal, accounts: termAccounts }) =>
        this.processTerminalBatch(terminal, termAccounts, challengeToPull, batchId)
      );

      const allResults = (await Promise.all(terminalPromises)).flat();

      // Collect accounts that failed due to terminal issues (not credentials)
      const terminalFailures = allResults.filter(r => !r.success && r.errorCode === 'terminal_unhealthy');
      
      // Redistribute terminal failures to remaining healthy terminals
      if (terminalFailures.length > 0) {
        const stillHealthy = this.terminals.filter(t => t.isHealthy);
        if (stillHealthy.length > 0) {
          const retryAccounts = terminalFailures.map(f => accounts.find(a => a.registrationId === f.registrationId)!).filter(Boolean);
          console.log(`🔄 VPS Pull: Redistributing ${retryAccounts.length} accounts to ${stillHealthy.length} healthy terminals`);
          const retryBuckets = this.distributeToTerminals(retryAccounts, stillHealthy);
          const retryPromises = retryBuckets.map(({ terminal, accounts: ta }) =>
            this.processTerminalBatch(terminal, ta, challengeToPull, batchId)
          );
          const retryResults = (await Promise.all(retryPromises)).flat();
          // Merge retry results (replace terminal_unhealthy entries)
          for (const rr of retryResults) {
            const idx = allResults.findIndex(r => r.registrationId === rr.registrationId && r.errorCode === 'terminal_unhealthy');
            if (idx >= 0) allResults[idx] = rr;
            else allResults.push(rr);
          }
        }
      }

      // Categorize final results
      const successful = allResults.filter(r => r.success);
      const credentialFailures = allResults.filter(r => !r.success && r.errorCode === 'invalid_credentials');
      const otherFailures = allResults.filter(r => !r.success && r.errorCode !== 'invalid_credentials');

      // Handle credential failures — notify users
      for (const failure of credentialFailures) {
        await this.handleCredentialFailure(failure, challengeToPull);
      }

      // Update registration pull statuses in bulk
      await this.bulkUpdatePullStatus(allResults);

      // Log errors
      for (const failure of [...credentialFailures, ...otherFailures]) {
        await this.logPullError(batchId, failure);
      }

      // Complete batch
      const newTrades = successful.reduce((sum, r) => sum + (r.tradesCount || 0), 0);
      await this.completePullBatch(batchId, successful.length, credentialFailures.length + otherFailures.length, newTrades, 'completed');

      const duration = Math.round((Date.now() - startTime) / 1000);
      const terminalSummary = this.terminals.map(t => `T${t.id}:${t.isHealthy ? '✓' : '✗'}`).join(' ');
      console.log(`✅ VPS Pull: Done in ${duration}s — ${successful.length}✓ ${credentialFailures.length}🔑 ${otherFailures.length}✗ | ${terminalSummary}`);

      // Run evaluation engine to update leaderboard
      if (successful.length > 0) {
        try {
          const evalResult = await evaluationEngine.evaluate(challengeToPull.id);
          console.log(`📊 Evaluation: ${evalResult.evaluated} accounts, ${evalResult.flagged} flags, ${evalResult.qualified} qualified`);
        } catch (evalError) {
          console.error('❌ Evaluation engine error:', evalError);
        }
      }

      // Report to admin for credential failures OR high failure rate
      const totalAttempts = successful.length + credentialFailures.length + otherFailures.length;
      const failureRate = totalAttempts > 0 ? ((credentialFailures.length + otherFailures.length) / totalAttempts) * 100 : 0;

      if (credentialFailures.length > 0 || failureRate > 30) {
        await this.reportToAdmin(challengeToPull, successful.length, credentialFailures, otherFailures, duration);
      }

      // Critical alert if failure rate exceeds 50%
      if (failureRate > 50 && totalAttempts > 10) {
        try {
          await this.bot.bot.telegram.sendMessage(config.adminUserId,
            `🚨 <b>HIGH FAILURE RATE WARNING</b>\n\n` +
            `<b>${challengeToPull.title}</b>\n\n` +
            `⚠️ <b>${failureRate.toFixed(0)}% of pulls failed</b> this cycle.\n` +
            `✅ Success: ${successful.length}\n` +
            `🔑 Credential: ${credentialFailures.length}\n` +
            `❌ Other: ${otherFailures.length}\n\n` +
            `Healthy terminals: ${this.getHealthyTerminalCount()}/10\n\n` +
            `<i>If this persists, consider switching to Legacy evaluation mode via /evaluationtype</i>`,
            { parse_mode: 'HTML' });
        } catch (e) {}
      }

    } catch (error) {
      console.error('❌ VPS Pull: Cycle crashed:', error);
      try {
        await this.bot.bot.telegram.sendMessage(config.adminUserId,
          `❌ <b>VPS Pull Cycle Crashed</b>\n\n<code>${(error as Error).message}</code>`,
          { parse_mode: 'HTML' });
      } catch (e) {}
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check if weekend trading is allowed for this challenge.
   * Reads from the 'config' rule in wp_challenge_rules (same as evaluation engine).
   * If no rule exists, defaults to false (no weekend trading).
   */
  private async isWeekendTradingAllowed(challengeId: number): Promise<boolean> {
    try {
      const result = await db.query(
        `SELECT parameters FROM wp_challenge_rules WHERE challenge_id = $1 AND rule_code = 'config'`,
        [challengeId]
      );
      if (result.rows.length > 0) {
        const params = result.rows[0].parameters;
        return params?.weekend_trading === true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Process a batch of accounts on a single terminal (sequential within terminal)
   */
  private async processTerminalBatch(
    terminal: TerminalState,
    accounts: AccountToPull[],
    challenge: TradingChallenge,
    batchId: number
  ): Promise<PullResult[]> {
    const results: PullResult[] = [];

    for (const account of accounts) {
      // If terminal became unhealthy mid-batch, return remaining as terminal_unhealthy
      if (!terminal.isHealthy) {
        results.push({
          registrationId: account.registrationId,
          accountNumber: account.accountNumber,
          telegramId: account.telegramId,
          username: account.username,
          success: false,
          errorCode: 'terminal_unhealthy',
          errorMessage: `Terminal ${terminal.id} is unhealthy`,
        });
        continue;
      }

      const result = await this.pullSingleAccount(account, terminal.id);
      results.push(result);
      terminal.totalProcessed++;

      if (result.success) {
        terminal.totalSuccess++;
        terminal.consecutiveFailures = 0;

        // Save trades/deals
        if (result.tradesCount && result.tradesCount > 0) {
          // Trades are saved inside pullSingleAccount
        }
      } else {
        terminal.totalFailed++;
        // Only count non-credential failures toward terminal health
        if (result.errorCode !== 'invalid_credentials') {
          terminal.consecutiveFailures++;
          if (terminal.consecutiveFailures >= TERMINAL_FAILURE_THRESHOLD) {
            terminal.isHealthy = false;
            terminal.unhealthySince = new Date();
            console.log(`⚠️ Terminal ${terminal.id} marked UNHEALTHY (${terminal.consecutiveFailures} consecutive failures)`);
          }
        }
      }

      // Throttle between accounts
      await this.delay(BATCH_DELAY_MS);
    }

    return results;
  }

  /**
   * Pull a single account with retry
   */
  private async pullSingleAccount(account: AccountToPull, terminalId: number): Promise<PullResult> {
    let credentialFailCount = 0;

    for (let attempt = 1; attempt <= MAX_RETRIES_PER_ACCOUNT; attempt++) {
      try {
        const response = await axios.post(
          `${this.baseUrl}/api/v1/pull`,
          {
            login: parseInt(account.accountNumber),
            server: account.server,
            password: account.investorPassword,
            terminal_id: terminalId,
          },
          {
            headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
            timeout: ACCOUNT_TIMEOUT_MS,
          }
        );

        const data = response.data;

        if (data.success) {
          // Save trades and deals
          const tradesCount = data.trades?.length || 0;
          const dealsCount = data.deals?.length || 0;
          if (tradesCount > 0) await this.saveTrades(account, data.trades);
          if (dealsCount > 0) await this.saveDeals(account, data.deals);

          return {
            registrationId: account.registrationId,
            accountNumber: account.accountNumber,
            telegramId: account.telegramId,
            username: account.username,
            success: true,
            tradesCount,
            dealsCount,
            balance: data.balance,
            equity: data.equity,
          };
        }

        // Check if credential failure
        const err = (data.error_code || data.error || data.message || '').toLowerCase();
        if (err.includes('invalid') || err.includes('auth') || err.includes('password') || err.includes('credential')) {
          credentialFailCount++;
          // Try credential failures CREDENTIAL_CONFIRM_ATTEMPTS times to be sure
          if (credentialFailCount < CREDENTIAL_CONFIRM_ATTEMPTS) {
            await this.delay(RETRY_DELAY_MS);
            continue;
          }
          return {
            registrationId: account.registrationId,
            accountNumber: account.accountNumber,
            telegramId: account.telegramId,
            username: account.username,
            success: false,
            errorCode: 'invalid_credentials',
            errorMessage: data.message || 'Invalid credentials',
          };
        }

        // Other API error — retry
        if (attempt < MAX_RETRIES_PER_ACCOUNT) {
          await this.delay(RETRY_DELAY_MS * attempt);
          continue;
        }

        return {
          registrationId: account.registrationId,
          accountNumber: account.accountNumber,
          telegramId: account.telegramId,
          username: account.username,
          success: false,
          errorCode: 'api_error',
          errorMessage: data.message || 'API returned failure',
        };

      } catch (error: any) {
        // HTTP 401/422 = credential issue
        if (error.response?.status === 401 || error.response?.status === 422) {
          credentialFailCount++;
          if (credentialFailCount < CREDENTIAL_CONFIRM_ATTEMPTS) {
            await this.delay(RETRY_DELAY_MS);
            continue;
          }
          return {
            registrationId: account.registrationId,
            accountNumber: account.accountNumber,
            telegramId: account.telegramId,
            username: account.username,
            success: false,
            errorCode: 'invalid_credentials',
            errorMessage: error.response?.data?.message || 'Authentication failed',
          };
        }

        // Network/timeout — retry
        if (attempt < MAX_RETRIES_PER_ACCOUNT) {
          await this.delay(RETRY_DELAY_MS * attempt);
          continue;
        }

        return {
          registrationId: account.registrationId,
          accountNumber: account.accountNumber,
          telegramId: account.telegramId,
          username: account.username,
          success: false,
          errorCode: error.code === 'ECONNABORTED' ? 'timeout' : 'network_error',
          errorMessage: error.message || 'Connection failed',
        };
      }
    }

    return {
      registrationId: account.registrationId,
      accountNumber: account.accountNumber,
      telegramId: account.telegramId,
      username: account.username,
      success: false,
      errorCode: 'max_retries',
      errorMessage: 'Exhausted retries',
    };
  }

  /**
   * Recheck unhealthy terminals after 10 min cooldown
   */
  private async recheckUnhealthyTerminals() {
    const unhealthy = this.terminals.filter(t => !t.isHealthy && t.unhealthySince);
    if (unhealthy.length === 0) return;

    for (const terminal of unhealthy) {
      const elapsed = Date.now() - (terminal.unhealthySince?.getTime() || 0);
      if (elapsed < TERMINAL_HEALTH_RECHECK_MS) continue; // Not yet time to recheck

      console.log(`🔍 VPS Pull: Health-checking terminal ${terminal.id}...`);

      // Try a simple health check via the API
      const healthy = await this.checkTerminalHealth(terminal.id);

      if (healthy) {
        terminal.isHealthy = true;
        terminal.consecutiveFailures = 0;
        terminal.unhealthySince = null;
        console.log(`✅ Terminal ${terminal.id} recovered — marked healthy`);
      } else {
        // Still unhealthy — report to admin (only once per terminal)
        console.log(`❌ Terminal ${terminal.id} still unhealthy after recheck`);
        try {
          await this.bot.bot.telegram.sendMessage(config.adminUserId,
            `⚠️ <b>VPS Terminal ${terminal.id} Unhealthy</b>\n\n` +
            `Terminal has been down since ${terminal.unhealthySince?.toISOString()}\n` +
            `Failed health-check after 10-min cooldown.\n\n` +
            `<b>Action needed:</b> Check VPS server status.\n` +
            `Remaining healthy terminals: ${this.getHealthyTerminalCount()}/10`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {}
        // Reset timer so we don't spam admin — next check in another 10 min
        terminal.unhealthySince = new Date();
      }
    }
  }

  /**
   * Check if a terminal is responsive
   */
  private async checkTerminalHealth(terminalId: number): Promise<boolean> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/v1/health`,
        { terminal_id: terminalId },
        {
          headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
          timeout: 10000,
        }
      );
      return response.status === 200 && (response.data?.healthy !== false);
    } catch {
      return false;
    }
  }

  private getHealthyTerminalCount(): number {
    return this.terminals.filter(t => t.isHealthy).length;
  }

  // ==================== DATA HELPERS ====================

  private async getAccountsToPull(challengeId: number): Promise<AccountToPull[]> {
    const result = await db.query(
      `SELECT id, account_number, mt5_server, investor_password, telegram_id, username, nickname
       FROM trading_registrations
       WHERE challenge_id = $1
         AND disqualified = false
         AND investor_password IS NOT NULL
         AND connection_verified = true
       ORDER BY id`,
      [challengeId]
    );
    return result.rows.map((r: any) => ({
      registrationId: r.id,
      accountNumber: r.account_number,
      server: r.mt5_server,
      investorPassword: r.investor_password,
      telegramId: r.telegram_id,
      username: r.username,
      nickname: r.nickname,
    }));
  }

  private distributeToTerminals(accounts: AccountToPull[], healthyTerminals: TerminalState[]): { terminal: TerminalState; accounts: AccountToPull[] }[] {
    const buckets: Map<number, AccountToPull[]> = new Map();
    healthyTerminals.forEach(t => buckets.set(t.id, []));

    // Round-robin across healthy terminals
    accounts.forEach((account, idx) => {
      const terminal = healthyTerminals[idx % healthyTerminals.length];
      buckets.get(terminal.id)!.push(account);
    });

    return healthyTerminals.map(t => ({ terminal: t, accounts: buckets.get(t.id)! })).filter(b => b.accounts.length > 0);
  }

  // ==================== TRADE/DEAL PERSISTENCE ====================

  private async saveTrades(account: AccountToPull, trades: any[]) {
    // Batch insert for efficiency with 3000 participants
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIdx = 1;

    for (const trade of trades) {
      placeholders.push(`($${paramIdx}, $${paramIdx+1}, $${paramIdx+2}, $${paramIdx+3}, $${paramIdx+4}, $${paramIdx+5}, $${paramIdx+6}, $${paramIdx+7}, $${paramIdx+8}, $${paramIdx+9}, $${paramIdx+10}, $${paramIdx+11}, $${paramIdx+12}, $${paramIdx+13}, $${paramIdx+14}, $${paramIdx+15}, $${paramIdx+16})`);
      values.push(
        account.registrationId, // We'll get challenge_id from a join or pass it
        account.accountNumber,
        trade.ticket,
        trade.symbol || null,
        trade.type || null,
        trade.volume || 0,
        trade.open_time || null,
        trade.close_time || null,
        trade.open_price || 0,
        trade.close_price || 0,
        trade.stop_loss || null,
        trade.take_profit || null,
        trade.profit || 0,
        trade.commission || 0,
        trade.swap || 0,
        trade.comment || null,
        account.registrationId, // registration_id for the join
      );
      paramIdx += 17;

      // Batch in groups of 50 to avoid query size limits
      if (placeholders.length >= 50) {
        await this.flushTrades(placeholders.splice(0), values.splice(0));
      }
    }

    if (placeholders.length > 0) {
      await this.flushTrades(placeholders, values);
    }
  }

  private async flushTrades(placeholders: string[], values: any[]) {
    // Simplified: insert one by one with upsert (safer for varied data)
    // For 3000 users with ~10-50 trades each, individual upserts are fine
    // The batch approach above collects them but we execute individually for safety
    const batchSize = placeholders.length;
    const paramsPerRow = 17;

    for (let i = 0; i < batchSize; i++) {
      const offset = i * paramsPerRow;
      const regId = values[offset]; // registration_id
      const accountNumber = values[offset + 1];
      const ticket = values[offset + 2];

      try {
        // Get challenge_id from registration
        await db.query(
          `INSERT INTO wp_trades
           (challenge_id, registration_id, account_number, ticket, symbol, trade_type, volume,
            open_time, close_time, open_price, close_price, stop_loss, take_profit,
            profit, commission, swap, comment)
           SELECT r.challenge_id, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
           FROM trading_registrations r WHERE r.id = $1
           ON CONFLICT (challenge_id, account_number, ticket) DO UPDATE SET
             profit = EXCLUDED.profit,
             close_time = EXCLUDED.close_time,
             close_price = EXCLUDED.close_price,
             commission = EXCLUDED.commission,
             swap = EXCLUDED.swap,
             synced_at = NOW()`,
          [
            regId, accountNumber, ticket,
            values[offset + 3], values[offset + 4], values[offset + 5],
            values[offset + 6], values[offset + 7], values[offset + 8],
            values[offset + 9], values[offset + 10], values[offset + 11],
            values[offset + 12], values[offset + 13], values[offset + 14],
            values[offset + 15],
          ]
        );
      } catch (e) {
        // Skip individual trade errors silently
      }
    }
  }

  private async saveDeals(account: AccountToPull, deals: any[]) {
    for (const deal of deals) {
      try {
        await db.query(
          `INSERT INTO wp_deals
           (challenge_id, registration_id, account_number, ticket, deal_type, symbol,
            direction, volume, price, profit, balance, comment, time)
           SELECT r.challenge_id, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
           FROM trading_registrations r WHERE r.id = $1
           ON CONFLICT (challenge_id, account_number, ticket) DO NOTHING`,
          [
            account.registrationId, account.accountNumber,
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
    // Check if already warned
    const reg = await db.query('SELECT pull_status FROM trading_registrations WHERE id = $1', [failure.registrationId]);
    if (reg.rows[0]?.pull_status === 'password_changed') return; // Already warned

    // Mark as password changed
    await db.query(
      `UPDATE trading_registrations SET pull_status = 'password_changed', pull_error = $1, last_pull_at = NOW() WHERE id = $2`,
      [`Detected at ${new Date().toISOString()}`, failure.registrationId]
    );

    // Notify user
    const botInfo = await this.bot.bot.telegram.getMe();
    try {
      await this.bot.bot.telegram.sendMessage(
        failure.telegramId,
        `⚠️ <b>Account Access Issue — ${challenge.title}</b>\n\n` +
        `We could not access your MT5 account <b>${failure.accountNumber}</b>.\n\n` +
        `It appears your <b>investor password has been changed</b>.\n\n` +
        `🔑 Please update your investor password using the button below.\n\n` +
        `⏰ <b>You have 48 hours to update.</b>\nAfter 48 hours without a response, your registration will be disqualified.\n\n` +
        `<i>If you did not change your password, contact @birrFXadmin immediately.</i>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.url('🔑 Update Investor Password', `https://t.me/${botInfo.username}?start=tc_update_password_${failure.registrationId}`)],
          ]),
        }
      );
    } catch (e) {
      console.error(`Could not notify user ${failure.telegramId}:`, e);
    }
  }

  // ==================== DISQUALIFICATION CHECK ====================

  private async checkDisqualifications() {
    try {
      const challenges = await tradingChallengeService.getActiveChallenges();
      const activeChallenge = challenges.find(c => c.status === 'active');
      if (!activeChallenge) return;

      const result = await db.query(
        `SELECT id, telegram_id, username, account_number
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
          await this.bot.bot.telegram.sendMessage(reg.telegram_id,
            `🚫 <b>Registration Disqualified — ${activeChallenge.title}</b>\n\n` +
            `Account <b>${reg.account_number}</b> has been disqualified.\n\n` +
            `📛 <b>Reason:</b> Investor password was changed and not updated within 48 hours.\n\n` +
            `<i>Contact @birrFXadmin if you believe this is an error.</i>`,
            { parse_mode: 'HTML' });
        } catch (e) {}

        try {
          await this.bot.bot.telegram.sendMessage(config.adminUserId,
            `🚫 Auto-DQ: @${reg.username || 'unknown'} (${reg.account_number}) — password not updated in 48h`,
            { parse_mode: 'HTML' });
        } catch (e) {}

        console.log(`🚫 VPS Pull: Auto-DQ @${reg.username || reg.telegram_id} — password unchanged 48h`);
      }
    } catch (error) {
      console.error('Error in checkDisqualifications:', error);
    }
  }

  // ==================== BULK STATUS UPDATE ====================

  private async bulkUpdatePullStatus(results: PullResult[]) {
    // Batch updates for efficiency
    const successIds = results.filter(r => r.success).map(r => r.registrationId);
    const failedResults = results.filter(r => !r.success && r.errorCode !== 'invalid_credentials');

    if (successIds.length > 0) {
      // Bulk update successful pulls
      await db.query(
        `UPDATE trading_registrations SET last_pull_at = NOW(), pull_status = 'success', pull_error = NULL WHERE id = ANY($1)`,
        [successIds]
      );
    }

    // Update failed ones individually (different error messages)
    for (const f of failedResults) {
      await db.query(
        `UPDATE trading_registrations SET last_pull_at = NOW(), pull_status = $1, pull_error = $2 WHERE id = $3`,
        [f.errorCode || 'failed', f.errorMessage || 'Unknown', f.registrationId]
      );
    }
  }

  // ==================== DB RECORDS ====================

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

  private async reportToAdmin(challenge: TradingChallenge, successCount: number, credentialFailures: PullResult[], otherFailures: PullResult[], durationSec: number) {
    const totalAttempts = successCount + credentialFailures.length + otherFailures.length;
    const failureRate = totalAttempts > 0 ? ((credentialFailures.length + otherFailures.length) / totalAttempts * 100).toFixed(1) : '0';

    let text = `📊 <b>VPS Pull Report</b>\n<b>${challenge.title}</b>\n\n`;
    text += `⏱️ ${durationSec}s | Terminals: ${this.getHealthyTerminalCount()}/10 healthy\n`;
    text += `✅ ${successCount} | 🔑 ${credentialFailures.length} | ❌ ${otherFailures.length} | 📉 ${failureRate}% fail rate\n\n`;

    if (credentialFailures.length > 0) {
      text += `<b>🔑 Password Changed (users notified):</b>\n`;
      credentialFailures.slice(0, 15).forEach(f => { text += `• @${f.username || 'unknown'} — ${f.accountNumber}\n`; });
      if (credentialFailures.length > 15) text += `<i>+${credentialFailures.length - 15} more</i>\n`;
      text += '\n';
    }

    if (otherFailures.length > 0) {
      text += `<b>❌ Other Failures:</b>\n`;
      // Group by error code
      const grouped = new Map<string, number>();
      otherFailures.forEach(f => {
        const code = f.errorCode || 'unknown';
        grouped.set(code, (grouped.get(code) || 0) + 1);
      });
      grouped.forEach((count, code) => { text += `• ${code}: ${count}\n`; });
      text += '\n';
    }

    if (text.length > 4000) text = text.substring(0, 4000) + '\n<i>...truncated</i>';

    try {
      await this.bot.bot.telegram.sendMessage(config.adminUserId, text, { parse_mode: 'HTML' });
    } catch (e) {}
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
