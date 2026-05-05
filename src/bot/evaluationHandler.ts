import { Context, Markup } from 'telegraf';
import axios from 'axios';
import { parseMT5Report } from '../services/mt5Parser';
import { evaluateAccount, EvaluationConfig } from '../services/evaluationEngine';
import { evaluationService, EvaluationRecord } from '../services/evaluationService';
import { tradingChallengeService, TradingChallenge } from '../services/tradingChallengeService';
import { config } from '../config';
import { exnessService } from '../services/exnessService';

interface EvalSession {
  step: string;
  challengeId: number;
  challenge: TradingChallenge;
  isTest: boolean;
  isReevaluate: boolean;
  pendingFileId?: string;
  pendingBuffer?: Buffer;
  pendingParsed?: any;
  pendingSubmission?: any;
}

class EvaluationHandler {
  private evalSessions = new Map<number, EvalSession>();

  hasActiveSession(telegramId: number): boolean {
    const session = this.evalSessions.get(telegramId);
    if (!session) return false;
    // Only intercept text for steps that need text input
    const textSteps = ['find_eval_search', 'delete_eval_search', 'resubmit_search', 'sendeval_search', 'asksubmission_search', 'obo_dq_reason', 'obo_dq_confirm'];
    return textSteps.includes(session.step);
  }

  hasActiveFileSession(telegramId: number): boolean {
    const session = this.evalSessions.get(telegramId);
    if (!session) return false;
    return session.step === 'awaiting_file';
  }

  clearSession(telegramId: number): void {
    this.evalSessions.delete(telegramId);
  }

  getSession(telegramId: number): EvalSession | undefined {
    return this.evalSessions.get(telegramId);
  }

  // ── /evaluate ──

  async evaluate(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) {
        await ctx.reply('❌ You are not authorized.');
        return;
      }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;

      if (!challenge) {
        // Try latest challenge for reviewing status
        const all = await tradingChallengeService.getAllChallenges();
        challenge = all[0] || null;
      }

      if (!challenge) {
        await ctx.reply('❌ No challenge found.');
        return;
      }

      this.evalSessions.set(ctx.from!.id, {
        step: 'awaiting_file',
        challengeId: challenge.id,
        challenge,
        isTest: false,
        isReevaluate: false,
      });

