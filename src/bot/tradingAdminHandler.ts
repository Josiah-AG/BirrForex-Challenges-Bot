import { Context, Markup } from 'telegraf';
import { tradingChallengeService, TradingChallenge } from '../services/tradingChallengeService';
import { isAdmin } from '../utils/helpers';
import { config } from '../config';

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
      const challengeId = parseInt(data.replace('tc_view_', ''));
      await this.showChallengeDetails(ctx, challengeId);
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
        const prizes = text.split(',').map(p => parseFloat(p.trim()));
        if (prizes.some(isNaN) || prizes.length !== session.data.real_winners_count) {
          await ctx.reply(`❌ Enter exactly ${session.data.real_winners_count} prizes, comma separated.`);
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
        const prizes = text.split(',').map(p => parseFloat(p.trim()));
        if (prizes.some(isNaN) || prizes.length !== totalWinners) {
          await ctx.reply(`❌ Enter exactly ${totalWinners} prizes, comma separated.`);
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
        const prizes = text.split(',').map(p => parseFloat(p.trim()));
        if (prizes.some(isNaN) || prizes.length !== session.data.demo_winners_count) {
          await ctx.reply(`❌ Enter exactly ${session.data.demo_winners_count} prizes, comma separated.`);
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
        session.data.start_date = new Date(`${match[1]}T${match[2]}:00`);
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
        session.data.end_date = new Date(`${match[1]}T${match[2]}:00`);
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

      case 'tc_dq_reason': {
        await this.processDisqualify(ctx, session.data.target_username, text);
        tradingAdminSessions.delete(telegramId);
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
    const startStr = d.start_date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    const endStr = d.end_date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

    let prizesText = '';
    if (d.type === 'hybrid' || d.type === 'real') {
      prizesText += `\n🏆 <b>Real Account Winners:</b> ${d.real_winners_count}\n`;
      d.real_prizes.forEach((p: number, i: number) => {
        prizesText += `${i + 1}st: $${p}${i < d.real_prizes.length - 1 ? ' | ' : ''}`;
      });
    }
    if (d.type === 'hybrid' || d.type === 'demo') {
      prizesText += `\n🏆 <b>Demo Account Winners:</b> ${d.demo_winners_count}\n`;
      d.demo_prizes.forEach((p: number, i: number) => {
        prizesText += `${i + 1}st: $${p}${i < d.demo_prizes.length - 1 ? ' | ' : ''}`;
      });
    }

    const text = `✅ <b>TRADING CHALLENGE SUMMARY</b>\n\n` +
      `📋 <b>Title:</b> ${d.title}\n` +
      `📋 <b>Type:</b> ${typeLabel}\n` +
      `📅 <b>Period:</b> ${startStr} → ${endStr}\n` +
      `💰 <b>Starting Balance:</b> $${d.starting_balance}\n` +
      `🎯 <b>Target:</b> $${d.target_balance}\n` +
      prizesText + '\n' +
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

    const startStr = new Date(c.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const endStr = new Date(c.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    let prizesText = '';
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

    if (c.type === 'hybrid' || c.type === 'real') {
      const prizes = typeof c.real_prizes === 'string' ? JSON.parse(c.real_prizes) : (c.real_prizes || []);
      prizesText += '\n<b>Real Account:</b>\n';
      prizes.forEach((p: number, i: number) => {
        prizesText += `${medals[i] || (i+1)+'️⃣'} ${this.getOrdinal(i + 1)} Place: $${p}\n`;
      });
    }
    if (c.type === 'hybrid' || c.type === 'demo') {
      const prizes = typeof c.demo_prizes === 'string' ? JSON.parse(c.demo_prizes) : (c.demo_prizes || []);
      prizesText += '\n<b>Demo Account:</b>\n';
      prizes.forEach((p: number, i: number) => {
        prizesText += `${medals[i] || (i+1)+'️⃣'} ${this.getOrdinal(i + 1)} Place: $${p}\n`;
      });
    }

    let linksText = '';
    if (c.pdf_url) linksText += `\n📄 Challenge Rules: <a href="${c.pdf_url}">Download PDF</a>`;
    if (c.video_url) linksText += `\n🎥 Challenge Guide: <a href="${c.video_url}">Watch Video</a>`;

    return `<b>🎯 BIRRFOREX TRADING CHALLENGE</b>\n` +
      `<b>${c.title}</b>\n\n` +
      `📊 <b>Type:</b> ${typeLabel}\n` +
      `📅 <b>Period:</b> ${startStr} - ${endStr}\n` +
      `💰 <b>Start:</b> $${c.starting_balance} → 🎯 <b>Target:</b> $${c.target_balance}\n\n` +
      `<b>🏆 PRIZES</b>\n` +
      prizesText + '\n' +
      `<b>🎁 BONUS</b>\n` +
      `➡️ All Real Account participants will be invited to join <b>BirrForex Live Trading Team</b>\n` +
      `➡️ Demo traders who hit the target will get an invitation to join <b>BirrForex Live Trading Team</b>\n\n` +
      `⚠️ <i>Please read the challenge rules carefully before you start the challenge!</i>\n` +
      linksText;
  }

  private getOrdinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
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

    const startStr = new Date(challenge.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const endStr = new Date(challenge.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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
        [Markup.button.callback('📎 Export CSV', `tc_export_${challengeId}`)],
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

    await ctx.reply('Enter the username of the participant:');
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
    if (challenges.length === 0) {
      await ctx.reply('❌ No challenges found.');
      return;
    }

    // Use most recent challenge with registrations
    const challenge = challenges[0];
    const registrations = await tradingChallengeService.getAllRegistrations(challenge.id);

    if (registrations.length === 0) {
      await ctx.reply('❌ No registrations found.');
      return;
    }

    let csv = 'Username,Telegram ID,Email,Type,Account Number,MT5 Server,Status,Registered At\n';
    registrations.forEach(r => {
      csv += `@${r.username || 'unknown'},${r.telegram_id},${r.email},${r.account_type},${r.account_number},${r.mt5_server || 'N/A'},${r.status},${new Date(r.registered_at).toISOString()}\n`;
    });

    try {
      await ctx.replyWithDocument({
        source: Buffer.from(csv),
        filename: `${challenge.title.replace(/\s+/g, '_')}_registrations.csv`,
      });
    } catch (e) {
      console.error('Error exporting registrations:', e);
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
    const startStr = new Date(challenge.start_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

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
    const startStr = new Date(c.start_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    const periodStr = `${new Date(c.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(c.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    let links = '';
    if (c.pdf_url) links += `\n📄 Challenge Rules: <a href="${c.pdf_url}">Download PDF</a>`;
    if (c.video_url) links += `\n🎥 Challenge Guide: <a href="${c.video_url}">Watch Video</a>`;

    if (promoNum === 1) {
      return `<b>🎯 BIRRFOREX TRADING CHALLENGE IS HERE!</b>\n\n<b>${c.title}</b>\n\n💰 Start with <b>$${c.starting_balance}</b> → 🎯 Hit <b>$${c.target_balance}</b>\n🏆 Win up to <b>$${this.getTopPrize(c)}!</b>\n\n📅 <b>Challenge Period:</b> ${periodStr}\n\nOpen to Demo & Real account traders!\nRegister now and show your trading skills 💪\n${links}`;
    } else if (promoNum === 2) {
      return `<b>📢 HAVE YOU REGISTERED YET?</b>\n\n<b>${c.title}</b> is coming up!\n\n🏆 <b>Real Account Prizes:</b> ${this.formatPrizeList(c, 'real')}\n🏆 <b>Demo Account Prizes:</b> ${this.formatPrizeList(c, 'demo')}\n\nRegistration is <b>FREE</b> and takes 2 minutes!\n\nDon't miss your chance to compete 🔥\n${links}`;
    } else {
      return `<b>⏰ DEADLINE IS APPROACHING!</b>\n\n<b>${c.title}</b> registration is closing soon!\n\n📅 <b>Start:</b> ${startStr}\n\nAfter the challenge starts, registration closes.\nDon't wait until the last minute!\n\nSecure your spot <b>NOW</b> 🚀\n${links}`;
    }
  }

  private getTopPrize(c: TradingChallenge): number {
    const realPrizes = typeof c.real_prizes === 'string' ? JSON.parse(c.real_prizes) : (c.real_prizes || []);
    const demoPrizes = typeof c.demo_prizes === 'string' ? JSON.parse(c.demo_prizes) : (c.demo_prizes || []);
    return Math.max(...realPrizes, ...demoPrizes, 0);
  }

  private formatPrizeList(c: TradingChallenge, category: 'real' | 'demo'): string {
    const prizes = category === 'real'
      ? (typeof c.real_prizes === 'string' ? JSON.parse(c.real_prizes) : (c.real_prizes || []))
      : (typeof c.demo_prizes === 'string' ? JSON.parse(c.demo_prizes) : (c.demo_prizes || []));
    return prizes.map((p: number) => `$${p}`).join(' / ') || 'N/A';
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
    const periodStr = `${new Date(challenge.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(challenge.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

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

  private async sendMessageToUser(ctx: Context, username: string, message: string) {
    const challenges = await tradingChallengeService.getAllChallenges();
    let reg = null;

    for (const c of challenges) {
      const regs = await tradingChallengeService.getAllRegistrations(c.id);
      reg = regs.find(r => r.username?.toLowerCase() === username.toLowerCase());
      if (reg) break;
    }

    if (!reg) {
      await ctx.reply(`❌ User @${username} not found in any challenge registrations.`);
      return;
    }

    const text = `<b>📩 MESSAGE FROM BIRRFOREX CHALLENGE TEAM</b>\n\n${message}\n\n⚠️ Please reply to <b>@birrFXadmin</b> with the requested information.\n<i>(Include a screenshot of this message)</i>`;

    try {
      await ctx.telegram.sendMessage(reg.telegram_id, text, { parse_mode: 'HTML' });
      await ctx.reply(`✅ Message sent to @${username}`);
    } catch (e) {
      await ctx.reply(`❌ Could not send message to @${username}. They may have blocked the bot.`);
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
          [Markup.button.callback('🔥 Day 5 Evening (Week 1 End)', `tc_test_evening5_${challenge.id}`)],
          [Markup.button.callback('🚀 Day 6 Morning (Week 2)', `tc_test_morning6_${challenge.id}`)],
          [Markup.button.callback('🏁 Day 10 Morning (Final)', `tc_test_morning10_${challenge.id}`)],
          [Markup.button.callback('⏰ Day 10 Evening (Wrap Up)', `tc_test_evening10_${challenge.id}`)],
          [Markup.button.callback('🏁 Challenge End Post', `tc_test_end_${challenge.id}`)],
          [Markup.button.callback('⏰ Deadline Closed Post', `tc_test_deadline_${challenge.id}`)],
          [Markup.button.callback('🚀 Run ALL Posts in Sequence', `tc_test_all_${challenge.id}`)],
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
        case 'evening1':
          await tradingScheduler.postEveningMessage(challenge, 1);
          break;
        case 'evening5':
          await tradingScheduler.postEveningMessage(challenge, 5);
          break;
        case 'morning6':
          await tradingScheduler.postMorningMessage(challenge, 6);
          break;
        case 'morning10':
          await tradingScheduler.postMorningMessage(challenge, 10);
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
        case 'all':
          await ctx.reply('🚀 Running all posts in sequence (3s delay between each)...');
          await tradingScheduler.postCountdown(challenge, 3);
          await new Promise(r => setTimeout(r, 3000));
          await tradingScheduler.postCountdown(challenge, 2);
          await new Promise(r => setTimeout(r, 3000));
          await tradingScheduler.postCountdown(challenge, 1);
          await new Promise(r => setTimeout(r, 3000));
          await tradingScheduler.postMorningMessage(challenge, 1);
          await new Promise(r => setTimeout(r, 3000));
          await tradingScheduler.postEveningMessage(challenge, 1);
          await new Promise(r => setTimeout(r, 3000));
          await tradingScheduler.postMorningMessage(challenge, 5);
          await new Promise(r => setTimeout(r, 3000));
          await tradingScheduler.postEveningMessage(challenge, 5);
          await new Promise(r => setTimeout(r, 3000));
          await tradingScheduler.postMorningMessage(challenge, 6);
          await new Promise(r => setTimeout(r, 3000));
          await tradingScheduler.postMorningMessage(challenge, 10);
          await new Promise(r => setTimeout(r, 3000));
          await tradingScheduler.postEveningMessage(challenge, 10);
          await ctx.reply('✅ All test posts sent!');
          break;
      }

      if (testType !== 'all') {
        await ctx.reply(`✅ Test post sent: ${testType}`);
      }
    } catch (e) {
      console.error('Test post error:', e);
      await ctx.reply(`❌ Error sending test post: ${(e as Error).message}`);
    }

    return true;
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
