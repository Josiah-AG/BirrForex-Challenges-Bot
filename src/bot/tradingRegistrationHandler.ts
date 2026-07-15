import { Context, Markup } from 'telegraf';
import { tradingChallengeService } from '../services/tradingChallengeService';
import { exnessService } from '../services/exnessService';
import { vpsService, MT5_SERVERS, fuzzyMatchServer } from '../services/vpsService';
import { config } from '../config';
import { db } from '../database/db';
import { t, Lang } from '../i18n';
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

  /**
   * Get sessions older than X hours that haven't completed registration (abandoned).
   */
  getAbandonedSessions(olderThanHours: number): Array<{ telegramId: number; challengeId: number; username: string | null; email: string | null }> {
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
    const abandoned: Array<{ telegramId: number; challengeId: number; username: string | null; email: string | null }> = [];
    for (const [telegramId, session] of userSessions.entries()) {
      // Check if session is old enough and has a challenge_id
      if (!session.data?.challenge_id) continue;
      // Use the session creation time approximation from saveSessionsToDisk timestamps
      // Since we don't store creation time, check if the session exists in the persisted file
      // For now, we track all active sessions — the scheduler will only log them once (deduped by DB)
      const user = knownUsers.get(telegramId);
      abandoned.push({
        telegramId,
        challengeId: session.data.challenge_id,
        username: user?.username || null,
        email: session.data.email || null,
      });
    }
    return abandoned;
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

    // === LANGUAGE SELECTION (first step) ===
    userSessions.set(telegramId, { step: 'tc_select_lang', data: { challenge_id: challengeId } });
    saveSessionsToDisk();
    await ctx.reply(
      t('en', 'lang_prompt'),
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('🇬🇧 English', `tc_lang_en_${challengeId}`)],
        [Markup.button.callback('🇪🇹 አማርኛ', `tc_lang_am_${challengeId}`)],
      ]) }
    );
  }

  /** Continue registration after language is selected */
  private async continueRegistrationAfterLang(ctx: Context, telegramId: number, challengeId: number, lang: Lang) {
    const challenge = await tradingChallengeService.getChallengeById(challengeId);
    if (!challenge) { await ctx.reply(t(lang, 'error_challenge_not_found'), { parse_mode: 'HTML' }); return; }

    // Start registration flow
    if (challenge.type === 'hybrid') {
      userSessions.set(telegramId, { step: 'tc_select_type', data: { challenge_id: challengeId, lang } });
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
        t(lang, 'hybrid_title', { title: challenge.title }) + '\n\n' +
        t(lang, 'hybrid_body') + '\n' +
        prizesText +
        '\n' + t(lang, 'hybrid_choose'),
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([
          [Markup.button.callback(t(lang, 'hybrid_demo_btn'), `tc_reg_demo_${challengeId}`)],
          [Markup.button.callback(t(lang, 'hybrid_real_btn'), `tc_reg_real_${challengeId}`)],
        ]) }
      );
    } else {
      const accountType = challenge.type as 'demo' | 'real';
      userSessions.set(telegramId, { step: 'tc_enter_email', data: { challenge_id: challengeId, account_type: accountType, lang } });
      saveSessionsToDisk();
      await ctx.reply(t(lang, 'email_prompt'), { parse_mode: 'HTML' });
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
    // Get user's language preference from their registration
    const langResult = await db.query('SELECT lang FROM trading_registrations WHERE challenge_id = $1 AND user_id = $2', [challengeId, telegramId]);
    const lang: Lang = (langResult.rows[0]?.lang as Lang) || 'en';
    if (challenge.status !== 'submission_open') {
      if (challenge.status === 'reviewing' || challenge.status === 'completed') {
        await ctx.reply(t(lang, 'error_submission_deadline'), { parse_mode: 'HTML' });
      } else {
        await ctx.reply(t(lang, 'error_not_accepting'), { parse_mode: 'HTML' });
      }
      return;
    }
    if (challenge.submission_deadline && new Date() > new Date(challenge.submission_deadline)) {
      await ctx.reply(t(lang, 'error_submission_deadline'), { parse_mode: 'HTML' });
      return;
    }
    const reg = await tradingChallengeService.getRegistration(challengeId, telegramId);
    if (reg) {
      const existingSub = await tradingChallengeService.getSubmissionByRegistration(reg.id);
      if (existingSub) {
        userSessions.set(telegramId, {
          step: 'tc_submit_override_confirm',
          data: { challenge_id: challengeId, target_balance: challenge.target_balance, registration_id: reg.id, challenge_title: challenge.title, is_cent: reg.is_cent || false },
        });
        const balDisplay = reg.is_cent ? `${Number(existingSub.final_balance).toFixed(2)}¢` : `$${Number(existingSub.final_balance).toFixed(2)}`;
        await ctx.reply(
          `⚠️ <b>You have already submitted your results for ${challenge.title}.</b>\n\n` +
          `📋 <b>Previous Submission:</b>\n💰 <b>Balance:</b> ${balDisplay}\n📸 <b>Screenshot:</b> ✅\n🔑 <b>Password:</b> ✅\n\n` +
          `Do you want to <b>override</b> your previous submission?\n<i>Only do this if there was an error in your previous submission.</i>`,
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Yes, Submit Again', `tc_submit_override_yes_${challengeId}`)],
            [Markup.button.callback('❌ No, Keep Previous', `tc_submit_override_no`)],
          ]) }
        );
        return;
      }
    }
    userSessions.set(telegramId, { step: 'tc_submit_email', data: { challenge_id: challengeId, target_balance: challenge.target_balance, lang } });
    await ctx.reply(t(lang, 'submit_email_prompt'), { parse_mode: 'HTML' });
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
      userSessions.set(telegramId, { step: 'tc_submit_override_confirm', data: { challenge_id: challengeId, target_balance: challenge.target_balance, registration_id: reg.id, challenge_title: challenge.title, is_cent: reg.is_cent || false } });
      const balDisplay = reg.is_cent ? `${Number(existingSub.final_balance).toFixed(2)}¢` : `$${Number(existingSub.final_balance).toFixed(2)}`;
      await ctx.reply(`⚠️ <b>You have already submitted your results.</b>\n\n💰 Previous Balance: ${balDisplay}\n\nDo you want to submit again and overwrite?`,
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

    // Language selection callback
    if (data.startsWith('tc_lang_')) {
      const parts = data.split('_');
      const lang = parts[2] as Lang; // 'en' or 'am'
      const challengeId = parseInt(parts[3]);
      await ctx.answerCbQuery();
      const session = userSessions.get(telegramId);
      if (session) {
        session.data.lang = lang;
      }
      await this.continueRegistrationAfterLang(ctx, telegramId, challengeId, lang);
      return true;
    }

    // Account type selection for hybrid — then ask for email
    if (data.startsWith('tc_reg_demo_') || data.startsWith('tc_reg_real_')) {
      const parts = data.split('_');
      const accountType = parts[2] as 'demo' | 'real';
      const challengeId = parseInt(parts[3]);
      const session = userSessions.get(telegramId);
      if (!session) return true;
      session.data.account_type = accountType;
      session.step = 'tc_enter_email';
      const lang: Lang = session.data.lang || 'en';
      await ctx.answerCbQuery();
      await ctx.reply(t(lang, 'email_prompt'), { parse_mode: 'HTML' });
      return true;
    }

    // Server selection buttons
    if (data.startsWith('tc_server_')) {
      const session = userSessions.get(telegramId);
      if (!session) return true;
      const server = data.replace('tc_server_', '');
      // Validate the server is in the known list to prevent crafted callbacks
      const allKnownServers = [...MT5_SERVERS.demo, ...MT5_SERVERS.real];
      if (!allKnownServers.includes(server)) {
        await ctx.answerCbQuery('Invalid server selection.');
        return true;
      }
      // Detect context: change-account flow has registration_id, registration flow does not
      const isChangeAcctFlow = !!session.data.registration_id;
      if (isChangeAcctFlow) {
        session.data.mt5_server = server;
        session.step = 'tc_change_acct_investor_password';
        await ctx.answerCbQuery();
        await ctx.reply(
          `🖥️ Server: <b>${server}</b>\n\n🔑 Enter the <b>Investor (Read-Only) Password</b> for the new account:\n⚠️ <i>NOT your master/trading password.</i>` +
          (config.investorPasswordGuideLink ? `\n\n📋 <a href="${config.investorPasswordGuideLink}">How to get Investor Password</a>` : ''),
          { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
        );
      } else {
        session.data.mt5_server = server;
        session.step = 'tc_enter_investor_password';
        const lang: Lang = session.data.lang || 'en';
        await ctx.answerCbQuery();
        await ctx.reply(
          t(lang, 'password_prompt') +
          (config.investorPasswordGuideLink ? `\n\n📋 <a href="${config.investorPasswordGuideLink}">${lang === 'am' ? 'Investor ፓስዎርድ እንዴት ማግኘት ይቻላል' : 'How to get your Investor Password'}</a>` : ''),
          { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
        );
      }
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
    // Change-account server fuzzy confirm
    if (data === 'tc_chg_srv_confirm_yes') {
      const session = userSessions.get(telegramId);
      if (!session) return true;
      const newServer = session.data.pending_change_server;
      delete session.data.pending_change_server;
      session.data.mt5_server = newServer;
      session.step = 'tc_change_acct_investor_password';
      await ctx.answerCbQuery();
      await ctx.reply(
        `🖥️ Server: <b>${newServer}</b>\n\n🔑 Enter the <b>Investor (Read-Only) Password</b> for the new account:\n⚠️ <i>NOT your master/trading password.</i>` +
        (config.investorPasswordGuideLink ? `\n\n📋 <a href="${config.investorPasswordGuideLink}">How to get Investor Password</a>` : ''),
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
      );
      return true;
    }
    if (data === 'tc_chg_srv_confirm_no') {
      const session = userSessions.get(telegramId);
      if (!session) return true;
      delete session.data.pending_change_server;
      await ctx.answerCbQuery();
      // Show server buttons again (same as registration)
      await this.showServerButtons(ctx, telegramId);
      return true;
    }

    if (data === 'tc_server_confirm_yes') {
      const session = userSessions.get(telegramId);
      if (!session) return true;
      session.data.mt5_server = session.data.pending_server;
      // Detect context: change-account flow vs fresh registration
      session.step = session.data.registration_id ? 'tc_change_acct_investor_password' : 'tc_enter_investor_password';
      const lang: Lang = session.data.lang || 'en';
      await ctx.answerCbQuery();
      await ctx.reply(
        t(lang, 'password_prompt') +
        (config.investorPasswordGuideLink ? `\n\n📋 <a href="${config.investorPasswordGuideLink}">${lang === 'am' ? 'Investor ፓስዎርድ እንዴት ማግኘት ይቻላል' : 'How to get Investor Password'}</a>` : ''),
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
      // Get lang from registration if stored, otherwise default to 'en'
      const langResult = await db.query('SELECT lang FROM trading_registrations WHERE id = $1', [reg.id]);
      const lang: Lang = (langResult.rows[0]?.lang as Lang) || 'en';
      userSessions.set(telegramId, { step: 'tc_change_acct_number', data: { challenge_id: challengeId, registration_id: reg.id, account_type: reg.account_type, lang } });
      await ctx.answerCbQuery();
      const typeLabel = reg.account_type === 'demo' ? 'Demo' : 'Real';
      await ctx.reply(t(lang, 'change_acct_title', { number: reg.account_number, server: reg.mt5_server || 'N/A', type: typeLabel }), { parse_mode: 'HTML' });
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

    // New account (retry after rejection — works for both demo and real)
    if (data.startsWith('tc_new_real_acct_')) {
      const challengeId = parseInt(data.replace('tc_new_real_acct_', ''));
      let session = userSessions.get(telegramId);
      if (!session) {
        // Session was lost (restart) — rebuild minimal session so text input is handled
        const challenge = await tradingChallengeService.getChallengeById(challengeId);
        const accountType = challenge?.type === 'demo' ? 'demo' : challenge?.type === 'real' ? 'real' : 'demo';
        session = { step: 'tc_enter_account_number', data: { challenge_id: challengeId, account_type: accountType } };
        userSessions.set(telegramId, session);
      } else {
        session.step = 'tc_enter_account_number';
      }
      const acctType = session.data.account_type || 'demo';
      const typeLabel = acctType === 'demo' ? 'Demo' : 'Real';
      const lang: Lang = session.data.lang || 'en';
      await ctx.answerCbQuery();
      await ctx.reply(t(lang, 'new_acct_prompt', { type: typeLabel }), { parse_mode: 'HTML' });
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
        const lang: Lang = session.data.lang || 'en';
        // Validate: 3-20 chars, alphanumeric + underscore
        if (nickname.length < 3 || nickname.length > 20) {
          await ctx.reply(t(lang, 'nickname_too_short'));
          return;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(nickname)) {
          await ctx.reply(t(lang, 'nickname_invalid_chars'));
          return;
        }
        // Check brand impersonation
        const { isBlockedNickname } = require('../utils/helpers');
        if (isBlockedNickname(nickname)) {
          await ctx.reply(t(lang, 'nickname_blocked'));
          return;
        }
        // Check uniqueness
        const taken = await tradingChallengeService.isNicknameTaken(session.data.challenge_id, nickname);
        if (taken) {
          await ctx.reply(t(lang, 'nickname_taken', { name: nickname }), { parse_mode: 'HTML' });
          return;
        }
        session.data.nickname = nickname;
        // Nickname collected — now complete registration
        await this.completeRegistration(ctx, telegramId);
        break;
      }

      case 'tc_enter_email': {
        const lang: Lang = session.data.lang || 'en';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(text.trim())) { await ctx.reply(t(lang, 'email_invalid')); return; }
        session.data.email = text.trim().toLowerCase();
        session.data.retry_count = 0;
        const existing = await tradingChallengeService.getRegistrationByEmail(session.data.challenge_id, session.data.email);
        if (existing) {
          await ctx.reply(t(lang, 'email_already_registered'),
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📧 Submit Another Email', `tc_retry_email_${session.data.challenge_id}`)]]) });
          return;
        }
        session.step = 'tc_verifying_email';
        await ctx.reply(t(lang, 'email_verifying'), { parse_mode: 'HTML' });
        await this.verifyEmail(ctx, telegramId);
        break;
      }

      case 'tc_enter_account_number': {
        const acctNum = text.trim();
        const lang: Lang = session.data.lang || 'en';
        if (!/^\d+$/.test(acctNum)) { await ctx.reply(t(lang, 'account_number_invalid')); return; }
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
            const lang: Lang = session.data.lang || 'en';
            await ctx.reply(
              t(lang, 'password_prompt') +
              (config.investorPasswordGuideLink ? `\n\n📋 <a href="${config.investorPasswordGuideLink}">${lang === 'am' ? 'Investor ፓስዎርድ እንዴት ማግኘት ይቻላል' : 'How to get Investor Password'}</a>` : ''),
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
        const lang: Lang = session.data.lang || 'en';
        if (password.length < 3) { await ctx.reply(t(lang, 'password_too_short')); return; }
        session.data.investor_password = password;
        session.step = 'tc_confirm_investor_password';
        await ctx.reply(t(lang, 'password_confirm_prompt'), { parse_mode: 'HTML' });
        break;
      }

      case 'tc_confirm_investor_password': {
        const lang: Lang = session.data.lang || 'en';
        if (text.trim() !== session.data.investor_password) {
          session.step = 'tc_enter_investor_password';
          await ctx.reply(t(lang, 'password_mismatch'), { parse_mode: 'HTML' });
          return;
        }
        // VPS Verification
        session.step = 'tc_verifying_vps';
        await ctx.reply(t(lang, 'vps_verifying'), { parse_mode: 'HTML' });
        await this.verifyVpsConnection(ctx, telegramId);
        break;
      }

      // === CHANGE ACCOUNT FLOW ===
      case 'tc_change_acct_number': {
        const newAcct = text.trim();
        const lang: Lang = session.data.lang || 'en';
        if (!/^\d+$/.test(newAcct)) { await ctx.reply(t(lang, 'change_acct_number_invalid')); return; }
        session.data.new_account_number = newAcct;
        // Show server buttons (same as registration flow)
        await this.showServerButtons(ctx, telegramId);
        break;
      }

      case 'tc_change_acct_server': {
        // Fallback text input for server (if user types instead of using buttons)
        const input = text.trim();
        const matched = fuzzyMatchServer(input, session.data.account_type);
        if (!matched) {
          await ctx.reply(
            `❌ Could not match "<b>${input}</b>" to a known server.\n\nPlease select from the list or type the exact server name:\nExample: <code>${session.data.account_type === 'demo' ? 'Exness-MT5Trial9' : 'Exness-MT5Real21'}</code>`,
            { parse_mode: 'HTML' }
          );
          await this.showServerButtons(ctx, telegramId);
          return;
        }
        if (matched.toLowerCase() !== input.toLowerCase()) {
          session.data.pending_change_server = matched;
          session.step = 'tc_change_acct_server_confirm';
          await ctx.reply(
            `Is your server <b>${matched}</b>?`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Yes', 'tc_chg_srv_confirm_yes')],
              [Markup.button.callback('❌ No, try again', 'tc_chg_srv_confirm_no')],
            ]) }
          );
          return;
        }
        // Exact match — go straight to investor password
        session.data.mt5_server = matched;
        session.step = 'tc_change_acct_investor_password';
        await ctx.reply(
          `🖥️ Server: <b>${matched}</b>\n\n🔑 Enter the <b>Investor (Read-Only) Password</b> for the new account:\n⚠️ <i>NOT your master/trading password.</i>` +
          (config.investorPasswordGuideLink ? `\n\n📋 <a href="${config.investorPasswordGuideLink}">How to get Investor Password</a>` : ''),
          { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
        );
        break;
      }

      case 'tc_change_acct_investor_password': {
        const password = text.trim();
        const lang: Lang = session.data.lang || 'en';
        if (password.length < 3) { await ctx.reply(t(lang, 'change_acct_password_too_short')); return; }
        session.data.new_investor_password = password;
        session.step = 'tc_change_acct_confirm_investor_password';
        await ctx.reply(t(lang, 'change_acct_password_confirm'), { parse_mode: 'HTML' });
        break;
      }

      case 'tc_change_acct_confirm_investor_password': {
        const lang: Lang = session.data.lang || 'en';
        if (text.trim() !== session.data.new_investor_password) {
          session.step = 'tc_change_acct_investor_password';
          await ctx.reply(t(lang, 'change_acct_password_mismatch'), { parse_mode: 'HTML' });
          return;
        }
        session.step = 'tc_verifying_change_real';
        await ctx.reply('⏳ <b>Verifying account connection...</b>\n<i>This may take up to 30 seconds.</i>', { parse_mode: 'HTML' });
        await this.verifyRealAccountChange(ctx, telegramId);
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
        const lang: Lang = session.data.lang || 'en';
        const email = text.trim().toLowerCase();
        const reg = await tradingChallengeService.getRegistrationByEmail(session.data.challenge_id, email);
        if (!reg) {
          await ctx.reply(t(lang, 'submit_email_not_found'),
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📧 Submit Email Again', `tc_submit_retry_email_${session.data.challenge_id}`)]]) });
          return;
        }
        if (String(reg.user_id) !== String(telegramId)) {
          await ctx.reply(t(lang, 'submit_email_wrong_user'),
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📧 Submit Email Again', `tc_submit_retry_email_${session.data.challenge_id}`)]]) });
          return;
        }
        session.data.registration_id = reg.id;
        session.data.email = email;
        session.data.account_type = reg.account_type;
        session.data.account_number = reg.account_number;
        session.data.mt5_server = reg.mt5_server;
        session.data.is_cent = reg.is_cent || false;
        session.step = 'tc_submit_balance';
        await ctx.reply(t(lang, 'submit_email_verified') + '\n\n' + t(lang, 'submit_balance_prompt'), { parse_mode: 'HTML' });
        break;
      }

      case 'tc_submit_balance': {
        const lang: Lang = session.data.lang || 'en';
        const balance = parseFloat(text.trim());
        if (isNaN(balance) || balance <= 0) { await ctx.reply(t(lang, 'submit_balance_invalid')); return; }
        // For cent accounts, target needs to be ×100 since users enter their cent balance
        const effectiveTarget = session.data.is_cent ? session.data.target_balance * 100 : session.data.target_balance;
        if (balance < effectiveTarget) {
          userSessions.delete(telegramId);
          const displayTarget = session.data.is_cent ? `${effectiveTarget}¢` : `$${session.data.target_balance}`;
          const displayBalance = session.data.is_cent ? `${balance.toFixed(2)}¢` : `$${balance.toFixed(2)}`;
          await ctx.reply(t(lang, 'submit_balance_below_target', { target: displayTarget, balance: displayBalance }), { parse_mode: 'HTML' });
          return;
        }
        session.data.final_balance = balance;
        session.step = 'tc_submit_screenshot';
        await ctx.reply(t(lang, 'submit_screenshot_prompt'), { parse_mode: 'HTML' });
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
          // Check disqualified status BEFORE updating — if the 48h auto-DQ rule already
          // fired on this account, fixing the password does NOT auto-reinstate it. Only
          // an admin can reverse a disqualification (confirmed deliberately, dashboard-side).
          const dqCheck = await db.query(`SELECT disqualified FROM trading_registrations WHERE id = $1`, [session.data.registration_id]);
          const wasDisqualified = dqCheck.rows[0]?.disqualified === true;

          // Update password in database and reset pull status. Deliberately leave
          // `disqualified` untouched — see note above.
          await db.query(
            `UPDATE trading_registrations SET investor_password = $1, pull_status = 'success', pull_error = NULL, connection_verified = true, connection_verified_at = NOW() WHERE id = $2`,
            [newPassword, session.data.registration_id]
          );
          userSessions.delete(telegramId);

          if (wasDisqualified) {
            await ctx.reply(
              '✅ <b>Password updated and verified.</b>\n\n' +
              '⚠️ However, this account was <b>disqualified</b> (password was not updated within the 48h window). ' +
              'A working password alone does not automatically reinstate it — please contact @birrFXadmin if you\'d like to request reinstatement.',
              { parse_mode: 'HTML' }
            );
            // No backfill pull/rank update — account stays out of the leaderboard
            // until an admin explicitly reinstates it via the dashboard.
          } else {
            // Fetch lang from registration for translated message
            const langResult = await db.query('SELECT lang FROM trading_registrations WHERE id = $1', [session.data.registration_id]);
            const lang: Lang = (langResult.rows[0]?.lang as Lang) || 'en';
            await ctx.reply(
              '✅ <b>Password updated successfully!</b>\n\nYour account is now accessible again. We\'re pulling your full trade history now to backfill anything missed while access was down.\n\n⚠️ <b>Remember:</b> Do NOT change your investor password again until the challenge ends.' +
              t(lang, 'winnerpip_login_updated'),
              { parse_mode: 'HTML' }
            );
            // Backfill: force a full pull for this account + push to the live leaderboard
            // immediately, instead of waiting for the next scheduled incremental cron
            // (which would only look back 5h and miss the outage window). Fire-and-forget —
            // the user already got their confirmation; this just makes the data catch up.
            try {
              const globalScheduler = (global as any).__vpsPullScheduler;
              if (globalScheduler && session.data.challenge_id) {
                globalScheduler.recoverAccountAfterCredentialFix(session.data.registration_id, session.data.challenge_id, 'user')
                  .catch((e: any) => console.error('recoverAccountAfterCredentialFix (user flow) failed:', e));
              }
            } catch (e) {
              console.error('Failed to trigger post-recovery backfill pull:', e);
            }
          }
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
      // No need to ask for password — we already have it from registration
      await this.saveSubmission(ctx, telegramId);
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

      // === ACCOUNT SUBTYPE CHECK ===
      // Rules determine which subtypes are allowed:
      //   only_cent_account ON → real: standard_cent only | demo: standard only
      //   allow_professional ON → adds pro, raw_spread, zero to allowed list
      //   Default (both OFF) → standard + standard_cent for real, standard for demo
      const isPro = vpsAccountSubtype === 'pro' || vpsAccountSubtype === 'raw_spread' || vpsAccountSubtype === 'zero';
      const allowPro = rules?.allow_professional || false;

      if (isPro && !allowPro) {
        session.step = 'tc_enter_account_number';
        const lang: Lang = session.data.lang || 'en';
        const subtypeLabel = vpsAccountSubtype === 'pro' ? 'Pro' : vpsAccountSubtype === 'zero' ? 'Zero' : 'Raw Spread';
        const acceptedTypes = account_type !== 'demo' ? 'Standard / Standard Cent' : 'Standard';
        await ctx.reply(
          t(lang, 'acct_subtype_not_allowed', { subtype: subtypeLabel, accepted: acceptedTypes }),
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([
            [Markup.button.callback(t(lang, 'submit_another_acct_btn'), `tc_new_real_acct_${session.data.challenge_id}`)],
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
          const lang: Lang = session.data.lang || 'en';
          const displayExpected = isCentAccount ? `${startingBalance * 100}¢ ($${startingBalance})` : `$${startingBalance}`;
          const displayActual = isCentAccount ? `${vpsBalance}¢ ($${(vpsBalance/100).toFixed(2)})` : `$${vpsBalance.toFixed(2)}`;
          await ctx.reply(
            t(lang, 'balance_mismatch_demo', { expected: displayExpected, actual: displayActual }),
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([
              [Markup.button.callback(t(lang, 'submit_another_acct_btn'), `tc_new_real_acct_${session.data.challenge_id}`)],
            ]) }
          );
          return;
        }

        // Demo balance OK
        const langOk: Lang = session.data.lang || 'en';
        session.data.registration_balance = vpsBalance;
        const demoBalDisplay = isCentAccount ? `${vpsBalance}¢` : `$${vpsBalance.toFixed(2)}`;
        await ctx.reply(t(langOk, 'balance_ok_exact', { balance: demoBalDisplay }), { parse_mode: 'HTML' });
        await this.askForNickname(ctx, telegramId);
        return;
      }

      // === REAL ACCOUNT: flexible balance rules ===

      // Check cent account requirement — reject standard accounts in cent-only challenges
      if (onlyCent && account_type === 'real' && !isCentAccount) {
        session.step = 'tc_enter_account_number';
        const lang: Lang = session.data.lang || 'en';
        await ctx.reply(
          t(lang, 'only_cent_allowed'),
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([
            [Markup.button.callback(t(lang, 'submit_cent_acct_btn'), `tc_new_real_acct_${session.data.challenge_id}`)],
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
        const lang: Lang = session.data.lang || 'en';
        await ctx.reply(
          t(lang, 'balance_too_high', { balance: balanceDisplay, limit: startDisplay }),
          { parse_mode: 'HTML' }
        );
        return;
      } else if (vpsBalance === 0) {
        // Zero balance — accept with warning
        const lang: Lang = session.data.lang || 'en';
        session.data.registration_balance = vpsBalance;
        await ctx.reply(
          t(lang, 'balance_zero_warning', { zero: isCentAccount ? '¢0.00' : '$0.00' }),
          { parse_mode: 'HTML' }
        );
      } else if (vpsBalance < compareBalance) {
        // Below starting balance — accept with info
        const lang: Lang = session.data.lang || 'en';
        session.data.registration_balance = vpsBalance;
        await ctx.reply(
          t(lang, 'balance_below_start', { balance: balanceDisplay, start: startDisplay }),
          { parse_mode: 'HTML' }
        );
      } else {
        // Exactly starting balance — perfect
        const lang: Lang = session.data.lang || 'en';
        session.data.registration_balance = vpsBalance;
        await ctx.reply(
          t(lang, 'balance_ok_exact', { balance: balanceDisplay }),
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
        await tradingChallengeService.logFailedAttempt(session.data.challenge_id, telegramId, ctx.from!.username || null, session.data.email, 'vps_credential');
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
        await tradingChallengeService.logFailedAttempt(session.data.challenge_id, telegramId, ctx.from!.username || null, session.data.email, 'vps_error');
        await ctx.reply(
          '❌ <b>Server not found</b>\n\n' +
          `The server "<code>${mt5_server}</code>" could not be reached.\n\n` +
          'Please select the correct server:',
          { parse_mode: 'HTML' }
        );
        await this.showServerButtons(ctx, telegramId);
        break;

      case 'timeout':
        session.step = 'tc_enter_investor_password';
        await tradingChallengeService.logFailedAttempt(session.data.challenge_id, telegramId, ctx.from!.username || null, session.data.email, 'vps_timeout');
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
    const lang: Lang = session.data.lang || 'en';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await exnessService.verifyEmail(session.data.email, session.data.account_type);

      if (result.success) {
        session.data.client_uid = result.clientUid;
        session.step = 'tc_enter_account_number';
        const acctType = session.data.account_type === 'demo' ? 'Demo' : 'Real';
        await ctx.reply(t(lang, 'email_verified', { type: acctType }), { parse_mode: 'HTML' });
        return;
      }

      if (result.status === 'not_allocated') {
        session.data.allocation_fail_count = (session.data.allocation_fail_count || 0) + 1;
        await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'allocation_failures');
        await tradingChallengeService.logFailedAttempt(session.data.challenge_id, telegramId, ctx.from!.username || null, session.data.email, 'allocation');
        const challengeId = session.data.challenge_id;
        const contactAdmin = session.data.allocation_fail_count >= 2 ? `\n\n<b>Contact @birrFXadmin with a screenshot if you believe this is a mistake.</b>` : '';
        await ctx.reply(
          t(lang, 'not_allocated', { signupLink: config.exnessPartnerSignupLink, partnerLink: config.exnessPartnerChangeLink }) + contactAdmin,
          { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...Markup.inlineKeyboard([[Markup.button.callback('📧 Submit Email Again', `tc_retry_email_${challengeId}`)]]) }
        );
        return;
      }

      if (result.status === 'kyc_failed') {
        await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'kyc_failures');
        await tradingChallengeService.logFailedAttempt(session.data.challenge_id, telegramId, ctx.from!.username || null, session.data.email, 'kyc');
        const challengeId = session.data.challenge_id;
        await ctx.reply(t(lang, 'kyc_failed'),
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
        await ctx.reply(attempt === 1 ? t(lang, 'system_busy_retry') : t(lang, 'system_busy_retry'));
        await new Promise(r => setTimeout(r, retryDelay));
      }
    }

    // All retries failed
    const challengeId = session.data.challenge_id;
    session.data.retry_count = (session.data.retry_count || 0) + 1;
    if (session.data.retry_count >= 2) {
      session.step = 'tc_manual_account';
      await ctx.reply(t(lang, 'manual_verification', { email: session.data.email }), { parse_mode: 'HTML' });
    } else {
      await ctx.reply(t(lang, 'system_busy_later'),
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
    const lang: Lang = session.data.lang || 'en';

    if (result.status === 'allocated_mt5') {
      if (result.data?.client_uid && session.data.client_uid && result.data.client_uid !== session.data.client_uid) {
        session.step = 'tc_enter_account_number';
        await ctx.reply(t(lang, 'acct_ownership_mismatch'),
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📝 Submit New Real Account', `tc_new_real_acct_${challengeId}`)]]) });
        return;
      }
      // Allocation OK — proceed to server selection
      await this.showServerButtons(ctx, telegramId);
      return;
    }

    if (result.status === 'allocated_not_mt5') {
      session.step = 'tc_enter_account_number';
      await ctx.reply(t(lang, 'real_acct_not_mt5'),
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📝 Submit New Real Account', `tc_new_real_acct_${challengeId}`)]]) });
      return;
    }

    if (result.status === 'not_allocated') {
      session.step = 'tc_enter_account_number';
      session.data.real_acct_retry = (session.data.real_acct_retry || 0) + 1;
      await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'real_acct_failures');
      await tradingChallengeService.logFailedAttempt(session.data.challenge_id, telegramId, ctx.from!.username || null, session.data.email, 'real_acct');
      const msg = session.data.real_acct_retry >= 2
        ? t(lang, 'real_acct_not_allocated_retry')
        : t(lang, 'real_acct_not_allocated');
      await ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📝 Submit New Real Account', `tc_new_real_acct_${challengeId}`)]]) });
      return;
    }

    // API error — proceed to server anyway (graceful degradation)
    await this.showServerButtons(ctx, telegramId);
  }

  private async verifyRealAccountChange(ctx: Context, telegramId: number) {
    const session = userSessions.get(telegramId);
    if (!session) return;

    const investorPassword = session.data.new_investor_password;
    if (!investorPassword) {
      session.step = 'tc_change_acct_investor_password';
      await ctx.reply('❌ Investor password missing. Please enter the investor password for the new account:', { parse_mode: 'HTML' });
      return;
    }

    // For real accounts: Exness allocation check first
    if (session.data.account_type === 'real') {
      const allocResult = await exnessService.verifyRealAccount(session.data.new_account_number);
      if (allocResult.status === 'allocated_not_mt5') {
        session.step = 'tc_change_acct_number';
        await ctx.reply('⚠️ <b>Not an MT5 account.</b>\n\nPlease send your <b>MT5 Real Account Number:</b>', { parse_mode: 'HTML' });
        return;
      }
      if (allocResult.status === 'not_allocated') {
        session.step = 'tc_change_acct_number';
        await ctx.reply('⚠️ <b>Account not yet under BirrForex.</b> Wait 15 minutes and try again.\n\nSend your <b>MT5 Real Account Number:</b>', { parse_mode: 'HTML' });
        return;
      }
    }

    // VPS verify — works for both demo and real
    const vpsResult = await vpsService.verifyConnection(session.data.new_account_number, session.data.mt5_server, investorPassword);

    if (vpsResult.success) {
      const subtype  = vpsResult.account_subtype || 'unknown';
      const currency = (vpsResult.currency || '').toUpperCase();
      const isCent   = currency === 'USC' || currency === 'USCENT';
      const vpsBalance = vpsResult.balance || 0;

      // Load challenge
      const challenge = await tradingChallengeService.getChallengeById(session.data.challenge_id);
      const startingBalance = Number(challenge?.starting_balance || 30);

      // Reject non-standard subtypes if pro not allowed
      const isPro2 = subtype === 'pro' || subtype === 'raw_spread' || subtype === 'zero';
      const { evaluationEngine: wpEngine2 } = require('../services/wpEvaluationEngine');
      const rules2 = await wpEngine2.loadRules(session.data.challenge_id);
      const allowPro2 = rules2?.allow_professional || false;
      if (isPro2 && !allowPro2) {
        session.step = 'tc_change_acct_number';
        await ctx.reply(
          `❌ <b>Account Type Not Allowed</b>\n\nOnly Standard or Standard Cent accounts are accepted.\n\nSend your new <b>MT5 ${session.data.account_type === 'demo' ? 'Demo' : 'Real'} Account Number:</b>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      // Load rules
      const { evaluationEngine: wpEngine } = require('../services/wpEvaluationEngine');
      const rules = await wpEngine.loadRules(session.data.challenge_id);
      const onlyCent = rules?.only_cent_account || false;

      // Reject standard account in cent-only challenge
      if (onlyCent && session.data.account_type === 'real' && !isCent) {
        session.step = 'tc_change_acct_number';
        await ctx.reply('❌ <b>Only Cent Accounts Allowed</b>\n\nSend a Standard Cent account number:', { parse_mode: 'HTML' });
        return;
      }

      // For demo: balance must match starting_balance (within 1% tolerance)
      if (session.data.account_type === 'demo') {
        const expected  = isCent ? startingBalance * 100 : startingBalance;
        const tolerance = expected * 0.01;
        if (Math.abs(vpsBalance - expected) > tolerance) {
          session.step = 'tc_change_acct_number';
          const displayExpected = isCent ? `${expected}¢` : `$${startingBalance}`;
          const displayActual   = isCent ? `${vpsBalance}¢` : `$${vpsBalance.toFixed(2)}`;
          await ctx.reply(
            `❌ <b>Balance Mismatch</b>\n\nBalance is <b>${displayActual}</b> but challenge requires exactly <b>${displayExpected}</b>.\n\nPlease adjust and send the account number again:`,
            { parse_mode: 'HTML' }
          );
          return;
        }
      }

      // All checks passed — save new account number, server, investor password, cent flag, subtype
      await db.query(
        `UPDATE trading_registrations
         SET account_number = $1, mt5_server = $2, investor_password = $3,
             is_cent = $4, account_subtype = $5,
             registration_balance = $6, last_known_balance = $6,
             connection_verified = true, connection_verified_at = NOW(), updated_at = NOW()
         WHERE id = $7`,
        [
          session.data.new_account_number, session.data.mt5_server, investorPassword,
          isCent, subtype, vpsBalance,
          session.data.registration_id,
        ]
      );
      await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'account_changes');
      userSessions.delete(telegramId);

      const lang: Lang = session.data.lang || 'en';
      const balanceDisplay = isCent ? `${vpsBalance}¢` : `$${vpsBalance.toFixed(2)}`;
      await ctx.reply(
        `✅ <b>Account updated successfully!</b>\n\n` +
        `🏦 <b>New Account:</b> ${session.data.new_account_number}\n` +
        `🖥️ <b>Server:</b> ${session.data.mt5_server}\n` +
        `💰 <b>Balance:</b> ${balanceDisplay}\n\n` +
        `⚠️ <b>IMPORTANT:</b> Do NOT change your investor password until the challenge ends and winners are announced. ` +
        `We pull your trade data automatically — if we can't access your account, you will be disqualified.` +
        t(lang, 'winnerpip_login_updated'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // VPS failed
    if (vpsResult.status === 'invalid_credentials') {
      // Send user back to account number so they can re-enter everything
      session.step = 'tc_change_acct_number';
      session.data.new_investor_password = undefined;
      await ctx.reply(
        '❌ <b>Connection failed — Invalid credentials</b>\n\nPlease check the account number, server, and investor password.\n\nSend your new <b>MT5 Account Number:</b>',
        { parse_mode: 'HTML' }
      );
    } else {
      // VPS down — save without verification, pull cycle will retry
      await db.query(
        `UPDATE trading_registrations
         SET account_number = $1, mt5_server = $2, investor_password = $3, updated_at = NOW()
         WHERE id = $4`,
        [session.data.new_account_number, session.data.mt5_server, investorPassword, session.data.registration_id]
      );
      await tradingChallengeService.updateDailyStat(session.data.challenge_id, 'account_changes');
      userSessions.delete(telegramId);
      await ctx.reply(
        `✅ <b>Account details saved</b> (VPS busy right now).\n\n` +
        `🏦 <b>New Account:</b> ${session.data.new_account_number}\n` +
        `🖥️ <b>Server:</b> ${session.data.mt5_server}\n\n` +
        `Connection will be verified on the next pull cycle.\n\n` +
        `⚠️ <b>IMPORTANT:</b> Do NOT change your investor password until the challenge ends.`,
        { parse_mode: 'HTML' }
      );
    }
  }

  // ==================== ASK FOR NICKNAME (after all verifications pass) ====================

  private async askForNickname(ctx: Context, telegramId: number) {
    const session = userSessions.get(telegramId);
    if (!session) return;
    const lang: Lang = session.data.lang || 'en';

    session.step = 'tc_enter_nickname';
    await ctx.reply(t(lang, 'nickname_prompt'), { parse_mode: 'HTML' });
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

      // Save investor password, cent flag, account_subtype, registration balance, and lang
      if (session.data.investor_password) {
        await db.query('UPDATE trading_registrations SET investor_password = $1, connection_verified = true, connection_verified_at = NOW(), is_cent = $3, account_subtype = $4, registration_balance = $5, last_known_balance = $5, lang = $6 WHERE id = $2',
          [session.data.investor_password, reg.id, session.data.is_cent || false, session.data.account_subtype || 'standard', session.data.registration_balance ?? null, session.data.lang || 'en']);
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

      const lang: Lang = session.data.lang || 'en';
      const acctLabel = session.data.account_type === 'demo' ? 'Demo' : 'Real';
      const startStr = toEAT(challenge.start_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

      let buttons: any[][] = [
        [Markup.button.callback(t(lang, 'reg_change_account_btn'), `tc_change_acct_${challenge.id}`)],
      ];
      if (challenge.type === 'hybrid') {
        if (session.data.account_type === 'demo') {
          buttons.push([Markup.button.callback(t(lang, 'reg_switch_real_btn'), `tc_switch_cat_${challenge.id}`)]);
        } else {
          buttons.push([Markup.button.callback(t(lang, 'reg_switch_demo_btn'), `tc_switch_cat_${challenge.id}`)]);
        }
      }

      let linksText = '';
      if (challenge.pdf_url) linksText += `\n📄 Challenge Rules: <a href="${challenge.pdf_url}">Download PDF</a>`;
      if (challenge.video_url) linksText += `\n🎥 Challenge Guide: <a href="${challenge.video_url}">Watch Video</a>`;

      await ctx.reply(
        t(lang, 'reg_complete', {
          nick: session.data.nickname || 'N/A',
          email: session.data.email,
          type: acctLabel,
          number: session.data.account_number,
          server: session.data.mt5_server || 'N/A',
          startDate: startStr,
        }) + linksText,
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...Markup.inlineKeyboard(buttons) }
      );
    } catch (error: any) {
      const lang: Lang = session?.data?.lang || 'en';
      if (error.code === '23505') {
        // Check if it's the nickname constraint
        if (error.constraint && error.constraint.includes('nickname')) {
          const session2 = userSessions.get(telegramId);
          if (session2) {
            session2.step = 'tc_enter_nickname';
            await ctx.reply(t(lang, 'nickname_taken', { name: session2.data.nickname }), { parse_mode: 'HTML' });
            return;
          }
        }
        await ctx.reply(t(lang, 'error_already_registered'), { parse_mode: 'HTML' });
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

      // Pull investor password from registration record (already collected during signup)
      const regRecord = await db.query(
        'SELECT investor_password FROM trading_registrations WHERE id = $1',
        [session.data.registration_id]
      );
      const investorPassword = regRecord.rows[0]?.investor_password || session.data.investor_password || '';

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
          const caption = `<b>📋 Submission${overrideTag}</b>\n\n👤 @${ctx.from!.username || 'unknown'}\n📧 ${session.data.email}\n🏦 ${acctLabel}: ${session.data.account_number}\n🖥️ Server: ${session.data.mt5_server || 'N/A'}\n💰 Balance: $${session.data.final_balance.toFixed(2)}\n🔑 Password: <code>${investorPassword}</code>`;
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
          investor_password: investorPassword,
        });
      } else {
        await tradingChallengeService.createSubmission({
          registration_id: session.data.registration_id,
          challenge_id: session.data.challenge_id,
          final_balance: session.data.final_balance,
          balance_screenshot_file_id: session.data.screenshot_file_id || null,
          screenshot_link: screenshotLink,
          screenshot_message_id: screenshotMessageId,
          investor_password: investorPassword,
        });
      }

      const lang: Lang = session.data.lang || 'en';
      const acctLabel = session.data.account_type === 'demo' ? 'Demo' : 'Real';
      userSessions.delete(telegramId);
      await ctx.reply(
        t(lang, 'submit_complete', {
          email: session.data.email,
          number: session.data.account_number,
          server: session.data.mt5_server || 'N/A',
          type: acctLabel,
          balance: session.data.final_balance.toFixed(2),
        }),
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
      data: { registration_id: registrationId, account_number: reg.account_number, mt5_server: reg.mt5_server, challenge_id: reg.challenge_id },
    });

    await ctx.reply(
      `🔑 <b>Update Investor Password</b>\n\n` +
      `Account: <b>${reg.account_number}</b>\nServer: <b>${reg.mt5_server}</b>\n\n` +
      `Please send your new <b>Investor (Read-Only) Password:</b>`,
      { parse_mode: 'HTML' }
    );
  }

  // ==================== CHANGE ACCOUNT (from pre-start credential failure DM) ====================

  async startChangeAccount(ctx: Context, registrationId: number) {
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

    // Check challenge status — block changes during active/submission_open challenges
    const challenge = await tradingChallengeService.getChallengeById(reg.challenge_id);
    if (challenge && (challenge.status === 'active' || challenge.status === 'submission_open')) {
      await ctx.reply('❌ Challenge has started. Account changes are no longer allowed.');
      return;
    }

    const lang: Lang = (reg.lang as Lang) || 'en';
    const typeLabel = reg.account_type === 'demo' ? 'Demo' : 'Real';

    userSessions.set(telegramId, {
      step: 'tc_change_acct_number',
      data: { challenge_id: reg.challenge_id, registration_id: reg.id, account_type: reg.account_type, lang },
    });

    await ctx.reply(t(lang, 'change_acct_title', { number: reg.account_number, server: reg.mt5_server || 'N/A', type: typeLabel }), { parse_mode: 'HTML' });
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
