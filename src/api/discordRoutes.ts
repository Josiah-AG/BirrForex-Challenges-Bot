import { ConfigurationError } from '../utils/configValidation';
import { Router, Request, Response } from 'express';
import { db } from '../database/db';
import { vpsService } from '../services/vpsService';
import rateLimit from 'express-rate-limit';

const router = Router();

/** Get the running bot's Telegram instance (set in index.ts via global) */
function getTelegram(): any | null {
  const bot = (global as any).__bot;
  return bot?.bot?.telegram || null;
}

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
  if (!apiKey || apiKey.length !== DISCORD_API_KEY.length) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  // Timing-safe comparison
  const crypto = require('crypto');
  const keyBuffer = Buffer.from(apiKey);
  const expectedBuffer = Buffer.from(DISCORD_API_KEY);
  if (!crypto.timingSafeEqual(keyBuffer, expectedBuffer)) {
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

    // Queue for Telegram admin confirmation instead of immediate execution
    const gatekeeper = require('../services/challengeGatekeeper');
    const data = {
      title, type, source: 'discord', team_only: true,
      start_date, end_date, registration_deadline,
      starting_balance, target_balance,
      prize_pool_text, real_winners_count, demo_winners_count,
      real_prizes, demo_prizes,
      rules: req.body.rules,
      rules_demo:req.body.rules_demo,rules_real:req.body.rules_real,
      timezone:req.body.timezone,deposit_mode:req.body.deposit_mode,target_percent:req.body.target_percent,
      target_enabled:req.body.target_enabled,allow_below_start:req.body.allow_below_start,
      split_category_settings:req.body.split_category_settings,
      demo_starting_balance:req.body.demo_starting_balance,demo_target_balance:req.body.demo_target_balance,
      real_starting_balance:req.body.real_starting_balance,real_target_balance:req.body.real_target_balance,
      demo_deposit_mode:req.body.demo_deposit_mode,real_deposit_mode:req.body.real_deposit_mode,
      demo_target_percent:req.body.demo_target_percent,real_target_percent:req.body.real_target_percent,
      demo_target_enabled:req.body.demo_target_enabled,real_target_enabled:req.body.real_target_enabled,
      demo_allow_below_start:req.body.demo_allow_below_start,real_allow_below_start:req.body.real_allow_below_start,
    };
    const token = await gatekeeper.queueCreate(data);

    // Send confirmation to admin Telegram
    try {
      
      
      const telegram = getTelegram(); if (telegram) {
        const { Markup } = require('telegraf');
        const msg = await telegram.sendMessage(
          process.env.ADMIN_USER_ID || '',
          gatekeeper.buildCreateMessage(data),
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Confirm Create', `gate_approve_${token}`)],
              [Markup.button.callback('❌ Reject', `gate_reject_${token}`)],
            ]),
          }
        );
        await gatekeeper.setMessageId(token, msg.message_id);
      }
    } catch (_e) { /* silent */ }

    // Creation is pending until the durable approval is committed.
    return res.status(202).json({
      pendingApproval: true,
      success: true,
      challenge: {
        id: 0,
        title,
        type,
        status: 'pending_approval',
        startDate: start_date,
        endDate: end_date,
        registrationDeadline: registration_deadline || end_date,
        startingBalance: parseFloat(starting_balance),
      },
    });
  } catch (error) {
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
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
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
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
      is_cent,
      account_subtype,
      registration_balance,
      connection_verified,
    } = req.body;

    // Validation
    if (!discord_user_id || !account_number || !mt5_server || !investor_password || !account_type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate nickname (brand protection + sanitization)
    if (nickname) {
      const { isBlockedNickname } = require('../utils/helpers');
      if (isBlockedNickname(nickname)) {
        return res.status(400).json({ error: 'That nickname is too similar to our brand. Please choose a different nickname.' });
      }
      // Same alphanumeric validation as Telegram — prevents HTML injection
      if (!/^[a-zA-Z0-9_]+$/.test(nickname) || nickname.length < 3 || nickname.length > 20) {
        return res.status(400).json({ error: 'Nickname must be 3-20 characters, letters/numbers/underscores only.' });
      }
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

    // Registration is open as long as challenge status is 'registration_open'
    // No separate deadline — status change to 'active' closes registration

    // Check if already registered (by user_id or account_number) — exclude removed registrations
    const existing = await db.query(
      `SELECT id, status FROM trading_registrations 
       WHERE challenge_id = $1 AND (user_id = $2 OR account_number = $3)
         AND (status IS NULL OR status != 'removed')`,
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

    // Never trust caller-supplied verification flags, balance or currency.
    const {tradingChallengeService}=require('../services/tradingChallengeService');
    const registration=await tradingChallengeService.registerUser({challenge_id:challengeId,user_id:discord_user_id,
      username:username || null,nickname:nickname || username || null,email:email || '',account_type,
      account_number,mt5_server,investor_password,client_uid:null,source:'discord'});

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

// ==================== VERIFY CONNECTION (PRE-SAVE) ====================

/**
 * POST /api/discord/verify-connection
 * Body: { account_number, mt5_server, investor_password, challenge_id? }
 * Verifies VPS connection WITHOUT requiring a registration ID (pre-save check)
 * If challenge_id provided, also checks cent-only and balance rules
 */
router.post('/verify-connection', async (req: Request, res: Response) => {
  try {
    const { account_number, mt5_server, investor_password, challenge_id } = req.body;

    if (!account_number || !mt5_server || !investor_password) {
      return res.status(400).json({ error: 'Missing required fields', verified: false });
    }

    // Fuzzy match the server name to a known Exness server
    const { fuzzyMatchServer } = require('../services/vpsService');
    const accountType = mt5_server.toLowerCase().includes('trial') ? 'demo' : 'real';
    const matchedServer = fuzzyMatchServer(mt5_server, accountType) || mt5_server;

    console.log(`🔍 Discord VPS verify: acct=${account_number}, server=${mt5_server} → matched=${matchedServer}`);

    try {
      const vpsResult = await vpsService.verifyConnection(account_number, matchedServer, investor_password);
      console.log(`🔍 Discord VPS result: ${JSON.stringify(vpsResult)}`);

      if (vpsResult.success) {
        const balance = vpsResult.balance || 0;
        const currency = vpsResult.currency || '';

        // If challenge_id provided, check cent-only and balance rules
        let centOnly = false;
        let isCentAccount = false;
        let startingBalance = 0;
        let balanceRejection: string | null = null;

        // Detect cent account by currency: USC = US Cent
        isCentAccount = currency.toUpperCase() === 'USC' || currency.toUpperCase() === 'USCENT';
        const subtype = (vpsResult.account_subtype || '').toLowerCase();
        const isProRawZero = ['pro', 'raw_spread', 'zero'].includes(subtype);

        // Reject Pro/Raw/Zero subtypes — only Standard and Standard Cent allowed
        if (accountType === 'demo' && subtype && subtype !== 'standard' && subtype !== 'unknown') {
          return res.json({
            verified: true, balance, equity: vpsResult.equity, server: matchedServer, currency,
            rejected: true, rejectionReason: 'account_subtype_not_allowed',
            message: `Your demo account is a ${subtype} account. Demo category only accepts Standard accounts.\n\nCreate a Standard demo account and try again.`,
          });
        }
        if (accountType === 'real' && !isCentAccount && isProRawZero) {
          return res.json({
            verified: true, balance, equity: vpsResult.equity, server: matchedServer, currency,
            rejected: true, rejectionReason: 'account_subtype_not_allowed',
            message: `Your account is a ${subtype === 'pro' ? 'Pro' : subtype === 'zero' ? 'Zero' : 'Raw Spread'} account. This challenge only accepts Standard or Standard Cent accounts.\n\nCreate a Standard or Standard Cent account and try again.`,
          });
        }

        if (challenge_id) {
          const challengeData = await db.query(
            `SELECT c.starting_balance, c.type, r.parameters as rules_config
             FROM trading_challenges c
             LEFT JOIN wp_challenge_rules r ON c.id = r.challenge_id AND r.rule_code = CASE WHEN c.type='hybrid' AND c.split_category_settings THEN 'config_' || $2 ELSE 'config' END
             WHERE c.id = $1`, [challenge_id, accountType]);

          if (challengeData.rows.length > 0) {
            startingBalance = parseFloat(challengeData.rows[0]?.starting_balance || 0);
            centOnly = challengeData.rows[0]?.rules_config?.only_cent_account || false;

            // Cent-only check: reject standard accounts
            if (centOnly && accountType === 'real' && !isCentAccount) {
              return res.json({
                verified: true,
                balance,
                equity: vpsResult.equity,
                server: matchedServer,
                currency,
                rejected: true,
                rejectionReason: 'cent_only',
                message: 'This challenge requires a Cent Account. Your account currency is not USC (US Cent). Please create a Standard Cent account on Exness and try again.',
              });
            }

            // Balance too high check
            if (centOnly && accountType === 'real') {
              // Cent-only real: admin entered in cent terms, compare directly
              if (balance > startingBalance) {
                return res.json({
                  verified: true,
                  balance,
                  equity: vpsResult.equity,
                  server: matchedServer,
                  currency,
                  rejected: true,
                  rejectionReason: 'balance_too_high',
                  message: `Your balance (${balance}¢) exceeds the starting balance of ${startingBalance}¢. Please withdraw or transfer funds.`,
                });
              }
            } else if (!centOnly && accountType === 'real') {
              const compareBalance = isCentAccount ? startingBalance * 100 : startingBalance;
              if (balance > compareBalance) {
                return res.json({
                  verified: true,
                  balance,
                  equity: vpsResult.equity,
                  server: matchedServer,
                  currency,
                  rejected: true,
                  rejectionReason: 'balance_too_high',
                  message: `Your balance (${isCentAccount ? balance + '¢' : '$' + balance.toFixed(2)}) exceeds the starting balance. Please withdraw or transfer funds.`,
                });
              }
            }
          }
        }

        return res.json({
          verified: true,
          balance,
          equity: vpsResult.equity,
          server: matchedServer,
          currency,
          isCentAccount,
          centOnly,
          accountSubtype: vpsResult.account_subtype || (isCentAccount ? 'standard_cent' : 'standard'),
        });
      } else {
        return res.json({
          verified: false,
          error: vpsResult.message || 'Connection failed',
        });
      }
    } catch (vpsError: any) {
      return res.json({
        verified: false,
        error: vpsError.message || 'VPS service unavailable',
      });
    }
  } catch (error) {
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
    console.error('Discord verify-connection error:', error);
    return res.status(500).json({ error: 'Internal server error', verified: false });
  }
});

// ==================== VERIFY CONNECTION (VPS CHECK) ====================

/**
 * POST /api/discord/challenges/:id/verify/:registrationId
 * Triggers VPS connection check for a registration
 */
router.post('/challenges/:id/verify/:registrationId', async (req: Request,res: Response)=>{
  try {
    const challengeId=Number(param(req,'id')), registrationId=Number(param(req,'registrationId'));
    const registration=(await db.query(`SELECT * FROM trading_registrations WHERE id=$1 AND challenge_id=$2 AND status IS DISTINCT FROM 'removed'`,[registrationId,challengeId])).rows[0];
    if(!registration)return res.status(404).json({error:'Registration not found'});
    const verified=await vpsService.verifyConnection(registration.account_number,registration.mt5_server,registration.investor_password);
    const {validateVerifiedRegistration,validateHostAllocation}=require('../services/registrationEligibility');
    await validateVerifiedRegistration(challengeId,registration.account_type,verified,'native');
    await validateHostAllocation(challengeId,registration.email || '');
    const isCent=['USC','USCENT'].includes((verified.currency || '').toUpperCase());
    await db.query(`UPDATE trading_registrations SET connection_verified=true,connection_verified_at=NOW(),last_known_balance=$2,registration_balance=$2,is_cent=$3,account_subtype=$4 WHERE id=$1`,[registrationId,verified.balance,isCent,verified.account_subtype]);
    return res.json({success:true,verified:true,balance:verified.balance,isCent,server:verified.server});
  }catch(error){return res.status(400).json({success:false,verified:false,error:(error as Error).message});}
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
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
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
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
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
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
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
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
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

    const title = existing.rows[0].title;

    // Queue for Telegram admin confirmation instead of immediate execution
    const gatekeeper = require('../services/challengeGatekeeper');
    const token = await gatekeeper.queueDelete(challengeId, title);

    // Send confirmation to admin Telegram
    try {
      
      
      const telegram = getTelegram(); if (telegram) {
        const { Markup } = require('telegraf');
        const msg = await telegram.sendMessage(
          process.env.ADMIN_USER_ID || '',
          gatekeeper.buildDeleteMessage(challengeId, title),
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Confirm Delete', `gate_approve_${token}`)],
              [Markup.button.callback('❌ Reject', `gate_reject_${token}`)],
            ]),
          }
        );
        await gatekeeper.setMessageId(token, msg.message_id);
      }
    } catch (_e) { /* silent */ }

    // Deletion is pending approval.
    return res.status(202).json({
      pendingApproval: true,
      success: true,
      message: `Deletion of challenge "${title}" (ID: ${challengeId}) is pending approval`,
    });
  } catch (error) {
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
    console.error('Discord delete challenge error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== VERIFY REAL ACCOUNT ALLOCATION ====================

/**
 * POST /api/discord/verify-real-account
 * Body: { account_number }
 * Checks if a real account is allocated under BirrForex + is MT5
 * Response: { status: "allocated_mt5" | "allocated_not_mt5" | "not_allocated" | "api_error" }
 */
router.post('/verify-real-account', async (req: Request, res: Response) => {
  try {
    const { account_number } = req.body;

    if (!account_number) {
      return res.status(400).json({ error: 'Missing account_number', status: 'api_error' });
    }

    // Use the exnessService to verify real account allocation
    const { exnessService } = require('../services/exnessService');
    const result = await exnessService.verifyRealAccount(account_number);

    return res.json({
      status: result.status, // 'allocated_mt5' | 'allocated_not_mt5' | 'not_allocated' | 'api_error'
      data: result.data || null,
    });
  } catch (error) {
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
    console.error('Discord verify-real-account error:', error);
    return res.status(500).json({ status: 'api_error', error: 'Internal server error' });
  }
});

// ==================== CHECK REGISTRATION STATUS ====================

/**
 * GET /api/discord/challenges/:id/check-registration/:userId
 * Check if a Discord user is already registered for a challenge.
 */
router.get('/challenges/:id/check-registration/:userId', async (req: Request, res: Response) => {
  try {
    const challengeId = parseInt(param(req, 'id'));
    const userId = param(req, 'userId');

    const result = await db.query(
      `SELECT id, nickname, account_number, account_type, status
       FROM trading_registrations
       WHERE challenge_id = $1 AND user_id = $2
         AND (status IS NULL OR status != 'removed')
       LIMIT 1`,
      [challengeId, userId]
    );

    if (result.rows.length === 0) {
      return res.json({ registered: false });
    }

    const r = result.rows[0];
    return res.json({
      registered: true,
      registration: {
        id: r.id,
        nickname: r.nickname,
        accountNumber: r.account_number,
        accountType: r.account_type,
      },
    });
  } catch (error) {
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
    console.error('Discord check-registration error:', error);
    return res.status(500).json({ error: 'Internal server error', registered: false });
  }
});

/**
 * GET /api/discord/challenges/:id/check-nickname/:nickname
 * Check if a nickname is already taken for a challenge.
 */
router.get('/challenges/:id/check-nickname/:nickname', async (req: Request, res: Response) => {
  try {
    const challengeId = parseInt(param(req, 'id'));
    const nickname = param(req, 'nickname').trim();

    const result = await db.query(
      'SELECT 1 FROM trading_registrations WHERE challenge_id = $1 AND LOWER(nickname) = LOWER($2)',
      [challengeId, nickname]
    );

    return res.json({ taken: result.rows.length > 0 });
  } catch (error) {
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
    console.error('Discord check-nickname error:', error);
    return res.status(500).json({ error: 'Internal server error', taken: false });
  }
});

// ==================== PENDING ANNOUNCEMENTS (for Discord bot polling) ====================

/**
 * GET /api/discord/pending-announcements
 * Returns challenges that need to be announced in Discord (status = registration_open, discord_channel_message_id = 'pending_announce')
 * Discord bot polls this and posts the announcement with interactive Register button.
 */
router.get('/pending-announcements', async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT c.id, c.title, c.type, c.start_date, c.end_date, c.starting_balance, c.target_balance, c.prize_pool_text, c.registration_deadline, c.real_prizes, c.demo_prizes,
              r.parameters as rules_config
       FROM trading_challenges c
       LEFT JOIN wp_challenge_rules r ON c.id = r.challenge_id AND r.rule_code = CASE WHEN c.type='hybrid' AND c.split_category_settings THEN 'config_real' ELSE 'config' END
       WHERE c.source = 'discord' AND c.status = 'registration_open' AND c.discord_channel_message_id = 'pending_announce'`
    );
    const pending = result.rows.map((row: any) => ({
      ...row,
      only_cent_account: row.rules_config?.only_cent_account || false,
    }));
    return res.json({ pending });
  } catch (error) {
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
    console.error('Pending announcements error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/discord/mark-announced/:id
 * Discord bot calls this after posting the announcement to mark it as done.
 * Body: { message_id }
 */
router.post('/mark-announced/:id', async (req: Request, res: Response) => {
  try {
    const challengeId = parseInt(param(req, "id"));
    const { message_id } = req.body;
    await db.query(
      `UPDATE trading_challenges SET discord_channel_message_id = $1 WHERE id = $2`,
      [message_id || 'announced', challengeId]
    );
    return res.json({ success: true });
  } catch (error) {
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
    console.error('Mark announced error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


// ==================== PENDING LAST CHANCE (for Discord bot polling) ====================

/**
 * GET /api/discord/pending-lastchance
 * Returns challenges that need a "last chance to register" post (discord_channel_message_id = 'pending_lastchance')
 */
router.get('/pending-lastchance', async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT id, title, type, start_date, starting_balance, target_balance, prize_pool_text
       FROM trading_challenges
       WHERE source = 'discord' AND status = 'registration_open' AND discord_channel_message_id = 'pending_lastchance'`
    );
    return res.json({ pending: result.rows });
  } catch (error) {
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
    console.error('Pending lastchance error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/discord/mark-lastchance-done/:id
 * Discord bot calls this after posting the last chance message.
 */
router.post('/mark-lastchance-done/:id', async (req: Request, res: Response) => {
  try {
    const challengeId = parseInt(param(req, "id"));
    // Restore the original message_id (the announcement message) or just mark as done
    await db.query(
      `UPDATE trading_challenges SET discord_channel_message_id = 'lastchance_posted' WHERE id = $1 AND discord_channel_message_id = 'pending_lastchance'`,
      [challengeId]
    );
    return res.json({ success: true });
  } catch (error) {
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
    console.error('Mark lastchance done error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/discord/admin/unregister
 * Called by Discord bot admin /unregister command.
 * Hard-deletes the registration and leaderboard entries.
 * The Discord bot handles the DM to the user itself before calling this.
 * Body: { challenge_id, username, reason }
 */
router.post('/admin/unregister', discordAuth, discordLimiter, async (req: Request, res: Response) => {
  try {
    const { challenge_id, username, reason } = req.body;
    if (!challenge_id || !username || !reason) {
      return res.status(400).json({ error: 'challenge_id, username, and reason are required' });
    }

    // Find the registration by username (case-insensitive)
    const regResult = await db.query(
      `SELECT id, username, email, account_number, user_id, nickname
       FROM trading_registrations
       WHERE challenge_id = $1 AND LOWER(username) = LOWER($2)`,
      [parseInt(challenge_id), username.replace('@', '').trim()]
    );

    if (regResult.rows.length === 0) {
      return res.status(404).json({ error: `No registration found for username "${username}" in this challenge` });
    }

    const reg = regResult.rows[0];

    // Hard delete
    await db.query(`UPDATE trading_registrations SET status='removed',disqualified=true,disqualified_source='removed',disqualified_reason='Registration removed',disqualified_at=NOW() WHERE id=$1`,[reg.id]);
    await db.query(`DELETE FROM wp_leaderboard WHERE registration_id = $1`, [reg.id]);
    await db.query(`DELETE FROM wp_leaderboard_staging WHERE registration_id = $1`, [reg.id]);

    console.log(`✅ Discord admin unregister: @${reg.username} (${reg.account_number}) removed from challenge ${challenge_id}. Reason: ${reason}`);

    return res.json({
      success: true,
      user: {
        username: reg.username,
        nickname: reg.nickname,
        accountNumber: reg.account_number,
        email: reg.email,
        userId: reg.user_id,
      },
    });
  } catch (error) {
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
    console.error('Discord admin unregister error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== DISCORD DM QUEUE ====================

/**
 * GET /api/discord/pending-dms
 * Returns unsent DM notifications for the Discord bot to deliver.
 */
router.get('/pending-dms', discordAuth, async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT id, discord_user_id, notification_type, message_title, message_body, challenge_id, registration_id
       FROM discord_dm_queue WHERE sent = false ORDER BY created_at ASC LIMIT 50`
    );
    return res.json({ notifications: result.rows });
  } catch (error) {
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
    console.error('Discord pending-dms error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/discord/mark-dm-sent/:id
 * Marks a DM notification as sent.
 */
router.post('/mark-dm-sent/:id', discordAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.query(`UPDATE discord_dm_queue SET sent = true, sent_at = NOW() WHERE id = $1`, [id]);
    return res.json({ success: true });
  } catch (error) {
    if(error instanceof ConfigurationError)return res.status(400).json({error:error.message});
    console.error('Discord mark-dm-sent error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as discordRoutes };

