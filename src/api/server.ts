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

  const allowed = ADMIN_WHITELISTED_IPS.some(whitelistedIp => 
    normalizedIp === whitelistedIp || normalizedIp.includes(whitelistedIp)
  );

  if (!allowed) {
    console.log(`🚫 Admin access denied from IP: ${normalizedIp} (whitelist: ${ADMIN_WHITELISTED_IPS.join(', ')})`);
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
    const { account_number, investor_password } = req.body;

    if (!account_number || !investor_password) {
      return res.status(400).json({ error: 'Account number and investor password are required' });
    }

    // Find registration with this account number and matching investor password
    const result = await db.query(
      `SELECT r.*, c.title as challenge_title, c.status as challenge_status, c.id as challenge_id
       FROM trading_registrations r
       JOIN trading_challenges c ON r.challenge_id = c.id
       WHERE r.account_number = $1
         AND r.investor_password = $2
         AND r.disqualified = false
       ORDER BY r.registered_at DESC
       LIMIT 1`,
      [account_number.trim(), investor_password.trim()]
    );

    if (result.rows.length === 0) {
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
      `SELECT r.*, c.title as challenge_title, c.status as challenge_status
       FROM trading_registrations r
       JOIN trading_challenges c ON r.challenge_id = c.id
       WHERE r.id = $1 AND r.disqualified = false`,
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
      else if (['submission_open', 'reviewing'].includes(c.status) && !c.winners_posted_at) displayStatus = 'evaluation';
      else if (c.winners_posted_at) displayStatus = 'ended';
      else if (c.status === 'completed' && !c.winners_posted_at) displayStatus = 'ended'; // Legacy completed challenges without winners_posted_at
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

    let query = `
      SELECT nickname, account_type, rank, current_balance, adjusted_balance,
             qualified_profit, gross_profit, profit_removed, total_trades,
             qualified_trades, flagged_trades, is_qualified, last_trade_time, last_updated
      FROM wp_leaderboard
      WHERE challenge_id = $1 AND is_disqualified = false
    `;
    const params: any[] = [challengeId];

    if (category === 'demo' || category === 'real') {
      query += ` AND account_type = $2`;
      params.push(category);
    }

    query += ` ORDER BY rank ASC NULLS LAST, qualified_profit DESC LIMIT 100`;

    const result = await db.query(query, params);

    return res.json({
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
      `SELECT r.*, c.title, c.status, c.start_date, c.end_date, c.starting_balance, c.target_balance
       FROM trading_registrations r
       JOIN trading_challenges c ON r.challenge_id = c.id
       WHERE r.id = $1`,
      [registrationId]
    );

    const registration = reg.rows[0];
    const leaderboard = lb.rows[0] || null;

    return res.json({
      challenge: {
        id: registration.challenge_id,
        title: registration.title,
        status: registration.status,
        startDate: registration.start_date,
        endDate: registration.end_date,
        startingBalance: parseFloat(registration.starting_balance),
        targetBalance: parseFloat(registration.target_balance),
      },
      me: {
        nickname: registration.nickname,
        accountNumber: registration.account_number,
        accountType: registration.account_type,
        server: registration.mt5_server,
        rank: leaderboard?.rank || null,
        currentBalance: leaderboard ? parseFloat(leaderboard.current_balance) : parseFloat(registration.starting_balance),
        adjustedBalance: leaderboard ? parseFloat(leaderboard.adjusted_balance) : parseFloat(registration.starting_balance),
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

const TOKEN_SECRET = process.env.WINNERPIP_TOKEN_SECRET || config.botToken; // Use bot token as fallback secret
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

    if (signature !== expectedSig) return null;

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
       WHERE r.challenge_id = $1
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
        balance: r.current_balance ? parseFloat(r.current_balance) : null,
        qualifiedProfit: r.qualified_profit ? parseFloat(r.qualified_profit) : null,
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
 * POST /api/admin/:secretPath/challenge/:id/message
 * Send a DM to a participant via Telegram or Discord bot
 * Body: { registrationId, message }
 */
app.post(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/message`, adminIpCheck, async (req, res) => {
  try {
    const { registrationId, message } = req.body;
    if (!registrationId || !message) {
      return res.status(400).json({ error: 'registrationId and message are required' });
    }

    const reg = await db.query(
      `SELECT r.telegram_id, r.discord_user_id, r.username, r.nickname, r.account_number, r.source, c.title, c.source as challenge_source
       FROM trading_registrations r
       JOIN trading_challenges c ON r.challenge_id = c.id
       WHERE r.id = $1`,
      [registrationId]
    );

    if (reg.rows.length === 0) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    const user = reg.rows[0];
    const isDiscord = user.source === 'discord' || user.challenge_source === 'discord';

    if (isDiscord) {
      // For Discord users — send via Telegram bot using the discord_user_id as telegram_id
      // Since discord_user_id was stored as telegram_id during registration, try sending
      // But this won't work for actual Discord DMs — inform admin to use Discord bot
      return res.json({
        success: false,
        error: `Discord DMs not supported from admin panel yet. Use Discord bot command: !dm @${user.username || 'user'} ${message.substring(0, 50)}...`,
        method: 'discord',
        username: user.username,
        discordUserId: user.discord_user_id,
      });
    }

    // Telegram user — send via bot
    let sent = false;
    try {
      const botModule = require('../bot/bot');
      const botInstance = botModule.bot || botModule.default;
      if (botInstance && botInstance.bot) {
        await botInstance.bot.telegram.sendMessage(
          user.telegram_id,
          `📩 <b>Message from Admin</b>\n<b>${user.title}</b>\n\n${message}`,
          { parse_mode: 'HTML' }
        );
        sent = true;
      }
    } catch (e: any) {
      console.error(`Failed to DM via Telegram: ${e.message}`);
    }

    if (sent) {
      return res.json({ success: true, method: 'telegram' });
    } else {
      return res.json({ success: false, error: 'Could not send message. User may have DMs disabled or bot not initialized.' });
    }
  } catch (error) {
    console.error('Admin message error:', error);
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

    // Delete the registration
    await db.query(`DELETE FROM trading_registrations WHERE id = $1`, [registrationId]);

    // Also remove from leaderboard if exists
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

    // Balance stats
    const balanceStats = await db.query(
      `SELECT COALESCE(AVG(current_balance),0) as avg_balance, COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY current_balance),0) as median_balance FROM wp_leaderboard WHERE challenge_id=$1 AND is_disqualified=false`, [challengeId]);

    // Latest screening
    const latestScreening = await db.query(
      `SELECT * FROM trading_screening_results WHERE challenge_id=$1 ORDER BY created_at DESC LIMIT 1`, [challengeId]);

    const c = counts.rows[0];
    const t = tradeStats.rows[0];
    const p = pullStats.rows[0];
    const b = balanceStats.rows[0];

    return res.json({
      participants: { total: parseInt(c.total), demo: parseInt(c.demo), real: parseInt(c.real), disqualified: parseInt(c.disqualified) },
      trades: { total: parseInt(t.total_trades), totalVolume: parseFloat(t.total_volume), violations: parseInt(t.violations) },
      pulls: { today: parseInt(p.pulls_today), success: parseInt(p.total_success), failed: parseInt(p.total_failed), newTrades: parseInt(p.new_trades), passwordChanged: parseInt(pwChanged.rows[0].cnt) },
      balance: { average: parseFloat(b.avg_balance), median: parseFloat(b.median_balance) },
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
      `SELECT username, account_number, account_type, partner_status, partner_warned_at FROM trading_registrations WHERE challenge_id=$1 AND partner_status='CHANGING' AND disqualified=false ORDER BY partner_warned_at DESC`, [challengeId]);

    // Disqualified due to partner change
    const disqualified = await db.query(
      `SELECT username, account_number, account_type, disqualified_at, disqualified_reason FROM trading_registrations WHERE challenge_id=$1 AND disqualified=true AND disqualified_reason LIKE '%Partner%' ORDER BY disqualified_at DESC`, [challengeId]);

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
 * GET /api/admin/:secretPath/challenge/:id/finduser?q=search
 * Search user by username, email, account number, or telegram ID
 */
app.get(`/api/admin/${ADMIN_SECRET_PATH}/challenge/:id/finduser`, adminIpCheck, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id);
    const q = (req.query.q as string || '').trim().toLowerCase().replace(/^@/, '');

    if (!q) return res.status(400).json({ error: 'Search query required' });

    const result = await db.query(
      `SELECT r.*, l.rank, l.current_balance, l.adjusted_balance, l.qualified_profit, l.gross_profit,
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
        balance: r.current_balance ? parseFloat(r.current_balance) : null,
        qualifiedProfit: r.qualified_profit ? parseFloat(r.qualified_profit) : 0,
        grossProfit: r.gross_profit ? parseFloat(r.gross_profit) : 0,
        profitRemoved: r.profit_removed ? parseFloat(r.profit_removed) : 0,
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
    if (!['draft', 'registration_open'].includes(status)) {
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
