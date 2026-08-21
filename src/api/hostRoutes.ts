/**
 * Host Dashboard API Routes
 * These mirror admin endpoints but are scoped to the host's own challenges.
 * Uses hostAuthMiddleware for auth + ownership verification on every request.
 */
import { Router, Request, Response } from 'express';
import { db } from '../database/db';

const router = Router();

// Ownership verification helper
async function verifyOwnership(req: any, res: Response): Promise<number | null> {
  const challengeId = parseInt(req.params.id);
  if (!challengeId || isNaN(challengeId)) { res.status(400).json({ error: 'Invalid challenge ID' }); return null; }
  const check = await db.query(`SELECT 1 FROM trading_challenges WHERE id = $1 AND host_id = $2`, [challengeId, req.hostAccount.hostId]);
  if (!check.rows[0]) { res.status(404).json({ error: 'Challenge not found' }); return null; }
  return challengeId;
}

// ==================== OVERVIEW ====================
router.get('/challenge/:id/full-overview', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const challenge = await db.query(`SELECT * FROM trading_challenges WHERE id = $1`, [challengeId]);
    const c = challenge.rows[0];

    const participants = await db.query(
      `SELECT COUNT(*) as total,
              COUNT(CASE WHEN account_type='demo' THEN 1 END) as demo,
              COUNT(CASE WHEN account_type='real' THEN 1 END) as real,
              COUNT(CASE WHEN disqualified=true THEN 1 END) as disqualified
       FROM trading_registrations WHERE challenge_id=$1 AND (status IS NULL OR status != 'removed')`, [challengeId]);

    // Trade stats — only count trades within challenge period (matching admin)
    const cStart = c.start_date;
    const cEnd = c.end_date;
    let tradeFilter = '';
    const tradeParams: any[] = [challengeId];
    if (cStart) {
      const graceStart = new Date(new Date(cStart).getTime() - 3 * 60 * 60 * 1000);
      tradeFilter += ` AND t.close_time >= $2`;
      tradeParams.push(graceStart.toISOString());
    }
    if (cEnd) {
      tradeFilter += ` AND t.close_time <= $${tradeParams.length + 1}`;
      tradeParams.push(new Date(cEnd).toISOString());
    }
    const trades = await db.query(
      `SELECT
        COUNT(*) as total,
        COALESCE(SUM(t.volume),0) as total_volume,
        COUNT(CASE WHEN t.is_qualified=false THEN 1 END) as flagged,
        COUNT(CASE WHEN r.account_type='demo' THEN 1 END) as demo_trades,
        COUNT(CASE WHEN r.account_type='real' THEN 1 END) as real_trades,
        COALESCE(SUM(CASE WHEN r.account_type='demo' THEN CASE WHEN r.is_cent THEN t.volume/100.0 ELSE t.volume END END),0) as demo_volume,
        COALESCE(SUM(CASE WHEN r.account_type='real' THEN CASE WHEN r.is_cent THEN t.volume/100.0 ELSE t.volume END END),0) as real_volume
       FROM wp_trades t
       JOIN trading_registrations r ON t.registration_id = r.id
       WHERE t.challenge_id=$1${tradeFilter}`, tradeParams);

    // Above target — cent-aware comparison (matching admin)
    const aboveTarget = await db.query(
      `SELECT COUNT(*) as cnt
       FROM wp_leaderboard l
       JOIN trading_challenges tc ON tc.id = l.challenge_id
       JOIN trading_registrations r ON r.id = l.registration_id
       WHERE l.challenge_id=$1
         AND (r.disqualified IS NULL OR r.disqualified = false)
         AND (r.status IS NULL OR r.status != 'removed')
         AND CASE WHEN COALESCE(r.is_cent, false)
               THEN l.adjusted_balance >= tc.target_balance * 100
               ELSE l.adjusted_balance >= tc.target_balance
             END`, [challengeId]);

    const pwChanged = await db.query(
      `SELECT COUNT(*) as cnt FROM trading_registrations WHERE challenge_id=$1 AND pull_status='password_changed'`, [challengeId]);

    const lastPull = await db.query(
      `SELECT started_at, completed_at, successful, failed, total_accounts, status FROM wp_pull_batches WHERE challenge_id=$1 ORDER BY started_at DESC LIMIT 1`, [challengeId]);

    // Pull stats — last 24 hours (matching admin)
    const pullsToday = await db.query(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(successful),0) as total_success, COALESCE(SUM(failed),0) as total_failed
       FROM wp_pull_batches WHERE challenge_id=$1 AND started_at > NOW() - INTERVAL '24 hours'`, [challengeId]);

    // Top violations (violations is stored as JSON string, not pg array)
    const topViolations = await db.query(
      `SELECT rule, COUNT(*) as cnt FROM (
         SELECT trim(unnest(string_to_array(
           regexp_replace(violations::text, '\\[|\\]|"', '', 'g'), ','
         ))) as rule
         FROM wp_trades WHERE challenge_id=$1 AND is_qualified=false AND violations IS NOT NULL AND violations != '[]'
       ) sub WHERE length(rule) > 2
       GROUP BY rule ORDER BY cnt DESC LIMIT 8`, [challengeId]);

    const totalParticipants = parseInt(participants.rows[0]?.total || '0');
    const totalTrades = parseInt(trades.rows[0]?.total || '0');
    const totalViolations = parseInt(trades.rows[0]?.flagged || '0');

    // Check if challenge rules have only_cent_account enabled
    const centCheck = await db.query(
      `SELECT parameters->>'only_cent_account' as only_cent FROM wp_challenge_rules WHERE challenge_id=$1 AND rule_code='config'`, [challengeId]);
    const onlyCentAccount = centCheck.rows[0]?.only_cent === 'true';

    // Basic metrics (matching admin overview Trading Insights — full version)
    const challengeType = c.type || 'hybrid';
    const metrics: any = { challengeType };

    const buildMetricsForCategory = async (category: string | null) => {
      const catJoin = category ? ` AND r.account_type = '${category}'` : '';
      const catWhere = category ? ` AND t.registration_id IN (SELECT id FROM trading_registrations WHERE challenge_id = ${challengeId} AND account_type = '${category}')` : '';

      const maxProfit = await db.query(
        `SELECT t.profit, t.symbol, r.nickname, r.is_cent
         FROM wp_trades t JOIN trading_registrations r ON t.registration_id = r.id
         WHERE t.challenge_id = $1 AND t.is_qualified = true${catWhere}
         ORDER BY t.profit DESC LIMIT 1`, [challengeId]);

      const maxLoss = await db.query(
        `SELECT t.profit, t.symbol, r.nickname, r.is_cent
         FROM wp_trades t JOIN trading_registrations r ON t.registration_id = r.id
         WHERE t.challenge_id = $1${catWhere}
         ORDER BY t.profit ASC LIMIT 1`, [challengeId]);

      const bestQualWin = await db.query(
        `SELECT r.nickname,
                (SELECT COUNT(*) FROM wp_trades t2 WHERE t2.registration_id = l.registration_id AND t2.challenge_id = $1) as total_trades,
                CASE WHEN (SELECT COUNT(*) FROM wp_trades t2 WHERE t2.registration_id = l.registration_id AND t2.challenge_id = $1 AND t2.is_qualified = true) > 0 THEN
                  LEAST(100, ROUND(
                    (SELECT COUNT(*)::numeric FROM wp_trades t2 WHERE t2.registration_id = l.registration_id AND t2.challenge_id = $1 AND t2.is_qualified = true AND t2.profit > 0)
                    / NULLIF((SELECT COUNT(*) FROM wp_trades t2 WHERE t2.registration_id = l.registration_id AND t2.challenge_id = $1 AND t2.is_qualified = true), 0) * 100))
                ELSE 0 END as qualified_win_rate
         FROM wp_leaderboard l JOIN trading_registrations r ON l.registration_id = r.id
         WHERE l.challenge_id = $1 AND (r.disqualified IS NULL OR r.disqualified = false)${catJoin}
         AND (SELECT COUNT(*) FROM wp_trades t2 WHERE t2.registration_id = l.registration_id AND t2.challenge_id = $1) >= 5
         ORDER BY qualified_win_rate DESC, total_trades DESC LIMIT 1`, [challengeId]);

      const bestOverallWin = await db.query(
        `SELECT r.nickname,
                (SELECT COUNT(*) FROM wp_trades t2 WHERE t2.registration_id = l.registration_id AND t2.challenge_id = $1) as total_trades,
                CASE WHEN (SELECT COUNT(*) FROM wp_trades t2 WHERE t2.registration_id = l.registration_id AND t2.challenge_id = $1) >= 5 THEN
                  LEAST(100, ROUND(
                    (SELECT COUNT(*)::numeric FROM wp_trades t2 WHERE t2.registration_id = l.registration_id AND t2.challenge_id = $1 AND t2.profit > 0)
                    / NULLIF((SELECT COUNT(*) FROM wp_trades t2 WHERE t2.registration_id = l.registration_id AND t2.challenge_id = $1), 0) * 100))
                ELSE 0 END as overall_win_rate
         FROM wp_leaderboard l JOIN trading_registrations r ON l.registration_id = r.id
         WHERE l.challenge_id = $1 AND (r.disqualified IS NULL OR r.disqualified = false)${catJoin}
         AND (SELECT COUNT(*) FROM wp_trades t2 WHERE t2.registration_id = l.registration_id AND t2.challenge_id = $1) >= 5
         ORDER BY overall_win_rate DESC, total_trades DESC LIMIT 1`, [challengeId]);

      const mostPair = await db.query(
        `SELECT REGEXP_REPLACE(symbol, '[a-z]$', '') as symbol, COUNT(*) as trade_count, COALESCE(SUM(volume), 0) as total_lots
         FROM wp_trades t WHERE challenge_id = $1${catWhere}
         GROUP BY REGEXP_REPLACE(symbol, '[a-z]$', '') ORDER BY trade_count DESC LIMIT 1`, [challengeId]);

      const leastPair = await db.query(
        `SELECT REGEXP_REPLACE(symbol, '[a-z]$', '') as symbol, COUNT(*) as trade_count, COALESCE(SUM(volume), 0) as total_lots
         FROM wp_trades t WHERE challenge_id = $1${catWhere}
         GROUP BY REGEXP_REPLACE(symbol, '[a-z]$', '') ORDER BY trade_count ASC LIMIT 1`, [challengeId]);

      const blown = await db.query(
        `SELECT COUNT(*) as cnt FROM wp_leaderboard l
         JOIN trading_registrations r ON l.registration_id = r.id
         WHERE l.challenge_id = $1 AND (l.zero_balance_at IS NOT NULL OR (l.total_trades > 0 AND l.current_balance <= 0))${catJoin}`, [challengeId]);

      const disqualified = await db.query(
        `SELECT COUNT(*) as cnt FROM trading_registrations r
         WHERE r.challenge_id = $1 AND r.disqualified = true${catJoin}`, [challengeId]);

      const mostDay = await db.query(
        `SELECT DATE(close_time) as day, COUNT(*) as trade_count
         FROM wp_trades t WHERE challenge_id = $1${catWhere}
         GROUP BY DATE(close_time) ORDER BY trade_count DESC LIMIT 1`, [challengeId]);

      const leastDay = await db.query(
        `SELECT DATE(close_time) as day, COUNT(*) as trade_count
         FROM wp_trades t WHERE challenge_id = $1${catWhere}
         GROUP BY DATE(close_time) ORDER BY trade_count ASC LIMIT 1`, [challengeId]);

      const avgTrades = await db.query(
        `SELECT ROUND(AVG(total_trades), 1) as avg_trades FROM wp_leaderboard l
         JOIN trading_registrations r ON l.registration_id = r.id
         WHERE l.challenge_id = $1 AND l.total_trades > 0${catJoin}`, [challengeId]);

      const rkrQuery = await db.query(
        `SELECT r.nickname, l.qualified_trades, l.total_trades,
                ROUND((l.qualified_trades::numeric / NULLIF(l.total_trades, 0)) * 100) as rkr
         FROM wp_leaderboard l JOIN trading_registrations r ON l.registration_id = r.id
         WHERE l.challenge_id = $1 AND l.total_trades > 0 AND (r.disqualified IS NULL OR r.disqualified = false)${catJoin}
         ORDER BY rkr DESC, l.adjusted_balance DESC`, [challengeId]);

      let bestRuleKeeping: any = null;
      let worstRuleKeeping: any = null;
      if (rkrQuery.rows.length > 0) {
        const bestRkr = parseInt(rkrQuery.rows[0].rkr || '0');
        const bestTied = rkrQuery.rows.filter((r: any) => parseInt(r.rkr || '0') === bestRkr);
        bestRuleKeeping = { rkr: bestRkr, nickname: bestTied[0].nickname, tiedCount: bestTied.length };
        const sortedAsc = [...rkrQuery.rows].sort((a: any, b: any) => parseInt(a.rkr || '0') - parseInt(b.rkr || '0'));
        const worstRkr = parseInt(sortedAsc[0].rkr || '0');
        const worstTied = sortedAsc.filter((r: any) => parseInt(r.rkr || '0') === worstRkr);
        worstRuleKeeping = { rkr: worstRkr, nickname: worstTied[0].nickname, tiedCount: worstTied.length };
      }

      return {
        maxProfitTrade: maxProfit.rows[0] ? { profit: parseFloat(maxProfit.rows[0].profit), symbol: maxProfit.rows[0].symbol, nickname: maxProfit.rows[0].nickname, isCent: maxProfit.rows[0].is_cent || false } : null,
        maxLossTrade: maxLoss.rows[0] ? { profit: parseFloat(maxLoss.rows[0].profit), symbol: maxLoss.rows[0].symbol, nickname: maxLoss.rows[0].nickname, isCent: maxLoss.rows[0].is_cent || false } : null,
        bestQualifiedWinRate: bestQualWin.rows[0] ? { winRate: parseInt(bestQualWin.rows[0].qualified_win_rate || '0'), nickname: bestQualWin.rows[0].nickname, trades: parseInt(bestQualWin.rows[0].total_trades) } : null,
        bestOverallWinRate: bestOverallWin.rows[0] ? { winRate: parseInt(bestOverallWin.rows[0].overall_win_rate || '0'), nickname: bestOverallWin.rows[0].nickname, trades: parseInt(bestOverallWin.rows[0].total_trades) } : null,
        mostTradedPair: mostPair.rows[0] ? { symbol: mostPair.rows[0].symbol, tradeCount: parseInt(mostPair.rows[0].trade_count), totalLots: parseFloat(mostPair.rows[0].total_lots) } : null,
        leastTradedPair: leastPair.rows[0] ? { symbol: leastPair.rows[0].symbol, tradeCount: parseInt(leastPair.rows[0].trade_count), totalLots: parseFloat(leastPair.rows[0].total_lots) } : null,
        blownAccounts: parseInt(blown.rows[0]?.cnt || '0'),
        disqualifiedAccounts: parseInt(disqualified.rows[0]?.cnt || '0'),
        mostActiveDay: mostDay.rows[0] ? { day: mostDay.rows[0].day, tradeCount: parseInt(mostDay.rows[0].trade_count) } : null,
        leastActiveDay: leastDay.rows[0] ? { day: leastDay.rows[0].day, tradeCount: parseInt(leastDay.rows[0].trade_count) } : null,
        avgTradesPerUser: parseFloat(avgTrades.rows[0]?.avg_trades || '0'),
        bestRuleKeeping,
        worstRuleKeeping,
      };
    };

    if (challengeType === 'hybrid') {
      metrics.real = await buildMetricsForCategory('real');
      metrics.demo = await buildMetricsForCategory('demo');
    } else {
      metrics.combined = await buildMetricsForCategory(null);
    }

    // Balance totals — matching admin exactly (no leaderboard JOIN, only registrations)
    const balanceData = await db.query(
      `SELECT
        COALESCE(SUM(
          CASE WHEN r.is_cent
            THEN COALESCE(r.last_known_balance, r.registration_balance, 0) / 100
            ELSE COALESCE(r.last_known_balance, r.registration_balance, 0)
          END
        ), 0) as total_balance,
        COALESCE(SUM(
          CASE WHEN r.account_type = 'real' THEN
            CASE WHEN r.is_cent
              THEN COALESCE(r.last_known_balance, r.registration_balance, 0) / 100
              ELSE COALESCE(r.last_known_balance, r.registration_balance, 0)
            END
          ELSE 0 END
        ), 0) as real_balance,
        COALESCE(SUM(
          CASE WHEN r.account_type = 'demo'
            THEN COALESCE(r.last_known_balance, r.registration_balance, 0)
            ELSE 0 END
        ), 0) as demo_balance
       FROM trading_registrations r
       WHERE r.challenge_id = $1
         AND r.disqualified = false
         AND r.investor_password IS NOT NULL`, [challengeId]);

    return res.json({
      challenge: c,
      totalParticipants,
      demoParticipants: parseInt(participants.rows[0]?.demo || '0'),
      realParticipants: parseInt(participants.rows[0]?.real || '0'),
      disqualified: parseInt(participants.rows[0]?.disqualified || '0'),
      totalTrades,
      demoTrades: parseInt(trades.rows[0]?.demo_trades || '0'),
      realTrades: parseInt(trades.rows[0]?.real_trades || '0'),
      totalVolume: parseFloat(trades.rows[0]?.total_volume || '0').toFixed(2),
      demoVolume: parseFloat(trades.rows[0]?.demo_volume || '0').toFixed(2),
      realVolume: parseFloat(trades.rows[0]?.real_volume || '0').toFixed(2),
      totalViolations,
      violationRate: totalTrades > 0 ? ((totalViolations / totalTrades) * 100).toFixed(1) : '0',
      aboveTarget: parseInt(aboveTarget.rows[0]?.cnt || '0'),
      passwordChanged: parseInt(pwChanged.rows[0]?.cnt || '0'),
      pullsToday: parseInt(pullsToday.rows[0]?.cnt || '0'),
      pullsSuccess: parseInt(pullsToday.rows[0]?.total_success || '0'),
      pullsFailed: parseInt(pullsToday.rows[0]?.total_failed || '0'),
      lastPull: lastPull.rows[0] || null,
      topViolations: topViolations.rows.map((v: any) => ({ rule: v.rule, count: parseInt(v.cnt) })),
      realBalance: parseFloat(balanceData.rows[0]?.real_balance || '0'),
      demoBalance: parseFloat(balanceData.rows[0]?.demo_balance || '0'),
      totalBalance: parseFloat(balanceData.rows[0]?.total_balance || '0'),
      onlyCentAccount,
      metrics,
    });
  } catch (error) {
    console.error('Host full overview error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== PARTICIPANTS ====================
router.get('/challenge/:id/full-participants', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 100;
    const offset = (page - 1) * limit;

    const countResult = await db.query(`SELECT COUNT(*) as total FROM trading_registrations WHERE challenge_id=$1 AND (status IS NULL OR status != 'removed')`, [challengeId]);
    const total = parseInt(countResult.rows[0].total);

    const result = await db.query(
      `SELECT id, nickname, username, email, account_number, mt5_server, account_type, account_subtype,
              is_cent, disqualified, disqualified_reason, pull_status, pull_error,
              connection_verified, registered_at, last_pull_at, last_known_balance, registration_balance,
              actual_starting_balance, investor_password, source
       FROM trading_registrations
       WHERE challenge_id=$1 AND (status IS NULL OR status != 'removed')
       ORDER BY registered_at DESC
       LIMIT $2 OFFSET $3`, [challengeId, limit, offset]);

    return res.json({
      participants: result.rows.map((p: any) => ({
        id: p.id, nickname: p.nickname, username: p.username, email: p.email,
        accountNumber: p.account_number, server: p.mt5_server,
        accountType: p.account_type, accountSubtype: p.account_subtype,
        isCent: p.is_cent, disqualified: p.disqualified, disqualifiedReason: p.disqualified_reason,
        pullStatus: p.pull_status, pullError: p.pull_error,
        connectionVerified: p.connection_verified, registeredAt: p.registered_at,
        lastPullAt: p.last_pull_at, lastKnownBalance: p.last_known_balance,
        registrationBalance: p.registration_balance, actualStartingBalance: p.actual_starting_balance,
        investorPassword: p.investor_password, source: p.source,
      })),
      pagination: { page, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Host participants error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== VIOLATIONS ====================
router.get('/challenge/:id/violations', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const result = await db.query(
      `SELECT r.nickname, r.username, r.account_number, r.account_type,
              COUNT(t.id) as violation_count,
              COALESCE(SUM(CASE WHEN t.profit > 0 THEN t.profit ELSE 0 END), 0) as profit_removed,
              json_agg(json_build_object('ticket', t.ticket, 'symbol', t.symbol, 'violations', t.violations, 'profit', t.profit)) as flagged_trades
       FROM wp_trades t
       JOIN trading_registrations r ON t.registration_id = r.id
       WHERE t.challenge_id = $1 AND t.is_qualified = false
       GROUP BY r.id, r.nickname, r.username, r.account_number, r.account_type
       ORDER BY violation_count DESC
       LIMIT 50`, [challengeId]);
    return res.json({ violations: result.rows });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== FAILED ACCOUNTS (Updates tab) ====================
router.get('/challenge/:id/failed-accounts', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const { leaderboardService } = require('../services/leaderboardService');
    const allFailed = await leaderboardService.getFailedAccounts(challengeId);
    const credentialFailures = allFailed.filter((f: any) => f.pull_status === 'password_changed' || f.pull_status === 'invalid_credentials');
    const failed = allFailed.filter((f: any) => f.pull_status !== 'password_changed' && f.pull_status !== 'invalid_credentials' && !f.disqualified);

    const skipped = await db.query(
      `SELECT id, nickname, account_number, account_type, disqualified_reason, pull_status
       FROM trading_registrations WHERE challenge_id=$1 AND disqualified=true
       ORDER BY nickname ASC LIMIT 50`, [challengeId]);

    return res.json({ failed, credentialFailures, skipped: skipped.rows });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== FORCE UPDATE (Pull) ====================
router.post('/challenge/:id/force-update', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const globalScheduler = (global as any).__vpsPullScheduler;
    if (!globalScheduler) return res.status(503).json({ error: 'Update system not available' });
    globalScheduler.runPullCycleForChallenge(challengeId).catch(() => {});
    return res.json({ success: true, message: 'Full update started' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== FORCE UPDATE NON-DQ ====================
router.post('/challenge/:id/force-update-rank', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const challenge = await db.query(`SELECT status FROM trading_challenges WHERE id=$1`, [challengeId]);
    if (!['active', 'reviewing'].includes(challenge.rows[0]?.status)) {
      return res.status(400).json({ error: 'Challenge must be active or reviewing' });
    }
    await db.query(
      `UPDATE trading_registrations SET last_pull_at = NULL
       WHERE challenge_id = $1 AND disqualified = false
         AND investor_password IS NOT NULL AND connection_verified = true
         AND (pull_status IS NULL OR pull_status NOT IN ('password_changed'))`, [challengeId]);
    const globalScheduler = (global as any).__vpsPullScheduler;
    if (globalScheduler) globalScheduler.runPullCycleForChallenge(challengeId).catch(() => {});
    return res.json({ success: true, message: 'Update (non-disqualified) started' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== CHECK BALANCE (Verify Connection) ====================
router.post('/challenge/:id/check-balance', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const { registrationId } = req.body;
    if (!registrationId) return res.status(400).json({ error: 'registrationId required' });
    const reg = await db.query(`SELECT account_number, mt5_server, investor_password, is_cent FROM trading_registrations WHERE id = $1 AND challenge_id = $2`, [registrationId, challengeId]);
    if (!reg.rows[0]) return res.status(404).json({ error: 'Registration not found' });
    const { account_number, mt5_server, investor_password, is_cent } = reg.rows[0];
    const { vpsService } = require('../services/vpsService');
    const result = await vpsService.verifyConnection(account_number, mt5_server, investor_password);
    if (result.success) {
      // Persist balance to DB so it shows on refresh
      if (result.balance != null) {
        await db.query(
          `UPDATE trading_registrations SET last_known_balance = $1, pull_status = 'success', last_pull_at = NOW() WHERE id = $2`,
          [result.balance, registrationId]
        );
      }
      return res.json({ success: true, verified: true, balance: result.balance, equity: result.equity, isCent: is_cent });
    } else {
      // Mark credential failure if applicable
      if (result.status === 'invalid_credentials') {
        await db.query(`UPDATE trading_registrations SET pull_status = 'password_changed' WHERE id = $1`, [registrationId]);
      }
      return res.json({ success: true, verified: false, error: result.message || 'Connection failed', credential_fail: result.status === 'invalid_credentials' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== RE-EVALUATE USER ====================
router.post('/challenge/:id/re-evaluate-user', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const { registrationId } = req.body;
    if (!registrationId) return res.status(400).json({ error: 'registrationId required' });
    const reg = await db.query(`SELECT id FROM trading_registrations WHERE id=$1 AND challenge_id=$2`, [registrationId, challengeId]);
    if (!reg.rows[0]) return res.status(404).json({ error: 'Participant not found' });

    const { evaluationEngine } = require('../services/wpEvaluationEngine');
    await evaluationEngine.evaluateSingleAccount(challengeId, registrationId);
    const { leaderboardService } = require('../services/leaderboardService');
    await leaderboardService.flushStagingToLive(challengeId);
    await leaderboardService.updateRankings(challengeId);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== DISQUALIFY ====================
router.post('/challenge/:id/disqualify', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const { registrationId, reason } = req.body;
    if (!registrationId) return res.status(400).json({ error: 'registrationId required' });
    await db.query(
      `UPDATE trading_registrations SET disqualified=true, disqualified_reason=$1 WHERE id=$2 AND challenge_id=$3`,
      [reason || 'Disqualified by host', registrationId, challengeId]);
    await db.query(
      `UPDATE wp_leaderboard SET is_disqualified=true, disqualify_reason=$1 WHERE registration_id=$2 AND challenge_id=$3`,
      [reason || 'Disqualified by host', registrationId, challengeId]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== UNVERIFY (Remove) ====================
router.post('/challenge/:id/unverify', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const { registrationId } = req.body;
    if (!registrationId) return res.status(400).json({ error: 'registrationId required' });
    await db.query(`UPDATE trading_registrations SET status='removed' WHERE id=$1 AND challenge_id=$2`, [registrationId, challengeId]);
    await db.query(`DELETE FROM wp_leaderboard WHERE registration_id=$1 AND challenge_id=$2`, [registrationId, challengeId]);
    await db.query(`DELETE FROM wp_leaderboard_staging WHERE registration_id=$1 AND challenge_id=$2`, [registrationId, challengeId]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== STATUS CHANGE ====================
router.patch('/challenge/:id/direct-status', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const { status } = req.body;
    const allowed = ['registration_open', 'active', 'reviewing', 'completed'];
    if (!allowed.includes(status)) return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` });
    await db.query(`UPDATE trading_challenges SET status=$1, updated_at=NOW() WHERE id=$2`, [status, challengeId]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== CSV PROGRESS ====================
router.get('/challenge/:id/csv-progress/:uploadId', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const uploadId = parseInt(req.params.uploadId);
    const upload = await db.query(`SELECT status, total_rows, verified_count, failed_count FROM host_csv_uploads WHERE id = $1 AND challenge_id = $2`, [uploadId, challengeId]);
    if (!upload.rows[0]) return res.status(404).json({ error: 'Upload not found' });
    const u = upload.rows[0];
    // Count processed rows so far
    const processed = await db.query(`SELECT COUNT(*) as cnt FROM host_csv_rows WHERE upload_id = $1 AND status != 'pending'`, [uploadId]);
    const processedCount = parseInt(processed.rows[0].cnt);
    // If done, get row details
    let rowDetails: any[] = [];
    if (u.status === 'processed' || u.status === 'failed') {
      const rows = await db.query(`SELECT nickname, account_number, account_type, status, error_message FROM host_csv_rows WHERE upload_id = $1 ORDER BY id`, [uploadId]);
      rowDetails = rows.rows;
    }
    return res.json({
      status: u.status,
      total: u.total_rows,
      processed: processedCount,
      verified: u.verified_count || 0,
      failed: u.failed_count || 0,
      rowDetails,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== CANCEL PENDING CSV ====================
router.delete('/challenge/:id/csv-upload/:uploadId', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const uploadId = parseInt(req.params.uploadId);
    if (!uploadId || isNaN(uploadId)) return res.status(400).json({ error: 'Invalid upload ID' });
    // Only cancel if pending and belongs to this host+challenge
    const result = await db.query(
      `UPDATE host_csv_uploads SET status = 'cancelled' WHERE id = $1 AND challenge_id = $2 AND host_id = $3 AND status = 'pending' RETURNING id`,
      [uploadId, challengeId, req.hostAccount.hostId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'No pending upload found' });
    // Clean up rows
    await db.query(`DELETE FROM host_csv_rows WHERE upload_id = $1`, [uploadId]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== DELETE CHALLENGE ====================
router.delete('/challenge/:id', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const challenge = await db.query(`SELECT status, title FROM trading_challenges WHERE id=$1`, [challengeId]);
    const status = challenge.rows[0]?.status;

    // Draft challenges can be deleted directly by the host
    if (status === 'draft' || status === 'pending_approval' || status === 'rejected') {
      await db.query(`UPDATE trading_challenges SET status='deleted', updated_at=NOW() WHERE id=$1`, [challengeId]);
      return res.json({ success: true });
    }

    // Active/registration_open/reviewing/completed need admin approval
    try {
      const config = require('../../src/config').default || require('../../src/config');
      const { getTelegram } = require('../../src/bot/bot');
      const telegram = getTelegram();
      if (telegram) {
        const { Markup } = require('telegraf');
        const gatekeeper = require('../../src/services/challengeGatekeeper');
        const token = gatekeeper.queueStatusChange({
          challenge_id: challengeId,
          new_status: 'deleted',
          hostName: req.hostAccount?.displayName || 'Host',
        });
        await telegram.sendMessage(
          config.adminUserId,
          `🗑️ <b>Host Deletion Request</b>\n\n<b>Host:</b> ${req.hostAccount?.displayName || 'Unknown'}\n<b>Challenge:</b> ${challenge.rows[0]?.title || challengeId}\n<b>Current Status:</b> ${status}\n\n⚠️ This challenge has participants/activity. Approve deletion?`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Delete', `gate_approve_${token}`)],
              [Markup.button.callback('❌ Keep', `gate_reject_${token}`)],
            ]),
          }
        );
      }
    } catch (_e) { /* silent */ }

    return res.json({ success: true, pending: true, message: 'Deletion request sent to admin for approval.' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== EXPORT REGISTRATIONS (limited fields) ====================
router.get('/challenge/:id/export-registrations', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const result = await db.query(
      `SELECT nickname, email, account_type, account_number, mt5_server, investor_password
       FROM trading_registrations WHERE challenge_id=$1 AND (status IS NULL OR status != 'removed')
       ORDER BY registered_at ASC`, [challengeId]);
    return res.json({ registrations: result.rows });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== EXPORT USER TRADES (MT5 report) ====================
router.get('/challenge/:id/export-user-trades', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const registrationId = parseInt(req.query.registration_id as string);
    if (!registrationId) return res.status(400).json({ error: 'registration_id required' });

    const reg = await db.query(`SELECT id, nickname, account_number FROM trading_registrations WHERE id=$1 AND challenge_id=$2`, [registrationId, challengeId]);
    if (!reg.rows[0]) return res.status(404).json({ error: 'Participant not found' });

    const trades = await db.query(
      `SELECT ticket, symbol, trade_type, volume, open_time, close_time, open_price, close_price,
              stop_loss, take_profit, profit, commission, swap, is_qualified, violations, position_id
       FROM wp_trades WHERE challenge_id=$1 AND registration_id=$2 ORDER BY close_time ASC`, [challengeId, registrationId]);

    return res.json({ participant: reg.rows[0], trades: trades.rows });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== RETRY CREDENTIAL FAILURES ====================
router.post('/challenge/:id/retry-credentials', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const globalScheduler = (global as any).__vpsPullScheduler;
    if (!globalScheduler) return res.status(503).json({ error: 'Update system not available' });

    const failedAccounts = await db.query(
      `SELECT id, account_number, mt5_server, investor_password
       FROM trading_registrations
       WHERE challenge_id=$1 AND disqualified=false AND pull_status='password_changed' AND investor_password IS NOT NULL
       ORDER BY last_pull_at DESC NULLS LAST`, [challengeId]);

    if (failedAccounts.rows.length === 0) {
      return res.json({ success: true, total: 0, message: 'No credential failures to retry' });
    }

    // Reset status so next pull picks them up
    await db.query(
      `UPDATE trading_registrations SET pull_status=NULL, pull_error=NULL
       WHERE challenge_id=$1 AND pull_status='password_changed'`, [challengeId]);

    // Trigger a pull cycle
    globalScheduler.runPullCycleForChallenge(challengeId).catch(() => {});
    return res.json({ success: true, total: failedAccounts.rows.length, message: `Retrying ${failedAccounts.rows.length} accounts` });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== PULL HISTORY (Updates tab) ====================
router.get('/challenge/:id/pull-history', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const result = await db.query(
      `SELECT id, started_at, completed_at, total_accounts, successful, failed, status
       FROM wp_pull_batches WHERE challenge_id=$1 ORDER BY started_at DESC LIMIT 30`, [challengeId]);
    return res.json({ batches: result.rows });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== USER TRADES (for participant detail modal) ====================
router.get('/challenge/:id/user-trades', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    const nickname = req.query.nickname as string;
    if (!nickname) return res.status(400).json({ error: 'nickname required' });

    const reg = await db.query(
      `SELECT id FROM trading_registrations WHERE challenge_id=$1 AND nickname=$2 AND (status IS NULL OR status != 'removed')`, [challengeId, nickname]);
    if (!reg.rows[0]) return res.json({ trades: [], balanceOps: [] });
    const registrationId = reg.rows[0].id;

    const trades = await db.query(
      `SELECT ticket, symbol, trade_type, volume, open_time, close_time, open_price, close_price,
              stop_loss, take_profit, profit, commission, swap, is_qualified, violations, position_id
       FROM wp_trades WHERE challenge_id=$1 AND registration_id=$2 ORDER BY close_time DESC LIMIT 100`, [challengeId, registrationId]);

    const balanceOps = await db.query(
      `SELECT type, amount, time FROM wp_balance_ops WHERE challenge_id=$1 AND registration_id=$2 ORDER BY time DESC LIMIT 50`, [challengeId, registrationId]);

    return res.json({ trades: trades.rows, balanceOps: balanceOps.rows });
  } catch (error) {
    return res.json({ trades: [], balanceOps: [] });
  }
});

export default router;
