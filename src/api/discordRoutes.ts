import { Router, Request, Response } from 'express';
import { db } from '../database/db';
import { vpsService } from '../services/vpsService';
import rateLimit from 'express-rate-limit';

const router = Router();

// Helper to safely get route param as string
function param(req: Request, name: string): string {
  return req.params[name] as string;
}

// ==================== DISCORD BOT API KEY AUTH ====================

const DISCORD_API_KEY = process.env.DISCORD_BOT_API_KEY || '';

function discordAuth(req: Request, res: Response, next: any) {
  const apiKey = req.headers['x-api-key'] as string;
  if (!DISCORD_API_KEY) {
    return res.status(503).json({ error: 'Discord API not configured' });
  }
  if (!apiKey || apiKey !== DISCORD_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

// Rate limit for Discord bot: 30 requests per minute
const discordLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests from Discord bot' },
});

router.use(discordLimiter);
router.use(discordAuth);

// ==================== CREATE CHALLENGE ====================

/**
 * POST /api/discord/challenges
 * Body: {
 *   title, type, start_date, end_date, registration_deadline,
 *   starting_balance, target_balance, prize_pool_text,
 *   real_winners_count, demo_winners_count, real_prizes, demo_prizes
 * }
 */
router.post('/challenges', async (req: Request, res: Response) => {
  try {
    const {
      title,
      type,
      start_date,
      end_date,
      registration_deadline,
      starting_balance,
      target_balance,
      prize_pool_text,
      real_winners_count,
      demo_winners_count,
      real_prizes,
      demo_prizes,
    } = req.body;

    // Validation
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
        source, team_only, announcement_posted)
       VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'discord', true, false)
       RETURNING *`,
      [
        title, type, start_date, end_date,
        registration_deadline || end_date,
        starting_balance, target_balance || 0,
        prize_pool_text || '',
        real_winners_count || 0, demo_winners_count || 0,
        JSON.stringify(real_prizes || []), JSON.stringify(demo_prizes || []),
      ]
    );

    const challenge = result.rows[0];

    return res.json({
      success: true,
      challenge: {
        id: challenge.id,
        title: challenge.title,
        type: challenge.type,
        status: challenge.status,
        startDate: challenge.start_date,
        endDate: challenge.end_date,
        registrationDeadline: challenge.registration_deadline,
        startingBalance: parseFloat(challenge.starting_balance),
      },
    });
  } catch (error) {
    console.error('Discord create challenge error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== GET CHALLENGE STATUS ====================

/**
 * GET /api/discord/challenges/:id
 */
router.get('/challenges/:id', async (req: Request, res: Response) => {
  try {
    const challengeId = parseInt(param(req, "id"));

    const result = await db.query(
      `SELECT * FROM trading_challenges WHERE id = $1`,
      [challengeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const c = result.rows[0];

    // Get participant counts
    const counts = await db.query(
      `SELECT COUNT(*) as total,
              COUNT(CASE WHEN account_type = 'demo' THEN 1 END) as demo,
              COUNT(CASE WHEN account_type = 'real' THEN 1 END) as real
       FROM trading_registrations WHERE challenge_id = $1 AND disqualified = false`,
      [challengeId]
    );

    return res.json({
      challenge: {
        id: c.id,
        title: c.title,
        type: c.type,
        status: c.status,
        startDate: c.start_date,
        endDate: c.end_date,
        registrationDeadline: c.registration_deadline,
        startingBalance: parseFloat(c.starting_balance),
        targetBalance: parseFloat(c.target_balance),
        prizePoolText: c.prize_pool_text,
        realWinnersCount: c.real_winners_count,
        demoWinnersCount: c.demo_winners_count,
        realPrizes: typeof c.real_prizes === 'string' ? JSON.parse(c.real_prizes) : c.real_prizes,
        demoPrizes: typeof c.demo_prizes === 'string' ? JSON.parse(c.demo_prizes) : c.demo_prizes,
        source: c.source,
        teamOnly: c.team_only,
      },
      participants: {
        total: parseInt(counts.rows[0].total),
        demo: parseInt(counts.rows[0].demo),
        real: parseInt(counts.rows[0].real),
      },
    });
  } catch (error) {
    console.error('Discord get challenge error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== REGISTER PARTICIPANT ====================

/**
 * POST /api/discord/challenges/:id/register
 * Body: {
 *   discord_user_id, username, nickname, email,
 *   account_number, mt5_server, investor_password, account_type
 * }
 */
router.post('/challenges/:id/register', async (req: Request, res: Response) => {
  try {
    const challengeId = parseInt(param(req, "id"));
    const {
      discord_user_id,
      username,
      nickname,
      email,
      account_number,
      mt5_server,
      investor_password,
      account_type,
    } = req.body;

    // Validation
    if (!discord_user_id || !account_number || !mt5_server || !investor_password || !account_type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check challenge exists and is open for registration
    const challenge = await db.query(
      `SELECT * FROM trading_challenges WHERE id = $1`,
      [challengeId]
    );

    if (challenge.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const c = challenge.rows[0];
    if (c.status !== 'registration_open') {
      return res.status(400).json({ error: 'Registration is not open for this challenge' });
    }

    // Check registration deadline
    if (c.registration_deadline && new Date() > new Date(c.registration_deadline)) {
      return res.status(400).json({ error: 'Registration deadline has passed' });
    }

    // Check if already registered (by discord_user_id or account_number)
    const existing = await db.query(
      `SELECT id FROM trading_registrations 
       WHERE challenge_id = $1 AND (discord_user_id = $2 OR account_number = $3)`,
      [challengeId, discord_user_id, account_number]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Already registered for this challenge' });
    }

    // Check account type matches challenge type
    if (c.type === 'demo' && account_type !== 'demo') {
      return res.status(400).json({ error: 'This challenge only accepts demo accounts' });
    }
    if (c.type === 'real' && account_type !== 'real') {
      return res.status(400).json({ error: 'This challenge only accepts real accounts' });
    }

    // Insert registration (use discord_user_id as telegram_id placeholder with offset to avoid conflicts)
    // We use a large offset to distinguish Discord users from Telegram users
    const discordTelegramId = BigInt(discord_user_id);

    const regResult = await db.query(
      `INSERT INTO trading_registrations 
       (challenge_id, telegram_id, discord_user_id, username, nickname, account_type, email,
        account_number, mt5_server, investor_password, source, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'discord', 'registered')
       RETURNING *`,
      [
        challengeId, discordTelegramId, discord_user_id,
        username || '', nickname || username || '',
        account_type, email || '',
        account_number, mt5_server, investor_password,
      ]
    );

    const registration = regResult.rows[0];

    return res.json({
      success: true,
      registration: {
        id: registration.id,
        challengeId: registration.challenge_id,
        accountNumber: registration.account_number,
        accountType: registration.account_type,
        server: registration.mt5_server,
        nickname: registration.nickname,
        status: registration.status,
      },
    });
  } catch (error: any) {
    // Handle unique constraint violations
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Already registered (duplicate account or user)' });
    }
    console.error('Discord register error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== VERIFY CONNECTION (VPS CHECK) ====================

/**
 * POST /api/discord/challenges/:id/verify/:registrationId
 * Triggers VPS connection check for a registration
 */
router.post('/challenges/:id/verify/:registrationId', async (req: Request, res: Response) => {
  try {
    const registrationId = parseInt(param(req, "registrationId"));

    // Get registration
    const reg = await db.query(
      `SELECT * FROM trading_registrations WHERE id = $1`,
      [registrationId]
    );

    if (reg.rows.length === 0) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    const registration = reg.rows[0];

    // Call VPS service to verify connection
    try {
      const vpsResult = await vpsService.verifyConnection(
        registration.account_number,
        registration.mt5_server,
        registration.investor_password
      );

      if (vpsResult.success) {
        // Update registration as verified
        await db.query(
          `UPDATE trading_registrations 
           SET connection_verified = true, connection_verified_at = NOW(), pull_status = 'ready'
           WHERE id = $1`,
          [registrationId]
        );

        return res.json({
          success: true,
          verified: true,
          balance: vpsResult.balance,
          equity: vpsResult.equity,
          server: vpsResult.server,
        });
      } else {
        return res.json({
          success: true,
          verified: false,
          error: vpsResult.message || 'Connection failed',
        });
      }
    } catch (vpsError: any) {
      return res.json({
        success: true,
        verified: false,
        error: vpsError.message || 'VPS service unavailable',
      });
    }
  } catch (error) {
    console.error('Discord verify error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== GET LEADERBOARD ====================

/**
 * GET /api/discord/challenges/:id/leaderboard
 * Query: ?category=demo|real|all&limit=10
 */
router.get('/challenges/:id/leaderboard', async (req: Request, res: Response) => {
  try {
    const challengeId = parseInt(param(req, "id"));
    const category = req.query.category as string || 'all';
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    let query = `
      SELECT nickname, username, account_type, rank, current_balance, adjusted_balance,
             qualified_profit, gross_profit, total_trades, flagged_trades, is_qualified
      FROM wp_leaderboard
      WHERE challenge_id = $1 AND is_disqualified = false
    `;
    const params: any[] = [challengeId];

    if (category === 'demo' || category === 'real') {
      query += ` AND account_type = $2`;
      params.push(category);
      query += ` ORDER BY rank ASC NULLS LAST LIMIT $3`;
      params.push(limit);
    } else {
      query += ` ORDER BY rank ASC NULLS LAST LIMIT $2`;
      params.push(limit);
    }

    const result = await db.query(query, params);

    return res.json({
      leaderboard: result.rows.map(r => ({
        nickname: r.nickname,
        username: r.username,
        accountType: r.account_type,
        rank: r.rank,
        currentBalance: parseFloat(r.current_balance),
        adjustedBalance: parseFloat(r.adjusted_balance),
        qualifiedProfit: parseFloat(r.qualified_profit),
        grossProfit: parseFloat(r.gross_profit),
        totalTrades: r.total_trades,
        flaggedTrades: r.flagged_trades,
        isQualified: r.is_qualified,
      })),
    });
  } catch (error) {
    console.error('Discord leaderboard error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== GET WINNERS ====================

/**
 * GET /api/discord/challenges/:id/winners
 */
router.get('/challenges/:id/winners', async (req: Request, res: Response) => {
  try {
    const challengeId = parseInt(param(req, "id"));

    const result = await db.query(
      `SELECT w.position, w.category, w.prize_amount, r.nickname, r.username, r.account_type,
              l.qualified_profit, l.current_balance
       FROM trading_winners w
       JOIN trading_registrations r ON w.registration_id = r.id
       LEFT JOIN wp_leaderboard l ON w.registration_id = l.registration_id
       WHERE w.challenge_id = $1
       ORDER BY w.category, w.position ASC`,
      [challengeId]
    );

    return res.json({
      winners: result.rows.map(w => ({
        position: w.position,
        category: w.category,
        prizeAmount: w.prize_amount,
        nickname: w.nickname,
        username: w.username,
        accountType: w.account_type,
        qualifiedProfit: w.qualified_profit ? parseFloat(w.qualified_profit) : 0,
        currentBalance: w.current_balance ? parseFloat(w.current_balance) : 0,
      })),
    });
  } catch (error) {
    console.error('Discord winners error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== UPDATE CHALLENGE STATUS ====================

/**
 * PATCH /api/discord/challenges/:id/status
 * Body: { status: 'active' | 'completed' | 'registration_open' }
 */
router.patch('/challenges/:id/status', async (req: Request, res: Response) => {
  try {
    const challengeId = parseInt(param(req, "id"));
    const { status } = req.body;

    const validStatuses = ['registration_open', 'active', 'submission_open', 'reviewing', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    await db.query(
      `UPDATE trading_challenges SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, challengeId]
    );

    return res.json({ success: true, status });
  } catch (error) {
    console.error('Discord update status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== SAVE DISCORD MESSAGE ID ====================

/**
 * PATCH /api/discord/challenges/:id/message
 * Body: { discord_channel_message_id }
 */
router.patch('/challenges/:id/message', async (req: Request, res: Response) => {
  try {
    const challengeId = parseInt(param(req, "id"));
    const { discord_channel_message_id } = req.body;

    await db.query(
      `UPDATE trading_challenges SET discord_channel_message_id = $1 WHERE id = $2`,
      [discord_channel_message_id, challengeId]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Discord save message error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== DELETE CHALLENGE ====================

/**
 * DELETE /api/discord/challenges/:id
 * Permanently deletes a challenge (sets status to 'deleted')
 */
router.delete('/challenges/:id', async (req: Request, res: Response) => {
  try {
    const challengeId = parseInt(param(req, "id"));

    // Check challenge exists
    const existing = await db.query(
      `SELECT id, title, status FROM trading_challenges WHERE id = $1`,
      [challengeId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    // Set status to deleted (soft delete)
    await db.query(
      `UPDATE trading_challenges SET status = 'deleted', updated_at = NOW() WHERE id = $1`,
      [challengeId]
    );

    return res.json({
      success: true,
      message: `Challenge "${existing.rows[0].title}" (ID: ${challengeId}) deleted`,
    });
  } catch (error) {
    console.error('Discord delete challenge error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as discordRoutes };
