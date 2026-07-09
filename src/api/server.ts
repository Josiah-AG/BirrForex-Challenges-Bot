import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { db } from '../database/db';
import { config } from '../config';
import { vpsService } from '../services/vpsService';
import crypto from 'crypto';
import { discordRoutes } from './discordRoutes';
import * as XLSX from 'xlsx';

const app = express();

// ==================== SECURITY: RATE LIMITING & DDOS PROTECTION ====================

// Global rate limit: 100 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
  validate: { xForwardedForHeader: false },
});

// Strict rate limit for auth endpoints: 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  validate: { xForwardedForHeader: false },
});

// Admin rate limit: 5 attempts per 15 minutes
const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Locked for 15 minutes.' },
  validate: { xForwardedForHeader: false },
});

app.use(globalLimiter);

// Trust proxy (Railway runs behind a reverse proxy)
app.set('trust proxy', 1);

// CORS — allow WinnerPip frontend
app.use(cors({
  origin: process.env.WINNERPIP_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json({ limit: '10kb' })); // Limit body size for DDoS protection

// ==================== ADMIN SECURITY: IP WHITELIST + SECRET PATH ====================

// Admin path is a secret set via Railway env var (e.g., WINNERPIP_ADMIN_PATH=xK9mP2vL7)
// Full admin URL becomes: /api/admin/xK9mP2vL7/...
// Admin password set via: WINNERPIP_ADMIN_KEY
// IP whitelist set via: WINNERPIP_ADMIN_IPS (comma-separated)
const ADMIN_SECRET_PATH = process.env.WINNERPIP_ADMIN_PATH || '';
const ADMIN_KEY = process.env.WINNERPIP_ADMIN_KEY || '';
const ADMIN_WHITELISTED_IPS = (process.env.WINNERPIP_ADMIN_IPS || '').split(',').map(ip => ip.trim()).filter(Boolean);

function adminIpCheck(req: any, res: any, next: any) {
  // If no IPs configured, allow all (dev mode)
  if (ADMIN_WHITELISTED_IPS.length === 0) return next();

  // Get real client IP from Cloudflare/proxy headers
  const clientIp = req.headers['cf-connecting-ip'] 
    || req.headers['x-real-ip']
    || (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.ip 
    || req.connection?.remoteAddress 
    || '';
  const normalizedIp = String(clientIp).replace('::ffff:', '').trim();

  // Strict equality check (no substring matching)
  const allowed = ADMIN_WHITELISTED_IPS.some(whitelistedIp => 
    normalizedIp === whitelistedIp
  );

  if (!allowed) {
    console.log(`🚫 Admin access denied from IP: ${normalizedIp}`);
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}

// ==================== AUTH ENDPOINTS ====================

/**
 * POST /api/auth/login
 * Body: { account_number, investor_password }
 * 
 * Validates credentials by checking against stored registration data.
 * Returns a session token + user info.
 */
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { account_number, investor_password, challenge_id } = req.body;

    if (!account_number || !investor_password) {
      return res.status(400).json({ error: 'Account number and investor password are required' });
    }

    // Build query — if challenge_id provided, scope to that challenge
    let query = `SELECT r.*, c.title as challenge_title, c.status as challenge_status, c.id as challenge_id
       FROM trading_registrations r
       JOIN trading_challenges c ON r.challenge_id = c.id
       WHERE r.account_number = $1
         AND r.investor_password = $2
         AND (r.status IS NULL OR r.status != 'removed')`;
    const params: any[] = [account_number.trim(), investor_password.trim()];

    if (challenge_id) {
      query += ` AND r.challenge_id = $3`;
      params.push(parseInt(challenge_id));
    }

    query += ` ORDER BY r.registered_at DESC LIMIT 1`;

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      // Check if there's a removed registration for this account
      let removedQuery = `SELECT r.status, r.disqualified, r.disqualified_reason, c.title as challenge_title
         FROM trading_registrations r
         JOIN trading_challenges c ON r.challenge_id = c.id
         WHERE r.account_number = $1
           AND r.investor_password = $2`;
      const removedParams: any[] = [account_number.trim(), investor_password.trim()];
      if (challenge_id) {
        removedQuery += ` AND r.challenge_id = $3`;
        removedParams.push(parseInt(challenge_id));
      }
      removedQuery += ` ORDER BY r.registered_at DESC LIMIT 1`;

      const removedCheck = await db.query(removedQuery, removedParams);

      if (removedCheck.rows.length > 0) {
        const removed = removedCheck.rows[0];
        if (removed.status === 'removed') {
          return res.status(403).json({
            error: 'registration_removed',
            message: `Your registration for "${removed.challenge_title}" was removed.`,
            reason: removed.disqualified_reason || 'No reason provided',
            canReregister: true,
          });
        }
      }

      return res.status(401).json({ error: 'Invalid account number or investor password' });
    }

    const registration = result.rows[0];

    // Generate a session token (simple JWT-like token for now)
    const token = generateToken(registration.id, registration.user_id);

    return res.json({
      success: true,
      token,
      user: {
        registrationId: registration.id,
        userId: registration.user_id,
        nickname: registration.nickname,
        username: registration.username,
        accountNumber: registration.account_number,
        accountType: registration.account_type,
        server: registration.mt5_server,
        challengeId: registration.challenge_id,
        challengeTitle: registration.challenge_title,
        challengeStatus: registration.challenge_status,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/verify-token
 * Header: Authorization: Bearer <token>
 * 
 * Validates a session token and returns user info.
 */
app.post('/api/auth/verify-token', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);

    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Get fresh user data
    const result = await db.query(
      `SELECT r.id, r.user_id, r.nickname, r.username, r.account_number, r.account_type, r.mt5_server, r.challenge_id, r.disqualified,
              c.title as challenge_title, c.status as challenge_status
       FROM trading_registrations r
       JOIN trading_challenges c ON r.challenge_id = c.id
       WHERE r.id = $1 AND (r.status IS NULL OR r.status != 'removed')`,
      [payload.registrationId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Registration not found or disqualified' });
    }

    const reg = result.rows[0];

    return res.json({
      success: true,
      user: {
        registrationId: reg.id,
        telegramId: reg.user_id,
        nickname: reg.nickname,
        username: reg.username,
        accountNumber: reg.account_number,
        accountType: reg.account_type,
        server: reg.mt5_server,
        challengeId: reg.challenge_id,
        challengeTitle: reg.challenge_title,
        challengeStatus: reg.challenge_status,
      },
    });
  } catch (error) {
    console.error('Token verify error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== CHALLENGES ====================

/**
 * GET /api/challenges
 * Returns all challenges (public — for landing page)
 */
app.get('/api/challenges', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, type, status, start_date, end_date, starting_balance, target_balance,
              real_winners_count, demo_winners_count, real_prizes, demo_prizes, prize_pool_text,
              pdf_url, video_url, announcement_posted, evaluation_type, winners_posted_at,
              source, team_only, registration_deadline
       FROM trading_challenges
       WHERE status != 'deleted'
       ORDER BY created_at DESC
       LIMIT 20`
    );

    const challenges: any[] = [];
    
    for (const c of result.rows) {
      // Compute display status
      let displayStatus = 'coming_soon';
      if (!c.announcement_posted && c.status === 'draft') displayStatus = 'coming_soon';
      else if (c.status === 'registration_open') displayStatus = 'registration_open';
      else if (c.status === 'active') displayStatus = 'ongoing';
      else if (['submission_open', 'reviewing'].includes(c.status) && !c.winners_posted_at) {
        // Show "Evaluation" for first 12h after end, then "Ended"
        const hoursSinceEnd = (Date.now() - new Date(c.end_date).getTime()) / (1000 * 60 * 60);
        displayStatus = hoursSinceEnd < 12 ? 'evaluation' : 'ended';
      }
      else if (c.winners_posted_at) displayStatus = 'ended';
      else if (c.status === 'completed' && !c.winners_posted_at) displayStatus = 'ended';
      else displayStatus = c.status;

      // 7-day visibility: hide challenges where winners were posted more than 7 days ago
      if (c.winners_posted_at) {
        const daysSincePosted = (Date.now() - new Date(c.winners_posted_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSincePosted > 7) continue; // Skip — no longer visible
      }

      // Hide old completed challenges that predate the winners_posted_at feature
      if (c.status === 'completed' && !c.winners_posted_at) {
        const daysSinceEnd = (Date.now() - new Date(c.end_date).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceEnd > 14) continue; // Skip — old challenge, no longer relevant
      }

      challenges.push({
        id: c.id,
        title: c.title,
        type: c.type,
        status: c.status,
        displayStatus,
        startDate: c.start_date,
        endDate: c.end_date,
        startingBalance: c.starting_balance,
        targetBalance: c.target_balance,
        realWinnersCount: c.real_winners_count,
        demoWinnersCount: c.demo_winners_count,
        realPrizes: typeof c.real_prizes === 'string' ? JSON.parse(c.real_prizes) : c.real_prizes,
        demoPrizes: typeof c.demo_prizes === 'string' ? JSON.parse(c.demo_prizes) : c.demo_prizes,
        prizePoolText: c.prize_pool_text,
        pdfUrl: c.pdf_url,
        videoUrl: c.video_url,
        evaluationType: c.evaluation_type || 'winnerpip',
        winnersPostedAt: c.winners_posted_at,
        source: c.source || 'telegram',
        teamOnly: c.team_only || false,
        registrationDeadline: c.registration_deadline,
      });
    }

    // Get participant counts
    for (const challenge of challenges) {
      const counts = await db.query(
        `SELECT COUNT(*) as total,
                COUNT(CASE WHEN account_type = 'demo' THEN 1 END) as demo,
                COUNT(CASE WHEN account_type = 'real' THEN 1 END) as real
         FROM trading_registrations WHERE challenge_id = $1`,
        [challenge.id]
      );
      challenge.participants = {
        total: parseInt(counts.rows[0].total),
        demo: parseInt(counts.rows[0].demo),
        real: parseInt(counts.rows[0].real),
      };
    }

    return res.json({ challenges });
  } catch (error) {
    console.error('Challenges error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/challenges/:id/leaderboard
 * Returns leaderboard for a challenge (public)
 */
app.get('/api/challenges/:id/leaderboard', async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const category = req.query.category as string || 'all'; // 'demo', 'real', 'all'

    // Check challenge status — pre-start uses registration-based ranking
    const challengeStatus = await db.query(
      `SELECT status, leaderboard_updated_at FROM trading_challenges WHERE id = $1`,
      [challengeId]
    );
    const status = challengeStatus.rows[0]?.status;
    const dataFrom = challengeStatus.rows[0]?.leaderboard_updated_at || null;

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    // Helper: build a pre-start response from trading_registrations (last_known_balance)
    const buildPreStartResponse = async () => {
      const centCheck = await db.query(
        `SELECT COALESCE((SELECT (parameters->>'only_cent_account')::boolean FROM wp_challenge_rules WHERE challenge_id = $1 AND rule_code = 'config'), false) as only_cent FROM trading_challenges WHERE id = $1`,
        [challengeId]
      );
      const challengeOnlyCent = centCheck.rows[0]?.only_cent || false;

      const regParams: any[] = [challengeId];
      let catFilter = '';
      if (category === 'demo' || category === 'real') {
        catFilter = ' AND account_type = $2';
        regParams.push(category);
      }

      const regResult = await db.query(
        `SELECT nickname, account_type, is_cent,
                COALESCE(last_known_balance, actual_starting_balance, registration_balance) as reg_balance,
                registered_at,
                ROW_NUMBER() OVER (
                  PARTITION BY account_type
                  ORDER BY COALESCE(last_known_balance, actual_starting_balance, registration_balance) DESC NULLS LAST, registered_at ASC
                ) as rank
         FROM trading_registrations
         WHERE challenge_id = $1
           AND (status IS NULL OR status != 'removed')
           ${catFilter}
         ORDER BY account_type, rank
         LIMIT ${limit} OFFSET ${offset}`,
        regParams
      );
      const countResult = await db.query(
        `SELECT COUNT(*) as total FROM trading_registrations WHERE challenge_id = $1 AND (status IS NULL OR status != 'removed')${catFilter}`,
        regParams
      );
      return {
        dataFrom: null,
        preStart: true,
        total: parseInt(countResult.rows[0].total),
        hasMore: offset + limit < parseInt(countResult.rows[0].total),
        leaderboard: regResult.rows.map((r: any) => ({
          nickname: r.nickname,
          accountType: r.account_type,
          rank: parseInt(r.rank),
          currentBalance: parseFloat(r.reg_balance) || 0,
          adjustedBalance: parseFloat(r.reg_balance) || 0,
          qualifiedProfit: 0,
          grossProfit: 0,
          profitRemoved: 0,
          totalTrades: 0,
          qualifiedTrades: 0,
          flaggedTrades: 0,
          isQualified: false,
          isDisqualified: false,
          isBlown: false,
          isCent: r.is_cent || (challengeOnlyCent && r.account_type !== 'demo') || false,
          registeredAt: r.registered_at,
        })),
      };
    };

    // PRE-START: challenge not yet active — always use last_known_balance ranking
    // regardless of whether wp_leaderboard has rows (e.g. from an accidental admin pull)
    if (status !== 'active' && status !== 'reviewing' && status !== 'completed') {
      return res.json(await buildPreStartResponse());
    }

    // Get leaderboard data freshness

    let query = `
      SELECT l.nickname, l.account_type, l.rank, l.current_balance, l.adjusted_balance,
             l.qualified_profit, l.gross_profit, l.profit_removed, l.total_trades,
             l.qualified_trades, l.flagged_trades, l.is_qualified, l.is_disqualified,
             l.disqualify_reason, l.last_trade_time, l.last_updated, l.zero_balance_at,
             COALESCE(l.is_cent, r.is_cent, false) as is_cent, l.normalized_balance,
             COALESCE(l.is_withdrawn, false) as is_withdrawn,
             COALESCE(l.total_withdrawn, 0) as total_withdrawn
      FROM wp_leaderboard l
      JOIN trading_registrations r ON l.registration_id = r.id AND (r.status IS NULL OR r.status != 'removed')
      WHERE l.challenge_id = $1
    `;
    const params: any[] = [challengeId];

    if (category === 'demo' || category === 'real') {
      query += ` AND l.account_type = $2`;
      params.push(category);
    }

    query += ` ORDER BY l.rank ASC NULLS LAST, l.qualified_profit DESC`;
    query += ` LIMIT ${limit} OFFSET ${offset}`;

    const result = await db.query(query, params);

    // No pull data yet — fall back to registration-based pre-start ranking
    if (result.rows.length === 0 && offset === 0) {
      return res.json(await buildPreStartResponse());
    }

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM wp_leaderboard l JOIN trading_registrations r ON l.registration_id = r.id AND (r.status IS NULL OR r.status != 'removed') WHERE l.challenge_id = $1`;
    const countParams: any[] = [challengeId];
    if (category === 'demo' || category === 'real') {
      countQuery += ` AND l.account_type = $2`;
      countParams.push(category);
    }
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    return res.json({
      dataFrom,
      total,
      hasMore: offset + limit < total,
      leaderboard: result.rows.map(r => ({
        nickname: r.nickname,
        accountType: r.account_type,
        rank: r.rank,
        currentBalance: parseFloat(r.current_balance),
        adjustedBalance: parseFloat(r.adjusted_balance),
        qualifiedProfit: parseFloat(r.qualified_profit),
        grossProfit: parseFloat(r.gross_profit),
        profitRemoved: parseFloat(r.profit_removed),
        totalTrades: r.total_trades,
        qualifiedTrades: r.qualified_trades,
        flaggedTrades: r.flagged_trades,
        isQualified: r.is_qualified,
        isDisqualified: r.is_disqualified || false,
        disqualifyReason: r.disqualify_reason || null,
        isBlown: r.total_trades > 0 && parseFloat(r.current_balance) <= 0 && !r.is_withdrawn,
        isWithdrawn: r.is_withdrawn || false,
        totalWithdrawn: parseFloat(r.total_withdrawn) || 0,
        isCent: r.is_cent || false,
        lastTradeTime: r.last_trade_time,
        lastUpdated: r.last_updated,
      })),
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/challenges/:id/user-trades?nickname=xxx
 * Returns recent trades for a user (public, for leaderboard detail view)
 */
app.get('/api/challenges/:id/user-trades', async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const nickname = req.query.nickname as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    if (!nickname) return res.json({ trades: [], total: 0, hasMore: false });

    // Find registration by nickname
    const reg = await db.query(
      `SELECT r.id, c.start_date, c.end_date FROM trading_registrations r
       JOIN trading_challenges c ON r.challenge_id = c.id
       WHERE r.challenge_id = $1 AND LOWER(r.nickname) = LOWER($2) AND (r.status IS NULL OR r.status != 'removed')`,
      [challengeId, nickname]
    );
    if (reg.rows.length === 0) return res.json({ trades: [], total: 0, hasMore: false });

    const registrationId = reg.rows[0].id;
    const startDate = reg.rows[0].start_date;
    const endDate = reg.rows[0].end_date;

    // Build date filter — restrict to challenge period only
    let dateFilter = '';
    const baseParams: any[] = [challengeId, registrationId];
    if (startDate) {
      const graceStart = new Date(new Date(startDate).getTime() - 3 * 60 * 60 * 1000);
      dateFilter = ` AND close_time >= $3`;
      baseParams.push(graceStart.toISOString());
    }
    if (endDate) {
      const graceEnd = new Date(new Date(endDate).getTime() + 27 * 60 * 60 * 1000);
      dateFilter += ` AND close_time <= $${baseParams.length + 1}`;
      baseParams.push(graceEnd.toISOString());
    }

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM wp_trades WHERE challenge_id = $1 AND registration_id = $2${dateFilter}`,
      baseParams
    );
    const total = parseInt(countResult.rows[0].total);

    // Get trades with pagination
    const trades = await db.query(
      `SELECT ticket, position_id, symbol, trade_type, volume, profit, commission, swap, close_time, open_time, open_price, close_price, is_qualified, violations, sl_check_pending, sl_check_result
       FROM wp_trades WHERE challenge_id = $1 AND registration_id = $2${dateFilter}
       ORDER BY close_time DESC LIMIT ${limit} OFFSET ${offset}`,
      baseParams
    );

    // Fetch withdrawal/deposit ops for this registration
    const balanceOps = await db.query(
      `SELECT deal_ticket, op_time, amount, op_type, comment
       FROM wp_balance_ops
       WHERE challenge_id = $1 AND registration_id = $2
       ORDER BY op_time DESC`,
      [challengeId, registrationId]
    ).catch(() => ({ rows: [] }));

    const tradeRows = trades.rows.map((t: any) => ({
      ticket: t.ticket,
      positionId: t.position_id,
      symbol: t.symbol,
      type: t.trade_type,
      volume: parseFloat(t.volume),
      profit: parseFloat(t.profit) + parseFloat(t.commission || 0) + parseFloat(t.swap || 0),
      closeTime: t.close_time,
      openTime: t.open_time,
      openPrice: parseFloat(t.open_price) || 0,
      closePrice: parseFloat(t.close_price) || 0,
      isQualified: t.is_qualified,
      violations: t.violations || [],
      slCheckPending: t.sl_check_pending || false,
      slCheckResult: t.sl_check_result || null,
    }));

    const balanceOpRows = balanceOps.rows.map((b: any) => ({
      _isBalanceOp: true,
      ticket: b.deal_ticket,
      opType: b.op_type,
      amount: parseFloat(b.amount),
      closeTime: b.op_time,
      comment: b.comment || '',
    }));

    return res.json({
      total,
      hasMore: offset + limit < total,
      trades: tradeRows,
      balanceOps: balanceOpRows,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/me/dashboard
 * Requires auth. Returns the user's personal dashboard data.
 */
app.get('/api/me/dashboard', authMiddleware, async (req: any, res) => {
  try {
    const { registrationId } = req.user;

    // Get leaderboard entry
    const lb = await db.query(
      `SELECT * FROM wp_leaderboard WHERE registration_id = $1`,
      [registrationId]
    );

    // Get recent trades (within challenge period)
    const regInfo = await db.query(`SELECT challenge_id FROM trading_registrations WHERE id = $1`, [registrationId]);
    const cId = regInfo.rows[0]?.challenge_id;
    const cDates = await db.query(`SELECT start_date, end_date FROM trading_challenges WHERE id = $1`, [cId]);
    const cStartDate = cDates.rows[0]?.start_date;
    const cEndDate   = cDates.rows[0]?.end_date;
    let tradesQuery = `SELECT ticket, symbol, trade_type, volume, open_time, close_time,
              open_price, close_price, profit, commission, swap, is_qualified, violations, sl_check_pending, sl_check_result
       FROM wp_trades
       WHERE challenge_id = $1 AND registration_id = $2`;
    const tradesParams: any[] = [cId, registrationId];
    if (cStartDate) {
      const graceStart = new Date(new Date(cStartDate).getTime() - 3 * 60 * 60 * 1000);
      tradesQuery += ` AND close_time >= $3`;
      tradesParams.push(graceStart.toISOString());
    }
    if (cEndDate) {
      const graceEnd = new Date(new Date(cEndDate).getTime() + 27 * 60 * 60 * 1000);
      tradesQuery += ` AND close_time <= $${tradesParams.length + 1}`;
      tradesParams.push(graceEnd.toISOString());
    }
    tradesQuery += ` ORDER BY close_time DESC LIMIT 50`;
    const trades = await db.query(tradesQuery, tradesParams);

    // Get challenge info
    const reg = await db.query(
      `SELECT r.id, r.nickname, r.account_number, r.account_type, r.account_subtype, r.mt5_server, r.challenge_id, r.pull_status,
              r.actual_starting_balance, r.registration_balance, r.last_known_balance, r.disqualified, r.disqualified_reason, r.is_cent,
              r.last_pull_at,
              c.title, c.status, c.start_date, c.end_date, c.starting_balance, c.target_balance, c.leaderboard_updated_at,
              c.real_winners_count, c.demo_winners_count, c.type as challenge_type,
              COALESCE((SELECT (parameters->>'only_cent_account')::boolean FROM wp_challenge_rules WHERE challenge_id = c.id AND rule_code = 'config'), false) as only_cent_account
       FROM trading_registrations r
       JOIN trading_challenges c ON r.challenge_id = c.id
       WHERE r.id = $1`,
      [registrationId]
    );

    const registration = reg.rows[0];
    const leaderboard = lb.rows[0] || null;

    // Determine the user's actual starting balance — never fake with challenge starting_balance
    const actualStartingBalance = registration.actual_starting_balance != null
      ? parseFloat(registration.actual_starting_balance)
      : registration.registration_balance != null
        ? parseFloat(registration.registration_balance)
        : registration.last_known_balance != null
          ? parseFloat(registration.last_known_balance)
          : null;

    return res.json({
      dataFrom: registration.leaderboard_updated_at || null,
      challenge: {
        id: registration.challenge_id,
        title: registration.title,
        status: registration.status,
        startDate: registration.start_date,
        endDate: registration.end_date,
        startingBalance: parseFloat(registration.starting_balance),  // challenge-wide official starting balance
        myStartingBalance: actualStartingBalance ?? parseFloat(registration.starting_balance), // user's personal starting balance
        targetBalance: parseFloat(registration.target_balance),
        winnersCount: parseInt(registration.real_winners_count || 0) + parseInt(registration.demo_winners_count || 0),
        realWinnersCount: parseInt(registration.real_winners_count || 0),
        demoWinnersCount: parseInt(registration.demo_winners_count || 0),
        onlyCentAccount: registration.only_cent_account || false,
      },
      me: {
        nickname: registration.nickname,
        accountNumber: registration.account_number,
        accountType: registration.account_type,
        accountSubtype: registration.account_subtype || null,
        server: registration.mt5_server,
        pullStatus: registration.pull_status || null,
        disqualified: registration.disqualified || false,
        disqualifiedReason: registration.disqualified_reason || null,
        // Derive isCent: trust registration flag, but also fallback to challenge only_cent_account
        isCent: registration.is_cent || (registration.only_cent_account && registration.challenge_type !== 'demo') || false,
        actualStartingBalance: actualStartingBalance,
        lastPullAt: registration.last_pull_at || null,
        rank: leaderboard?.rank || null,
        currentBalance: leaderboard ? parseFloat(leaderboard.current_balance) : (actualStartingBalance ?? 0),
        adjustedBalance: leaderboard ? parseFloat(leaderboard.adjusted_balance) : (actualStartingBalance ?? 0),
        qualifiedProfit: leaderboard ? parseFloat(leaderboard.qualified_profit) : 0,
        grossProfit: leaderboard ? parseFloat(leaderboard.gross_profit) : 0,
        profitRemoved: leaderboard ? parseFloat(leaderboard.profit_removed) : 0,
        totalTrades: leaderboard?.total_trades || 0,
        qualifiedTrades: leaderboard?.qualified_trades || 0,
        flaggedTrades: leaderboard?.flagged_trades || 0,
        isQualified: leaderboard?.is_qualified || false,
        lastUpdated: leaderboard?.last_updated || null,
      },
      recentTrades: trades.rows.map(t => ({
        ticket: t.ticket,
        symbol: t.symbol,
        type: t.trade_type,
        volume: parseFloat(t.volume),
        openTime: t.open_time,
        closeTime: t.close_time,
        openPrice: parseFloat(t.open_price),
        closePrice: parseFloat(t.close_price),
        profit: parseFloat(t.profit),
        commission: parseFloat(t.commission),
        swap: parseFloat(t.swap),
        isQualified: t.is_qualified,
        violations: t.violations || [],
        slCheckPending: t.sl_check_pending || false,
        slCheckResult: t.sl_check_result || null,
      })),
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== AUTH MIDDLEWARE ====================

function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = payload;
  next();
}

// ==================== TOKEN HELPERS ====================

const TOKEN_SECRET = (() => {
  const secret = process.env.WINNERPIP_TOKEN_SECRET;
  if (!secret) throw new Error('WINNERPIP_TOKEN_SECRET env var is required');
  return secret;
})();
const TOKEN_EXPIRY_HOURS = 72; // 3 days

function generateToken(registrationId: number, telegramId: number): string {
  const payload = {
    registrationId,
    telegramId,
    exp: Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

function verifyToken(token: string): { registrationId: number; telegramId: number } | null {
  try {
    const [data, signature] = token.split('.');
    if (!data || !signature) return null;

    const expectedSig = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(data)
      .digest('base64url');

    // Timing-safe comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature, 'base64url');
    const expectedBuffer = Buffer.from(expectedSig, 'base64url');
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;

    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());

    if (payload.exp < Date.now()) return null;

    return { registrationId: payload.registrationId, telegramId: payload.telegramId };
  } catch {
    return null;
  }
}

// ==================== ADMIN API (Secret path + IP whitelist + rate limit) ====================

/**
 * POST /api/admin/:secretPath/login
 * Body: { key }
 * Validates admin key. IP-restricted.
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/login`, adminIpCheck, adminAuthLimiter, async (req, res) => {
  const { key } = req.body;
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Invalid admin key' });
  }
  return res.json({ success: true });
});

/**
 * GET /api/admin/:secretPath/challenges
 * Returns ALL challenges (no visibility filter) for admin panel
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenges`, adminIpCheck, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, type, status, start_date, end_date, starting_balance, target_balance,
              real_winners_count, demo_winners_count, prize_pool_text, source, team_only,
              evaluation_type, created_at
       FROM trading_challenges
       WHERE status != 'deleted'
       ORDER BY created_at DESC`
    );

    const challenges = result.rows.map((c: any) => ({
      id: c.id,
      title: c.title,
      type: c.type,
      status: c.status,
      startDate: c.start_date,
      endDate: c.end_date,
      startingBalance: parseFloat(c.starting_balance),
      targetBalance: parseFloat(c.target_balance),
      prizePoolText: c.prize_pool_text,
      source: c.source || 'telegram',
      teamOnly: c.team_only || false,
      evaluationType: c.evaluation_type || 'winnerpip',
      createdAt: c.created_at,
    }));

    return res.json({ challenges });
  } catch (error) {
    console.error('Admin challenges error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/participants
 * Paginated participants list (100 per page)
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/participants`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id as string);
    const page = parseInt(req.query.page as string) || 1;
    const limit = 100;
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM trading_registrations WHERE challenge_id = $1`,
      [challengeId]
    );
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    // Get paginated participants
    const result = await db.query(
      `SELECT r.id, r.user_id, r.source, r.username, r.nickname, r.account_type,
              r.email, r.account_number, r.mt5_server, r.status, r.partner_status,
              r.disqualified, r.disqualified_reason, r.registered_at, r.source,
              r.connection_verified, r.pull_status, r.last_pull_at, r.is_cent, r.account_subtype,
              r.registration_balance, r.last_known_balance,
              l.rank, l.current_balance, l.adjusted_balance, l.qualified_profit, l.total_trades, l.flagged_trades,
              c.source as challenge_source
       FROM trading_registrations r
       LEFT JOIN wp_leaderboard l ON r.id = l.registration_id
       LEFT JOIN trading_challenges c ON r.challenge_id = c.id
       WHERE r.challenge_id = $1 AND (r.status IS NULL OR r.status != 'removed')
       ORDER BY l.rank ASC NULLS LAST, r.registered_at ASC
       LIMIT $2 OFFSET $3`,
      [challengeId, limit, offset]
    );

    return res.json({
      participants: result.rows.map((r: any) => ({
        id: r.id,
        telegramId: r.user_id,
        source: r.source,
        username: r.username,
        nickname: r.nickname,
        accountType: r.account_type,
        email: r.email,
        accountNumber: r.account_number,
        server: r.mt5_server,
        status: r.status,
        partnerStatus: r.partner_status,
        disqualified: r.disqualified,
        disqualifiedReason: r.disqualified_reason,
        registeredAt: r.registered_at,
        challengeSource: r.challenge_source || 'telegram',
        connectionVerified: r.connection_verified,
        pullStatus: r.pull_status,
        lastPullAt: r.last_pull_at,
        rank: r.rank,
        isCent: r.is_cent || false,
        accountSubtype: r.account_subtype || null,
        // Use leaderboard balance if available; fall back to last_known_balance / registration_balance
        balance: r.current_balance != null
          ? parseFloat(r.current_balance)
          : r.last_known_balance != null
            ? parseFloat(r.last_known_balance)
            : r.registration_balance != null
              ? parseFloat(r.registration_balance)
              : null,
        adjustedBalance: r.adjusted_balance != null ? parseFloat(r.adjusted_balance) : null,
        qualifiedProfit: r.qualified_profit != null ? parseFloat(r.qualified_profit) : null,
        totalTrades: r.total_trades || 0,
        flaggedTrades: r.flagged_trades || 0,
      })),
      pagination: {
        page,
        totalPages,
        total,
        limit,
      },
    });
  } catch (error) {
    console.error('Admin participants error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/:secretPath/challenge/:id/unverify
 * Remove a registration completely (user can re-register)
 * Body: { registrationId, reason }
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/unverify`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id as string);
    const { registrationId, reason } = req.body;
    if (!registrationId || !reason) {
      return res.status(400).json({ error: 'registrationId and reason are required' });
    }

    const reg = await db.query(
      `SELECT r.user_id, r.source, r.username, r.nickname, r.account_number, c.title, c.source as challenge_source
       FROM trading_registrations r
       JOIN trading_challenges c ON r.challenge_id = c.id
       WHERE r.id = $1 AND r.challenge_id = $2`,
      [registrationId, challengeId]
    );

    if (reg.rows.length === 0) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    const user = reg.rows[0];
    const isDiscordChallenge = user.challenge_source === 'discord';

    if (isDiscordChallenge) {
      // Discord challenge: soft-delete so WinnerPip login can show the removal reason
      await db.query(
        `UPDATE trading_registrations SET status = 'removed', disqualified = true, disqualified_at = NOW(), disqualified_reason = $1 WHERE id = $2`,
        [reason, registrationId]
      );
    } else {
      // Telegram challenge: hard delete — user is informed via Telegram DM
      await db.query(`DELETE FROM trading_registrations WHERE id = $1`, [registrationId]);
    }

    // Remove from leaderboard (both cases)
    await db.query(`DELETE FROM wp_leaderboard WHERE registration_id = $1`, [registrationId]);
    await db.query(`DELETE FROM wp_leaderboard_staging WHERE registration_id = $1`, [registrationId]);

    // DM the user — Telegram challenges only (Discord users can't be DM'd via Telegram bot)
    let dmSent = false;
    if (!isDiscordChallenge && user.user_id) {
      try {
        const botModule = require('../bot/bot');
        const botInstance = botModule.bot || botModule.default;
        if (botInstance && botInstance.bot) {
          await botInstance.bot.telegram.sendMessage(
            user.user_id,
            `⚠️ <b>Registration Removed</b>\n<b>${user.title}</b>\n\n` +
            `Your registration (account ${user.account_number}) has been removed by the admin.\n\n` +
            `📛 <b>Reason:</b> ${reason}\n\n` +
            `You may register again if you wish.`,
            { parse_mode: 'HTML' }
          );
          dmSent = true;
        }
      } catch (e: any) {
        console.error(`Failed to DM unverify notice: ${e.message}`);
      }
    }

    return res.json({ success: true, dmSent, user: user.nickname || user.username, isDiscord: isDiscordChallenge });
  } catch (error) {
    console.error('Admin unverify error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/:secretPath/challenge/:id/disqualify
 * Disqualify a participant (stays in system, marked as DQ on leaderboard)
 * Body: { registrationId, reason }
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/disqualify`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id as string);
    const { registrationId, reason } = req.body;
    if (!registrationId || !reason) {
      return res.status(400).json({ error: 'registrationId and reason are required' });
    }

    const reg = await db.query(
      `SELECT r.user_id, r.source, r.username, r.nickname, r.account_number, r.source, c.title
       FROM trading_registrations r
       JOIN trading_challenges c ON r.challenge_id = c.id
       WHERE r.id = $1 AND r.challenge_id = $2`,
      [registrationId, challengeId]
    );

    if (reg.rows.length === 0) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    const user = reg.rows[0];

    // Mark as disqualified
    await db.query(
      `UPDATE trading_registrations SET disqualified = true, disqualified_at = NOW(), disqualified_reason = $1 WHERE id = $2`,
      [reason, registrationId]
    );

    // Update leaderboard
    await db.query(
      `UPDATE wp_leaderboard SET is_disqualified = true, disqualify_reason = $1 WHERE registration_id = $2`,
      [reason, registrationId]
    );

    // DM the user
    let dmSent = false;
    const isDiscordUser = user.source === 'discord';
    if (!isDiscordUser && user.user_id) {
      try {
        const botModule = require('../bot/bot');
        const botInstance = botModule.bot || botModule.default;
        if (botInstance && botInstance.bot) {
          await botInstance.bot.telegram.sendMessage(
            user.user_id,
            `🚫 <b>Disqualified</b>\n<b>${user.title}</b>\n\n` +
            `Your account ${user.account_number} has been disqualified from the challenge.\n\n` +
            `📛 <b>Reason:</b> ${reason}\n\n` +
            `<i>If you believe this is an error, contact @birrFXadmin.</i>`,
            { parse_mode: 'HTML' }
          );
          dmSent = true;
        }
      } catch (e: any) {
        console.error(`Failed to DM disqualify notice: ${e.message}`);
      }
    }

    return res.json({ success: true, dmSent, user: user.nickname || user.username, isDiscord: isDiscordUser });
  } catch (error) {
    console.error('Admin disqualify error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/overview
 * Full challenge overview for admin
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/overview`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);

    // Participant counts
    const counts = await db.query(
      `SELECT COUNT(*) as total, COUNT(CASE WHEN account_type='demo' THEN 1 END) as demo, COUNT(CASE WHEN account_type='real' THEN 1 END) as real, COUNT(CASE WHEN disqualified=true THEN 1 END) as disqualified FROM trading_registrations WHERE challenge_id=$1 AND (status IS NULL OR status != 'removed')`, [challengeId]);

    // Trade stats — only count trades within challenge period
    const challengeDatesForStats = await db.query(`SELECT start_date, end_date FROM trading_challenges WHERE id = $1`, [challengeId]);
    const cStart = challengeDatesForStats.rows[0]?.start_date;
    const cEnd = challengeDatesForStats.rows[0]?.end_date;
    let tradeFilter = '';
    const tradeParams: any[] = [challengeId];
    if (cStart) {
      const graceStart = new Date(new Date(cStart).getTime() - 3 * 60 * 60 * 1000);
      tradeFilter += ` AND close_time >= $2`;
      tradeParams.push(graceStart.toISOString());
    }
    if (cEnd) {
      tradeFilter += ` AND close_time <= $${tradeParams.length + 1}`;
      tradeParams.push(new Date(cEnd).toISOString());
    }
    const tradeStats = await db.query(
      `SELECT COUNT(*) as total_trades, COALESCE(SUM(volume),0) as total_volume, COUNT(CASE WHEN is_qualified=false THEN 1 END) as violations FROM wp_trades WHERE challenge_id=$1${tradeFilter}`, tradeParams);

    // Pull stats (today)
    const pullStats = await db.query(
      `SELECT COUNT(*) as pulls_today, COALESCE(SUM(successful),0) as total_success, COALESCE(SUM(failed),0) as total_failed, COALESCE(SUM(new_trades_found),0) as new_trades FROM wp_pull_batches WHERE challenge_id=$1 AND started_at > NOW() - INTERVAL '24 hours'`, [challengeId]);

    // Password changed count
    const pwChanged = await db.query(
      `SELECT COUNT(*) as cnt FROM trading_registrations WHERE challenge_id=$1 AND pull_status='password_changed'`, [challengeId]);

    // Above target
    const aboveTarget = await db.query(
      `SELECT COUNT(*) as cnt
       FROM wp_leaderboard l
       JOIN trading_challenges tc ON tc.id = l.challenge_id
       JOIN trading_registrations r ON r.id = l.registration_id
       WHERE l.challenge_id=$1
         AND (r.disqualified IS NULL OR r.disqualified = false)
         AND (r.status IS NULL OR r.status != 'removed')
         AND l.adjusted_balance >= tc.target_balance`, [challengeId]);

    // Balance stats — gross account balance across ALL participants in USD.
    //
    // Uses a unified source per participant:
    //   - If the participant has a leaderboard entry: use current_balance (gross balance
    //     = actualStartBalance + sum of ALL trade profits before any rule deductions)
    //   - Otherwise: use last_known_balance from registration (balance at last VPS verify/pull)
    //
    // This ensures ALL participants are counted regardless of leaderboard state.
    // is_cent always read from trading_registrations (source of truth).
    // Cent balances divided by 100 → always displays in USD.
    const balanceStats = await db.query(
      `SELECT
        COUNT(*) as participant_count,
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
         AND r.investor_password IS NOT NULL`,
      [challengeId]
    );

    // Latest screening
    const latestScreening = await db.query(
      `SELECT * FROM trading_screening_results WHERE challenge_id=$1 ORDER BY created_at DESC LIMIT 1`, [challengeId]);

    const c = counts.rows[0];
    const t = tradeStats.rows[0];
    const p = pullStats.rows[0];
    const b = balanceStats.rows[0];

    const totalBalance = parseFloat(b.total_balance);
    const realBalance  = parseFloat(b.real_balance);
    const demoBalance  = parseFloat(b.demo_balance);

    // Last pull time
    const lastPull = await db.query(
      `SELECT completed_at FROM wp_pull_batches WHERE challenge_id=$1 AND status='completed' ORDER BY completed_at DESC LIMIT 1`, [challengeId]);

    // === ADDITIONAL METRICS ===
    // Max profit per trade (single best trade)
    const maxProfitTrade = await db.query(
      `SELECT t.profit, t.symbol, t.ticket, r.nickname, r.username, r.email
       FROM wp_trades t JOIN trading_registrations r ON t.registration_id = r.id
       WHERE t.challenge_id = $1 AND t.is_qualified = true${tradeFilter.replace(/\$2/g, '$2').replace(/\$3/g, '$3')}
       ORDER BY t.profit DESC LIMIT 1`, tradeParams.length > 1 ? tradeParams : [challengeId]
    );

    // Best win rate — qualified (from qualified trades only) and overall
    const bestWinRate = await db.query(
      `SELECT r.nickname, r.username, r.email, l.qualified_trades, l.total_trades, l.flagged_trades,
              CASE WHEN l.total_trades > 0 THEN ROUND((l.qualified_trades::numeric / l.total_trades) * 100) ELSE 0 END as win_rate,
              CASE WHEN (l.total_trades - l.flagged_trades) > 0
                THEN ROUND(
                  (SELECT COUNT(*)::numeric FROM wp_trades t
                   WHERE t.registration_id = l.registration_id AND t.challenge_id = $1
                     AND t.is_qualified = true AND t.profit > 0${tradeFilter})
                  / (l.total_trades - l.flagged_trades) * 100)
                ELSE 0 END as qualified_win_rate
       FROM wp_leaderboard l JOIN trading_registrations r ON l.registration_id = r.id
       WHERE l.challenge_id = $1 AND l.total_trades >= 5 AND r.disqualified = false
       ORDER BY qualified_win_rate DESC, win_rate DESC, l.total_trades DESC LIMIT 1`, tradeParams.length > 1 ? tradeParams : [challengeId]
    );

    // Most traded pair (within challenge period only)
    const mostTradedPair = await db.query(
      `SELECT symbol, COUNT(*) as trade_count, COALESCE(SUM(volume), 0) as total_lots
       FROM wp_trades WHERE challenge_id = $1${tradeFilter}
       GROUP BY symbol ORDER BY trade_count DESC LIMIT 1`, tradeParams.length > 1 ? tradeParams : [challengeId]
    );

    // Least traded pair (within challenge period only, min 1 trade)
    const leastTradedPair = await db.query(
      `SELECT symbol, COUNT(*) as trade_count, COALESCE(SUM(volume), 0) as total_lots
       FROM wp_trades WHERE challenge_id = $1${tradeFilter}
       GROUP BY symbol ORDER BY trade_count ASC LIMIT 1`, tradeParams.length > 1 ? tradeParams : [challengeId]
    );

    // Blown accounts (equity <= 0 or zero_balance_at set)
    const blownAccounts = await db.query(
      `SELECT COUNT(*) as cnt FROM wp_leaderboard
       WHERE challenge_id = $1 AND zero_balance_at IS NOT NULL`, [challengeId]
    );

    // Most active day (day with most trades)
    const mostActiveDay = await db.query(
      `SELECT DATE(close_time) as day, COUNT(*) as trade_count
       FROM wp_trades WHERE challenge_id = $1${tradeFilter}
       GROUP BY DATE(close_time) ORDER BY trade_count DESC LIMIT 1`, tradeParams.length > 1 ? tradeParams : [challengeId]
    );

    // Least active day (day with fewest trades, excluding days with 0)
    const leastActiveDay = await db.query(
      `SELECT DATE(close_time) as day, COUNT(*) as trade_count
       FROM wp_trades WHERE challenge_id = $1${tradeFilter}
       GROUP BY DATE(close_time) ORDER BY trade_count ASC LIMIT 1`, tradeParams.length > 1 ? tradeParams : [challengeId]
    );

    // Avg trades per user
    const avgTradesPerUser = await db.query(
      `SELECT ROUND(AVG(total_trades), 1) as avg_trades FROM wp_leaderboard WHERE challenge_id = $1 AND total_trades > 0`, [challengeId]
    );

    // Max loss (worst single trade)
    const maxLossTrade = await db.query(
      `SELECT t.profit, t.symbol, r.nickname, r.username
       FROM wp_trades t JOIN trading_registrations r ON t.registration_id = r.id
       WHERE t.challenge_id = $1${tradeFilter}
       ORDER BY t.profit ASC LIMIT 1`, tradeParams.length > 1 ? tradeParams : [challengeId]
    );

    return res.json({
      participants: { total: parseInt(c.total), demo: parseInt(c.demo), real: parseInt(c.real), disqualified: parseInt(c.disqualified) },
      trades: { total: parseInt(t.total_trades), totalVolume: parseFloat(t.total_volume), violations: parseInt(t.violations) },
      pulls: { today: parseInt(p.pulls_today), success: parseInt(p.total_success), failed: parseInt(p.total_failed), newTrades: parseInt(p.new_trades), passwordChanged: parseInt(pwChanged.rows[0].cnt), lastPullAt: lastPull.rows[0]?.completed_at || null },
      balance: { total: totalBalance, real: realBalance, demo: demoBalance },
      qualified: parseInt(aboveTarget.rows[0].cnt),
      latestScreening: latestScreening.rows[0] || null,
      metrics: {
        maxProfitTrade: maxProfitTrade.rows[0] ? { profit: parseFloat(maxProfitTrade.rows[0].profit), symbol: maxProfitTrade.rows[0].symbol, nickname: maxProfitTrade.rows[0].nickname, username: maxProfitTrade.rows[0].username, email: maxProfitTrade.rows[0].email } : null,
        bestWinRate: bestWinRate.rows[0] ? { qualifiedWinRate: parseInt(bestWinRate.rows[0].qualified_win_rate || '0'), overallWinRate: parseInt(bestWinRate.rows[0].win_rate), nickname: bestWinRate.rows[0].nickname, username: bestWinRate.rows[0].username, email: bestWinRate.rows[0].email, trades: parseInt(bestWinRate.rows[0].total_trades) } : null,
        mostTradedPair: mostTradedPair.rows[0] ? { symbol: mostTradedPair.rows[0].symbol, tradeCount: parseInt(mostTradedPair.rows[0].trade_count), totalLots: parseFloat(mostTradedPair.rows[0].total_lots) } : null,
        leastTradedPair: leastTradedPair.rows[0] ? { symbol: leastTradedPair.rows[0].symbol, tradeCount: parseInt(leastTradedPair.rows[0].trade_count), totalLots: parseFloat(leastTradedPair.rows[0].total_lots) } : null,
        blownAccounts: parseInt(blownAccounts.rows[0]?.cnt || '0'),
        mostActiveDay: mostActiveDay.rows[0] ? { day: mostActiveDay.rows[0].day, tradeCount: parseInt(mostActiveDay.rows[0].trade_count) } : null,
        leastActiveDay: leastActiveDay.rows[0] ? { day: leastActiveDay.rows[0].day, tradeCount: parseInt(leastActiveDay.rows[0].trade_count) } : null,
        avgTradesPerUser: parseFloat(avgTradesPerUser.rows[0]?.avg_trades || '0'),
        maxLossTrade: maxLossTrade.rows[0] ? { profit: parseFloat(maxLossTrade.rows[0].profit), symbol: maxLossTrade.rows[0].symbol, nickname: maxLossTrade.rows[0].nickname, username: maxLossTrade.rows[0].username } : null,
      },
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/screening
 * Allocation/partner screening history
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/screening`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);

    const results = await db.query(
      `SELECT * FROM trading_screening_results WHERE challenge_id=$1 ORDER BY created_at DESC LIMIT 30`, [challengeId]);

    // Currently changing/warned users
    const changing = await db.query(
      `SELECT username, email, account_number, account_type, partner_status, partner_warned_at FROM trading_registrations WHERE challenge_id=$1 AND partner_status='CHANGING' AND disqualified=false ORDER BY partner_warned_at DESC`, [challengeId]);

    // Disqualified due to partner change
    const disqualified = await db.query(
      `SELECT username, email, account_number, account_type, disqualified_at, disqualified_reason FROM trading_registrations WHERE challenge_id=$1 AND disqualified=true AND disqualified_reason LIKE '%Partner%' ORDER BY disqualified_at DESC`, [challengeId]);

    return res.json({
      screeningHistory: results.rows.map(r => ({
        date: r.screening_date,
        mode: r.screening_mode,
        totalScreened: r.total_screened,
        allGood: r.all_good,
        changingReal: r.changing_real,
        changingDemo: r.changing_demo,
        leftReal: r.left_real,
        leftDemo: r.left_demo,
        warningsCleared: r.warnings_cleared,
        reportSent: r.report_sent,
        createdAt: r.created_at,
        changingUsers: r.changing_users || [],
        leftUsers: r.left_users || [],
      })),
      currentlyChanging: changing.rows,
      disqualifiedPartners: disqualified.rows,
    });
  } catch (error) {
    console.error('Admin screening error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/pulls
 * Pull batch history
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/pulls`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);

    // Pull batch history
    const batches = await db.query(
      `SELECT id, started_at, completed_at, total_accounts, successful, failed, new_trades_found, status, error_log
       FROM wp_pull_batches WHERE challenge_id=$1 ORDER BY started_at DESC LIMIT 50`,
      [challengeId]
    );

    // Terminal stats for the most recent batch (if any)
    let terminalStats: any[] = [];
    if (batches.rows.length > 0) {
      const latestBatchId = batches.rows[0].id;
      const statsExist = await db.query(
        `SELECT to_regclass('wp_terminal_stats') AS tbl`
      );
      if (statsExist.rows[0]?.tbl) {
        const tsResult = await db.query(
          `SELECT terminal_id, total_processed, total_success, total_failed, is_healthy
           FROM wp_terminal_stats WHERE pull_batch_id = $1 ORDER BY terminal_id ASC`,
          [latestBatchId]
        );
        terminalStats = tsResult.rows;
      }
    }

    // SL check failures — live from wp_trades (sl_check_pending=true or check_failed)
    let slFailures: any[] = [];
    const slResult = await db.query(
      `SELECT r.id as registration_id, r.account_number, r.nickname, r.username, r.account_subtype,
              COUNT(t.id) FILTER (WHERE t.sl_check_pending = true) as trades_pending,
              COUNT(t.id) FILTER (WHERE t.sl_check_result = 'check_failed') as trades_failed,
              MAX(t.sl_check_attempts) as max_attempts,
              MAX(t.close_time) as last_seen
       FROM trading_registrations r
       JOIN wp_trades t ON t.registration_id = r.id AND t.challenge_id = $1
         AND (t.sl_check_pending = true OR t.sl_check_result = 'check_failed')
       WHERE r.challenge_id = $1
       GROUP BY r.id, r.account_number, r.nickname, r.username, r.account_subtype
       ORDER BY MAX(t.close_time) DESC`,
      [challengeId]
    );
    // For each account, fetch the specific pending/failed trade details
    for (const r of slResult.rows) {
      const tradesDetail = await db.query(
        `SELECT ticket, symbol, open_time, close_time, profit, sl_check_result, sl_check_attempts,
                EXTRACT(EPOCH FROM (close_time - open_time)) as duration_seconds
         FROM wp_trades
         WHERE challenge_id = $1 AND registration_id = $2
           AND (sl_check_pending = true OR sl_check_result = 'check_failed')
         ORDER BY close_time DESC LIMIT 5`,
        [challengeId, r.registration_id]
      );
      const trades = tradesDetail.rows.map((t: any) => {
        const durationSec = parseInt(t.duration_seconds || '0');
        let reason = 'No OHLC candle data available for this trade\'s time range';
        if (durationSec < 120) reason = `Trade too short (${durationSec}s) — no intermediate candles to verify`;
        else if (t.sl_check_result === 'check_failed') reason = `Candle check failed after ${t.sl_check_attempts} attempts — penalty applied`;
        return {
          ticket: t.ticket,
          symbol: t.symbol,
          openTime: t.open_time,
          closeTime: t.close_time,
          profit: parseFloat(t.profit),
          durationSeconds: durationSec,
          status: t.sl_check_result,
          attempts: parseInt(t.sl_check_attempts || '0'),
          reason,
        };
      });
      slFailures.push({
        registration_id: r.registration_id,
        account_number: r.account_number,
        nickname: r.nickname || r.account_number,
        username: r.username,
        account_subtype: r.account_subtype,
        trades_unchecked: parseInt(r.trades_pending || '0'),
        trades_failed: parseInt(r.trades_failed || '0'),
        max_attempts: parseInt(r.max_attempts || '0'),
        last_seen: r.last_seen,
        trades,
      });
    }

    return res.json({ pulls: batches.rows, terminalStats, slFailures });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/vps-health
 * Full VPS health check — pings VPS server, returns terminal & worker status
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/vps-health`, adminIpCheck, async (req, res) => {
  try {
    const vpsUrl = config.vpsApiUrl;
    if (!vpsUrl) {
      return res.json({
        vps: { reachable: false, error: 'VPS_API_URL not configured in Railway environment variables' },
        pullStats: { last5Batches: [], last24h: { batches: 0, totalSuccess: 0, totalFailed: 0, successRate: 0 }, errors24h: [], passwordChangedPending: 0 },
      });
    }

    const axios = require('axios');

    // Ping VPS health endpoint
    let vpsStatus: any = { reachable: false };
    try {
      const healthRes = await axios.get(`${vpsUrl}/health`, {
        headers: { 'X-API-Key': config.vpsApiKey },
        timeout: 15000,
      });
      vpsStatus = {
        reachable: true,
        status: healthRes.data?.status || 'unknown',
        terminals: healthRes.data?.terminals || null,
        workers: healthRes.data?.workers || null,
        uptime: healthRes.data?.uptime || null,
        version: healthRes.data?.version || null,
        queue: healthRes.data?.queue || null,
        healthy_terminals: healthRes.data?.healthy_terminals || [],
        unhealthy_terminals: healthRes.data?.unhealthy_terminals || [],
        raw: healthRes.data,
      };
    } catch (vpsErr: any) {
      vpsStatus = {
        reachable: false,
        error: vpsErr.code === 'ECONNABORTED' ? 'Timeout (10s)' : (vpsErr.message || 'Connection failed'),
      };
    }

    // Deep terminal check: verify base account on each terminal (1-10) sequentially
    // Sequential (not Promise.all) to avoid hammering the VPS with 10 concurrent logins
    let terminalResults: any[] = [];
    if (vpsStatus.reachable && req.query.deep === 'true') {
      const BASE_ACCOUNT = config.vpsBaseAccount || '435924397';
      const BASE_SERVER = config.vpsBaseServer || 'Exness-MT5Trial9';
      const BASE_PASSWORD = config.vpsBasePassword || 'Abc@1234';

      for (let tid = 1; tid <= 10; tid++) {
        try {
          const verifyRes = await axios.post(`${vpsUrl}/verify`, {
            account: BASE_ACCOUNT,
            server: BASE_SERVER,
            password: BASE_PASSWORD,
            api_key: config.vpsApiKey,
            terminal_id: tid,
          }, { timeout: 35000 });

          const data = verifyRes.data;
          terminalResults.push({
            terminal: tid,
            success: data.success || false,
            balance: data.balance,
            currency: data.currency,
            error: data.success ? null : (data.message || 'Unknown error'),
          });
        } catch (err: any) {
          terminalResults.push({
            terminal: tid,
            success: false,
            error: err.code === 'ECONNABORTED' ? 'Timeout (20s)' : (err.message || 'Connection failed'),
          });
        }
      }
    }

    const successCount = terminalResults.filter(t => t.success).length;
    const failedTerminals = terminalResults.filter(t => !t.success);

    // Get recent pull stats from DB
    const recentPulls = await db.query(
      `SELECT * FROM wp_pull_batches ORDER BY started_at DESC LIMIT 5`
    );

    // Get error breakdown (last 24h)
    const errors = await db.query(
      `SELECT error_code, COUNT(*) as cnt FROM wp_pull_errors WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY error_code ORDER BY cnt DESC`
    );

    // Get password-changed count
    const pwChanged = await db.query(
      `SELECT COUNT(*) as cnt FROM trading_registrations WHERE pull_status = 'password_changed' AND disqualified = false`
    );

    // Calculate 24h success rate
    const stats24h = await db.query(
      `SELECT COALESCE(SUM(successful),0) as total_success, COALESCE(SUM(failed),0) as total_failed, COUNT(*) as batches FROM wp_pull_batches WHERE started_at > NOW() - INTERVAL '24 hours'`
    );
    const s = stats24h.rows[0];
    const totalAttempts = parseInt(s.total_success) + parseInt(s.total_failed);
    const successRate = totalAttempts > 0 ? ((parseInt(s.total_success) / totalAttempts) * 100).toFixed(1) : '0';

    return res.json({
      vps: vpsStatus,
      deepCheck: terminalResults.length > 0 ? {
        summary: `${successCount}/10 terminals working`,
        results: terminalResults,
        failed: failedTerminals,
      } : null,
      pullStats: {
        last5Batches: recentPulls.rows.map((b: any) => ({
          id: b.id,
          startedAt: b.started_at,
          completedAt: b.completed_at,
          totalAccounts: b.total_accounts,
          successful: b.successful,
          failed: b.failed,
          newTrades: b.new_trades_found,
          status: b.status,
          durationSec: b.completed_at ? Math.round((new Date(b.completed_at).getTime() - new Date(b.started_at).getTime()) / 1000) : null,
        })),
        last24h: {
          batches: parseInt(s.batches),
          totalSuccess: parseInt(s.total_success),
          totalFailed: parseInt(s.total_failed),
          successRate: parseFloat(successRate),
        },
        errors24h: errors.rows.map((e: any) => ({ code: e.error_code, count: parseInt(e.cnt) })),
        passwordChangedPending: parseInt(pwChanged.rows[0].cnt),
      },
    });
  } catch (error) {
    console.error('VPS health check error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/finduser?q=search
 * Search user by username, email, account number, or telegram ID
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/finduser`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const q = (req.query.q as string || '').trim().toLowerCase().replace(/^@/, '');

    if (!q) return res.status(400).json({ error: 'Search query required' });

    const result = await db.query(
      `SELECT r.id, r.nickname, r.username, r.email, r.user_id, r.account_number,
              r.account_type, r.mt5_server, r.registered_at, r.last_pull_at, r.pull_status,
              r.partner_status, r.disqualified, r.disqualified_reason, r.is_cent,
              r.registration_balance, r.last_known_balance,
              l.rank, l.current_balance, l.adjusted_balance, l.qualified_profit, l.gross_profit,
              l.profit_removed, l.total_trades, l.qualified_trades, l.flagged_trades, l.active_days,
              l.is_qualified, l.last_trade_time, l.last_updated as lb_updated
       FROM trading_registrations r
       LEFT JOIN wp_leaderboard l ON r.id = l.registration_id
       WHERE r.challenge_id = $1 AND (
         LOWER(r.username) = $2 OR LOWER(r.email) = $2 OR r.account_number = $2
         OR CAST(r.user_id AS TEXT) = $2 OR LOWER(r.nickname) = $2
       )
       LIMIT 1`,
      [challengeId, q]
    );

    if (result.rows.length === 0) {
      return res.json({ found: false });
    }

    const r = result.rows[0];

    // Get recent trades — scoped to challenge period
    const challengeDatesLookup = await db.query(
      `SELECT start_date, end_date FROM trading_challenges WHERE id = $1`, [challengeId]
    );
    const lookupStart = challengeDatesLookup.rows[0]?.start_date;
    const lookupEnd   = challengeDatesLookup.rows[0]?.end_date;
    let lookupTradesQuery = `SELECT symbol, trade_type, volume, profit, close_time, is_qualified, violations
       FROM wp_trades WHERE challenge_id = $1 AND registration_id = $2`;
    const lookupTradesParams: any[] = [challengeId, r.id];
    if (lookupStart) {
      const graceStart = new Date(new Date(lookupStart).getTime() - 3 * 60 * 60 * 1000);
      lookupTradesQuery += ` AND close_time >= $${lookupTradesParams.length + 1}`;
      lookupTradesParams.push(graceStart.toISOString());
    }
    if (lookupEnd) {
      const graceEnd = new Date(new Date(lookupEnd).getTime() + 27 * 60 * 60 * 1000);
      lookupTradesQuery += ` AND close_time <= $${lookupTradesParams.length + 1}`;
      lookupTradesParams.push(graceEnd.toISOString());
    }
    lookupTradesQuery += ` ORDER BY close_time DESC LIMIT 10`;
    const trades = await db.query(lookupTradesQuery, lookupTradesParams);

    return res.json({
      found: true,
      user: {
        id: r.id,
        nickname: r.nickname,
        username: r.username,
        email: r.email,
        telegramId: r.user_id,
        accountNumber: r.account_number,
        accountType: r.account_type,
        server: r.mt5_server,
        registeredAt: r.registered_at,
        rank: r.rank || null,
        isCent: r.is_cent || false,
        balance: r.current_balance != null
          ? parseFloat(r.current_balance)
          : r.last_known_balance != null
            ? parseFloat(r.last_known_balance)
            : r.registration_balance != null
              ? parseFloat(r.registration_balance)
              : null,
        qualifiedProfit: r.qualified_profit != null ? parseFloat(r.qualified_profit) : 0,
        grossProfit: r.gross_profit != null ? parseFloat(r.gross_profit) : 0,
        profitRemoved: r.profit_removed != null ? parseFloat(r.profit_removed) : 0,
        totalTrades: r.total_trades || 0,
        qualifiedTrades: r.qualified_trades || 0,
        flaggedTrades: r.flagged_trades || 0,
        activeDays: r.active_days || 0,
        isQualified: r.is_qualified || false,
        lastPull: r.last_pull_at,
        pullStatus: r.pull_status,
        partnerStatus: r.partner_status || 'OK',
        disqualified: r.disqualified,
        disqualifiedReason: r.disqualified_reason,
        recentTrades: trades.rows.map((t: any) => ({
          symbol: t.symbol,
          type: t.trade_type,
          profit: parseFloat(t.profit),
          volume: parseFloat(t.volume),
          date: t.close_time,
          isQualified: t.is_qualified,
          violations: t.violations || [],
        })),
      },
    });
  } catch (error) {
    console.error('Admin finduser error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/violations
 * All violations grouped by user
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/violations`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
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

// ==================== ADMIN: CHALLENGE CRUD ====================

/**
 * POST /api/admin/:secretPath/challenges
 * Create a new trading challenge
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenges`, adminIpCheck, async (req, res) => {
  try {
    const {
      title, type, source, team_only,
      start_date, end_date, registration_deadline,
      starting_balance, target_balance,
      prize_pool_text, real_winners_count, demo_winners_count,
      real_prizes, demo_prizes, pdf_url, video_url,
      evaluation_type, pull_times, pull_interval_hours, first_pull_time,
    } = req.body;

    if (!title || !type || !start_date || !end_date || !starting_balance) {
      return res.status(400).json({ error: 'Missing required fields: title, type, start_date, end_date, starting_balance' });
    }
    if (!['demo', 'real', 'hybrid'].includes(type)) {
      return res.status(400).json({ error: 'Type must be demo, real, or hybrid' });
    }
    const evalType = evaluation_type === 'legacy' ? 'legacy' : 'winnerpip';

    const result = await db.query(
      `INSERT INTO trading_challenges
       (title, type, status, start_date, end_date, registration_deadline, starting_balance, target_balance,
        prize_pool_text, real_winners_count, demo_winners_count, real_prizes, demo_prizes,
        pdf_url, video_url, source, team_only, announcement_posted, evaluation_type,
        pull_times, pull_interval_hours, first_pull_time)
       VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, false, $17, $18, $19, $20)
       RETURNING *`,
      [
        title, type, start_date, end_date,
        registration_deadline || end_date,
        starting_balance, target_balance || 0,
        prize_pool_text || '', real_winners_count || 0, demo_winners_count || 0,
        JSON.stringify(real_prizes || []), JSON.stringify(demo_prizes || []),
        pdf_url || null, video_url || null,
        source || 'telegram', team_only || false,
        evalType,
        JSON.stringify(pull_times || ['00:00','04:00','08:00','12:00','16:00','20:00']),
        pull_interval_hours || 4,
        first_pull_time || '00:00',
      ]
    );

    return res.json({ success: true, challenge: result.rows[0] });
  } catch (error) {
    console.error('Admin create challenge error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/admin/:secretPath/challenge/:id/status
 * Update challenge status
 */
app.patch(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/status`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const { status } = req.body;
    const valid = ['draft', 'registration_open', 'active', 'submission_open', 'reviewing', 'completed'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be: ${valid.join(', ')}` });
    }
    await db.query(`UPDATE trading_challenges SET status = $1, updated_at = NOW() WHERE id = $2`, [status, challengeId]);
    return res.json({ success: true, status });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/:secretPath/challenge/:id
 * Soft-delete a challenge
 */
app.delete(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const existing = await db.query(`SELECT title FROM trading_challenges WHERE id = $1`, [challengeId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Challenge not found' });

    await db.query(`UPDATE trading_challenges SET status = 'deleted', updated_at = NOW() WHERE id = $1`, [challengeId]);
    return res.json({ success: true, message: `"${existing.rows[0].title}" deleted` });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/:secretPath/challenge/:id/announce
 * Mark challenge as announced and change status to registration_open
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/announce`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    await db.query(
      `UPDATE trading_challenges SET status = 'registration_open', announcement_posted = true, updated_at = NOW() WHERE id = $1`,
      [challengeId]
    );

    // Get challenge data for announcement
    const challengeResult = await db.query(`SELECT * FROM trading_challenges WHERE id = $1`, [challengeId]);
    const challenge = challengeResult.rows[0];
    if (!challenge) return res.json({ success: true, message: 'Challenge announced' });

    if (challenge.source === 'discord') {
      // Always reset to pending so Discord bot re-posts (handles deleted announcements)
      await db.query(
        `UPDATE trading_challenges SET discord_channel_message_id = 'pending_announce' WHERE id = $1`,
        [challengeId]
      ).catch(() => {});
      return res.json({ success: true, message: 'Registration opened. Discord bot will post the announcement with Register button shortly.' });
    } else {
      // Post Telegram announcement to both channels
      try {
        const toEAT = (d: Date) => new Date(new Date(d).getTime() + 3 * 60 * 60 * 1000);
        const startStr = toEAT(challenge.start_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
        const endStr = toEAT(challenge.end_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

        // Check if cent account challenge
        const rulesCheck = await db.query(`SELECT parameters FROM wp_challenge_rules WHERE challenge_id = $1 AND rule_code = 'config'`, [challengeId]);
        const isCent = rulesCheck.rows[0]?.parameters?.only_cent_account && challenge.type !== 'demo';
        const balUnit = isCent ? '¢' : '';
        const balPrefix = isCent ? '' : '$';
        const centNote = isCent ? '\n📋 <b>Cent Account Only</b>' : '';

        let prizeText = '';
        if (challenge.prize_pool_text) prizeText = `\n🏆 <b>${challenge.prize_pool_text}</b>`;

        let links = '';
        if (challenge.pdf_url) links += `\n📄 Rules: <a href="${challenge.pdf_url}">Download PDF</a>`;
        if (challenge.video_url) links += `\n🎥 Guide: <a href="${challenge.video_url}">Watch Video</a>`;

        const text = `<b>🎯 NEW CHALLENGE — Registration Open!</b>\n\n` +
          `<b>${challenge.title}</b>\n\n` +
          `A new trading challenge is here. Think you've got what it takes?${centNote}\n\n` +
          `💰 <b>Starting Balance:</b> ${balPrefix}${challenge.starting_balance}${balUnit}\n` +
          `🎯 <b>Target:</b> ${balPrefix}${challenge.target_balance}${balUnit}\n` +
          `📅 <b>Start:</b> ${startStr}\n` +
          `🏁 <b>End:</b> ${endStr}\n` +
          prizeText + links +
          `\n\n👉 <b>Tap "Join Challenge" below to register!</b>`;

        const { Markup } = require('telegraf');
        const botToken = process.env.BOT_TOKEN;
        const { Telegraf } = require('telegraf');
        const tempBot = new Telegraf(botToken);
        const botInfo = await tempBot.telegram.getMe();

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.url('🚀 Join Challenge', `https://t.me/${botInfo.username}?start=tc_register_${challengeId}`)],
          [Markup.button.url('💰 Open Exness Account', config.exnessPartnerSignupLink)],
        ]);

        const opts = { parse_mode: 'HTML' as const, ...keyboard, link_preview_options: { is_disabled: true } };
        await tempBot.telegram.sendMessage(config.mainChannelId, text, opts);
        await tempBot.telegram.sendMessage(config.challengeChannelId, text, opts);
      } catch (e) {
        console.error('Telegram announce error:', e);
      }
    }

    return res.json({ success: true, message: 'Challenge announced and registration opened' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/:secretPath/challenge/:id
 * Update challenge details (title, dates, prizes, etc.)
 */
app.put(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const fields = req.body;
    const allowed = ['title', 'type', 'start_date', 'end_date', 'starting_balance', 'target_balance',
      'prize_pool_text', 'real_winners_count', 'demo_winners_count', 'real_prizes', 'demo_prizes',
      'pdf_url', 'video_url', 'source', 'team_only'];

    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        const val = (key === 'real_prizes' || key === 'demo_prizes') ? JSON.stringify(fields[key]) : fields[key];
        sets.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
    }

    if (sets.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    sets.push(`updated_at = NOW()`);
    values.push(challengeId);

    await db.query(`UPDATE trading_challenges SET ${sets.join(', ')} WHERE id = $${idx}`, values);
    return res.json({ success: true });
  } catch (error) {
    console.error('Admin update challenge error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/export
 * Export registrations as JSON (frontend converts to CSV)
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/export`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const result = await db.query(
      `SELECT r.nickname, r.username, r.email, r.account_number, r.account_type, r.mt5_server,
              r.registered_at, r.disqualified, r.disqualified_reason, r.source,
              l.rank, l.current_balance, l.qualified_profit, l.total_trades, l.flagged_trades, l.is_qualified
       FROM trading_registrations r
       LEFT JOIN wp_leaderboard l ON r.id = l.registration_id
       WHERE r.challenge_id = $1 AND (r.status IS NULL OR r.status != 'removed')
       ORDER BY l.rank ASC NULLS LAST, r.registered_at ASC`,
      [challengeId]
    );
    return res.json({ registrations: result.rows });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/user-trades-mt5?registration_id=X
 * Export user's trades in MT5 format (same columns as MT5 History export)
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/user-trades-mt5`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const registrationId = parseInt(req.query.registration_id as string);
    if (!registrationId) return res.status(400).json({ error: 'registration_id required' });

    // Get user info + challenge info first so we can apply date filter
    const reg = await db.query(
      `SELECT r.nickname, r.account_number, r.mt5_server, r.account_type, r.is_cent,
              c.title, c.start_date, c.end_date
       FROM trading_registrations r
       JOIN trading_challenges c ON r.challenge_id = c.id
       WHERE r.id = $1`,
      [registrationId]
    );
    const user = reg.rows[0] || {};

    let mt5TradesQuery = `SELECT ticket, symbol, trade_type, volume, open_time, close_time,
              open_price, close_price, stop_loss, take_profit,
              profit, commission, swap, comment, is_qualified, violations
       FROM wp_trades WHERE challenge_id = $1 AND registration_id = $2`;
    const mt5TradesParams: any[] = [challengeId, registrationId];
    if (user.start_date) {
      const graceStart = new Date(new Date(user.start_date).getTime() - 3 * 60 * 60 * 1000);
      mt5TradesQuery += ` AND close_time >= $${mt5TradesParams.length + 1}`;
      mt5TradesParams.push(graceStart.toISOString());
    }
    if (user.end_date) {
      const graceEnd = new Date(new Date(user.end_date).getTime() + 27 * 60 * 60 * 1000);
      mt5TradesQuery += ` AND close_time <= $${mt5TradesParams.length + 1}`;
      mt5TradesParams.push(graceEnd.toISOString());
    }
    mt5TradesQuery += ` ORDER BY open_time ASC`;
    const trades = await db.query(mt5TradesQuery, mt5TradesParams);

    // Compute MT5-style results
    const positions = trades.rows;
    const grossProfit = positions.filter((t: any) => parseFloat(t.profit) > 0).reduce((s: number, t: any) => s + parseFloat(t.profit), 0);
    const grossLoss = positions.filter((t: any) => parseFloat(t.profit) < 0).reduce((s: number, t: any) => s + parseFloat(t.profit), 0);
    const totalNetProfit = grossProfit + grossLoss;
    const profitFactor = grossLoss !== 0 ? Math.abs(grossProfit / grossLoss) : 0;
    const totalTrades = positions.length;
    const profitTrades = positions.filter((t: any) => parseFloat(t.profit) > 0).length;
    const lossTrades = positions.filter((t: any) => parseFloat(t.profit) <= 0).length;
    const shortTrades = positions.filter((t: any) => t.trade_type?.toLowerCase() === 'sell');
    const longTrades = positions.filter((t: any) => t.trade_type?.toLowerCase() === 'buy');
    const shortWon = shortTrades.filter((t: any) => parseFloat(t.profit) > 0).length;
    const longWon = longTrades.filter((t: any) => parseFloat(t.profit) > 0).length;
    const largestProfit = positions.length > 0 ? Math.max(...positions.map((t: any) => parseFloat(t.profit))) : 0;
    const largestLoss = positions.length > 0 ? Math.min(...positions.map((t: any) => parseFloat(t.profit))) : 0;
    const avgProfit = profitTrades > 0 ? grossProfit / profitTrades : 0;
    const avgLoss = lossTrades > 0 ? grossLoss / lossTrades : 0;

    return res.json({
      header: {
        title: 'Trade History Report',
        name: user.nickname || '',
        account: `${user.account_number} (${user.is_cent ? 'USC' : 'USD'}, ${user.mt5_server}, ${user.account_type}, Hedge)`,
        company: 'Exness Technologies Ltd',
        date: new Date().toISOString().split('T')[0].replace(/-/g, '.'),
        challenge: user.title || '',
        period: `${user.start_date ? new Date(user.start_date).toISOString().split('T')[0] : ''} to ${user.end_date ? new Date(user.end_date).toISOString().split('T')[0] : ''}`,
      },
      positions: positions.map((t: any) => ({
        Time: t.open_time,
        Position: t.ticket,
        Symbol: t.symbol,
        Type: t.trade_type,
        Volume: parseFloat(t.volume),
        Price: parseFloat(t.open_price),
        'S / L': t.stop_loss ? parseFloat(t.stop_loss) : '',
        'T / P': t.take_profit ? parseFloat(t.take_profit) : '',
        'Close Time': t.close_time,
        'Close Price': parseFloat(t.close_price),
        Commission: parseFloat(t.commission || 0),
        Swap: parseFloat(t.swap || 0),
        Profit: parseFloat(t.profit),
        Comment: t.comment || '',
      })),
      results: {
        'Total Net Profit': totalNetProfit.toFixed(2),
        'Gross Profit': grossProfit.toFixed(2),
        'Gross Loss': grossLoss.toFixed(2),
        'Profit Factor': profitFactor.toFixed(2),
        'Total Trades': totalTrades,
        'Short Trades (won %)': `${shortTrades.length} (${shortTrades.length > 0 ? ((shortWon / shortTrades.length) * 100).toFixed(1) : 0}%)`,
        'Long Trades (won %)': `${longTrades.length} (${longTrades.length > 0 ? ((longWon / longTrades.length) * 100).toFixed(1) : 0}%)`,
        'Profit Trades (% of total)': `${profitTrades} (${totalTrades > 0 ? ((profitTrades / totalTrades) * 100).toFixed(1) : 0}%)`,
        'Loss Trades (% of total)': `${lossTrades} (${totalTrades > 0 ? ((lossTrades / totalTrades) * 100).toFixed(1) : 0}%)`,
        'Largest profit trade': largestProfit.toFixed(2),
        'Largest loss trade': largestLoss.toFixed(2),
        'Average profit trade': avgProfit.toFixed(2),
        'Average loss trade': avgLoss.toFixed(2),
      },
      evaluation: {
        qualified: positions.filter((t: any) => t.is_qualified).length,
        flagged: positions.filter((t: any) => !t.is_qualified).length,
        profitRemoved: positions.filter((t: any) => !t.is_qualified && parseFloat(t.profit) > 0).reduce((s: number, t: any) => s + parseFloat(t.profit), 0).toFixed(2),
        violations: positions.filter((t: any) => !t.is_qualified).map((t: any) => ({
          ticket: t.ticket, symbol: t.symbol, profit: parseFloat(t.profit),
          reasons: t.violations || [],
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/user-trades-xlsx?registration_id=X
 * Export user's trades as a proper MT5-style .xlsx file with Header, Positions, Deals, Results sections
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/user-trades-xlsx`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const registrationId = parseInt(req.query.registration_id as string);
    if (!registrationId) return res.status(400).json({ error: 'registration_id required' });

    const trades = await db.query(
      `SELECT ticket, symbol, trade_type, volume, open_time, close_time,
              open_price, close_price, stop_loss, take_profit,
              profit, commission, swap, comment, is_qualified, violations
       FROM wp_trades WHERE challenge_id = $1 AND registration_id = $2
       ORDER BY open_time ASC`,
      [challengeId, registrationId]
    );

    const reg = await db.query(
      `SELECT r.nickname, r.account_number, r.mt5_server, r.account_type, r.is_cent,
              c.title, c.start_date, c.end_date
       FROM trading_registrations r
       JOIN trading_challenges c ON r.challenge_id = c.id
       WHERE r.id = $1`,
      [registrationId]
    );
    const user = reg.rows[0] || {};
    const positions = trades.rows;

    // Compute results
    const grossProfit = positions.filter((t: any) => parseFloat(t.profit) > 0).reduce((s: number, t: any) => s + parseFloat(t.profit), 0);
    const grossLoss = positions.filter((t: any) => parseFloat(t.profit) < 0).reduce((s: number, t: any) => s + parseFloat(t.profit), 0);
    const totalNetProfit = grossProfit + grossLoss;
    const profitFactor = grossLoss !== 0 ? Math.abs(grossProfit / grossLoss) : 0;
    const totalTrades = positions.length;
    const profitTrades = positions.filter((t: any) => parseFloat(t.profit) > 0).length;
    const lossTrades = positions.filter((t: any) => parseFloat(t.profit) <= 0).length;
    const shortTrades = positions.filter((t: any) => t.trade_type?.toLowerCase() === 'sell');
    const longTrades = positions.filter((t: any) => t.trade_type?.toLowerCase() === 'buy');
    const shortWon = shortTrades.filter((t: any) => parseFloat(t.profit) > 0).length;
    const longWon = longTrades.filter((t: any) => parseFloat(t.profit) > 0).length;
    const largestProfit = positions.length > 0 ? Math.max(...positions.map((t: any) => parseFloat(t.profit))) : 0;
    const largestLoss = positions.length > 0 ? Math.min(...positions.map((t: any) => parseFloat(t.profit))) : 0;
    const avgProfit = profitTrades > 0 ? grossProfit / profitTrades : 0;
    const avgLoss = lossTrades > 0 ? grossLoss / lossTrades : 0;
    const totalCommission = positions.reduce((s: number, t: any) => s + parseFloat(t.commission || 0), 0);
    const totalSwap = positions.reduce((s: number, t: any) => s + parseFloat(t.swap || 0), 0);

    // Build the workbook
    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];

    // === HEADER SECTION ===
    wsData.push(['Trade History Report']);
    wsData.push([]);
    wsData.push(['Name:', '', user.nickname || '']);
    wsData.push(['Account:', '', `${user.account_number || ''} (${user.is_cent ? 'USC' : 'USD'}, ${user.mt5_server || ''}, ${user.account_type || ''}, Hedge)`]);
    wsData.push(['Company:', '', 'Exness Technologies Ltd']);
    wsData.push(['Date:', '', new Date().toISOString().split('T')[0].replace(/-/g, '.')]);
    wsData.push([]);

    // === POSITIONS SECTION ===
    wsData.push(['Positions']);
    wsData.push(['Time', 'Position', 'Symbol', 'Type', 'Volume', 'Price', 'S / L', 'T / P', 'Time', 'Price', 'Commission', 'Swap', 'Profit', 'Comment']);

    for (const t of positions) {
      const openTime = t.open_time ? new Date(t.open_time).toISOString().replace('T', ' ').replace('Z', '').slice(0, 19).replace(/-/g, '.') : '';
      const closeTime = t.close_time ? new Date(t.close_time).toISOString().replace('T', ' ').replace('Z', '').slice(0, 19).replace(/-/g, '.') : '';
      wsData.push([
        openTime,
        t.ticket,
        t.symbol,
        t.trade_type,
        parseFloat(t.volume),
        parseFloat(t.open_price),
        t.stop_loss ? parseFloat(t.stop_loss) : '',
        t.take_profit ? parseFloat(t.take_profit) : '',
        closeTime,
        parseFloat(t.close_price),
        parseFloat(t.commission || 0),
        parseFloat(t.swap || 0),
        parseFloat(t.profit),
        t.comment || '',
      ]);
    }

    // Positions summary row
    wsData.push(['', '', '', '', '', '', '', '', '', '', totalCommission.toFixed(2), totalSwap.toFixed(2), totalNetProfit.toFixed(2), '']);
    wsData.push([]);

    // === DEALS SECTION ===
    wsData.push(['Deals']);
    wsData.push(['Time', 'Deal', 'Symbol', 'Type', 'Direction', 'Volume', 'Price', 'Order', 'Commission', 'Swap', 'Profit', 'Balance', 'Comment']);

    // Build deals from positions (open + close entries)
    for (const t of positions) {
      const openTime = t.open_time ? new Date(t.open_time).toISOString().replace('T', ' ').replace('Z', '').slice(0, 19).replace(/-/g, '.') : '';
      const closeTime = t.close_time ? new Date(t.close_time).toISOString().replace('T', ' ').replace('Z', '').slice(0, 19).replace(/-/g, '.') : '';
      const direction = t.trade_type?.toLowerCase() === 'buy' ? 'in' : 'in';
      const closeDirection = 'out';
      const dealType = t.trade_type?.toLowerCase() === 'buy' ? 'buy' : 'sell';
      const closeDealType = t.trade_type?.toLowerCase() === 'buy' ? 'sell' : 'buy';

      // Opening deal
      wsData.push([openTime, '', t.symbol, dealType, direction, parseFloat(t.volume), parseFloat(t.open_price), '', 0, 0, 0, '', '']);
      // Closing deal
      wsData.push([closeTime, '', t.symbol, closeDealType, closeDirection, parseFloat(t.volume), parseFloat(t.close_price), '', parseFloat(t.commission || 0), parseFloat(t.swap || 0), parseFloat(t.profit), '', t.comment || '']);
    }
    wsData.push([]);

    // === RESULTS SECTION ===
    wsData.push(['Results']);
    wsData.push([]);
    wsData.push(['Total Net Profit:', '', totalNetProfit.toFixed(2), '', 'Gross Profit:', '', grossProfit.toFixed(2), '', 'Gross Loss:', '', grossLoss.toFixed(2)]);
    wsData.push(['Profit Factor:', '', profitFactor.toFixed(2)]);
    wsData.push([]);
    wsData.push(['Total Trades:', '', totalTrades, '', `Short Trades (won %):`, '', `${shortTrades.length} (${shortTrades.length > 0 ? ((shortWon / shortTrades.length) * 100).toFixed(1) : '0.0'}%)`, '', `Long Trades (won %):`, '', `${longTrades.length} (${longTrades.length > 0 ? ((longWon / longTrades.length) * 100).toFixed(1) : '0.0'}%)`]);
    wsData.push([]);
    wsData.push([`Profit Trades (% of total):`, '', `${profitTrades} (${totalTrades > 0 ? ((profitTrades / totalTrades) * 100).toFixed(1) : '0.0'}%)`, '', `Loss Trades (% of total):`, '', `${lossTrades} (${totalTrades > 0 ? ((lossTrades / totalTrades) * 100).toFixed(1) : '0.0'}%)`]);
    wsData.push(['Largest profit trade:', '', largestProfit.toFixed(2), '', 'Largest loss trade:', '', largestLoss.toFixed(2)]);
    wsData.push(['Average profit trade:', '', avgProfit.toFixed(2), '', 'Average loss trade:', '', avgLoss.toFixed(2)]);

    // Create worksheet and set column widths
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
      { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 8 },
      { wch: 10 }, { wch: 16 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'History');

    // Write to buffer
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `ReportHistory-${user.account_number || registrationId}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(xlsxBuffer));
  } catch (error) {
    console.error('XLSX export error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/export-evaluation
 * Full evaluation report CSV — per-user summary with all metrics
 * Similar to what the Telegram /exportleaderboard command produces
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/export-evaluation`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const result = await db.query(
      `SELECT l.rank, l.nickname, l.account_type, l.is_cent,
              l.starting_balance, l.current_balance, l.adjusted_balance,
              l.qualified_profit, l.gross_profit, l.profit_removed,
              l.total_trades, l.qualified_trades, l.flagged_trades, l.active_days,
              l.is_qualified, l.is_disqualified, l.disqualify_reason,
              l.last_trade_time, l.zero_balance_at,
              r.username, r.email, r.account_number, r.mt5_server,
              r.investor_password, r.source, r.registered_at,
              r.actual_starting_balance, r.registration_balance
       FROM wp_leaderboard l
       JOIN trading_registrations r ON l.registration_id = r.id
       WHERE l.challenge_id = $1
       ORDER BY l.account_type, l.rank ASC NULLS LAST`,
      [challengeId]
    );

    // Build evaluation report rows
    const evaluation = result.rows.map((r: any) => ({
      Rank: r.rank || 'N/A',
      Nickname: r.nickname || '',
      Username: r.username || '',
      Email: r.email || '',
      'Account Number': r.account_number,
      Server: r.mt5_server || '',
      'Account Type': r.account_type,
      'Is Cent': r.is_cent ? 'Yes' : 'No',
      'Starting Balance': parseFloat(r.starting_balance || 0).toFixed(2),
      'Current Balance': parseFloat(r.current_balance || 0).toFixed(2),
      'Adjusted Balance': parseFloat(r.adjusted_balance || 0).toFixed(2),
      'Qualified P&L': parseFloat(r.qualified_profit || 0).toFixed(2),
      'Gross P&L': parseFloat(r.gross_profit || 0).toFixed(2),
      'P&L Removed': parseFloat(r.profit_removed || 0).toFixed(2),
      'Total Trades': r.total_trades || 0,
      'Qualified Trades': r.qualified_trades || 0,
      'Flagged Trades': r.flagged_trades || 0,
      'Active Days': r.active_days || 0,
      'Is Qualified': r.is_qualified ? 'Yes' : 'No',
      'Is Disqualified': r.is_disqualified ? 'Yes' : 'No',
      'DQ Reason': r.disqualify_reason || '',
      'Last Trade': r.last_trade_time || '',
      'Registered At': r.registered_at || '',
      Source: r.source || 'telegram',
    }));

    return res.json({ evaluation });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/:secretPath/challenge/:id/ohlc-update
 * Synchronous OHLC backfill — waits for completion and returns detailed stats + gap check
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/ohlc-update`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const challengeResult = await db.query(`SELECT * FROM trading_challenges WHERE id = $1`, [challengeId]);
    const challenge = challengeResult.rows[0];
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const scheduler = (global as any).__vpsPullScheduler;
    if (!scheduler) return res.status(503).json({ error: 'Pull scheduler not initialised yet — try again in a moment' });

    // Run synchronously (caller must handle long timeout — frontend uses AbortController)
    await scheduler.updateOhlcCandles(challenge);

    // Gather per-symbol stats + gap analysis
    const symbolsResult = await db.query(
      `SELECT symbol, COUNT(*) as candle_count, MIN(time) as first_candle, MAX(time) as last_candle
       FROM ohlc_candles WHERE challenge_id = $1
       GROUP BY symbol ORDER BY symbol`,
      [challengeId]
    );

    const startDate = new Date(challenge.start_date);
    const endDate = new Date(challenge.end_date);
    const now = new Date();
    const effectiveEnd = now < endDate ? now : endDate;

    // Calculate expected minutes (forex market: exclude weekends roughly)
    const totalMinutes = Math.floor((effectiveEnd.getTime() - startDate.getTime()) / 60000);

    const symbols = symbolsResult.rows.map((r: any) => {
      const count = parseInt(r.candle_count);
      const first = new Date(r.first_candle);
      const last = new Date(r.last_candle);
      const coveredMinutes = Math.floor((last.getTime() - first.getTime()) / 60000) + 1;
      const coveragePct = totalMinutes > 0 ? Math.min(100, Math.round((count / totalMinutes) * 100)) : 0;
      return {
        symbol: r.symbol,
        candleCount: count,
        firstCandle: r.first_candle,
        lastCandle: r.last_candle,
        coveragePercent: coveragePct,
        expectedMinutes: totalMinutes,
      };
    });

    const totalCandles = symbols.reduce((sum: number, s: any) => sum + s.candleCount, 0);

    return res.json({
      success: true,
      challengeId,
      totalCandles,
      totalSymbols: symbols.length,
      challengeStart: challenge.start_date,
      challengeEnd: challenge.end_date,
      effectiveEnd: effectiveEnd.toISOString(),
      expectedMinutesPerSymbol: totalMinutes,
      symbols,
    });
  } catch (error: any) {
    console.error('OHLC update error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/ohlc-download
 * Download all OHLC 1-min candle data for the challenge as CSV
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/ohlc-download`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const challengeResult = await db.query(`SELECT title FROM trading_challenges WHERE id = $1`, [challengeId]);
    const challenge = challengeResult.rows[0];
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const rows = await db.query(
      `SELECT symbol, time, open, high, low, close, volume
       FROM ohlc_candles WHERE challenge_id = $1
       ORDER BY symbol, time ASC`,
      [challengeId]
    );

    const header = 'symbol,time,open,high,low,close,volume\n';
    const csvRows = rows.rows.map((r: any) =>
      `${r.symbol},${new Date(r.time).toISOString()},${r.open},${r.high},${r.low},${r.close},${r.volume}`
    );
    const csv = header + csvRows.join('\n');

    const filename = `${(challenge.title || `challenge_${challengeId}`).replace(/\s+/g, '_')}_ohlc.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/user-evaluation?registration_id=X
 * Per-user evaluation report — same format as Telegram /evaluate command
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/user-evaluation`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const registrationId = parseInt(req.query.registration_id as string);
    if (!registrationId) return res.status(400).json({ error: 'registration_id required' });

    // Get user + leaderboard data
    const reg = await db.query(
      `SELECT r.nickname, r.username, r.account_number, r.account_type, r.mt5_server, r.is_cent,
              r.registration_balance, r.actual_starting_balance,
              l.rank, l.starting_balance, l.current_balance, l.adjusted_balance,
              l.qualified_profit, l.gross_profit, l.profit_removed,
              l.total_trades, l.qualified_trades, l.flagged_trades, l.active_days,
              l.is_qualified, l.is_disqualified, l.disqualify_reason
       FROM trading_registrations r
       LEFT JOIN wp_leaderboard l ON r.id = l.registration_id
       WHERE r.id = $1 AND r.challenge_id = $2`,
      [registrationId, challengeId]
    );
    if (reg.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const u = reg.rows[0];

    // Get ALL trades (flagged and qualified) — needed for simultaneous group time context
    const allTrades = await db.query(
      `SELECT ticket, symbol, trade_type, volume, open_time, close_time, profit, commission, swap, is_qualified, violations
       FROM wp_trades WHERE challenge_id = $1 AND registration_id = $2
       ORDER BY open_time ASC`,
      [challengeId, registrationId]
    );

    const flaggedTrades = allTrades.rows.filter((t: any) => !t.is_qualified);

    // ── Build simultaneous violation groups ────────────────────────────────
    // A trade is "simultaneous-only" if its only violations are the simultaneous ones.
    // Those go exclusively in the groups section. Trades with other violations too
    // appear in the main list (with "See simultaneous group below") AND in the groups.
    const SIMUL_PATTERNS = [/Exceeded max \d+ simultaneous open trades/, /Exceeded max \d+ simultaneous \S+ trades/];
    const isSimulViolation = (v: string) => SIMUL_PATTERNS.some(p => p.test(v));

    // Find simultaneous violator tickets
    const simulTickets = new Set<number>();
    for (const t of flaggedTrades) {
      const violations: string[] = Array.isArray(t.violations) ? t.violations : [];
      if (violations.some(isSimulViolation)) simulTickets.add(t.ticket);
    }

    // Build groups: find all "peak" windows where violations occurred.
    // Group = set of trades that share the same simultaneous-violation window.
    // Strategy: for each violating trade, collect all trades that overlap its open period.
    const tradeMap = new Map(allTrades.rows.map((t: any) => [t.ticket, t]));
    const grouped = new Map<string, Set<number>>(); // groupKey → set of tickets

    for (const ticket of simulTickets) {
      const t = tradeMap.get(ticket) as any;
      if (!t) continue;
      const tOpen  = new Date(t.open_time).getTime();
      const tClose = new Date(t.close_time).getTime();

      // Find all trades open simultaneously with this one
      const overlap = allTrades.rows
        .filter((o: any) => {
          const oOpen  = new Date(o.open_time).getTime();
          const oClose = new Date(o.close_time).getTime();
          return oOpen < tClose && oClose > tOpen; // overlapping periods
        })
        .map((o: any) => o.ticket);

      // Build a stable group key from sorted ticket list
      const key = [...new Set(overlap)].sort().join(',');
      if (!grouped.has(key)) grouped.set(key, new Set());
      overlap.forEach((tk: number) => grouped.get(key)!.add(tk));
    }

    // Deduplicate groups: if group A's tickets are a subset of group B's, drop A
    const groupList = [...grouped.values()].map(s => [...s].sort((a, b) => a - b));
    const finalGroups: number[][] = groupList.filter((g, i) =>
      !groupList.some((other, j) => j !== i && g.every(tk => other.includes(tk)) && other.length > g.length)
    );

    // Trades whose ONLY violations are simultaneous → omit from main list
    const simulOnlyTickets = new Set<number>();
    for (const t of flaggedTrades) {
      const violations: string[] = Array.isArray(t.violations) ? t.violations : [];
      if (violations.length > 0 && violations.every(isSimulViolation)) {
        simulOnlyTickets.add(t.ticket);
      }
    }

    // ── Build report ───────────────────────────────────────────────────────
    const currency = u.is_cent ? '¢' : '$';
    let report = `📊 EVALUATION REPORT\n`;
    report += `═══════════════════════════════════\n\n`;
    report += `👤 ${u.nickname || u.username || 'Unknown'}\n`;
    report += `📅 Account: ${u.account_number} (${u.account_type})\n`;
    report += `🖥️ Server: ${u.mt5_server}\n`;
    report += `#️⃣ Rank: ${u.rank || 'N/A'}\n\n`;
    report += `💰 Starting Balance: ${currency}${parseFloat(u.starting_balance || u.actual_starting_balance || u.registration_balance || 0).toFixed(2)}\n`;
    report += `💰 Current Balance: ${currency}${parseFloat(u.current_balance || 0).toFixed(2)}\n`;
    report += `💰 Adjusted Balance: ${currency}${parseFloat(u.adjusted_balance || 0).toFixed(2)}\n`;
    report += `📈 Gross P&L: ${currency}${parseFloat(u.gross_profit || 0).toFixed(2)}\n`;
    report += `📈 Qualified P&L: ${currency}${parseFloat(u.qualified_profit || 0).toFixed(2)}\n`;
    report += `➖ P&L Removed: ${currency}${parseFloat(u.profit_removed || 0).toFixed(2)}\n\n`;
    report += `📊 Total Trades: ${u.total_trades || 0}\n`;
    report += `✅ Qualified: ${u.qualified_trades || 0}\n`;
    report += `🚩 Flagged: ${u.flagged_trades || 0}\n`;
    report += `📅 Active Days: ${u.active_days || 0}\n\n`;

    if (u.is_disqualified) {
      report += `🚫 STATUS: DISQUALIFIED\n`;
      report += `📛 Reason: ${u.disqualify_reason || 'N/A'}\n\n`;
    } else if (u.is_qualified) {
      report += `✅ STATUS: QUALIFIED\n\n`;
    } else {
      report += `❌ STATUS: Below Target\n\n`;
    }

    // ── Main flagged trades list (excludes simul-only trades) ──────────────
    const mainFlagged = flaggedTrades.filter((t: any) => !simulOnlyTickets.has(t.ticket));
    if (mainFlagged.length > 0) {
      report += `═══════════════════════════════════\n`;
      report += `🚩 FLAGGED TRADES (${flaggedTrades.length})\n`;
      report += `═══════════════════════════════════\n\n`;
      let idx = 1;
      for (const t of mainFlagged) {
        const violations: string[] = Array.isArray(t.violations) ? t.violations : [];
        // For trades that also have simul violations, replace those with a reference
        const otherViolations = violations.filter(v => !isSimulViolation(v));
        const hasSimul = violations.some(isSimulViolation);
        const parts = [...otherViolations];
        if (hasSimul) parts.push(`See simultaneous group below`);
        report += `${idx++}. #${t.ticket} | ${t.symbol} | ${t.trade_type} | ${parseFloat(t.volume).toFixed(4)} lot\n`;
        report += `   P&L: ${currency}${parseFloat(t.profit).toFixed(2)}\n`;
        report += `   ⚠️ ${parts.join(', ')}\n\n`;
      }
    }

    // ── Simultaneous violation groups ──────────────────────────────────────
    if (finalGroups.length > 0) {
      report += `═══════════════════════════════════\n`;
      report += `⚡ SIMULTANEOUS TRADE VIOLATIONS\n`;
      report += `═══════════════════════════════════\n\n`;

      finalGroups.forEach((groupTickets, gi) => {
        const groupTrades = groupTickets
          .map(tk => tradeMap.get(tk) as any)
          .filter(Boolean)
          .sort((a: any, b: any) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime());

        // Determine what kind of violation(s) this group has
        const maxSimulOpen = groupTrades.length;
        const pairCounts = new Map<string, number>();
        for (const t of groupTrades) {
          pairCounts.set(t.symbol, (pairCounts.get(t.symbol) || 0) + 1);
        }
        const pairBreaches = [...pairCounts.entries()]
          .filter(([, count]) => count > 1)
          .map(([sym, count]) => `${count} ${sym}`)
          .join(', ');

        // Group header
        const groupDate = new Date(groupTrades[0].open_time).toISOString().slice(0, 10);
        report += `── GROUP ${String.fromCharCode(65 + gi)} — ${maxSimulOpen} trades open simultaneously`;
        if (pairBreaches) report += ` | Same-pair: ${pairBreaches}`;
        report += ` ──\n`;
        report += `   ${groupDate}\n\n`;

        for (const t of groupTrades) {
          const violations: string[] = Array.isArray(t.violations) ? t.violations : [];
          const otherViolations = violations.filter((v: string) => !isSimulViolation(v));
          const noSl = otherViolations.some((v: string) => v.includes('No stop loss'));
          const notes = noSl ? ` | No SL` : '';
          report += `   #${t.ticket} | ${t.symbol} | ${t.trade_type} | ${parseFloat(t.volume).toFixed(4)} lot | P&L: ${currency}${parseFloat(t.profit).toFixed(2)}${notes}\n`;
        }
        report += `\n`;
      });
    }

    report += `═══════════════════════════════════\n`;
    report += `Generated: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC\n`;

    return res.json({ report, user: u, flaggedTrades });
  } catch (error) {
    console.error('User evaluation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/export-registrations
 * Full registration data export — all columns from trading_registrations
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/export-registrations`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const result = await db.query(
      `SELECT r.id, r.user_id, r.username, r.nickname, r.account_type, r.account_subtype,
              r.email, r.account_number, r.mt5_server, r.investor_password, r.client_uid,
              r.source, r.status, r.is_cent, r.connection_verified, r.connection_verified_at,
              r.registration_balance, r.last_known_balance, r.actual_starting_balance,
              r.pull_status, r.pull_error, r.last_pull_at,
              r.partner_status, r.partner_warned_at,
              r.disqualified, r.disqualified_at, r.disqualified_reason,
              r.registered_at, r.updated_at
       FROM trading_registrations r
       WHERE r.challenge_id = $1 AND (r.status IS NULL OR r.status != 'removed')
       ORDER BY r.registered_at ASC`,
      [challengeId]
    );
    return res.json({ registrations: result.rows });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/admin-leaderboard
 * Admin leaderboard — all participants, no limit, includes unevaluated accounts
 * falling back to registration balance so the admin always sees everyone.
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/admin-leaderboard`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const category    = (req.query.category as string) || 'all';

    const challengeRow = await db.query(
      `SELECT status, leaderboard_updated_at FROM trading_challenges WHERE id = $1`, [challengeId]
    );
    const status   = challengeRow.rows[0]?.status;
    const dataFrom = challengeRow.rows[0]?.leaderboard_updated_at || null;

    const catFilter  = (category === 'demo' || category === 'real') ? ` AND r.account_type = '${category}'` : '';
    const centCheck  = await db.query(
      `SELECT COALESCE((SELECT (parameters->>'only_cent_account')::boolean FROM wp_challenge_rules WHERE challenge_id = $1 AND rule_code = 'config'), false) as only_cent FROM trading_challenges WHERE id = $1`,
      [challengeId]
    );
    const challengeOnlyCent = centCheck.rows[0]?.only_cent || false;

    // All participants LEFT JOIN leaderboard — unevaluated accounts still appear
    const result = await db.query(
      `SELECT r.id as registration_id, r.nickname, r.account_type, r.is_cent,
              r.email, r.account_number,
              r.registration_balance, r.last_known_balance, r.last_known_equity, r.actual_starting_balance,
              r.disqualified, r.disqualified_reason,
              l.rank, l.current_balance, l.adjusted_balance, l.qualified_profit,
              l.gross_profit, l.profit_removed, l.total_trades, l.qualified_trades,
              l.flagged_trades, l.is_qualified, l.is_disqualified, l.disqualify_reason,
              l.last_trade_time, l.last_updated, l.zero_balance_at,
              COALESCE(l.is_withdrawn, false) as is_withdrawn,
              COALESCE(l.total_withdrawn, 0) as total_withdrawn
       FROM trading_registrations r
       LEFT JOIN wp_leaderboard l ON l.registration_id = r.id
       WHERE r.challenge_id = $1
         AND (r.status IS NULL OR r.status != 'removed')
         ${catFilter}
       ORDER BY
         CASE WHEN l.is_disqualified = true OR r.disqualified = true THEN 1 ELSE 0 END,
         l.rank ASC NULLS LAST,
         COALESCE(l.adjusted_balance, r.last_known_balance, r.registration_balance) DESC NULLS LAST`,
      [challengeId]
    );

    const isPreStart = status !== 'active' && status !== 'reviewing' && status !== 'completed';

    return res.json({
      dataFrom,
      preStart: isPreStart,
      total: result.rows.length,
      leaderboard: result.rows.map((r: any) => {
        const hasLeaderboard = r.rank != null;
        const isCent = r.is_cent || (challengeOnlyCent && r.account_type !== 'demo') || false;
        const fallbackBalance = r.last_known_balance != null
          ? parseFloat(r.last_known_balance)
          : r.registration_balance != null ? parseFloat(r.registration_balance) : 0;
        return {
          registrationId: r.registration_id,
          nickname: r.nickname,
          email: r.email || null,
          accountNumber: r.account_number || null,
          accountType: r.account_type,
          rank: r.rank || null,
          currentBalance: hasLeaderboard ? parseFloat(r.current_balance) : fallbackBalance,
          adjustedBalance: hasLeaderboard ? parseFloat(r.adjusted_balance) : fallbackBalance,
          qualifiedProfit: hasLeaderboard ? parseFloat(r.qualified_profit) : 0,
          grossProfit: hasLeaderboard ? parseFloat(r.gross_profit) : 0,
          profitRemoved: hasLeaderboard ? parseFloat(r.profit_removed) : 0,
          totalTrades: r.total_trades || 0,
          qualifiedTrades: r.qualified_trades || 0,
          flaggedTrades: r.flagged_trades || 0,
          isQualified: r.is_qualified || false,
          isDisqualified: r.is_disqualified || r.disqualified || false,
          disqualifyReason: r.disqualify_reason || r.disqualified_reason || null,
          isBlown: (r.total_trades > 0) && !r.is_withdrawn && (
            parseFloat(r.current_balance) <= 0 ||
            (r.last_known_equity !== null && r.last_known_equity !== undefined && parseFloat(r.last_known_equity) <= 0)
          ),
          isWithdrawn: r.is_withdrawn || false,
          totalWithdrawn: parseFloat(r.total_withdrawn) || 0,
          isCent,
          lastTradeTime: r.last_trade_time,
          lastUpdated: r.last_updated,
          notYetEvaluated: !hasLeaderboard,
        };
      }),
    });
  } catch (error) {
    console.error('Admin leaderboard error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/:secretPath/challenge/:id/pull-trade
 * Fetch a specific trade from MT5 by ticket number and compare with DB.
 * Body: { accountIdentifier: string (account# or email), ticket: number }
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/pull-trade`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const { accountIdentifier, ticket } = req.body;
    if (!accountIdentifier || !ticket) return res.status(400).json({ error: 'accountIdentifier and ticket are required' });

    const ticketNum = parseInt(ticket);
    if (isNaN(ticketNum)) return res.status(400).json({ error: 'ticket must be a number' });

    // Look up registration by account number or email
    const regResult = await db.query(
      `SELECT r.id, r.account_number, r.mt5_server, r.investor_password, r.nickname,
              r.is_cent, r.account_type, r.account_subtype
       FROM trading_registrations r
       WHERE r.challenge_id = $1
         AND (r.account_number = $2 OR LOWER(r.email) = LOWER($2))
         AND r.connection_verified = true
       LIMIT 1`,
      [challengeId, accountIdentifier]
    );
    if (regResult.rows.length === 0) return res.status(404).json({ error: 'Account not found in this challenge' });
    const reg = regResult.rows[0];

    const numEq = (a: any, b: any) => Math.abs(parseFloat(a ?? 0) - parseFloat(b ?? 0)) < 0.0001;

    // Fetch existing DB record(s) — match by ticket OR position_id (mother trade case)
    const existing = await db.query(
      `SELECT ticket, symbol, trade_type, volume, open_time, close_time,
              open_price, close_price, stop_loss, take_profit, profit,
              commission, swap, comment, is_qualified, violations,
              sl_check_result, sl_check_pending, sl_allowed_price, sl_max_adverse_price, position_id
       FROM wp_trades
       WHERE challenge_id = $1 AND registration_id = $2 AND (ticket = $3 OR position_id = $3)
       ORDER BY close_time ASC`,
      [challengeId, reg.id, ticketNum]
    );
    const dbTrades = existing.rows; // may be multiple (partial closes)
    const isPositionGroup = dbTrades.length > 1 || (dbTrades.length === 1 && dbTrades[0].position_id && dbTrades[0].ticket !== ticketNum);

    // Fetch fresh from VPS via scheduler
    const globalScheduler = (global as any).__vpsPullScheduler;
    if (!globalScheduler) return res.status(503).json({ error: 'VPS scheduler not running' });

    const healthyTerminals = globalScheduler.terminals?.filter((t: any) => t.isHealthy);
    if (!healthyTerminals?.length) return res.status(503).json({ error: 'No healthy VPS terminals available' });

    const terminal = healthyTerminals[0];
    const account = {
      registrationId: reg.id,
      accountNumber: reg.account_number,
      server: reg.mt5_server,
      investorPassword: reg.investor_password,
    };

    // Always resolve by the entered number (position_id or ticket).
    // For position groups the VPS resolves all closing deals for that position_id.
    const resolveIds: number[] = [ticketNum];

    // Retry up to 3 times (MT5 history can take a moment to load)
    let freshTrades: any[] | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 3000));
      freshTrades = await globalScheduler.resolveTradesForAccount(account, terminal.id, resolveIds);
      if (freshTrades && freshTrades.length > 0) break;
    }

    if (!freshTrades || freshTrades.length === 0) {
      return res.status(404).json({ error: 'Trade not found on MT5 after 3 attempts' });
    }

    // Helpers
    const formatDbRow = (t: any) => ({
      ticket: t.ticket,
      symbol: t.symbol,
      type: t.trade_type,
      volume: parseFloat(t.volume),
      openTime: t.open_time,
      closeTime: t.close_time,
      openPrice: parseFloat(t.open_price),
      closePrice: parseFloat(t.close_price),
      stopLoss: t.stop_loss != null ? parseFloat(t.stop_loss) : null,
      takeProfit: t.take_profit != null ? parseFloat(t.take_profit) : null,
      profit: parseFloat(t.profit),
      commission: parseFloat(t.commission ?? 0),
      swap: parseFloat(t.swap ?? 0),
      comment: t.comment ?? null,
      isQualified: t.is_qualified,
      violations: typeof t.violations === 'string' ? JSON.parse(t.violations || '[]') : (t.violations || []),
      slCheckResult: t.sl_check_result,
      positionId: t.position_id,
    });
    const formatFreshRow = (f: any) => ({
      ticket: f.ticket,
      symbol: f.symbol,
      type: f.type,
      volume: f.volume,
      openTime: f.open_time,
      closeTime: f.close_time,
      openPrice: f.open_price,
      closePrice: f.close_price,
      stopLoss: f.stop_loss ?? null,
      takeProfit: f.take_profit ?? null,
      profit: f.profit,
      commission: f.commission ?? 0,
      swap: f.swap ?? 0,
      comment: f.comment ?? null,
      positionId: ticketNum,
    });

    // Build summary objects for display
    const buildSummary = (trades: any[], totalProfit: number, totalVolume: number, first: any) => ({
      ticket: ticketNum, // position ID as display ticket
      symbol: first.symbol,
      type: first.type ?? first.trade_type,
      volume: totalVolume,
      openTime: first.openTime ?? first.open_time,
      openPrice: first.openPrice ?? parseFloat(first.open_price),
      closePrice: null,
      closeTime: null,
      stopLoss: first.stopLoss ?? (first.stop_loss != null ? parseFloat(first.stop_loss) : null),
      takeProfit: first.takeProfit ?? (first.take_profit != null ? parseFloat(first.take_profit) : null),
      profit: totalProfit,
      commission: trades.reduce((s: number, t: any) => s + parseFloat(t.commission ?? t.commission ?? 0), 0),
      swap: trades.reduce((s: number, t: any) => s + parseFloat(t.swap ?? 0), 0),
      comment: null,
      _partials: trades,
      _isGroup: true,
    });

    const dbFormattedRows = dbTrades.map(formatDbRow);
    const freshFormattedRows = freshTrades.map(formatFreshRow);

    const dbTotalProfit = dbFormattedRows.reduce((s, t) => s + t.profit, 0);
    const dbTotalVol = dbFormattedRows.reduce((s, t) => s + t.volume, 0);
    const freshTotalProfit = freshFormattedRows.reduce((s, t) => s + t.profit, 0);
    const freshTotalVol = freshFormattedRows.reduce((s, t) => s + t.volume, 0);

    // For single trade, use the row directly; for group, use summary
    const dbFormatted = dbTrades.length === 0 ? null
      : (dbTrades.length === 1 && !isPositionGroup) ? dbFormattedRows[0]
      : buildSummary(dbFormattedRows, dbTotalProfit, dbTotalVol, dbFormattedRows[0]);

    const freshFormatted = freshTrades.length === 1 && !isPositionGroup ? freshFormattedRows[0]
      : buildSummary(freshFormattedRows, freshTotalProfit, freshTotalVol, freshFormattedRows[0]);

    // Compute diff (group: compare totals; single: compare fields)
    const diff: Record<string, { db: any; fresh: any }> = {};
    if (dbFormatted && dbTrades.length > 0) {
      if (!isPositionGroup) {
        const db0 = dbFormattedRows[0]; const fr0 = freshFormattedRows[0];
        if (db0.symbol !== fr0.symbol) diff.symbol = { db: db0.symbol, fresh: fr0.symbol };
        if (db0.type !== fr0.type) diff.type = { db: db0.type, fresh: fr0.type };
        if (!numEq(db0.volume, fr0.volume)) diff.volume = { db: db0.volume, fresh: fr0.volume };
        if (!numEq(db0.openPrice, fr0.openPrice)) diff.openPrice = { db: db0.openPrice, fresh: fr0.openPrice };
        if (!numEq(db0.closePrice, fr0.closePrice)) diff.closePrice = { db: db0.closePrice, fresh: fr0.closePrice };
        if (!numEq(db0.profit, fr0.profit)) diff.profit = { db: db0.profit, fresh: fr0.profit };
        if (!numEq(db0.stopLoss ?? 0, fr0.stopLoss ?? 0)) diff.stopLoss = { db: db0.stopLoss, fresh: fr0.stopLoss };
        if (!numEq(db0.commission, fr0.commission)) diff.commission = { db: db0.commission, fresh: fr0.commission };
      } else {
        // Group: compare total profit/volume and number of partials
        if (!numEq(dbTotalProfit, freshTotalProfit)) diff.profit = { db: dbTotalProfit, fresh: freshTotalProfit };
        if (!numEq(dbTotalVol, freshTotalVol)) diff.volume = { db: dbTotalVol, fresh: freshTotalVol };
        if (dbTrades.length !== freshTrades.length) diff.tradeCount = { db: dbTrades.length, fresh: freshTrades.length };
      }
    }

    // ── Dry-run evaluation ─────────────────────────────────────────────────
    let freshEval: { isQualified: boolean | null; violations: string[]; slCheckResult: string | null; slWillRecheck: boolean; perTrade?: any[] } = {
      isQualified: null, violations: [], slCheckResult: null, slWillRecheck: false,
    };
    try {
      // 1. Snapshot staging
      const stagingSnap = await db.query(
        `SELECT * FROM wp_leaderboard_staging WHERE challenge_id = $1 AND registration_id = $2`,
        [challengeId, reg.id]
      );
      const stagingRow = stagingSnap.rows[0] || null;

      // 2. Track which tickets are new (not in DB) so we can delete them on restore
      const existingTickets = new Set(dbTrades.map(t => t.ticket));

      // 3. Upsert all fresh trades
      for (const ft of freshTrades) {
        const matchingDb = dbTrades.find(d => d.ticket === ft.ticket);
        const slUnchangedFt = matchingDb &&
          numEq(matchingDb.stop_loss ?? 0, ft.stop_loss ?? 0) &&
          numEq(matchingDb.open_price, ft.open_price);
        const carrySlResult = slUnchangedFt ? matchingDb.sl_check_result : null;

        await db.query(
          `INSERT INTO wp_trades
             (challenge_id, registration_id, ticket, symbol, trade_type, volume,
              open_time, close_time, open_price, close_price, stop_loss, take_profit,
              profit, commission, swap, comment,
              sl_check_result, sl_check_pending, is_qualified, violations, position_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,false,NULL,'[]',$18)
           ON CONFLICT (challenge_id, registration_id, ticket) DO UPDATE SET
             symbol = EXCLUDED.symbol, trade_type = EXCLUDED.trade_type, volume = EXCLUDED.volume,
             open_time = EXCLUDED.open_time, close_time = EXCLUDED.close_time,
             open_price = EXCLUDED.open_price, close_price = EXCLUDED.close_price,
             stop_loss = EXCLUDED.stop_loss, take_profit = EXCLUDED.take_profit,
             profit = EXCLUDED.profit, commission = EXCLUDED.commission, swap = EXCLUDED.swap,
             comment = EXCLUDED.comment, sl_check_result = $17, sl_check_pending = false,
             is_qualified = NULL, violations = '[]', position_id = EXCLUDED.position_id`,
          [
            challengeId, reg.id, ft.ticket, ft.symbol, ft.type, ft.volume,
            ft.open_time, ft.close_time, ft.open_price, ft.close_price,
            ft.stop_loss ?? null, ft.take_profit ?? null,
            ft.profit, ft.commission ?? 0, ft.swap ?? 0, ft.comment ?? null,
            carrySlResult, ticketNum,
          ]
        );
      }

      // 4. Run evaluation
      const globalEvalEngine = (global as any).__wpEvaluationEngine;
      if (globalEvalEngine) {
        await globalEvalEngine.evaluateSingleAccount(challengeId, reg.id);
      }

      // 5. Read back fresh evaluation for all fresh tickets
      const freshTickets = freshTrades.map(f => f.ticket);
      const freshEvalRows = await db.query(
        `SELECT ticket, is_qualified, violations, sl_check_result FROM wp_trades
         WHERE challenge_id = $1 AND registration_id = $2 AND ticket = ANY($3)`,
        [challengeId, reg.id, freshTickets]
      );
      const perTrade = freshEvalRows.rows.map((r: any) => ({
        ticket: r.ticket,
        isQualified: r.is_qualified,
        violations: typeof r.violations === 'string' ? JSON.parse(r.violations || '[]') : (r.violations || []),
        slCheckResult: r.sl_check_result,
      }));
      const allViolations: string[] = [...new Set(perTrade.flatMap((t: any) => t.violations))];
      const anyFlagged = perTrade.some((t: any) => t.isQualified === false);
      const slWillRecheck = freshTrades.some(ft => {
        const matchingDb = dbTrades.find(d => d.ticket === ft.ticket);
        return !matchingDb || !numEq(matchingDb.stop_loss ?? 0, ft.stop_loss ?? 0);
      });
      freshEval = { isQualified: !anyFlagged, violations: allViolations, slCheckResult: null, slWillRecheck, perTrade };

      // 6. Restore wp_trades — update existing ones, delete new ones
      for (const ft of freshTrades) {
        const orig = dbTrades.find(d => d.ticket === ft.ticket);
        if (orig) {
          await db.query(
            `UPDATE wp_trades SET
               symbol = $1, trade_type = $2, volume = $3,
               open_time = $4, close_time = $5, open_price = $6, close_price = $7,
               stop_loss = $8, take_profit = $9, profit = $10, commission = $11,
               swap = $12, comment = $13, is_qualified = $14, violations = $15,
               sl_check_result = $16, sl_check_pending = $17,
               sl_allowed_price = $18, sl_max_adverse_price = $19
             WHERE challenge_id = $20 AND registration_id = $21 AND ticket = $22`,
            [
              orig.symbol, orig.trade_type, orig.volume,
              orig.open_time, orig.close_time, orig.open_price, orig.close_price,
              orig.stop_loss ?? null, orig.take_profit ?? null,
              orig.profit, orig.commission ?? 0, orig.swap ?? 0,
              orig.comment ?? null, orig.is_qualified,
              typeof orig.violations === 'string' ? orig.violations : JSON.stringify(orig.violations || []),
              orig.sl_check_result ?? null, orig.sl_check_pending ?? false,
              orig.sl_allowed_price ?? null, orig.sl_max_adverse_price ?? null,
              challengeId, reg.id, ft.ticket,
            ]
          );
        } else {
          // This trade didn't exist in DB before — delete it
          await db.query(
            `DELETE FROM wp_trades WHERE challenge_id = $1 AND registration_id = $2 AND ticket = $3`,
            [challengeId, reg.id, ft.ticket]
          );
        }
      }

      // 7. Restore staging
      if (stagingRow) {
        await db.query(
          `UPDATE wp_leaderboard_staging SET
             current_balance = $1, adjusted_balance = $2, normalized_balance = $3,
             qualified_profit = $4, gross_profit = $5, profit_removed = $6,
             total_trades = $7, qualified_trades = $8, flagged_trades = $9,
             active_days = $10, is_qualified = $11, is_disqualified = $12,
             disqualify_reason = $13, last_trade_time = $14, zero_balance_at = $15,
             evaluated_at = $16
           WHERE challenge_id = $17 AND registration_id = $18`,
          [
            stagingRow.current_balance, stagingRow.adjusted_balance, stagingRow.normalized_balance,
            stagingRow.qualified_profit, stagingRow.gross_profit, stagingRow.profit_removed,
            stagingRow.total_trades, stagingRow.qualified_trades, stagingRow.flagged_trades,
            stagingRow.active_days, stagingRow.is_qualified, stagingRow.is_disqualified,
            stagingRow.disqualify_reason, stagingRow.last_trade_time, stagingRow.zero_balance_at,
            stagingRow.evaluated_at, challengeId, reg.id,
          ]
        );
      }
    } catch (evalErr) {
      console.error('Pull trade dry-run eval error (non-fatal):', evalErr);
    }
    // ── End dry-run ────────────────────────────────────────────────────────

    return res.json({
      registrationId: reg.id,
      nickname: reg.nickname,
      accountNumber: reg.account_number,
      fresh: freshFormatted,
      db: dbFormatted,
      diff,
      freshEval,
      isGroup: isPositionGroup || freshTrades.length > 1,
      identical: Object.keys(diff).length === 0 && dbTrades.length > 0,
      notInDb: dbTrades.length === 0,
    });
  } catch (error) {
    console.error('Pull trade error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

function formatTrade(t: any) {
  return {
    ticket: t.ticket, symbol: t.symbol, type: t.trade_type,
    volume: parseFloat(t.volume), openPrice: parseFloat(t.open_price),
    closePrice: parseFloat(t.close_price), profit: parseFloat(t.profit),
    stopLoss: t.stop_loss != null ? parseFloat(t.stop_loss) : null,
    isQualified: t.is_qualified,
    violations: typeof t.violations === 'string' ? JSON.parse(t.violations || '[]') : (t.violations || []),
  };
}

/**
 * POST /api/admin/:secretPath/challenge/:id/pull-trade/replace
 * Replace DB trade with fresh VPS data and re-evaluate the account.
 * Body: { registrationId: number, ticket: number, freshTrade: object }
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/pull-trade/replace`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const { registrationId, ticket, freshTrade, freshTrades: freshTradesArr } = req.body;
    if (!registrationId || !ticket) return res.status(400).json({ error: 'registrationId and ticket are required' });

    const regResult = await db.query(
      `SELECT account_number FROM trading_registrations WHERE id = $1 AND challenge_id = $2`,
      [registrationId, challengeId]
    );
    if (!regResult.rows.length) return res.status(404).json({ error: 'Registration not found' });
    const accountNumber = regResult.rows[0].account_number;

    // Support both single trade and group (array of partials)
    const tradesToUpsert: any[] = freshTradesArr && Array.isArray(freshTradesArr) ? freshTradesArr : (freshTrade ? [freshTrade] : []);
    if (tradesToUpsert.length === 0) return res.status(400).json({ error: 'No trade data provided' });

    for (const ft of tradesToUpsert) {
      await db.query(
        `INSERT INTO wp_trades
         (challenge_id, registration_id, account_number, ticket, position_id, symbol, trade_type, volume,
          open_time, close_time, open_price, close_price, stop_loss, take_profit,
          profit, commission, swap, comment, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
         ON CONFLICT (challenge_id, account_number, ticket) DO UPDATE SET
           symbol=EXCLUDED.symbol, trade_type=EXCLUDED.trade_type, volume=EXCLUDED.volume,
           open_time=COALESCE(EXCLUDED.open_time, wp_trades.open_time),
           close_time=EXCLUDED.close_time,
           open_price=CASE WHEN EXCLUDED.open_price IS NULL OR EXCLUDED.open_price=0 THEN wp_trades.open_price ELSE EXCLUDED.open_price END,
           close_price=EXCLUDED.close_price, stop_loss=EXCLUDED.stop_loss, take_profit=EXCLUDED.take_profit,
           profit=EXCLUDED.profit, commission=EXCLUDED.commission, swap=EXCLUDED.swap,
           comment=EXCLUDED.comment, synced_at=NOW(),
           is_qualified=NULL, violations=NULL, sl_check_result=NULL,
           sl_check_pending=true, sl_check_attempts=0`,
        [
          challengeId, registrationId, accountNumber, ft.ticket,
          ft.positionId || ticket,
          ft.symbol, ft.type, ft.volume,
          ft.openTime, ft.closeTime,
          ft.openPrice, ft.closePrice,
          ft.stopLoss ?? null, ft.takeProfit ?? null,
          ft.profit, ft.commission ?? 0, ft.swap ?? 0,
          ft.comment ?? null,
        ]
      );
    }

    // Re-evaluate the account
    const { wpEvaluationEngine } = require('../services/wpEvaluationEngine');
    await wpEvaluationEngine.evaluateSingleAccount(challengeId, registrationId);

    // Flush staging and update rankings
    const { leaderboardService } = require('../services/leaderboardService');
    await leaderboardService.flushStagingToLive(challengeId);
    await leaderboardService.updateRankings(challengeId);

    return res.json({ success: true, message: 'Trade replaced and account re-evaluated' });
  } catch (error) {
    console.error('Pull trade replace error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/export-leaderboard
 * Full leaderboard export — latest pull data with all client details
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/export-leaderboard`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const result = await db.query(
      `SELECT l.rank, l.nickname, l.account_type, l.is_cent,
              l.starting_balance, l.current_balance, l.adjusted_balance, l.normalized_balance,
              l.qualified_profit, l.gross_profit, l.profit_removed,
              l.total_trades, l.qualified_trades, l.flagged_trades, l.active_days,
              l.is_qualified, l.is_disqualified, l.disqualify_reason,
              l.last_trade_time, l.last_updated, l.zero_balance_at,
              r.username, r.email, r.account_number, r.mt5_server, r.investor_password,
              r.source, r.registration_balance, r.actual_starting_balance,
              r.pull_status, r.last_pull_at, r.registered_at
       FROM wp_leaderboard l
       JOIN trading_registrations r ON l.registration_id = r.id
       WHERE l.challenge_id = $1
       ORDER BY l.account_type, l.rank ASC NULLS LAST`,
      [challengeId]
    );
    return res.json({ leaderboard: result.rows });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/export-user-trades?registration_id=X
 * Full MT5 trade history for one participant including Fake SL detail columns
 */
// Crypto symbols trade 24/7, so unlike forex/metals they get no weekend/server-timezone
// grace period at the challenge boundaries — see isTradeInChallengeWindow() below.
const CRYPTO_TICKERS = ['BTC', 'ETH', 'LTC', 'XRP', 'DOGE', 'BCH', 'ADA', 'SOL', 'BNB', 'DOT', 'SHIB', 'TRX', 'AVAX'];
function isCryptoSymbol(symbol: string): boolean {
  const s = (symbol || '').toUpperCase();
  return CRYPTO_TICKERS.some(c => s.includes(c));
}
// Mirrors wpEvaluationEngine.isWeekend() — forex/metals market closes Fri 22:00 UTC,
// reopens Sun 22:00 UTC.
function isWeekendTime(d: Date): boolean {
  const day = d.getUTCDay();
  const hour = d.getUTCHours();
  if (day === 6) return true;
  if (day === 0 && hour < 22) return true;
  if (day === 5 && hour >= 22) return true;
  return false;
}
// Non-crypto trades near the challenge start/end get a small buffer because the MT5
// broker server's own timezone can shift a genuinely in-window trade's timestamp just
// outside the strict start_date/end_date boundary. Crypto trades 24/7, so there's no
// such excuse — they're held to the strict boundary with zero buffer, and a crypto
// trade landing on a weekend gets no special treatment either.
const BOUNDARY_BUFFER_MS = 6 * 60 * 60 * 1000; // 6 hours — absorbs broker server timezone drift
function isTradeInChallengeWindow(trade: any, startDate: Date, endDate: Date): boolean {
  const openMs = new Date(trade.open_time).getTime();
  const closeMs = new Date(trade.close_time).getTime();
  if (isCryptoSymbol(trade.symbol)) {
    // Strict — no buffer, no weekend grace. Crypto trades 24/7, so a crypto trade
    // landing on a weekend is never excused as "broker was closed" — exclude it.
    if (isWeekendTime(new Date(trade.open_time)) || isWeekendTime(new Date(trade.close_time))) return false;
    return openMs >= startDate.getTime() && closeMs <= endDate.getTime();
  }
  const bufferedStart = startDate.getTime() - BOUNDARY_BUFFER_MS;
  const bufferedEnd = endDate.getTime() + BOUNDARY_BUFFER_MS;
  return openMs >= bufferedStart && closeMs <= bufferedEnd;
}

app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/export-user-trades`, adminIpCheck, async (req, res) => {
  try {
    const challengeId    = parseInt(req.params.id);
    const registrationId = parseInt(req.query.registration_id as string);
    if (!registrationId) return res.status(400).json({ error: 'registration_id required' });

    const [challengeRes, regRes, tradesRes] = await Promise.all([
      db.query(`SELECT title, start_date, end_date FROM trading_challenges WHERE id = $1`, [challengeId]),
      db.query(`SELECT nickname, account_number, mt5_server, account_type, is_cent FROM trading_registrations WHERE id = $1`, [registrationId]),
      db.query(
        `SELECT ticket, position_id, symbol, trade_type, volume, open_time, close_time,
                open_price, close_price, stop_loss, take_profit, profit, commission, swap,
                is_qualified, violations, sl_check_pending,
                sl_allowed_price, sl_max_adverse_price, sl_check_result
         FROM wp_trades
         WHERE registration_id = $1 AND challenge_id = $2
         ORDER BY close_time ASC`,
        [registrationId, challengeId]
      ),
    ]);

    const challenge = challengeRes.rows[0];
    const reg       = regRes.rows[0];
    if (!reg) return res.status(404).json({ error: 'Registration not found' });

    // Only export trades that actually fall within the challenge period (the same
    // trades the evaluator scores) — not the full raw MT5 history for the account,
    // which can include trades placed after the challenge ended/before it started.
    const challengeStart = challenge?.start_date ? new Date(challenge.start_date) : null;
    const challengeEnd   = challenge?.end_date ? new Date(challenge.end_date) : null;
    const filteredTrades = (challengeStart && challengeEnd)
      ? tradesRes.rows.filter((t: any) => isTradeInChallengeWindow(t, challengeStart, challengeEnd))
      : tradesRes.rows;

    return res.json({
      challenge: { title: challenge?.title, startDate: challenge?.start_date, endDate: challenge?.end_date },
      user: { nickname: reg.nickname, accountNumber: reg.account_number, server: reg.mt5_server, accountType: reg.account_type, isCent: reg.is_cent },
      trades: filteredTrades.map((t: any) => ({
        ticket:           t.ticket,
        positionId:       t.position_id,
        symbol:           t.symbol,
        type:             t.trade_type,
        volume:           t.volume,
        openTime:         t.open_time,
        closeTime:        t.close_time,
        openPrice:        t.open_price,
        closePrice:       t.close_price,
        stopLoss:         t.stop_loss,
        takeProfit:       t.take_profit,
        profit:           t.profit,
        commission:       t.commission,
        swap:             t.swap,
        isQualified:      t.is_qualified,
        violations:       t.violations || [],
        slCheckPending:   t.sl_check_pending,
        slAllowedPrice:   t.sl_allowed_price,
        slMaxAdversePrice:t.sl_max_adverse_price,
        slCheckResult:    t.sl_check_result,
      })),
    });
  } catch (error) {
    console.error('Export user trades error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/challenge/:id/failed-accounts
 * Get accounts that failed in the last pull cycle
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/failed-accounts`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const { leaderboardService } = require('../services/leaderboardService');
    const allFailed = await leaderboardService.getFailedAccounts(challengeId);

    // Credential failures (password_changed / invalid_credentials — confirmed via the
    // 2-terminal real-login confirmation flow) get their own bucket, separate from
    // every other kind of pull failure (timeouts, API errors, etc.). They're the only
    // ones that need/get an "Update Password" action; mixing them into the generic
    // "failed" list made it hard for the admin to tell which accounts actually need a
    // password fix vs. which just need a retry.
    // Credential failures show up regardless of disqualified status (the 48h auto-DQ
    // rule shouldn't make them disappear from the admin's view — see leaderboardService
    // .getFailedAccounts()). The generic "failed" bucket keeps the old behavior of
    // excluding disqualified accounts (those belong in the "skipped" bucket below).
    const credentialFailures = allFailed.filter((f: any) => f.pull_status === 'password_changed' || f.pull_status === 'invalid_credentials');
    const failed = allFailed.filter((f: any) => f.pull_status !== 'password_changed' && f.pull_status !== 'invalid_credentials' && !f.disqualified);

    // Also get skipped accounts (zero balance WITH trades = blown, or disqualified)
    // Exclude accounts that are still being pulled (0 balance + 0 trades = hasn't deposited yet, still pulling)
    const skipped = await db.query(
      `SELECT r.id as registration_id, r.account_number, r.username, r.nickname, r.email, r.account_type, r.disqualified, r.disqualified_reason,
              l.current_balance, l.zero_balance_at, l.total_trades
       FROM trading_registrations r
       LEFT JOIN wp_leaderboard l ON r.id = l.registration_id
       WHERE r.challenge_id = $1
         AND r.investor_password IS NOT NULL
         AND r.connection_verified = true
         AND (
           r.disqualified = true
           OR (l.zero_balance_at IS NOT NULL AND l.total_trades > 0 AND r.actual_starting_balance IS NOT NULL)
         )
       ORDER BY r.disqualified DESC, l.zero_balance_at DESC NULLS LAST`,
      [challengeId]
    );

    return res.json({ failed, credentialFailures, skipped: skipped.rows });
  } catch (error) {
    console.error('Failed accounts error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/:secretPath/challenge/:id/force-pull
 * Trigger a manual pull cycle for a specific challenge (forceAll — bypasses blown/DQ filters)
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/force-pull`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id as string);
    const globalScheduler = (global as any).__vpsPullScheduler;
    if (globalScheduler) {
      globalScheduler.runPullCycleForChallenge(challengeId).catch((e: any) => console.error('Force pull error:', e));
      return res.json({ success: true, message: 'Pull cycle started. Watch the progress bar.' });
    }
    return res.json({ success: false, message: 'Pull scheduler not initialized yet — try again in a moment' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/:secretPath/challenge/:id/force-pull-rank
 * Full Pull (Non-DQ) — full history pull from challenge start, but skips DQ'd, blown, and credential failures.
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/force-pull-rank`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id as string);
    const globalScheduler = (global as any).__vpsPullScheduler;
    if (!globalScheduler) {
      return res.json({ success: false, message: 'Pull scheduler not initialized yet — try again in a moment' });
    }

    // Reset last_pull_at for active accounts only (not DQ'd, not credential failures)
    await db.query(
      `UPDATE trading_registrations SET last_pull_at = NULL
       WHERE challenge_id = $1
         AND disqualified = false
         AND investor_password IS NOT NULL
         AND connection_verified = true
         AND (pull_status IS NULL OR pull_status NOT IN ('password_changed'))`,
      [challengeId]
    );

    // Run normal pull cycle (not forceAll — respects DQ/credential filters)
    globalScheduler.runPullCycle().catch((e: any) => console.error('Full pull non-DQ error:', e));
    return res.json({ success: true, message: 'Full pull (non-DQ) started — pulling full history for active accounts only.' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/:secretPath/challenge/:id/full-pull
 * Full pull (non-incremental) + evaluate + flush + rank update.
 * Works regardless of challenge status — admin authority.
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/full-pull`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id as string);
    const globalScheduler = (global as any).__vpsPullScheduler;
    if (!globalScheduler) {
      return res.json({ success: false, message: 'Pull scheduler not initialized yet' });
    }

    // Reset last_pull_at for all accounts (forces full history pull from challenge start)
    await db.query(
      `UPDATE trading_registrations SET last_pull_at = NULL WHERE challenge_id = $1 AND disqualified = false AND investor_password IS NOT NULL`,
      [challengeId]
    );

    // Run pull cycle directly for this challenge (bypasses resolveChallengeForPull)
    globalScheduler.runPullCycleForChallenge(challengeId).then(async () => {
      try {
        const { leaderboardService } = require('../services/leaderboardService');
        await leaderboardService.flushStagingToLive(challengeId);
        await leaderboardService.ensureAllParticipantsHaveEntries(challengeId);
        await leaderboardService.updateRankings(challengeId);
        console.log(`✅ Full pull + evaluate + rank: Complete for challenge ${challengeId}`);
      } catch (e) {
        console.error('Full pull rank update error:', e);
      }
    }).catch((e: any) => console.error('Full pull error:', e));

    return res.json({ success: true, message: 'Full pull started (non-incremental). Will evaluate + update rankings after completion.' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/pull-status
 * Get current pull cycle status (is it running, progress)
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/pull-status`, adminIpCheck, async (req, res) => {
  try {
    // Check if there's a currently running batch
    const running = await db.query(
      `SELECT id, challenge_id, total_accounts, started_at, phase, phase2_total, phase2_processed, phase2_round
       FROM wp_pull_batches WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`
    );

    if (running.rows.length > 0) {
      const batch = running.rows[0];
      const elapsed = Math.round((Date.now() - new Date(batch.started_at).getTime()) / 1000);
      const phase = batch.phase || 'pulling';

      if (phase === 'resolving_nulls' || phase === 'reconciling' || phase === 'evaluating') {
        // Phase 1.5/2 progress is driven explicitly by the scheduler — completePullBatch()
        // is only called once phase 2 + the deferred evaluation finish. No auto-complete
        // heuristic here, just report progress as-is.
        const phase2Percent = batch.phase2_total > 0
          ? Math.min(100, Math.round((batch.phase2_processed / batch.phase2_total) * 100))
          : 0;
        return res.json({
          isRunning: true,
          batchId: batch.id,
          totalAccounts: batch.total_accounts,
          processed: batch.total_accounts,
          percent: 100,
          phase,
          phase2Total: batch.phase2_total,
          phase2Processed: batch.phase2_processed,
          phase2Round: batch.phase2_round,
          phase2MaxRounds: 5,
          phase2Percent,
          elapsedSeconds: elapsed,
          startedAt: batch.started_at,
        });
      }

      // Count how many have been processed so far (success + failed since batch started)
      const processed = await db.query(
        `SELECT COUNT(*) as cnt FROM trading_registrations WHERE challenge_id = $1 AND last_pull_at >= $2`,
        [batch.challenge_id, batch.started_at]
      );
      const processedCount = Math.min(parseInt(processed.rows[0].cnt), batch.total_accounts);
      const percent = batch.total_accounts > 0 ? Math.min(100, Math.round((processedCount / batch.total_accounts) * 100)) : 0;

      // Phase 1 (pulling) is done when all accounts processed, but the batch row only
      // flips to status='completed' once the scheduler finishes phase 2 + evaluation
      // (completePullBatch()). Until then, just report phase 1 as 100% — no auto-complete
      // here, that would hide the bar before phase 2 has a chance to start.
      return res.json({
        isRunning: true,
        batchId: batch.id,
        totalAccounts: batch.total_accounts,
        processed: processedCount,
        percent,
        phase: 'pulling',
        elapsedSeconds: elapsed,
        startedAt: batch.started_at,
      });
    }

    // Not running — get last completed batch
    const last = await db.query(
      `SELECT id, challenge_id, total_accounts, successful, failed, new_trades_found, status, started_at, completed_at, phase, phase2_total, phase2_processed, phase2_round
       FROM wp_pull_batches ORDER BY started_at DESC LIMIT 1`
    );

    if (last.rows.length > 0) {
      const b = last.rows[0];

      // Reconciliation/null-resolution outcome: phase2_total = 0 means nothing
      // needed fixing (trivially successful). Otherwise compare against how many
      // positions are still actually missing/null right now, since phase2_processed
      // just counts attempts, not successes (resolveOpensForAccount can come back empty).
      let reconciled = true;
      let stillNullCount = 0;
      if (b.phase === 'resolving_nulls' || b.phase2_total > 0) {
        const stillNull = await db.query(
          `SELECT COUNT(*) as cnt FROM wp_trades WHERE challenge_id = $1 AND open_time IS NULL AND close_time >= $2`,
          [b.challenge_id, b.started_at]
        );
        stillNullCount = parseInt(stillNull.rows[0].cnt);
        reconciled = stillNullCount === 0;
      }

      // Exact accounts that failed during this specific batch
      const failedDetail = await db.query(
        `SELECT pe.account_number, pe.error_code, pe.error_message, r.nickname, r.username
         FROM wp_pull_errors pe
         LEFT JOIN trading_registrations r ON r.id = pe.registration_id
         WHERE pe.pull_batch_id = $1
         ORDER BY pe.created_at ASC`,
        [b.id]
      );

      // OHLC candle stats for this challenge
      const ohlcStats = await db.query(
        `SELECT symbol, COUNT(*) as candle_count, MIN(time) as first_candle, MAX(time) as last_candle
         FROM ohlc_candles WHERE challenge_id = $1
         GROUP BY symbol ORDER BY symbol`,
        [b.challenge_id]
      );
      const challengeForOhlc = await db.query(`SELECT start_date FROM trading_challenges WHERE id = $1`, [b.challenge_id]);
      const ohlcChallengeStartMs = challengeForOhlc.rows[0] ? new Date(challengeForOhlc.rows[0].start_date).getTime() : 0;
      const ohlcNowMs = Date.now();
      const totalExpectedMinutes = ohlcChallengeStartMs > 0 ? Math.floor((ohlcNowMs - ohlcChallengeStartMs) / 60000) : 0;
      const ohlcSymbols = ohlcStats.rows.map((r: any) => ({
        symbol: r.symbol,
        candleCount: parseInt(r.candle_count),
        coveragePercent: totalExpectedMinutes > 0 ? Math.min(100, Math.round((parseInt(r.candle_count) / totalExpectedMinutes) * 100)) : 0,
      }));
      const totalOhlcCandles = ohlcSymbols.reduce((s: number, x: any) => s + x.candleCount, 0);

      return res.json({
        isRunning: false,
        lastBatch: {
          id: b.id,
          totalAccounts: b.total_accounts,
          successful: b.successful,
          failed: b.failed,
          newTrades: b.new_trades_found,
          status: b.status,
          startedAt: b.started_at,
          completedAt: b.completed_at,
          durationSec: b.completed_at ? Math.round((new Date(b.completed_at).getTime() - new Date(b.started_at).getTime()) / 1000) : null,
          phase: b.phase,
          phase2Total: b.phase2_total,
          phase2Processed: b.phase2_processed,
          phase2Round: b.phase2_round,
          reconciled,
          stillNullCount,
          ohlc: {
            totalCandles: totalOhlcCandles,
            symbolCount: ohlcSymbols.length,
            symbols: ohlcSymbols,
            expectedMinutesPerSymbol: totalExpectedMinutes,
          },
          failedAccounts: failedDetail.rows.map((f: any) => ({
            accountNumber: f.account_number,
            nickname: f.nickname,
            username: f.username,
            errorCode: f.error_code,
            errorMessage: f.error_message,
          })),
        },
      });
    }

    return res.json({ isRunning: false, lastBatch: null });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/:secretPath/cancel-pull
 * Cancel an in-progress pull cycle — drains the queue so workers stop after current account.
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/cancel-pull`, adminIpCheck, async (req, res) => {
  try {
    const globalScheduler = (global as any).__vpsPullScheduler;
    if (!globalScheduler) {
      return res.json({ success: false, message: 'Scheduler not available' });
    }
    // Abort in-flight requests and drain queue
    globalScheduler.cancelPull();
    // Mark the running batch as cancelled in DB so pull-status stops showing it
    await db.query(
      `UPDATE wp_pull_batches SET status = 'cancelled', completed_at = NOW() WHERE status = 'running'`
    );
    return res.json({ success: true, message: 'Pull cancelled' });
  } catch (error) {
    console.error('Cancel pull error:', error);
    return res.status(500).json({ error: 'Internal server error', detail: (error as Error).message });
  }
});

/**
 * POST /api/admin/:secretPath/challenge/:id/retry-sl-check
 * Re-run SL candle check for all sl_check_pending trades of a specific account.
 * Immediately updates evaluation + flushes leaderboard.
 * Body: { registrationId }
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/retry-sl-check`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const { registrationId } = req.body;
    if (!registrationId) return res.status(400).json({ error: 'registrationId required' });

    const { evaluationEngine } = require('../services/wpEvaluationEngine');
    const result = await evaluationEngine.recheckSlPendingForAccount(challengeId, registrationId);

    if (result.error) {
      return res.status(500).json({ success: false, error: result.error });
    }
    return res.json({
      success: true,
      checked: result.checked,
      violations: result.violations,
      cleared: result.cleared,
      nickname: result.nickname,
      message: result.checked === 0
        ? `No pending SL trades found for ${result.nickname}`
        : `${result.checked} trade(s) checked — ${result.violations} violation(s) found, ${result.cleared} cleared. Leaderboard updated.`,
    });
  } catch (error) {
    console.error('Retry SL check error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/:secretPath/challenge/:id/retry-account
 * Retry a single failed account — actually pulls from VPS now
 * Body: { registrationId }
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/retry-account`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const { registrationId } = req.body;
    if (!registrationId) return res.status(400).json({ error: 'registrationId required' });

    // Get account details
    const regResult = await db.query(
      `SELECT id, account_number, mt5_server, investor_password, user_id, username, nickname
       FROM trading_registrations WHERE id = $1 AND challenge_id = $2`,
      [registrationId, challengeId]
    );
    if (regResult.rows.length === 0) return res.status(404).json({ error: 'Registration not found' });

    const reg = regResult.rows[0];
    const vpsUrl = config.vpsApiUrl;
    const vpsKey = config.vpsApiKey;

    if (!vpsUrl || !vpsKey) {
      // Fallback: just queue for next cycle
      await db.query(
        `UPDATE trading_registrations SET pull_status = 'retry_requested', pull_error = 'Queued from admin panel' WHERE id = $1`,
        [registrationId]
      );
      return res.json({ success: true, message: 'VPS not configured — queued for next cycle', immediate: false });
    }

    // Try pulling directly from VPS
    const axios = require('axios');
    let pullSuccess = false;
    let pullError = '';

    for (let terminalId = 1; terminalId <= 3; terminalId++) {
      try {
        const lastPull = await db.query(`SELECT last_pull_at FROM trading_registrations WHERE id = $1`, [registrationId]);
        const fromDate = lastPull.rows[0]?.last_pull_at ? new Date(lastPull.rows[0].last_pull_at).toISOString() : null;

        // Get challenge start_date for orders (provides open_time/open_price for all positions)
        const challengeInfo = await db.query(`SELECT start_date FROM trading_challenges WHERE id = $1`, [challengeId]);
        const ordersFromDate = challengeInfo.rows[0]?.start_date ? new Date(challengeInfo.rows[0].start_date).toISOString() : fromDate;

        const response = await axios.post(`${vpsUrl}/pull`, {
          account: reg.account_number,
          server: reg.mt5_server,
          password: reg.investor_password,
          api_key: vpsKey,
          terminal_id: terminalId,
          from_date: fromDate,
          orders_from_date: ordersFromDate,
        }, { timeout: 45000 });

        if (response.data?.success) {
          // Save trades
          const trades = response.data.trades || [];
          for (const trade of trades) {
            try {
              await db.query(
                `INSERT INTO wp_trades (challenge_id, registration_id, account_number, ticket, symbol, trade_type, volume, open_time, close_time, open_price, close_price, stop_loss, take_profit, profit, commission, swap, comment)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                 ON CONFLICT (challenge_id, account_number, ticket) DO UPDATE SET profit=EXCLUDED.profit, close_time=EXCLUDED.close_time, close_price=EXCLUDED.close_price, commission=EXCLUDED.commission, swap=EXCLUDED.swap, synced_at=NOW()`,
                [challengeId, registrationId, reg.account_number, trade.ticket, trade.symbol||null, trade.type||null, trade.volume||0, trade.open_time||null, trade.close_time||null, trade.open_price||0, trade.close_price||0, trade.stop_loss||null, trade.take_profit||null, trade.profit||0, trade.commission||0, trade.swap||0, trade.comment||null]
              );
            } catch {}
          }

          // Update status
          await db.query(
            `UPDATE trading_registrations SET last_pull_at = NOW(), pull_status = 'success', pull_error = NULL WHERE id = $1`,
            [registrationId]
          );

          // Run evaluation
          try {
            const { evaluationEngine } = require('../services/wpEvaluationEngine');
            await evaluationEngine.evaluateSingleAccount(challengeId, registrationId);
          } catch {}

          pullSuccess = true;
          return res.json({
            success: true, immediate: true,
            message: `Pull successful — ${trades.length} trades synced, evaluation updated`,
            tradesCount: trades.length,
          });
        } else {
          pullError = response.data?.message || 'API returned failure';
        }
      } catch (err: any) {
        pullError = err.message || 'Connection failed';
      }
    }

    // All terminals failed
    await db.query(
      `UPDATE trading_registrations SET pull_status = 'retry_failed', pull_error = $1, last_pull_at = NOW() WHERE id = $2`,
      [pullError, registrationId]
    );
    return res.json({ success: false, message: `Retry failed: ${pullError}`, immediate: true });
  } catch (error) {
    console.error('Retry account error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// In-memory result cache for individual-account pulls, keyed by registrationId.
// The pull itself can take 1-3 minutes (multiple terminal retries, each with a
// reconcile/resolve pass), which is long enough to get killed by an upstream
// proxy/edge timeout if held open as a single synchronous HTTP request. So the
// route below kicks the work off in the background and returns immediately;
// the frontend polls pull-single-status until a result lands here.
const individualPullResults = new Map<number, any>();

/**
 * POST /api/admin/:secretPath/challenge/:id/pull-single-account
 * Kicks off a full pull + evaluate + rank update for ONE specific account
 * (by registrationId) in the background and returns immediately. Works on
 * all registrations including disqualified ones. Poll pull-single-status
 * for the result.
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/pull-single-account`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const { registrationId } = req.body;
    if (!registrationId) return res.status(400).json({ error: 'registrationId required' });

    // Snapshot state BEFORE pull
    const before = await db.query(
      `SELECT r.disqualified, r.disqualified_reason, l.rank as prev_rank,
              (SELECT COUNT(*) FROM wp_trades WHERE registration_id = $1) as trade_count
       FROM trading_registrations r
       LEFT JOIN wp_leaderboard l ON l.registration_id = r.id
       WHERE r.id = $1 AND r.challenge_id = $2`,
      [registrationId, challengeId]
    );
    if (before.rows.length === 0) return res.status(404).json({ error: 'Registration not found' });
    const prevRank = before.rows[0].prev_rank;
    const prevTradeCount = parseInt(before.rows[0].trade_count || '0');

    // NULL out last_pull_at → forces full pull from challenge start (not just incremental)
    await db.query(
      `UPDATE trading_registrations SET last_pull_at = NULL WHERE id = $1`,
      [registrationId]
    );

    const scheduler = (global as any).__vpsPullScheduler;
    if (!scheduler) return res.status(503).json({ error: 'Pull scheduler not initialised yet — try again in a moment' });

    individualPullResults.delete(registrationId);
    res.json({ success: true, started: true });

    // Run the actual pull + evaluate + rank update in the background.
    (async () => {
      try {
        const pullResult = await scheduler.retrySingleAccount(registrationId, challengeId);

        let flaggedCount = 0;
        let totalTrades = 0;
        try {
          const { evaluationEngine } = require('../services/wpEvaluationEngine');
          await evaluationEngine.evaluateSingleAccount(challengeId, registrationId);
          const tradeCountResult = await db.query(
            `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE NOT is_qualified) as flagged
             FROM wp_trades WHERE registration_id = $1`,
            [registrationId]
          );
          totalTrades = parseInt(tradeCountResult.rows[0]?.total || '0');
          flaggedCount = parseInt(tradeCountResult.rows[0]?.flagged || '0');
        } catch {}

        try {
          const { leaderboardService } = require('../services/leaderboardService');
          await leaderboardService.flushStagingToLive(challengeId);
          await leaderboardService.ensureAllParticipantsHaveEntries(challengeId);
          await leaderboardService.updateRankings(challengeId);
        } catch {}

        const after = await db.query(
          `SELECT r.disqualified, r.disqualified_reason, l.rank as new_rank
           FROM trading_registrations r
           LEFT JOIN wp_leaderboard l ON l.registration_id = r.id
           WHERE r.id = $1`,
          [registrationId]
        );

        const newRank = after.rows[0]?.new_rank ?? null;
        const isDisqualified = after.rows[0]?.disqualified ?? false;
        const dqReason = after.rows[0]?.disqualified_reason ?? null;
        const newTradeCount = totalTrades;
        const tradesAdded = Math.max(0, newTradeCount - prevTradeCount);

        individualPullResults.set(registrationId, {
          done: true,
          success: pullResult.success,
          errorMessage: pullResult.success ? null : (pullResult.errorMessage || 'Pull failed'),
          terminalAttempts: pullResult.success ? null : ((pullResult as any).terminalAttempts || null),
          tradesFound: newTradeCount,
          tradesAdded,
          faultsFound: flaggedCount,
          prevRank,
          newRank,
          isDisqualified,
          dqReason,
        });
      } catch (error) {
        console.error('pull-single-account background error:', error);
        individualPullResults.set(registrationId, {
          done: true,
          success: false,
          errorMessage: 'Internal error during pull',
        });
      }
    })();

  } catch (error) {
    console.error('pull-single-account error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/:secretPath/pull-single-status?registrationId=X
 * Poll for the result of a background pull-single-account run.
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/pull-single-status`, adminIpCheck, async (req, res) => {
  const registrationId = parseInt(req.query.registrationId as string);
  if (!registrationId) return res.status(400).json({ error: 'registrationId required' });
  const result = individualPullResults.get(registrationId);
  if (!result) return res.json({ done: false });
  return res.json(result);
});

/**
 * POST /api/admin/:secretPath/challenge/:id/retry-all-failed
 * Queue all failed accounts for retry in next cycle
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/retry-all-failed`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const result = await db.query(
      `UPDATE trading_registrations SET pull_status = 'retry_requested', pull_error = 'Bulk retry from admin panel'
       WHERE challenge_id = $1 AND disqualified = false AND pull_status NOT IN ('success', 'password_changed')
         AND pull_status IS NOT NULL
       RETURNING id`,
      [challengeId]
    );
    return res.json({ success: true, count: result.rowCount, message: `${result.rowCount} accounts queued for priority retry` });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/:secretPath/challenge/:id/update-password
 * Admin updates investor password for a failed account
 * Body: { registrationId, newPassword }
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/update-password`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const { registrationId, newPassword } = req.body;
    if (!registrationId || !newPassword) return res.status(400).json({ error: 'registrationId and newPassword required' });

    // Get account details
    const regResult = await db.query(
      `SELECT account_number, mt5_server, pull_status, disqualified, disqualified_reason FROM trading_registrations WHERE id = $1 AND challenge_id = $2`,
      [registrationId, challengeId]
    );
    if (regResult.rows.length === 0) return res.status(404).json({ error: 'Registration not found' });
    if (regResult.rows[0].pull_status === 'success' && !regResult.rows[0].disqualified) return res.json({ success: false, message: 'Already resolved — password was updated from another channel' });

    const reg = regResult.rows[0];

    // Verify new password with VPS
    const vpsUrl = config.vpsApiUrl;
    const vpsKey = config.vpsApiKey;
    if (vpsUrl && vpsKey) {
      try {
        const axios = require('axios');
        const verifyRes = await axios.post(`${vpsUrl}/verify`, {
          account: reg.account_number, server: reg.mt5_server, password: newPassword, api_key: vpsKey,
        }, { timeout: 25000 });

        if (verifyRes.data?.success) {
          // Update password and reset status. Note: deliberately do NOT touch
          // `disqualified` here — if this account was auto-DQ'd by the 48h
          // no-password-update rule, it stays disqualified until the admin
          // explicitly confirms reinstatement via /reinstate-account below.
          await db.query(
            `UPDATE trading_registrations SET investor_password = $1, pull_status = 'success', pull_error = NULL, connection_verified = true, connection_verified_at = NOW() WHERE id = $2`,
            [newPassword, registrationId]
          );

          if (reg.disqualified) {
            // Password is fixed and verified, but the account is disqualified —
            // hold off on the backfill pull / rank update until the admin
            // explicitly confirms reinstatement (separate endpoint below).
            return res.json({
              success: true,
              verified: true,
              requiresReinstateConfirm: true,
              disqualifiedReason: reg.disqualified_reason,
              message: 'Password updated and verified, but this account is disqualified — confirm reinstatement to resume pulls and rejoin the leaderboard.',
            });
          }

          // Backfill: force a full pull for this account + push to the live leaderboard
          // immediately + notify the user, instead of leaving it for the next scheduled
          // incremental cron (which would miss trades from the outage window). Fire-and-
          // forget — the admin already gets their response below.
          const globalScheduler = (global as any).__vpsPullScheduler;
          if (globalScheduler) {
            globalScheduler.recoverAccountAfterCredentialFix(registrationId, challengeId, 'admin')
              .catch((e: any) => console.error('recoverAccountAfterCredentialFix (admin flow) failed:', e));
          }
          return res.json({ success: true, verified: true, message: 'Password updated and verified — account is back online, backfill pull + ranking update started' });
        } else {
          return res.json({ success: false, verified: false, message: `Verification failed: ${verifyRes.data?.message || 'Invalid password'}` });
        }
      } catch (err: any) {
        // VPS unreachable — save password anyway
        await db.query(
          `UPDATE trading_registrations SET investor_password = $1, pull_status = 'pending_verify', pull_error = NULL WHERE id = $2`,
          [newPassword, registrationId]
        );
        return res.json({ success: true, verified: false, message: 'Password saved but VPS unreachable — will verify on next pull cycle' });
      }
    } else {
      // No VPS configured — just save
      await db.query(
        `UPDATE trading_registrations SET investor_password = $1, pull_status = 'pending_verify', pull_error = NULL WHERE id = $2`,
        [newPassword, registrationId]
      );
      return res.json({ success: true, verified: false, message: 'Password saved — will verify on next pull cycle' });
    }
  } catch (error) {
    console.error('Admin update password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/:secretPath/challenge/:id/reinstate-account
 * Admin explicitly confirms reinstatement of a disqualified account whose
 * credential failure was just fixed (password updated + verified). Requires
 * { registrationId, confirm: true } — the frontend must show the admin an
 * explicit "are you sure?" prompt (with the disqualified_reason) before
 * calling this, since un-DQing reverses a real challenge-rules penalty.
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/reinstate-account`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const { registrationId, confirm } = req.body;
    if (!registrationId) return res.status(400).json({ error: 'registrationId required' });
    if (!confirm) return res.json({ success: false, message: 'Reinstatement requires explicit confirmation' });

    const regResult = await db.query(
      `SELECT account_number, disqualified, pull_status FROM trading_registrations WHERE id = $1 AND challenge_id = $2`,
      [registrationId, challengeId]
    );
    if (regResult.rows.length === 0) return res.status(404).json({ error: 'Registration not found' });
    const reg = regResult.rows[0];
    if (!reg.disqualified) return res.json({ success: false, message: 'Account is not disqualified — nothing to reinstate' });
    if (reg.pull_status !== 'success') return res.json({ success: false, message: 'Password has not been verified yet — update the password first' });

    await db.query(
      `UPDATE trading_registrations SET disqualified = false, disqualified_at = NULL, disqualified_reason = NULL WHERE id = $1`,
      [registrationId]
    );
    await db.query(
      `UPDATE wp_leaderboard SET is_disqualified = false, disqualify_reason = NULL WHERE registration_id = $1`,
      [registrationId]
    ).catch(() => {});

    // Now run the same backfill pull + evaluate + rank + notify flow as a normal recovery.
    const globalScheduler = (global as any).__vpsPullScheduler;
    if (globalScheduler) {
      globalScheduler.recoverAccountAfterCredentialFix(registrationId, challengeId, 'admin')
        .catch((e: any) => console.error('recoverAccountAfterCredentialFix (reinstate flow) failed:', e));
    }

    return res.json({ success: true, message: `Account ${reg.account_number} reinstated — backfill pull + ranking update started` });
  } catch (error) {
    console.error('Reinstate account error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/me/update-password
 * User updates their own investor password (from web dashboard banner)
 * Body: { newPassword }
 */
app.post('/api/me/update-password', authMiddleware, async (req: any, res) => {
  try {
    const { registrationId } = req.user;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 3) return res.status(400).json({ error: 'Password too short' });

    const regResult = await db.query(
      `SELECT account_number, mt5_server, pull_status, challenge_id FROM trading_registrations WHERE id = $1`,
      [registrationId]
    );
    if (regResult.rows.length === 0) return res.status(404).json({ error: 'Registration not found' });
    const reg = regResult.rows[0];

    if (reg.pull_status !== 'password_changed') {
      return res.json({ success: false, message: 'No password update needed — your account is fine' });
    }

    // Verify with VPS
    const vpsUrl = config.vpsApiUrl;
    const vpsKey = config.vpsApiKey;
    if (vpsUrl && vpsKey) {
      try {
        const axios = require('axios');
        const verifyRes = await axios.post(`${vpsUrl}/verify`, {
          account: reg.account_number, server: reg.mt5_server, password: newPassword, api_key: vpsKey,
        }, { timeout: 25000 });

        if (verifyRes.data?.success) {
          await db.query(
            `UPDATE trading_registrations SET investor_password = $1, pull_status = 'success', pull_error = NULL, connection_verified = true, connection_verified_at = NOW() WHERE id = $2`,
            [newPassword, registrationId]
          );
          return res.json({ success: true, verified: true, message: 'Password updated! Your account is back online.' });
        } else {
          return res.json({ success: false, verified: false, message: 'Incorrect password — please check and try again' });
        }
      } catch {
        await db.query(
          `UPDATE trading_registrations SET investor_password = $1, pull_status = 'pending_verify', pull_error = NULL WHERE id = $2`,
          [newPassword, registrationId]
        );
        return res.json({ success: true, verified: false, message: 'Password saved — we\'ll verify on the next sync cycle' });
      }
    }

    await db.query(
      `UPDATE trading_registrations SET investor_password = $1, pull_status = 'pending_verify', pull_error = NULL WHERE id = $2`,
      [newPassword, registrationId]
    );
    return res.json({ success: true, verified: false, message: 'Password saved' });
  } catch (error) {
    console.error('User update password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/:secretPath/challenge/:id/verify-account
 * Check if stored credentials still work for a participant
 * Body: { registrationId }
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/verify-account`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const { registrationId } = req.body;
    if (!registrationId) return res.status(400).json({ error: 'registrationId required' });

    const regResult = await db.query(
      `SELECT account_number, mt5_server, investor_password FROM trading_registrations WHERE id = $1 AND challenge_id = $2`,
      [registrationId, challengeId]
    );
    if (regResult.rows.length === 0) return res.status(404).json({ error: 'Registration not found' });

    const reg = regResult.rows[0];
    const vpsUrl = config.vpsApiUrl;
    const vpsKey = config.vpsApiKey;

    if (!vpsUrl || !vpsKey) {
      return res.json({ verified: false, error: 'VPS not configured' });
    }

    // Try up to 3 times with 2s delay between attempts
    const axios = require('axios');
    let lastError = '';

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const verifyRes = await axios.post(`${vpsUrl}/verify`, {
          account: reg.account_number, server: reg.mt5_server, password: reg.investor_password, api_key: vpsKey,
          terminal_id: attempt, // Try different terminals
        }, { timeout: 25000 });

        if (verifyRes.data?.success) {
          await db.query(
            `UPDATE trading_registrations SET connection_verified = true, connection_verified_at = NOW() WHERE id = $1`,
            [registrationId]
          );
          // Get balance from response or from leaderboard
          let balance = verifyRes.data.balance !== undefined ? verifyRes.data.balance : null;
          let equity = verifyRes.data.equity !== undefined ? verifyRes.data.equity : null;
          console.log(`[Verify] VPS verify response: balance=${verifyRes.data.balance}, equity=${verifyRes.data.equity}, keys=${Object.keys(verifyRes.data).join(',')}`);

          // If VPS didn't return balance, try a quick pull to get it
          if (!balance) {
            try {
              const pullRes = await axios.post(`${vpsUrl}/pull`, {
                account: reg.account_number, server: reg.mt5_server, password: reg.investor_password,
                api_key: vpsKey, terminal_id: attempt,
              }, { timeout: 35000 });
              if (pullRes.data?.success) {
                balance = pullRes.data.balance !== undefined ? pullRes.data.balance : balance;
                equity = pullRes.data.equity !== undefined ? pullRes.data.equity : equity;
              }
              console.log(`[Verify] Pull response balance: ${pullRes.data?.balance}, equity: ${pullRes.data?.equity}`);
            } catch (pullErr: any) {
              console.log(`[Verify] Pull failed: ${pullErr.message}`);
            }
          }

          // Save balance to registration for overview display + detect cent by currency
          if (balance !== null && balance !== undefined) {
            const vpsCurrency = (verifyRes.data.currency || '').toUpperCase();
            const isCent = vpsCurrency === 'USC' || vpsCurrency === 'USCENT';
            await db.query(
              `UPDATE trading_registrations SET last_known_balance = $1, registration_balance = COALESCE(registration_balance, $1), is_cent = $3 WHERE id = $2`,
              [balance, registrationId, isCent]
            );
          }

          // Still no balance? Get from leaderboard
          if (!balance) {
            const lb = await db.query(`SELECT current_balance FROM wp_leaderboard WHERE registration_id = $1`, [registrationId]);
            if (lb.rows.length > 0 && lb.rows[0].current_balance) balance = parseFloat(lb.rows[0].current_balance);
          }

          // Get last pull status for context
          const pullInfo = await db.query(`SELECT pull_status, pull_error, last_pull_at FROM trading_registrations WHERE id = $1`, [registrationId]);
          const pullStatus = pullInfo.rows[0]?.pull_status;
          const pullError = pullInfo.rows[0]?.pull_error;

          return res.json({
            verified: true, balance, equity, attempts: attempt,
            pullStatus, pullError: pullStatus !== 'success' ? pullError : null,
          });
        } else {
          lastError = verifyRes.data?.message || 'Connection failed';
          // If credential error, don't retry
          const msg = (lastError).toLowerCase();
          if (msg.includes('authorization') || msg.includes('invalid') || msg.includes('password')) {
            return res.json({ verified: false, error: lastError, attempts: attempt, credentialIssue: true });
          }
        }
      } catch (err: any) {
        lastError = err.code === 'ECONNABORTED' ? 'Timeout' : (err.message || 'VPS unreachable');
      }

      // Wait 2s before retry (except last attempt)
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
    }

    return res.json({ verified: false, error: `Failed after 3 attempts: ${lastError}`, attempts: 3 });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== DISCORD BOT API ====================

app.use('/api/discord', discordRoutes);

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== CHALLENGE RULES (public — for user dashboard) ====================

/**
 * GET /api/challenges/:id/rules
 * Returns display rules for the user dashboard
 */
app.get('/api/challenges/:id/rules', async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const { evaluationEngine } = require('../services/wpEvaluationEngine');
    const result = await evaluationEngine.getRulesForDisplay(challengeId);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== ADMIN: RULES MANAGEMENT ====================

/**
 * GET /api/admin/:secretPath/challenge/:id/rules
 * Get rules config for admin form
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/rules`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const { evaluationEngine } = require('../services/wpEvaluationEngine');
    const rules = await evaluationEngine.loadRules(challengeId);

    // Get challenge status to determine if rules are locked
    const challenge = await db.query('SELECT status, type FROM trading_challenges WHERE id = $1', [challengeId]);
    const status = challenge.rows[0]?.status || 'draft';
    const challengeType = challenge.rows[0]?.type || 'demo';
    const locked = !['draft', 'registration_open'].includes(status);

    return res.json({ rules: rules || null, locked, challengeStatus: status, challengeType });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/:secretPath/challenge/:id/rules
 * Save rules config from admin form
 * Body: { max_lot_size, max_open_trades, pair_limit, stop_loss_required, max_risk_dollars, daily_loss_cap, max_hold_hours, weekend_trading, min_active_days, only_cent_account }
 * Rules can only be changed when challenge is in 'draft' or 'registration_open' status.
 */
app.put(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/rules`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);

    // Check if challenge is still editable
    const challenge = await db.query('SELECT status FROM trading_challenges WHERE id = $1', [challengeId]);
    if (!challenge.rows[0]) return res.status(404).json({ error: 'Challenge not found' });

    const status = challenge.rows[0].status;
    // Allow saving rules if none exist yet (first-time setup), even if challenge is active
    const existingRules = await db.query(`SELECT 1 FROM wp_challenge_rules WHERE challenge_id = $1 AND rule_code = 'config'`, [challengeId]);
    if (!['draft', 'registration_open'].includes(status) && existingRules.rows.length > 0) {
      return res.status(403).json({ error: 'Rules are locked. Cannot modify rules after challenge has started.', locked: true });
    }

    const { evaluationEngine } = require('../services/wpEvaluationEngine');
    await evaluationEngine.saveRules(challengeId, req.body);
    return res.json({ success: true });
  } catch (error) {
    console.error('Admin rules save error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== VPS WORKER CALLBACK ====================

/**
 * GET /api/vps/next-account
 * Called by VPS workers when their home account fails (password changed, deleted).
 * Returns a random non-disqualified verified account of the same subtype.
 * Auth: x-vps-api-key header (reuses VPS_API_KEY).
 */
app.get('/api/vps/next-account', async (req, res) => {
  try {
    const vpsKey = req.headers['x-vps-api-key'] as string;
    if (!vpsKey || vpsKey !== process.env.VPS_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const subtype     = (req.query.subtype     as string || '').trim();
    const challengeId = (req.query.challenge_id as string || '').trim();
    const exclude     = (req.query.exclude      as string || '').trim();

    if (!subtype || !challengeId) {
      return res.status(400).json({ found: false, error: 'Missing subtype or challenge_id' });
    }

    const excludeList = exclude
      ? exclude.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

    const params: any[] = [challengeId, subtype];
    let excludeClause = '';
    if (excludeList.length > 0) {
      excludeClause = ` AND account_number != ALL($3::text[])`;
      params.push(excludeList);
    }

    const result = await db.query(
      `SELECT account_number, investor_password, mt5_server
       FROM trading_registrations
       WHERE challenge_id = $1
         AND account_subtype = $2
         AND disqualified = false
         AND connection_verified = true
         AND investor_password IS NOT NULL
         ${excludeClause}
       ORDER BY RANDOM() LIMIT 1`,
      params
    );

    if (result.rows.length === 0) {
      return res.json({ found: false });
    }

    const r = result.rows[0];
    return res.json({
      found:    true,
      account:  r.account_number,
      server:   r.mt5_server,
      password: r.investor_password,
    });
  } catch (error) {
    console.error('VPS next-account error:', error);
    return res.status(500).json({ found: false, error: 'Internal server error' });
  }
});

// ==================== START SERVER ====================

export function startApiServer() {
  const port = parseInt(process.env.API_PORT || process.env.PORT || '3001');
  app.listen(port, '0.0.0.0', () => {
    console.log(`✅ WinnerPip API server running on port ${port}`);
  });
}

export { app };
