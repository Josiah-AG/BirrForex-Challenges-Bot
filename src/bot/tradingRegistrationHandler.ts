import { Context, Markup } from 'telegraf';
import { tradingChallengeService } from '../services/tradingChallengeService';
import { exnessService } from '../services/exnessService';
import { config } from '../config';
import { db } from '../database/db';

// Convert stored UTC date to EAT for display
const toEAT = (d: Date) => new Date(new Date(d).getTime() + 3 * 60 * 60 * 1000);

interface UserSession {
  step: string;
  data: any;
}

const userSessions = new Map<number, UserSession>();

// Track users who interacted with the bot (for manual verify lookup)
const knownUsers = new Map<number, { username: string | null; firstName: string | null }>();

// Store pending manual review data for approve/reject callbacks
const pendingManualReviews = new Map<number, any>();

export class TradingRegistrationHandler {

  hasActiveSession(telegramId: number): boolean {
    return userSessions.has(telegramId);
  }

  getKnownUsers(): Map<number, { username: string | null; firstName: string | null }> {
    return knownUsers;
  }

  async startRegistration(ctx: Context, challengeId: number) {
    const telegramId = ctx.from!.id;
    // Track this user for manual verify lookup
    knownUsers.set(telegramId, { username: ctx.from!.username || null, firstName: ctx.from!.first_name || null });

    const challenge = await tradingChallengeService.getChallengeById(challengeId);

    if (!challenge) {
      await ctx.reply('❌ Challenge not found.');
      return;
    }

    if (challenge.status !== 'registration_open') {
      if (challenge.status === 'active' || challenge.status === 'submission_open') {
        await ctx.reply('❌ <b>Registration is closed.</b>\nThis challenge has already started.\n\nStay tuned for the next challenge on <b>@BirrForex!</b>', { parse_mode: 'HTML' });
      } else {
        await ctx.reply('❌ This challenge is not accepting registrations.');
      }
      return;
    }

    // Check if already registered
    const existing = await tradingChallengeService.getRegistration(challengeId, telegramId);
    if (existing) {
      const regText = `✅ <b>You are already registered for this challenge!</b>\n\n` +
        `📋 <b>Your Registration:</b>\n` +
        `📧 <b>Email:</b> ${existing.email}\n` +
        `🏦 <b>${existing.account_type === 'demo' ? 'Demo' : 'Real'} Account:</b> ${existing.account_number}\n` +
        `🖥️ <b>Server:</b> ${existing.mt5_server || 'N/A'}\n` +
        `📊 <b>Type:</b> ${existing.account_type === 'demo' ? 'Demo' : 'Real'}`;

      const buttons: any[][] = [
        [Markup.button.callback('🔄 Change Account Number', `tc_change_acct_${challengeId}`)],
      ];
      if (challenge.type === 'hybrid') {
        const switchLabel = existing.account_type === 'demo' ? '🔀 Switch to Real Account' : '🔀 Switch to Demo Account';
        buttons.push([Markup.button.callback(switchLabel, `tc_switch_cat_${challengeId}`)]);
      }

      await ctx.reply(regText, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
      return;
    }

    // Start registration flow
    if (challenge.type === 'hybrid') {
      userSessions.set(telegramId, { step: 'tc_select_type', data: { challenge_id: challengeId } });

      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
      const formatPrize = (p: any) => { const n = parseFloat(String(p)); return isNaN(n) ? String(p) : `$${n}`; };
      const realPrizes = typeof challenge.real_prizes === 'string' ? JSON.parse(challenge.real_prizes) : (challenge.real_prizes || []);
      const demoPrizes = typeof challenge.demo_prizes === 'string' ? JSON.parse(challenge.demo_prizes) : (challenge.demo_prizes || []);

      let prizesText = '';
      if (realPrizes.length > 0) {
        prizesText += `\n<b>🏆 Real Account Category Prizes:</b>\n`;
        realPrizes.forEach((p: any, i: number) => { prizesText += `${medals[i] || (i+1)+'️⃣'} ${i+1}${['st','nd','rd'][i] || 'th'} Place: <b>${formatPrize(p)}</b>\n`; });
      }
      if (demoPrizes.length > 0) {
        prizesText += `\n<b>🏆 Demo Account Category Prizes:</b>\n`;
        demoPrizes.forEach((p: any, i: number) => { prizesText += `${medals[i] || (i+1)+'️⃣'} ${i+1}${['st','nd','rd'][i] || 'th'} Place: <b>${formatPrize(p)}</b>\n`; });
      }

      await ctx.reply(
        `<b>🎯 BIRRFOREX TRADING CHALLENGE</b>\n<b>${challenge.title}</b>\n\n` +
        `This is a <b>Hybrid Challenge</b> — you can participate\n` +
        `with either a <b>Demo</b> or <b>Real</b> account.\n\n` +
        `⚠️ <i>You can only compete in one category.</i>\n` +
        prizesText +
        `\nChoose your category:`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([
          [Markup.button.callback('🏦 Demo Account Challenge', `tc_reg_demo_${challengeId}`)],
          [Markup.button.callback('💰 Real Account Challenge', `tc_reg_real_${challengeId}`)],
        ]) }
      );
    } else {
      const accountType = challenge.type as 'demo' | 'real';
      userSessions.set(telegramId, { step: 'tc_enter_email', data: { challenge_id: challengeId, account_type: accountType } });
      await ctx.reply('📧 Please send your <b>Exness email address:</b>', { parse_mode: 'HTML' });
    }
  }

  async startLateChange(ctx: Context, challengeId: number) {
    const telegramId = ctx.from!.id;

    // Check if window is open
    const { tradingAdminHandler } = require('./tradingAdminHandler');
    if (!tradingAdminHandler.isLateChangeWindowOpen(challengeId)) {
      await ctx.reply('❌ <b>This window has expired.</b>\n\n<i>The change window is no longer available.</i>', { parse_mode: 'HTML' });
      return;
    }

    // Check if registered
    const reg = await tradingChallengeService.getRegistration(challengeId, telegramId);
    if (!reg) {
      await ctx.reply('❌ <b>This is only for registered participants.</b>', { parse_mode: 'HTML' });
      return;
    }

    userSessions.set(telegramId, {
      step: 'tc_change_acct_number',
      data: { challenge_id: challengeId, registration_id: reg.id, account_type: reg.account_type },
    });

    await ctx.reply(
      `🔄 <b>Change Account Number</b>\n\n` +
      `📋 Current: ${reg.account_number} (${reg.mt5_server || 'N/A'})\n\n` +
      `Send your new <b>MT5 ${reg.account_type === 'demo' ? 'Demo' : 'Real'} Account Number:</b>\n⚠️ <i>Must be an MT5 trading account.</i>`,
      { parse_mode: 'HTML' }
    );
  }

