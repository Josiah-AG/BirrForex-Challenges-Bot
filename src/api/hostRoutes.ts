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

    const trades = await db.query(
      `SELECT COUNT(*) as total,
              COUNT(CASE WHEN is_qualified=false THEN 1 END) as flagged,
              COALESCE(SUM(volume), 0) as total_volume
       FROM wp_trades WHERE challenge_id=$1`, [challengeId]);

    const aboveTarget = await db.query(
      `SELECT COUNT(*) as cnt FROM wp_leaderboard WHERE challenge_id=$1 AND is_qualified=true AND is_disqualified=false`, [challengeId]);

    const pwChanged = await db.query(
      `SELECT COUNT(*) as cnt FROM trading_registrations WHERE challenge_id=$1 AND pull_status='password_changed'`, [challengeId]);

    const lastPull = await db.query(
      `SELECT started_at, completed_at, successful, failed, total_accounts, status FROM wp_pull_batches WHERE challenge_id=$1 ORDER BY started_at DESC LIMIT 1`, [challengeId]);

    const pullsToday = await db.query(
      `SELECT COUNT(*) as cnt FROM wp_pull_batches WHERE challenge_id=$1 AND started_at::date = CURRENT_DATE`, [challengeId]);

    // Top violations
    const topViolations = await db.query(
      `SELECT unnest(violations) as rule, COUNT(*) as cnt
       FROM wp_trades WHERE challenge_id=$1 AND is_qualified=false AND violations IS NOT NULL AND array_length(violations, 1) > 0
       GROUP BY rule ORDER BY cnt DESC LIMIT 8`, [challengeId]);

    const totalParticipants = parseInt(participants.rows[0]?.total || '0');
    const totalTrades = parseInt(trades.rows[0]?.total || '0');
    const totalViolations = parseInt(trades.rows[0]?.flagged || '0');

    return res.json({
      challenge: c,
      totalParticipants,
      demoParticipants: parseInt(participants.rows[0]?.demo || '0'),
      realParticipants: parseInt(participants.rows[0]?.real || '0'),
      disqualified: parseInt(participants.rows[0]?.disqualified || '0'),
      totalTrades,
      totalViolations,
      violationRate: totalTrades > 0 ? ((totalViolations / totalTrades) * 100).toFixed(1) : '0',
      aboveTarget: parseInt(aboveTarget.rows[0]?.cnt || '0'),
      passwordChanged: parseInt(pwChanged.rows[0]?.cnt || '0'),
      pullsToday: parseInt(pullsToday.rows[0]?.cnt || '0'),
      lastPull: lastPull.rows[0] || null,
      topViolations: topViolations.rows.map((v: any) => ({ rule: v.rule, count: parseInt(v.cnt) })),
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

// ==================== DELETE CHALLENGE ====================
router.delete('/challenge/:id', async (req: any, res: Response) => {
  const challengeId = await verifyOwnership(req, res);
  if (!challengeId) return;
  try {
    await db.query(`UPDATE trading_challenges SET status='deleted', updated_at=NOW() WHERE id=$1`, [challengeId]);
    return res.json({ success: true });
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