      await ctx.reply(
        `📊 <b>Evaluation Mode</b>\n\n` +
        `Challenge: <b>${challenge.title}</b> (ID: ${challenge.id})\n` +
        `Period: ${new Date(challenge.start_date).toISOString().slice(0, 10)} → ${new Date(challenge.end_date).toISOString().slice(0, 10)}\n\n` +
        `📎 Please upload the MT5 trade history Excel file (.xlsx)`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error('Error in evaluate:', error);
      await ctx.reply('❌ Error starting evaluation. Check logs.');
    }
  }

  // ── /testevaluate ──

  async testevaluate(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) {
        await ctx.reply('❌ You are not authorized.');
        return;
      }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;

      if (!challenge) {
        const all = await tradingChallengeService.getAllChallenges();
        challenge = all[0] || null;
      }

      if (!challenge) {
        await ctx.reply('❌ No challenge found.');
        return;
      }

      this.evalSessions.set(ctx.from!.id, {
        step: 'awaiting_file',
        challengeId: challenge.id,
        challenge,
        isTest: true,
        isReevaluate: false,
      });

      await ctx.reply(
        `🧪 <b>TEST Evaluation Mode</b>\n\n` +
        `Challenge: <b>${challenge.title}</b> (ID: ${challenge.id})\n` +
        `Period: ${new Date(challenge.start_date).toISOString().slice(0, 10)} → ${new Date(challenge.end_date).toISOString().slice(0, 10)}\n\n` +
        `📎 Please upload the MT5 trade history Excel file (.xlsx)\n` +
        `<i>Results will be saved to test table only.</i>`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error('Error in testevaluate:', error);
      await ctx.reply('❌ Error starting test evaluation. Check logs.');
    }
  }

  // ── /reevaluate ──

  async reevaluate(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) {
        await ctx.reply('❌ You are not authorized.');
        return;
      }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;

      if (!challenge) {
        const all = await tradingChallengeService.getAllChallenges();
        challenge = all[0] || null;
      }

      if (!challenge) {
        await ctx.reply('❌ No challenge found.');
        return;
      }

      this.evalSessions.set(ctx.from!.id, {
        step: 'awaiting_file',
        challengeId: challenge.id,
        challenge,
        isTest: false,
        isReevaluate: true,
      });

      await ctx.reply(
        `🔄 <b>Re-evaluation Mode</b>\n\n` +
        `Challenge: <b>${challenge.title}</b> (ID: ${challenge.id})\n` +
        `Period: ${new Date(challenge.start_date).toISOString().slice(0, 10)} → ${new Date(challenge.end_date).toISOString().slice(0, 10)}\n\n` +
        `📎 Please upload the MT5 trade history Excel file (.xlsx)\n` +
        `<i>This will overwrite any existing evaluation for this account.</i>`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error('Error in reevaluate:', error);
      await ctx.reply('❌ Error starting re-evaluation. Check logs.');
    }
  }

  // ── Handle uploaded document ──

  async handleDocument(ctx: Context, fileId: string, fileName: string): Promise<void> {
    try {
      const session = this.evalSessions.get(ctx.from!.id);
      if (!session || session.step !== 'awaiting_file') {
        return;
      }

      await ctx.reply('⏳ Processing file...');

      // Download file from Telegram
      const fileLink = await (ctx as any).telegram.getFileLink(fileId);
      const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);

      // Parse MT5 report
      const parsed = parseMT5Report(buffer);
      const accountNumber = parsed.account.accountNumber;

      if (!accountNumber) {
        await ctx.reply('❌ Could not extract account number from the file. Please check the file format.');
        this.evalSessions.delete(ctx.from!.id);
        return;
      }

      await ctx.reply('📋 Parsed account: <b>' + accountNumber + '</b> (' + parsed.account.accountType + ')\n📈 ' + parsed.positions.length + ' positions, ' + parsed.deals.length + ' deals', { parse_mode: 'HTML' });

      // Look up submission in DB (both test and real mode)
      const submission = await evaluationService.findSubmissionByAccount(session.challengeId, accountNumber);

      if (submission) {
        await ctx.reply(
          '✅ <b>User found in submissions:</b>\n' +
          '👤 Username: @' + (submission.username || 'unknown') + '\n' +
          '🆔 Telegram ID: ' + submission.telegram_id + '\n' +
          '📧 Email: ' + submission.email + '\n' +
          '📊 Category: ' + submission.account_type + '\n' +
          '💰 Reported Balance: ' + Number(submission.final_balance).toFixed(2),
          { parse_mode: 'HTML' }
        );
      } else {
        await ctx.reply(
          '⚠️ <b>Warning:</b> No submission found for account ' + accountNumber + ' in challenge ' + session.challengeId + '.\n' +
          'Continuing evaluation anyway...',
          { parse_mode: 'HTML' }
        );
      }

      // Check for existing evaluation (only for /evaluate, not /reevaluate or /testevaluate)
      if (!session.isReevaluate && !session.isTest) {
        const existing = await evaluationService.getEvaluation(session.challengeId, accountNumber);
        if (existing) {
          // Store pending data in session for later continuation
          session.step = 'eval_overwrite_confirm';
          session.pendingFileId = fileId;
          session.pendingBuffer = buffer;
          session.pendingParsed = parsed;
          session.pendingSubmission = submission;

          await ctx.reply(
            '⚠️ <b>This account was already evaluated!</b>\n\n' +
            '📅 Account: ' + accountNumber + '\n' +
            '💰 Previous Adjusted Balance: $' + Number(existing.adjusted_balance).toFixed(2) + '\n' +
            '📈 Previous Trades: ' + existing.total_trades + ' | Flagged: ' + existing.flagged_count + '\n' +
            (existing.is_qualified ? '✅ Previously: QUALIFIED' : existing.is_disqualified ? '🚫 Previously: DISQUALIFIED' : '❌ Previously: Below Target') + '\n\n' +
            'Do you want to overwrite with a new evaluation?',
            {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ Yes, Overwrite', 'eval_overwrite_yes')],
                [Markup.button.callback('❌ No, Keep Existing', 'eval_overwrite_no')],
              ]),
            }
          );
          return;
        }
      }

      // Continue with evaluation processing
      await this.processEvaluation(ctx, session, fileId, buffer, parsed, submission);
    } catch (error) {
      console.error('Error in handleDocument:', error);
      await ctx.reply('❌ Error processing file: ' + (error as Error).message);
      this.evalSessions.delete(ctx.from!.id);
    }
  }

  // ── Handle overwrite confirmation ──

  async handleOverwriteConfirm(ctx: Context): Promise<void> {
    try {
      const session = this.evalSessions.get(ctx.from!.id);
      if (!session || session.step !== 'eval_overwrite_confirm') {
        await ctx.reply('❌ No pending evaluation to overwrite.');
        return;
      }

      // Restore pending data and continue as reevaluate
      session.isReevaluate = true;
      session.step = 'awaiting_file';

      // Re-run handleDocument with stored data
      await this.processEvaluation(ctx, session, session.pendingFileId!, session.pendingBuffer!, session.pendingParsed!, session.pendingSubmission);
    } catch (error) {
      console.error('Error in handleOverwriteConfirm:', error);
      await ctx.reply('❌ Error continuing evaluation.');
      this.evalSessions.delete(ctx.from!.id);
    }
  }

  // ── Process evaluation (extracted from handleDocument) ──

  private async processEvaluation(ctx: Context, session: EvalSession, fileId: string, buffer: Buffer, parsed: any, submission: any): Promise<void> {
    const accountNumber = parsed.account.accountNumber;

    // Forward document to submission channel for storage
    let fileMessageId: number | null = null;
    try {
      if (config.submissionChannelId) {
        const forwarded = await (ctx as any).telegram.sendDocument(
          config.submissionChannelId,
          fileId,
          { caption: `Evaluation: Account ${accountNumber} | Challenge ${session.challengeId}${session.isTest ? ' [TEST]' : ''}` }
        );
        fileMessageId = forwarded.message_id;
      }
    } catch (fwdErr) {
      console.error('Error forwarding document to submission channel:', fwdErr);
    }

    // Build evaluation config from challenge settings
    // Use the challenge dates as the admin entered them (EAT)
    const challenge = session.challenge;
    const startDate = new Date(new Date(challenge.start_date).getTime() + 3 * 60 * 60 * 1000);
    const endDate = new Date(new Date(challenge.end_date).getTime() + 3 * 60 * 60 * 1000);
    const evalConfig: EvaluationConfig = {
      challengeStartDate: startDate.getUTCFullYear() + '-' + String(startDate.getUTCMonth() + 1).padStart(2, '0') + '-' + String(startDate.getUTCDate()).padStart(2, '0'),
      challengeEndDate: endDate.getUTCFullYear() + '-' + String(endDate.getUTCMonth() + 1).padStart(2, '0') + '-' + String(endDate.getUTCDate()).padStart(2, '0'),
      startingBalanceLimit: challenge.starting_balance || 50,
      targetBalance: challenge.target_balance || 100,
      maxLot: 0.02,
      maxOpenTrades: 3,
      maxSamePair: 2,
      maxSlDollars: 6,
      maxDailyLoss: 10,
      maxHoldHours: 24,
      minActiveDays: 7,
    };

    // Run evaluation
    const result = evaluateAccount(
      parsed.account,
      parsed.positions,
      parsed.deals,
      parsed.reportedBalance,
      evalConfig
    );

    // Save evaluation
    const evalData = {
      challenge_id: session.challengeId,
      registration_id: submission?.registration_id || 0,
      account_number: accountNumber,
      account_type: submission?.account_type || parsed.account.accountType,
      username: submission?.username || null,
      telegram_id: submission?.telegram_id || 0,
      email: submission?.email || null,
      file_id: fileId,
      file_message_id: fileMessageId,
      reported_balance: result.reportedBalance,
      adjusted_balance: result.adjustedBalance,
      total_trades: result.totalTrades,
      flagged_count: result.flaggedCount,
      profit_removed: result.profitRemoved,
      is_qualified: result.isQualified,
      is_disqualified: result.isDisqualified,
      disqualify_reason: result.disqualifyReasons.length > 0 ? result.disqualifyReasons.join('; ') : null,
      short_report: result.shortReport,
      full_report: result.fullReport,
      flagged_details: result.flaggedTrades,
    };

    let savedEval: EvaluationRecord;
    if (session.isTest) {
      savedEval = await evaluationService.saveTestEvaluation(evalData);
    } else {
      savedEval = await evaluationService.saveEvaluation(evalData, false);
    }

    // Send short report to admin
    await ctx.reply(
      `${session.isTest ? '🧪 TEST ' : ''}${result.shortReport}\n\n` +
      `💾 Saved (ID: ${savedEval.id})`,
      { parse_mode: 'HTML' }
    );

    // Send full report (split if needed)
    const parts = this.splitMessage(result.fullReport);
    for (const part of parts) {
      await ctx.reply(part);
    }

    // Check if we're in one-by-one mode
    const isOneByOne = (session as any).currentSubmissionId !== undefined;
    
    // Clear session
    this.evalSessions.delete(ctx.from!.id);

    if (isOneByOne) {
      await ctx.reply(
        '✅ Evaluation complete. What next?',
        Markup.inlineKeyboard([
          [Markup.button.callback('⏭️ Next Account', 'eval_obo_next')],
          [Markup.button.callback('🛑 Stop', 'eval_obo_stop')],
        ])
      );
    }
  }

  // ── Handle text input for find/delete eval sessions ──

  async handleTextForEval(ctx: Context, text: string): Promise<void> {
    const session = this.evalSessions.get(ctx.from!.id);
    if (!session) return;

    if (session.step === 'find_eval_search') {
      this.evalSessions.delete(ctx.from!.id);
      try {
        const results = await evaluationService.searchEvaluation(session.challengeId, text);
        if (results.length === 0) {
          await ctx.reply('❌ No evaluation found for "' + text + '"');
          return;
        }

        const botInfo = await (ctx as any).telegram.getMe();
        for (const evaluation of results) {
          const category = evaluation.account_type === 'real' ? 'Real' : 'Demo';
          let caption = '📋 <b>Evaluation Found</b>\n\n';
          caption += '👤 @' + (evaluation.username || 'unknown') + '\n';
          caption += '🆔 TG: ' + evaluation.telegram_id + '\n';
          caption += '📧 ' + (evaluation.email || 'N/A') + '\n';
          caption += '📁 <b>' + category + '</b> | Account: <b>' + evaluation.account_number + '</b>\n\n';
          if (evaluation.is_disqualified) {
            caption += '🚫 <b>DISQUALIFIED</b>\n📛 ' + (evaluation.disqualify_reason || 'Rule violation') + '\n';
          } else {
            caption += '💰 Adjusted: <b>$' + Number(evaluation.adjusted_balance).toFixed(2) + '</b>\n';
            caption += '💰 Reported: $' + Number(evaluation.reported_balance).toFixed(2) + '\n';
            caption += '📈 Trades: ' + evaluation.total_trades + ' | Flagged: ' + evaluation.flagged_count + '\n';
            caption += (evaluation.is_qualified ? '✅ QUALIFIES' : '❌ Below Target') + '\n';
          }

          await (ctx as any).telegram.sendDocument(ctx.from!.id, evaluation.file_id, {
            caption: caption,
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.url('📊 Show Detail Report', 'https://t.me/' + botInfo.username + '?start=eval_report_' + evaluation.id)]]),
          });
        }
        await ctx.reply('Found ' + results.length + ' evaluation(s).');
      } catch (error) {
        console.error('Error searching evaluation:', error);
        await ctx.reply('❌ Error searching.');
      }
    }

    if (session.step === 'delete_eval_search') {
      try {
        const results = await evaluationService.searchEvaluation(session.challengeId, text);
        if (results.length === 0) {
          await ctx.reply('❌ No evaluation found for "' + text + '"');
          this.evalSessions.delete(ctx.from!.id);
          return;
        }

        if (results.length > 1) {
          let msg = '⚠️ Multiple evaluations found. Be more specific:\n\n';
          results.forEach((e, i) => {
            msg += (i + 1) + '. @' + (e.username || 'unknown') + ' | ' + e.account_number + ' (' + e.account_type + ') | $' + Number(e.adjusted_balance).toFixed(2) + '\n';
          });
          await ctx.reply(msg);
          return;
        }

        const evaluation = results[0];
        session.step = 'delete_eval_confirm';
        (session as any).deleteEvalId = evaluation.id;

        await ctx.reply(
          '🗑️ <b>Delete this evaluation?</b>\n\n' +
          '👤 @' + (evaluation.username || 'unknown') + '\n' +
          '📅 Account: ' + evaluation.account_number + ' (' + evaluation.account_type + ')\n' +
          '💰 Adjusted: $' + Number(evaluation.adjusted_balance).toFixed(2) + '\n' +
          '📈 Trades: ' + evaluation.total_trades + '\n\n' +
          '<b>This cannot be undone.</b>',
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Yes, Delete', 'eval_delete_confirm_' + evaluation.id)],
              [Markup.button.callback('❌ Cancel', 'eval_delete_cancel')],
            ]),
          }
        );
      } catch (error) {
        console.error('Error in delete search:', error);
        await ctx.reply('❌ Error searching.');
        this.evalSessions.delete(ctx.from!.id);
      }
    }

    if (session.step === 'resubmit_search') {
      this.evalSessions.delete(ctx.from!.id);
      try {
        const results = await evaluationService.searchSubmission(session.challengeId, text);
        if (results.length === 0) {
          await ctx.reply('❌ No submission found for "' + text + '"');
          return;
        }

        if (results.length > 1) {
          let msg = '⚠️ Multiple submissions found. Be more specific:\n\n';
          results.forEach((s: any, i: number) => {
            msg += (i + 1) + '. @' + (s.username || 'unknown') + ' | ' + s.account_number + ' (' + s.account_type + ')\n';
          });
          await ctx.reply(msg);
          return;
        }

        const sub = results[0];
        const botInfo = await (ctx as any).telegram.getMe();

        // Send resubmission request to user
        try {
          await (ctx as any).telegram.sendMessage(
            sub.telegram_id,
            '⚠️ <b>Action Required — ' + session.challenge.title + '</b>\n\n' +
            'We could not log in to your challenge account to verify your results.\n\n' +
            'Please resubmit your account details using the button below.\n\n' +
            '<b>Make sure all details are correct:</b>\n' +
            '• Your MT5 account number\n' +
            '• Your MT5 server name\n' +
            '• Your investor (read-only) password\n' +
            '• Your final account balance\n\n' +
            '<i>Double-check everything before submitting.</i>',
            {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.url('🔄 Resubmit Account', 'https://t.me/' + botInfo.username + '?start=tc_resubmit_' + sub.id)],
              ]),
            }
          );
          await ctx.reply(
            '✅ Resubmission request sent to @' + (sub.username || 'unknown') + ' (TG: ' + sub.telegram_id + ')\n' +
            '📅 Account: ' + sub.account_number + ' (' + sub.account_type + ')'
          );
        } catch (err) {
          console.error('Error sending resubmission request:', err);
          await ctx.reply('❌ Could not send message to user. They may have blocked the bot.');
        }
      } catch (error) {
        console.error('Error in resubmit search:', error);
        await ctx.reply('❌ Error searching.');
      }
    }

    if (session.step === 'sendeval_search') {
      this.evalSessions.delete(ctx.from!.id);
      try {
        const results = await evaluationService.searchEvaluation(session.challengeId, text);
        if (results.length === 0) {
          await ctx.reply('❌ No evaluation found for "' + text + '"');
          return;
        }

        const evaluation = results[0];
        const botInfo = await (ctx as any).telegram.getMe();

        if (!evaluation.telegram_id || evaluation.telegram_id === 0) {
          await ctx.reply('❌ This evaluation has no Telegram ID linked. Cannot send.');
          return;
        }

        const category = evaluation.account_type === 'real' ? 'Real' : 'Demo';
        const caption = this.buildPreAnnouncementCaption(evaluation, session.challenge, category);

        // Truncate caption if too long (Telegram limit: 1024 chars)
        const finalCaption = caption.length > 1024 ? caption.substring(0, 1020) + '...' : caption;

        try {
          await (ctx as any).telegram.sendDocument(
            evaluation.telegram_id,
            evaluation.file_id,
            {
              caption: finalCaption,
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.url('📊 Show Detail Report', 'https://t.me/' + botInfo.username + '?start=eval_report_' + evaluation.id)],
              ]),
            }
          );
          await ctx.reply('✅ Evaluation sent to @' + (evaluation.username || 'unknown') + ' (TG: ' + evaluation.telegram_id + ')');
        } catch (err: any) {
          await ctx.reply('❌ Failed to send: ' + (err.description || err.message || 'Unknown error'));
        }
      } catch (error) {
        console.error('Error in sendeval search:', error);
        await ctx.reply('❌ Error searching.');
      }
    }

    if (session.step === 'asksubmission_search') {
      this.evalSessions.delete(ctx.from!.id);
      try {
        const { db } = require('../database/db');
        const term = text.replace(/^@/, '').trim();
        const result = await db.query(
          `SELECT * FROM trading_registrations
           WHERE challenge_id = $1 AND (
             username ILIKE $2 OR
             email ILIKE $2 OR
             account_number = $3 OR
             telegram_id::text = $3
           ) LIMIT 5`,
          [session.challengeId, '%' + term + '%', term]
        );

        if (result.rows.length === 0) {
          await ctx.reply('❌ No registered user found for "' + text + '"');
          return;
        }

        if (result.rows.length > 1) {
          let msg = '⚠️ Multiple users found. Be more specific:\n\n';
          result.rows.forEach((r: any, i: number) => {
            msg += (i + 1) + '. @' + (r.username || 'unknown') + ' | ' + r.account_number + ' (' + r.account_type + ')\n';
          });
          await ctx.reply(msg);
          return;
        }

        const user = result.rows[0];
        const botInfo = await (ctx as any).telegram.getMe();

        try {
          await (ctx as any).telegram.sendMessage(
            user.telegram_id,
            '📋 <b>Submit Your Results — ' + session.challenge.title + '</b>\n\n' +
            'Please submit your challenge results using the button below.\n\n' +
            'You will need:\n' +
            '• Your registered email\n' +
            '• Your final account balance\n' +
            '• Your investor (read-only) password\n' +
            '• A screenshot of your balance\n\n' +
            '<i>Make sure all details are correct before submitting.</i>',
            {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.url('📋 Submit Results', 'https://t.me/' + botInfo.username + '?start=tc_submit_' + session.challengeId)],
              ]),
            }
          );
          await ctx.reply('✅ Submission request sent to @' + (user.username || 'unknown') + ' (TG: ' + user.telegram_id + ')');
        } catch (err) {
          await ctx.reply('❌ Could not send message to user. They may have blocked the bot.');
        }
      } catch (error) {
        console.error('Error in asksubmission search:', error);
        await ctx.reply('❌ Error searching.');
      }
    }

    if (session.step === 'obo_dq_reason') {
      const reason = text.trim();
      if (!reason) {
        await ctx.reply('❌ Please enter a reason for disqualification.');
        return;
      }
      (session as any).dqReason = reason;
      session.step = 'obo_dq_confirm';

      await ctx.reply(
        '🚫 <b>Disqualify this user?</b>\n\n' +
        '👤 @' + ((session as any).dqUsername || 'unknown') + '\n' +
        '📛 Reason: ' + reason + '\n\n' +
        '<b>This will remove their submission and notify them.</b>',
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Yes, Disqualify', 'eval_obo_dq_confirm')],
            [Markup.button.callback('❌ Cancel', 'eval_obo_dq_cancel')],
          ]),
        }
      );
    }
  }

  // ── /evaluationstatus ──

  async evaluationstatus(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) {
        await ctx.reply('❌ You are not authorized.');
        return;
      }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) {
        const all = await tradingChallengeService.getAllChallenges();
        challenge = all[0] || null;
      }
      if (!challenge) {
        await ctx.reply('❌ No challenge found.');
        return;
      }

      const status = await evaluationService.getEvaluationStatus(challenge.id);
      const unevaluated = await evaluationService.getUnevaluatedSubmissions(challenge.id);

      let text = `📊 <b>Evaluation Progress — ${challenge.title}</b>\n\n`;
      text += `📝 <b>Submissions:</b>\n`;
      text += `  Total: ${status.total_submissions}\n`;
      text += `  Real: ${status.real_submissions} | Demo: ${status.demo_submissions}\n\n`;
      text += `✅ <b>Evaluated:</b>\n`;
      text += `  Total: ${status.evaluated} / ${status.total_submissions}\n`;
      text += `  Real: ${status.real_evaluated} / ${status.real_submissions}\n`;
      text += `  Demo: ${status.demo_evaluated} / ${status.demo_submissions}\n\n`;
      text += `🏆 Qualified: ${status.qualified}\n`;
      text += `🚫 Disqualified: ${status.disqualified}\n`;
      text += `⏳ Remaining: ${status.total_submissions - status.evaluated}\n`;

      if (unevaluated.length > 0) {
        text += `\n📋 <b>Top Unevaluated (by reported balance):</b>\n`;
        const top = unevaluated.slice(0, 10);
        top.forEach((s, i) => {
          const username = s.username ? `@${s.username}` : `ID:${s.telegram_id}`;
          text += `  ${i + 1}. ${s.account_number} (${s.account_type}) — ${s.final_balance} — ${username}\n`;
        });
        if (unevaluated.length > 10) {
          text += `  ... and ${unevaluated.length - 10} more\n`;
        }
      }

      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error in evaluationstatus:', error);
      await ctx.reply('❌ Error fetching evaluation status.');
    }
  }

  // ── /evaluationsummary ──

  async evaluationsummary(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) {
        await ctx.reply('❌ You are not authorized.');
        return;
      }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) {
        const all = await tradingChallengeService.getAllChallenges();
        challenge = all[0] || null;
      }
      if (!challenge) {
        await ctx.reply('❌ No challenge found.');
        return;
      }

      const evaluations = await evaluationService.getAllEvaluations(challenge.id);

      if (evaluations.length === 0) {
        await ctx.reply('📊 No evaluations yet for this challenge.');
        return;
      }

      const qualified = evaluations.filter(e => e.is_qualified);
      const disqualified = evaluations.filter(e => e.is_disqualified);
      const realEvals = evaluations.filter(e => e.account_type === 'real');
      const demoEvals = evaluations.filter(e => e.account_type === 'demo');
      const realQualified = qualified.filter(e => e.account_type === 'real');
      const demoQualified = qualified.filter(e => e.account_type === 'demo');

      let text = `📊 <b>Evaluation Summary — ${challenge.title}</b>\n\n`;
      text += `📈 <b>Overview:</b>\n`;
      text += `  Total Evaluated: ${evaluations.length}\n`;
      text += `  Qualified: ${qualified.length} | Disqualified: ${disqualified.length}\n`;
      text += `  Real: ${realEvals.length} (${realQualified.length} qualified)\n`;
      text += `  Demo: ${demoEvals.length} (${demoQualified.length} qualified)\n`;

      // Top 10 real
      if (realQualified.length > 0) {
        text += `\n🏆 <b>Top 10 Real (by adjusted balance):</b>\n`;
        realQualified.slice(0, 10).forEach((e, i) => {
          const username = e.username ? `@${e.username}` : `ID:${e.telegram_id}`;
          text += `  ${i + 1}. ${e.account_number} — ${Number(e.adjusted_balance).toFixed(2)} — ${username}\n`;
        });
      }

      // Top 10 demo
      if (demoQualified.length > 0) {
        text += `\n🏆 <b>Top 10 Demo (by adjusted balance):</b>\n`;
        demoQualified.slice(0, 10).forEach((e, i) => {
          const username = e.username ? `@${e.username}` : `ID:${e.telegram_id}`;
          text += `  ${i + 1}. ${e.account_number} — ${Number(e.adjusted_balance).toFixed(2)} — ${username}\n`;
        });
      }

      // Common violations among evaluated accounts
      const violationCounts: Record<string, number> = {};
      const samePairSymbols: Record<string, number> = {};

      evaluations.forEach(e => {
        if (e.flagged_details && Array.isArray(e.flagged_details)) {
          e.flagged_details.forEach((f: any) => {
            if (f.reasons) {
              f.reasons.forEach((r: string) => {
                let key = r;
                key = key.replace(/SL too wide: \$[\d.]+/, 'SL too wide');
                key = key.replace(/Lot size [\d.]+ > [\d.]+/, 'Lot size exceeded');
                key = key.replace(/Held [\d.]+h > (\d+)h/, 'Held > $1h');
                if (key.includes('Profit after daily')) {
                  key = 'Daily drawdown breach';
                }
                // Track same pair symbols separately
                const pairMatch = key.match(/Same pair 3\+ open \((.+)\)/);
                if (pairMatch) {
                  const sym = pairMatch[1];
                  samePairSymbols[sym] = (samePairSymbols[sym] || 0) + 1;
                  key = 'Same pair 3+ open';
                }
                violationCounts[key] = (violationCounts[key] || 0) + 1;
              });
            }
          });
        }
      });

      // Count active days from full_report text
      let totalActiveD = 0;
      let acctCount = 0;
      evaluations.forEach(e => {
        acctCount++;
        const report = e.full_report || '';
        const adMatch = report.match(/Active Days\s+(\d+)/);
        if (adMatch) totalActiveD += parseInt(adMatch[1]);
      });
      const avgActiveDays = acctCount > 0 ? (totalActiveD / acctCount).toFixed(1) : '0';

      const sortedViolations = Object.entries(violationCounts).sort((a, b) => b[1] - a[1]);
      if (sortedViolations.length > 0 || acctCount > 0) {
        text += '\n⚠️ <b>Common Violations Among Evaluated Accounts:</b>\n';
        sortedViolations.slice(0, 10).forEach(([reason, count]) => {
          text += '  • ' + reason + ': ' + count + ' trades\n';
          // Show same pair breakdown right below
          if (reason === 'Same pair 3+ open') {
            const sortedPairs = Object.entries(samePairSymbols).sort((a, b) => b[1] - a[1]);
            sortedPairs.forEach(([sym, cnt]) => {
              text += '     ↳ ' + sym + ': ' + cnt + ' trades\n';
            });
          }
        });
        text += '\n  📅 Average Active Trading Days: <b>' + avgActiveDays + '/10</b>\n';
      }

      const parts = this.splitMessage(text);
      for (const part of parts) {
        await ctx.reply(part, { parse_mode: 'HTML' });
      }
    } catch (error) {
      console.error('Error in evaluationsummary:', error);
      await ctx.reply('❌ Error fetching evaluation summary.');
    }
  }

  // ── /announcewinner ──

  async announcewinner(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) {
        await ctx.reply('❌ You are not authorized.');
        return;
      }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) {
        const all = await tradingChallengeService.getAllChallenges();
        challenge = all[0] || null;
      }
      if (!challenge) {
        await ctx.reply('❌ No challenge found.');
        return;
      }

      const realCount = challenge.real_winners_count || 0;
      const demoCount = challenge.demo_winners_count || 0;

      const realWinners = realCount > 0
        ? await evaluationService.getTopWinners(challenge.id, 'real', realCount)
        : [];
      const demoWinners = demoCount > 0
        ? await evaluationService.getTopWinners(challenge.id, 'demo', demoCount)
        : [];

      if (realWinners.length === 0 && demoWinners.length === 0) {
        await ctx.reply('❌ No qualified winners found for this challenge.');
        return;
      }

      const announcement = this.generateWinnerAnnouncement(challenge, realWinners, demoWinners);

      // Show preview to admin
      await ctx.reply(`📋 <b>Winner Announcement Preview:</b>\n\n${announcement}`, { parse_mode: 'HTML' });
      await ctx.reply(
        'Post this announcement to channels?',
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Confirm & Post', `eval_announce_confirm_${challenge.id}`)],
          [Markup.button.callback('❌ Cancel', 'eval_announce_cancel')],
        ])
      );
    } catch (error) {
      console.error('Error in announcewinner:', error);
      await ctx.reply('❌ Error generating winner announcement.');
    }
  }

  async handleAnnounceConfirm(ctx: Context, challengeId: number): Promise<void> {
    try {
      const challenge = await tradingChallengeService.getChallengeById(challengeId);
      if (!challenge) {
        await ctx.reply('❌ Challenge not found.');
        return;
      }

      const realCount = challenge.real_winners_count || 0;
      const demoCount = challenge.demo_winners_count || 0;

      const realWinners = realCount > 0
        ? await evaluationService.getTopWinners(challenge.id, 'real', realCount)
        : [];
      const demoWinners = demoCount > 0
        ? await evaluationService.getTopWinners(challenge.id, 'demo', demoCount)
        : [];

      const announcement = this.generateWinnerAnnouncement(challenge, realWinners, demoWinners);

      // Post to challenge channel
      try {
        await (ctx as any).telegram.sendMessage(
          config.challengeChannelId,
          announcement + '\n\n📋 Detailed evaluation reports will be posted below.',
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error('Error posting to challenge channel:', err);
      }

      // Post to main channel
      try {
        await (ctx as any).telegram.sendMessage(
          config.mainChannelId,
          announcement + `\n\n📋 Detailed reports available on ${config.challengeChannelId}`,
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error('Error posting to main channel:', err);
      }

      await ctx.reply('✅ Winner announcement posted to both channels!');
    } catch (error) {
      console.error('Error in handleAnnounceConfirm:', error);
      await ctx.reply('❌ Error posting announcement.');
    }
  }

  // ── /postresultdetail ──

  async postresultdetail(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) {
        await ctx.reply('❌ You are not authorized.');
        return;
      }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) {
        const all = await tradingChallengeService.getAllChallenges();
        challenge = all[0] || null;
      }
      if (!challenge) {
        await ctx.reply('❌ No challenge found.');
        return;
      }

      const realCount = challenge.real_winners_count || 0;
      const demoCount = challenge.demo_winners_count || 0;

      const realWinners = realCount > 0
        ? await evaluationService.getTopWinners(challenge.id, 'real', realCount)
        : [];
      const demoWinners = demoCount > 0
        ? await evaluationService.getTopWinners(challenge.id, 'demo', demoCount)
        : [];

      const allWinners = [...realWinners, ...demoWinners];

      if (allWinners.length === 0) {
        await ctx.reply('❌ No winners to post details for.');
        return;
      }

      // Parse prizes
      const realPrizes = typeof challenge.real_prizes === 'string' ? JSON.parse(challenge.real_prizes) : (challenge.real_prizes || []);
      const demoPrizes = typeof challenge.demo_prizes === 'string' ? JSON.parse(challenge.demo_prizes) : (challenge.demo_prizes || []);

      let posted = 0;
      const botInfo = await (ctx as any).telegram.getMe();
      for (const winner of allWinners) {
        try {
          const realIdx = realWinners.findIndex(w => w.id === winner.id);
          const demoIdx = demoWinners.findIndex(w => w.id === winner.id);
          const rank = realIdx >= 0 ? realIdx + 1 : demoIdx + 1;
          const category = realIdx >= 0 ? 'Real' : 'Demo';
          const prize = realIdx >= 0 ? (realPrizes[realIdx] ? String(realPrizes[realIdx]) : '') : (demoPrizes[demoIdx] ? '$' + String(demoPrizes[demoIdx]) : '');

          await (ctx as any).telegram.sendDocument(
            config.challengeChannelId,
            winner.file_id,
            {
              caption: this.buildWinnerCaption(winner, rank, category, prize),
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.url('📊 Show Detail Report', `https://t.me/${botInfo.username}?start=eval_report_${winner.id}`)],
              ]),
            }
          );
          posted++;
        } catch (err) {
          console.error(`Error posting detail for eval ${winner.id}:`, err);
        }
      }

      await ctx.reply(`✅ Posted ${posted}/${allWinners.length} winner detail reports to challenge channel.`);
    } catch (error) {
      console.error('Error in postresultdetail:', error);
      await ctx.reply('❌ Error posting result details.');
    }
  }

  // ── /dmqualifiers ──

  async dmqualifiers(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) {
        await ctx.reply('❌ You are not authorized.');
        return;
      }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) {
        const all = await tradingChallengeService.getAllChallenges();
        challenge = all[0] || null;
      }
      if (!challenge) {
        await ctx.reply('❌ No challenge found.');
        return;
      }

      const evaluations = await evaluationService.getAllEvaluations(challenge.id);
      if (evaluations.length === 0) {
        await ctx.reply('❌ No evaluations found.');
        return;
      }

      // Determine winners
      const realCount = challenge.real_winners_count || 0;
      const demoCount = challenge.demo_winners_count || 0;
      const realWinners = realCount > 0
        ? await evaluationService.getTopWinners(challenge.id, 'real', realCount)
        : [];
      const demoWinners = demoCount > 0
        ? await evaluationService.getTopWinners(challenge.id, 'demo', demoCount)
        : [];

      const winnerIds = new Set([
        ...realWinners.map(w => w.id),
        ...demoWinners.map(w => w.id),
      ]);

      // Get prizes
      const realPrizes = typeof challenge.real_prizes === 'string' ? JSON.parse(challenge.real_prizes) : (challenge.real_prizes || []);
      const demoPrizes = typeof challenge.demo_prizes === 'string' ? JSON.parse(challenge.demo_prizes) : (challenge.demo_prizes || []);

      // Build ranked lists per category
      const realQualified = evaluations.filter(e => e.is_qualified && e.account_type === 'real').sort((a, b) => Number(b.adjusted_balance) - Number(a.adjusted_balance));
      const demoQualified = evaluations.filter(e => e.is_qualified && e.account_type === 'demo').sort((a, b) => Number(b.adjusted_balance) - Number(a.adjusted_balance));

      await ctx.reply(`⏳ Sending DMs to ${evaluations.length} evaluated users...`);

      const botInfo = await (ctx as any).telegram.getMe();
      let sent = 0;
      let failed = 0;

      for (const evaluation of evaluations) {
        if (!evaluation.telegram_id || evaluation.telegram_id === 0) {
          failed++;
          continue;
        }

        try {
          const isWinner = winnerIds.has(evaluation.id);
          const realIdx = realQualified.findIndex(e => e.id === evaluation.id);
          const demoIdx = demoQualified.findIndex(e => e.id === evaluation.id);
          const rank = realIdx >= 0 ? realIdx + 1 : (demoIdx >= 0 ? demoIdx + 1 : 0);
          const category = evaluation.account_type === 'real' ? 'Real' : 'Demo';

          let prize = '';
          if (isWinner) {
            const rIdx = realWinners.findIndex(w => w.id === evaluation.id);
            const dIdx = demoWinners.findIndex(w => w.id === evaluation.id);
            if (rIdx >= 0 && realPrizes[rIdx]) prize = String(realPrizes[rIdx]);
            else if (dIdx >= 0 && demoPrizes[dIdx]) prize = '$' + String(demoPrizes[dIdx]);
          }

          const message = this.buildDmCaption(evaluation, challenge, rank, category, isWinner, prize);

          // Send message with file and detail button
          await (ctx as any).telegram.sendDocument(
            evaluation.telegram_id,
            evaluation.file_id,
            {
              caption: message,
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.url('📊 Show Detail Report', `https://t.me/${botInfo.username}?start=eval_report_${evaluation.id}`)],
              ]),
            }
          );

          sent++;

          // 2 second delay between messages
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Report progress every 10 messages
          if (sent % 10 === 0) {
            await ctx.reply(`⏳ Progress: ${sent}/${evaluations.length} sent...`);
          }
        } catch (err) {
          console.error(`Error DMing user ${evaluation.telegram_id}:`, err);
          failed++;
        }
      }

      await ctx.reply(
        `✅ <b>DM Results:</b>\n` +
        `  Sent: ${sent}\n` +
        `  Failed: ${failed}\n` +
        `  Total: ${evaluations.length}`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error('Error in dmqualifiers:', error);
      await ctx.reply('❌ Error sending DMs.');
    }
  }

  // ── /cleartest ──

  async cleartest(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) {
        await ctx.reply('❌ You are not authorized.');
        return;
      }

      const deleted = await evaluationService.clearTestData();
      await ctx.reply(`🗑️ Cleared ${deleted} test evaluation records.`);
    } catch (error) {
      console.error('Error in cleartest:', error);
      await ctx.reply('❌ Error clearing test data.');
    }
  }

  // ── /preannouncementnotice ──

  async preannouncementnotice(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) {
        await ctx.reply('❌ You are not authorized.');
        return;
      }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) {
        const all = await tradingChallengeService.getAllChallenges();
        challenge = all[0] || null;
      }
      if (!challenge) {
        await ctx.reply('❌ No challenge found.');
        return;
      }

      const evaluations = await evaluationService.getAllEvaluations(challenge.id);
      if (evaluations.length === 0) {
        await ctx.reply('❌ No evaluations found.');
        return;
      }

      await ctx.reply(
        '⏳ Sending pre-announcement notices to ' + evaluations.length + ' evaluated users...\n' +
        '<i>Users will have 48 hours to review and submit complaints.</i>',
        { parse_mode: 'HTML' }
      );

      const botInfo = await (ctx as any).telegram.getMe();
      let sent = 0;
      let failed = 0;

      const failedUsers: string[] = [];

      for (const evaluation of evaluations) {
        if (!evaluation.telegram_id || evaluation.telegram_id === 0) {
          failed++;
          failedUsers.push('@' + (evaluation.username || 'unknown') + ' (no TG ID)');
          continue;
        }

        try {
          const category = evaluation.account_type === 'real' ? 'Real' : 'Demo';
          const caption = this.buildPreAnnouncementCaption(evaluation, challenge, category);

          await (ctx as any).telegram.sendDocument(
            evaluation.telegram_id,
            evaluation.file_id,
            {
              caption: caption,
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.url('📊 Show Detail Report', 'https://t.me/' + botInfo.username + '?start=eval_report_' + evaluation.id)],
              ]),
            }
          );

          sent++;
          await new Promise(resolve => setTimeout(resolve, 2000));

          if (sent % 10 === 0) {
            await ctx.reply('⏳ Progress: ' + sent + '/' + evaluations.length + ' sent...');
          }
        } catch (err) {
          console.error('Error sending pre-announcement to ' + evaluation.telegram_id + ':', err);
          failed++;
          failedUsers.push('@' + (evaluation.username || 'unknown') + ' (TG: ' + evaluation.telegram_id + ')');
        }
      }

      let resultText = '✅ <b>Pre-Announcement Notice Results:</b>\n' +
        '  Sent: ' + sent + '\n' +
        '  Failed: ' + failed + '\n' +
        '  Total: ' + evaluations.length;

      if (failedUsers.length > 0) {
        resultText += '\n\n❌ <b>Failed Users:</b>\n';
        failedUsers.forEach(u => { resultText += '  • ' + u + '\n'; });
      }

      await ctx.reply(resultText, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error in preannouncementnotice:', error);
      await ctx.reply('❌ Error sending pre-announcement notices.');
    }
  }

  // ── /showwinner ──

  async showwinner(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) { await ctx.reply('❌ Not authorized.'); return; }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) { const all = await tradingChallengeService.getAllChallenges(); challenge = all[0] || null; }
      if (!challenge) { await ctx.reply('❌ No challenge found.'); return; }

      const realCount = challenge.real_winners_count || 0;
      const demoCount = challenge.demo_winners_count || 0;
      const realWinners = realCount > 0 ? await evaluationService.getTopWinners(challenge.id, 'real', realCount) : [];
      const demoWinners = demoCount > 0 ? await evaluationService.getTopWinners(challenge.id, 'demo', demoCount) : [];

      if (realWinners.length === 0 && demoWinners.length === 0) { await ctx.reply('❌ No qualified winners found.'); return; }

      const realPrizes = typeof challenge.real_prizes === 'string' ? JSON.parse(challenge.real_prizes) : (challenge.real_prizes || []);
      const demoPrizes = typeof challenge.demo_prizes === 'string' ? JSON.parse(challenge.demo_prizes) : (challenge.demo_prizes || []);
      const botInfo = await (ctx as any).telegram.getMe();
      const adminId = ctx.from!.id;

      if (realWinners.length > 0) {
        await ctx.telegram.sendMessage(adminId, '📱 <b>REAL ACCOUNT WINNERS</b>', { parse_mode: 'HTML' });
        for (const winner of realWinners) {
          const idx = realWinners.indexOf(winner);
          const prize = realPrizes[idx] ? String(realPrizes[idx]) : '';
          await ctx.telegram.sendDocument(adminId, winner.file_id, {
            caption: this.buildWinnerCaption(winner, idx + 1, 'Real', prize),
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.url('📊 Show Detail Report', 'https://t.me/' + botInfo.username + '?start=eval_report_' + winner.id)]]),
          });
        }
      }

      if (demoWinners.length > 0) {
        await ctx.telegram.sendMessage(adminId, '🎮 <b>DEMO ACCOUNT WINNERS</b>', { parse_mode: 'HTML' });
        for (const winner of demoWinners) {
          const idx = demoWinners.indexOf(winner);
          const prize = demoPrizes[idx] ? '$' + String(demoPrizes[idx]) : '';
          await ctx.telegram.sendDocument(adminId, winner.file_id, {
            caption: this.buildWinnerCaption(winner, idx + 1, 'Demo', prize),
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.url('📊 Show Detail Report', 'https://t.me/' + botInfo.username + '?start=eval_report_' + winner.id)]]),
          });
        }
      }

      await ctx.reply('✅ Showing ' + (realWinners.length + demoWinners.length) + ' winners.');
    } catch (error) {
      console.error('Error in showwinner:', error);
      await ctx.reply('❌ Error showing winners.');
    }
  }

  // ── /exportrank ──

  async exportrank(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) { await ctx.reply('❌ Not authorized.'); return; }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) { const all = await tradingChallengeService.getAllChallenges(); challenge = all[0] || null; }
      if (!challenge) { await ctx.reply('❌ No challenge found.'); return; }

      const header = 'Rank,Username,Email,Telegram ID,Account Number,Account Type,Reported Balance,Adjusted Balance,Profit Removed,Total Trades,Flagged Trades,Qualified,Disqualified,Disqualify Reason\n';

      const toRow = (e: any, rank: number) => {
        return rank + ',' +
          '@' + (e.username || 'unknown') + ',' +
          (e.email || '') + ',' +
          e.telegram_id + ',' +
          e.account_number + ',' +
          e.account_type + ',' +
          Number(e.reported_balance).toFixed(2) + ',' +
          Number(e.adjusted_balance).toFixed(2) + ',' +
          Number(e.profit_removed).toFixed(2) + ',' +
          e.total_trades + ',' +
          e.flagged_count + ',' +
          (e.is_qualified ? 'Yes' : 'No') + ',' +
          (e.is_disqualified ? 'Yes' : 'No') + ',' +
          '"' + (e.disqualify_reason || '') + '"\n';
      };

      const realEvals = await evaluationService.getRankedEvaluations(challenge.id, 'real');
      const demoEvals = await evaluationService.getRankedEvaluations(challenge.id, 'demo');

      const prefix = challenge.title.replace(/\s+/g, '_');

      if (realEvals.length > 0) {
        const csv = header + realEvals.map((e, i) => toRow(e, i + 1)).join('');
        await (ctx as any).telegram.sendDocument(ctx.from!.id, {
          source: Buffer.from(csv),
          filename: prefix + '_Real_Rankings.csv',
        }, { caption: '📱 Real Account Rankings — ' + realEvals.length + ' evaluations' });
      }

      if (demoEvals.length > 0) {
        const csv = header + demoEvals.map((e, i) => toRow(e, i + 1)).join('');
        await (ctx as any).telegram.sendDocument(ctx.from!.id, {
          source: Buffer.from(csv),
          filename: prefix + '_Demo_Rankings.csv',
        }, { caption: '🎮 Demo Account Rankings — ' + demoEvals.length + ' evaluations' });
      }

      if (realEvals.length === 0 && demoEvals.length === 0) {
        await ctx.reply('❌ No evaluations found.');
      } else {
        await ctx.reply('✅ Exported ' + realEvals.length + ' real + ' + demoEvals.length + ' demo evaluations.');
      }
    } catch (error) {
      console.error('Error in exportrank:', error);
      await ctx.reply('❌ Error exporting rankings.');
    }
  }

  // ── /findevaluation ──

  async findevaluation(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) { await ctx.reply('❌ Not authorized.'); return; }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) { const all = await tradingChallengeService.getAllChallenges(); challenge = all[0] || null; }
      if (!challenge) { await ctx.reply('❌ No challenge found.'); return; }

      this.evalSessions.set(ctx.from!.id, {
        step: 'find_eval_search',
        challengeId: challenge.id,
        challenge,
        isTest: false,
        isReevaluate: false,
      });

      await ctx.reply('🔍 Enter username, Telegram ID, email, or account number to search:', { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error in findevaluation:', error);
      await ctx.reply('❌ Error starting search.');
    }
  }

  // ── /sendeval ──

  async sendeval(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) { await ctx.reply('❌ Not authorized.'); return; }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) { const all = await tradingChallengeService.getAllChallenges(); challenge = all[0] || null; }
      if (!challenge) { await ctx.reply('❌ No challenge found.'); return; }

      this.evalSessions.set(ctx.from!.id, {
        step: 'sendeval_search',
        challengeId: challenge.id,
        challenge,
        isTest: false,
        isReevaluate: false,
      });

      await ctx.reply('📨 Enter username, Telegram ID, email, or account number to send their evaluation:', { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error in sendeval:', error);
      await ctx.reply('❌ Error starting send evaluation.');
    }
  }

  // ── /asksubmission ──

  async asksubmission(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) { await ctx.reply('❌ Not authorized.'); return; }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) { const all = await tradingChallengeService.getAllChallenges(); challenge = all[0] || null; }
      if (!challenge) { await ctx.reply('❌ No challenge found.'); return; }

      this.evalSessions.set(ctx.from!.id, {
        step: 'asksubmission_search',
        challengeId: challenge.id,
        challenge,
        isTest: false,
        isReevaluate: false,
      });

      await ctx.reply('📋 Enter username, Telegram ID, email, or account number to send submission request:', { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error in asksubmission:', error);
      await ctx.reply('❌ Error starting ask submission.');
    }
  }

  // ── /deleteevaluation ──

  async deleteevaluation(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) { await ctx.reply('❌ Not authorized.'); return; }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) { const all = await tradingChallengeService.getAllChallenges(); challenge = all[0] || null; }
      if (!challenge) { await ctx.reply('❌ No challenge found.'); return; }

      this.evalSessions.set(ctx.from!.id, {
        step: 'delete_eval_search',
        challengeId: challenge.id,
        challenge,
        isTest: false,
        isReevaluate: false,
      });

      await ctx.reply('🗑️ Enter username, Telegram ID, email, or account number to find and delete:', { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error in deleteevaluation:', error);
      await ctx.reply('❌ Error starting delete search.');
    }
  }

  // ── /missingevaluation ──

  async missingevaluation(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) { await ctx.reply('❌ Not authorized.'); return; }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) { const all = await tradingChallengeService.getAllChallenges(); challenge = all[0] || null; }
      if (!challenge) { await ctx.reply('❌ No challenge found.'); return; }

      const unevaluated = await evaluationService.getUnevaluatedSubmissions(challenge.id);

      if (unevaluated.length === 0) {
        await ctx.reply('✅ All submissions have been evaluated!');
        return;
      }

      await ctx.reply('⚠️ <b>' + unevaluated.length + ' submissions not yet evaluated</b>', { parse_mode: 'HTML' });

      const header = 'No,Username,Email,Telegram ID,Account Number,Account Type,Reported Balance,Submitted At\n';
      const rows = unevaluated.map((s: any, i: number) => {
        return (i + 1) + ',' +
          '@' + (s.username || 'unknown') + ',' +
          (s.email || '') + ',' +
          s.telegram_id + ',' +
          s.account_number + ',' +
          s.account_type + ',' +
          Number(s.final_balance).toFixed(2) + ',' +
          new Date(s.submitted_at).toISOString().slice(0, 19) + '\n';
      }).join('');

      const csv = header + rows;
      const prefix = challenge.title.replace(/\s+/g, '_');

      await (ctx as any).telegram.sendDocument(ctx.from!.id, {
        source: Buffer.from(csv),
        filename: prefix + '_Missing_Evaluations.csv',
      }, { caption: '📋 ' + unevaluated.length + ' submissions pending evaluation\nSorted by reported balance (highest first)' });
    } catch (error) {
      console.error('Error in missingevaluation:', error);
      await ctx.reply('❌ Error fetching missing evaluations.');
    }
  }

  // ── /askforresubmission ──

  async askforresubmission(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) { await ctx.reply('❌ Not authorized.'); return; }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) { const all = await tradingChallengeService.getAllChallenges(); challenge = all[0] || null; }
      if (!challenge) { await ctx.reply('❌ No challenge found.'); return; }

      this.evalSessions.set(ctx.from!.id, {
        step: 'resubmit_search',
        challengeId: challenge.id,
        challenge,
        isTest: false,
        isReevaluate: false,
      });

      await ctx.reply('🔍 Enter email, account number, or username to find the user:', { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error in askforresubmission:', error);
      await ctx.reply('❌ Error starting resubmission request.');
    }
  }

  // ── /pendingresubmissions ──

  async pendingresubmissions(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) { await ctx.reply('❌ Not authorized.'); return; }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) { const all = await tradingChallengeService.getAllChallenges(); challenge = all[0] || null; }
      if (!challenge) { await ctx.reply('❌ No challenge found.'); return; }

      const pending = await evaluationService.getPendingResubmissions(challenge.id);

      if (pending.length === 0) {
        await ctx.reply('✅ No pending resubmissions. All users have responded.');
        return;
      }

      await ctx.reply(
        '⏳ <b>Pending Resubmissions: ' + pending.length + ' users</b>\n\n' +
        '<i>These users were asked to resubmit but haven\'t yet.</i>',
        { parse_mode: 'HTML' }
      );

      for (const sub of pending) {
        await ctx.reply(
          '👤 @' + (sub.username || 'unknown') + '\n' +
          '🆔 TG: ' + sub.telegram_id + '\n' +
          '📧 ' + (sub.email || 'N/A') + '\n' +
          '🏦 Account: ' + sub.account_number + ' (' + sub.account_type + ')\n' +
          '💰 Reported: $' + Number(sub.final_balance).toFixed(2),
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('⚠️ Send Final Warning', 'eval_final_warn_' + sub.id + '_' + sub.telegram_id)],
            ]),
          }
        );
      }

      if (pending.length > 1) {
        await ctx.reply(
          'Send final warning to all ' + pending.length + ' users at once?',
          Markup.inlineKeyboard([
            [Markup.button.callback('⚠️ Send Final Warning to All (' + pending.length + ')', 'eval_final_warn_all_' + challenge.id)],
          ])
        );
      }
    } catch (error) {
      console.error('Error in pendingresubmissions:', error);
      await ctx.reply('❌ Error fetching pending resubmissions.');
    }
  }

  // ── /updateusernames ──

  async updateusernames(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) { await ctx.reply('❌ Not authorized.'); return; }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) { const all = await tradingChallengeService.getAllChallenges(); challenge = all[0] || null; }
      if (!challenge) { await ctx.reply('❌ No challenge found.'); return; }

      await ctx.reply('⏳ Updating usernames from Telegram... This may take a while.');

      const { db } = require('../database/db');
      const regs = await db.query(
        'SELECT DISTINCT telegram_id, username FROM trading_registrations WHERE challenge_id = $1 AND telegram_id > 0',
        [challenge.id]
      );

      let updated = 0;
      let failed = 0;
      let unchanged = 0;

      for (const reg of regs.rows) {
        try {
          const chat = await (ctx as any).telegram.getChat(reg.telegram_id);
          const newUsername = chat.username || null;
          const oldUsername = reg.username || null;

          if (newUsername !== oldUsername) {
            // Update in registrations
            await db.query(
              'UPDATE trading_registrations SET username = $1 WHERE challenge_id = $2 AND telegram_id = $3',
              [newUsername, challenge.id, reg.telegram_id]
            );
            // Update in evaluations
            await db.query(
              'UPDATE trading_evaluations SET username = $1 WHERE challenge_id = $2 AND telegram_id = $3',
              [newUsername, challenge.id, reg.telegram_id]
            );
            updated++;
          } else {
            unchanged++;
          }

          // Rate limit: 100ms between API calls
          await new Promise(r => setTimeout(r, 100));

          if ((updated + unchanged + failed) % 50 === 0) {
            await ctx.reply('⏳ Progress: ' + (updated + unchanged + failed) + '/' + regs.rows.length + ' checked...');
          }
        } catch (e) {
          failed++;
          // User may have blocked bot or deleted account
        }
      }

      await ctx.reply(
        '✅ <b>Username Update Complete</b>\n\n' +
        '👥 Total checked: ' + regs.rows.length + '\n' +
        '🔄 Updated: ' + updated + '\n' +
        '✅ Unchanged: ' + unchanged + '\n' +
        '❌ Failed (blocked/deleted): ' + failed,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error('Error in updateusernames:', error);
      await ctx.reply('❌ Error updating usernames.');
    }
  }

  // ── /updatesubmitternames ──

  async updatesubmitternames(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) { await ctx.reply('❌ Not authorized.'); return; }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) { const all = await tradingChallengeService.getAllChallenges(); challenge = all[0] || null; }
      if (!challenge) { await ctx.reply('❌ No challenge found.'); return; }

      await ctx.reply('⏳ Updating usernames for submitters only...');

      const { db } = require('../database/db');
      const subs = await db.query(
        `SELECT DISTINCT r.telegram_id, r.username
         FROM trading_submissions s
         JOIN trading_registrations r ON s.registration_id = r.id
         WHERE s.challenge_id = $1 AND r.telegram_id > 0`,
        [challenge.id]
      );

      let updated = 0;
      let failed = 0;
      let unchanged = 0;

      for (const reg of subs.rows) {
        try {
          const chat = await (ctx as any).telegram.getChat(reg.telegram_id);
          const newUsername = chat.username || null;
          const oldUsername = reg.username || null;

          if (newUsername !== oldUsername) {
            await db.query(
              'UPDATE trading_registrations SET username = $1 WHERE challenge_id = $2 AND telegram_id = $3',
              [newUsername, challenge.id, reg.telegram_id]
            );
            await db.query(
              'UPDATE trading_evaluations SET username = $1 WHERE challenge_id = $2 AND telegram_id = $3',
              [newUsername, challenge.id, reg.telegram_id]
            );
            updated++;
          } else {
            unchanged++;
          }
          await new Promise(r => setTimeout(r, 100));
        } catch (e) {
          failed++;
        }
      }

      await ctx.reply(
        '✅ <b>Submitter Username Update Complete</b>\n\n' +
        '👥 Total checked: ' + subs.rows.length + '\n' +
        '🔄 Updated: ' + updated + '\n' +
        '✅ Unchanged: ' + unchanged + '\n' +
        '❌ Failed: ' + failed,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error('Error in updatesubmitternames:', error);
      await ctx.reply('❌ Error updating usernames.');
    }
  }

  // ── /screenqualifiers ──

  async screenqualifiers(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) { await ctx.reply('❌ Not authorized.'); return; }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) { const all = await tradingChallengeService.getAllChallenges(); challenge = all[0] || null; }
      if (!challenge) { await ctx.reply('❌ No challenge found.'); return; }

      // Get all submissions with registration data
      const { db } = require('../database/db');
      const subs = await db.query(
        `SELECT s.id as sub_id, r.*, s.final_balance
         FROM trading_submissions s
         JOIN trading_registrations r ON s.registration_id = r.id
         WHERE s.challenge_id = $1`,
        [challenge.id]
      );

      if (subs.rows.length === 0) {
        await ctx.reply('❌ No submissions found.');
        return;
      }

      await ctx.reply('🔍 Screening ' + subs.rows.length + ' submitters for partnership status...\nThis may take a while.');

      let good = 0;
      let changing = 0;
      let left = 0;
      let missed = 0;
      const changingUsers: any[] = [];
      const leftUsers: any[] = [];

      for (let i = 0; i < subs.rows.length; i++) {
        const reg = subs.rows[i];
        try {
          let shortUid = reg.client_uid;

          if (!shortUid) {
            const alloc = await exnessService.checkAllocation(reg.email);
            if (alloc && alloc.client_uid) {
              shortUid = alloc.client_uid;
            } else {
              missed++;
              await new Promise(r => setTimeout(r, 1000));
              continue;
            }
          }

          const fullUuid = await exnessService.getFullUuid(shortUid);
          if (!fullUuid) { missed++; await new Promise(r => setTimeout(r, 1000)); continue; }

          const clientInfo = await exnessService.getKycStatus(fullUuid);
          if (!clientInfo) { missed++; await new Promise(r => setTimeout(r, 1000)); continue; }

          const status = clientInfo.client_status;

          if (status === 'CHANGING') {
            changing++;
            changingUsers.push(reg);
          } else if (status === 'LEFT') {
            const alloc = await exnessService.checkAllocation(reg.email);
            if (!alloc || !alloc.affiliation) {
              left++;
              leftUsers.push(reg);
            } else {
              good++;
            }
          } else {
            good++;
          }

          await new Promise(r => setTimeout(r, 1500));

          if ((i + 1) % 20 === 0) {
            await ctx.reply('⏳ Progress: ' + (i + 1) + '/' + subs.rows.length + ' screened...');
          }
        } catch (e) {
          missed++;
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      // Build report
      let report = '🔍 <b>Partnership Screening Report</b>\n';
      report += '<b>' + challenge.title + '</b>\n\n';
      report += '👥 Total Screened: ' + subs.rows.length + '\n';
      report += '✅ Good: ' + good + '\n';
      report += '⚠️ Changing: ' + changing + '\n';
      report += '❌ Left: ' + left + '\n';
      if (missed > 0) report += '❓ Missed (API error): ' + missed + '\n';

      if (changingUsers.length > 0) {
        report += '\n⚠️ <b>CHANGING (' + changingUsers.length + '):</b>\n';
        changingUsers.forEach((u, i) => {
          report += '  ' + (i + 1) + '. @' + (u.username || 'unknown') + ' — ' + u.email + ' (' + u.account_type + ')\n';
        });
      }

      if (leftUsers.length > 0) {
        report += '\n❌ <b>LEFT (' + leftUsers.length + '):</b>\n';
        leftUsers.forEach((u, i) => {
          report += '  ' + (i + 1) + '. @' + (u.username || 'unknown') + ' — ' + u.email + ' (' + u.account_type + ')\n';
        });
      }

      const parts = this.splitMessage(report);
      for (const part of parts) {
        await ctx.reply(part, { parse_mode: 'HTML' });
      }

      // Store results in memory for the buttons
      const changingIds = changingUsers.map(u => u.telegram_id).join(',');
      const leftIds = leftUsers.map(u => u.telegram_id).join(',');
      const leftSubIds = leftUsers.map(u => u.sub_id).join(',');

      const buttons = [];
      if (changingUsers.length > 0) {
        buttons.push([Markup.button.callback('⚠️ Warn Changers (' + changingUsers.length + ')', 'eval_screen_warn_' + challenge.id)]);
      }
      if (leftUsers.length > 0) {
        buttons.push([Markup.button.callback('🚫 Disqualify Left (' + leftUsers.length + ')', 'eval_screen_dq_' + challenge.id)]);
      }

      if (buttons.length > 0) {
        // Store the user lists in session for the callbacks
        this.evalSessions.set(ctx.from!.id, {
          step: 'screen_results',
          challengeId: challenge.id,
          challenge,
          isTest: false,
          isReevaluate: false,
        });
        (this.evalSessions.get(ctx.from!.id) as any).changingUsers = changingUsers;
        (this.evalSessions.get(ctx.from!.id) as any).leftUsers = leftUsers;

        await ctx.reply('Actions:', Markup.inlineKeyboard(buttons));
      }

      if (changingUsers.length === 0 && leftUsers.length === 0) {
        await ctx.reply('✅ All submitters have valid partnership status!');
      }
    } catch (error) {
      console.error('Error in screenqualifiers:', error);
      await ctx.reply('❌ Error screening qualifiers.');
    }
  }

  // ── /evaluateonebyone ──

  async evaluateonebyone(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) { await ctx.reply('❌ Not authorized.'); return; }

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) { const all = await tradingChallengeService.getAllChallenges(); challenge = all[0] || null; }
      if (!challenge) { await ctx.reply('❌ No challenge found.'); return; }

      await this.showNextUnevaluated(ctx, challenge);
    } catch (error) {
      console.error('Error in evaluateonebyone:', error);
      await ctx.reply('❌ Error starting one-by-one evaluation.');
    }
  }

  async showNextUnevaluated(ctx: Context, challenge: TradingChallenge): Promise<void> {
    const next = await evaluationService.getNextUnevaluated(challenge.id);

    if (!next) {
      await ctx.reply('✅ <b>All submissions have been evaluated!</b>\n\n<i>No more accounts to evaluate.</i>', { parse_mode: 'HTML' });
      this.evalSessions.delete(ctx.from!.id);
      return;
    }

    const { submission: sub, remainingReal, remainingDemo } = next;
    const total = remainingReal + remainingDemo;

    // Set session to awaiting file for this specific submission
    this.evalSessions.set(ctx.from!.id, {
      step: 'awaiting_file',
      challengeId: challenge.id,
      challenge,
      isTest: false,
      isReevaluate: false,
    });

    // Store the current submission ID for the resubmission button
    (this.evalSessions.get(ctx.from!.id) as any).currentSubmissionId = sub.id;
    (this.evalSessions.get(ctx.from!.id) as any).currentTelegramId = sub.telegram_id;
    (this.evalSessions.get(ctx.from!.id) as any).currentUsername = sub.username;

    const category = sub.account_type === 'real' ? '📱 Real' : '🎮 Demo';

    await ctx.reply(
      '📊 <b>One-by-One Evaluation</b>\n\n' +
      '⏳ <b>Remaining:</b> ' + total + ' accounts (' + remainingReal + ' real, ' + remainingDemo + ' demo)\n\n' +
      '━━━━━━━━━━━━━━━━━━━━\n' +
      category + ' Account\n\n' +
      '👤 Username: <b>@' + (sub.username || 'unknown') + '</b>\n' +
      '🆔 Telegram ID: ' + sub.telegram_id + '\n' +
      '📧 Email: ' + (sub.email || 'N/A') + '\n' +
      '🏦 Account: <b>' + sub.account_number + '</b>\n' +
      '🖥️ Server: ' + (sub.mt5_server || 'N/A') + '\n' +
      '🔑 Password: <code>' + (sub.investor_password || 'N/A') + '</code>\n' +
      '💰 Reported Balance: <b>$' + Number(sub.final_balance).toFixed(2) + '</b>\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      '📎 Upload the MT5 trade history file, or use the buttons below:',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Ask Resubmission', 'eval_obo_resubmit_' + sub.id + '_' + sub.telegram_id)],
          [Markup.button.callback('🚫 Disqualify', 'eval_obo_dq_' + sub.id + '_' + sub.telegram_id)],
          [Markup.button.callback('⏭️ Skip to Next', 'eval_obo_skip')],
        ]),
      }
    );
  }

  // ── /testannounce ──

  async testannounce(ctx: Context): Promise<void> {
    try {
      if (ctx.from!.id.toString() !== config.adminUserId) {
        await ctx.reply('❌ You are not authorized.');
        return;
      }

      const adminId = ctx.from!.id;

      const challenges = await tradingChallengeService.getActiveChallenges();
      let challenge = challenges[0] || null;
      if (!challenge) {
        const all = await tradingChallengeService.getAllChallenges();
        challenge = all[0] || null;
      }
      if (!challenge) {
        await ctx.reply('❌ No challenge found.');
        return;
      }

      const realCount = challenge.real_winners_count || 0;
      const demoCount = challenge.demo_winners_count || 0;

      // Read from test table
      const realWinners = realCount > 0
        ? await evaluationService.getTestTopWinners(challenge.id, 'real', realCount)
        : [];
      const demoWinners = demoCount > 0
        ? await evaluationService.getTestTopWinners(challenge.id, 'demo', demoCount)
        : [];

      if (realWinners.length === 0 && demoWinners.length === 0) {
        await ctx.reply('❌ No qualified test winners found.');
        return;
      }

      const botInfo = await ctx.telegram.getMe();
      const allTestEvals = await evaluationService.getAllTestEvaluations(challenge.id);

      // Parse prizes
      const realPrizes: string[] = typeof challenge.real_prizes === 'string' ? JSON.parse(challenge.real_prizes) : (challenge.real_prizes || []);
      const demoPrizes: string[] = typeof challenge.demo_prizes === 'string' ? JSON.parse(challenge.demo_prizes) : (challenge.demo_prizes || []);

      const allWinners = [...realWinners, ...demoWinners];
      const winnerIds = new Set(allWinners.map(w => w.id));

      const qualified = allTestEvals.filter(e => e.is_qualified && !winnerIds.has(e.id));
      const notQualified = allTestEvals.filter(e => !e.is_qualified && !e.is_disqualified);
      const disqualified = allTestEvals.filter(e => e.is_disqualified);

      // Build ranked lists per category
      const realQualified = allTestEvals.filter(e => e.is_qualified && e.account_type === 'real').sort((a, b) => Number(b.adjusted_balance) - Number(a.adjusted_balance));
      const demoQualified = allTestEvals.filter(e => e.is_qualified && e.account_type === 'demo').sort((a, b) => Number(b.adjusted_balance) - Number(a.adjusted_balance));

      // ── SECTION 1: Winner Announcement (both channels) ──
      await ctx.telegram.sendMessage(adminId, '📢 <b>CHANNEL POST — Winner Announcement (both channels)</b>', { parse_mode: 'HTML' });
      const announcement = this.generateWinnerAnnouncement(challenge, realWinners, demoWinners);
      await ctx.telegram.sendMessage(adminId, announcement, { parse_mode: 'HTML' });

      // ── SECTION 2: Challenge channel note ──
      await ctx.telegram.sendMessage(adminId, '📢 <b>CHALLENGE CHANNEL — Note below winners</b>', { parse_mode: 'HTML' });
      await ctx.telegram.sendMessage(adminId, '📊 The MT5 trading history and detailed evaluation report for each winner will be posted below.');

      // ── SECTION 3: Main channel note ──
      await ctx.telegram.sendMessage(adminId, '📢 <b>MAIN CHANNEL — Note below winners</b>', { parse_mode: 'HTML' });
      await ctx.telegram.sendMessage(adminId, '📊 The MT5 trading history and detailed evaluation report for each winner is posted on @Birrforex_Challenges');

      // ── SECTION 4: Result detail for each winner (channel post) ──
      for (const winner of allWinners) {
        const username = winner.username ? `@${winner.username}` : `ID:${winner.telegram_id}`;
        await ctx.telegram.sendMessage(adminId, `📎 <b>CHANNEL POST — Result Detail for ${username}</b>`, { parse_mode: 'HTML' });

        const realIdx = realWinners.findIndex(w => w.id === winner.id);
        const demoIdx = demoWinners.findIndex(w => w.id === winner.id);
        const rank = realIdx >= 0 ? realIdx + 1 : demoIdx + 1;
        const category = realIdx >= 0 ? 'Real' : 'Demo';
        const prize = realIdx >= 0 ? (realPrizes[realIdx] ? String(realPrizes[realIdx]) : '') : (demoPrizes[demoIdx] ? '$' + String(demoPrizes[demoIdx]) : '');

        await ctx.telegram.sendDocument(adminId, winner.file_id, {
          caption: this.buildWinnerCaption(winner, rank, category, prize),
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.url('📊 Show Detail Report', `https://t.me/${botInfo.username}?start=eval_test_report_${winner.id}`)],
          ]),
        });
      }

      // ── SECTION 5: DM for each winner ──
      for (const winner of allWinners) {
        const username = winner.username ? `@${winner.username}` : `ID:${winner.telegram_id}`;
        await ctx.telegram.sendMessage(adminId, `📨 <b>DM — Winner ${username}</b>`, { parse_mode: 'HTML' });

        // Determine prize and rank
        let prize = '';
        const realIdx = realWinners.findIndex(w => w.id === winner.id);
        const demoIdx = demoWinners.findIndex(w => w.id === winner.id);
        if (realIdx >= 0 && realPrizes[realIdx]) {
          prize = String(realPrizes[realIdx]);
        } else if (demoIdx >= 0 && demoPrizes[demoIdx]) {
          prize = '$' + String(demoPrizes[demoIdx]);
        }

        const rqIdx = realQualified.findIndex(e => e.id === winner.id);
        const dqIdx = demoQualified.findIndex(e => e.id === winner.id);
        const rank = rqIdx >= 0 ? rqIdx + 1 : (dqIdx >= 0 ? dqIdx + 1 : 0);
        const category = winner.account_type === 'real' ? 'Real' : 'Demo';

        await ctx.telegram.sendDocument(adminId, winner.file_id, {
          caption: this.buildDmCaption(winner, challenge, rank, category, true, prize),
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.url('📊 Show Detail Report', `https://t.me/${botInfo.username}?start=eval_test_report_${winner.id}`)],
          ]),
        });
      }

      // ── SECTION 6: DM for each qualified non-winner ──
      for (const evaluation of qualified) {
        const username = evaluation.username ? `@${evaluation.username}` : `ID:${evaluation.telegram_id}`;
        await ctx.telegram.sendMessage(adminId, `📨 <b>DM — Qualified ${username}</b>`, { parse_mode: 'HTML' });

        const rqIdx = realQualified.findIndex(e => e.id === evaluation.id);
        const dqIdx = demoQualified.findIndex(e => e.id === evaluation.id);
        const rank = rqIdx >= 0 ? rqIdx + 1 : (dqIdx >= 0 ? dqIdx + 1 : 0);
        const category = evaluation.account_type === 'real' ? 'Real' : 'Demo';

        await ctx.telegram.sendDocument(adminId, evaluation.file_id, {
          caption: this.buildDmCaption(evaluation, challenge, rank, category, false, ''),
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.url('📊 Show Detail Report', `https://t.me/${botInfo.username}?start=eval_test_report_${evaluation.id}`)],
          ]),
        });
      }

      // ── SECTION 7: DM for each not-qualified user ──
      for (const evaluation of notQualified) {
        const username = evaluation.username ? `@${evaluation.username}` : `ID:${evaluation.telegram_id}`;
        await ctx.telegram.sendMessage(adminId, `📨 <b>DM — Not Qualified ${username}</b>`, { parse_mode: 'HTML' });

        const category = evaluation.account_type === 'real' ? 'Real' : 'Demo';

        await ctx.telegram.sendDocument(adminId, evaluation.file_id, {
          caption: this.buildDmCaption(evaluation, challenge, 0, category, false, ''),
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.url('📊 Show Detail Report', `https://t.me/${botInfo.username}?start=eval_test_report_${evaluation.id}`)],
          ]),
        });
      }

      // ── SECTION 8: DM for each disqualified user ──
      for (const evaluation of disqualified) {
        const username = evaluation.username ? `@${evaluation.username}` : `ID:${evaluation.telegram_id}`;
        await ctx.telegram.sendMessage(adminId, `📨 <b>DM — Disqualified ${username}</b>`, { parse_mode: 'HTML' });

        const category = evaluation.account_type === 'real' ? 'Real' : 'Demo';

        await ctx.telegram.sendDocument(adminId, evaluation.file_id, {
          caption: this.buildDmCaption(evaluation, challenge, 0, category, false, ''),
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.url('📊 Show Detail Report', `https://t.me/${botInfo.username}?start=eval_test_report_${evaluation.id}`)],
          ]),
        });
      }

      // ── SECTION 9: Final summary ──
      await ctx.telegram.sendMessage(
        adminId,
        `🧪 Test complete. Nothing was posted to channels or sent to users.\n\n` +
        `📊 <b>Summary:</b>\n` +
        `  🏆 Winners: ${allWinners.length}\n` +
        `  ✅ Qualified: ${qualified.length}\n` +
        `  ❌ Not Qualified: ${notQualified.length}\n` +
        `  🚫 Disqualified: ${disqualified.length}`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error('Error in testannounce:', error);
      await ctx.reply('❌ Error generating test announcement.');
    }
  }

  // ── Handle eval_report deep link ──

  async handleEvalReportDeepLink(ctx: Context, evalId: number, isTest: boolean = false): Promise<void> {
    try {
      const evaluation = isTest
        ? await evaluationService.getTestEvaluationById(evalId)
        : await evaluationService.getEvaluationById(evalId);

      if (!evaluation) {
        await ctx.reply('❌ Evaluation report not found.');
        return;
      }

      const parts = this.splitMessage(evaluation.full_report);
      for (const part of parts) {
        await ctx.reply(part);
      }
    } catch (error) {
      console.error('Error in handleEvalReportDeepLink:', error);
      await ctx.reply('❌ Error loading evaluation report.');
    }
  }

  // ── Helper: split long messages ──

  private splitMessage(text: string, maxLen: number = 4000): string[] {
    if (text.length <= maxLen) return [text];

    const parts: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        parts.push(remaining);
        break;
      }

      // Find last newline before maxLen
      let splitIdx = remaining.lastIndexOf('\n', maxLen);
      if (splitIdx <= 0) {
        // No newline found, force split at maxLen
        splitIdx = maxLen;
      }

      parts.push(remaining.substring(0, splitIdx));
      remaining = remaining.substring(splitIdx).trimStart();
    }

    return parts;
  }

  // ── Helper: generate winner announcement ──

  private generateWinnerAnnouncement(
    challenge: TradingChallenge,
    realWinners: EvaluationRecord[],
    demoWinners: EvaluationRecord[]
  ): string {
    const realPrizes = typeof challenge.real_prizes === 'string' ? JSON.parse(challenge.real_prizes) : (challenge.real_prizes || []);
    const demoPrizes = typeof challenge.demo_prizes === 'string' ? JSON.parse(challenge.demo_prizes) : (challenge.demo_prizes || []);
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

    let text = '🏆 <b>' + challenge.title + ' — WINNERS</b> 🏆\n\n';
    text += 'Congratulations to our winners! 🎉\n\n';

    if (realWinners.length > 0) {
      text += '━━━━━━━━━━━━━━━━━━━━\n';
      text += '📱 <b>REAL ACCOUNT CATEGORY</b>\n';
      text += '━━━━━━━━━━━━━━━━━━━━\n\n';
      realWinners.forEach((w, i) => {
        const medal = medals[i] || '🏅';
        const username = w.username ? '@' + w.username : 'User ' + w.telegram_id;
        const prize = realPrizes[i] ? String(realPrizes[i]) : '';
        text += medal + ' <b>' + this.getOrdinal(i + 1) + ' Place</b> — ' + username + '\n';
        text += '   💰 Adjusted Balance: <b>$' + Number(w.adjusted_balance).toFixed(2) + '</b>\n';
        text += '   📈 Trades: ' + w.total_trades + ' | Flagged: ' + w.flagged_count + '\n';
        if (prize) text += '   🎁 Prize: <b>' + prize + '</b>\n';
        text += '\n';
      });
    }

    if (demoWinners.length > 0) {
      text += '━━━━━━━━━━━━━━━━━━━━\n';
      text += '🎮 <b>DEMO ACCOUNT CATEGORY</b>\n';
      text += '━━━━━━━━━━━━━━━━━━━━\n\n';
      demoWinners.forEach((w, i) => {
        const medal = medals[i] || '🏅';
        const username = w.username ? '@' + w.username : 'User ' + w.telegram_id;
        const prize = demoPrizes[i] ? '$' + String(demoPrizes[i]) : '';
        text += medal + ' <b>' + this.getOrdinal(i + 1) + ' Place</b> — ' + username + '\n';
        text += '   💰 Adjusted Balance: <b>$' + Number(w.adjusted_balance).toFixed(2) + '</b>\n';
        text += '   📈 Trades: ' + w.total_trades + ' | Flagged: ' + w.flagged_count + '\n';
        if (prize) text += '   🎁 Prize: <b>' + prize + '</b>\n';
        text += '\n';
      });
    }

    text += '━━━━━━━━━━━━━━━━━━━━\n\n';
    text += '📋 All accounts were evaluated using our automated rule-checking system.\n';
    text += 'Every trade was checked for lot size, stop loss, daily drawdown, hold time, and more.\n\n';
    text += 'Thank you to all participants! 💪\n';
    text += 'Join the next challenge and show your trading skills! 🚀\n\n';
    text += '@' + config.mainChannelUsername;

    return text;
  }

  private buildPreAnnouncementCaption(evaluation: EvaluationRecord, challenge: TradingChallenge, category: string): string {
    let text = '📋 <b>Your ' + challenge.title + ' Evaluation</b>\n\n';
    text += '📁 <b>' + category + '</b> Account Category\n';
    text += '📅 Account: <b>' + evaluation.account_number + '</b>\n\n';

    if (evaluation.is_disqualified) {
      text += '🚫 Status: <b>DISQUALIFIED</b>\n';
      let reason = evaluation.disqualify_reason || 'Rule violation';
      // Truncate long reasons (e.g., many deposits listed)
      if (reason.length > 200) reason = reason.substring(0, 200) + '...';
      text += '📛 Reason: ' + reason + '\n';
    } else {
      text += '💰 Adjusted Balance: <b>$' + Number(evaluation.adjusted_balance).toFixed(2) + '</b>\n';
      text += '💰 Reported: $' + Number(evaluation.reported_balance).toFixed(2) + ' | Removed: $' + Number(evaluation.profit_removed).toFixed(2) + '\n';
      text += '📈 Trades: ' + evaluation.total_trades + ' | Flagged: ' + evaluation.flagged_count + '\n';
    }

    text += '\n━━━━━━━━━━━━━━━━━━━━\n\n';
    text += '⚠️ <i>Generated by BirrForex Automated System.</i>\n\n';
    text += 'Review your result. If there is an error, you have <b>48 hours</b> to submit a complaint.\n\n';
    text += '📩 DM <b>@birrFXadmin</b> for re-evaluation.\n';
    text += '• State which trades were wrongly evaluated\n';
    text += '• Include trade date, time, and your reasoning\n\n';
    text += '⏰ <b>After 48 hours, winners will be announced and no re-evaluations will be accepted.</b>';

    return text;
  }

  private buildDmCaption(
    evaluation: EvaluationRecord,
    challenge: TradingChallenge,
    rank: number,
    category: string,
    isWinner: boolean,
    prize: string
  ): string {
    const medals = ['', '🥇', '🥈', '🥉'];
    const ordinals = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
    const ordinal = rank <= 10 ? ordinals[rank] : rank + 'th';

    let text = '';

    if (isWinner) {
      const medal = medals[rank] || '🏅';
      text += medal + ' <b>Congratulations! You won ' + ordinal + ' Place!</b> 🏆\n\n';
      text += challenge.title + '\n';
      text += '📁 ' + category + ' Account Category\n';
      text += '📅 Account: ' + evaluation.account_number + '\n';
      if (prize) text += '🎁 Prize: <b>' + prize + '</b>\n';
      text += '\n';
      text += '💰 Adjusted Balance: <b>$' + Number(evaluation.adjusted_balance).toFixed(2) + '</b>\n';
      text += '📈 Total Trades: ' + evaluation.total_trades + ' | Flagged: ' + evaluation.flagged_count + '\n';
      text += '\nYour trading was evaluated and verified.\n';
      text += 'Tap below to see your full evaluation report.\n';
      text += '\n📩 To receive your reward, please contact\n@birrFXadmin with a screenshot of this message.';
    } else if (evaluation.is_qualified) {
      text += '👏 <b>Great job! You placed ' + ordinal + '!</b> 💪\n\n';
      text += challenge.title + '\n';
      text += '📁 ' + category + ' Account Category\n';
      text += '📅 Account: ' + evaluation.account_number + '\n';
      text += '\n';
      text += '💰 Adjusted Balance: <b>$' + Number(evaluation.adjusted_balance).toFixed(2) + '</b>\n';
      text += '📈 Total Trades: ' + evaluation.total_trades + ' | Flagged: ' + evaluation.flagged_count + '\n';
      text += '\nYou reached the target — excellent trading!\n';
      text += 'Unfortunately you didn\'t make it to the top winners this time.\n';
      text += '\nKeep going — we hope to see you win next time! 🚀';
    } else if (evaluation.is_disqualified) {
      text += '📋 <b>Your ' + challenge.title + ' Result</b>\n\n';
      text += '📁 ' + category + ' Account Category\n';
      text += '📅 Account: ' + evaluation.account_number + '\n';
      text += '\n🚫 Status: <b>DISQUALIFIED</b>\n';
      text += '📛 Reason: ' + (evaluation.disqualify_reason || 'Rule violation') + '\n';
      text += '\nTap below for your full evaluation report.\n';
      text += '\nIf you believe this is an error, contact @birrFXadmin.';
    } else {
      text += '📋 <b>Your ' + challenge.title + ' Result</b>\n\n';
      text += '📁 ' + category + ' Account Category\n';
      text += '📅 Account: ' + evaluation.account_number + '\n';
      text += '\n❌ Adjusted Balance: <b>$' + Number(evaluation.adjusted_balance).toFixed(2) + '</b>\n';
      text += '💰 Reported Balance: $' + Number(evaluation.reported_balance).toFixed(2) + '\n';
      text += '➖ Profit Removed: $' + Number(evaluation.profit_removed).toFixed(2) + '\n';
      text += '📈 Total Trades: ' + evaluation.total_trades + ' | Flagged: ' + evaluation.flagged_count + '\n';
      text += '\nYour reported balance reached the target, but after applying the challenge rules, some profits were removed.\n';
      text += '\nTap below to see which trades were flagged and why.\n';
      text += '\nBetter luck next time! 💪';
    }

    return text;
  }

  private buildWinnerCaption(evaluation: EvaluationRecord, rank: number, category: string, prize: string): string {
    const medals = ['', '🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    const medal = medals[rank] || '🏅';
    const ordinals = ['', '1st', '2nd', '3rd'];
    const ordinal = rank <= 3 ? ordinals[rank] : rank + 'th';
    const username = evaluation.username ? '@' + evaluation.username : 'User ' + evaluation.telegram_id;

    let text = medal + ' <b>' + ordinal + ' Place Winner</b> — ' + username + '\n';
    text += '📁 ' + category + ' Account Category\n';
    text += '📅 Account: ' + evaluation.account_number + '\n';
    if (prize) text += '🎁 Prize: <b>' + prize + '</b>\n';
    text += '\n';
    text += '💰 Adjusted Balance: <b>$' + Number(evaluation.adjusted_balance).toFixed(2) + '</b>\n';
    text += '💰 Reported Balance: $' + Number(evaluation.reported_balance).toFixed(2) + '\n';
    text += '➖ Profit Removed: $' + Number(evaluation.profit_removed).toFixed(2) + '\n\n';
    text += '📈 Total Trades: ' + evaluation.total_trades + '\n';
    text += '⚠️ Flagged Trades: ' + evaluation.flagged_count + '\n';
    return text;
  }

  private getOrdinal(n: number): string {
    const ordinals = ['', '1st', '2nd', '3rd'];
    if (n <= 3) return ordinals[n];
    return n + 'th';
  }
}

export const evaluationHandler = new EvaluationHandler();