  async startLateSwitch(ctx: Context, challengeId: number) {
    const telegramId = ctx.from!.id;

    // Check if window is open
    const { tradingAdminHandler } = require('./tradingAdminHandler');
    if (!tradingAdminHandler.isLateChangeWindowOpen(challengeId)) {
      await ctx.reply('❌ <b>This window has expired.</b>\n\n<i>The change window is no longer available.</i>', { parse_mode: 'HTML' });
      return;
    }

    // Check if registered
    const reg = await tradingChallengeService.getRegistration(challengeId, telegramId);
    if (!reg) {
      await ctx.reply('❌ <b>This is only for registered participants.</b>', { parse_mode: 'HTML' });
      return;
    }

    // Only allow Demo → Real
    if (reg.account_type === 'real') {
      await ctx.reply('❌ <b>You are already in the Real Account category.</b>\n\n<i>Switching from Real to Demo is not allowed.</i>', { parse_mode: 'HTML' });
      return;
    }

    await ctx.reply(
      `⚠️ <b>Switch to Real Account?</b>\n\n` +
      `Your current Demo registration will be deleted and you will need to register as a Real Account trader.\n\n` +
      `<i>This cannot be undone.</i>`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Yes, Switch to Real', `tc_late_switch_confirm_${challengeId}`)],
        [Markup.button.callback('❌ Cancel', 'tc_switch_cancel')],
      ]) }
    );
  }

  async startLateRetry(ctx: Context, challengeId: number) {
    const telegramId = ctx.from!.id;

    // Check if window is open
    const { tradingAdminHandler } = require('./tradingAdminHandler');
    if (!tradingAdminHandler.isLateChangeWindowOpen(challengeId)) {
      await ctx.reply('❌ <b>This window has expired.</b>\n\n<i>The registration window is no longer available.</i>', { parse_mode: 'HTML' });
      return;
    }

    // Check if already registered
    const existingReg = await tradingChallengeService.getRegistration(challengeId, telegramId);
    if (existingReg) {
      await ctx.reply('✅ <b>You are already registered for this challenge!</b>\n\nUse the Change Account or Switch buttons if you need to make changes.', { parse_mode: 'HTML' });
      return;
    }

    // Check if user has a failed attempt
    const failed = await tradingChallengeService.getAllFailedAttempts(challengeId);
    const userFailed = failed.find((f: any) => String(f.telegram_id) === String(telegramId));

    if (!userFailed) {
      await ctx.reply('❌ <b>This is only for users who previously attempted registration.</b>\n\n<i>No previous registration attempt found for your account.</i>', { parse_mode: 'HTML' });
      return;
    }

    // Start normal registration flow
    const challenge = await tradingChallengeService.getChallengeById(challengeId);
    if (!challenge) { await ctx.reply('❌ Challenge not found.'); return; }

    knownUsers.set(telegramId, { username: ctx.from!.username || null, firstName: ctx.from!.first_name || null });

    if (challenge.type === 'hybrid') {
      userSessions.set(telegramId, { step: 'tc_select_type', data: { challenge_id: challengeId } });
      await ctx.reply(
        `<b>🔁 Retry Registration</b>\n<b>${challenge.title}</b>\n\nWelcome back! Let\'s get you registered.\n\nChoose your category:`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([
          [Markup.button.callback('🏦 Demo Account Challenge', `tc_reg_demo_${challengeId}`)],
          [Markup.button.callback('💰 Real Account Challenge', `tc_reg_real_${challengeId}`)],
        ]) }
      );
    } else {
      const accountType = challenge.type as 'demo' | 'real';
      userSessions.set(telegramId, { step: 'tc_enter_email', data: { challenge_id: challengeId, account_type: accountType } });
      await ctx.reply('📧 Please send your <b>Exness email address:</b>', { parse_mode: 'HTML' });
    }
  }

  async startSubmission(ctx: Context, challengeId: number) {
    const telegramId = ctx.from!.id;
    const challenge = await tradingChallengeService.getChallengeById(challengeId);

    if (!challenge) {
      await ctx.reply('❌ Challenge not found.');
      return;
    }

    if (challenge.status !== 'submission_open') {
      if (challenge.status === 'reviewing' || challenge.status === 'completed') {
        await ctx.reply('❌ <b>Submission deadline has passed.</b>\n<i>Late submissions are not accepted.</i>', { parse_mode: 'HTML' });
      } else {
        await ctx.reply('❌ This challenge is not accepting submissions yet.');
      }
      return;
    }

    // Check deadline
    if (challenge.submission_deadline && new Date() > new Date(challenge.submission_deadline)) {
      await ctx.reply('❌ <b>Submission deadline has passed.</b>\n<i>Late submissions are not accepted.</i>', { parse_mode: 'HTML' });
      return;
    }

    // Check if user already has a submission
    const reg = await tradingChallengeService.getRegistration(challengeId, telegramId);
    if (reg) {
      const existingSub = await tradingChallengeService.getSubmissionByRegistration(reg.id);
      if (existingSub) {
        userSessions.set(telegramId, {
          step: 'tc_submit_override_confirm',
          data: { challenge_id: challengeId, target_balance: challenge.target_balance, registration_id: reg.id, challenge_title: challenge.title },
        });

        await ctx.reply(
          `⚠️ <b>You have already submitted your results for ${challenge.title}.</b>\n\n` +
          `📋 <b>Previous Submission:</b>\n` +
          `💰 <b>Balance:</b> $${Number(existingSub.final_balance).toFixed(2)}\n` +
          `📸 <b>Screenshot:</b> ✅\n` +
          `🔑 <b>Password:</b> ✅\n\n` +
          `Do you want to <b>override</b> your previous submission?\n` +
          `<i>Only do this if there was an error in your previous submission. The previous data will be overwritten.</i>`,
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Yes, Submit Again', `tc_submit_override_yes_${challengeId}`)],
            [Markup.button.callback('❌ No, Keep Previous', `tc_submit_override_no`)],
          ]) }
        );
        return;
      }
    }

    userSessions.set(telegramId, {
      step: 'tc_submit_email',
      data: { challenge_id: challengeId, target_balance: challenge.target_balance },
    });

    await ctx.reply('📧 Please enter your <b>Exness email</b> to verify your identity:', { parse_mode: 'HTML' });
  }

  async handleCallback(ctx: Context, data: string): Promise<boolean> {
    const telegramId = ctx.from!.id;

    // Account type selection for hybrid
    if (data.startsWith('tc_reg_demo_') || data.startsWith('tc_reg_real_')) {
      const parts = data.split('_');
      const accountType = parts[2] as 'demo' | 'real';
      const challengeId = parseInt(parts[3]);
      const session = userSessions.get(telegramId);
      if (!session) return true;

      session.data.account_type = accountType;
      session.step = 'tc_enter_email';
      await ctx.answerCbQuery();
      await ctx.reply('📧 Please send your <b>Exness email address:</b>', { parse_mode: 'HTML' });
      return true;
    }

    // Change account number
    if (data.startsWith('tc_change_acct_')) {
      const challengeId = parseInt(data.replace('tc_change_acct_', ''));
      const challenge = await tradingChallengeService.getChallengeById(challengeId);
      if (challenge && (challenge.status === 'active' || challenge.status === 'submission_open')) {
        await ctx.answerCbQuery();
        await ctx.reply('❌ Challenge has started. Changes are no longer allowed.');
        return true;
      }
      const reg = await tradingChallengeService.getRegistration(challengeId, telegramId);
      if (!reg) return true;

      userSessions.set(telegramId, {
        step: 'tc_change_acct_number',
        data: { challenge_id: challengeId, registration_id: reg.id, account_type: reg.account_type },
      });
      await ctx.answerCbQuery();
      await ctx.reply(`Send your new <b>MT5 ${reg.account_type === 'demo' ? 'Demo' : 'Real'} Account Number:</b>\n⚠️ <i>Must be an MT5 trading account.</i>`, { parse_mode: 'HTML' });
      return true;
    }

    // Switch category
    if (data.startsWith('tc_switch_cat_')) {
      const challengeId = parseInt(data.replace('tc_switch_cat_', ''));
      const challenge = await tradingChallengeService.getChallengeById(challengeId);
      if (challenge && (challenge.status === 'active' || challenge.status === 'submission_open')) {
        await ctx.answerCbQuery();
        await ctx.reply('❌ Challenge has started. Changes are no longer allowed.');
        return true;
      }
      await ctx.answerCbQuery();
      await ctx.reply(
        `⚠️ <b>Are you sure you want to switch category?</b>\n\nIf you proceed, your current registration will be deleted and you will need to register again.`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Yes, Switch', `tc_switch_confirm_${challengeId}`)],
          [Markup.button.callback('❌ Cancel', `tc_switch_cancel`)],
        ]) }
      );
      return true;
    }

    if (data.startsWith('tc_switch_confirm_')) {
      const challengeId = parseInt(data.replace('tc_switch_confirm_', ''));
      const reg = await tradingChallengeService.getRegistration(challengeId, telegramId);
      if (reg) {
        await tradingChallengeService.deleteRegistration(reg.id);
        await tradingChallengeService.updateDailyStat(challengeId, 'category_switches');
      }
      await ctx.answerCbQuery();
      // Restart registration
      await this.startRegistration(ctx, challengeId);
      return true;
    }

    if (data === 'tc_switch_cancel') {
      await ctx.answerCbQuery('Cancelled');
      return true;
    }

    // Late switch confirm
    if (data.startsWith('tc_late_switch_confirm_')) {
      const challengeId = parseInt(data.replace('tc_late_switch_confirm_', ''));

      const { tradingAdminHandler } = require('./tradingAdminHandler');
      if (!tradingAdminHandler.isLateChangeWindowOpen(challengeId)) {
        await ctx.answerCbQuery('Window expired');
        await ctx.reply('❌ <b>This window has expired.</b>', { parse_mode: 'HTML' });
        return true;
      }

      const reg = await tradingChallengeService.getRegistration(challengeId, telegramId);
      if (reg) {
        await tradingChallengeService.deleteRegistration(reg.id);
      }
      await ctx.answerCbQuery();

      // Start real account registration (email already verified)
      userSessions.set(telegramId, {
        step: 'tc_enter_email',
        data: { challenge_id: challengeId, account_type: 'real' },
      });
      await ctx.reply('📧 Please send your <b>Exness email address:</b>', { parse_mode: 'HTML' });
      return true;
    }

    // Submit email again button
    if (data.startsWith('tc_retry_email_')) {
      const challengeId = parseInt(data.replace('tc_retry_email_', ''));
      const session = userSessions.get(telegramId);
      if (session) {
        session.step = 'tc_enter_email';
        session.data.retry_count = 0;
      } else {
        // Determine account type from challenge
        const challenge = await tradingChallengeService.getChallengeById(challengeId);
        const accountType = challenge?.type === 'real' ? 'real' : challenge?.type === 'demo' ? 'demo' : 'demo';
        userSessions.set(telegramId, { step: 'tc_enter_email', data: { challenge_id: challengeId, account_type: accountType } });
      }
      await ctx.answerCbQuery();
      await ctx.reply('📧 Please send your <b>Exness email address:</b>', { parse_mode: 'HTML' });
      return true;
    }

    // Submit new real account button
    if (data.startsWith('tc_new_real_acct_')) {
      const challengeId = parseInt(data.replace('tc_new_real_acct_', ''));
      const session = userSessions.get(telegramId);
      if (session) {
        session.step = 'tc_enter_account_number';
      }
      await ctx.answerCbQuery();
      await ctx.reply('Send your new <b>MT5 Real Account Number:</b>\n⚠️ <i>Must be an MT5 trading account.</i>', { parse_mode: 'HTML' });
      return true;
    }

    // Try again button (API retry)
    if (data.startsWith('tc_try_again_')) {
      const challengeId = parseInt(data.replace('tc_try_again_', ''));
      const session = userSessions.get(telegramId);
      if (session && session.data.email) {
        session.step = 'tc_verifying_email';
        await ctx.answerCbQuery();
        await this.verifyEmail(ctx, telegramId);
      }
      return true;
    }

    // Submission override callbacks
    if (data.startsWith('tc_submit_override_yes_')) {
      const challengeId = parseInt(data.replace('tc_submit_override_yes_', ''));
      const session = userSessions.get(telegramId);
      if (session) {
        session.data.is_override = true;
        session.step = 'tc_submit_email';
      } else {
        userSessions.set(telegramId, {
          step: 'tc_submit_email',
          data: { challenge_id: challengeId, is_override: true },
        });
      }
      await ctx.answerCbQuery();
      await ctx.reply('📧 Please enter your <b>Exness email</b> to verify your identity:', { parse_mode: 'HTML' });
      return true;
    }

    if (data === 'tc_submit_override_no') {
      userSessions.delete(telegramId);
      await ctx.answerCbQuery();
      await ctx.reply('✅ Your previous submission has been kept.');
      return true;
    }

    // Manual review approve/reject callbacks
    if (data.startsWith('tc_mr_approve_')) {
      const userId = parseInt(data.replace('tc_mr_approve_', ''));
      const review = pendingManualReviews.get(userId);
      if (!review) {
        await ctx.answerCbQuery('Review data expired. Use /manualverify instead.');
        return true;
      }

      try {
        await tradingChallengeService.registerUser(review);
        const statField = review.account_type === 'demo' ? 'demo_registrations' : 'real_registrations';
        await tradingChallengeService.updateDailyStat(review.challenge_id, 'new_registrations');
        await tradingChallengeService.updateDailyStat(review.challenge_id, statField);
        pendingManualReviews.delete(userId);

        await ctx.answerCbQuery('Approved!');
        await ctx.reply(`✅ <b>Approved!</b> @${review.username || 'user'} has been registered.`, { parse_mode: 'HTML' });

        // Notify user
        const challenge = await tradingChallengeService.getChallengeById(review.challenge_id);
        const acctLabel = review.account_type === 'demo' ? 'Demo' : 'Real';
        try {
          await ctx.telegram.sendMessage(userId,
            `✅ <b>Registration Approved!</b>\n\n` +
            `You have been registered for <b>${challenge?.title || 'the challenge'}</b>.\n\n` +
            `📋 <b>Your Registration:</b>\n` +
            `📧 <b>Email:</b> ${review.email}\n` +
            `🏦 <b>${acctLabel} Account:</b> ${review.account_number}\n` +
            `🖥️ <b>Server:</b> ${review.mt5_server || 'N/A'}\n` +
            `📊 <b>Type:</b> ${acctLabel}\n\n` +
            `⚠️ <i>Please read the rules and understand them well before starting the challenge!</i>`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {
          await ctx.reply('⚠️ Registered but could not notify user.');
        }
      } catch (e: any) {
        if (e.code === '23505') {
          await ctx.reply('⚠️ User is already registered.');
        } else {
          await ctx.reply('❌ Error registering user.');
        }
        pendingManualReviews.delete(userId);
      }
      return true;
    }

    if (data.startsWith('tc_mr_reject_')) {
      const userId = parseInt(data.replace('tc_mr_reject_', ''));
      const review = pendingManualReviews.get(userId);
      pendingManualReviews.delete(userId);

      await ctx.answerCbQuery('Rejected');
      await ctx.reply(`❌ <b>Rejected.</b> User has been notified.`, { parse_mode: 'HTML' });

      // Notify user
      try {
        await ctx.telegram.sendMessage(userId,
          `❌ <b>Registration Rejected</b>\n\n` +
          `Your manual verification request has been reviewed and was not approved.\n\n` +
          `This may be because your account details could not be verified.\n\n` +
          `<i>If you believe this is an error, please contact @birrFXadmin.</i>`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {
        // User may have DMs closed
      }
      return true;
    }

    // Submit email retry button
    if (data.startsWith('tc_submit_retry_email_')) {
      const challengeId = parseInt(data.replace('tc_submit_retry_email_', ''));
      const session = userSessions.get(telegramId);
      if (session) {
        session.step = 'tc_submit_email';
      } else {
        const challenge = await tradingChallengeService.getChallengeById(challengeId);
        userSessions.set(telegramId, {
          step: 'tc_submit_email',
          data: { challenge_id: challengeId, target_balance: challenge?.target_balance || 0 },
        });
      }
      await ctx.answerCbQuery();
      await ctx.reply('📧 Please enter your <b>Exness email</b> to verify your identity:', { parse_mode: 'HTML' });
      return true;
    }

    return false;
  }

  // ==================== TEXT INPUT ====================

  async handleTextInput(ctx: Context, text: string) {
    const telegramId = ctx.from!.id;
    const session = userSessions.get(telegramId);
    if (!session) return;

    switch (session.step) {
      case 'tc_enter_email': {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(text.trim())) {
          await ctx.reply('❌ Invalid email format. Please send a valid email address.');
          return;
        }
        session.data.email = text.trim().toLowerCase();
        session.data.retry_count = 0;

        // Check if email already registered for this challenge
        const existing = await tradingChallengeService.getRegistrationByEmail(session.data.challenge_id, session.data.email);
        if (existing) {
          await ctx.reply(
            '⚠️ <b>This email is already registered for this challenge.</b>\n\n' +
            'If you have another email, you can submit it below.\n' +
            '<i>If you believe this is an error, please contact @birrFXadmin.</i>',
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([
              [Markup.button.callback('📧 Submit Another Email', `tc_retry_email_${session.data.challenge_id}`)],
            ]) }
          );
          return;
        }

        session.step = 'tc_verifying_email';
        await ctx.reply('⏳ <b>Verifying your account...</b>', { parse_mode: 'HTML' });
        await this.verifyEmail(ctx, telegramId);
        break;
      }

      case 'tc_enter_account_number': {
        session.data.account_number = text.trim();
        session.step = 'tc_confirm_account_number';
        await ctx.reply(`🔑 Please enter your account number <b>again</b> to confirm:\n<i>(${session.data.account_number})</i>`, { parse_mode: 'HTML' });
        break;
      }

      case 'tc_confirm_account_number': {
        if (text.trim() !== session.data.account_number) {
          session.step = 'tc_enter_account_number';
          await ctx.reply(`❌ <b>Account numbers don't match.</b> Please try again.\n\nSend your <b>MT5 ${session.data.account_type === 'demo' ? 'Demo' : 'Real'} Account Number:</b>`, { parse_mode: 'HTML' });
          return;
        }
        session.step = 'tc_enter_server';
        const example = session.data.account_type === 'demo' ? 'ExnessMT5Trial9' : 'ExnessMT5Real9';
        await ctx.reply(`Please send your <b>MT5 Trading Server:</b>\nExample: <code>${example}</code>\n⚠️ <i>Only MT5 servers are allowed.</i>`, { parse_mode: 'HTML' });
        break;
      }

      case 'tc_enter_server': {
        session.data.mt5_server = text.trim();

        // For real accounts, verify the account number
        if (session.data.account_type === 'real') {
          session.step = 'tc_verifying_real_acct';
          await ctx.reply('⏳ <b>Verifying your real account...</b>', { parse_mode: 'HTML' });
          await this.verifyRealAccount(ctx, telegramId);
        } else {
          // Demo — save directly
          await this.completeRegistration(ctx, telegramId);
        }
        break;
      }

      case 'tc_change_acct_number': {
        session.data.new_account_number = text.trim();
        session.step = 'tc_change_acct_server';
        const example = session.data.account_type === 'demo' ? 'ExnessMT5Trial9' : 'ExnessMT5Real9';
        await ctx.reply(`Send your <b>MT5 Trading Server:</b>\nExample: <code>${example}</code>`, { parse_mode: 'HTML' });
        break;
      }

      case 'tc_change_acct_server': {
        const newServer = text.trim();
        if (session.data.account_type === 'real') {
          // Verify new real account
          session.data.mt5_server = newServer;
          session.step = 'tc_verifying_change_real';
          await ctx.reply('⏳ <b>Verifying your real account...</b>', { parse_mode: 'HTML' });
          await this.verifyRealAccountChange(ctx, telegramId);
        } else {
          await tradingChallengeService.updateAccountNumber(session.data.registration_id, session.data.new_account_number, newServer);
          await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'account_changes');
          userSessions.delete(telegramId);
          await ctx.reply(`✅ Account number updated!\n\n🏦 <b>New Account:</b> ${session.data.new_account_number}\n🖥️ <b>Server:</b> ${newServer}`, { parse_mode: 'HTML' });
        }
        break;
      }

      // Manual verification steps
      case 'tc_manual_account': {
        session.data.account_number = text.trim();
        session.step = 'tc_manual_server';
        const example = session.data.account_type === 'demo' ? 'ExnessMT5Trial9' : 'ExnessMT5Real9';
        await ctx.reply(`Please send your <b>MT5 Trading Server:</b>\nExample: <code>${example}</code>\n⚠️ <i>Only MT5 servers are allowed.</i>`, { parse_mode: 'HTML' });
        break;
      }

      case 'tc_manual_server': {
        session.data.mt5_server = text.trim();
        session.step = 'tc_manual_screenshot';
        await ctx.reply('📸 Please upload a screenshot of your Exness account showing your account is verified and active.');
        break;
      }

      // ==================== SUBMISSION STEPS ====================

      case 'tc_submit_email': {
        const email = text.trim().toLowerCase();
        const reg = await tradingChallengeService.getRegistrationByEmail(session.data.challenge_id, email);

        if (!reg) {
          await ctx.reply(
            '❌ <b>This email is not registered for this challenge.</b>\n\n' +
            'Please check if you misspelled your email and try again.\n' +
            '<i>Only registered participants can submit results.</i>',
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([
              [Markup.button.callback('📧 Submit Email Again', `tc_submit_retry_email_${session.data.challenge_id}`)],
            ]) }
          );
          return;
        }

        // Compare as strings to avoid BigInt vs number mismatch
        if (String(reg.telegram_id) !== String(telegramId)) {
          await ctx.reply(
            '❌ <b>This email is registered under a different account.</b>\n\n' +
            'Please check if you misspelled your email and try again.\n' +
            '<i>Use the Telegram account you registered with.</i>',
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([
              [Markup.button.callback('📧 Submit Email Again', `tc_submit_retry_email_${session.data.challenge_id}`)],
            ]) }
          );
          return;
        }

        session.data.registration_id = reg.id;
        session.data.email = email;
        session.data.account_type = reg.account_type;
        session.data.account_number = reg.account_number;
        session.data.mt5_server = reg.mt5_server;
        session.step = 'tc_submit_balance';
        await ctx.reply('✅ <b>Identity verified!</b>\n\n💰 What is your final account balance?\n<i>(Enter the number only, e.g., 67.50)</i>', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_submit_balance': {
        const balance = parseFloat(text.trim());
        if (isNaN(balance) || balance <= 0) {
          await ctx.reply('❌ Please enter a valid number.');
          return;
        }

        if (balance < session.data.target_balance) {
          userSessions.delete(telegramId);
          await ctx.reply(`❌ Sorry, the <b>target</b> for this challenge is <b>$${session.data.target_balance}</b>.\n\nYour balance of <b>$${balance.toFixed(2)}</b> has not reached the target.\nOnly participants who hit the target can submit results.\n\n<i>Better luck next time!</i> 💪`, { parse_mode: 'HTML' });
          return;
        }

        session.data.final_balance = balance;
        session.step = 'tc_submit_screenshot';
        await ctx.reply('📸 Upload a <b>screenshot</b> of your final balance.\n\nMake sure it clearly shows:\n➡️ Account number\n➡️ Final balance/equity', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_submit_password': {
        session.data.investor_password = text.trim();
        session.step = 'tc_submit_confirm_password';
        await ctx.reply('🔑 Please enter the password <b>again</b> to confirm:', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_submit_confirm_password': {
        if (text.trim() !== session.data.investor_password) {
          session.step = 'tc_submit_password';
          await ctx.reply('❌ <b>Passwords don\'t match.</b> Please try again.\n\n🔑 Enter your <b>Investor (Read-Only) password:</b>', { parse_mode: 'HTML' });
          return;
        }

        // Save submission
        try {
          // Post screenshot to private submission channel and get link
          let screenshotLink: string | null = null;
          let screenshotMessageId: number | null = null;
          const isOverride = session.data.is_override === true;

          // If override, delete old screenshot message from submission channel
          if (isOverride && config.submissionChannelId) {
            try {
              const oldSub = await tradingChallengeService.getSubmissionByRegistration(session.data.registration_id);
              if (oldSub && oldSub.screenshot_message_id) {
                await ctx.telegram.deleteMessage(config.submissionChannelId, oldSub.screenshot_message_id);
              }
            } catch (e) {
              // Old message may already be deleted, ignore
            }
          }

          if (session.data.screenshot_file_id && config.submissionChannelId) {
            try {
              const acctLabel = session.data.account_type === 'demo' ? 'Demo' : 'Real';
              const overrideTag = isOverride ? ' (UPDATED)' : '';
              const caption = `<b>📋 Submission${overrideTag}</b>\n\n` +
                `👤 @${ctx.from!.username || 'unknown'}\n` +
                `📧 ${session.data.email}\n` +
                `🏦 ${acctLabel}: ${session.data.account_number}\n` +
                `🖥️ Server: ${session.data.mt5_server || 'N/A'}\n` +
                `💰 Balance: $${session.data.final_balance.toFixed(2)}\n` +
                `🔑 Password: <code>${session.data.investor_password}</code>`;

              const sent = await ctx.telegram.sendPhoto(config.submissionChannelId, session.data.screenshot_file_id, {
                caption,
                parse_mode: 'HTML',
              });

              // Build message link: t.me/c/{channel_id_without_-100}/{message_id}
              const channelIdStr = String(config.submissionChannelId).replace('-100', '');
              screenshotLink = `https://t.me/c/${channelIdStr}/${sent.message_id}`;
              screenshotMessageId = sent.message_id;
            } catch (e) {
              console.error('Error posting screenshot to submission channel:', e);
            }
          }

          if (isOverride) {
            await tradingChallengeService.updateSubmission(session.data.registration_id, {
              final_balance: session.data.final_balance,
              balance_screenshot_file_id: session.data.screenshot_file_id || null,
              screenshot_link: screenshotLink,
              screenshot_message_id: screenshotMessageId,
              investor_password: session.data.investor_password,
            });
          } else {
            await tradingChallengeService.createSubmission({
              registration_id: session.data.registration_id,
              challenge_id: session.data.challenge_id,
              final_balance: session.data.final_balance,
              balance_screenshot_file_id: session.data.screenshot_file_id || null,
              screenshot_link: screenshotLink,
              screenshot_message_id: screenshotMessageId,
              investor_password: session.data.investor_password,
            });
          }

          const acctLabel = session.data.account_type === 'demo' ? 'Demo' : 'Real';
          userSessions.delete(telegramId);

          await ctx.reply(
            `✅ <b>Results Submitted Successfully!</b>\n\n` +
            `📋 <b>Your Submission:</b>\n` +
            `📧 <b>Email:</b> ${session.data.email}\n` +
            `🏦 <b>Account:</b> ${session.data.account_number}\n` +
            `🖥️ <b>Server:</b> ${session.data.mt5_server || 'N/A'}\n` +
            `📊 <b>Type:</b> ${acctLabel}\n` +
            `💰 <b>Final Balance:</b> $${session.data.final_balance.toFixed(2)}\n` +
            `📸 <b>Screenshot:</b> ✅ Received\n` +
            `🔑 <b>Password:</b> ✅ Saved\n\n` +
            `⏳ Our team will review your account and announce results.\n<i>Thank you for participating!</i> 🎉`,
            { parse_mode: 'HTML' }
          );
        } catch (error: any) {
          if (error.code === '23505') {
            await ctx.reply('⚠️ You have already submitted results for this challenge. Use the Submit Results button again to override.', { parse_mode: 'HTML' });
          } else {
            console.error('Submission error:', error);
            await ctx.reply('❌ Error saving submission. Please try again.');
          }
          userSessions.delete(telegramId);
        }
        break;
      }

      // ── Resubmission steps ──
      case 'tc_resubmit_account': {
        const acctNum = text.trim();
        if (!/^\d+$/.test(acctNum)) {
          await ctx.reply('❌ Only numbers are accepted. Please enter your MT5 account number:');
          return;
        }
        session.data.new_account_number = acctNum;
        session.step = 'tc_resubmit_server';
        await ctx.reply('🖥️ Enter your <b>MT5 server name:</b>', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_resubmit_server': {
        session.data.mt5_server = text.trim();
        session.step = 'tc_resubmit_password';
        await ctx.reply('🔑 Enter your <b>investor (read-only) password:</b>', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_resubmit_password': {
        session.data.investor_password = text.trim();
        session.step = 'tc_resubmit_balance';
        await ctx.reply('💰 Enter your <b>final account balance:</b>\n<i>(Number only, e.g., 125.50)</i>', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_resubmit_balance': {
        const balance = parseFloat(text.trim());
        if (isNaN(balance) || balance <= 0) {
          await ctx.reply('❌ Please enter a valid number.');
          return;
        }

        try {
          const { evaluationService } = require('../services/evaluationService');
          await evaluationService.updateSubmissionResubmit(session.data.submission_id, {
            investor_password: session.data.investor_password,
            final_balance: balance,
            original_account_number: session.data.original_account_number,
            new_account_number: session.data.new_account_number,
            mt5_server: session.data.mt5_server,
          });

          const accountChanged = session.data.original_account_number !== session.data.new_account_number;

          await ctx.reply(
            '✅ <b>Account details updated!</b>\n\n' +
            '🏦 Account: <b>' + session.data.new_account_number + '</b>\n' +
            '🖥️ Server: <b>' + session.data.mt5_server + '</b>\n' +
            '💰 Balance: <b>$' + balance.toFixed(2) + '</b>\n\n' +
            '<i>Thank you for resubmitting. Your account will be re-evaluated.</i>',
            { parse_mode: 'HTML' }
          );

          // Notify admin
          const { config } = require('../config');
          let adminMsg = '🔄 <b>Resubmission received</b>\n\n' +
            '👤 @' + (ctx.from!.username || 'unknown') + ' (TG: ' + telegramId + ')\n' +
            '🏦 Account: ' + session.data.new_account_number + '\n' +
            '🖥️ Server: ' + session.data.mt5_server + '\n' +
            '💰 Balance: $' + balance.toFixed(2) + '\n';

          if (accountChanged) {
            adminMsg += '\n⚠️ <b>ACCOUNT NUMBER CHANGED!</b>\n' +
              '   Previous: ' + session.data.original_account_number + '\n' +
              '   New: ' + session.data.new_account_number + '\n';
          }

          try {
            await (ctx as any).telegram.sendMessage(config.adminUserId, adminMsg, { parse_mode: 'HTML' });
          } catch (e) {
            console.error('Error notifying admin of resubmission:', e);
          }
        } catch (error) {
          console.error('Error saving resubmission:', error);
          await ctx.reply('❌ Error saving your details. Please try again.');
        }

        userSessions.delete(telegramId);
        break;
      }
    }
  }

  // ==================== PHOTO HANDLER ====================

  async handlePhoto(ctx: Context, fileId: string) {
    const telegramId = ctx.from!.id;
    const session = userSessions.get(telegramId);
    if (!session) return;

    if (session.step === 'tc_manual_screenshot') {
      session.data.screenshot_file_id = fileId;
      await this.sendManualReview(ctx, telegramId);
    }

    if (session.step === 'tc_submit_screenshot') {
      session.data.screenshot_file_id = fileId;
      session.step = 'tc_submit_password';

      let guideText = '';
      if (config.investorPasswordGuideLink) {
        guideText = `\n\n📋 Don't know how to get it?\n<a href="${config.investorPasswordGuideLink}">How to Get Investor Password</a>`;
      }

      await ctx.reply(
        `🔑 Enter your Investor (Read-Only) password:\nThis allows view-only access to your trading account.${guideText}`,
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
      );
    }
  }

  // ==================== VERIFICATION FLOWS ====================

  private async verifyEmail(ctx: Context, telegramId: number) {
    const session = userSessions.get(telegramId);
    if (!session) return;

    const maxRetries = 3;
    const retryDelay = 3000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await exnessService.verifyEmail(session.data.email, session.data.account_type);

      if (result.success) {
        session.data.client_uid = result.clientUid;
        session.step = 'tc_enter_account_number';
        const acctType = session.data.account_type === 'demo' ? 'Demo' : 'Real';
        await ctx.reply(
          `✅ <b>Email verified!</b>\n\nNow send your <b>MT5 ${acctType} Account Number:</b>\n⚠️ It must be an MT5 trading account.\n<i>Check if your account is MT5. If it is not, please create an MT5 trading account within your Exness. Other account types are not allowed.</i>`, { parse_mode: 'HTML' }
        );
        return;
      }

      if (result.status === 'not_allocated') {
        session.data.allocation_fail_count = (session.data.allocation_fail_count || 0) + 1;
        await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'allocation_failures');
        await tradingChallengeService.logFailedAttempt(session.data.challenge_id, telegramId, ctx.from!.username || null, session.data.email, 'allocation');
        const challengeId = session.data.challenge_id;
        const contactAdmin = session.data.allocation_fail_count >= 2
          ? `\n\n<b>If you are sure this is a mistake, contact @birrFXadmin with a screenshot of this message.</b>`
          : '';
        await ctx.reply(
          `⚠️ Your Exness account is not registered under BirrForex.\n\n` +
          `First, please make sure you spelled your email correctly.\nIf it was wrong, you can submit it again below.\n\n` +
          `If your email was correct, you have two options:\n\n` +
          `✨ <b>Option 1: Create a New Exness Account</b>\n` +
          `➡️ Open a new account using our partner link below\n` +
          `➡️ You can use a different email\n` +
          `➡️ Same phone number and documents can be reused\n` +
          `🔗 ${config.exnessPartnerSignupLink}\n\n` +
          `🔄 <b>Option 2: Change Your Partner to BirrForex</b>\n` +
          `➡️ Log in to your Exness account\n` +
          `➡️ Open Live Chat → Type "Change Partner"\n` +
          `➡️ Paste this link in the form:\n${config.exnessPartnerChangeLink}\n` +
          `➡️ Submit and verify with SMS code\n` +
          `➡️ Wait for confirmation (usually within 24 hours)\n` +
          (config.partnerChangeGuideLink ? `\n📋 Full guide: <a href="${config.partnerChangeGuideLink}">How to Change Partner</a>\n` : '') +
          `\nAfter completing one of the options, try again:` + contactAdmin,
          { parse_mode: 'HTML', link_preview_options: { is_disabled: true },
            ...Markup.inlineKeyboard([[Markup.button.callback('📧 Submit Email Again', `tc_retry_email_${challengeId}`)]]) }
        );
        return;
      }

      if (result.status === 'kyc_failed') {
        session.data.kyc_fail_count = (session.data.kyc_fail_count || 0) + 1;
        await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'kyc_failures');
        await tradingChallengeService.logFailedAttempt(session.data.challenge_id, telegramId, ctx.from!.username || null, session.data.email, 'kyc');
        const challengeId = session.data.challenge_id;
        const contactAdmin = session.data.kyc_fail_count >= 2
          ? `\n\n<b>If you are sure your account is verified, contact @birrFXadmin with a screenshot of this message.</b>`
          : '';
        await ctx.reply(
          `❌ Your Exness account is not fully verified.\n\n` +
          `Please complete your KYC verification first:\n` +
          `➡️ Log in to your Exness Personal Area\n` +
          `➡️ Go to Settings → Verification\n` +
          `➡️ Upload your ID and proof of address\n` +
          `➡️ Wait for approval (usually a few minutes)\n\n` +
          `Once verified, try again:` + contactAdmin,
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📧 Submit Email Again', `tc_retry_email_${challengeId}`)]]) }
        );
        return;
      }

      if (result.status === 'balance_failed') {
        userSessions.delete(telegramId);
        const challengeId = session.data.challenge_id;
        await ctx.reply(
          `❌ No positive equity found on your account.\n\n` +
          `For Real Account challenges, you need to have funds deposited in your Exness account.\n\n` +
          `Please deposit funds and try again:`,
          Markup.inlineKeyboard([[Markup.button.callback('📧 Submit Email Again', `tc_retry_email_${challengeId}`)]])
        );
        return;
      }

      // API error — retry
      if (attempt < maxRetries) {
        const msg = attempt === 1 ? '⚠️ System busy. Trying again in 3 seconds...' : '⚠️ System busy. Trying one more time in 3 seconds...';
        await ctx.reply(msg);
        await new Promise(r => setTimeout(r, retryDelay));
      }
    }

    // All retries failed
    const challengeId = session.data.challenge_id;
    session.data.retry_count = (session.data.retry_count || 0) + 1;

    if (session.data.retry_count >= 2) {
      // Fallback to manual verification
      session.step = 'tc_manual_account';
      await ctx.reply(
        `⚠️ Automatic verification is temporarily unavailable.\nWe'll verify your account manually.\n\n` +
        `📧 Email: ${session.data.email}\n📊 Type: ${session.data.account_type === 'demo' ? 'Demo' : 'Real'}\n\n` +
        `Please send your <b>MT5 account number:</b>\n⚠️ <i>It must be an MT5 trading account.</i>`
      );
    } else {
      await ctx.reply(
        `⚠️ System is currently busy.\nPlease try again after 30 minutes by tapping "Join Challenge" on the channel post.`,
        Markup.inlineKeyboard([[Markup.button.callback('🔄 Try Again', `tc_try_again_${challengeId}`)]])
      );
    }
  }

  private async verifyRealAccount(ctx: Context, telegramId: number) {
    const session = userSessions.get(telegramId);
    if (!session) return;

    const result = await exnessService.verifyRealAccount(session.data.account_number);
    const challengeId = session.data.challenge_id;

    if (result.status === 'allocated_mt5') {
      // Check if this account belongs to the same client as the email
      if (result.data?.client_uid && session.data.client_uid) {
        if (result.data.client_uid !== session.data.client_uid) {
          session.step = 'tc_enter_account_number';
          await ctx.reply(
            `⚠️ <b>This account does not belong to the email you registered with.</b>\n\n` +
            `Please make sure you are submitting a real account that is under the same Exness profile as your registered email.\n\n` +
            `Send your correct MT5 Real Account Number:`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📝 Submit New Real Account', `tc_new_real_acct_${challengeId}`)]]) }
          );
          return;
        }
      }
      await this.completeRegistration(ctx, telegramId);
      return;
    }

    if (result.status === 'allocated_not_mt5') {
      session.step = 'tc_enter_account_number';
      await ctx.reply(
        `⚠️ <b>This account is not an MT5 trading account.</b>\n\n` +
        `Only MT5 accounts are allowed for this challenge.\n` +
        `Please create a new MT5 Real trading account within your Exness and transfer your funds there.`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📝 Submit New Real Account', `tc_new_real_acct_${challengeId}`)]]) }
      );
      return;
    }

    if (result.status === 'not_allocated') {
      session.step = 'tc_enter_account_number';
      session.data.real_acct_retry = (session.data.real_acct_retry || 0) + 1;
      await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'real_acct_failures');
      await tradingChallengeService.logFailedAttempt(session.data.challenge_id, telegramId, ctx.from!.username || null, session.data.email, 'real_acct');

      if (session.data.real_acct_retry >= 2) {
        await ctx.reply(
          `⚠️ <b>This account is not yet under BirrForex.</b>\n\n` +
          `It may take a few minutes for a newly created account to be linked.\n` +
          `Please come back after 15 minutes and try again.\n\n` +
          `<i>Make sure the real account you submitted is under the email you used for registration.</i>`,
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📝 Submit New Real Account', `tc_new_real_acct_${challengeId}`)]]) }
        );
      } else {
        await ctx.reply(
          `⚠️ <b>This real account is not under BirrForex.</b>\n\n` +
          `Please create a new Real Account within your Exness\n` +
          `<i>(not a new Exness account — a new Real trading account within your existing Exness)</i>\n` +
          `and transfer your funds there.\n\n` +
          `<i>Make sure the new real account is under the email you used for registration.</i>`,
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📝 Submit New Real Account', `tc_new_real_acct_${challengeId}`)]]) }
        );
      }
      return;
    }

    // API error
    await ctx.reply('⚠️ Could not verify account. Please try again later.');
  }

  private async verifyRealAccountChange(ctx: Context, telegramId: number) {
    const session = userSessions.get(telegramId);
    if (!session) return;

    const result = await exnessService.verifyRealAccount(session.data.new_account_number);

    if (result.status === 'allocated_mt5') {
      await tradingChallengeService.updateAccountNumber(session.data.registration_id, session.data.new_account_number, session.data.mt5_server);
      await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'account_changes');
      userSessions.delete(telegramId);
      await ctx.reply(`✅ Account number updated!\n\n🏦 <b>New Account:</b> ${session.data.new_account_number}\n🖥️ <b>Server:</b> ${session.data.mt5_server}`, { parse_mode: 'HTML' });
      return;
    }

    if (result.status === 'allocated_not_mt5') {
      session.step = 'tc_change_acct_number';
      await ctx.reply('⚠️ <b>This account is not an MT5 trading account.</b>\nPlease create a new MT5 Real trading account and try again.\n\nSend your new <b>MT5 Real Account Number:</b>', { parse_mode: 'HTML' });
      return;
    }

    if (result.status === 'not_allocated') {
      session.step = 'tc_change_acct_number';
      await ctx.reply('⚠️ <b>This account is not yet under BirrForex.</b>\nPlease come back after 15 minutes and try again.\n\nSend your new <b>MT5 Real Account Number:</b>', { parse_mode: 'HTML' });
      return;
    }

    await ctx.reply('⚠️ Could not verify account. Please try again later.');
    userSessions.delete(telegramId);
  }

  // ==================== COMPLETE REGISTRATION ====================

  private async completeRegistration(ctx: Context, telegramId: number) {
    const session = userSessions.get(telegramId);
    if (!session) return;

    try {
      const challenge = await tradingChallengeService.getChallengeById(session.data.challenge_id);
      if (!challenge) {
        await ctx.reply('❌ Challenge not found.');
        userSessions.delete(telegramId);
        return;
      }

      const reg = await tradingChallengeService.registerUser({
        challenge_id: session.data.challenge_id,
        telegram_id: telegramId,
        username: ctx.from!.username || null,
        account_type: session.data.account_type,
        email: session.data.email,
        account_number: session.data.account_number,
        mt5_server: session.data.mt5_server || null,
        client_uid: session.data.client_uid || null,
      });

      // Remove from failed attempts if they were there
      await tradingChallengeService.markConverted(session.data.challenge_id, telegramId);

      // Track daily stat
      const statField = session.data.account_type === 'demo' ? 'demo_registrations' : 'real_registrations';
      await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'new_registrations');
      await tradingChallengeService.updateDailyStat(session.data.challenge_id, statField);

      // Track recoveries (user had previous failures but now succeeded)
      if (session.data.allocation_fail_count > 0) {
        await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'allocation_recoveries');
      }
      if (session.data.kyc_fail_count > 0) {
        await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'kyc_recoveries');
      }
      if (session.data.real_acct_retry > 0) {
        await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'real_acct_recoveries');
      }

      userSessions.delete(telegramId);

      const acctLabel = session.data.account_type === 'demo' ? 'Demo' : 'Real';
      const startStr = toEAT(challenge.start_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

      let switchText = '';
      let buttons: any[][] = [
        [Markup.button.callback('🔄 Change Account Number', `tc_change_acct_${challenge.id}`)],
      ];

      if (challenge.type === 'hybrid') {
        if (session.data.account_type === 'demo') {
          switchText = '\n💡 Want to compete in the <b>Real Account</b> category instead? Use the switch button below.\n';
          buttons.push([Markup.button.callback('🔀 Switch to Real Account', `tc_switch_cat_${challenge.id}`)]);
        } else {
          buttons.push([Markup.button.callback('🔀 Switch to Demo Account', `tc_switch_cat_${challenge.id}`)]);
        }
      }

      let linksText = '';
      if (challenge.pdf_url) linksText += `\n📄 Challenge Rules: <a href="${challenge.pdf_url}">Download PDF</a>`;
      if (challenge.video_url) linksText += `\n🎥 Challenge Guide: <a href="${challenge.video_url}">Watch Video</a>`;

      await ctx.reply(
        `✅ <b>Registration Complete!</b>\n\n` +
        `📋 <b>Your Registration:</b>\n` +
        `📧 <b>Email:</b> ${session.data.email}\n` +
        `🏦 <b>${acctLabel} Account:</b> ${session.data.account_number}\n` +
        `🖥️ <b>Server:</b> ${session.data.mt5_server || 'N/A'}\n` +
        `📊 <b>Type:</b> ${acctLabel}\n\n` +
        `⏳ <b>Challenge starts:</b> ${startStr}\n\n` +
        `⚠️ <i>Please read the rules and understand them well before starting the challenge!</i>\n\n` +
        `You can change your account number before the challenge starts if you need to.\n` +
        switchText +
        linksText,
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...Markup.inlineKeyboard(buttons) }
      );
    } catch (error: any) {
      if (error.code === '23505') {
        // Unique constraint violation
        await ctx.reply('⚠️ You are already registered for this challenge.');
      } else {
        console.error('Registration error:', error);
        await ctx.reply('❌ Error completing registration. Please try again.');
      }
      userSessions.delete(telegramId);
    }
  }

  // ==================== MANUAL REVIEW ====================

  private async sendManualReview(ctx: Context, telegramId: number) {
    const session = userSessions.get(telegramId);
    if (!session) return;

    await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'manual_reviews');

    // Store pending review data for approve/reject callbacks
    const reviewData = {
      challenge_id: session.data.challenge_id,
      telegram_id: telegramId,
      username: ctx.from!.username || null,
      account_type: session.data.account_type,
      email: session.data.email,
      account_number: session.data.account_number,
      mt5_server: session.data.mt5_server || null,
      client_uid: session.data.client_uid || null,
    };
    pendingManualReviews.set(telegramId, reviewData);

    userSessions.delete(telegramId);

    await ctx.reply('✅ <b>Submission received!</b>\n\nYour registration is pending manual review.\n<i>You\'ll be notified once approved.</i>', { parse_mode: 'HTML' });

    // Send to admin
    const acctLabel = session.data.account_type === 'demo' ? 'Demo' : 'Real';
    const adminText = `<b>📋 MANUAL REVIEW REQUIRED</b>\n\n` +
      `👤 <b>User:</b> @${ctx.from!.username || 'unknown'} (ID: <code>${telegramId}</code>)\n` +
      `📧 <b>Email:</b> ${session.data.email}\n` +
      `🏦 <b>Account:</b> ${session.data.account_number}\n` +
      `🖥️ <b>Server:</b> ${session.data.mt5_server || 'N/A'}\n` +
      `📊 <b>Type:</b> ${acctLabel}\n\n` +
      `⚠️ Automatic verification failed — manual review needed`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('✅ Approve', `tc_mr_approve_${telegramId}`)],
      [Markup.button.callback('❌ Reject', `tc_mr_reject_${telegramId}`)],
    ]);

    try {
      if (session.data.screenshot_file_id) {
        await ctx.telegram.sendPhoto(config.adminUserId, session.data.screenshot_file_id, {
          caption: adminText,
          parse_mode: 'HTML',
          ...keyboard,
        });
      } else {
        await ctx.telegram.sendMessage(config.adminUserId, adminText, { parse_mode: 'HTML', ...keyboard });
      }
    } catch (e) {
      console.error('Error sending manual review to admin:', e);
    }
  }

  // ── Resubmission flow (user resubmits account details) ──

  async startResubmission(ctx: Context, submissionId: number): Promise<void> {
    try {
      const telegramId = ctx.from!.id;

      // Get the submission and verify it belongs to this user
      const sub = await db.query(
        'SELECT s.*, r.account_number, r.telegram_id, r.username FROM trading_submissions s JOIN trading_registrations r ON s.registration_id = r.id WHERE s.id = $1',
        [submissionId]
      );

      if (!sub.rows[0]) {
        await ctx.reply('❌ Submission not found.');
        return;
      }

      const submission = sub.rows[0];
      if (submission.telegram_id !== telegramId) {
        await ctx.reply('❌ This resubmission link is not for your account.');
        return;
      }

      userSessions.set(telegramId, {
        step: 'tc_resubmit_account',
        data: {
          submission_id: submissionId,
          registration_id: submission.registration_id,
          original_account_number: submission.account_number,
          challenge_id: submission.challenge_id,
        },
      });

      await ctx.reply(
        '🔄 <b>Account Resubmission</b>\n\n' +
        'Please enter your <b>MT5 account number:</b>',
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error('Error in startResubmission:', error);
      await ctx.reply('❌ Error starting resubmission.');
    }
  }
}

export const tradingRegistrationHandler = new TradingRegistrationHandler();
