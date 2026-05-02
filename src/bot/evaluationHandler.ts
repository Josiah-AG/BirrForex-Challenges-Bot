import { Context, Markup } from 'telegraf';
import axios from 'axios';
import { parseMT5Report } from '../services/mt5Parser';
import { evaluateAccount, EvaluationConfig } from '../services/evaluationEngine';
import { evaluationService, EvaluationRecord } from '../services/evaluationService';
import { tradingChallengeService, TradingChallenge } from '../services/tradingChallengeService';
import { config } from '../config';

interface EvalSession {
  step: string;
  challengeId: number;
  challenge: TradingChallenge;
  isTest: boolean;
  isReevaluate: boolean;
}

class EvaluationHandler {
  private evalSessions = new Map<number, EvalSession>();

  hasActiveSession(telegramId: number): boolean {
    return this.evalSessions.has(telegramId);
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

      // Clear session
      this.evalSessions.delete(ctx.from!.id);
    } catch (error) {
      console.error('Error in handleDocument:', error);
      await ctx.reply('❌ Error processing file: ' + (error as Error).message);
      this.evalSessions.delete(ctx.from!.id);
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

      // Common violations
      const violationCounts: Record<string, number> = {};
      evaluations.forEach(e => {
        if (e.flagged_details && Array.isArray(e.flagged_details)) {
          e.flagged_details.forEach((f: any) => {
            if (f.reasons) {
              f.reasons.forEach((r: string) => {
                const key = r.replace(/\d+\.\d+/g, 'X').replace(/\$[\d.]+/g, '$X');
                violationCounts[key] = (violationCounts[key] || 0) + 1;
              });
            }
          });
        }
      });

      const sortedViolations = Object.entries(violationCounts).sort((a, b) => b[1] - a[1]);
      if (sortedViolations.length > 0) {
        text += `\n⚠️ <b>Common Violations:</b>\n`;
        sortedViolations.slice(0, 10).forEach(([reason, count]) => {
          text += `  • ${reason}: ${count} trades\n`;
        });
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
          let message = '';
          const isWinner = winnerIds.has(evaluation.id);

          if (isWinner) {
            // Determine prize
            let prize = '';
            const realIdx = realWinners.findIndex(w => w.id === evaluation.id);
            const demoIdx = demoWinners.findIndex(w => w.id === evaluation.id);
            if (realIdx >= 0 && realPrizes[realIdx]) {
              prize = `${realPrizes[realIdx]}`;
            } else if (demoIdx >= 0 && demoPrizes[demoIdx]) {
              prize = `${demoPrizes[demoIdx]}`;
            }

            const rank = realIdx >= 0 ? realIdx + 1 : demoIdx + 1;
            const medals = ['', '🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
            const medal = medals[rank] || '🏅';
            const ordinals = ['', '1st', '2nd', '3rd'];
            const ordinal = rank <= 3 ? ordinals[rank] : rank + 'th';

            message = medal + ` <b>${ordinal} Place Winner</b>\n\n` +
              `🎉 <b>Congratulations!</b> 🏆\n\n` +
              `You are a <b>WINNER</b> in ${challenge.title}!\n` +
              `Account: ${evaluation.account_number} (${evaluation.account_type})\n` +
              `Adjusted Balance: ${Number(evaluation.adjusted_balance).toFixed(2)}\n` +
              (prize ? `Prize: <b>${prize}</b>\n` : '') +
              `\nTo receive your reward, please contact @birrFXadmin with a screenshot of this message.`;
          } else if (evaluation.is_qualified) {
            message = `👏 <b>Great job!</b>\n\n` +
              `You qualified in ${challenge.title}!\n` +
              `Account: ${evaluation.account_number} (${evaluation.account_type})\n` +
              `Adjusted Balance: ${Number(evaluation.adjusted_balance).toFixed(2)}\n` +
              `\nUnfortunately you didn't make it to the top winners this time, but your performance was excellent. Keep it up!`;
          } else if (evaluation.is_disqualified) {
            message = `📋 <b>Evaluation Result</b>\n\n` +
              `Your account was <b>disqualified</b> in ${challenge.title}.\n` +
              `Account: ${evaluation.account_number} (${evaluation.account_type})\n` +
              `Reason: ${evaluation.disqualify_reason || 'Rule violation'}\n` +
              `\nPlease review the rules and try again in the next challenge!`;
          } else {
            message = `📋 <b>Evaluation Result</b>\n\n` +
              `Unfortunately, you did not qualify in ${challenge.title}.\n` +
              `Account: ${evaluation.account_number} (${evaluation.account_type})\n` +
              `Adjusted Balance: ${Number(evaluation.adjusted_balance).toFixed(2)}\n` +
              `\nKeep practicing and join the next challenge!`;
          }

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

        // Determine prize
        let prize = '';
        const realIdx = realWinners.findIndex(w => w.id === winner.id);
        const demoIdx = demoWinners.findIndex(w => w.id === winner.id);
        if (realIdx >= 0 && realPrizes[realIdx]) {
          prize = `${realPrizes[realIdx]}`;
        } else if (demoIdx >= 0 && demoPrizes[demoIdx]) {
          prize = `${demoPrizes[demoIdx]}`;
        }

        const rank = realIdx >= 0 ? realIdx + 1 : demoIdx + 1;
        const medals = ['', '🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        const medal = medals[rank] || '🏅';
        const ordinals = ['', '1st', '2nd', '3rd'];
        const ordinal = rank <= 3 ? ordinals[rank] : rank + 'th';

        const winnerCaption = medal + ` <b>${ordinal} Place Winner</b>\n\n` +
          `🎉 <b>Congratulations!</b> 🏆\n\n` +
          `You are a <b>WINNER</b> in ${challenge.title}!\n` +
          `Account: ${winner.account_number} (${winner.account_type})\n` +
          `Adjusted Balance: ${Number(winner.adjusted_balance).toFixed(2)}\n` +
          (prize ? `Prize: <b>${prize}</b>\n` : '') +
          `\nTo receive your reward, please contact @birrFXadmin with a screenshot of this message.`;

        await ctx.telegram.sendDocument(adminId, winner.file_id, {
          caption: winnerCaption,
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

        const qualifiedCaption = `👏 <b>Great job!</b>\n\n` +
          `You qualified in ${challenge.title}!\n` +
          `Account: ${evaluation.account_number} (${evaluation.account_type})\n` +
          `Adjusted Balance: ${Number(evaluation.adjusted_balance).toFixed(2)}\n` +
          `\nUnfortunately you didn't make it to the top winners this time, but your performance was excellent. Keep it up!`;

        await ctx.telegram.sendDocument(adminId, evaluation.file_id, {
          caption: qualifiedCaption,
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

        const notQualifiedCaption = `📋 <b>Evaluation Result</b>\n\n` +
          `Unfortunately, you did not qualify in ${challenge.title}.\n` +
          `Account: ${evaluation.account_number} (${evaluation.account_type})\n` +
          `Adjusted Balance: ${Number(evaluation.adjusted_balance).toFixed(2)}\n` +
          `\nKeep practicing and join the next challenge!`;

        await ctx.telegram.sendDocument(adminId, evaluation.file_id, {
          caption: notQualifiedCaption,
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

        const disqualifiedCaption = `📋 <b>Evaluation Result</b>\n\n` +
          `Your account was <b>disqualified</b> in ${challenge.title}.\n` +
          `Account: ${evaluation.account_number} (${evaluation.account_type})\n` +
          `Reason: ${evaluation.disqualify_reason || 'Rule violation'}\n` +
          `\nPlease review the rules and try again in the next challenge!`;

        await ctx.telegram.sendDocument(adminId, evaluation.file_id, {
          caption: disqualifiedCaption,
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

  private buildWinnerCaption(evaluation: EvaluationRecord, rank: number, category: string, prize: string): string {
    const medals = ['', '🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    const medal = medals[rank] || '🏅';
    const ordinals = ['', '1st', '2nd', '3rd'];
    const ordinal = rank <= 3 ? ordinals[rank] : rank + 'th';
    const username = evaluation.username ? '@' + evaluation.username : 'User ' + evaluation.telegram_id;

    let text = medal + ' <b>' + ordinal + ' Place Winner</b> — ' + username + '\n';
    text += '📁 ' + category + ' Account Category\n\n';
    text += '💰 Adjusted Balance: <b>$' + Number(evaluation.adjusted_balance).toFixed(2) + '</b>\n';
    text += '💰 Reported Balance: $' + Number(evaluation.reported_balance).toFixed(2) + '\n';
    text += '➖ Profit Removed: $' + Number(evaluation.profit_removed).toFixed(2) + '\n\n';
    text += '📈 Total Trades: ' + evaluation.total_trades + '\n';
    text += '⚠️ Flagged Trades: ' + evaluation.flagged_count + '\n';
    text += '📅 Account: ' + evaluation.account_number + '\n';
    if (prize) text += '🎁 Prize: <b>' + prize + '</b>\n';
    return text;
  }

  private getOrdinal(n: number): string {
    const ordinals = ['', '1st', '2nd', '3rd'];
    if (n <= 3) return ordinals[n];
    return n + 'th';
  }
}

export const evaluationHandler = new EvaluationHandler();
