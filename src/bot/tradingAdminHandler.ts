import { Context, Markup } from 'telegraf';
import { tradingChallengeService, TradingChallenge } from '../services/tradingChallengeService';
import { isAdmin } from '../utils/helpers';
import { config } from '../config';

// Convert stored UTC date to EAT for display
const toEAT = (d: Date) => new Date(new Date(d).getTime() + 3 * 60 * 60 * 1000);

interface TradingAdminSession {
  step: string;
  data: any;
}

const tradingAdminSessions = new Map<number, TradingAdminSession>();

export class TradingAdminHandler {

  private checkAdmin(ctx: Context): boolean {
    if (!isAdmin(ctx.from!.id)) {
      ctx.reply('❌ You are not authorized.');
      return false;
    }
    return true;
  }

  /**
   * Convert Telegram message entities to HTML string
   */
  private entitiesToHtml(text: string, entities?: any[]): string {
    if (!entities || entities.length === 0) return text;

    const sorted = [...entities].sort((a, b) => b.offset - a.offset);

    let result = text;
    for (const entity of sorted) {
      const start = entity.offset;
      const end = entity.offset + entity.length;
      const content = result.substring(start, end);

      let replacement = content;
      switch (entity.type) {
        case 'bold':
          replacement = `<b>${content}</b>`; break;
        case 'italic':
          replacement = `<i>${content}</i>`; break;
        case 'underline':
          replacement = `<u>${content}</u>`; break;
        case 'strikethrough':
          replacement = `<s>${content}</s>`; break;
        case 'code':
          replacement = `<code>${content}</code>`; break;
        case 'pre':
          replacement = `<pre>${content}</pre>`; break;
        case 'text_link':
          replacement = `<a href="${entity.url}">${content}</a>`; break;
        case 'text_mention':
          replacement = `<a href="tg://user?id=${entity.user?.id}">${content}</a>`; break;
        case 'spoiler':
          replacement = `<tg-spoiler>${content}</tg-spoiler>`; break;
      }

      result = result.substring(0, start) + replacement + result.substring(end);
    }

    return result;
  }

  hasActiveSession(telegramId: number): boolean {
    return tradingAdminSessions.has(telegramId);
  }

  // ==================== CREATE CHALLENGE ====================

