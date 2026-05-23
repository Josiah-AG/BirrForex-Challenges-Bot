import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { db } from '../database/db';
import { config } from '../config';
import { vpsService } from '../services/vpsService';
import crypto from 'crypto';
import { discordRoutes } from './discordRoutes';

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
    const token = generateToken(registration.id, registration.telegram_id);

    return res.json({
      success: true,
      token,
      user: {
        registrationId: registration.id,
        telegramId: registration.telegram_id,
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
      `SELECT r.id, r.telegram_id, r.nickname, r.username, r.account_number, r.account_type, r.mt5_server, r.challenge_id, r.disqualified,
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
        telegramId: reg.telegram_id,
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

    // Get leaderboard data freshness
    const freshness = await db.query(
      `SELECT leaderboard_updated_at FROM trading_challenges WHERE id = $1`,
      [challengeId]
    );
    const dataFrom = freshness.rows[0]?.leaderboard_updated_at || null;

    let query = `
      SELECT l.nickname, l.account_type, l.rank, l.current_balance, l.adjusted_balance,
             l.qualified_profit, l.gross_profit, l.profit_removed, l.total_trades,
             l.qualified_trades, l.flagged_trades, l.is_qualified, l.is_disqualified,
             l.disqualify_reason, l.last_trade_time, l.last_updated, l.zero_balance_at,
             l.is_cent, l.normalized_balance
      FROM wp_leaderboard l
      WHERE l.challenge_id = $1
    `;
    const params: any[] = [challengeId];

    if (category === 'demo' || category === 'real') {
      query += ` AND l.account_type = $2`;
      params.push(category);
    }

    query += ` ORDER BY l.rank ASC NULLS LAST, l.qualified_profit DESC`;

    // Pagination: offset/limit from query params
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    query += ` LIMIT ${limit} OFFSET ${offset}`;

    const result = await db.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM wp_leaderboard l WHERE l.challenge_id = $1`;
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
        isBlown: r.total_trades > 0 && parseFloat(r.current_balance) <= 0,
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

    // Get recent trades
    const trades = await db.query(
      `SELECT ticket, symbol, trade_type, volume, open_time, close_time,
              open_price, close_price, profit, commission, swap, is_qualified, violations
       FROM wp_trades
       WHERE registration_id = $1
       ORDER BY close_time DESC
       LIMIT 50`,
      [registrationId]
    );

    // Get challenge info
    const reg = await db.query(
      `SELECT r.id, r.nickname, r.account_number, r.account_type, r.mt5_server, r.challenge_id, r.pull_status,
              r.actual_starting_balance, r.registration_balance, r.disqualified, r.disqualified_reason, r.is_cent,
              c.title, c.status, c.start_date, c.end_date, c.starting_balance, c.target_balance, c.leaderboard_updated_at
       FROM trading_registrations r
       JOIN trading_challenges c ON r.challenge_id = c.id
       WHERE r.id = $1`,
      [registrationId]
    );

    const registration = reg.rows[0];
    const leaderboard = lb.rows[0] || null;

    // Determine the user's actual starting balance
    const challengeStartingBalance = parseFloat(registration.starting_balance);
    const actualStartingBalance = registration.actual_starting_balance
      ? parseFloat(registration.actual_starting_balance)
      : registration.registration_balance
        ? parseFloat(registration.registration_balance)
        : challengeStartingBalance;

    return res.json({
      dataFrom: registration.leaderboard_updated_at || null,
      challenge: {
        id: registration.challenge_id,
        title: registration.title,
        status: registration.status,
        startDate: registration.start_date,
        endDate: registration.end_date,
        startingBalance: actualStartingBalance,
        targetBalance: parseFloat(registration.target_balance),
      },
      me: {
        nickname: registration.nickname,
        accountNumber: registration.account_number,
        accountType: registration.account_type,
        server: registration.mt5_server,
        pullStatus: registration.pull_status || null,
        disqualified: registration.disqualified || false,
        disqualifiedReason: registration.disqualified_reason || null,
        isCent: registration.is_cent || false,
        rank: leaderboard?.rank || null,
        currentBalance: leaderboard ? parseFloat(leaderboard.current_balance) : actualStartingBalance,
        adjustedBalance: leaderboard ? parseFloat(leaderboard.adjusted_balance) : actualStartingBalance,
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

const TOKEN_SECRET = process.env.WINNERPIP_TOKEN_SECRET || process.env.BOT_TOKEN || 'change-this-secret-in-production';
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
      `SELECT r.id, r.telegram_id, r.discord_user_id, r.username, r.nickname, r.account_type,
              r.email, r.account_number, r.mt5_server, r.status, r.partner_status,
              r.disqualified, r.disqualified_reason, r.registered_at, r.source,
              r.connection_verified, r.pull_status, r.last_pull_at,
              l.rank, l.current_balance, l.qualified_profit, l.total_trades, l.flagged_trades,
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
        telegramId: r.telegram_id,
        discordUserId: r.discord_user_id,
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
        source: r.source || 'telegram',
        challengeSource: r.challenge_source || 'telegram',
        connectionVerified: r.connection_verified,
        pullStatus: r.pull_status,
        lastPullAt: r.last_pull_at,
        rank: r.rank,
        balance: r.current_balance != null ? parseFloat(r.current_balance) : null,
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
      `SELECT r.telegram_id, r.discord_user_id, r.username, r.nickname, r.account_number, r.source, c.title
       FROM trading_registrations r
       JOIN trading_challenges c ON r.challenge_id = c.id
       WHERE r.id = $1 AND r.challenge_id = $2`,
      [registrationId, challengeId]
    );

    if (reg.rows.length === 0) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    const user = reg.rows[0];

    // Soft-delete: mark as removed (not hard delete) so login can show the reason
    await db.query(
      `UPDATE trading_registrations SET status = 'removed', disqualified = true, disqualified_at = NOW(), disqualified_reason = $1 WHERE id = $2`,
      [reason, registrationId]
    );

    // Remove from leaderboard
    await db.query(`DELETE FROM wp_leaderboard WHERE registration_id = $1`, [registrationId]);

    // DM the user
    let dmSent = false;
    const isDiscordUser = user.source === 'discord';
    if (!isDiscordUser && user.telegram_id) {
      try {
        const botModule = require('../bot/bot');
        const botInstance = botModule.bot || botModule.default;
        if (botInstance && botInstance.bot) {
          await botInstance.bot.telegram.sendMessage(
            user.telegram_id,
            `⚠️ <b>Registration Removed</b>\n<b>${user.title}</b>\n\n` +
            `Your registration (account ${user.account_number}) has been removed.\n\n` +
            `📛 <b>Reason:</b> ${reason}\n\n` +
            `You can register again if you wish.`,
            { parse_mode: 'HTML' }
          );
          dmSent = true;
        }
      } catch (e: any) {
        console.error(`Failed to DM unverify notice: ${e.message}`);
      }
    }

    return res.json({ success: true, dmSent, user: user.nickname || user.username, isDiscord: isDiscordUser });
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
      `SELECT r.telegram_id, r.discord_user_id, r.username, r.nickname, r.account_number, r.source, c.title
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
    if (!isDiscordUser && user.telegram_id) {
      try {
        const botModule = require('../bot/bot');
        const botInstance = botModule.bot || botModule.default;
        if (botInstance && botInstance.bot) {
          await botInstance.bot.telegram.sendMessage(
            user.telegram_id,
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
      `SELECT COUNT(*) as total, COUNT(CASE WHEN account_type='demo' THEN 1 END) as demo, COUNT(CASE WHEN account_type='real' THEN 1 END) as real, COUNT(CASE WHEN disqualified=true THEN 1 END) as disqualified FROM trading_registrations WHERE challenge_id=$1`, [challengeId]);

    // Trade stats
    const tradeStats = await db.query(
      `SELECT COUNT(*) as total_trades, COALESCE(SUM(volume),0) as total_volume, COUNT(CASE WHEN is_qualified=false THEN 1 END) as violations FROM wp_trades WHERE challenge_id=$1`, [challengeId]);

    // Pull stats (today)
    const pullStats = await db.query(
      `SELECT COUNT(*) as pulls_today, COALESCE(SUM(successful),0) as total_success, COALESCE(SUM(failed),0) as total_failed, COALESCE(SUM(new_trades_found),0) as new_trades FROM wp_pull_batches WHERE challenge_id=$1 AND started_at > NOW() - INTERVAL '24 hours'`, [challengeId]);

    // Password changed count
    const pwChanged = await db.query(
      `SELECT COUNT(*) as cnt FROM trading_registrations WHERE challenge_id=$1 AND pull_status='password_changed'`, [challengeId]);

    // Above target
    const aboveTarget = await db.query(
      `SELECT COUNT(*) as cnt FROM wp_leaderboard WHERE challenge_id=$1 AND is_qualified=true`, [challengeId]);

    // Balance stats — total balance (normalized to $) split by category
    const balanceStats = await db.query(
      `SELECT
        COALESCE(SUM(CASE WHEN is_cent THEN current_balance/100 ELSE current_balance END), 0) as total_balance,
        COALESCE(SUM(CASE WHEN account_type='real' THEN (CASE WHEN is_cent THEN current_balance/100 ELSE current_balance END) ELSE 0 END), 0) as real_balance,
        COALESCE(SUM(CASE WHEN account_type='demo' THEN current_balance ELSE 0 END), 0) as demo_balance
       FROM wp_leaderboard WHERE challenge_id=$1 AND is_disqualified=false`, [challengeId]);

    // If no leaderboard data yet, sum starting balances from registrations
    const rulesCheck = await db.query(`SELECT parameters FROM wp_challenge_rules WHERE challenge_id = $1 AND rule_code = 'config'`, [challengeId]);
    const challengeIsCentOnly = rulesCheck.rows[0]?.parameters?.only_cent_account || false;

    // For cent-only challenges: all real users are cent, divide by 100
    // For mixed challenges: only users with is_cent=true get divided
    const centCondition = challengeIsCentOnly
      ? `(account_type = 'real')`  // All real users are cent in cent-only challenges
      : `(is_cent = true)`;        // Only flagged users in mixed challenges

    const startingBalanceSum = await db.query(
      `SELECT
        COALESCE(SUM(
          CASE WHEN ${centCondition}
            THEN COALESCE(last_known_balance, registration_balance) / 100
            ELSE COALESCE(last_known_balance, registration_balance)
          END
        ), 0) as total_starting,
        COALESCE(SUM(
          CASE WHEN account_type = 'real' THEN
            CASE WHEN ${centCondition}
              THEN COALESCE(last_known_balance, registration_balance) / 100
              ELSE COALESCE(last_known_balance, registration_balance)
            END
          ELSE 0 END
        ), 0) as real_starting,
        COALESCE(SUM(CASE WHEN account_type='demo' THEN COALESCE(last_known_balance, registration_balance) ELSE 0 END), 0) as demo_starting,
        COUNT(*) as total_count
       FROM trading_registrations WHERE challenge_id=$1 AND disqualified=false AND investor_password IS NOT NULL`, [challengeId]);

    // Latest screening
    const latestScreening = await db.query(
      `SELECT * FROM trading_screening_results WHERE challenge_id=$1 ORDER BY created_at DESC LIMIT 1`, [challengeId]);

    const c = counts.rows[0];
    const t = tradeStats.rows[0];
    const p = pullStats.rows[0];
    const b = balanceStats.rows[0];
    const s = startingBalanceSum.rows[0];

    // Use leaderboard totals if available, otherwise starting balances from registrations
    const hasLeaderboardData = parseFloat(b.total_balance) > 0;
    let totalBalance = hasLeaderboardData ? parseFloat(b.total_balance) : parseFloat(s.total_starting);
    let realBalance = hasLeaderboardData ? parseFloat(b.real_balance) : parseFloat(s.real_starting);
    let demoBalance = hasLeaderboardData ? parseFloat(b.demo_balance) : parseFloat(s.demo_starting);

    // If still 0 but we have verified participants (legacy users without saved balance), estimate from challenge starting_balance
    if (!hasLeaderboardData && totalBalance === 0 && parseInt(s.total_count) > 0) {
      const challengeData = await db.query(`SELECT starting_balance FROM trading_challenges WHERE id = $1`, [challengeId]);
      const challengeStartBal = parseFloat(challengeData.rows[0]?.starting_balance || 0);
      if (challengeStartBal > 0) {
        totalBalance = challengeStartBal * parseInt(s.total_count);
        realBalance = challengeStartBal * parseInt(c.real);
        demoBalance = challengeStartBal * parseInt(c.demo);
      }
    }

    // Last pull time
    const lastPull = await db.query(
      `SELECT completed_at FROM wp_pull_batches WHERE challenge_id=$1 AND status='completed' ORDER BY completed_at DESC LIMIT 1`, [challengeId]);

    return res.json({
      participants: { total: parseInt(c.total), demo: parseInt(c.demo), real: parseInt(c.real), disqualified: parseInt(c.disqualified) },
      trades: { total: parseInt(t.total_trades), totalVolume: parseFloat(t.total_volume), violations: parseInt(t.violations) },
      pulls: { today: parseInt(p.pulls_today), success: parseInt(p.total_success), failed: parseInt(p.total_failed), newTrades: parseInt(p.new_trades), passwordChanged: parseInt(pwChanged.rows[0].cnt), lastPullAt: lastPull.rows[0]?.completed_at || null },
      balance: { total: totalBalance, real: realBalance, demo: demoBalance },
      qualified: parseInt(aboveTarget.rows[0].cnt),
      latestScreening: latestScreening.rows[0] || null,
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
    const result = await db.query(
      `SELECT id, started_at, completed_at, total_accounts, successful, failed, new_trades_found, status, error_log FROM wp_pull_batches WHERE challenge_id=$1 ORDER BY started_at DESC LIMIT 50`, [challengeId]);

    return res.json({ pulls: result.rows });
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

    // Ping VPS health endpoint
    let vpsStatus: any = { reachable: false };
    try {
      const axios = require('axios');
      const healthRes = await axios.get(`${vpsUrl}/health`, {
        headers: { 'X-API-Key': config.vpsApiKey },
        timeout: 10000,
      });
      vpsStatus = {
        reachable: true,
        status: healthRes.data?.status || 'unknown',
        terminals: healthRes.data?.terminals || null,
        workers: healthRes.data?.workers || null,
        uptime: healthRes.data?.uptime || null,
        version: healthRes.data?.version || null,
        queue: healthRes.data?.queue || null,
        raw: healthRes.data,
      };
    } catch (vpsErr: any) {
      vpsStatus = {
        reachable: false,
        error: vpsErr.code === 'ECONNABORTED' ? 'Timeout (10s)' : (vpsErr.message || 'Connection failed'),
      };
    }

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
      `SELECT r.id, r.nickname, r.username, r.email, r.telegram_id, r.account_number,
              r.account_type, r.mt5_server, r.registered_at, r.last_pull_at, r.pull_status,
              r.partner_status, r.disqualified, r.disqualified_reason,
              l.rank, l.current_balance, l.adjusted_balance, l.qualified_profit, l.gross_profit,
              l.profit_removed, l.total_trades, l.qualified_trades, l.flagged_trades, l.active_days,
              l.is_qualified, l.last_trade_time, l.last_updated as lb_updated
       FROM trading_registrations r
       LEFT JOIN wp_leaderboard l ON r.id = l.registration_id
       WHERE r.challenge_id = $1 AND (
         LOWER(r.username) = $2 OR LOWER(r.email) = $2 OR r.account_number = $2
         OR CAST(r.telegram_id AS TEXT) = $2 OR LOWER(r.nickname) = $2
       )
       LIMIT 1`,
      [challengeId, q]
    );

    if (result.rows.length === 0) {
      return res.json({ found: false });
    }

    const r = result.rows[0];

    // Get recent trades
    const trades = await db.query(
      `SELECT symbol, trade_type, volume, profit, close_time, is_qualified, violations
       FROM wp_trades WHERE registration_id = $1 ORDER BY close_time DESC LIMIT 10`,
      [r.id]
    );

    return res.json({
      found: true,
      user: {
        nickname: r.nickname,
        username: r.username,
        email: r.email,
        telegramId: r.telegram_id,
        accountNumber: r.account_number,
        accountType: r.account_type,
        server: r.mt5_server,
        registeredAt: r.registered_at,
        rank: r.rank || null,
        balance: r.current_balance != null ? parseFloat(r.current_balance) : null,
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
    } = req.body;

    if (!title || !type || !start_date || !end_date || !starting_balance) {
      return res.status(400).json({ error: 'Missing required fields: title, type, start_date, end_date, starting_balance' });
    }
    if (!['demo', 'real', 'hybrid'].includes(type)) {
      return res.status(400).json({ error: 'Type must be demo, real, or hybrid' });
    }

    const result = await db.query(
      `INSERT INTO trading_challenges
       (title, type, status, start_date, end_date, registration_deadline, starting_balance, target_balance,
        prize_pool_text, real_winners_count, demo_winners_count, real_prizes, demo_prizes,
        pdf_url, video_url, source, team_only, announcement_posted)
       VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, false)
       RETURNING *`,
      [
        title, type, start_date, end_date,
        registration_deadline || end_date,
        starting_balance, target_balance || 0,
        prize_pool_text || '', real_winners_count || 0, demo_winners_count || 0,
        JSON.stringify(real_prizes || []), JSON.stringify(demo_prizes || []),
        pdf_url || null, video_url || null,
        source || 'telegram', team_only || false,
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
      // Mark as pending for Discord bot to pick up and post with interactive Register button
      await db.query(
        `UPDATE trading_challenges SET discord_channel_message_id = 'pending_announce' WHERE id = $1 AND discord_channel_message_id IS NULL`,
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
 * GET /api/admin/:secretPath/challenge/:id/failed-accounts
 * Get accounts that failed in the last pull cycle
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/failed-accounts`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const { leaderboardService } = require('../services/leaderboardService');
    const failed = await leaderboardService.getFailedAccounts(challengeId);

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

    return res.json({ failed, skipped: skipped.rows });
  } catch (error) {
    console.error('Failed accounts error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/:secretPath/challenge/:id/force-pull
 * Trigger a manual pull cycle
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/force-pull`, adminIpCheck, async (req, res) => {
  try {
    const globalScheduler = (global as any).__vpsPullScheduler;
    if (globalScheduler) {
      globalScheduler.runPullCycle().catch((e: any) => console.error('Force pull error:', e));
      return res.json({ success: true, message: 'Pull cycle started. Watch the progress bar.' });
    }
    return res.json({ success: false, message: 'Pull scheduler not initialized yet — try again in a moment' });
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
      `SELECT id, challenge_id, total_accounts, started_at FROM wp_pull_batches WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`
    );

    if (running.rows.length > 0) {
      const batch = running.rows[0];
      // Count how many have been processed so far (success + failed since batch started)
      const processed = await db.query(
        `SELECT COUNT(*) as cnt FROM trading_registrations WHERE challenge_id = $1 AND last_pull_at >= $2`,
        [batch.challenge_id, batch.started_at]
      );
      const processedCount = parseInt(processed.rows[0].cnt);
      const elapsed = Math.round((Date.now() - new Date(batch.started_at).getTime()) / 1000);

      return res.json({
        isRunning: true,
        batchId: batch.id,
        totalAccounts: batch.total_accounts,
        processed: processedCount,
        percent: batch.total_accounts > 0 ? Math.round((processedCount / batch.total_accounts) * 100) : 0,
        elapsedSeconds: elapsed,
        startedAt: batch.started_at,
      });
    }

    // Not running — get last completed batch
    const last = await db.query(
      `SELECT id, total_accounts, successful, failed, new_trades_found, status, started_at, completed_at FROM wp_pull_batches ORDER BY started_at DESC LIMIT 1`
    );

    if (last.rows.length > 0) {
      const b = last.rows[0];
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
        },
      });
    }

    return res.json({ isRunning: false, lastBatch: null });
  } catch (error) {
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
      `SELECT id, account_number, mt5_server, investor_password, telegram_id, username, nickname
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

        const response = await axios.post(`${vpsUrl}/pull`, {
          account: reg.account_number,
          server: reg.mt5_server,
          password: reg.investor_password,
          api_key: vpsKey,
          terminal_id: terminalId,
          from_date: fromDate,
        }, { timeout: 30000 });

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
      `SELECT account_number, mt5_server, pull_status FROM trading_registrations WHERE id = $1 AND challenge_id = $2`,
      [registrationId, challengeId]
    );
    if (regResult.rows.length === 0) return res.status(404).json({ error: 'Registration not found' });
    if (regResult.rows[0].pull_status === 'success') return res.json({ success: false, message: 'Already resolved — password was updated from another channel' });

    const reg = regResult.rows[0];

    // Verify new password with VPS
    const vpsUrl = config.vpsApiUrl;
    const vpsKey = config.vpsApiKey;
    if (vpsUrl && vpsKey) {
      try {
        const axios = require('axios');
        const verifyRes = await axios.post(`${vpsUrl}/verify`, {
          account: reg.account_number, server: reg.mt5_server, password: newPassword, api_key: vpsKey,
        }, { timeout: 15000 });

        if (verifyRes.data?.success) {
          // Update password and reset status
          await db.query(
            `UPDATE trading_registrations SET investor_password = $1, pull_status = 'success', pull_error = NULL, connection_verified = true, connection_verified_at = NOW() WHERE id = $2`,
            [newPassword, registrationId]
          );
          return res.json({ success: true, verified: true, message: 'Password updated and verified — account is back online' });
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
        }, { timeout: 15000 });

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
        }, { timeout: 15000 });

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
              }, { timeout: 20000 });
              if (pullRes.data?.success) {
                balance = pullRes.data.balance !== undefined ? pullRes.data.balance : balance;
                equity = pullRes.data.equity !== undefined ? pullRes.data.equity : equity;
              }
              console.log(`[Verify] Pull response balance: ${pullRes.data?.balance}, equity: ${pullRes.data?.equity}`);
            } catch (pullErr: any) {
              console.log(`[Verify] Pull failed: ${pullErr.message}`);
            }
          }

          // Save balance to registration for overview display
          if (balance !== null && balance !== undefined) {
            await db.query(
              `UPDATE trading_registrations SET last_known_balance = $1, registration_balance = COALESCE(registration_balance, $1) WHERE id = $2`,
              [balance, registrationId]
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

// ==================== START SERVER ====================

export function startApiServer() {
  const port = parseInt(process.env.API_PORT || process.env.PORT || '3001');
  app.listen(port, '0.0.0.0', () => {
    console.log(`✅ WinnerPip API server running on port ${port}`);
  });
}

export { app };
