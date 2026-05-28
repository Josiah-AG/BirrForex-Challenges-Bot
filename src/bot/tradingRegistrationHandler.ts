import { Context, Markup } from 'telegraf';
import { tradingChallengeService } from '../services/tradingChallengeService';
import { exnessService } from '../services/exnessService';
import { vpsService, MT5_SERVERS, fuzzyMatchServer } from '../services/vpsService';
import { config } from '../config';
import { db } from '../database/db';
import * as fs from 'fs';
import * as path from 'path';

// Convert stored UTC date to EAT for display
const toEAT = (d: Date) => new Date(new Date(d).getTime() + 3 * 60 * 60 * 1000);

// File for persisting active registration sessions (survives restarts)
const SESSIONS_FILE = path.join(process.cwd(), 'data', 'tg_registration_sessions.json');

interface UserSession {
  step: string;
  data: any;
}

const userSessions = new Map<number, UserSession>();

// Track users who interacted with the bot (for manual verify lookup)
const knownUsers = new Map<number, { username: string | null; firstName: string | null }>();

// Store pending manual review data for approve/reject callbacks
const pendingManualReviews = new Map<number, any>();

/** Save active registration sessions to disk */
function saveSessionsToDisk() {
  try {
    const dir = path.dirname(SESSIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const toSave: Record<string, { challengeId: number; savedAt: string }> = {};
    for (const [uid, session] of userSessions) {
      const challengeId = session.data?.challenge_id;
      if (challengeId) {
        toSave[String(uid)] = { challengeId, savedAt: new Date().toISOString() };
      }
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(toSave));
  } catch (e) {
    // Non-fatal
  }
}

/** Load interrupted sessions from disk (returns {telegramId: challengeId}). Deletes file after reading. */
function loadInterruptedSessions(): Map<number, number> {
  const result = new Map<number, number>();
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
      const now = Date.now();
      for (const [uidStr, info] of Object.entries(raw)) {
        const { challengeId, savedAt } = info as any;
        // Only include sessions less than 24h old
        if (savedAt && (now - new Date(savedAt).getTime()) > 24 * 3600 * 1000) continue;
        result.set(parseInt(uidStr), challengeId);
      }
      // Delete file after loading (one-time use)
      fs.unlinkSync(SESSIONS_FILE);
    }
  } catch (e) {
    // Non-fatal
  }
  return result;
}

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
        `🏷️ <b>Nickname:</b> ${existing.nickname || 'N/A'}\n` +
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

    // === USERNAME REQUIREMENT ===
    if (!ctx.from!.username) {
      await ctx.reply(
        '⚠️ <b>Telegram Username Required</b>\n\n' +
        'You need to set a Telegram username before registering.\n\n' +
        '<b>How to set a username:</b>\n' +
        '1. Open Telegram Settings\n' +
        '2. Tap on your profile\n' +
        '3. Set a username (e.g., @yourname)\n\n' +
        'Once done, tap "Join Challenge" again.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Start registration flow
    if (challenge.type === 'hybrid') {
      userSessions.set(telegramId, { step: 'tc_select_type', data: { challenge_id: challengeId } });
      saveSessionsToDisk();

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
      saveSessionsToDisk();
      await ctx.reply('📧 Please send your <b>Exness email address:</b>', { parse_mode: 'HTML' });
    }
  }

  async startLateChange(ctx: Context, challengeId: number) {
    const telegramId = ctx.from!.id;
    const { tradingAdminHandler } = require('./tradingAdminHandler');
    if (!tradingAdminHandler.isLateChangeWindowOpen(challengeId)) {
      await ctx.reply('❌ <b>This window has expired.</b>\n\n<i>The change window is no longer available.</i>', { parse_mode: 'HTML' });
      return;
    }
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
    const { tradingAdminHandler } = require('./tradingAdminHandler');
    if (!tradingAdminHandler.isLateChangeWindowOpen(challengeId)) {
      await ctx.reply('❌ <b>This window has expired.</b>\n\n<i>The change window is no longer available.</i>', { parse_mode: 'HTML' });
      return;
    }
    const reg = await tradingChallengeService.getRegistration(challengeId, telegramId);
    if (!reg) {
      await ctx.reply('❌ <b>This is only for registered participants.</b>', { parse_mode: 'HTML' });
      return;
    }
    if (reg.account_type === 'real') {
      await ctx.reply('❌ <b>You are already in the Real Account category.</b>\n\n<i>Switching from Real to Demo is not allowed.</i>', { parse_mode: 'HTML' });
      return;
    }
    await ctx.reply(
      `⚠️ <b>Switch to Real Account?</b>\n\nYour current Demo registration will be deleted and you will need to register as a Real Account trader.\n\n<i>This cannot be undone.</i>`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Yes, Switch to Real', `tc_late_switch_confirm_${challengeId}`)],
        [Markup.button.callback('❌ Cancel', 'tc_switch_cancel')],
      ]) }
    );
  }

  async startLateRetry(ctx: Context, challengeId: number) {
    const telegramId = ctx.from!.id;
    const { tradingAdminHandler } = require('./tradingAdminHandler');
    if (!tradingAdminHandler.isLateChangeWindowOpen(challengeId)) {
      await ctx.reply('❌ <b>This window has expired.</b>\n\n<i>The registration window is no longer available.</i>', { parse_mode: 'HTML' });
      return;
    }
    const existingReg = await tradingChallengeService.getRegistration(challengeId, telegramId);
    if (existingReg) {
      await ctx.reply('✅ <b>You are already registered for this challenge!</b>\n\nUse the Change Account or Switch buttons if you need to make changes.', { parse_mode: 'HTML' });
      return;
    }
    const failed = await tradingChallengeService.getAllFailedAttempts(challengeId);
    const userFailed = failed.find((f: any) => String(f.telegram_id) === String(telegramId));
    if (!userFailed) {
      await ctx.reply('❌ <b>This is only for users who previously attempted registration.</b>\n\n<i>No previous registration attempt found for your account.</i>', { parse_mode: 'HTML' });
      return;
    }
    const challenge = await tradingChallengeService.getChallengeById(challengeId);
    if (!challenge) { await ctx.reply('❌ Challenge not found.'); return; }
    knownUsers.set(telegramId, { username: ctx.from!.username || null, firstName: ctx.from!.first_name || null });
    if (challenge.type === 'hybrid') {
      userSessions.set(telegramId, { step: 'tc_select_type', data: { challenge_id: challengeId } });
      await ctx.reply(
        `<b>🔁 Retry Registration</b>\n<b>${challenge.title}</b>\n\nWelcome back! Let's get you registered.\n\nChoose your category:`,
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
    if (!challenge) { await ctx.reply('❌ Challenge not found.'); return; }
    if (challenge.status !== 'submission_open') {
      if (challenge.status === 'reviewing' || challenge.status === 'completed') {
        await ctx.reply('❌ <b>Submission deadline has passed.</b>\n<i>Late submissions are not accepted.</i>', { parse_mode: 'HTML' });
      } else {
        await ctx.reply('❌ This challenge is not accepting submissions yet.');
      }
      return;
    }
    if (challenge.submission_deadline && new Date() > new Date(challenge.submission_deadline)) {
      await ctx.reply('❌ <b>Submission deadline has passed.</b>\n<i>Late submissions are not accepted.</i>', { parse_mode: 'HTML' });
      return;
    }
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
          `📋 <b>Previous Submission:</b>\n💰 <b>Balance:</b> $${Number(existingSub.final_balance).toFixed(2)}\n📸 <b>Screenshot:</b> ✅\n🔑 <b>Password:</b> ✅\n\n` +
          `Do you want to <b>override</b> your previous submission?\n<i>Only do this if there was an error in your previous submission.</i>`,
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Yes, Submit Again', `tc_submit_override_yes_${challengeId}`)],
            [Markup.button.callback('❌ No, Keep Previous', `tc_submit_override_no`)],
          ]) }
        );
        return;
      }
    }
    userSessions.set(telegramId, { step: 'tc_submit_email', data: { challenge_id: challengeId, target_balance: challenge.target_balance } });
    await ctx.reply('📧 Please enter your <b>Exness email</b> to verify your identity:', { parse_mode: 'HTML' });
  }

  async startForcedSubmission(ctx: Context, challengeId: number, allowedTelegramId: number) {
    const telegramId = ctx.from!.id;
    if (String(telegramId) !== String(allowedTelegramId)) { await ctx.reply('❌ This submission link is not for your account.'); return; }
    const challenge = await tradingChallengeService.getChallengeById(challengeId);
    if (!challenge) { await ctx.reply('❌ Challenge not found.'); return; }
    const reg = await tradingChallengeService.getRegistration(challengeId, telegramId);
    if (!reg) { await ctx.reply('❌ You are not registered for this challenge.'); return; }
    const existingSub = await tradingChallengeService.getSubmissionByRegistration(reg.id);
    if (existingSub) {
      userSessions.set(telegramId, { step: 'tc_submit_override_confirm', data: { challenge_id: challengeId, target_balance: challenge.target_balance, registration_id: reg.id, challenge_title: challenge.title } });
      await ctx.reply('⚠️ <b>You have already submitted your results.</b>\n\n💰 Previous Balance: $' + Number(existingSub.final_balance).toFixed(2) + '\n\nDo you want to submit again and overwrite?',
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Yes, Submit Again', 'tc_submit_override_yes_' + challengeId)], [Markup.button.callback('❌ No, Keep Previous', 'tc_submit_override_no')]]) });
      return;
    }
    userSessions.set(telegramId, { step: 'tc_submit_email', data: { challenge_id: challengeId, target_balance: challenge.target_balance } });
    await ctx.reply('📧 Please enter your <b>Exness email</b> to verify your identity:', { parse_mode: 'HTML' });
  }

  async startResubmission(ctx: Context, submissionId: number): Promise<void> {
    try {
      const telegramId = ctx.from!.id;
      const sub = await db.query(
        'SELECT s.*, r.account_number, r.user_id, r.username FROM trading_submissions s JOIN trading_registrations r ON s.registration_id = r.id WHERE s.id = $1',
        [submissionId]
      );
      if (!sub.rows[0]) { await ctx.reply('❌ Submission not found.'); return; }
      const submission = sub.rows[0];
      if (String(submission.user_id) !== String(telegramId)) { await ctx.reply('❌ This resubmission link is not for your account.'); return; }
      userSessions.set(telegramId, {
        step: 'tc_resubmit_account',
        data: { submission_id: submissionId, registration_id: submission.registration_id, original_account_number: submission.account_number, challenge_id: submission.challenge_id },
      });
      await ctx.reply('🔄 <b>Account Resubmission</b>\n\nPlease enter your <b>MT5 account number:</b>', { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error in startResubmission:', error);
      await ctx.reply('❌ Error starting resubmission.');
    }
  }

  // ==================== CALLBACK HANDLERS ====================

  async handleCallback(ctx: Context, data: string): Promise<boolean> {
    const telegramId = ctx.from!.id;

    // Account type selection for hybrid — then ask for email
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

    // Server selection buttons
    if (data.startsWith('tc_server_')) {
      const session = userSessions.get(telegramId);
      if (!session) return true;
      const server = data.replace('tc_server_', '');
      session.data.mt5_server = server;
      await ctx.answerCbQuery();
      // Move to investor password step
      session.step = 'tc_enter_investor_password';
      await ctx.reply(
        '🔑 Enter your <b>Investor (Read-Only) Password</b>\n\n' +
        'This is the password that allows view-only access to your MT5 account.\n' +
        '⚠️ <i>NOT your master/trading password.</i>\n\n' +
        (config.investorPasswordGuideLink ? `📋 <a href="${config.investorPasswordGuideLink}">How to get your Investor Password</a>\n\n` : '') +
        'Send your investor password:',
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
      );
      return true;
    }

    // "Type server manually" button
    if (data === 'tc_server_manual') {
      const session = userSessions.get(telegramId);
      if (!session) return true;
      session.step = 'tc_enter_server_manual';
      await ctx.answerCbQuery();
      const example = session.data.account_type === 'demo' ? 'Exness-MT5Trial9' : 'Exness-MT5Real9';
      await ctx.reply(`Type your <b>MT5 server name</b> manually:\nExample: <code>${example}</code>`, { parse_mode: 'HTML' });
      return true;
    }

    // Server confirmation (fuzzy match)
    if (data === 'tc_server_confirm_yes') {
      const session = userSessions.get(telegramId);
      if (!session) return true;
      session.data.mt5_server = session.data.pending_server;
      session.step = 'tc_enter_investor_password';
      await ctx.answerCbQuery();
      await ctx.reply(
        '🔑 Enter your <b>Investor (Read-Only) Password</b>\n\n' +
        'This allows view-only access to your MT5 account.\n⚠️ <i>NOT your master/trading password.</i>\n\n' +
        (config.investorPasswordGuideLink ? `📋 <a href="${config.investorPasswordGuideLink}">How to get Investor Password</a>\n\n` : '') +
        'Send your investor password:',
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
      );
      return true;
    }
    if (data === 'tc_server_confirm_no') {
      const session = userSessions.get(telegramId);
      if (!session) return true;
      session.step = 'tc_enter_server_manual';
      await ctx.answerCbQuery();
      const example = session.data.account_type === 'demo' ? 'Exness-MT5Trial9' : 'Exness-MT5Real21';
      await ctx.reply(`Type your <b>MT5 server name</b> again:\nExample: <code>${example}</code>`, { parse_mode: 'HTML' });
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
      userSessions.set(telegramId, { step: 'tc_change_acct_number', data: { challenge_id: challengeId, registration_id: reg.id, account_type: reg.account_type } });
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
        `⚠️ <b>Are you sure you want to switch category?</b>\n\nYour current registration will be deleted and you will need to register again.`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Yes, Switch', `tc_switch_confirm_${challengeId}`)], [Markup.button.callback('❌ Cancel', `tc_switch_cancel`)]]) }
      );
      return true;
    }

    if (data.startsWith('tc_switch_confirm_')) {
      const challengeId = parseInt(data.replace('tc_switch_confirm_', ''));
      const reg = await tradingChallengeService.getRegistration(challengeId, telegramId);
      if (reg) { await tradingChallengeService.deleteRegistration(reg.id); await tradingChallengeService.updateDailyStat(challengeId, 'category_switches'); }
      await ctx.answerCbQuery();
      await this.startRegistration(ctx, challengeId);
      return true;
    }

    if (data === 'tc_switch_cancel') { await ctx.answerCbQuery('Cancelled'); return true; }

    // Late switch confirm
    if (data.startsWith('tc_late_switch_confirm_')) {
      const challengeId = parseInt(data.replace('tc_late_switch_confirm_', ''));
      const { tradingAdminHandler } = require('./tradingAdminHandler');
      if (!tradingAdminHandler.isLateChangeWindowOpen(challengeId)) { await ctx.answerCbQuery('Window expired'); await ctx.reply('❌ <b>This window has expired.</b>', { parse_mode: 'HTML' }); return true; }
      const reg = await tradingChallengeService.getRegistration(challengeId, telegramId);
      if (reg) { await tradingChallengeService.deleteRegistration(reg.id); }
      await ctx.answerCbQuery();
      userSessions.set(telegramId, { step: 'tc_enter_email', data: { challenge_id: challengeId, account_type: 'real' } });
      await ctx.reply('📧 Please send your <b>Exness email address:</b>', { parse_mode: 'HTML' });
      return true;
    }

    // Retry email
    if (data.startsWith('tc_retry_email_')) {
      const challengeId = parseInt(data.replace('tc_retry_email_', ''));
      const session = userSessions.get(telegramId);
      if (session) { session.step = 'tc_enter_email'; session.data.retry_count = 0; }
      else {
        const challenge = await tradingChallengeService.getChallengeById(challengeId);
        const accountType = challenge?.type === 'real' ? 'real' : 'demo';
        userSessions.set(telegramId, { step: 'tc_enter_email', data: { challenge_id: challengeId, account_type: accountType } });
      }
      await ctx.answerCbQuery();
      await ctx.reply('📧 Please send your <b>Exness email address:</b>', { parse_mode: 'HTML' });
      return true;
    }

    // New real account
    if (data.startsWith('tc_new_real_acct_')) {
      const session = userSessions.get(telegramId);
      if (session) { session.step = 'tc_enter_account_number'; }
      await ctx.answerCbQuery();
      await ctx.reply('Send your new <b>MT5 Real Account Number:</b>\n⚠️ <i>Must be an MT5 trading account.</i>', { parse_mode: 'HTML' });
      return true;
    }

    // Try again (API retry)
    if (data.startsWith('tc_try_again_')) {
      const session = userSessions.get(telegramId);
      if (session && session.data.email) { session.step = 'tc_verifying_email'; await ctx.answerCbQuery(); await this.verifyEmail(ctx, telegramId); }
      return true;
    }

    // Submission override
    if (data.startsWith('tc_submit_override_yes_')) {
      const challengeId = parseInt(data.replace('tc_submit_override_yes_', ''));
      const session = userSessions.get(telegramId);
      if (session) { session.data.is_override = true; session.step = 'tc_submit_email'; }
      else { userSessions.set(telegramId, { step: 'tc_submit_email', data: { challenge_id: challengeId, is_override: true } }); }
      await ctx.answerCbQuery();
      await ctx.reply('📧 Please enter your <b>Exness email</b> to verify your identity:', { parse_mode: 'HTML' });
      return true;
    }
    if (data === 'tc_submit_override_no') { userSessions.delete(telegramId); await ctx.answerCbQuery(); await ctx.reply('✅ Your previous submission has been kept.'); return true; }

    // Manual review approve/reject
    if (data.startsWith('tc_mr_approve_')) {
      const userId = parseInt(data.replace('tc_mr_approve_', ''));
      const review = pendingManualReviews.get(userId);
      if (!review) { await ctx.answerCbQuery('Review data expired. Use /manualverify instead.'); return true; }
      try {
        await tradingChallengeService.registerUser(review);
        const statField = review.account_type === 'demo' ? 'demo_registrations' : 'real_registrations';
        await tradingChallengeService.updateDailyStat(review.challenge_id, 'new_registrations');
        await tradingChallengeService.updateDailyStat(review.challenge_id, statField);
        pendingManualReviews.delete(userId);
        await ctx.answerCbQuery('Approved!');
        await ctx.reply(`✅ <b>Approved!</b> @${review.username || 'user'} has been registered.`, { parse_mode: 'HTML' });
        const challenge = await tradingChallengeService.getChallengeById(review.challenge_id);
        const acctLabel = review.account_type === 'demo' ? 'Demo' : 'Real';
        try {
          await ctx.telegram.sendMessage(userId, `✅ <b>Registration Approved!</b>\n\nYou have been registered for <b>${challenge?.title || 'the challenge'}</b>.\n\n📋 <b>Your Registration:</b>\n📧 <b>Email:</b> ${review.email}\n🏦 <b>${acctLabel} Account:</b> ${review.account_number}\n🖥️ <b>Server:</b> ${review.mt5_server || 'N/A'}\n📊 <b>Type:</b> ${acctLabel}\n\n⚠️ <i>Please read the rules before starting!</i>`, { parse_mode: 'HTML' });
        } catch (e) { await ctx.reply('⚠️ Registered but could not notify user.'); }
      } catch (e: any) {
        if (e.code === '23505') { await ctx.reply('⚠️ User is already registered.'); }
        else { await ctx.reply('❌ Error registering user.'); }
        pendingManualReviews.delete(userId);
      }
      return true;
    }
    if (data.startsWith('tc_mr_reject_')) {
      const userId = parseInt(data.replace('tc_mr_reject_', ''));
      pendingManualReviews.delete(userId);
      await ctx.answerCbQuery('Rejected');
      await ctx.reply(`❌ <b>Rejected.</b> User has been notified.`, { parse_mode: 'HTML' });
      try { await ctx.telegram.sendMessage(userId, `❌ <b>Registration Rejected</b>\n\nYour manual verification request was not approved.\n\n<i>Contact @birrFXadmin if you believe this is an error.</i>`, { parse_mode: 'HTML' }); } catch (e) {}
      return true;
    }

    // Submit email retry
    if (data.startsWith('tc_submit_retry_email_')) {
      const challengeId = parseInt(data.replace('tc_submit_retry_email_', ''));
      const session = userSessions.get(telegramId);
      if (session) { session.step = 'tc_submit_email'; }
      else { const ch = await tradingChallengeService.getChallengeById(challengeId); userSessions.set(telegramId, { step: 'tc_submit_email', data: { challenge_id: challengeId, target_balance: ch?.target_balance || 0 } }); }
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
      // === NICKNAME STEP (after VPS verification) ===
      case 'tc_enter_nickname': {
        const nickname = text.trim();
        // Validate: 3-20 chars, alphanumeric + underscore
        if (nickname.length < 3 || nickname.length > 20) {
          await ctx.reply('❌ Nickname must be 3-20 characters. Try again:');
          return;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(nickname)) {
          await ctx.reply('❌ Only letters, numbers, and underscores allowed. Try again:');
          return;
        }
        // Check brand impersonation
        const { isBlockedNickname } = require('../utils/helpers');
        if (isBlockedNickname(nickname)) {
          await ctx.reply('❌ You cannot use that nickname — it\'s too similar to our brand. Please choose a different nickname:');
          return;
        }
        // Check uniqueness
        const taken = await tradingChallengeService.isNicknameTaken(session.data.challenge_id, nickname);
        if (taken) {
          await ctx.reply(`❌ <b>"${nickname}"</b> is already taken. Choose a different nickname:`, { parse_mode: 'HTML' });
          return;
        }
        session.data.nickname = nickname;
        // Nickname collected — now complete registration
        await this.completeRegistration(ctx, telegramId);
        break;
      }

      case 'tc_enter_email': {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(text.trim())) { await ctx.reply('❌ Invalid email format. Please send a valid email address.'); return; }
        session.data.email = text.trim().toLowerCase();
        session.data.retry_count = 0;
        const existing = await tradingChallengeService.getRegistrationByEmail(session.data.challenge_id, session.data.email);
        if (existing) {
          await ctx.reply('⚠️ <b>This email is already registered for this challenge.</b>\n\nIf you have another email, submit it below.\n<i>Contact @birrFXadmin if this is an error.</i>',
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📧 Submit Another Email', `tc_retry_email_${session.data.challenge_id}`)]]) });
          return;
        }
        session.step = 'tc_verifying_email';
        await ctx.reply('⏳ <b>Verifying your account...</b>', { parse_mode: 'HTML' });
        await this.verifyEmail(ctx, telegramId);
        break;
      }

      case 'tc_enter_account_number': {
        const acctNum = text.trim();
        if (!/^\d+$/.test(acctNum)) { await ctx.reply('❌ Account number must be numeric. Try again:'); return; }
        session.data.account_number = acctNum;

        // For real accounts: verify allocation BEFORE asking for server/password
        if (session.data.account_type === 'real') {
          session.step = 'tc_verifying_real_acct_early';
          await ctx.reply('⏳ <b>Verifying account allocation...</b>', { parse_mode: 'HTML' });
          await this.verifyRealAccountEarly(ctx, telegramId);
        } else {
          // Demo accounts skip allocation check — go straight to server
          await this.showServerButtons(ctx, telegramId);
        }
        break;
      }

      // === SERVER TYPED MANUALLY (fuzzy match with confirmation) ===
      case 'tc_enter_server_manual': {
        const input = text.trim();
        const matched = fuzzyMatchServer(input, session.data.account_type);
        if (matched) {
          if (matched.toLowerCase() === input.toLowerCase()) {
            // Exact match — proceed directly
            session.data.mt5_server = matched;
            session.step = 'tc_enter_investor_password';
            await ctx.reply(
              '🔑 Enter your <b>Investor (Read-Only) Password</b>\n\n' +
              'This allows view-only access to your MT5 account.\n⚠️ <i>NOT your master/trading password.</i>\n\n' +
              (config.investorPasswordGuideLink ? `📋 <a href="${config.investorPasswordGuideLink}">How to get Investor Password</a>\n\n` : '') +
              'Send your investor password:',
              { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
            );
          } else {
            // Fuzzy match — ask for confirmation
            session.data.pending_server = matched;
            session.step = 'tc_confirm_server';
            await ctx.reply(
              `Is your server <b>${matched}</b>?`,
              { parse_mode: 'HTML', ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ Yes', `tc_server_confirm_yes`)],
                [Markup.button.callback('❌ No, let me type again', `tc_server_confirm_no`)],
              ]) }
            );
          }
        } else {
          await ctx.reply(
            `❌ Could not match "<b>${input}</b>" to a known server.\n\nPlease select from the buttons or type the exact server name:`,
            { parse_mode: 'HTML' }
          );
          await this.showServerButtons(ctx, telegramId);
        }
        break;
      }

      // === INVESTOR PASSWORD (NEW) ===
      case 'tc_enter_investor_password': {
        const password = text.trim();
        if (password.length < 3) { await ctx.reply('❌ Password seems too short. Please enter your investor password:'); return; }
        session.data.investor_password = password;
        session.step = 'tc_confirm_investor_password';
        await ctx.reply('🔑 Enter the investor password <b>again</b> to confirm:', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_confirm_investor_password': {
        if (text.trim() !== session.data.investor_password) {
          session.step = 'tc_enter_investor_password';
          await ctx.reply('❌ <b>Passwords don\'t match.</b> Please enter your investor password again:', { parse_mode: 'HTML' });
          return;
        }
        // VPS Verification
        session.step = 'tc_verifying_vps';
        await ctx.reply('⏳ <b>Verifying MT5 connection...</b>\n<i>This may take up to 30 seconds.</i>', { parse_mode: 'HTML' });
        await this.verifyVpsConnection(ctx, telegramId);
        break;
      }

      // === CHANGE ACCOUNT FLOW ===
      case 'tc_change_acct_number': {
        session.data.new_account_number = text.trim();
        session.step = 'tc_change_acct_server';
        const example = session.data.account_type === 'demo' ? 'Exness-MT5Trial9' : 'Exness-MT5Real9';
        await ctx.reply(`Send your <b>MT5 Trading Server:</b>\nExample: <code>${example}</code>`, { parse_mode: 'HTML' });
        break;
      }

      case 'tc_change_acct_server': {
        const newServer = text.trim();
        if (session.data.account_type === 'real') {
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
        const example = session.data.account_type === 'demo' ? 'Exness-MT5Trial9' : 'Exness-MT5Real9';
        await ctx.reply(`Please send your <b>MT5 Trading Server:</b>\nExample: <code>${example}</code>`, { parse_mode: 'HTML' });
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
          await ctx.reply('❌ <b>This email is not registered for this challenge.</b>\n\nPlease check your email and try again.',
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📧 Submit Email Again', `tc_submit_retry_email_${session.data.challenge_id}`)]]) });
          return;
        }
        if (String(reg.user_id) !== String(telegramId)) {
          await ctx.reply('❌ <b>This email is registered under a different account.</b>\n\nUse the Telegram account you registered with.',
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📧 Submit Email Again', `tc_submit_retry_email_${session.data.challenge_id}`)]]) });
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
        if (isNaN(balance) || balance <= 0) { await ctx.reply('❌ Please enter a valid number.'); return; }
        if (balance < session.data.target_balance) {
          userSessions.delete(telegramId);
          await ctx.reply(`❌ The target is <b>$${session.data.target_balance}</b>. Your balance of <b>$${balance.toFixed(2)}</b> has not reached the target.\n\n<i>Better luck next time!</i> 💪`, { parse_mode: 'HTML' });
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
        await ctx.reply('🔑 Enter the password <b>again</b> to confirm:', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_submit_confirm_password': {
        if (text.trim() !== session.data.investor_password) {
          session.step = 'tc_submit_password';
          await ctx.reply('❌ <b>Passwords don\'t match.</b> Enter your Investor password again:', { parse_mode: 'HTML' });
          return;
        }
        await this.saveSubmission(ctx, telegramId);
        break;
      }

      // === PASSWORD UPDATE (from VPS pull failure) ===
      case 'tc_update_password': {
        const newPassword = text.trim();
        if (newPassword.length < 3) { await ctx.reply('❌ Password seems too short. Please enter your new investor password:'); return; }
        // Verify connection with new password
        await ctx.reply('⏳ <b>Verifying new password...</b>', { parse_mode: 'HTML' });
        const verifyResult = await vpsService.verifyConnection(session.data.account_number, session.data.mt5_server, newPassword);
        if (verifyResult.success) {
          // Update password in database and reset pull status
          await db.query(
            `UPDATE trading_registrations SET investor_password = $1, pull_status = 'success', pull_error = NULL, connection_verified = true, connection_verified_at = NOW() WHERE id = $2`,
            [newPassword, session.data.registration_id]
          );
          userSessions.delete(telegramId);
          await ctx.reply('✅ <b>Password updated successfully!</b>\n\nYour account is now accessible again. Trade data will be pulled on the next cycle.\n\n⚠️ <b>Remember:</b> Do NOT change your investor password again until the challenge ends.', { parse_mode: 'HTML' });
        } else if (verifyResult.status === 'invalid_credentials') {
          await ctx.reply('❌ <b>Connection failed</b> — the password you entered is incorrect.\n\nPlease enter the correct <b>Investor (Read-Only) Password:</b>', { parse_mode: 'HTML' });
        } else {
          // API error — save anyway and let next pull cycle verify
          await db.query(
            `UPDATE trading_registrations SET investor_password = $1, pull_status = 'pending_verify', pull_error = NULL WHERE id = $2`,
            [newPassword, session.data.registration_id]
          );
          userSessions.delete(telegramId);
          await ctx.reply('⚠️ <b>Password saved</b> but we couldn\'t verify the connection right now.\n\nWe\'ll try again on the next pull cycle. If there\'s still an issue, we\'ll contact you.', { parse_mode: 'HTML' });
        }
        break;
      }

      // Resubmission steps
      case 'tc_resubmit_account': {
        const acctNum = text.trim();
        if (!/^\d+$/.test(acctNum)) { await ctx.reply('❌ Only numbers accepted. Enter your MT5 account number:'); return; }
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
        if (isNaN(balance) || balance <= 0) { await ctx.reply('❌ Please enter a valid number.'); return; }
        try {
          const { evaluationService } = require('../services/evaluationService');
          await evaluationService.updateSubmissionResubmit(session.data.submission_id, {
            investor_password: session.data.investor_password,
            final_balance: balance,
            original_account_number: session.data.original_account_number,
            new_account_number: session.data.new_account_number,
            mt5_server: session.data.mt5_server,
          });
          await ctx.reply('✅ <b>Account details updated!</b>\n\n🏦 Account: <b>' + session.data.new_account_number + '</b>\n🖥️ Server: <b>' + session.data.mt5_server + '</b>\n💰 Balance: <b>$' + balance.toFixed(2) + '</b>\n\n<i>Your account will be re-evaluated.</i>', { parse_mode: 'HTML' });
          try { await ctx.telegram.sendMessage(config.adminUserId, '🔄 <b>Resubmission received</b>\n\n👤 @' + (ctx.from!.username || 'unknown') + '\n🏦 Account: ' + session.data.new_account_number + '\n🖥️ Server: ' + session.data.mt5_server + '\n💰 Balance: $' + balance.toFixed(2), { parse_mode: 'HTML' }); } catch (e) {}
        } catch (error) { console.error('Error saving resubmission:', error); await ctx.reply('❌ Error saving your details. Please try again.'); }
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
        guideText = `\n\n📋 <a href="${config.investorPasswordGuideLink}">How to Get Investor Password</a>`;
      }
      await ctx.reply(`🔑 Enter your Investor (Read-Only) password:\nThis allows view-only access to your trading account.${guideText}`, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    }
  }

  // ==================== SERVER BUTTONS ====================

  private async showServerButtons(ctx: Context, telegramId: number) {
    const session = userSessions.get(telegramId);
    if (!session) return;

    const servers = session.data.account_type === 'demo' ? MT5_SERVERS.demo : MT5_SERVERS.real;
    session.step = 'tc_select_server';

    // Build buttons in rows of 2
    const buttons: any[][] = [];
    for (let i = 0; i < servers.length; i += 2) {
      const row: any[] = [Markup.button.callback(servers[i].replace('Exness-', ''), `tc_server_${servers[i]}`)];
      if (i + 1 < servers.length) {
        row.push(Markup.button.callback(servers[i + 1].replace('Exness-', ''), `tc_server_${servers[i + 1]}`));
      }
      buttons.push(row);
    }
    // Add manual entry option
    buttons.push([Markup.button.callback('✍️ Type Server Manually', 'tc_server_manual')]);

    await ctx.reply(
      `🖥️ Select your <b>MT5 Trading Server:</b>`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
    );
  }

  // ==================== VPS VERIFICATION (NEW) ====================

  private async verifyVpsConnection(ctx: Context, telegramId: number) {
    const session = userSessions.get(telegramId);
    if (!session) return;

    const { account_number, mt5_server, investor_password, account_type } = session.data;

    const result = await vpsService.verifyConnection(account_number, mt5_server, investor_password);

    if (result.success) {
      // Get challenge starting balance and target
      const challenge = await tradingChallengeService.getChallengeById(session.data.challenge_id);
      const startingBalance = Number(challenge?.starting_balance || 30);
      const targetBalance = Number(challenge?.target_balance || 60);
      const vpsBalance = result.balance || 0;
      const vpsCurrency = (result.currency || '').toUpperCase();
      const vpsAccountSubtype = result.account_subtype || 'unknown';

      // For cent accounts: balance is shown in cents (×100), convert for comparison
      const { evaluationEngine: wpEngine } = require('../services/wpEvaluationEngine');
      const rules = await wpEngine.loadRules(session.data.challenge_id);
      const onlyCent = rules?.only_cent_account || false;
      const challengeInfo = await tradingChallengeService.getChallengeById(session.data.challenge_id);
      const challengeType = challengeInfo?.type || 'real';

      // Detect cent account by currency (USC = US Cent)
      let isCentAccount = false;
      if (vpsCurrency === 'USC' || vpsCurrency === 'USCENT') {
        isCentAccount = true;
      }

      session.data.is_cent = isCentAccount;
      session.data.account_subtype = vpsAccountSubtype;

      // === ACCOUNT SUBTYPE CHECK (per spec) ===
      // For non-cent accounts, reject Pro/Raw/Zero — only Standard allowed
      if (!isCentAccount && account_type !== 'demo') {
        // Real standard accounts must be "standard" subtype
        if (vpsAccountSubtype === 'pro' || vpsAccountSubtype === 'raw_spread' || vpsAccountSubtype === 'zero') {
          session.step = 'tc_enter_account_number';
          await ctx.reply(
            '❌ <b>Account Type Not Allowed</b>\n\n' +
            `Your account is a <b>${vpsAccountSubtype === 'pro' ? 'Pro' : vpsAccountSubtype === 'zero' ? 'Zero' : 'Raw Spread'}</b> account. This challenge only accepts <b>Standard</b> or <b>Standard Cent</b> accounts.\n\n` +
            '📋 <b>How to create a Standard Account:</b>\n' +
            '1. Open Exness → My Accounts\n' +
            '2. Create New Account → Choose "Standard" or "Standard Cent"\n' +
            '3. Select MT5 platform\n' +
            '4. Fund the account\n\n' +
            'Once ready, submit your standard account:',
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([
              [Markup.button.callback('📝 Submit Another Account', `tc_new_real_acct_${session.data.challenge_id}`)],
            ]) }
          );
          return;
        }
      }
      // For demo accounts, also check subtype
      if (account_type === 'demo' && vpsAccountSubtype !== 'standard' && vpsAccountSubtype !== 'unknown') {
        session.step = 'tc_enter_account_number';
        await ctx.reply(
          '❌ <b>Account Type Not Allowed</b>\n\n' +
          `Your account is a <b>${vpsAccountSubtype === 'pro' ? 'Pro' : vpsAccountSubtype === 'zero' ? 'Zero' : 'Raw Spread'}</b> account. This challenge only accepts <b>Standard</b> accounts.\n\n` +
          '📋 <b>How to create a Standard Account:</b>\n' +
          '1. Open Exness → My Accounts\n' +
          '2. Create New Account → Choose "Standard"\n' +
          '3. Select MT5 platform\n\n' +
          'Once ready, submit your standard account:',
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([
            [Markup.button.callback('📝 Submit Another Account', `tc_new_real_acct_${session.data.challenge_id}`)],
          ]) }
        );
        return;
      }

      // Determine display and comparison values
      let displayBalance: number;
      let compareBalance: number;

      if (isCentAccount && onlyCent && challengeType === 'real') {
        // Cent-only real: admin entered in cents, VPS in cents — compare directly
        displayBalance = vpsBalance; // show raw cents
        compareBalance = startingBalance; // compare cents to cents
      } else if (isCentAccount && (challengeType === 'hybrid' || !onlyCent)) {
        // Hybrid cent OR voluntary cent in standard challenge: admin entered in $, VPS in cents
        displayBalance = vpsBalance / 100; // convert to $ for display
        compareBalance = startingBalance * 100; // convert $ to cents for comparison
      } else {
        // Standard account — no conversion
        displayBalance = vpsBalance;
        compareBalance = startingBalance;
      }

      // === DEMO ACCOUNT: must be exactly starting balance ===
      if (account_type === 'demo') {
        // For demo cent accounts, compare in cent units
        const expectedBalance = isCentAccount ? (startingBalance * 100) : startingBalance;
        const tolerance = expectedBalance * 0.01; // 1% tolerance for rounding

        if (Math.abs(vpsBalance - expectedBalance) > tolerance) {
          session.step = 'tc_enter_account_number';
          const displayExpected = isCentAccount ? `${startingBalance * 100}¢ ($${startingBalance})` : `$${startingBalance}`;
          const displayActual = isCentAccount ? `${vpsBalance}¢ ($${(vpsBalance/100).toFixed(2)})` : `$${vpsBalance.toFixed(2)}`;
          await ctx.reply(
            `❌ <b>Balance Mismatch</b>\n\n` +
            `Your demo account balance is <b>${displayActual}</b> but the challenge requires exactly <b>${displayExpected}</b>.\n\n` +
            `Please set your balance to <b>${displayExpected}</b> and try again.`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        // Demo balance OK
        session.data.registration_balance = vpsBalance;
        await ctx.reply('✅ <b>MT5 connection verified!</b> Balance: ' + (isCentAccount ? `${vpsBalance}¢` : `$${vpsBalance.toFixed(2)}`) + ' ✓', { parse_mode: 'HTML' });
        await this.askForNickname(ctx, telegramId);
        return;
      }

      // === REAL ACCOUNT: flexible balance rules ===

      // Check cent account requirement — reject standard accounts in cent-only challenges
      if (onlyCent && account_type === 'real' && !isCentAccount) {
        session.step = 'tc_enter_account_number';
        await ctx.reply(
          '❌ <b>Only Cent Accounts Allowed</b>\n\n' +
          'This challenge requires a <b>Cent Account</b> (currency: USC).\n\n' +
          'Your account appears to be a Standard account (currency: USD).\n\n' +
          '📋 <b>How to create a Cent Account:</b>\n' +
          '1. Open Exness → My Accounts\n' +
          '2. Create New Account → Choose "Standard Cent"\n' +
          '3. Select MT5 platform\n' +
          '4. Fund the account\n\n' +
          'Once ready, submit your cent account:',
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([
            [Markup.button.callback('📝 Submit Cent Account', `tc_new_real_acct_${session.data.challenge_id}`)],
          ]) }
        );
        return;
      }

      // Balance checks for real accounts — use pre-computed values
      const balanceDisplay = isCentAccount ? `${vpsBalance}¢` : `$${vpsBalance.toFixed(2)}`;
      const startDisplay = (isCentAccount && onlyCent && challengeType === 'real')
        ? `${startingBalance}¢`
        : isCentAccount
          ? `${startingBalance * 100}¢ ($${startingBalance})`
          : `$${startingBalance}`;

      if (vpsBalance > compareBalance) {
        // Balance exceeds starting balance — reject
        session.step = 'tc_enter_account_number';
        await ctx.reply(
          `❌ <b>Balance Too High</b>\n\n` +
          `Your account balance is <b>${balanceDisplay}</b> which exceeds the starting balance of <b>${startDisplay}</b>.\n\n` +
          `Please withdraw or transfer funds so your balance is at or below <b>${startDisplay}</b>, then try registering again.\n\n` +
          `This ensures fair competition for all participants.`,
          { parse_mode: 'HTML' }
        );
        return;
      } else if (vpsBalance === 0) {
        // Zero balance — accept with warning
        session.data.registration_balance = vpsBalance;
        await ctx.reply(
          `✅ <b>MT5 connection verified!</b>\n\n` +
          `⚠️ Your account balance is <b>$0.00</b>.\n\n` +
          `Please deposit before the challenge starts.`,
          { parse_mode: 'HTML' }
        );
      } else if (vpsBalance < compareBalance) {
        // Below starting balance — accept with info
        session.data.registration_balance = vpsBalance;
        await ctx.reply(
          `✅ <b>MT5 connection verified!</b>\n\n` +
          `ℹ️ Your balance is <b>${balanceDisplay}</b>. The challenge starting balance is <b>${startDisplay}</b>.\n\n` +
          `You can still participate — the target remains the same regardless of your starting point.\n\n` +
          `If you want to deposit more, do it before the challenge starts. After the challenge starts, any additional deposit will result in disqualification.`,
          { parse_mode: 'HTML' }
        );
      } else {
        // Exactly starting balance — perfect
        session.data.registration_balance = vpsBalance;
        await ctx.reply(
          `✅ <b>MT5 connection verified!</b> Balance: <b>${balanceDisplay}</b> ✓\n\nYou're all set!`,
          { parse_mode: 'HTML' }
        );
      }

      // Allocation already verified early — go straight to nickname
      await this.askForNickname(ctx, telegramId);
      return;
    }

    // Handle failures
    switch (result.status) {
      case 'invalid_credentials':
        session.step = 'tc_enter_account_number';
        await ctx.reply(
          '❌ <b>Connection failed — Invalid credentials</b>\n\n' +
          'The investor password or account number/server combination is incorrect.\n\n' +
          'Please double-check:\n' +
          `• Account: <code>${account_number}</code>\n` +
          `• Server: <code>${mt5_server}</code>\n\n` +
          `Send your MT5 ${account_type === 'demo' ? 'Demo' : 'Real'} Account Number:`,
          { parse_mode: 'HTML' }
        );
        break;

      case 'server_not_found':
        await ctx.reply(
          '❌ <b>Server not found</b>\n\n' +
          `The server "<code>${mt5_server}</code>" could not be reached.\n\n` +
          'Please select the correct server:',
          { parse_mode: 'HTML' }
        );
        await this.showServerButtons(ctx, telegramId);
        break;

      case 'timeout':
        // Allow retry or skip
        session.step = 'tc_enter_investor_password';
        await ctx.reply(
          '⚠️ <b>Connection timed out</b>\n\n' +
          'The MT5 server took too long to respond. This can happen during high traffic.\n\n' +
          'Please try entering your investor password again:',
          { parse_mode: 'HTML' }
        );
        break;

      case 'api_error':
      default:
        // VPS API is down — proceed without verification (graceful degradation)
        // Allocation was already verified early, so just go to nickname
        console.log('VPS API error during registration, proceeding without verification:', result.message);
        await this.askForNickname(ctx, telegramId);
        break;
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
          `✅ <b>Email verified!</b>\n\nNow send your <b>MT5 ${acctType} Account Number:</b>\n⚠️ Must be an MT5 trading account.\n<i>Only numeric account numbers accepted.</i>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      if (result.status === 'not_allocated') {
        session.data.allocation_fail_count = (session.data.allocation_fail_count || 0) + 1;
        await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'allocation_failures');
        await tradingChallengeService.logFailedAttempt(session.data.challenge_id, telegramId, ctx.from!.username || null, session.data.email, 'allocation');
        const challengeId = session.data.challenge_id;
        const contactAdmin = session.data.allocation_fail_count >= 2 ? `\n\n<b>Contact @birrFXadmin with a screenshot if you believe this is a mistake.</b>` : '';
        await ctx.reply(
          `⚠️ Your Exness account is not registered under BirrForex.\n\n` +
          `First, make sure you spelled your email correctly.\n\n` +
          `✨ <b>Option 1: Create a New Exness Account</b>\n🔗 ${config.exnessPartnerSignupLink}\n\n` +
          `🔄 <b>Option 2: Change Your Partner to BirrForex</b>\n➡️ Log in → Live Chat → "Change Partner"\n➡️ Paste: ${config.exnessPartnerChangeLink}\n` +
          (config.partnerChangeGuideLink ? `📋 <a href="${config.partnerChangeGuideLink}">Full guide</a>\n` : '') +
          `\nAfter completing, try again:` + contactAdmin,
          { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...Markup.inlineKeyboard([[Markup.button.callback('📧 Submit Email Again', `tc_retry_email_${challengeId}`)]]) }
        );
        return;
      }

      if (result.status === 'kyc_failed') {
        await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'kyc_failures');
        await tradingChallengeService.logFailedAttempt(session.data.challenge_id, telegramId, ctx.from!.username || null, session.data.email, 'kyc');
        const challengeId = session.data.challenge_id;
        await ctx.reply(
          `❌ Your Exness account is not fully verified.\n\nPlease complete KYC:\n➡️ Exness → Settings → Verification\n\nOnce verified, try again:`,
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📧 Submit Email Again', `tc_retry_email_${challengeId}`)]]) }
        );
        return;
      }

      if (result.status === 'balance_failed') {
        userSessions.delete(telegramId);
        const challengeId = session.data.challenge_id;
        await ctx.reply('❌ No positive equity found. Please deposit funds and try again:',
          Markup.inlineKeyboard([[Markup.button.callback('📧 Submit Email Again', `tc_retry_email_${challengeId}`)]]));
        return;
      }

      // API error — retry
      if (attempt < maxRetries) {
        await ctx.reply(attempt === 1 ? '⚠️ System busy. Trying again in 3 seconds...' : '⚠️ Trying one more time...');
        await new Promise(r => setTimeout(r, retryDelay));
      }
    }

    // All retries failed
    const challengeId = session.data.challenge_id;
    session.data.retry_count = (session.data.retry_count || 0) + 1;
    if (session.data.retry_count >= 2) {
      session.step = 'tc_manual_account';
      await ctx.reply(`⚠️ Automatic verification unavailable. We'll verify manually.\n\n📧 Email: ${session.data.email}\n\nPlease send your <b>MT5 account number:</b>`, { parse_mode: 'HTML' });
    } else {
      await ctx.reply('⚠️ System busy. Please try again after 30 minutes.',
        Markup.inlineKeyboard([[Markup.button.callback('🔄 Try Again', `tc_try_again_${challengeId}`)]]));
    }
  }

  private async verifyRealAccount(ctx: Context, telegramId: number) {
    const session = userSessions.get(telegramId);
    if (!session) return;

    const result = await exnessService.verifyRealAccount(session.data.account_number);
    const challengeId = session.data.challenge_id;

    if (result.status === 'allocated_mt5') {
      if (result.data?.client_uid && session.data.client_uid && result.data.client_uid !== session.data.client_uid) {
        session.step = 'tc_enter_account_number';
        await ctx.reply('⚠️ <b>This account does not belong to the email you registered with.</b>\n\nSend your correct MT5 Real Account Number:',
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📝 Submit New Real Account', `tc_new_real_acct_${challengeId}`)]]) });
        return;
      }
      await this.askForNickname(ctx, telegramId);
      return;
    }

    if (result.status === 'allocated_not_mt5') {
      session.step = 'tc_enter_account_number';
      await ctx.reply('⚠️ <b>This account is not MT5.</b> Only MT5 accounts allowed.\nCreate a new MT5 Real account and try again.',
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📝 Submit New Real Account', `tc_new_real_acct_${challengeId}`)]]) });
      return;
    }

    if (result.status === 'not_allocated') {
      session.step = 'tc_enter_account_number';
      session.data.real_acct_retry = (session.data.real_acct_retry || 0) + 1;
      await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'real_acct_failures');
      await tradingChallengeService.logFailedAttempt(session.data.challenge_id, telegramId, ctx.from!.username || null, session.data.email, 'real_acct');
      const msg = session.data.real_acct_retry >= 2
        ? '⚠️ <b>Account not yet under BirrForex.</b>\nIt may take a few minutes. Come back after 15 minutes.'
        : '⚠️ <b>This real account is not under BirrForex.</b>\nCreate a new Real Account within your Exness and transfer funds there.';
      await ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📝 Submit New Real Account', `tc_new_real_acct_${challengeId}`)]]) });
      return;
    }

    await ctx.reply('⚠️ Could not verify account. Please try again later.');
  }

  /**
   * Early real account allocation check — runs BEFORE server/password.
   * On success → show server buttons. On failure → ask for new account.
   */
  private async verifyRealAccountEarly(ctx: Context, telegramId: number) {
    const session = userSessions.get(telegramId);
    if (!session) return;

    const result = await exnessService.verifyRealAccount(session.data.account_number);
    const challengeId = session.data.challenge_id;

    if (result.status === 'allocated_mt5') {
      if (result.data?.client_uid && session.data.client_uid && result.data.client_uid !== session.data.client_uid) {
        session.step = 'tc_enter_account_number';
        await ctx.reply('⚠️ <b>This account does not belong to the email you registered with.</b>\n\nSend your correct MT5 Real Account Number:',
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📝 Submit New Real Account', `tc_new_real_acct_${challengeId}`)]]) });
        return;
      }
      // Allocation OK — proceed to server selection
      await this.showServerButtons(ctx, telegramId);
      return;
    }

    if (result.status === 'allocated_not_mt5') {
      session.step = 'tc_enter_account_number';
      await ctx.reply('⚠️ <b>This account is not MT5.</b> Only MT5 accounts allowed.\nCreate a new MT5 Real account and try again.',
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📝 Submit New Real Account', `tc_new_real_acct_${challengeId}`)]]) });
      return;
    }

    if (result.status === 'not_allocated') {
      session.step = 'tc_enter_account_number';
      session.data.real_acct_retry = (session.data.real_acct_retry || 0) + 1;
      await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'real_acct_failures');
      await tradingChallengeService.logFailedAttempt(session.data.challenge_id, telegramId, ctx.from!.username || null, session.data.email, 'real_acct');
      const msg = session.data.real_acct_retry >= 2
        ? '⚠️ <b>Account not yet under BirrForex.</b>\nIt may take a few minutes. Come back after 15 minutes.'
        : '⚠️ <b>This real account is not under BirrForex.</b>\nCreate a new Real Account within your Exness and transfer funds there.';
      await ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📝 Submit New Real Account', `tc_new_real_acct_${challengeId}`)]]) });
      return;
    }

    // API error — proceed to server anyway (graceful degradation)
    await this.showServerButtons(ctx, telegramId);
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
      await ctx.reply('⚠️ <b>Not an MT5 account.</b> Create a new MT5 Real account.\n\nSend your new <b>MT5 Real Account Number:</b>', { parse_mode: 'HTML' });
      return;
    }
    if (result.status === 'not_allocated') {
      session.step = 'tc_change_acct_number';
      await ctx.reply('⚠️ <b>Account not yet under BirrForex.</b> Come back after 15 minutes.\n\nSend your new <b>MT5 Real Account Number:</b>', { parse_mode: 'HTML' });
      return;
    }
    await ctx.reply('⚠️ Could not verify account. Please try again later.');
    userSessions.delete(telegramId);
  }

  // ==================== ASK FOR NICKNAME (after all verifications pass) ====================

  private async askForNickname(ctx: Context, telegramId: number) {
    const session = userSessions.get(telegramId);
    if (!session) return;

    session.step = 'tc_enter_nickname';
    await ctx.reply(
      '🏷️ Almost done! Choose a <b>Challenge Nickname</b>\n\n' +
      'This will be displayed on the leaderboard instead of your real name.\n' +
      '• 3-20 characters\n' +
      '• Letters, numbers, underscores only\n' +
      '• Must be unique\n\n' +
      'Send your nickname:',
      { parse_mode: 'HTML' }
    );
  }

  // ==================== COMPLETE REGISTRATION ====================

  private async completeRegistration(ctx: Context, telegramId: number) {
    const session = userSessions.get(telegramId);
    if (!session) return;

    try {
      const challenge = await tradingChallengeService.getChallengeById(session.data.challenge_id);
      if (!challenge) { await ctx.reply('❌ Challenge not found.'); userSessions.delete(telegramId); return; }

      const reg = await tradingChallengeService.registerUser({
        challenge_id: session.data.challenge_id,
        user_id: telegramId,
        username: ctx.from!.username || null,
        nickname: session.data.nickname || null,
        account_type: session.data.account_type,
        email: session.data.email,
        account_number: session.data.account_number,
        mt5_server: session.data.mt5_server || null,
        client_uid: session.data.client_uid || null,
      });

      // Save investor password, cent flag, account_subtype, and registration balance
      if (session.data.investor_password) {
        await db.query('UPDATE trading_registrations SET investor_password = $1, connection_verified = true, connection_verified_at = NOW(), is_cent = $3, account_subtype = $4, registration_balance = $5, last_known_balance = $5 WHERE id = $2',
          [session.data.investor_password, reg.id, session.data.is_cent || false, session.data.account_subtype || 'standard', session.data.registration_balance || null]);
      }

      // Remove from failed attempts if they were there
      await tradingChallengeService.markConverted(session.data.challenge_id, telegramId);

      // Track daily stats
      const statField = session.data.account_type === 'demo' ? 'demo_registrations' : 'real_registrations';
      await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'new_registrations');
      await tradingChallengeService.updateDailyStat(session.data.challenge_id, statField);

      // Track recoveries
      if (session.data.allocation_fail_count > 0) await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'allocation_recoveries');
      if (session.data.kyc_fail_count > 0) await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'kyc_recoveries');
      if (session.data.real_acct_retry > 0) await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'real_acct_recoveries');

      userSessions.delete(telegramId);
      saveSessionsToDisk();

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
        `🏷️ <b>Nickname:</b> ${session.data.nickname || 'N/A'}\n` +
        `📧 <b>Email:</b> ${session.data.email}\n` +
        `🏦 <b>${acctLabel} Account:</b> ${session.data.account_number}\n` +
        `🖥️ <b>Server:</b> ${session.data.mt5_server || 'N/A'}\n` +
        `📊 <b>Type:</b> ${acctLabel}\n` +
        `🔑 <b>Investor Password:</b> ✅ Saved\n\n` +
        `⏳ <b>Challenge starts:</b> ${startStr}\n\n` +
        `⚠️ <b>IMPORTANT:</b> Do NOT change your investor password until the challenge ends and winners are announced. We pull your trade data automatically — if we can't access your account, you risk disqualification.\n\n` +
        `⚠️ <i>Please read the rules before starting the challenge!</i>\n\n` +
        `You can change your account number before the challenge starts.\n` +
        switchText + linksText,
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...Markup.inlineKeyboard(buttons) }
      );
    } catch (error: any) {
      if (error.code === '23505') {
        // Check if it's the nickname constraint
        if (error.constraint && error.constraint.includes('nickname')) {
          const session2 = userSessions.get(telegramId);
          if (session2) {
            session2.step = 'tc_enter_nickname';
            await ctx.reply(`❌ <b>Nickname "${session2.data.nickname}" was just taken!</b> Choose a different one:`, { parse_mode: 'HTML' });
            return;
          }
        }
        await ctx.reply('⚠️ You are already registered for this challenge.');
      } else {
        console.error('Registration error:', error);
        await ctx.reply('❌ Error completing registration. Please try again.');
      }
      userSessions.delete(telegramId);
    }
  }

  // ==================== SAVE SUBMISSION ====================

  private async saveSubmission(ctx: Context, telegramId: number) {
    const session = userSessions.get(telegramId);
    if (!session) return;

    try {
      let screenshotLink: string | null = null;
      let screenshotMessageId: number | null = null;
      const isOverride = session.data.is_override === true;

      if (isOverride && config.submissionChannelId) {
        try {
          const oldSub = await tradingChallengeService.getSubmissionByRegistration(session.data.registration_id);
          if (oldSub && oldSub.screenshot_message_id) {
            await ctx.telegram.deleteMessage(config.submissionChannelId, oldSub.screenshot_message_id);
          }
        } catch (e) {}
      }

      if (session.data.screenshot_file_id && config.submissionChannelId) {
        try {
          const acctLabel = session.data.account_type === 'demo' ? 'Demo' : 'Real';
          const overrideTag = isOverride ? ' (UPDATED)' : '';
          const caption = `<b>📋 Submission${overrideTag}</b>\n\n👤 @${ctx.from!.username || 'unknown'}\n📧 ${session.data.email}\n🏦 ${acctLabel}: ${session.data.account_number}\n🖥️ Server: ${session.data.mt5_server || 'N/A'}\n💰 Balance: $${session.data.final_balance.toFixed(2)}\n🔑 Password: <code>${session.data.investor_password}</code>`;
          const sent = await ctx.telegram.sendPhoto(config.submissionChannelId, session.data.screenshot_file_id, { caption, parse_mode: 'HTML' });
          const channelIdStr = String(config.submissionChannelId).replace('-100', '');
          screenshotLink = `https://t.me/c/${channelIdStr}/${sent.message_id}`;
          screenshotMessageId = sent.message_id;
        } catch (e) { console.error('Error posting screenshot:', e); }
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
        `📋 <b>Your Submission:</b>\n📧 <b>Email:</b> ${session.data.email}\n🏦 <b>Account:</b> ${session.data.account_number}\n🖥️ <b>Server:</b> ${session.data.mt5_server || 'N/A'}\n📊 <b>Type:</b> ${acctLabel}\n💰 <b>Final Balance:</b> $${session.data.final_balance.toFixed(2)}\n📸 <b>Screenshot:</b> ✅\n🔑 <b>Password:</b> ✅\n\n⏳ Our team will review and announce results.\n<i>Thank you for participating!</i> 🎉`,
        { parse_mode: 'HTML' }
      );
    } catch (error: any) {
      if (error.code === '23505') { await ctx.reply('⚠️ You have already submitted results. Use Submit Results again to override.'); }
      else { console.error('Submission error:', error); await ctx.reply('❌ Error saving submission. Please try again.'); }
      userSessions.delete(telegramId);
    }
  }

  // ==================== PASSWORD UPDATE (from VPS pull failure) ====================

  async startPasswordUpdate(ctx: Context, registrationId: number) {
    const telegramId = ctx.from!.id;

    // Verify this registration belongs to the user
    const result = await db.query(
      'SELECT * FROM trading_registrations WHERE id = $1 AND user_id = $2',
      [registrationId, telegramId]
    );

    if (!result.rows[0]) {
      await ctx.reply('❌ This link is not for your account.');
      return;
    }

    const reg = result.rows[0];

    userSessions.set(telegramId, {
      step: 'tc_update_password',
      data: { registration_id: registrationId, account_number: reg.account_number, mt5_server: reg.mt5_server },
    });

    await ctx.reply(
      `🔑 <b>Update Investor Password</b>\n\n` +
      `Account: <b>${reg.account_number}</b>\nServer: <b>${reg.mt5_server}</b>\n\n` +
      `Please send your new <b>Investor (Read-Only) Password:</b>`,
      { parse_mode: 'HTML' }
    );
  }

  // ==================== MANUAL REVIEW ====================

  private async sendManualReview(ctx: Context, telegramId: number) {
    const session = userSessions.get(telegramId);
    if (!session) return;

    await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'manual_reviews');

    const reviewData = {
      challenge_id: session.data.challenge_id,
      telegram_id: telegramId,
      username: ctx.from!.username || null,
      nickname: session.data.nickname || null,
      account_type: session.data.account_type,
      email: session.data.email,
      account_number: session.data.account_number,
      mt5_server: session.data.mt5_server || null,
      client_uid: session.data.client_uid || null,
    };
    pendingManualReviews.set(telegramId, reviewData);
    userSessions.delete(telegramId);

    await ctx.reply('✅ <b>Submission received!</b>\n\nYour registration is pending manual review.\n<i>You\'ll be notified once approved.</i>', { parse_mode: 'HTML' });

    const acctLabel = session.data.account_type === 'demo' ? 'Demo' : 'Real';
    const adminText = `<b>📋 MANUAL REVIEW REQUIRED</b>\n\n👤 @${ctx.from!.username || 'unknown'} (ID: <code>${telegramId}</code>)\n🏷️ Nickname: ${session.data.nickname || 'N/A'}\n📧 ${session.data.email}\n🏦 ${session.data.account_number}\n🖥️ ${session.data.mt5_server || 'N/A'}\n📊 ${acctLabel}\n\n⚠️ Auto-verification failed`;
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('✅ Approve', `tc_mr_approve_${telegramId}`)], [Markup.button.callback('❌ Reject', `tc_mr_reject_${telegramId}`)]]);

    try {
      if (session.data.screenshot_file_id) {
        await ctx.telegram.sendPhoto(config.adminUserId, session.data.screenshot_file_id, { caption: adminText, parse_mode: 'HTML', ...keyboard });
      } else {
        await ctx.telegram.sendMessage(config.adminUserId, adminText, { parse_mode: 'HTML', ...keyboard });
      }
    } catch (e) { console.error('Error sending manual review to admin:', e); }
  }

  /**
   * On startup: proactively DM users who were mid-registration before restart.
   * Only notifies users whose session is < 24h old.
   */
  async notifyInterruptedUsers(telegram: any) {
    const interrupted = loadInterruptedSessions();
    if (interrupted.size === 0) return;

    console.log(`🔄 TG: Notifying ${interrupted.size} users about interrupted registration...`);

    for (const [telegramId, challengeId] of interrupted) {
      try {
        const botInfo = await telegram.getMe();
        await telegram.sendMessage(
          telegramId,
          `⚠️ <b>System restarted</b> — your registration session was interrupted.\n\nPlease tap the button below to continue:`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.url('🚀 Register Again', `https://t.me/${botInfo.username}?start=tc_register_${challengeId}`)],
            ]),
          }
        );
        await new Promise(r => setTimeout(r, 500)); // Rate limit
      } catch (e) {
        console.log(`⚠️ Could not notify TG user ${telegramId}: ${(e as Error).message}`);
      }
    }

    console.log(`✅ TG: Restart notifications sent to ${interrupted.size} users`);
  }
}

export const tradingRegistrationHandler = new TradingRegistrationHandler();