  async createTradingChallenge(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;
    const telegramId = ctx.from!.id;

    tradingAdminSessions.set(telegramId, {
      step: 'tc_select_type',
      data: {},
    });

    await ctx.reply(
      '<b>🎯 Create Trading Challenge</b>\n\nSelect challenge type:',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('Demo', 'tc_type_demo')],
          [Markup.button.callback('Real', 'tc_type_real')],
          [Markup.button.callback('Hybrid', 'tc_type_hybrid')],
        ]),
      }
    );
  }

  // ==================== CALLBACK HANDLERS ====================

  async handleCallback(ctx: Context, data: string): Promise<boolean> {
    const telegramId = ctx.from!.id;

    // Type selection
    if (data === 'tc_type_demo' || data === 'tc_type_real' || data === 'tc_type_hybrid') {
      const type = data.replace('tc_type_', '') as 'demo' | 'real' | 'hybrid';
      const session = tradingAdminSessions.get(telegramId);
      if (!session) return true;

      session.data.type = type;
      session.step = 'tc_enter_title';
      await ctx.answerCbQuery();
      await ctx.reply(`✅ Type: <b>${type.charAt(0).toUpperCase() + type.slice(1)}</b>\n\nSend the challenge title:`, { parse_mode: 'HTML' });
      return true;
    }

    // Confirm create
    if (data === 'tc_confirm_create') {
      await this.saveChallenge(ctx);
      return true;
    }

    if (data === 'tc_cancel_create') {
      tradingAdminSessions.delete(telegramId);
      await ctx.answerCbQuery('Cancelled');
      await ctx.reply('❌ Challenge creation cancelled.');
      return true;
    }

    // Post challenge
    if (data.startsWith('tc_post_')) {
      return await this.handlePostCallback(ctx, data);
    }

    // Update challenge
    if (data.startsWith('tc_update_')) {
      return await this.handleUpdateCallback(ctx, data);
    }

    // Delete challenge
    if (data.startsWith('tc_delete_')) {
      return await this.handleDeleteCallback(ctx, data);
    }

    // Challenge list selection
    if (data.startsWith('tc_view_')) {
      // View registrations from challenge details
      if (data.startsWith('tc_view_regs_')) {
        const challengeId = parseInt(data.replace('tc_view_regs_', ''));
        await ctx.answerCbQuery();
        const regs = await tradingChallengeService.getAllRegistrations(challengeId);
        if (regs.length === 0) {
          await ctx.reply('❌ No registrations found.');
          return true;
        }
        let text = `<b>📋 REGISTRATIONS (${regs.length})</b>\n\n`;
        regs.forEach((r, i) => {
          text += `${i + 1}. @${r.username || 'unknown'} — ${r.account_type === 'demo' ? '🏦 Demo' : '💰 Real'}\n📧 ${r.email} | 🏦 ${r.account_number}\n\n`;
        });
        // Truncate if too long for Telegram (4096 char limit)
        if (text.length > 4000) text = text.substring(0, 4000) + '\n\n<i>... truncated. Use /exportregistrations for full list.</i>';
        await ctx.reply(text, { parse_mode: 'HTML' });
        return true;
      }

      // View winners from challenge details
      if (data.startsWith('tc_view_winners_')) {
        const challengeId = parseInt(data.replace('tc_view_winners_', ''));
        await ctx.answerCbQuery();
        const winners = await tradingChallengeService.getWinners(challengeId);
        if (winners.length === 0) {
          await ctx.reply('❌ No winners selected yet.');
          return true;
        }
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        let text = `<b>🏆 WINNERS</b>\n\n`;
        winners.forEach((w, i) => {
          text += `${medals[i] || (i+1)+'️⃣'} @${w.username} — ${w.category === 'demo' ? 'Demo' : 'Real'} — <b>${w.prize_amount}</b>\n`;
        });
        await ctx.reply(text, { parse_mode: 'HTML' });
        return true;
      }

      // Export CSV from challenge details
      if (data.startsWith('tc_view_export_regs_')) {
        const challengeId = parseInt(data.replace('tc_view_export_regs_', ''));
        await ctx.answerCbQuery();
        // Reuse exportRegistrations logic with specific challenge
        await this.exportRegistrationsForChallenge(ctx, challengeId);
        return true;
      }

      if (data.startsWith('tc_view_export_subs_')) {
        const challengeId = parseInt(data.replace('tc_view_export_subs_', ''));
        await ctx.answerCbQuery();
        await this.exportSubmissionsForChallenge(ctx, challengeId);
        return true;
      }

      const challengeId = parseInt(data.replace('tc_view_', ''));
      await this.showChallengeDetails(ctx, challengeId);
      return true;
    }

    // Retract registration callbacks
    if (data === 'tc_retract_acct' || data === 'tc_retract_server') {
      const session = tradingAdminSessions.get(telegramId);
      if (!session || !session.data.retract_reg) return true;

      const reg = session.data.retract_reg;
      const challengeTitle = session.data.challenge_title;
      const reasonField = data === 'tc_retract_acct' ? 'Exness account number' : 'MT5 server';

      // Delete registration
      await tradingChallengeService.deleteRegistration(reg.id);
      tradingAdminSessions.delete(telegramId);

      await ctx.answerCbQuery('Registration retracted');
      await ctx.reply(`✅ Registration for <b>@${reg.username}</b> has been retracted.`, { parse_mode: 'HTML' });

      // Notify user
      try {
        await ctx.telegram.sendMessage(reg.telegram_id,
          `⚠️ <b>Registration Retracted</b>\n\n` +
          `Your registration for <b>${challengeTitle}</b> has been canceled because you didn't submit your <b>${reasonField}</b> properly.\n\n` +
          `Please register again and make sure to enter the correct details.\n\n` +
          `👉 <b>Tap "Join Challenge" on the channel post to register again.</b>`,
          { parse_mode: 'HTML' }
        );
        await ctx.reply('✅ User has been notified.');
      } catch (e) {
        await ctx.reply('⚠️ Registration retracted but could not notify user (DMs may be closed).');
      }
      return true;
    }

    // Promo callbacks
    if (data.startsWith('tc_promo_')) {
      if (data.startsWith('tc_promo_send_')) {
        const target = data.replace('tc_promo_send_', '');
        await this.handlePromoSend(ctx, target);
        return true;
      }
      return await this.handlePromoCallback(ctx, data);
    }

    // Additional post callbacks
    if (data.startsWith('tc_addpost_')) {
      return await this.handleAdditionalPostCallback(ctx, data);
    }

    // Late post callbacks
    if (data.startsWith('tc_latepost_')) {
      return await this.handleLatePostCallback(ctx, data);
    }

    // Manual verify callbacks
    if (data === 'tc_mv_confirm') {
      const session = tradingAdminSessions.get(telegramId);
      if (!session) return true;
      const d = session.data;

      try {
        await tradingChallengeService.registerUser({
          challenge_id: d.challenge_id,
          telegram_id: d.user_telegram_id,
          username: d.username,
          account_type: d.account_type,
          email: d.email,
          account_number: d.account_number,
          mt5_server: d.mt5_server,
          client_uid: null,
        });

        tradingAdminSessions.delete(telegramId);
        await ctx.answerCbQuery('Registered!');
        await ctx.reply(`✅ <b>User manually registered!</b>\n\n@${d.username} has been registered for ${d.challenge_title}.`, { parse_mode: 'HTML' });

        // Notify the user
        try {
          const challenge = await tradingChallengeService.getChallengeById(d.challenge_id);
          const acctLabel = d.account_type === 'demo' ? 'Demo' : 'Real';
          let linksText = '';
          if (challenge?.pdf_url) linksText += `\n📄 Challenge Rules: <a href="${challenge.pdf_url}">Download PDF</a>`;
          if (challenge?.video_url) linksText += `\n🎥 Challenge Guide: <a href="${challenge.video_url}">Watch Video</a>`;

          await ctx.telegram.sendMessage(d.user_telegram_id,
            `✅ <b>Registration Approved!</b>\n\n` +
            `You have been registered for <b>${d.challenge_title}</b>.\n\n` +
            `📋 <b>Your Registration:</b>\n` +
            `📧 <b>Email:</b> ${d.email}\n` +
            `🏦 <b>${acctLabel} Account:</b> ${d.account_number}\n` +
            `🖥️ <b>Server:</b> ${d.mt5_server}\n` +
            `📊 <b>Type:</b> ${acctLabel}\n\n` +
            `⚠️ <i>Please read the rules and understand them well before starting the challenge!</i>\n` +
            linksText,
            { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
          );
          await ctx.reply('✅ User has been notified.');
        } catch (e) {
          await ctx.reply('⚠️ Registered but could not notify user (DMs may be closed).');
        }
      } catch (error: any) {
        if (error.code === '23505') {
          await ctx.reply('⚠️ This user is already registered for this challenge.');
        } else {
          console.error('Manual verify error:', error);
          await ctx.reply('❌ Error registering user.');
        }
        tradingAdminSessions.delete(telegramId);
      }
      return true;
    }

    if (data === 'tc_mv_cancel') {
      tradingAdminSessions.delete(telegramId);
      await ctx.answerCbQuery('Cancelled');
      await ctx.reply('❌ Manual registration cancelled.');
      return true;
    }

    // Manual verify type selection
    if (data.startsWith('tc_mv_type_demo_') || data.startsWith('tc_mv_type_real_')) {
      const session = tradingAdminSessions.get(telegramId);
      if (!session) return true;
      const accountType = data.includes('_demo_') ? 'demo' : 'real';
      session.data.account_type = accountType;
      session.step = 'tc_mv_email';
      await ctx.answerCbQuery();
      await ctx.reply('Enter the user\'s <b>Exness email:</b>', { parse_mode: 'HTML' });
      return true;
    }

    // Manual entry fallback button
    if (data === 'tc_mv_manual_entry') {
      const session = tradingAdminSessions.get(telegramId);
      if (!session) return true;
      session.step = 'tc_mv_forward';
      await ctx.answerCbQuery();
      await ctx.reply('Enter the user\'s <b>Telegram ID</b> (numeric):', { parse_mode: 'HTML' });
      return true;
    }

    // Wait for forward
    if (data === 'tc_mv_wait_forward') {
      const session = tradingAdminSessions.get(telegramId);
      if (!session) return true;
      session.step = 'tc_mv_forward';
      await ctx.answerCbQuery();
      await ctx.reply(
        `<b>Forward a message from the user</b> you want to register.\n<i>(Open their chat, long-press any message, and forward it here)</i>`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    // Search by username
    if (data === 'tc_mv_search_username') {
      const session = tradingAdminSessions.get(telegramId);
      if (!session) return true;
      session.step = 'tc_mv_search';
      await ctx.answerCbQuery();
      await ctx.reply('Enter the user\'s <b>Telegram username</b> (without @):', { parse_mode: 'HTML' });
      return true;
    }

    // Search result selection
    if (data.startsWith('tc_mv_pick_')) {
      const session = tradingAdminSessions.get(telegramId);
      if (!session) return true;
      const parts = data.replace('tc_mv_pick_', '').split('_');
      const userId = parseInt(parts[0]);
      const { tradingRegistrationHandler } = require('./tradingRegistrationHandler');
      const knownUsers = tradingRegistrationHandler.getKnownUsers();
      const user = knownUsers.get(userId);
      session.data.user_telegram_id = userId;
      session.data.username = user?.username || parts.slice(1).join('_') || 'unknown';
      session.step = 'tc_mv_type';
      const challengeId = session.data.challenge_id;
      const displayName = user?.username ? `@${user.username}` : (user?.firstName || `ID: ${userId}`);
      await ctx.answerCbQuery();
      await ctx.reply(
        `✅ <b>User selected:</b> ${displayName}\n<b>Telegram ID:</b> <code>${userId}</code>\n\nSelect account type:`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([
          [Markup.button.callback('🏦 Demo Account', `tc_mv_type_demo_${challengeId}`)],
          [Markup.button.callback('💰 Real Account', `tc_mv_type_real_${challengeId}`)],
        ]) }
      );
      return true;
    }

    // Winner confirm callbacks
    if (data === 'tc_confirm_winners_yes') {
      await this.saveAndAnnounceWinners(ctx);
      return true;
    }
    if (data === 'tc_confirm_winners_no') {
      tradingAdminSessions.delete(telegramId);
      await ctx.answerCbQuery('Cancelled');
      await ctx.reply('❌ Winner selection cancelled.');
      return true;
    }

    // Unregister challenge selection
    if (data.startsWith('tc_unreg_select_')) {
      const challengeId = parseInt(data.replace('tc_unreg_select_', ''));
      tradingAdminSessions.set(telegramId, { step: 'tc_unregister_input', data: { challenge_id: challengeId } });
      await ctx.answerCbQuery();
      await ctx.reply('Enter username or email to remove:');
      return true;
    }

    return false;
  }

  // ==================== TEXT INPUT HANDLER ====================

  async handleTextInput(ctx: Context, text: string) {
    const telegramId = ctx.from!.id;
    const session = tradingAdminSessions.get(telegramId);
    if (!session) return;

    switch (session.step) {
      case 'tc_enter_title':
        session.data.title = text;
        if (session.data.type === 'hybrid') {
          session.step = 'tc_enter_real_winners_count';
          await ctx.reply('🏆 How many <b>Real account</b> winners?', { parse_mode: 'HTML' });
        } else {
          session.step = 'tc_enter_winners_count';
          await ctx.reply('🏆 How many winners?');
        }
        break;

      case 'tc_enter_winners_count': {
        const count = parseInt(text);
        if (isNaN(count) || count < 1 || count > 10) {
          await ctx.reply('❌ Enter a number between 1 and 10.');
          return;
        }
        if (session.data.type === 'demo') {
          session.data.demo_winners_count = count;
          session.data.real_winners_count = 0;
        } else {
          session.data.real_winners_count = count;
          session.data.demo_winners_count = 0;
        }
        session.step = 'tc_enter_prizes';
        await ctx.reply(`Enter prizes for each position (comma separated):\nExample: 400, 350, 300`);
        break;
      }

      case 'tc_enter_real_winners_count': {
        const count = parseInt(text);
        if (isNaN(count) || count < 1 || count > 10) {
          await ctx.reply('❌ Enter a number between 1 and 10.');
          return;
        }
        session.data.real_winners_count = count;
        session.step = 'tc_enter_real_prizes';
        await ctx.reply(`Enter prizes for <b>Real account</b> winners (comma separated):`, { parse_mode: 'HTML' });
        break;
      }

      case 'tc_enter_real_prizes': {
        const prizes = text.split(',').map(p => p.trim()).filter(p => p.length > 0);
        if (prizes.length !== session.data.real_winners_count) {
          await ctx.reply(`❌ Enter exactly ${session.data.real_winners_count} prizes, comma separated.\nExample: 400, 350, 300 or iPhone 16, $200, AirPods`);
          return;
        }
        session.data.real_prizes = prizes;
        session.step = 'tc_enter_demo_winners_count';
        await ctx.reply('🏆 How many <b>Demo account</b> winners?', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_enter_demo_winners_count': {
        const count = parseInt(text);
        if (isNaN(count) || count < 1 || count > 10) {
          await ctx.reply('❌ Enter a number between 1 and 10.');
          return;
        }
        session.data.demo_winners_count = count;
        session.step = 'tc_enter_demo_prizes';
        await ctx.reply(`Enter prizes for <b>Demo account</b> winners (comma separated):`, { parse_mode: 'HTML' });
        break;
      }

      case 'tc_enter_prizes': {
        const totalWinners = session.data.real_winners_count || session.data.demo_winners_count;
        const prizes = text.split(',').map(p => p.trim()).filter(p => p.length > 0);
        if (prizes.length !== totalWinners) {
          await ctx.reply(`❌ Enter exactly ${totalWinners} prizes, comma separated.\nExample: 400, 350, 300 or iPhone 16, $200, AirPods`);
          return;
        }
        if (session.data.type === 'demo') {
          session.data.demo_prizes = prizes;
          session.data.real_prizes = [];
        } else {
          session.data.real_prizes = prizes;
          session.data.demo_prizes = [];
        }
        session.step = 'tc_enter_start_date';
        await ctx.reply('📅 Send the <b>start date and time</b>:\nFormat: YYYY-MM-DD HH:MM\nExample: 2026-03-20 09:00', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_enter_demo_prizes': {
        const prizes = text.split(',').map(p => p.trim()).filter(p => p.length > 0);
        if (prizes.length !== session.data.demo_winners_count) {
          await ctx.reply(`❌ Enter exactly ${session.data.demo_winners_count} prizes, comma separated.\nExample: 200, 100 or iPhone 16, AirPods`);
          return;
        }
        session.data.demo_prizes = prizes;
        session.step = 'tc_enter_start_date';
        await ctx.reply('📅 Send the <b>start date and time</b>:\nFormat: YYYY-MM-DD HH:MM\nExample: 2026-03-20 09:00', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_enter_start_date': {
        const match = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
        if (!match) {
          await ctx.reply('❌ Invalid format. Use: YYYY-MM-DD HH:MM');
          return;
        }
        session.data.start_date = new Date(new Date(`${match[1]}T${match[2]}:00`).getTime() - 3 * 60 * 60 * 1000);
        session.step = 'tc_enter_end_date';
        await ctx.reply('📅 Send the <b>end date and time</b>:\nFormat: YYYY-MM-DD HH:MM\nExample: 2026-04-03 23:59', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_enter_end_date': {
        const match = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
        if (!match) {
          await ctx.reply('❌ Invalid format. Use: YYYY-MM-DD HH:MM');
          return;
        }
        session.data.end_date = new Date(new Date(`${match[1]}T${match[2]}:00`).getTime() - 3 * 60 * 60 * 1000);
        session.step = 'tc_enter_starting_balance';
        await ctx.reply('💰 What is the <b>starting balance</b>?', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_enter_starting_balance': {
        const balance = parseFloat(text);
        if (isNaN(balance) || balance <= 0) {
          await ctx.reply('❌ Enter a valid number.');
          return;
        }
        session.data.starting_balance = balance;
        session.step = 'tc_enter_target_balance';
        await ctx.reply('🎯 What is the <b>target balance</b>?', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_enter_target_balance': {
        const target = parseFloat(text);
        if (isNaN(target) || target <= 0) {
          await ctx.reply('❌ Enter a valid number.');
          return;
        }
        session.data.target_balance = target;
        session.step = 'tc_enter_prize_pool_text';
        await ctx.reply('🏆 Send the <b>Prize Pool</b> text:\n\n<i>This will be displayed on announcement, promo, and countdown posts exactly as you write it.</i>\n\nExample:\n🥇 1st: $400\n🥈 2nd: $350\n🥉 3rd: $300', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_enter_prize_pool_text': {
        session.data.prize_pool_text = text;
        session.step = 'tc_enter_pdf';
        await ctx.reply('📄 Send the <b>Rules PDF link</b> (or send /skip):', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_enter_pdf': {
        session.data.pdf_url = text === '/skip' ? null : text;
        session.step = 'tc_enter_video';
        await ctx.reply('🎥 Send the <b>video link</b> (or send /skip):', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_enter_video': {
        session.data.video_url = text === '/skip' ? null : text;
        await this.showConfirmation(ctx);
        break;
      }

      // Update challenge steps
      case 'tc_update_pdf_input': {
        const challengeId = session.data.update_challenge_id;
        await tradingChallengeService.updateChallengePdf(challengeId, text);
        tradingAdminSessions.delete(telegramId);
        await ctx.reply('✅ Rules PDF updated!');
        break;
      }

      case 'tc_update_video_input': {
        const challengeId = session.data.update_challenge_id;
        await tradingChallengeService.updateChallengeVideo(challengeId, text);
        tradingAdminSessions.delete(telegramId);
        await ctx.reply('✅ Video link updated!');
        break;
      }

      case 'tc_update_prize_pool_input': {
        const challengeId = session.data.update_challenge_id;
        await tradingChallengeService.updateChallengePrizePool(challengeId, text);
        tradingAdminSessions.delete(telegramId);
        await ctx.reply('✅ Prize Pool text updated!');
        break;
      }

      // Unregister
      case 'tc_unregister_input': {
        await this.processUnregister(ctx, text);
        break;
      }

      // Winner selection
      case 'tc_select_real_winners': {
        const winners = text.split(',').map(w => w.trim().replace('@', ''));
        session.data.real_winners = winners;
        if (session.data.challenge.type === 'hybrid' || session.data.challenge.type === 'demo') {
          session.step = 'tc_select_demo_winners';
          await this.promptDemoWinners(ctx, session.data.challenge_id);
        } else {
          await this.confirmWinners(ctx);
        }
        break;
      }

      case 'tc_select_demo_winners': {
        const winners = text.split(',').map(w => w.trim().replace('@', ''));
        session.data.demo_winners = winners;
        await this.confirmWinners(ctx);
        break;
      }

      // Message user
      case 'tc_msg_username': {
        session.data.target_username = text.trim().replace('@', '');
        session.step = 'tc_msg_text';
        await ctx.reply('Type your message:');
        break;
      }

      case 'tc_msg_text': {
        await this.sendMessageToUser(ctx, session.data.target_username, text);
        tradingAdminSessions.delete(telegramId);
        break;
      }

      // Disqualify
      case 'tc_dq_username': {
        session.data.target_username = text.trim().replace('@', '');
        session.step = 'tc_dq_reason';
        await ctx.reply('Enter reason for disqualification:');
        break;
      }

      // Retract registration
      case 'tc_retract_username': {
        const input = text.trim().toLowerCase().replace(/^@/, '');
        const regs = await tradingChallengeService.getAllRegistrations(session.data.challenge_id);
        const reg = regs.find(r =>
          r.username?.toLowerCase() === input ||
          r.email?.toLowerCase() === input ||
          String(r.telegram_id) === input
        );

        if (!reg) {
          await ctx.reply(`❌ No registration found for <b>${text.trim()}</b> in this challenge.\n\n<i>You can search by username, email, or Telegram ID.</i>`, { parse_mode: 'HTML' });
          tradingAdminSessions.delete(telegramId);
          return;
        }

        session.data.retract_reg = reg;
        session.step = 'tc_retract_reason';

        await ctx.reply(
          `<b>Found:</b> @${reg.username || 'unknown'}\n📧 ${reg.email}\n🏦 ${reg.account_number}\n🖥️ ${reg.mt5_server || 'N/A'}\n\nSelect the reason:`,
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([
            [Markup.button.callback('❌ Wrong Account Number', 'tc_retract_acct')],
            [Markup.button.callback('❌ Wrong MT5 Server', 'tc_retract_server')],
          ]) }
        );
        break;
      }

      // Manual verify steps
      case 'tc_mv_forward': {
        // User typed a Telegram ID directly (fallback)
        const tid = parseInt(text.trim());
        if (!isNaN(tid)) {
          session.data.user_telegram_id = tid;
          session.step = 'tc_mv_username';
          await ctx.reply('Enter the user\'s <b>Telegram username</b> (without @):', { parse_mode: 'HTML' });
        } else {
          await ctx.reply('❌ Please <b>forward a message</b> from the user, or enter their numeric Telegram ID.', { parse_mode: 'HTML' });
        }
        break;
      }

      case 'tc_mv_search': {
        const searchName = text.trim().toLowerCase().replace(/^@/, '');
        const { tradingRegistrationHandler } = require('../bot/tradingRegistrationHandler');
        const knownUsers = tradingRegistrationHandler.getKnownUsers() as Map<number, { username: string | null; firstName: string | null }>;

        // Search known users
        const matches: { id: number; username: string | null; firstName: string | null }[] = [];
        knownUsers.forEach((user, id) => {
          if (
            (user.username && user.username.toLowerCase().includes(searchName)) ||
            (user.firstName && user.firstName.toLowerCase().includes(searchName))
          ) {
            matches.push({ id, ...user });
          }
        });

        if (matches.length === 0) {
          await ctx.reply(
            `❌ No users found matching "<b>${searchName}</b>".\n\n<i>The user must have tapped "Join Challenge" at least once for the bot to know them.</i>`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([
              [Markup.button.callback('🔍 Search Again', 'tc_mv_search_username')],
              [Markup.button.callback('✍️ Enter Manually', 'tc_mv_manual_entry')],
            ]) }
          );
        } else if (matches.length === 1) {
          // Auto-select single match
          const m = matches[0];
          session.data.user_telegram_id = m.id;
          session.data.username = m.username || m.firstName || 'unknown';
          session.step = 'tc_mv_type';
          const challengeId = session.data.challenge_id;
          const displayName = m.username ? `@${m.username}` : (m.firstName || `ID: ${m.id}`);
          await ctx.reply(
            `✅ <b>User found:</b> ${displayName}\n<b>Telegram ID:</b> <code>${m.id}</code>\n\nSelect account type:`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([
              [Markup.button.callback('🏦 Demo Account', `tc_mv_type_demo_${challengeId}`)],
              [Markup.button.callback('💰 Real Account', `tc_mv_type_real_${challengeId}`)],
            ]) }
          );
        } else {
          // Multiple matches — show buttons
          const buttons = matches.slice(0, 8).map(m => {
            const label = m.username ? `@${m.username}` : (m.firstName || `ID: ${m.id}`);
            return [Markup.button.callback(label, `tc_mv_pick_${m.id}_${m.username || ''}`)];
          });
          await ctx.reply(`Found <b>${matches.length}</b> user(s). Select one:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
        }
        break;
      }

      case 'tc_mv_username': {
        session.data.username = text.trim().replace('@', '');
        session.step = 'tc_mv_type';
        const challengeId = session.data.challenge_id;
        await ctx.reply('Select account type:', Markup.inlineKeyboard([
          [Markup.button.callback('🏦 Demo Account', `tc_mv_type_demo_${challengeId}`)],
          [Markup.button.callback('💰 Real Account', `tc_mv_type_real_${challengeId}`)],
        ]));
        break;
      }

      case 'tc_mv_email': {
        session.data.email = text.trim().toLowerCase();
        session.step = 'tc_mv_account';
        await ctx.reply(`Enter the <b>MT5 ${session.data.account_type === 'demo' ? 'Demo' : 'Real'} Account Number:</b>`, { parse_mode: 'HTML' });
        break;
      }

      case 'tc_mv_account': {
        session.data.account_number = text.trim();
        session.step = 'tc_mv_server';
        await ctx.reply('Enter the <b>MT5 Trading Server:</b>', { parse_mode: 'HTML' });
        break;
      }

      case 'tc_mv_server': {
        session.data.mt5_server = text.trim();
        // Show confirmation
        const d = session.data;
        const acctLabel = d.account_type === 'demo' ? 'Demo' : 'Real';
        await ctx.reply(
          `<b>📋 Confirm Manual Registration</b>\n\n` +
          `👤 <b>Telegram ID:</b> ${d.user_telegram_id}\n` +
          `👤 <b>Username:</b> @${d.username}\n` +
          `📧 <b>Email:</b> ${d.email}\n` +
          `🏦 <b>${acctLabel} Account:</b> ${d.account_number}\n` +
          `🖥️ <b>Server:</b> ${d.mt5_server}\n` +
          `📊 <b>Type:</b> ${acctLabel}\n` +
          `📋 <b>Challenge:</b> ${d.challenge_title}`,
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Confirm & Register', 'tc_mv_confirm')],
            [Markup.button.callback('❌ Cancel', 'tc_mv_cancel')],
          ]) }
        );
        break;
      }

      case 'tc_dq_reason': {
        await this.processDisqualify(ctx, session.data.target_username, text);
        tradingAdminSessions.delete(telegramId);
        break;
      }

      case 'tc_finduser_input': {
        await this.processFindUser(ctx, text);
        break;
      }

      case 'tc_late_post_text': {
        session.data.post_text = text;
        session.data.post_entities = (ctx.message as any)?.entities || [];
        session.data.photo_file_id = null;
        session.step = 'tc_late_post_target';

        await ctx.reply('📝 Text received! Where do you want to post?', Markup.inlineKeyboard([
          [Markup.button.callback('📢 Main Channel', 'tc_latepost_main')],
          [Markup.button.callback('🎯 Challenge Channel', 'tc_latepost_challenge')],
          [Markup.button.callback('📢 Both Channels', 'tc_latepost_both')],
          [Markup.button.callback('❌ Cancel', 'tc_latepost_cancel')],
        ]));
        break;
      }

      case 'tc_additional_post_text': {
        session.data.post_text = text;
        session.data.post_entities = (ctx.message as any)?.entities || [];
        session.data.photo_file_id = null;
        session.step = 'tc_additional_post_target';

        await ctx.reply('📝 Text received! Where do you want to post?', Markup.inlineKeyboard([
          [Markup.button.callback('📢 Main Channel', 'tc_addpost_main')],
          [Markup.button.callback('🎯 Challenge Channel', 'tc_addpost_challenge')],
          [Markup.button.callback('📢 Both Channels', 'tc_addpost_both')],
          [Markup.button.callback('❌ Cancel', 'tc_addpost_cancel')],
        ]));
        break;
      }
    }
  }

  // ==================== CONFIRMATION & SAVE ====================

  private async showConfirmation(ctx: Context) {
    const telegramId = ctx.from!.id;
    const session = tradingAdminSessions.get(telegramId);
    if (!session) return;

    const d = session.data;
    const typeLabel = d.type.charAt(0).toUpperCase() + d.type.slice(1);
    const startStr = toEAT(d.start_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    const endStr = toEAT(d.end_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

    let prizesText = '';
    if (d.type === 'hybrid' || d.type === 'real') {
      prizesText += `\n🏆 <b>Real Account Winners:</b> ${d.real_winners_count}\n`;
      d.real_prizes.forEach((p: number, i: number) => {
        prizesText += `${i + 1}st: ${this.formatPrize(p)}${i < d.real_prizes.length - 1 ? ' | ' : ''}`;
      });
    }
    if (d.type === 'hybrid' || d.type === 'demo') {
      prizesText += `\n🏆 <b>Demo Account Winners:</b> ${d.demo_winners_count}\n`;
      d.demo_prizes.forEach((p: number, i: number) => {
        prizesText += `${i + 1}st: ${this.formatPrize(p)}${i < d.demo_prizes.length - 1 ? ' | ' : ''}`;
      });
    }

    const text = `✅ <b>TRADING CHALLENGE SUMMARY</b>\n\n` +
      `📋 <b>Title:</b> ${d.title}\n` +
      `📋 <b>Type:</b> ${typeLabel}\n` +
      `📅 <b>Period:</b> ${startStr} → ${endStr}\n` +
      `💰 <b>Starting Balance:</b> $${d.starting_balance}\n` +
      `🎯 <b>Target:</b> $${d.target_balance}\n` +
      prizesText + '\n' +
      `🏆 <b>Prize Pool:</b> ${d.prize_pool_text ? '✅ Set' : '⏭️ Not set'}\n` +
      `📄 <b>PDF:</b> ${d.pdf_url ? '✅ Linked' : '⏭️ Skipped'}\n` +
      `🎥 <b>Video:</b> ${d.video_url ? '✅ Linked' : '⏭️ Skipped'}`;

    session.step = 'tc_confirm';
    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirm & Create', 'tc_confirm_create')],
        [Markup.button.callback('❌ Cancel', 'tc_cancel_create')],
      ]),
    });
  }

  private async saveChallenge(ctx: Context) {
    const telegramId = ctx.from!.id;
    const session = tradingAdminSessions.get(telegramId);
    if (!session) return;

    try {
      const d = session.data;
      const challenge = await tradingChallengeService.createChallenge({
        title: d.title,
        type: d.type,
        start_date: d.start_date,
        end_date: d.end_date,
        starting_balance: d.starting_balance,
        target_balance: d.target_balance,
        pdf_url: d.pdf_url,
        video_url: d.video_url,
        real_winners_count: d.real_winners_count || 0,
        demo_winners_count: d.demo_winners_count || 0,
        real_prizes: d.real_prizes || [],
        demo_prizes: d.demo_prizes || [],
        prize_pool_text: d.prize_pool_text,
      });

      tradingAdminSessions.delete(telegramId);
      await ctx.answerCbQuery('Challenge created!');
      await ctx.reply(
        `✅ <b>Trading Challenge Created!</b>\n\n` +
        `ID: ${challenge.id}\n` +
        `Title: ${challenge.title}\n` +
        `Status: Draft\n\n` +
        `Use /postchallenge to post the announcement.`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error('Error saving trading challenge:', error);
      await ctx.reply('❌ Error creating challenge. Please try again.');
    }
  }

  // ==================== POST CHALLENGE ====================

  async postChallenge(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    const unposted = challenges.filter(c => !c.announcement_posted && c.status === 'draft');

    if (unposted.length === 0) {
      await ctx.reply('❌ No unposted challenges found. Create one first with /createtradingchallenge');
      return;
    }

    const buttons = unposted.map(c => [
      Markup.button.callback(`${c.title}`, `tc_post_select_${c.id}`)
    ]);

    await ctx.reply('Select challenge to post:', Markup.inlineKeyboard(buttons));
  }

  private async handlePostCallback(ctx: Context, data: string): Promise<boolean> {
    if (data.startsWith('tc_post_select_')) {
      const challengeId = parseInt(data.replace('tc_post_select_', ''));
      await ctx.answerCbQuery();
      await ctx.reply('Post to:', Markup.inlineKeyboard([
        [Markup.button.callback('📢 Main Channel', `tc_post_main_${challengeId}`)],
        [Markup.button.callback('🎯 Challenge Channel', `tc_post_challenge_${challengeId}`)],
        [Markup.button.callback('📢 Both Channels', `tc_post_both_${challengeId}`)],
      ]));
      return true;
    }

    if (data.startsWith('tc_post_main_') || data.startsWith('tc_post_challenge_') || data.startsWith('tc_post_both_')) {
      const parts = data.split('_');
      const target = parts[2]; // main, challenge, or both
      const challengeId = parseInt(parts[3]);
      await this.postAnnouncement(ctx, challengeId, target);
      return true;
    }

    return false;
  }

  private async postAnnouncement(ctx: Context, challengeId: number, target: string) {
    const challenge = await tradingChallengeService.getChallengeById(challengeId);
    if (!challenge) {
      await ctx.answerCbQuery('Challenge not found');
      return;
    }

    const post = this.generateAnnouncementPost(challenge);
    const botInfo = await ctx.telegram.getMe();

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🚀 Join Challenge', `https://t.me/${botInfo.username}?start=tc_register_${challengeId}`)],
      [Markup.button.url('💰 Open Exness Account', config.exnessPartnerSignupLink)],
    ]);

    const sendOpts = { parse_mode: 'HTML' as const, ...keyboard, link_preview_options: { is_disabled: true } };

    try {
      if (target === 'main' || target === 'both') {
        await ctx.telegram.sendMessage(config.mainChannelId, post, sendOpts);
      }
      if (target === 'challenge' || target === 'both') {
        await ctx.telegram.sendMessage(config.challengeChannelId, post, sendOpts);
      }

      await tradingChallengeService.markAnnouncementPosted(challengeId);
      await ctx.answerCbQuery('Posted!');
      await ctx.reply('✅ Announcement posted! Registration is now open.');
    } catch (error) {
      console.error('Error posting announcement:', error);
      await ctx.reply('❌ Error posting announcement. Check bot permissions.');
    }
  }

  private generateAnnouncementPost(c: TradingChallenge): string {
    const typeLabel = c.type === 'hybrid' ? 'Hybrid (Demo & Real Account)' :
      c.type === 'demo' ? 'Demo Account' : 'Real Account';

    const startStr = toEAT(c.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const endStr = toEAT(c.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    let prizesSection = '';
    if (c.prize_pool_text) {
      prizesSection = `<b>🏆 PRIZE POOL</b>\n\n<b>${c.prize_pool_text}</b>\n`;
    } else {
      // Fallback: auto-generate from individual prizes
      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
      if (c.type === 'hybrid' || c.type === 'real') {
        const prizes = typeof c.real_prizes === 'string' ? JSON.parse(c.real_prizes) : (c.real_prizes || []);
        prizesSection += '\n<b>Real Account:</b>\n';
        prizes.forEach((p: number, i: number) => {
          prizesSection += `${medals[i] || (i+1)+'️⃣'} ${this.getOrdinal(i + 1)} Place: ${this.formatPrize(p)}\n`;
        });
      }
      if (c.type === 'hybrid' || c.type === 'demo') {
        const prizes = typeof c.demo_prizes === 'string' ? JSON.parse(c.demo_prizes) : (c.demo_prizes || []);
        prizesSection += '\n<b>Demo Account:</b>\n';
        prizes.forEach((p: number, i: number) => {
          prizesSection += `${medals[i] || (i+1)+'️⃣'} ${this.getOrdinal(i + 1)} Place: ${this.formatPrize(p)}\n`;
        });
      }
    }

    let linksText = '';
    if (c.pdf_url) linksText += `\n📄 Challenge Rules: <a href="${c.pdf_url}">Download PDF</a>`;
    if (c.video_url) linksText += `\n🎥 Challenge Guide: <a href="${c.video_url}">Watch Video</a>`;

    return `<b>🎯 BIRRFOREX TRADING CHALLENGE</b>\n` +
      `<b>${c.title}</b>\n\n` +
      `📊 <b>Type:</b> ${typeLabel}\n` +
      `📅 <b>Period:</b> ${startStr} - ${endStr}\n` +
      `💰 <b>Start:</b> $${c.starting_balance} → 🎯 <b>Target:</b> $${c.target_balance}\n\n` +
      prizesSection + '\n' +
      `⚠️ <i>Please read the challenge rules carefully before you start the challenge!</i>\n` +
      linksText +
      `\n\n👉 <b>Tap "Join Challenge" below to register!</b>`;
  }

  private getOrdinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  private formatPrize(p: string | number): string {
    if (typeof p === 'number') return `$${p}`;
    const num = parseFloat(String(p));
    if (!isNaN(num) && String(num) === String(p).trim()) return `$${p}`;
    return String(p);
  }

  // ==================== UPDATE CHALLENGE ====================

  async updateChallenge(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    if (challenges.length === 0) {
      await ctx.reply('❌ No challenges found.');
      return;
    }

    const buttons = challenges.slice(0, 10).map(c => [
      Markup.button.callback(`${c.title} (${c.status})`, `tc_update_select_${c.id}`)
    ]);

    await ctx.reply('Select challenge to update:', Markup.inlineKeyboard(buttons));
  }

  private async handleUpdateCallback(ctx: Context, data: string): Promise<boolean> {
    const telegramId = ctx.from!.id;

    if (data.startsWith('tc_update_select_')) {
      const challengeId = parseInt(data.replace('tc_update_select_', ''));
      await ctx.answerCbQuery();
      await ctx.reply('What do you want to update?', Markup.inlineKeyboard([
        [Markup.button.callback('📄 Replace Rules PDF', `tc_update_pdf_${challengeId}`)],
        [Markup.button.callback('🎥 Replace Video Link', `tc_update_video_${challengeId}`)],
        [Markup.button.callback('🏆 Update Prize Pool Text', `tc_update_prize_pool_${challengeId}`)],
      ]));
      return true;
    }

    if (data.startsWith('tc_update_pdf_')) {
      const challengeId = parseInt(data.replace('tc_update_pdf_', ''));
      tradingAdminSessions.set(telegramId, { step: 'tc_update_pdf_input', data: { update_challenge_id: challengeId } });
      await ctx.answerCbQuery();
      await ctx.reply('Send the new Rules PDF link:');
      return true;
    }

    if (data.startsWith('tc_update_video_')) {
      const challengeId = parseInt(data.replace('tc_update_video_', ''));
      tradingAdminSessions.set(telegramId, { step: 'tc_update_video_input', data: { update_challenge_id: challengeId } });
      await ctx.answerCbQuery();
      await ctx.reply('Send the new video link:');
      return true;
    }

    if (data.startsWith('tc_update_prize_pool_')) {
      const challengeId = parseInt(data.replace('tc_update_prize_pool_', ''));
      tradingAdminSessions.set(telegramId, { step: 'tc_update_prize_pool_input', data: { update_challenge_id: challengeId } });
      await ctx.answerCbQuery();
      await ctx.reply('Send the new <b>Prize Pool</b> text:\n\n<i>This will be displayed exactly as you write it on announcement, promo, and countdown posts.</i>', { parse_mode: 'HTML' });
      return true;
    }

    return false;
  }

  // ==================== LIST / VIEW CHALLENGES ====================

  async listTradingChallenges(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    if (challenges.length === 0) {
      await ctx.reply('📋 No trading challenges yet. Create one with /createtradingchallenge');
      return;
    }

    const statusEmoji: { [key: string]: string } = {
      draft: '📝', registration_open: '🟢', active: '🔵',
      submission_open: '🟡', reviewing: '🟠', completed: '✅',
    };

    const buttons = challenges.slice(0, 15).map(c => [
      Markup.button.callback(
        `${statusEmoji[c.status] || '⚪'} ${c.title}`,
        `tc_view_${c.id}`
      )
    ]);

    await ctx.reply('<b>📋 TRADING CHALLENGES</b>\n\nSelect a challenge for details:', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons),
    });
  }

  private async showChallengeDetails(ctx: Context, challengeId: number) {
    const challenge = await tradingChallengeService.getChallengeById(challengeId);
    if (!challenge) {
      await ctx.answerCbQuery('Not found');
      return;
    }

    const counts = await tradingChallengeService.getRegistrationCounts(challengeId);
    const subCounts = await tradingChallengeService.getSubmissionCount(challengeId);
    const winners = await tradingChallengeService.getWinners(challengeId);

    const startStr = toEAT(challenge.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const endStr = toEAT(challenge.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const text = `<b>📊 ${challenge.title}</b>\n\n` +
      `<b>Status:</b> ${challenge.status}\n` +
      `<b>Type:</b> ${challenge.type}\n` +
      `<b>Period:</b> ${startStr} - ${endStr}\n` +
      `<b>Balance:</b> $${challenge.starting_balance} → $${challenge.target_balance}\n\n` +
      `<b>Registered:</b> ${counts.total} (Demo: ${counts.demo} | Real: ${counts.real})\n` +
      `<b>Submissions:</b> ${subCounts.total} (Demo: ${subCounts.demo} | Real: ${subCounts.real})\n` +
      `<b>Winners:</b> ${winners.length}`;

    await ctx.answerCbQuery();
    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 View Registrations', `tc_view_regs_${challengeId}`)],
        [Markup.button.callback('📎 Export Registrations CSV', `tc_view_export_regs_${challengeId}`)],
        [Markup.button.callback('📎 Export Submissions CSV', `tc_view_export_subs_${challengeId}`)],
        [Markup.button.callback('🏆 View Winners', `tc_view_winners_${challengeId}`)],
        [Markup.button.callback('🗑️ Delete Challenge', `tc_delete_confirm_${challengeId}`)],
      ]),
    });
  }

  // ==================== DELETE CHALLENGE ====================

  private async handleDeleteCallback(ctx: Context, data: string): Promise<boolean> {
    if (data.startsWith('tc_delete_confirm_')) {
      const challengeId = parseInt(data.replace('tc_delete_confirm_', ''));
      const challenge = await tradingChallengeService.getChallengeById(challengeId);
      if (!challenge) {
        await ctx.answerCbQuery('Not found');
        return true;
      }

      const counts = await tradingChallengeService.getRegistrationCounts(challengeId);
      const subCounts = await tradingChallengeService.getSubmissionCount(challengeId);
      const winners = await tradingChallengeService.getWinners(challengeId);

      await ctx.answerCbQuery();
      await ctx.reply(
        `⚠️ <b>This will permanently delete:</b>\n\n` +
        `➡️ Challenge: ${challenge.title}\n` +
        `➡️ ${counts.total} registrations\n` +
        `➡️ ${subCounts.total} submissions\n` +
        `➡️ ${winners.length} winner records\n\n` +
        `<b>This cannot be undone!</b>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Confirm Delete', `tc_delete_yes_${challengeId}`)],
            [Markup.button.callback('❌ Cancel', 'tc_delete_no')],
          ]),
        }
      );
      return true;
    }

    if (data.startsWith('tc_delete_yes_')) {
      const challengeId = parseInt(data.replace('tc_delete_yes_', ''));
      await tradingChallengeService.deleteChallenge(challengeId);
      await ctx.answerCbQuery('Deleted');
      await ctx.reply('✅ Challenge and all related data deleted.');
      return true;
    }

    if (data === 'tc_delete_no') {
      await ctx.answerCbQuery('Cancelled');
      await ctx.reply('❌ Delete cancelled.');
      return true;
    }

    return false;
  }

  // ==================== RETRACT REGISTRATION ====================

  async retractRegistration(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    const challenge = challenges.find(c => ['registration_open', 'active'].includes(c.status)) || challenges[0];

    if (!challenge) {
      await ctx.reply('❌ No active challenge found.');
      return;
    }

    const telegramId = ctx.from!.id;
    tradingAdminSessions.set(telegramId, {
      step: 'tc_retract_username',
      data: { challenge_id: challenge.id, challenge_title: challenge.title },
    });

    await ctx.reply(
      `<b>🔄 Retract Registration</b>\n\nChallenge: <b>${challenge.title}</b>\n\nEnter <b>username</b>, <b>email</b>, or <b>Telegram ID</b>:`,
      { parse_mode: 'HTML' }
    );
  }

  // ==================== ENGAGE FAILED USERS ====================

  async engageFailedUsers(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    const challenge = challenges.find(c => ['registration_open', 'active'].includes(c.status)) || challenges[0];

    if (!challenge) {
      await ctx.reply('❌ No active challenge found.');
      return;
    }

    const failed = await tradingChallengeService.getEngageableFailedAttempts(challenge.id);

    if (failed.length === 0) {
      await ctx.reply('✅ No failed users to engage (all recent or already registered).');
      return;
    }

    const botInfo = await ctx.telegram.getMe();
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🚀 Register Now', `https://t.me/${botInfo.username}?start=tc_register_${challenge.id}`)],
    ]);

    let sent = { allocation: 0, kyc: 0, real_acct: 0, failed: 0 };

    for (const user of failed) {
      let message = '';

      if (user.failure_type === 'allocation') {
        message = `👋 <b>Hello from BirrForex Team!</b>\n\n` +
          `<b>${challenge.title}</b> starting day is approaching fast!\n\n` +
          `Have you created a new Exness account or changed your partner yet?\n\n` +
          `If you have, register now before it's too late!\n\n` +
          `👉 <b>Tap "Register Now" below to join the challenge.</b>`;
        sent.allocation++;
      } else if (user.failure_type === 'kyc') {
        message = `👋 <b>Hello from BirrForex Team!</b>\n\n` +
          `<b>${challenge.title}</b> starting day is approaching fast!\n\n` +
          `Have you completed your Exness account verification yet?\n\n` +
          `If not, verify your account now — it only takes a few minutes!\n` +
          `➡️ Log in to Exness → Settings → Verification\n\n` +
          `Once verified, register for the challenge:\n\n` +
          `👉 <b>Tap "Register Now" below to join.</b>`;
        sent.kyc++;
      } else if (user.failure_type === 'real_acct') {
        message = `👋 <b>Hello from BirrForex Team!</b>\n\n` +
          `<b>${challenge.title}</b> starting day is approaching fast!\n\n` +
          `Have you created a new MT5 Real Account within your Exness yet?\n\n` +
          `Make sure your real account is under the same email you registered with.\n\n` +
          `If you're ready, register now:\n\n` +
          `👉 <b>Tap "Register Now" below to join the challenge.</b>`;
        sent.real_acct++;
      }

      if (message) {
        try {
          await ctx.telegram.sendMessage(user.telegram_id, message, { parse_mode: 'HTML', ...keyboard });
          await tradingChallengeService.markEngaged(challenge.id, user.telegram_id, true);
        } catch (e) {
          sent.failed++;
        }
        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 200));
      }
    }

    const total = sent.allocation + sent.kyc + sent.real_acct;
    await ctx.reply(
      `✅ <b>Engagement messages sent!</b>\n\n` +
      `📊 <b>Total sent:</b> ${total}\n` +
      `   ├── Allocation: ${sent.allocation}\n` +
      `   ├── KYC: ${sent.kyc}\n` +
      `   └── Real Acct: ${sent.real_acct}\n` +
      (sent.failed > 0 ? `\n❌ <b>Failed to send:</b> ${sent.failed} <i>(DMs blocked)</i>` : ''),
      { parse_mode: 'HTML' }
    );
  }

  async exportFailedAttempts(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    const challenge = challenges.find(c => ['registration_open', 'active'].includes(c.status)) || challenges[0];

    if (!challenge) {
      await ctx.reply('❌ No active challenge found.');
      return;
    }

    const failed = await tradingChallengeService.getAllFailedAttempts(challenge.id);

    if (failed.length === 0) {
      await ctx.reply('✅ No failed attempts recorded.');
      return;
    }

    const header = '#,Username,Telegram ID,Email,Failure Type,Attempted At,Engage Count,Last Engaged,DM Successful,Converted,Converted At\n';
    const rows = failed.map((f: any, i: number) =>
      `${i + 1},@${f.username || 'unknown'},${f.telegram_id},${f.email || 'N/A'},${f.failure_type},${new Date(f.attempted_at).toISOString()},${f.engage_count || 0},${f.last_engaged_at ? new Date(f.last_engaged_at).toISOString() : 'Never'},${f.engage_successful ? 'Yes' : 'No'},${f.converted ? 'Yes' : 'No'},${f.converted_at ? new Date(f.converted_at).toISOString() : '-'}\n`
    ).join('');

    const prefix = challenge.title.replace(/\s+/g, '_');

    try {
      await ctx.replyWithDocument({
        source: Buffer.from(header + rows),
        filename: `${prefix}_failed_attempts.csv`,
      });
      await ctx.reply(
        `📊 <b>Failed Attempts Export</b>\n\n` +
        `📋 <b>Challenge:</b> ${challenge.title}\n` +
        `📊 <b>Total failed:</b> ${failed.length}\n` +
        `📊 <b>Later registered:</b> ${failed.filter((f: any) => f.later_registered).length}\n` +
        `📊 <b>Engaged:</b> ${failed.filter((f: any) => f.engaged).length}`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      await ctx.reply('❌ Error generating export.');
    }
  }

  // ==================== VIEW SCHEDULE ====================

  async viewSchedule(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    const challenge = challenges.find(c => !['draft', 'completed'].includes(c.status)) || challenges[0];

    if (!challenge) {
      await ctx.reply('❌ No challenges found.');
      return;
    }

    const now = new Date();
    const eatNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const todayStr = `${eatNow.getUTCFullYear()}-${(eatNow.getUTCMonth() + 1).toString().padStart(2, '0')}-${eatNow.getUTCDate().toString().padStart(2, '0')}`;

    // Convert stored dates to EAT
    const startEAT = new Date(new Date(challenge.start_date).getTime() + 3 * 60 * 60 * 1000);
    const endEAT = new Date(new Date(challenge.end_date).getTime() + 3 * 60 * 60 * 1000);
    const startDateStr = `${startEAT.getUTCFullYear()}-${(startEAT.getUTCMonth() + 1).toString().padStart(2, '0')}-${startEAT.getUTCDate().toString().padStart(2, '0')}`;
    const startTimeStr = `${startEAT.getUTCHours().toString().padStart(2, '0')}:${startEAT.getUTCMinutes().toString().padStart(2, '0')}`;
    const endDateStr = `${endEAT.getUTCFullYear()}-${(endEAT.getUTCMonth() + 1).toString().padStart(2, '0')}-${endEAT.getUTCDate().toString().padStart(2, '0')}`;
    const endTimeStr = `${endEAT.getUTCHours().toString().padStart(2, '0')}:${endEAT.getUTCMinutes().toString().padStart(2, '0')}`;

    let text = `<b>📅 FULL SCHEDULE</b>\n<b>${challenge.title}</b> [${challenge.status}]\n\n`;

    // Countdowns
    const startMs = new Date(startDateStr).getTime();
    const todayMs = new Date(todayStr).getTime();
    const daysToStart = Math.round((startMs - todayMs) / (1000 * 60 * 60 * 24));

    text += `<b>⏰ COUNTDOWNS (8:00 AM EAT):</b>\n`;
    for (let d = 3; d >= 1; d--) {
      const countDate = new Date(startMs - d * 86400000);
      const cStr = `${countDate.getFullYear()}-${(countDate.getMonth() + 1).toString().padStart(2, '0')}-${countDate.getDate().toString().padStart(2, '0')}`;
      const label = d === 1 ? '🚨 Last Chance' : `⏰ ${d}-Day`;
      const status = cStr < todayStr ? '✅ Done' : cStr === todayStr ? '🔴 TODAY' : '⏳ Pending';
      text += `${label}: ${cStr} — ${status}\n`;
    }

    // Challenge start
    text += `\n<b>🚀 CHALLENGE START:</b>\n`;
    text += `${startDateStr} ${startTimeStr} EAT — ${daysToStart <= 0 ? '✅ Started' : `⏳ ${daysToStart} days`}\n`;

    // Daily posts
    text += `\n<b>📊 DAILY POSTS (8:00 AM + 8:00 PM EAT):</b>\n`;
    const cursor = new Date(startDateStr);
    let tradingDay = 0;
    while (tradingDay < 10) {
      const dow = cursor.getDay();
      if (dow >= 1 && dow <= 5) {
        tradingDay++;
        const dStr = `${cursor.getFullYear()}-${(cursor.getMonth() + 1).toString().padStart(2, '0')}-${cursor.getDate().toString().padStart(2, '0')}`;
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const both = [1, 5, 6, 10].includes(tradingDay) ? ' (BOTH)' : ' (Challenge)';
        const status = dStr < todayStr ? '✅' : dStr === todayStr ? '🔴' : '⏳';
        text += `Day ${tradingDay}: ${dStr} ${dayNames[dow]} — ☀️8AM + 🌙8PM${both} ${status}\n`;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Challenge end
    text += `\n<b>🏁 CHALLENGE END:</b>\n`;
    text += `${endDateStr} ${endTimeStr} EAT\n`;
    text += `Midnight fallback: ${endDateStr} next day 00:00\n`;

    // Post-challenge
    text += `\n<b>📋 POST-CHALLENGE:</b>\n`;
    text += `Submission window: 48 hours after end\n`;
    if (challenge.submission_deadline) {
      const dlEAT = new Date(new Date(challenge.submission_deadline).getTime() + 3 * 60 * 60 * 1000);
      text += `Deadline: ${dlEAT.getUTCFullYear()}-${(dlEAT.getUTCMonth() + 1).toString().padStart(2, '0')}-${dlEAT.getUTCDate().toString().padStart(2, '0')} ${dlEAT.getUTCHours().toString().padStart(2, '0')}:${dlEAT.getUTCMinutes().toString().padStart(2, '0')} EAT\n`;
    }

    // Screening
    text += `\n<b>🔍 PARTNER SCREENING:</b>\n`;
    text += `Every night at 10:00 PM EAT (when active)\n`;
    text += `Report: 9:00 AM EAT next day\n`;
    text += `User messages: 8:00 AM EAT\n`;

    // Engagement
    text += `\n<b>📩 AUTO-ENGAGEMENT:</b>\n`;
    text += `Every 10 min between 8:30 AM - 9:30 PM EAT\n`;
    text += `1st: 24h after failure | Then: every 48h\n`;
    text += `Last 3 days: every 24h\n`;

    // Truncate if too long
    if (text.length > 4000) text = text.substring(0, 4000) + '\n\n<i>...truncated</i>';

    await ctx.reply(text, { parse_mode: 'HTML' });
  }

  // ==================== FIND USER ====================

  async findUser(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;
    const telegramId = ctx.from!.id;

    tradingAdminSessions.set(telegramId, {
      step: 'tc_finduser_input',
      data: {},
    });

    await ctx.reply('🔍 Enter <b>username</b>, <b>email</b>, or <b>Telegram ID</b> to search:', { parse_mode: 'HTML' });
  }

  private async processFindUser(ctx: Context, input: string) {
    const search = input.trim().toLowerCase().replace(/^@/, '');
    const telegramId = ctx.from!.id;
    tradingAdminSessions.delete(telegramId);

    const challenges = await tradingChallengeService.getAllChallenges();
    const challenge = challenges.find(c => ['registration_open', 'active', 'submission_open', 'reviewing'].includes(c.status)) || challenges[0];

    if (!challenge) {
      await ctx.reply('❌ No challenges found.');
      return;
    }

    // Search registrations
    const regs = await tradingChallengeService.getAllRegistrations(challenge.id);
    const reg = regs.find(r =>
      r.username?.toLowerCase() === search ||
      r.email?.toLowerCase() === search ||
      String(r.telegram_id) === search
    );

    if (reg) {
      const acctLabel = reg.account_type === 'demo' ? 'Demo' : 'Real';
      const regDate = toEAT(reg.registered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      let status = '✅ <b>Successfully Registered</b>';
      let extra = '';

      if (reg.disqualified) {
        status = '❌ <b>Disqualified</b>';
        extra = `\n❌ <b>Disqualified:</b> ${reg.disqualified_at ? toEAT(reg.disqualified_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}` +
          `\n⚠️ <b>Reason:</b> ${reg.disqualified_reason || 'N/A'}`;
      } else if (reg.partner_status === 'CHANGING') {
        status = '⚠️ <b>Registered — Partner Changing</b>';
        extra = `\n⚠️ <b>Warned:</b> ${reg.partner_warned_at ? toEAT(reg.partner_warned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}`;
      }

      await ctx.reply(
        `<b>🔍 USER FOUND</b>\n\n${status}\n\n` +
        `👤 <b>Username:</b> @${reg.username || 'unknown'}\n` +
        `🆔 <b>Telegram ID:</b> <code>${reg.telegram_id}</code>\n` +
        `📧 <b>Email:</b> ${reg.email}\n` +
        `📊 <b>Category:</b> ${acctLabel}\n` +
        `🏦 <b>Account:</b> ${reg.account_number}\n` +
        `🖥️ <b>Server:</b> ${reg.mt5_server || 'N/A'}\n` +
        `📅 <b>Registered:</b> ${regDate}` +
        extra +
        `\n\n📋 <b>Challenge:</b> ${challenge.title}`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Search failed attempts
    const failed = await tradingChallengeService.getAllFailedAttempts(challenge.id);
    const failedUser = failed.find((f: any) =>
      f.username?.toLowerCase() === search ||
      f.email?.toLowerCase() === search ||
      String(f.telegram_id) === search
    );

    if (failedUser) {
      const attemptDate = toEAT(new Date(failedUser.attempted_at)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const failLabel = failedUser.failure_type === 'allocation' ? 'Allocation' : failedUser.failure_type === 'kyc' ? 'KYC' : 'Real Account';

      await ctx.reply(
        `<b>🔍 USER FOUND</b>\n\n❌ <b>Failed Registration</b>\n\n` +
        `👤 <b>Username:</b> @${failedUser.username || 'unknown'}\n` +
        `🆔 <b>Telegram ID:</b> <code>${failedUser.telegram_id}</code>\n` +
        `📧 <b>Email:</b> ${failedUser.email || 'N/A'}\n` +
        `⚠️ <b>Failed at:</b> ${failLabel}\n` +
        `📅 <b>Attempted:</b> ${attemptDate}\n` +
        `📊 <b>Engaged:</b> ${failedUser.engage_count || 0} times\n` +
        `🔄 <b>Converted:</b> ${failedUser.converted ? 'Yes ✅' : 'No'}\n\n` +
        `📋 <b>Challenge:</b> ${challenge.title}`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    await ctx.reply(`<b>🔍 USER NOT FOUND</b>\n\nNo records found for "<b>${input.trim()}</b>" in any table.`, { parse_mode: 'HTML' });
  }

  // ==================== UNREGISTER ====================

  async unregister(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getActiveChallenges();
    if (challenges.length === 0) {
      await ctx.reply('❌ No active challenges.');
      return;
    }

    const telegramId = ctx.from!.id;
    if (challenges.length === 1) {
      tradingAdminSessions.set(telegramId, {
        step: 'tc_unregister_input',
        data: { challenge_id: challenges[0].id },
      });
      await ctx.reply('Enter username or email to remove:');
    } else {
      const buttons = challenges.map(c => [
        Markup.button.callback(c.title, `tc_unreg_select_${c.id}`)
      ]);
      await ctx.reply('Select challenge:', Markup.inlineKeyboard(buttons));
    }
  }

  private async processUnregister(ctx: Context, input: string) {
    const telegramId = ctx.from!.id;
    const session = tradingAdminSessions.get(telegramId);
    if (!session) return;

    const challengeId = session.data.challenge_id;
    let reg = null;

    if (input.includes('@')) {
      if (input.includes('.')) {
        // Email
        reg = await tradingChallengeService.deleteRegistrationByEmail(challengeId, input);
      } else {
        // Username
        reg = await tradingChallengeService.deleteRegistrationByUsername(challengeId, input);
      }
    } else {
      // Try as email first, then username
      reg = await tradingChallengeService.deleteRegistrationByEmail(challengeId, input);
      if (!reg) {
        reg = await tradingChallengeService.deleteRegistrationByUsername(challengeId, input);
      }
    }

    tradingAdminSessions.delete(telegramId);

    if (reg) {
      await ctx.reply(`✅ Registration removed:\n👤 @${reg.username}\n📧 ${reg.email}\n🏦 ${reg.account_number}`);
      // Notify user
      try {
        await ctx.telegram.sendMessage(
          reg.telegram_id,
          `⚠️ Your registration for the trading challenge has been removed by an administrator.\n\nIf you believe this is an error, please contact @birrFXadmin.`
        );
      } catch (e) {
        // User may have blocked bot
      }
    } else {
      await ctx.reply('❌ Registration not found with that username or email.');
    }
  }

  // ==================== SELECT WINNERS ====================

  async selectWinners(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    const reviewable = challenges.filter(c => c.status === 'reviewing' || c.status === 'submission_open' || c.status === 'completed');

    if (reviewable.length === 0) {
      await ctx.reply('❌ No challenges ready for winner selection.');
      return;
    }

    const telegramId = ctx.from!.id;
    const challenge = reviewable[0]; // Use most recent

    tradingAdminSessions.set(telegramId, {
      step: 'tc_select_real_winners',
      data: { challenge_id: challenge.id, challenge },
    });

    if (challenge.type === 'hybrid' || challenge.type === 'real') {
      const realSubs = await tradingChallengeService.getSubmissionsByCategory(challenge.id, 'real');
      if (realSubs.length > 0) {
        let list = `<b>📊 REAL ACCOUNT SUBMISSIONS (by balance):</b>\n\n`;
        realSubs.forEach((s, i) => {
          list += `${i + 1}. @${s.username || 'unknown'} - $${s.final_balance}\n`;
        });
        list += `\nEnter Real account winner usernames (comma separated):`;
        await ctx.reply(list, { parse_mode: 'HTML' });
      } else {
        tradingAdminSessions.get(telegramId)!.step = 'tc_select_demo_winners';
        await this.promptDemoWinners(ctx, challenge.id);
      }
    } else {
      tradingAdminSessions.get(telegramId)!.step = 'tc_select_demo_winners';
      await this.promptDemoWinners(ctx, challenge.id);
    }
  }

  private async promptDemoWinners(ctx: Context, challengeId: number) {
    const demoSubs = await tradingChallengeService.getSubmissionsByCategory(challengeId, 'demo');
    if (demoSubs.length > 0) {
      let list = `<b>📊 DEMO ACCOUNT SUBMISSIONS (by balance):</b>\n\n`;
      demoSubs.forEach((s, i) => {
        list += `${i + 1}. @${s.username || 'unknown'} - $${s.final_balance}\n`;
      });
      list += `\nEnter Demo account winner usernames (comma separated):`;
      await ctx.reply(list, { parse_mode: 'HTML' });
    } else {
      await this.confirmWinners(ctx);
    }
  }

  private async confirmWinners(ctx: Context) {
    const telegramId = ctx.from!.id;
    const session = tradingAdminSessions.get(telegramId);
    if (!session) return;

    const d = session.data;
    const challenge = d.challenge as TradingChallenge;
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

    let text = `✅ <b>WINNERS SELECTED</b>\n\n`;

    if (d.real_winners && d.real_winners.length > 0) {
      const realPrizes = typeof challenge.real_prizes === 'string' ? JSON.parse(challenge.real_prizes) : (challenge.real_prizes || []);
      text += `<b>🏆 Real Account:</b>\n`;
      d.real_winners.forEach((w: string, i: number) => {
        text += `${medals[i] || (i+1)+'️⃣'} ${this.getOrdinal(i + 1)}: @${w} - Prize: $${realPrizes[i] || 'TBD'}\n`;
      });
      text += '\n';
    }

    if (d.demo_winners && d.demo_winners.length > 0) {
      const demoPrizes = typeof challenge.demo_prizes === 'string' ? JSON.parse(challenge.demo_prizes) : (challenge.demo_prizes || []);
      text += `<b>🏆 Demo Account:</b>\n`;
      d.demo_winners.forEach((w: string, i: number) => {
        text += `${medals[i] || (i+1)+'️⃣'} ${this.getOrdinal(i + 1)}: @${w} - Prize: $${demoPrizes[i] || 'TBD'}\n`;
      });
    }

    session.step = 'tc_confirm_winners';
    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirm & Announce', 'tc_confirm_winners_yes')],
        [Markup.button.callback('❌ Cancel', 'tc_confirm_winners_no')],
      ]),
    });
  }


  // ==================== MESSAGE USER ====================

  async messageUser(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;
    const telegramId = ctx.from!.id;

    tradingAdminSessions.set(telegramId, {
      step: 'tc_msg_username',
      data: {},
    });

    await ctx.reply('Enter <b>username</b>, <b>email</b>, or <b>Telegram ID</b> of the participant:', { parse_mode: 'HTML' });
  }

  // ==================== MANUAL VERIFY ====================

  async handleForwardedMessage(ctx: Context, userId: number, username: string | null, firstName: string | null) {
    const telegramId = ctx.from!.id;
    const session = tradingAdminSessions.get(telegramId);
    if (!session || session.step !== 'tc_mv_forward') return;

    session.data.user_telegram_id = userId;
    session.data.username = username || firstName || 'unknown';

    const displayName = username ? `@${username}` : (firstName || `ID: ${userId}`);
    const challengeId = session.data.challenge_id;
    session.step = 'tc_mv_type';

    await ctx.reply(
      `✅ <b>User detected:</b> ${displayName}\n<b>Telegram ID:</b> <code>${userId}</code>\n\nSelect account type:`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('🏦 Demo Account', `tc_mv_type_demo_${challengeId}`)],
        [Markup.button.callback('💰 Real Account', `tc_mv_type_real_${challengeId}`)],
      ]) }
    );
  }

  async manualVerify(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    const activeChallenge = challenges.find(c => ['registration_open', 'active'].includes(c.status));

    if (!activeChallenge) {
      await ctx.reply('❌ No active challenge found with open registration.');
      return;
    }

    const telegramId = ctx.from!.id;
    tradingAdminSessions.set(telegramId, {
      step: 'tc_mv_forward',
      data: { challenge_id: activeChallenge.id, challenge_title: activeChallenge.title },
    });

    await ctx.reply(
      `<b>📋 Manual Registration</b>\n\nChallenge: <b>${activeChallenge.title}</b>\n\n` +
      `Choose how to identify the user:`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Search by Username', 'tc_mv_search_username')],
        [Markup.button.callback('📨 Forward a Message', 'tc_mv_wait_forward')],
        [Markup.button.callback('✍️ Enter Details Manually', 'tc_mv_manual_entry')],
      ]) }
    );
  }

  // ==================== DISQUALIFY ====================

  async disqualify(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;
    const telegramId = ctx.from!.id;

    tradingAdminSessions.set(telegramId, {
      step: 'tc_dq_username',
      data: {},
    });

    await ctx.reply('Enter the username to disqualify:');
  }

  // ==================== PROMO ====================

  async promo(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getActiveChallenges();
    const allChallenges = await tradingChallengeService.getAllChallenges();
    const promoChallenge = challenges[0] || allChallenges.find(c => c.status === 'registration_open' || c.status === 'draft');

    if (!promoChallenge) {
      await ctx.reply('❌ No active challenge for promo.');
      return;
    }

    const telegramId = ctx.from!.id;
    tradingAdminSessions.set(telegramId, {
      step: 'tc_promo_select',
      data: { challenge_id: promoChallenge.id },
    });

    await ctx.reply('Select promo message:', Markup.inlineKeyboard([
      [Markup.button.callback('1️⃣ Challenge Awareness', `tc_promo_1_${promoChallenge.id}`)],
      [Markup.button.callback('2️⃣ Registration Push', `tc_promo_2_${promoChallenge.id}`)],
      [Markup.button.callback('3️⃣ Deadline Approaching', `tc_promo_3_${promoChallenge.id}`)],
    ]));
  }

  // ==================== EXPORT REGISTRATIONS ====================

  async exportRegistrations(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    if (challenges.length === 0) { await ctx.reply('❌ No challenges found.'); return; }

    const challenge = challenges[0];
    const registrations = await tradingChallengeService.getAllRegistrations(challenge.id);
    if (registrations.length === 0) { await ctx.reply('❌ No registrations found.'); return; }

    const header = 'Username,Telegram ID,Email,Type,Account Number,MT5 Server,Status,Registered At\n';
    const toRow = (r: any) => `@${r.username || 'unknown'},${r.telegram_id},${r.email},${r.account_type},${r.account_number},${r.mt5_server || 'N/A'},${r.status},${new Date(r.registered_at).toISOString()}\n`;
    const prefix = challenge.title.replace(/\s+/g, '_');

    try {
      if (challenge.type === 'hybrid') {
        const realRegs = registrations.filter(r => r.account_type === 'real');
        const demoRegs = registrations.filter(r => r.account_type === 'demo');

        if (realRegs.length > 0) {
          await ctx.replyWithDocument({ source: Buffer.from(header + realRegs.map(toRow).join('')), filename: `${prefix}_real_registrations.csv` });
        }
        if (demoRegs.length > 0) {
          await ctx.replyWithDocument({ source: Buffer.from(header + demoRegs.map(toRow).join('')), filename: `${prefix}_demo_registrations.csv` });
        }
        await ctx.reply(`📊 <b>Registrations Export</b>\n\n📋 <b>${challenge.title}</b>\n📊 <b>Real:</b> ${realRegs.length}\n📊 <b>Demo:</b> ${demoRegs.length}\n📊 <b>Total:</b> ${registrations.length}`, { parse_mode: 'HTML' });
      } else {
        await ctx.replyWithDocument({ source: Buffer.from(header + registrations.map(toRow).join('')), filename: `${prefix}_registrations.csv` });
      }
    } catch (e) {
      console.error('Error exporting registrations:', e);
      await ctx.reply('❌ Error generating export.');
    }
  }

  async exportSubmissions(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    if (challenges.length === 0) { await ctx.reply('❌ No challenges found.'); return; }

    const challenge = challenges[0];
    const submissions = await tradingChallengeService.getSubmissions(challenge.id);
    if (submissions.length === 0) { await ctx.reply('❌ No submissions found for this challenge.'); return; }

    const realSubs = submissions.filter(s => s.account_type === 'real').sort((a, b) => b.final_balance - a.final_balance);
    const demoSubs = submissions.filter(s => s.account_type === 'demo').sort((a, b) => b.final_balance - a.final_balance);

    const header = '#,Username,Email,Account Number,MT5 Server,Investor Password,Final Balance,Screenshot,Submitted At\n';
    const toRow = (s: any, i: number) => `${i + 1},@${s.username || 'unknown'},${s.email},${s.account_number},${s.mt5_server || 'N/A'},${s.investor_password},${s.final_balance},${s.screenshot_link || 'N/A'},${new Date(s.submitted_at).toISOString()}\n`;
    const prefix = challenge.title.replace(/\s+/g, '_');

    try {
      if (challenge.type === 'hybrid') {
        if (realSubs.length > 0) {
          await ctx.replyWithDocument({ source: Buffer.from(header + realSubs.map(toRow).join('')), filename: `${prefix}_real_submissions.csv` });
        }
        if (demoSubs.length > 0) {
          await ctx.replyWithDocument({ source: Buffer.from(header + demoSubs.map(toRow).join('')), filename: `${prefix}_demo_submissions.csv` });
        }
      } else {
        const allSorted = submissions.sort((a, b) => b.final_balance - a.final_balance);
        await ctx.replyWithDocument({ source: Buffer.from(header + allSorted.map(toRow).join('')), filename: `${prefix}_submissions.csv` });
      }

      await ctx.reply(
        `📊 <b>Submissions Export</b>\n\n` +
        `📋 <b>Challenge:</b> ${challenge.title}\n` +
        `📊 <b>Real submissions:</b> ${realSubs.length}\n` +
        `📊 <b>Demo submissions:</b> ${demoSubs.length}\n` +
        `📊 <b>Total:</b> ${submissions.length}`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      console.error('Error exporting submissions:', e);
      await ctx.reply('❌ Error generating export.');
    }
  }

  // ==================== REG SUMMARY ====================

  async regSummary(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    const challenge = challenges.find(c => c.status === 'registration_open') || challenges[0];

    if (!challenge) {
      await ctx.reply('❌ No challenges found.');
      return;
    }

    const counts = await tradingChallengeService.getRegistrationCounts(challenge.id);
    const totalStats = await tradingChallengeService.getTotalStats(challenge.id);
    const startStr = toEAT(challenge.start_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

    const text = `<b>📊 REGISTRATION SUMMARY</b>\n<b>${challenge.title}</b>\n\n` +
      `<b>📊 TOTALS:</b>\n` +
      `➡️ <b>Total Registered:</b> ${counts.total}\n` +
      `   ├── Demo: ${counts.demo}\n` +
      `   └── Real: ${counts.real}\n` +
      `➡️ <b>Total Failed Attempts:</b> ${parseInt(totalStats?.total_allocation_failures || '0') + parseInt(totalStats?.total_kyc_failures || '0') + parseInt(totalStats?.total_real_acct_failures || '0')}\n` +
      `➡️ <b>Pending Manual Reviews:</b> ${totalStats?.total_manual_reviews || 0}\n\n` +
      `⏰ <b>Challenge starts:</b> ${startStr}`;

    await ctx.reply(text, { parse_mode: 'HTML' });
  }

  async regStats(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    const challenge = challenges.find(c => ['registration_open', 'active'].includes(c.status)) || challenges[0];

    if (!challenge) {
      await ctx.reply('❌ No challenges found.');
      return;
    }

    const counts = await tradingChallengeService.getRegistrationCounts(challenge.id);
    const totalStats = await tradingChallengeService.getTotalStats(challenge.id);

    const allocFail = parseInt(totalStats?.total_allocation_failures || '0');
    const kycFail = parseInt(totalStats?.total_kyc_failures || '0');
    const realAcctFail = parseInt(totalStats?.total_real_acct_failures || '0');
    const manualReviews = parseInt(totalStats?.total_manual_reviews || '0');
    const acctChanges = parseInt(totalStats?.total_account_changes || '0');
    const catSwitches = parseInt(totalStats?.total_category_switches || '0');
    const allocRecov = parseInt(totalStats?.total_allocation_recoveries || '0');
    const kycRecov = parseInt(totalStats?.total_kyc_recoveries || '0');
    const realAcctRecov = parseInt(totalStats?.total_real_acct_recoveries || '0');
    const totalFailed = allocFail + kycFail + realAcctFail;

    const text = `<b>📊 FULL REGISTRATION STATS</b>\n<b>${challenge.title}</b>\n\n` +
      `<b>✅ SUCCESSFUL REGISTRATIONS:</b>\n` +
      `➡️ <b>Total Registered:</b> ${counts.total}\n` +
      `   ├── Demo: ${counts.demo}\n` +
      `   └── Real: ${counts.real}\n\n` +
      `<b>❌ FAILED REGISTRATIONS:</b>\n` +
      `➡️ <b>Total Failed:</b> ${totalFailed}\n` +
      `   ├── Allocation Failed: ${allocFail}${allocRecov > 0 ? ` <i>(${allocRecov} recovered ✅)</i>` : ''}\n` +
      `   ├── KYC Failed: ${kycFail}${kycRecov > 0 ? ` <i>(${kycRecov} recovered ✅)</i>` : ''}\n` +
      `   └── Real Acct Not Allocated: ${realAcctFail}${realAcctRecov > 0 ? ` <i>(${realAcctRecov} recovered ✅)</i>` : ''}\n\n` +
      `<b>📋 OTHER ACTIVITY:</b>\n` +
      `➡️ <b>Manual Reviews:</b> ${manualReviews}\n` +
      `➡️ <b>Account Changes:</b> ${acctChanges}\n` +
      `➡️ <b>Category Switches:</b> ${catSwitches}`;

    await ctx.reply(text, { parse_mode: 'HTML' });
  }

  async todaysRegStat(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    const challenge = challenges.find(c => ['registration_open', 'active'].includes(c.status)) || challenges[0];

    if (!challenge) {
      await ctx.reply('❌ No challenges found.');
      return;
    }

    // Get today's date in EAT
    const now = new Date();
    const eatTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const todayStr = `${eatTime.getUTCFullYear()}-${(eatTime.getUTCMonth() + 1).toString().padStart(2, '0')}-${eatTime.getUTCDate().toString().padStart(2, '0')}`;
    const dateDisplay = toEAT(now).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const stats = await tradingChallengeService.getDailyStats(challenge.id, todayStr);

    if (!stats) {
      await ctx.reply(`<b>📊 TODAY'S REGISTRATION STATS</b>\n<b>${challenge.title}</b>\n📅 ${dateDisplay}\n\n<i>No activity today.</i>`, { parse_mode: 'HTML' });
      return;
    }

    const allocFail = stats.allocation_failures || 0;
    const kycFail = stats.kyc_failures || 0;
    const realAcctFail = stats.real_acct_failures || 0;
    const totalFailed = allocFail + kycFail + realAcctFail;
    const allocRecov = stats.allocation_recoveries || 0;
    const kycRecov = stats.kyc_recoveries || 0;
    const realAcctRecov = stats.real_acct_recoveries || 0;

    const text = `<b>📊 TODAY'S REGISTRATION STATS</b>\n<b>${challenge.title}</b>\n📅 ${dateDisplay}\n\n` +
      `<b>✅ New Registrations:</b> ${stats.new_registrations || 0}\n` +
      `   ├── Demo: ${stats.demo_registrations || 0}\n` +
      `   └── Real: ${stats.real_registrations || 0}\n\n` +
      `<b>❌ Failed Registrations:</b> ${totalFailed}\n` +
      `   ├── Allocation Failed: ${allocFail}\n` +
      `   ├── KYC Failed: ${kycFail}\n` +
      `   └── Real Acct Not Allocated: ${realAcctFail}\n\n` +
      `<b>📋 Other Activity:</b>\n` +
      `➡️ <b>Manual Reviews:</b> ${stats.manual_reviews || 0}\n` +
      `➡️ <b>Account Changes:</b> ${stats.account_changes || 0}\n` +
      `➡️ <b>Category Switches:</b> ${stats.category_switches || 0}\n\n` +
      `<b>🔄 Recoveries:</b>\n` +
      `   ├── After Allocation Fail: ${allocRecov}${allocRecov > 0 ? ' ✅' : ''}\n` +
      `   ├── After KYC Fail: ${kycRecov}${kycRecov > 0 ? ' ✅' : ''}\n` +
      `   └── After Real Acct Fail: ${realAcctRecov}${realAcctRecov > 0 ? ' ✅' : ''}`;

    await ctx.reply(text, { parse_mode: 'HTML' });
  }

  private async exportRegistrationsForChallenge(ctx: Context, challengeId: number) {
    const challenge = await tradingChallengeService.getChallengeById(challengeId);
    if (!challenge) { await ctx.reply('❌ Challenge not found.'); return; }
    const registrations = await tradingChallengeService.getAllRegistrations(challengeId);
    if (registrations.length === 0) { await ctx.reply('❌ No registrations found.'); return; }
    const header = 'Username,Telegram ID,Email,Type,Account Number,MT5 Server,Status,Registered At\n';
    const toRow = (r: any) => `@${r.username || 'unknown'},${r.telegram_id},${r.email},${r.account_type},${r.account_number},${r.mt5_server || 'N/A'},${r.status},${new Date(r.registered_at).toISOString()}\n`;
    const prefix = challenge.title.replace(/\s+/g, '_');
    try {
      if (challenge.type === 'hybrid') {
        const realRegs = registrations.filter(r => r.account_type === 'real');
        const demoRegs = registrations.filter(r => r.account_type === 'demo');
        if (realRegs.length > 0) await ctx.replyWithDocument({ source: Buffer.from(header + realRegs.map(toRow).join('')), filename: `${prefix}_real_registrations.csv` });
        if (demoRegs.length > 0) await ctx.replyWithDocument({ source: Buffer.from(header + demoRegs.map(toRow).join('')), filename: `${prefix}_demo_registrations.csv` });
      } else {
        await ctx.replyWithDocument({ source: Buffer.from(header + registrations.map(toRow).join('')), filename: `${prefix}_registrations.csv` });
      }
    } catch (e) { await ctx.reply('❌ Error generating export.'); }
  }

  private async exportSubmissionsForChallenge(ctx: Context, challengeId: number) {
    const challenge = await tradingChallengeService.getChallengeById(challengeId);
    if (!challenge) { await ctx.reply('❌ Challenge not found.'); return; }
    const submissions = await tradingChallengeService.getSubmissions(challengeId);
    if (submissions.length === 0) { await ctx.reply('❌ No submissions found.'); return; }
    const header = '#,Username,Email,Account Number,MT5 Server,Investor Password,Final Balance,Screenshot,Submitted At\n';
    const toRow = (s: any, i: number) => `${i + 1},@${s.username || 'unknown'},${s.email},${s.account_number},${s.mt5_server || 'N/A'},${s.investor_password},${s.final_balance},${s.screenshot_link || 'N/A'},${new Date(s.submitted_at).toISOString()}\n`;
    const prefix = challenge.title.replace(/\s+/g, '_');
    try {
      if (challenge.type === 'hybrid') {
        const realSubs = submissions.filter(s => s.account_type === 'real').sort((a, b) => b.final_balance - a.final_balance);
        const demoSubs = submissions.filter(s => s.account_type === 'demo').sort((a, b) => b.final_balance - a.final_balance);
        if (realSubs.length > 0) await ctx.replyWithDocument({ source: Buffer.from(header + realSubs.map(toRow).join('')), filename: `${prefix}_real_submissions.csv` });
        if (demoSubs.length > 0) await ctx.replyWithDocument({ source: Buffer.from(header + demoSubs.map(toRow).join('')), filename: `${prefix}_demo_submissions.csv` });
      } else {
        const sorted = submissions.sort((a, b) => b.final_balance - a.final_balance);
        await ctx.replyWithDocument({ source: Buffer.from(header + sorted.map(toRow).join('')), filename: `${prefix}_submissions.csv` });
      }
    } catch (e) { await ctx.reply('❌ Error generating export.'); }
  }

  async viewSubmissions(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    const challenge = challenges[0];

    if (!challenge) {
      await ctx.reply('❌ No challenges found.');
      return;
    }

    const submissions = await tradingChallengeService.getSubmissions(challenge.id);

    if (submissions.length === 0) {
      await ctx.reply('❌ No submissions found for this challenge.');
      return;
    }

    const realSubs = submissions.filter(s => s.account_type === 'real').sort((a, b) => b.final_balance - a.final_balance);
    const demoSubs = submissions.filter(s => s.account_type === 'demo').sort((a, b) => b.final_balance - a.final_balance);

    const sendCategory = async (subs: typeof submissions, label: string) => {
      if (subs.length === 0) return;
      await ctx.reply(`<b>📊 ${label} SUBMISSIONS (${subs.length})</b>\n<i>Sorted by balance, highest first</i>`, { parse_mode: 'HTML' });

      for (let i = 0; i < subs.length; i++) {
        const s = subs[i];
        const caption = `<b>#${i + 1} — @${s.username || 'unknown'}</b>\n\n` +
          `📧 <b>Email:</b> ${s.email}\n` +
          `🏦 <b>Account:</b> ${s.account_number}\n` +
          `🖥️ <b>Server:</b> ${s.mt5_server || 'N/A'}\n` +
          `💰 <b>Final Balance:</b> $${Number(s.final_balance).toFixed(2)}\n` +
          `🔑 <b>Password:</b> <code>${s.investor_password}</code>`;

        try {
          if (s.balance_screenshot_file_id) {
            await ctx.replyWithPhoto(s.balance_screenshot_file_id, {
              caption,
              parse_mode: 'HTML',
            });
          } else {
            await ctx.reply(caption + '\n📸 <i>No screenshot</i>', { parse_mode: 'HTML' });
          }
        } catch (e) {
          await ctx.reply(caption + '\n📸 <i>Screenshot unavailable</i>', { parse_mode: 'HTML' });
        }

        // Small delay to avoid rate limits
        if (i < subs.length - 1) await new Promise(r => setTimeout(r, 500));
      }
    };

    await sendCategory(realSubs, 'REAL ACCOUNT');
    await sendCategory(demoSubs, 'DEMO ACCOUNT');

    await ctx.reply(`✅ <b>All ${submissions.length} submissions displayed.</b>`, { parse_mode: 'HTML' });
  }

  // ==================== PROMO HANDLER ====================

  private async handlePromoCallback(ctx: Context, data: string): Promise<boolean> {
    // Format: tc_promo_N_challengeId
    const parts = data.split('_');
    const promoNum = parseInt(parts[2]);
    const challengeId = parseInt(parts[3]);

    const telegramId = ctx.from!.id;
    tradingAdminSessions.set(telegramId, {
      step: 'tc_promo_target',
      data: { challenge_id: challengeId, promo_num: promoNum },
    });

    await ctx.answerCbQuery();
    await ctx.reply('Post to:', Markup.inlineKeyboard([
      [Markup.button.callback('📢 Main Channel', `tc_promo_send_main`)],
      [Markup.button.callback('🎯 Challenge Channel', `tc_promo_send_challenge`)],
      [Markup.button.callback('📢 Both Channels', `tc_promo_send_both`)],
    ]));
    return true;
  }

  // Handle promo send target in handleCallback — add to the promo check
  async handlePromoSend(ctx: Context, target: string) {
    const telegramId = ctx.from!.id;
    const session = tradingAdminSessions.get(telegramId);
    if (!session) return;

    const challenge = await tradingChallengeService.getChallengeById(session.data.challenge_id);
    if (!challenge) return;

    const botInfo = await ctx.telegram.getMe();
    const text = this.generatePromoText(challenge, session.data.promo_num, botInfo.username!);

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🚀 Join Challenge', `https://t.me/${botInfo.username}?start=tc_register_${challenge.id}`)],
      [Markup.button.url('💰 Open Exness Account', config.exnessPartnerSignupLink)],
    ]);

    const opts = { parse_mode: 'HTML' as const, ...keyboard, link_preview_options: { is_disabled: true } };

    try {
      if (target === 'main' || target === 'both') {
        await ctx.telegram.sendMessage(config.mainChannelId, text, opts);
      }
      if (target === 'challenge' || target === 'both') {
        await ctx.telegram.sendMessage(config.challengeChannelId, text, opts);
      }
      tradingAdminSessions.delete(telegramId);
      await ctx.answerCbQuery('Posted!');
      await ctx.reply('✅ Promo posted!');
    } catch (e) {
      console.error('Error posting promo:', e);
      await ctx.reply('❌ Error posting promo.');
    }
  }

  private generatePromoText(c: TradingChallenge, promoNum: number, botUsername: string): string {
    const startStr = toEAT(c.start_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    const periodStr = `${toEAT(c.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${toEAT(c.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    let links = '';
    if (c.pdf_url) links += `\n📄 Challenge Rules: <a href="${c.pdf_url}">Download PDF</a>`;
    if (c.video_url) links += `\n🎥 Challenge Guide: <a href="${c.video_url}">Watch Video</a>`;

    const prizePoolSection = c.prize_pool_text ? `\n<b>🏆 PRIZE POOL</b>\n\n<b>${c.prize_pool_text}</b>\n` : '';

    if (promoNum === 1) {
      return `<b>🎯 BIRRFOREX TRADING CHALLENGE IS HERE!</b>\n\n<b>${c.title}</b>\n\n💰 Start with <b>$${c.starting_balance}</b> → 🎯 Hit <b>$${c.target_balance}</b>\n\n📅 <b>Challenge Period:</b> ${periodStr}\n${prizePoolSection}\nOpen to Demo & Real account traders!\nRegister now and show your trading skills 💪\n${links}\n\n👉 <b>Tap \"Join Challenge\" below to register!</b>`;
    } else if (promoNum === 2) {
      return `<b>📢 HAVE YOU REGISTERED YET?</b>\n\n<b>${c.title}</b> is coming up!\n${prizePoolSection}\nRegistration is <b>FREE</b> and takes 2 minutes!\n\nDon't miss your chance to compete 🔥\n${links}\n\n👉 <b>Tap \"Join Challenge\" below to register!</b>`;
    } else {
      return `<b>⏰ DEADLINE IS APPROACHING!</b>\n\n<b>${c.title}</b> registration is closing soon!\n\n📅 <b>Start:</b> ${startStr}\n${prizePoolSection}\nAfter the challenge starts, registration closes.\nDon't wait until the last minute!\n\nSecure your spot <b>NOW</b> 🚀\n${links}\n\n👉 <b>Tap \"Join Challenge\" below to register!</b>`;
    }
  }

  private getTopPrize(c: TradingChallenge): string {
    const realPrizes = typeof c.real_prizes === 'string' ? JSON.parse(c.real_prizes) : (c.real_prizes || []);
    const demoPrizes = typeof c.demo_prizes === 'string' ? JSON.parse(c.demo_prizes) : (c.demo_prizes || []);
    const allPrizes = [...realPrizes, ...demoPrizes];
    // Try to find highest numeric prize, otherwise return first prize
    const numericPrizes = allPrizes.map((p: any) => parseFloat(String(p))).filter((n: number) => !isNaN(n));
    if (numericPrizes.length > 0) return `$${Math.max(...numericPrizes)}`;
    return allPrizes[0] || 'prizes';
  }

  private formatPrizeList(c: TradingChallenge, category: 'real' | 'demo'): string {
    const prizes = category === 'real'
      ? (typeof c.real_prizes === 'string' ? JSON.parse(c.real_prizes) : (c.real_prizes || []))
      : (typeof c.demo_prizes === 'string' ? JSON.parse(c.demo_prizes) : (c.demo_prizes || []));
    return prizes.map((p: number) => this.formatPrize(p)).join(' / ') || 'N/A';
  }

  // ==================== SAVE & ANNOUNCE WINNERS ====================

  private async saveAndAnnounceWinners(ctx: Context) {
    const telegramId = ctx.from!.id;
    const session = tradingAdminSessions.get(telegramId);
    if (!session) return;

    const d = session.data;
    const challenge = d.challenge as TradingChallenge;

    try {
      // Clear existing winners
      await tradingChallengeService.deleteWinners(challenge.id);

      const realPrizes = typeof challenge.real_prizes === 'string' ? JSON.parse(challenge.real_prizes) : (challenge.real_prizes || []);
      const demoPrizes = typeof challenge.demo_prizes === 'string' ? JSON.parse(challenge.demo_prizes) : (challenge.demo_prizes || []);

      // Save real winners
      if (d.real_winners) {
        for (let i = 0; i < d.real_winners.length; i++) {
          const username = d.real_winners[i];
          const regs = await tradingChallengeService.getAllRegistrations(challenge.id);
          const reg = regs.find(r => r.username?.toLowerCase() === username.toLowerCase());
          if (reg) {
            await tradingChallengeService.createWinner({
              challenge_id: challenge.id,
              registration_id: reg.id,
              category: 'real',
              position: i + 1,
              prize_amount: `$${realPrizes[i] || 'TBD'}`,
            });
          }
        }
      }

      // Save demo winners
      if (d.demo_winners) {
        for (let i = 0; i < d.demo_winners.length; i++) {
          const username = d.demo_winners[i];
          const regs = await tradingChallengeService.getAllRegistrations(challenge.id);
          const reg = regs.find(r => r.username?.toLowerCase() === username.toLowerCase());
          if (reg) {
            await tradingChallengeService.createWinner({
              challenge_id: challenge.id,
              registration_id: reg.id,
              category: 'demo',
              position: i + 1,
              prize_amount: `$${demoPrizes[i] || 'TBD'}`,
            });
          }
        }
      }

      await tradingChallengeService.updateChallengeStatus(challenge.id, 'completed');

      // Post announcement
      await this.postWinnerAnnouncement(ctx, challenge);

      // DM winners
      await this.dmWinners(ctx, challenge);

      tradingAdminSessions.delete(telegramId);
      await ctx.answerCbQuery('Winners announced!');
      await ctx.reply('✅ Winners announced and notified!');
    } catch (e) {
      console.error('Error saving winners:', e);
      await ctx.reply('❌ Error saving winners.');
    }
  }

  private async postWinnerAnnouncement(ctx: Context, challenge: TradingChallenge) {
    const winners = await tradingChallengeService.getWinners(challenge.id);
    const counts = await tradingChallengeService.getRegistrationCounts(challenge.id);
    const subCounts = await tradingChallengeService.getSubmissionCount(challenge.id);
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    const periodStr = `${toEAT(challenge.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${toEAT(challenge.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    let text = `<b>🏆 TRADING CHALLENGE RESULTS 🏆</b>\n<b>${challenge.title}</b>\n\n📅 <b>Period:</b> ${periodStr}\n\n`;

    const realWinners = winners.filter(w => w.category === 'real');
    const demoWinners = winners.filter(w => w.category === 'demo');

    if (realWinners.length > 0) {
      text += `<b>🏆 REAL ACCOUNT WINNERS</b>\n\n`;
      realWinners.forEach((w, i) => {
        text += `${medals[i] || (i+1)+'️⃣'} <b>${this.getOrdinal(w.position)} Place:</b> @${w.username} - $${w.final_balance} → <b>Prize: ${w.prize_amount}</b>\n`;
      });
      text += '\n';
    }

    if (demoWinners.length > 0) {
      text += `<b>🏆 DEMO ACCOUNT WINNERS</b>\n\n`;
      demoWinners.forEach((w, i) => {
        text += `${medals[i] || (i+1)+'️⃣'} <b>${this.getOrdinal(w.position)} Place:</b> @${w.username} - $${w.final_balance} → <b>Prize: ${w.prize_amount}</b>\n`;
      });
      text += '\n';
    }

    text += `<b>🎁 BONUS</b>\n` +
      `➡️ All Real Account participants are invited to join <b>BirrForex Live Trading Team</b>\n` +
      `➡️ Demo traders who hit the target are invited to join <b>BirrForex Live Trading Team</b>\n\n` +
      `👥 <b>Total Participants:</b> ${counts.total} (Real: ${counts.real} | Demo: ${counts.demo})\n` +
      `📋 <b>Submissions Received:</b> ${subCounts.total} (Real: ${subCounts.real} | Demo: ${subCounts.demo})\n\n` +
      `📌 <b>NB:</b> <i>The balance shown is the net qualified profit after deducting trades against the rules. Winners' trade history exports and prize delivery proof will be posted at</i> <b>@${config.challengeChannelUsername}</b>\n\n` +
      `<i>Congratulations to all winners!</i> 🎉\n` +
      `<i>Thank you to everyone who participated!</i>\n\n` +
      `Stay tuned for the next challenge on <b>@${config.mainChannelUsername}</b>`;

    const opts = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };

    try {
      await ctx.telegram.sendMessage(config.mainChannelId, text, opts);
      await ctx.telegram.sendMessage(config.challengeChannelId, text, opts);
    } catch (e) {
      console.error('Error posting winner announcement:', e);
    }
  }

  private async dmWinners(ctx: Context, challenge: TradingChallenge) {
    const winners = await tradingChallengeService.getWinners(challenge.id);

    for (const winner of winners) {
      const posLabel = this.getOrdinal(winner.position);
      const acctLabel = winner.account_type === 'demo' ? 'Demo Account' : 'Real Account';

      const text = `<b>🏆 CONGRATULATIONS! 🏆</b>\n\n` +
        `You won <b>${posLabel} Place</b> in <b>${challenge.title}!</b>\n\n` +
        `📊 <b>Your Results:</b>\n` +
        `💰 <b>Final Balance:</b> $${winner.final_balance}\n` +
        `🏦 <b>Account:</b> ${winner.account_number}\n` +
        `📊 <b>Type:</b> ${acctLabel}\n\n` +
        `🎁 <b>Your Prize: ${winner.prize_amount}</b>\n\n` +
        `📸 <b>TO CLAIM YOUR PRIZE:</b>\nDM <b>@birrFXadmin</b> with a screenshot of this message within <b>24 HOURS.</b>\n\n` +
        `⚠️ <i>Prize must be claimed within 24 HOURS</i>\n\n` +
        `<i>Thank you for participating and congratulations!</i> 🎉`;

      try {
        await ctx.telegram.sendMessage(winner.telegram_id, text, { parse_mode: 'HTML' });
      } catch (e) {
        console.error(`Could not DM winner ${winner.username}:`, e);
      }
    }
  }

  // ==================== MESSAGE USER HELPER ====================

  private async sendMessageToUser(ctx: Context, input: string, message: string) {
    const challenges = await tradingChallengeService.getAllChallenges();
    const searchInput = input.toLowerCase().replace(/^@/, '');
    let reg = null;

    for (const c of challenges) {
      const regs = await tradingChallengeService.getAllRegistrations(c.id);
      reg = regs.find(r =>
        r.username?.toLowerCase() === searchInput ||
        r.email?.toLowerCase() === searchInput ||
        String(r.telegram_id) === searchInput
      );
      if (reg) break;
    }

    if (!reg) {
      await ctx.reply(`❌ User <b>${input}</b> not found in any challenge registrations.\n<i>You can search by username, email, or Telegram ID.</i>`, { parse_mode: 'HTML' });
      return;
    }

    const text = `<b>📩 MESSAGE FROM BIRRFOREX CHALLENGE TEAM</b>\n\n${message}\n\n⚠️ Please reply to <b>@birrFXadmin</b> with the requested information.\n<i>(Include a screenshot of this message)</i>`;

    try {
      await ctx.telegram.sendMessage(reg.telegram_id, text, { parse_mode: 'HTML' });
      await ctx.reply(`✅ Message sent to @${reg.username || reg.email}`);
    } catch (e) {
      await ctx.reply(`❌ Could not send message. User may have blocked the bot.`);
    }
  }

  // ==================== DISQUALIFY HELPER ====================

  private async processDisqualify(ctx: Context, username: string, reason: string) {
    const challenges = await tradingChallengeService.getAllChallenges();
    let reg = null;
    let challengeTitle = '';

    for (const c of challenges) {
      const regs = await tradingChallengeService.getAllRegistrations(c.id);
      reg = regs.find(r => r.username?.toLowerCase() === username.toLowerCase());
      if (reg) {
        challengeTitle = c.title;
        break;
      }
    }

    if (!reg) {
      await ctx.reply(`❌ User @${username} not found.`);
      return;
    }

    // Update status
    await tradingChallengeService.deleteRegistration(reg.id);

    const text = `<b>❌ DISQUALIFIED</b>\n\nYou have been disqualified from <b>${challengeTitle}</b>.\n\n<b>Reason:</b> ${reason}\n\nIf you believe this is an error, please contact @birrFXadmin.`;

    try {
      await ctx.telegram.sendMessage(reg.telegram_id, text, { parse_mode: 'HTML' });
      await ctx.reply(`✅ @${username} disqualified and notified.\nReason: ${reason}`);
    } catch (e) {
      await ctx.reply(`✅ @${username} disqualified. Could not send DM notification.`);
    }
  }
  // ==================== CHANCE FOR LATE ====================

  async chanceForLate(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    const challenge = challenges.find(c => c.status === 'active') || challenges[0];

    if (!challenge) {
      await ctx.reply('❌ No active challenge found.');
      return;
    }

    const telegramId = ctx.from!.id;
    tradingAdminSessions.set(telegramId, {
      step: 'tc_late_post_text',
      data: { challenge_id: challenge.id, challenge_title: challenge.title },
    });

    await ctx.reply(
      `<b>⏰ Chance for Late</b>\n\nChallenge: <b>${challenge.title}</b>\n\n` +
      `Send your post content now.\n\n` +
      `➡️ Send <b>text</b> for a text-only post\n` +
      `➡️ Send a <b>photo with caption</b> for a post with image\n\n` +
      `<i>Change Account + Switch to Real buttons will be added (6-hour window).</i>`,
      { parse_mode: 'HTML' }
    );
  }

  // ==================== ADDITIONAL POST ====================

  async additionalPost(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    if (challenges.length === 0) {
      await ctx.reply('❌ No trading challenges found. Create one first.');
      return;
    }

    const challenge = challenges[0]; // Most recent
    const telegramId = ctx.from!.id;
    tradingAdminSessions.set(telegramId, {
      step: 'tc_additional_post_text',
      data: { challenge_id: challenge.id, challenge_title: challenge.title },
    });

    await ctx.reply(
      `<b>📝 Additional Post</b>\n\nChallenge: <b>${challenge.title}</b>\n\nSend your post content now.\n\n` +
      `➡️ Send <b>text</b> for a text-only post\n` +
      `➡️ Send a <b>photo with caption</b> for a post with image\n\n` +
      `<i>The Join Challenge and Open Exness Account buttons will be added automatically.</i>`,
      { parse_mode: 'HTML' }
    );
  }

  async handlePhoto(ctx: Context, fileId: string, caption: string) {
    const telegramId = ctx.from!.id;
    const session = tradingAdminSessions.get(telegramId);
    if (!session) return;

    if (session.step === 'tc_late_post_text') {
      session.data.photo_file_id = fileId;
      session.data.post_text = caption || '';
      session.data.post_entities = (ctx.message as any)?.caption_entities || [];
      session.step = 'tc_late_post_target';

      await ctx.reply('📸 Photo received! Where do you want to post?', Markup.inlineKeyboard([
        [Markup.button.callback('📢 Main Channel', 'tc_latepost_main')],
        [Markup.button.callback('🎯 Challenge Channel', 'tc_latepost_challenge')],
        [Markup.button.callback('📢 Both Channels', 'tc_latepost_both')],
        [Markup.button.callback('❌ Cancel', 'tc_latepost_cancel')],
      ]));
      return;
    }

    if (session.step === 'tc_additional_post_text') {
      session.data.photo_file_id = fileId;
      session.data.post_text = caption || '';
      session.data.post_entities = (ctx.message as any)?.caption_entities || [];
      session.step = 'tc_additional_post_target';

      await ctx.reply('📸 Photo received! Where do you want to post?', Markup.inlineKeyboard([
        [Markup.button.callback('📢 Main Channel', 'tc_addpost_main')],
        [Markup.button.callback('🎯 Challenge Channel', 'tc_addpost_challenge')],
        [Markup.button.callback('📢 Both Channels', 'tc_addpost_both')],
        [Markup.button.callback('❌ Cancel', 'tc_addpost_cancel')],
      ]));
    }
  }

  // Store late change window expiry times
  private lateChangeExpiry: Map<number, Date> = new Map();

  private async handleLatePostCallback(ctx: Context, data: string): Promise<boolean> {
    const telegramId = ctx.from!.id;

    if (data === 'tc_latepost_cancel') {
      tradingAdminSessions.delete(telegramId);
      await ctx.answerCbQuery('Cancelled');
      await ctx.reply('❌ Late post cancelled.');
      return true;
    }

    if (data === 'tc_latepost_main' || data === 'tc_latepost_challenge' || data === 'tc_latepost_both') {
      const session = tradingAdminSessions.get(telegramId);
      if (!session) return true;

      await ctx.answerCbQuery('Posting...');

      const challengeId = session.data.challenge_id;
      const challenge = await tradingChallengeService.getChallengeById(challengeId);
      if (!challenge) { await ctx.reply('❌ Challenge not found.'); tradingAdminSessions.delete(telegramId); return true; }

      // Set 6-hour expiry
      const expiry = new Date(Date.now() + 6 * 60 * 60 * 1000);
      this.lateChangeExpiry.set(challengeId, expiry);

      const botInfo = await ctx.telegram.getMe();
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.url('🔄 Change Account Number', `https://t.me/${botInfo.username}?start=tc_late_change_${challengeId}`)],
        [Markup.button.url('🔀 Switch to Real Account', `https://t.me/${botInfo.username}?start=tc_late_switch_${challengeId}`)],
        [Markup.button.url('🔁 Retry Registration', `https://t.me/${botInfo.username}?start=tc_late_retry_${challengeId}`)],
      ]);

      const targets: string[] = [];
      if (data === 'tc_latepost_main' || data === 'tc_latepost_both') targets.push(config.mainChannelId);
      if (data === 'tc_latepost_challenge' || data === 'tc_latepost_both') targets.push(config.challengeChannelId);

      try {
        for (const channelId of targets) {
          if (session.data.photo_file_id) {
            await ctx.telegram.sendPhoto(channelId, session.data.photo_file_id, {
              caption: session.data.post_text || undefined,
              caption_entities: session.data.post_entities?.length > 0 ? session.data.post_entities : undefined,
              ...keyboard,
            });
          } else {
            await ctx.telegram.sendMessage(channelId, session.data.post_text, {
              entities: session.data.post_entities?.length > 0 ? session.data.post_entities : undefined,
              link_preview_options: { is_disabled: true },
              ...keyboard,
            });
          }
        }
        const targetLabel = data === 'tc_latepost_both' ? 'both channels' : data === 'tc_latepost_main' ? 'main channel' : 'challenge channel';
        await ctx.reply(`✅ Late change post sent to ${targetLabel}!\n⏰ Window expires in 6 hours.`);
      } catch (e: any) {
        await ctx.reply(`❌ Error posting: ${e.message}`);
      }

      tradingAdminSessions.delete(telegramId);
      return true;
    }

    return false;
  }

  isLateChangeWindowOpen(challengeId: number): boolean {
    const expiry = this.lateChangeExpiry.get(challengeId);
    if (!expiry) return false;
    return new Date() < expiry;
  }

  private async handleAdditionalPostCallback(ctx: Context, data: string): Promise<boolean> {
    const telegramId = ctx.from!.id;
    const session = tradingAdminSessions.get(telegramId);
    if (!session || !session.step.startsWith('tc_additional_post')) return false;

    if (data === 'tc_addpost_cancel') {
      tradingAdminSessions.delete(telegramId);
      await ctx.answerCbQuery('Cancelled');
      await ctx.reply('❌ Additional post cancelled.');
      return true;
    }

    if (data === 'tc_addpost_main' || data === 'tc_addpost_challenge' || data === 'tc_addpost_both') {
      await ctx.answerCbQuery('Posting...');

      const challengeId = session.data.challenge_id;
      const challenge = await tradingChallengeService.getChallengeById(challengeId);
      if (!challenge) {
        await ctx.reply('❌ Challenge not found.');
        tradingAdminSessions.delete(telegramId);
        return true;
      }

      const botInfo = await ctx.telegram.getMe();
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.url('🚀 Join Challenge', `https://t.me/${botInfo.username}?start=tc_register_${challengeId}`)],
        [Markup.button.url('💰 Open Exness Account', config.exnessPartnerSignupLink)],
      ]);

      const targets: string[] = [];
      if (data === 'tc_addpost_main' || data === 'tc_addpost_both') targets.push(config.mainChannelId);
      if (data === 'tc_addpost_challenge' || data === 'tc_addpost_both') targets.push(config.challengeChannelId);

      try {
        for (const channelId of targets) {
          if (session.data.photo_file_id) {
            await ctx.telegram.sendPhoto(channelId, session.data.photo_file_id, {
              caption: session.data.post_text || undefined,
              caption_entities: session.data.post_entities?.length > 0 ? session.data.post_entities : undefined,
              ...keyboard,
            });
          } else {
            await ctx.telegram.sendMessage(channelId, session.data.post_text, {
              entities: session.data.post_entities?.length > 0 ? session.data.post_entities : undefined,
              link_preview_options: { is_disabled: true },
              ...keyboard,
            });
          }
        }

        const targetLabel = data === 'tc_addpost_both' ? 'both channels' : data === 'tc_addpost_main' ? 'main channel' : 'challenge channel';
        await ctx.reply(`✅ Additional post sent to ${targetLabel}!`);
      } catch (e: any) {
        console.error('Error sending additional post:', e);
        await ctx.reply(`❌ Error posting: ${e.message}`);
      }

      tradingAdminSessions.delete(telegramId);
      return true;
    }

    return false;
  }

  // ==================== TEST TRADING POSTS ====================

  async testTradingPosts(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const challenges = await tradingChallengeService.getAllChallenges();
    if (challenges.length === 0) {
      await ctx.reply('❌ No trading challenges found. Create one first.');
      return;
    }

    const challenge = challenges[0];
    await ctx.reply(
      `<b>🧪 TEST TRADING POSTS</b>\n\nChallenge: <b>${challenge.title}</b>\n\nSelect which post to test:`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📢 Announcement Post', `tc_test_announcement_${challenge.id}`)],
          [Markup.button.callback('⏰ 3-Day Countdown', `tc_test_countdown3_${challenge.id}`)],
          [Markup.button.callback('⏰ 2-Day Countdown', `tc_test_countdown2_${challenge.id}`)],
          [Markup.button.callback('🚨 1-Day (Last Chance)', `tc_test_countdown1_${challenge.id}`)],
          [Markup.button.callback('🚀 Day 1 Morning', `tc_test_morning1_${challenge.id}`)],
          [Markup.button.callback('🔥 Day 1 Evening', `tc_test_evening1_${challenge.id}`)],
          [Markup.button.callback('📈 Day 2 Morning', `tc_test_morning2_${challenge.id}`)],
          [Markup.button.callback('🔥 Day 2 Evening', `tc_test_evening2_${challenge.id}`)],
          [Markup.button.callback('📊 Day 3 Morning', `tc_test_morning3_${challenge.id}`)],
          [Markup.button.callback('💪 Day 4 Morning', `tc_test_morning4_${challenge.id}`)],
          [Markup.button.callback('🏁 Day 5 Morning', `tc_test_morning5_${challenge.id}`)],
          [Markup.button.callback('🔥 Day 5 Evening (Week 1 End)', `tc_test_evening5_${challenge.id}`)],
          [Markup.button.callback('🚀 Day 6 Morning (Week 2)', `tc_test_morning6_${challenge.id}`)],
          [Markup.button.callback('🔥 Day 7 Morning', `tc_test_morning7_${challenge.id}`)],
          [Markup.button.callback('⚡ Day 8 Morning', `tc_test_morning8_${challenge.id}`)],
          [Markup.button.callback('🎯 Day 9 Morning', `tc_test_morning9_${challenge.id}`)],
          [Markup.button.callback('🔥 Day 9 Evening', `tc_test_evening9_${challenge.id}`)],
          [Markup.button.callback('🏁 Day 10 Morning (Final)', `tc_test_morning10_${challenge.id}`)],
          [Markup.button.callback('⏰ Day 10 Evening (Wrap Up)', `tc_test_evening10_${challenge.id}`)],
          [Markup.button.callback('🏁 Challenge End Post', `tc_test_end_${challenge.id}`)],
          [Markup.button.callback('⏰ Deadline Closed Post', `tc_test_deadline_${challenge.id}`)],
          [Markup.button.callback('🏆 Winner Announcement', `tc_test_winners_${challenge.id}`)],
          [Markup.button.callback('🚀 Run ALL Posts in Sequence', `tc_test_all_${challenge.id}`)],
          [Markup.button.callback('⏩ Post All REMAINING Posts', `tc_test_remaining_${challenge.id}`)],
        ]),
      }
    );
  }

  async handleTestCallback(ctx: Context, data: string, tradingScheduler: any): Promise<boolean> {
    if (!data.startsWith('tc_test_')) return false;

    const parts = data.replace('tc_test_', '').split('_');
    const testType = parts[0];
    const challengeId = parseInt(parts[parts.length - 1]);

    const challenge = await tradingChallengeService.getChallengeById(challengeId);
    if (!challenge) {
      await ctx.answerCbQuery('Challenge not found');
      return true;
    }

    await ctx.answerCbQuery(`Testing ${testType}...`);

    try {
      switch (testType) {
        case 'announcement':
          await ctx.reply('📢 Posting announcement to channels...');
          await this.postAnnouncementToAdmin(ctx, challenge);
          break;
        case 'countdown3':
          await tradingScheduler.postCountdown(challenge, 3);
          break;
        case 'countdown2':
          await tradingScheduler.postCountdown(challenge, 2);
          break;
        case 'countdown1':
          await tradingScheduler.postCountdown(challenge, 1);
          break;
        case 'morning1':
          await tradingScheduler.postMorningMessage(challenge, 1);
          break;
        case 'morning2':
          await tradingScheduler.postMorningMessage(challenge, 2);
          break;
        case 'morning3':
          await tradingScheduler.postMorningMessage(challenge, 3);
          break;
        case 'morning4':
          await tradingScheduler.postMorningMessage(challenge, 4);
          break;
        case 'morning5':
          await tradingScheduler.postMorningMessage(challenge, 5);
          break;
        case 'morning6':
          await tradingScheduler.postMorningMessage(challenge, 6);
          break;
        case 'morning7':
          await tradingScheduler.postMorningMessage(challenge, 7);
          break;
        case 'morning8':
          await tradingScheduler.postMorningMessage(challenge, 8);
          break;
        case 'morning9':
          await tradingScheduler.postMorningMessage(challenge, 9);
          break;
        case 'morning10':
          await tradingScheduler.postMorningMessage(challenge, 10);
          break;
        case 'evening1':
          await tradingScheduler.postEveningMessage(challenge, 1);
          break;
        case 'evening2':
          await tradingScheduler.postEveningMessage(challenge, 2);
          break;
        case 'evening5':
          await tradingScheduler.postEveningMessage(challenge, 5);
          break;
        case 'evening9':
          await tradingScheduler.postEveningMessage(challenge, 9);
          break;
        case 'evening10':
          await tradingScheduler.postEveningMessage(challenge, 10);
          break;
        case 'end':
          await tradingScheduler.endChallenge(challenge);
          break;
        case 'deadline': {
          const text = `<b>⏰ SUBMISSION DEADLINE HAS ENDED</b>\n\n` +
            `The 48-hour submission window for <b>${challenge.title}</b> is now closed.\n\n` +
            `<b>No further submissions will be accepted.</b>\n\n` +
            `Our team will now review all submissions and announce the results soon.\n\n` +
            `<i>Thank you for your patience!</i> 🙏\n\n@${config.mainChannelUsername}`;
          const opts = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };
          await ctx.telegram.sendMessage(config.mainChannelId, text, opts);
          await ctx.telegram.sendMessage(config.challengeChannelId, text, opts);
          break;
        }
        case 'winners':
          await this.postTestWinnerAnnouncement(ctx, challenge);
          break;
        case 'all': {
          const delay = () => new Promise(r => setTimeout(r, 2000));
          await ctx.reply('🚀 Running ALL posts in sequence (2s delay)...');

          await ctx.reply('📢 — Announcement');
          await this.postAnnouncementToAdmin(ctx, challenge);
          await delay();

          await ctx.reply('⏰ — 3 Days Countdown');
          await tradingScheduler.postCountdown(challenge, 3);
          await delay();

          await ctx.reply('⏰ — 2 Days Countdown');
          await tradingScheduler.postCountdown(challenge, 2);
          await delay();

          await ctx.reply('🚨 — 1 Day (Last Chance)');
          await tradingScheduler.postCountdown(challenge, 1);
          await delay();

          for (let day = 1; day <= 10; day++) {
            await ctx.reply(`☀️ — Day ${day} Morning`);
            await tradingScheduler.postMorningMessage(challenge, day);
            await delay();

            await ctx.reply(`🌙 — Day ${day} Evening`);
            await tradingScheduler.postEveningMessage(challenge, day);
            await delay();
          }

          await ctx.reply('🏁 — Challenge End Post');
          await tradingScheduler.endChallenge(challenge);
          await delay();

          const deadlineText = `<b>⏰ SUBMISSION DEADLINE HAS ENDED</b>\n\n` +
            `The 48-hour submission window for <b>${challenge.title}</b> is now closed.\n\n` +
            `<b>No further submissions will be accepted.</b>\n\n` +
            `Our team will now review all submissions and announce the results soon.\n\n` +
            `<i>Thank you for your patience!</i> 🙏\n\n@${config.mainChannelUsername}`;
          await ctx.reply('⏰ — Deadline Closed Post');
          const deadlineOpts = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };
          await ctx.telegram.sendMessage(config.mainChannelId, deadlineText, deadlineOpts);
          await ctx.telegram.sendMessage(config.challengeChannelId, deadlineText, deadlineOpts);
          await delay();

          await ctx.reply('🏆 — Winner Announcement');
          await this.postTestWinnerAnnouncement(ctx, challenge);

          await ctx.reply('✅ All test posts sent!');
          break;
        }
        case 'remaining': {
          // Calculate which day the challenge is on based on start date
          const now = new Date();
          const startDate = new Date(challenge.start_date);
          const endDate = new Date(challenge.end_date);
          const delay = () => new Promise(r => setTimeout(r, 2000));

          // Determine what phase we're in and what's remaining
          const postsToSend: { label: string; fn: () => Promise<void> }[] = [];

          if (now < startDate) {
            // Pre-challenge: countdowns
            const daysUntilStart = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysUntilStart <= 3 && daysUntilStart >= 1) {
              for (let d = daysUntilStart; d >= 1; d--) {
                const label = d === 1 ? '🚨 Last Chance' : `⏰ ${d}-Day Countdown`;
                postsToSend.push({ label, fn: () => tradingScheduler.postCountdown(challenge, d) });
              }
            }
            // Then all daily posts
            for (let day = 1; day <= 10; day++) {
              postsToSend.push({ label: `☀️ Day ${day} Morning`, fn: () => tradingScheduler.postMorningMessage(challenge, day) });
              postsToSend.push({ label: `🌙 Day ${day} Evening`, fn: () => tradingScheduler.postEveningMessage(challenge, day) });
            }
            postsToSend.push({ label: '🏁 Challenge End', fn: () => tradingScheduler.endChallenge(challenge) });
          } else if (now >= startDate && now <= endDate) {
            // During challenge: figure out which working day we're on
            let workingDay = 0;
            const cursor = new Date(startDate);
            while (cursor <= now && workingDay < 10) {
              const dow = cursor.getDay();
              if (dow >= 1 && dow <= 5) workingDay++;
              cursor.setDate(cursor.getDate() + 1);
            }

            // Check if morning or evening has passed (8AM / 8PM EAT = UTC+3)
            const eatHour = (now.getUTCHours() + 3) % 24;
            const morningDone = eatHour >= 8;
            const eveningDone = eatHour >= 20;

            // Add remaining posts for current day
            if (workingDay > 0 && workingDay <= 10) {
              if (!morningDone) {
                postsToSend.push({ label: `☀️ Day ${workingDay} Morning`, fn: () => tradingScheduler.postMorningMessage(challenge, workingDay) });
              }
              if (!eveningDone) {
                postsToSend.push({ label: `🌙 Day ${workingDay} Evening`, fn: () => tradingScheduler.postEveningMessage(challenge, workingDay) });
              }
            }

            // Add all future days
            for (let day = workingDay + 1; day <= 10; day++) {
              postsToSend.push({ label: `☀️ Day ${day} Morning`, fn: () => tradingScheduler.postMorningMessage(challenge, day) });
              postsToSend.push({ label: `🌙 Day ${day} Evening`, fn: () => tradingScheduler.postEveningMessage(challenge, day) });
            }
            postsToSend.push({ label: '🏁 Challenge End', fn: () => tradingScheduler.endChallenge(challenge) });
          } else {
            // Post-challenge
            postsToSend.push({ label: '🏁 Challenge End', fn: () => tradingScheduler.endChallenge(challenge) });
          }

          // Always add deadline + winners at the end
          postsToSend.push({
            label: '⏰ Deadline Closed',
            fn: async () => {
              const t = `<b>⏰ SUBMISSION DEADLINE HAS ENDED</b>\n\nThe 48-hour submission window for <b>${challenge.title}</b> is now closed.\n\n<b>No further submissions will be accepted.</b>\n\nOur team will now review all submissions and announce the results soon.\n\n<i>Thank you for your patience!</i> 🙏\n\n@${config.mainChannelUsername}`;
              const o = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };
              await ctx.telegram.sendMessage(config.mainChannelId, t, o);
              await ctx.telegram.sendMessage(config.challengeChannelId, t, o);
            }
          });
          postsToSend.push({ label: '🏆 Winner Announcement', fn: () => this.postTestWinnerAnnouncement(ctx, challenge) });

          if (postsToSend.length === 0) {
            await ctx.reply('✅ No remaining posts to send.');
            break;
          }

          await ctx.reply(`⏩ Posting <b>${postsToSend.length}</b> remaining posts (2s delay)...`, { parse_mode: 'HTML' });

          for (const post of postsToSend) {
            await ctx.reply(`${post.label}`);
            await post.fn();
            await delay();
          }

          await ctx.reply(`✅ All ${postsToSend.length} remaining posts sent!`);
          break;
        }
      }

      if (testType !== 'all' && testType !== 'remaining') {
        await ctx.reply(`✅ Test post sent: ${testType}`);
      }
    } catch (e) {
      console.error('Test post error:', e);
      await ctx.reply(`❌ Error sending test post: ${(e as Error).message}`);
    }

    return true;
  }

  private async postTestWinnerAnnouncement(ctx: Context, challenge: TradingChallenge) {
    const counts = await tradingChallengeService.getRegistrationCounts(challenge.id);
    const subCounts = await tradingChallengeService.getSubmissionCount(challenge.id);
    const periodStr = `${toEAT(challenge.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${toEAT(challenge.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const realPrizes = typeof challenge.real_prizes === 'string' ? JSON.parse(challenge.real_prizes) : (challenge.real_prizes || []);
    const demoPrizes = typeof challenge.demo_prizes === 'string' ? JSON.parse(challenge.demo_prizes) : (challenge.demo_prizes || []);
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

    let text = `<b>🏆 TRADING CHALLENGE RESULTS 🏆</b>\n<b>${challenge.title}</b>\n\n📅 <b>Period:</b> ${periodStr}\n\n`;

    if (challenge.type === 'hybrid' || challenge.type === 'real') {
      text += `<b>🏆 REAL ACCOUNT WINNERS</b>\n\n`;
      for (let i = 0; i < (challenge.real_winners_count || 0); i++) {
        text += `${medals[i] || (i+1)+'️⃣'} <b>${this.getOrdinal(i + 1)} Place:</b> @sample_user - $XX.XX → <b>Prize: ${this.formatPrize(realPrizes[i] || 'TBD')}</b>\n`;
      }
      text += '\n';
    }

    if (challenge.type === 'hybrid' || challenge.type === 'demo') {
      text += `<b>🏆 DEMO ACCOUNT WINNERS</b>\n\n`;
      for (let i = 0; i < (challenge.demo_winners_count || 0); i++) {
        text += `${medals[i] || (i+1)+'️⃣'} <b>${this.getOrdinal(i + 1)} Place:</b> @sample_user - $XX.XX → <b>Prize: ${this.formatPrize(demoPrizes[i] || 'TBD')}</b>\n`;
      }
      text += '\n';
    }

    text += `<b>🎁 BONUS</b>\n` +
      `➡️ All Real Account participants are invited to join <b>BirrForex Live Trading Team</b>\n` +
      `➡️ Demo traders who hit the target are invited to join <b>BirrForex Live Trading Team</b>\n\n` +
      `👥 <b>Total Participants:</b> ${counts.total} (Real: ${counts.real} | Demo: ${counts.demo})\n` +
      `📋 <b>Submissions Received:</b> ${subCounts.total} (Real: ${subCounts.real} | Demo: ${subCounts.demo})\n\n` +
      `📌 <b>NB:</b> <i>The balance shown is the net qualified profit after deducting trades against the rules. Winners' trade history exports and prize delivery proof will be posted at</i> <b>@${config.challengeChannelUsername}</b>\n\n` +
      `<i>Congratulations to all winners!</i> 🎉\n<i>Thank you to everyone who participated!</i>\n\nStay tuned for the next challenge on <b>@${config.mainChannelUsername}</b>`;

    const opts = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };
    await ctx.telegram.sendMessage(config.mainChannelId, text, opts);
    await ctx.telegram.sendMessage(config.challengeChannelId, text, opts);
  }

  private async postAnnouncementToAdmin(ctx: Context, challenge: TradingChallenge) {
    const post = this.generateAnnouncementPost(challenge);
    const botInfo = await ctx.telegram.getMe();
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🚀 Join Challenge', `https://t.me/${botInfo.username}?start=tc_register_${challenge.id}`)],
      [Markup.button.url('💰 Open Exness Account', config.exnessPartnerSignupLink)],
    ]);
    // Post to channels (test channels if configured)
    await ctx.telegram.sendMessage(config.mainChannelId, post, { parse_mode: 'HTML', ...keyboard, link_preview_options: { is_disabled: true } });
    await ctx.telegram.sendMessage(config.challengeChannelId, post, { parse_mode: 'HTML', ...keyboard, link_preview_options: { is_disabled: true } });
  }
}

export const tradingAdminHandler = new TradingAdminHandler();
export { tradingAdminSessions };
