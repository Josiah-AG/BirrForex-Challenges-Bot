import { Telegraf, Context, Markup } from 'telegraf';
import { config } from '../config';
import { quizHandler } from './quizHandler';
import { adminHandler, adminSessions } from './adminHandler';
import { tradingAdminHandler, tradingAdminSessions } from './tradingAdminHandler';
import { userService } from '../services/userService';
import { challengeService } from '../services/challengeService';
import { participantService } from '../services/participantService';
import { winnerService } from '../services/winnerService';
import { parseChallengeDeepLink, isAdmin, formatChallengeTime } from '../utils/helpers';

export class Bot {
  public bot: Telegraf;
  private scheduler: any;
  private tradingScheduler: any;

  constructor() {
    this.bot = new Telegraf(config.botToken);
    this.setupHandlers();
    this.setupBotCommands();
  }

  setScheduler(scheduler: any) {
    this.scheduler = scheduler;
  }

  setTradingScheduler(tradingScheduler: any) {
    this.tradingScheduler = tradingScheduler;
  }

  private async setupBotCommands() {
    // Set commands for regular users (empty - no commands visible)
    await this.bot.telegram.setMyCommands([], {
      scope: { type: 'default' }
    });

    // Set commands for admin only
    await this.bot.telegram.setMyCommands([
      { command: 'createchallenge', description: 'Create a new challenge' },
      { command: 'listchallenges', description: 'View scheduled challenges' },
      { command: 'pastchallenges', description: 'View past challenges' },
      { command: 'editchallenge', description: 'Edit a scheduled challenge' },
      { command: 'deletechallenge', description: 'Delete a scheduled challenge' },
      { command: 'passwinner', description: 'Pass prize to next winner' },
      { command: 'cancelchallenge', description: 'Cancel today\'s challenge' },
      { command: 'testposts', description: 'Test scheduled posts' },
      { command: 'settings', description: 'View bot settings' },
      { command: 'createtradingchallenge', description: 'Create trading challenge' },
      { command: 'postchallenge', description: 'Post trading challenge announcement' },
      { command: 'updatechallenge', description: 'Update PDF/video link' },
      { command: 'tradingchallenges', description: 'View all trading challenges' },
      { command: 'unregister', description: 'Remove a registration' },
      { command: 'selectwinners', description: 'Select trading challenge winners' },
      { command: 'messageuser', description: 'Message a participant' },
      { command: 'disqualify', description: 'Disqualify a participant' },
      { command: 'promo', description: 'Post promo message' },
      { command: 'exportregistrations', description: 'Export registrations CSV' },
      { command: 'regsummary', description: 'Registration summary' },
      { command: 'deletetradingchallenge', description: 'Delete a trading challenge' },
      { command: 'testtradingposts', description: 'Test trading challenge posts' },
      { command: 'additionalpost', description: 'Post custom content to channels' },
    ], {
      scope: { type: 'chat', chat_id: parseInt(config.adminUserId) }
    });
  }

  private setupHandlers() {
    // Start command - only works with deep links from channel
    this.bot.start(async (ctx) => {
      try {
        const startParam = ctx.startPayload;
        
        // Only allow start with parameters (from channel buttons)
        if (!startParam) {
          await ctx.reply('⚠️ This bot is only accessible through our challenge channels.\n\nJoin @BirrForex and @BirrForex_Challenges to participate!');
          return;
        }
        
        if (startParam) {
          // Handle deep links
          const challengeId = parseChallengeDeepLink(startParam);
          if (challengeId) {
            await quizHandler.startQuiz(ctx, challengeId);
            return;
          }

          // Handle answers view
          if (startParam.startsWith('answers_')) {
            const id = parseInt(startParam.replace('answers_', ''));
            await this.showAnswers(ctx, id);
            return;
          }

          // Handle rank view
          if (startParam.startsWith('rank_')) {
            const id = parseInt(startParam.replace('rank_', ''));
            await this.showRank(ctx, id);
            return;
          }

          // Handle trading challenge registration deep link
          if (startParam.startsWith('tc_register_')) {
            const challengeId = parseInt(startParam.replace('tc_register_', ''));
            // Import dynamically to avoid circular deps
            const { tradingRegistrationHandler } = require('./tradingRegistrationHandler');
            await tradingRegistrationHandler.startRegistration(ctx, challengeId);
            return;
          }

          // Handle trading challenge submission deep link
          if (startParam.startsWith('tc_submit_')) {
            const challengeId = parseInt(startParam.replace('tc_submit_', ''));
            const { tradingRegistrationHandler } = require('./tradingRegistrationHandler');
            await tradingRegistrationHandler.startSubmission(ctx, challengeId);
            return;
          }
        }

        // If we get here with a param we don't recognize
        await ctx.reply('⚠️ Invalid link. Please use the buttons from our challenge channels.');
      } catch (error) {
        console.error('Error in start command:', error);
        await ctx.reply('❌ An error occurred. Please try again later.');
      }
    });

    // Admin commands
    this.bot.command('createchallenge', (ctx) => adminHandler.createChallenge(ctx));
    this.bot.command('listchallenges', (ctx) => adminHandler.listChallenges(ctx));
    this.bot.command('pastchallenges', (ctx) => adminHandler.pastChallenges(ctx));
    this.bot.command('editchallenge', (ctx) => adminHandler.editChallenge(ctx));
    this.bot.command('deletechallenge', (ctx) => adminHandler.deleteChallenge(ctx));
    this.bot.command('passwinner', (ctx) => adminHandler.passWinner(ctx));
    this.bot.command('cancelchallenge', (ctx) => adminHandler.cancelTodayChallenge(ctx));
    this.bot.command('settings', (ctx) => this.showSettings(ctx));
    this.bot.command('testposts', (ctx) => this.testPosts(ctx));

    // Trading challenge admin commands
    this.bot.command('createtradingchallenge', (ctx) => tradingAdminHandler.createTradingChallenge(ctx));
    this.bot.command('postchallenge', (ctx) => tradingAdminHandler.postChallenge(ctx));
    this.bot.command('updatechallenge', (ctx) => tradingAdminHandler.updateChallenge(ctx));
    this.bot.command('tradingchallenges', (ctx) => tradingAdminHandler.listTradingChallenges(ctx));
    this.bot.command('unregister', (ctx) => tradingAdminHandler.unregister(ctx));
    this.bot.command('selectwinners', (ctx) => tradingAdminHandler.selectWinners(ctx));
    this.bot.command('messageuser', (ctx) => tradingAdminHandler.messageUser(ctx));
    this.bot.command('disqualify', (ctx) => tradingAdminHandler.disqualify(ctx));
    this.bot.command('promo', (ctx) => tradingAdminHandler.promo(ctx));
    this.bot.command('exportregistrations', (ctx) => tradingAdminHandler.exportRegistrations(ctx));
    this.bot.command('regsummary', (ctx) => tradingAdminHandler.regSummary(ctx));
    this.bot.command('deletetradingchallenge', (ctx) => tradingAdminHandler.listTradingChallenges(ctx));
    this.bot.command('testtradingposts', (ctx) => tradingAdminHandler.testTradingPosts(ctx));
    this.bot.command('additionalpost', (ctx) => tradingAdminHandler.additionalPost(ctx));

    // User commands
    this.bot.command('mystats', (ctx) => this.showMyStats(ctx));
    this.bot.command('winners', (ctx) => this.showWinners(ctx));
    this.bot.command('questions', (ctx) => this.showQuestions(ctx));
    this.bot.command('next', (ctx) => this.showNextChallenge(ctx));
    this.bot.command('rules', (ctx) => this.showRules(ctx));
    this.bot.command('notify', (ctx) => this.toggleNotifications(ctx));

    // Callback query handlers
    this.bot.on('callback_query', async (ctx) => {
      const data = (ctx.callbackQuery as any).data;

      // Trading challenge callbacks (tc_ prefix)
      if (data && data.startsWith('tc_')) {
        // Test post callbacks
        if (data.startsWith('tc_test_') && isAdmin(ctx.from!.id)) {
          const handled = await tradingAdminHandler.handleTestCallback(ctx, data, this.tradingScheduler);
          if (handled) return;
        }

        if (isAdmin(ctx.from!.id)) {
          const handled = await tradingAdminHandler.handleCallback(ctx, data);
          if (handled) return;
        }
        // User-facing trading callbacks (registration flow)
        const { tradingRegistrationHandler } = require('./tradingRegistrationHandler');
        const handled = await tradingRegistrationHandler.handleCallback(ctx, data);
        if (handled) return;
      }

      // Quiz callbacks
      if (data.startsWith('start_quiz_')) {
        const challengeId = parseInt(data.replace('start_quiz_', ''));
        await quizHandler.handleQuizStart(ctx, challengeId);
        return;
      }

      if (data.startsWith('answer_')) {
        const parts = data.split('_');
        const challengeId = parseInt(parts[1]);
        const questionId = parseInt(parts[2]);
        const answer = parts[3];
        await quizHandler.handleAnswer(ctx, challengeId, questionId, answer);
        return;
      }

      // Admin callbacks
      if (data.startsWith('admin_day_')) {
        const day = data.replace('admin_day_', '');
        await adminHandler.handleDaySelection(ctx, day);
        return;
      }

      // Calendar callbacks
      if (data.startsWith('cal_select_')) {
        const dateStr = data.replace('cal_select_', '');
        await adminHandler.handleDateSelection(ctx, dateStr);
        return;
      }

      if (data.startsWith('cal_prev_') || data.startsWith('cal_next_')) {
        const parts = data.split('_');
        const direction = parts[1] as 'prev' | 'next';
        const year = parseInt(parts[2]);
        const month = parseInt(parts[3]);
        await adminHandler.handleCalendarNav(ctx, direction, year, month);
        return;
      }

      if (data === 'cal_ignore') {
        await ctx.answerCbQuery();
        return;
      }

      // My Stats button
      if (data === 'my_stats') {
        await ctx.answerCbQuery();
        await this.showMyStats(ctx);
        return;
      }

      // Next Challenge button
      if (data === 'next_challenge') {
        await ctx.answerCbQuery();
        await this.showNextChallenge(ctx);
        return;
      }

      // Notify Me button
      if (data === 'notify_me') {
        await ctx.answerCbQuery();
        await this.toggleNotifications(ctx);
        return;
      }

      // Disable Notifications button
      if (data === 'disable_notifications') {
        await ctx.answerCbQuery();
        await this.disableNotifications(ctx);
        return;
      }

      if (data === 'admin_confirm_challenge') {
        await adminHandler.saveChallenge(ctx);
        return;
      }

      if (data === 'admin_cancel_challenge') {
        await adminHandler.cancelChallenge(ctx);
        return;
      }

      if (data.startsWith('admin_pass_')) {
        const parts = data.split('_');
        const reason = parts[2];
        const challengeId = parseInt(parts[3]);
        await adminHandler.handlePassWinner(ctx, challengeId, reason);
        return;
      }

      if (data.startsWith('admin_cancel_confirm_')) {
        const challengeId = parseInt(data.replace('admin_cancel_confirm_', ''));
        await adminHandler.confirmCancellation(ctx, challengeId);
        return;
      }

      if (data === 'admin_cancel_back') {
        await ctx.answerCbQuery('Cancelled');
        await ctx.reply('Operation cancelled.');
        return;
      }

      // Test post callbacks
      if (data === 'test_morning') {
        await ctx.answerCbQuery('Sending morning posts...');
        await this.runTestPost(ctx, 'morning');
        return;
      }

      if (data === 'test_2hour') {
        await ctx.answerCbQuery('Sending 2-hour reminder...');
        await this.runTestPost(ctx, '2hour');
        return;
      }

      if (data === 'test_30min') {
        await ctx.answerCbQuery('Sending 30-min reminder...');
        await this.runTestPost(ctx, '30min');
        return;
      }

      if (data === 'test_live') {
        await ctx.answerCbQuery('Sending challenge live post...');
        await this.runTestPost(ctx, 'live');
        return;
      }

      if (data === 'test_end') {
        await ctx.answerCbQuery('Ending challenge and posting results...');
        await this.runTestPost(ctx, 'end');
        return;
      }

      if (data === 'test_all') {
        await ctx.answerCbQuery('Running all posts in sequence...');
        await this.runTestPost(ctx, 'all');
        return;
      }

      if (data === 'test_cancel') {
        await ctx.answerCbQuery('Cancelled');
        await ctx.editMessageText('Test cancelled.');
        return;
      }

      // Menu callbacks
      if (data === 'menu_mystats') {
        await this.showMyStats(ctx);
        return;
      }

      if (data === 'menu_winners') {
        await this.showWinners(ctx);
        return;
      }

      if (data === 'menu_questions') {
        await this.showQuestions(ctx);
        return;
      }

      if (data === 'menu_next') {
        await this.showNextChallenge(ctx);
        return;
      }

      if (data === 'menu_rules') {
        await this.showRules(ctx);
        return;
      }

      if (data === 'menu_notify') {
        await this.toggleNotifications(ctx);
        return;
      }

      // Admin menu callbacks
      if (data === 'admin_menu_create') {
        await ctx.answerCbQuery();
        await adminHandler.createChallenge(ctx);
        return;
      }

      if (data === 'admin_menu_list') {
        await ctx.answerCbQuery();
        await adminHandler.listChallenges(ctx);
        return;
      }

      if (data === 'admin_menu_pass') {
        await ctx.answerCbQuery();
        await adminHandler.passWinner(ctx);
        return;
      }

      if (data === 'admin_menu_cancel') {
        await ctx.answerCbQuery();
        await adminHandler.cancelTodayChallenge(ctx);
        return;
      }

      if (data === 'admin_menu_settings') {
        await ctx.answerCbQuery();
        await this.showSettings(ctx);
        return;
      }

      if (data === 'admin_menu_stats') {
        await ctx.answerCbQuery();
        await this.showMyStats(ctx);
        return;
      }

      // Edit/Delete challenge callbacks (check past challenges first - more specific)
      if (data.startsWith('admin_delete_past_confirm_')) {
        const challengeId = parseInt(data.replace('admin_delete_past_confirm_', ''));
        await adminHandler.confirmDeletePastChallenge(ctx, challengeId);
        return;
      }

      if (data.startsWith('admin_delete_past_')) {
        const challengeId = parseInt(data.replace('admin_delete_past_', ''));
        await adminHandler.handleDeletePastChallenge(ctx, challengeId);
        return;
      }

      if (data.startsWith('admin_delete_confirm_')) {
        const challengeId = parseInt(data.replace('admin_delete_confirm_', ''));
        await adminHandler.confirmDeleteChallenge(ctx, challengeId);
        return;
      }

      if (data.startsWith('admin_delete_')) {
        const challengeId = parseInt(data.replace('admin_delete_', ''));
        if (isNaN(challengeId)) {
          await ctx.answerCbQuery('Invalid challenge ID');
          return;
        }
        await adminHandler.handleDeleteChallenge(ctx, challengeId);
        return;
      }

      if (data === 'admin_delete_back') {
        await ctx.answerCbQuery('Cancelled');
        await ctx.reply('Delete operation cancelled.');
        return;
      }

      if (data.startsWith('admin_edit_')) {
        const challengeId = parseInt(data.replace('admin_edit_', ''));
        await adminHandler.handleEditChallenge(ctx, challengeId);
        return;
      }

      // Post now callbacks
      if (data.startsWith('admin_post_now_')) {
        const challengeId = parseInt(data.replace('admin_post_now_', ''));
        await adminHandler.handlePostNow(ctx, challengeId);
        return;
      }

      if (data.startsWith('admin_post_morning_')) {
        const challengeId = parseInt(data.replace('admin_post_morning_', ''));
        await ctx.answerCbQuery('Sending morning posts...');
        await this.runManualPost(ctx, challengeId, 'morning');
        return;
      }

      if (data.startsWith('admin_post_2hour_')) {
        const challengeId = parseInt(data.replace('admin_post_2hour_', ''));
        await ctx.answerCbQuery('Sending 2-hour reminder...');
        await this.runManualPost(ctx, challengeId, '2hour');
        return;
      }

      if (data.startsWith('admin_post_30min_')) {
        const challengeId = parseInt(data.replace('admin_post_30min_', ''));
        await ctx.answerCbQuery('Sending 30-min reminder...');
        await this.runManualPost(ctx, challengeId, '30min');
        return;
      }

      if (data.startsWith('admin_post_live_')) {
        const challengeId = parseInt(data.replace('admin_post_live_', ''));
        await ctx.answerCbQuery('Starting challenge...');
        await this.runManualPost(ctx, challengeId, 'live');
        return;
      }

      if (data.startsWith('admin_post_results_')) {
        const challengeId = parseInt(data.replace('admin_post_results_', ''));
        await ctx.answerCbQuery('Ending challenge and posting results...');
        await this.runManualPost(ctx, challengeId, 'results');
        return;
      }

      if (data.startsWith('admin_post_all_')) {
        const challengeId = parseInt(data.replace('admin_post_all_', ''));
        await ctx.answerCbQuery('Running all posts...');
        await this.runManualPost(ctx, challengeId, 'all');
        return;
      }
    });

    // Text message handler (for admin input)
    this.bot.on('text', async (ctx) => {
      const telegramId = ctx.from.id;
      
      // Check if admin has active trading challenge session
      if (isAdmin(telegramId) && tradingAdminHandler.hasActiveSession(telegramId)) {
        await tradingAdminHandler.handleTextInput(ctx, ctx.message.text);
        return;
      }

      // Check if admin has active weekly quiz session
      if (isAdmin(telegramId) && adminSessions.has(telegramId)) {
        await adminHandler.handleTextInput(ctx, ctx.message.text);
        return;
      }

      // Check if user has active trading registration session
      const { tradingRegistrationHandler } = require('./tradingRegistrationHandler');
      if (tradingRegistrationHandler.hasActiveSession(telegramId)) {
        await tradingRegistrationHandler.handleTextInput(ctx, ctx.message.text);
        return;
      }
    });

    // Photo handler (for trading challenge screenshots and additional posts)
    this.bot.on('photo', async (ctx) => {
      const telegramId = ctx.from.id;

      // Check if admin is composing an additional post
      if (isAdmin(telegramId) && tradingAdminHandler.hasActiveSession(telegramId)) {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const caption = (ctx.message as any).caption || '';
        await tradingAdminHandler.handlePhoto(ctx, photo.file_id, caption);
        return;
      }

      // Trading registration screenshots
      const { tradingRegistrationHandler } = require('./tradingRegistrationHandler');
      if (tradingRegistrationHandler.hasActiveSession(telegramId)) {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        await tradingRegistrationHandler.handlePhoto(ctx, photo.file_id);
      }
    });

    // Error handler
    this.bot.catch((err, ctx) => {
      console.error('Bot error:', err);
      ctx.reply('❌ An error occurred. Please try again.');
    });
  }

  private async sendMainMenu(ctx: Context) {
    const text = `🎯 BirrForex Challenge Bot

Get ready to test your forex knowledge and win prizes!

💰 Weekly challenges every Wednesday & Sunday
⏰ 10-minute quiz challenges
🏆 Perfect score required to win

Use the menu below to get started!`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📊 My Stats', 'menu_mystats')],
      [Markup.button.callback('🏆 Previous Winners', 'menu_winners')],
      [Markup.button.callback('📖 Previous Questions', 'menu_questions')],
      [Markup.button.callback('📅 Next Challenge', 'menu_next')],
      [Markup.button.callback('📋 Rules & Terms', 'menu_rules')],
      [Markup.button.callback('🔔 Notifications', 'menu_notify')],
    ]);

    await ctx.reply(text, keyboard);
  }

  private async sendAdminMenu(ctx: Context) {
    const text = `👨‍💼 BirrForex Challenge Bot - ADMIN PANEL

Welcome back, Admin!

Use the buttons below to manage challenges:`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📝 Create Challenge', 'admin_menu_create')],
      [Markup.button.callback('🔄 Pass Winner', 'admin_menu_pass')],
      [Markup.button.callback('❌ Cancel Challenge', 'admin_menu_cancel')],
      [Markup.button.callback('⚙️ Settings', 'admin_menu_settings')],
      [Markup.button.callback('📊 View Statistics', 'admin_menu_stats')],
    ]);

    await ctx.reply(text, keyboard);
  }

  private async showMyStats(ctx: Context) {
    const telegramId = ctx.from!.id;
    const stats = await userService.getUserStats(telegramId);

    if (!stats || !stats.user) {
      await ctx.reply('❌ No statistics found. Participate in a challenge first!');
      return;
    }

    const text = `📊 YOUR STATISTICS

👤 Username: @${stats.user.username || 'user'}

🎯 PARTICIPATION:
• Total Challenges: ${stats.user.total_participations}
• Perfect Scores: ${stats.user.total_perfect_scores}
• Average Score: ${(stats.avg_score * 5).toFixed(1)}/5
• Average Time: ${Math.round(stats.avg_time)}s

🏆 WINS:
• Total Wins: ${stats.user.total_wins}
• Last Win: ${stats.user.last_win_date ? new Date(stats.user.last_win_date).toDateString() : 'Never'}

📈 RANKING:
• Best Rank: ${stats.best_rank ? `${stats.best_rank}` : 'N/A'}
• Fastest Time: ${stats.fastest_time ? `${stats.fastest_time}s` : 'N/A'}`;

    await ctx.reply(text);
  }

  private async showWinners(ctx: Context) {
    const winners = await winnerService.getRecentWinners(5);

    if (winners.length === 0) {
      await ctx.reply('No winners yet!');
      return;
    }

    let text = '🏆 PREVIOUS WINNERS\n\n';
    winners.forEach(w => {
      text += `📅 ${new Date(w.date).toDateString()} (${w.day})\n`;
      text += `@${w.username || 'user'} - ${w.score}/${w.total_questions} in ${w.completion_time_seconds}s\n`;
      text += `Topic: ${w.topic}\n\n`;
    });

    await ctx.reply(text);
  }

  private async showQuestions(ctx: Context) {
    const challenges = await challengeService.getPastChallenges(5);

    if (challenges.length === 0) {
      await ctx.reply('No past challenges yet!');
      return;
    }

    let text = '📖 PREVIOUS QUESTIONS\n\n';
    challenges.forEach(c => {
      text += `📅 ${new Date(c.date).toDateString()} (${c.day})\n`;
      text += `Topic: ${c.topic}\n\n`;
    });

    await ctx.reply(text);
  }

  private async showNextChallenge(ctx: Context) {
      const nextDate = await challengeService.getNextChallengeDate();

      let text = '';
      if (!nextDate) {
        text = `📅 NEXT CHALLENGE

  No upcoming challenges scheduled yet.

  We'll notify you as soon as the next challenge is announced!

  🔔 Enable notifications to stay updated.`;
      } else {
        // Get the actual challenge to show correct time
        const nextChallenge = await challengeService.getChallengeByDate(nextDate);
        const challengeTime = nextChallenge?.challenge_time || config.challengeTime;
        
        text = `📅 NEXT CHALLENGE

  🗓️ Date: ${new Date(nextDate).toDateString()}
  ⏰ Time: ${formatChallengeTime(challengeTime)}
  📊 Topic: TBA (will be announced on challenge day)

  🔔 Stay updated with notifications!`;
      }

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔔 Notify Me', 'notify_me')]
      ]);

      await ctx.reply(text, keyboard);
    }

  private async showRules(ctx: Context) {
    const text = `📋 CHALLENGE RULES

⚡ HOW IT WORKS:
• Challenges posted twice weekly (Wed & Sun)
• Posted at ${config.challengeTime} EAT sharp
• Duration: ${config.challengeDurationMinutes} minutes only
• Questions: 3-10 (varies per challenge)

🏆 WINNING CRITERIA:
• Perfect score required (100%)
• Fastest correct submission wins
• One attempt per challenge only
• No consecutive wins allowed

💰 PRIZES:
• Sent via Exness internal transfer
• Must be verified Exness user
• Must claim within ${config.prizeClaimDeadlineHours} hour
• Terms and conditions apply

📋 ELIGIBILITY:
• Must be channel member
• Must have started bot
• Cannot win two challenges in a row
• Admin decision is final`;

    await ctx.reply(text);
  }

  private async showHelp(ctx: Context) {
    const text = `<b>🤖 BOT COMMANDS</b>

<b>📊 STATISTICS & INFO</b>
/mystats - View your challenge statistics
/winners - See previous winners
/questions - View past challenge questions
/next - Check next challenge schedule

<b>📋 RULES & SETTINGS</b>
/rules - Read challenge rules & terms
/notify - Toggle challenge notifications
/help - Show this help message

<b>🎯 HOW TO PARTICIPATE</b>
1. Wait for challenge announcement in channel
2. Click "Join Challenge" button
3. Answer all questions correctly
4. Be the fastest to win!

<b>💡 TIP:</b> Use /start to see the main menu with buttons for easy access to all features.

<b>Need help?</b> Contact @birrFXadmin`;

    await ctx.reply(text, { parse_mode: 'HTML' });
  }

  private async toggleNotifications(ctx: Context) {
    const telegramId = ctx.from!.id;
    
    // Always enable notifications when this is called from notify_me button
    await userService.enableNotifications(telegramId);

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔕 Disable Notifications', 'disable_notifications')]
    ]);

    await ctx.reply('🔔 Notifications enabled!\n\nYou\'ll receive a reminder when challenges go live.', keyboard);
  }

  private async disableNotifications(ctx: Context) {
    const telegramId = ctx.from!.id;
    await userService.disableNotifications(telegramId);

    await ctx.reply('🔕 Notifications disabled.\n\nYou can re-enable them anytime from the Next Challenge menu.');
  }

  private async showAnswers(ctx: Context, challengeId: number) {
      try {
        const challenge = await challengeService.getChallengeById(challengeId);
        const questions = await challengeService.getQuestions(challengeId);

        if (!challenge || questions.length === 0) {
          await ctx.reply('❌ Challenge not found.');
          return;
        }

        let text = `<b>✅ CORRECT ANSWERS</b>
  <i>${challenge.day} Challenge - ${new Date(challenge.date).toDateString()}</i>

  <b>Topic:</b> ${challenge.topic}

  ━━━━━━━━━━━━━━━━━━━━

  `;

        questions.forEach((q, i) => {
          const correctOption = q[`option_${q.correct_answer.toLowerCase()}` as keyof typeof q];
          text += `<b>Q${i + 1}:</b> ${q.question_text}
  ✓ <b>${q.correct_answer})</b> ${correctOption}

  `;
        });

        text += `━━━━━━━━━━━━━━━━━━━━

  <b>📚 Study these for next time!</b>`;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.url(`📊 Rewatch: ${challenge.topic}`, challenge.topic_link)]
        ]);

        await ctx.reply(text, { 
          parse_mode: 'HTML', 
          link_preview_options: { is_disabled: true },
          ...keyboard
        });
      } catch (error) {
        console.error('Error showing answers:', error);
        await ctx.reply('❌ An error occurred. Please try again later.');
      }
    }

  private async showRank(ctx: Context, challengeId: number) {
      try {
        const telegramId = ctx.from!.id;
        const participant = await participantService.getParticipant(challengeId, telegramId);
        const challenge = await challengeService.getChallengeById(challengeId);

        if (!participant || !challenge) {
          await ctx.reply('❌ You did not participate in this challenge.');
          return;
        }

        const stats = await participantService.getChallengeStats(challengeId);

        // Check if ranks have been calculated
        if (participant.rank === null || participant.rank === undefined) {
          await ctx.reply('⏳ Rankings are being calculated. Please try again in a moment.');
          return;
        }

        const text = `<b>🏅 YOUR RANK</b>
  <i>${challenge.day} Challenge - ${new Date(challenge.date).toDateString()}</i>

  ━━━━━━━━━━━━━━━━━━━━

  <b>📊 Your Score:</b> ${participant.score}/${participant.total_questions}
  <b>⚡ Response Time:</b> ${participant.completion_time_seconds}s
  <b>📍 Completion Order:</b> ${participant.completion_order}
  <b>🏅 Final Rank:</b> ${participant.rank} out of ${stats.total_participants} participants

  ━━━━━━━━━━━━━━━━━━━━

  <b>📈 CHALLENGE STATS:</b>
  • <b>Total Participants:</b> ${stats.total_participants}
  • <b>Perfect Scores:</b> ${stats.perfect_scores}
  • <b>Average Score:</b> ${(stats.avg_score * participant.total_questions).toFixed(1)}/${participant.total_questions}`;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('📊 My Stats', 'my_stats')],
          [Markup.button.callback('📅 Next Challenge', 'next_challenge')]
        ]);

        await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
      } catch (error) {
        console.error('Error showing rank:', error);
        await ctx.reply('❌ An error occurred. Please try again later.');
      }
    }

  private async showSettings(ctx: Context) {
    if (!isAdmin(ctx.from!.id)) {
      await ctx.reply('❌ You are not authorized to use this command.');
      return;
    }

    const text = `⚙️ BOT SETTINGS

📅 SCHEDULE:
• Challenge Days: Wednesday, Sunday
• Challenge Time: ${config.challengeTime} EAT
• Morning Post: ${config.morningPostTime} EAT

💰 REWARDS:
• Default Prize: $${config.defaultPrizeAmount}
• Backup List Size: ${config.backupListSize}

⏰ TIMING:
• Challenge Duration: ${config.challengeDurationMinutes} minutes
• Prize Claim Deadline: ${config.prizeClaimDeadlineHours} hour

📢 CHANNELS:
• Main Channel: ${config.mainChannelId}
• Challenge Channel: ${config.challengeChannelId}`;

    await ctx.reply(text);
  }

  private async testPosts(ctx: Context) {
    if (!isAdmin(ctx.from!.id)) {
      await ctx.reply('❌ You are not authorized to use this command.');
      return;
    }

    await ctx.reply('🧪 TEST POSTS\n\nSelect which posts to test:', 
      Markup.inlineKeyboard([
        [Markup.button.callback('1️⃣ Morning Posts (10 AM)', 'test_morning')],
        [Markup.button.callback('2️⃣ 2-Hour Reminder (12 PM)', 'test_2hour')],
        [Markup.button.callback('3️⃣ 30-Min Reminder (1:30 PM)', 'test_30min')],
        [Markup.button.callback('4️⃣ Challenge Live (2 PM)', 'test_live')],
        [Markup.button.callback('5️⃣ Challenge End & Results (2:10 PM)', 'test_end')],
        [Markup.button.callback('🚀 Run All Posts in Sequence', 'test_all')],
        [Markup.button.callback('❌ Cancel', 'test_cancel')],
      ])
    );
  }

  private async runTestPost(ctx: Context, type: string) {
    if (!this.scheduler) {
      await ctx.reply('❌ Scheduler not initialized.');
      return;
    }

    try {
      if (type === 'morning') {
        await ctx.editMessageText('📤 Sending morning posts...');
        await this.scheduler.sendMorningPosts();
        await ctx.reply('✅ Morning posts sent to both channels!');
      } else if (type === '2hour') {
        await ctx.editMessageText('📤 Sending 2-hour reminder...');
        await this.scheduler.send2HourReminder();
        await ctx.reply('✅ 2-hour reminder sent!');
      } else if (type === '30min') {
        await ctx.editMessageText('📤 Sending 30-minute reminder...');
        await this.scheduler.send30MinReminder();
        await ctx.reply('✅ 30-minute reminder sent!');
      } else if (type === 'live') {
        await ctx.editMessageText('📤 Starting challenge...');
        await this.scheduler.startChallenge();
        await ctx.reply('✅ Challenge is now LIVE!');
      } else if (type === 'end') {
        await ctx.editMessageText('📤 Ending challenge and posting results...');
        await this.scheduler.endChallenge();
        await ctx.reply('✅ Challenge ended and results posted!');
      } else if (type === 'all') {
        await ctx.editMessageText('📤 Running all posts in sequence...\n\nThis will take about 30 seconds.');
        
        await ctx.reply('1️⃣ Sending morning posts...');
        await this.scheduler.sendMorningPosts();
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        await ctx.reply('2️⃣ Sending 2-hour reminder...');
        await this.scheduler.send2HourReminder();
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        await ctx.reply('3️⃣ Sending 30-minute reminder...');
        await this.scheduler.send30MinReminder();
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        await ctx.reply('4️⃣ Starting challenge...');
        await this.scheduler.startChallenge();
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        await ctx.reply('5️⃣ Ending challenge and posting results...');
        await this.scheduler.endChallenge();
        
        await ctx.reply('✅ All posts completed!\n\nCheck your test channels to see all the posts.');
      }
    } catch (error) {
      console.error('Error running test post:', error);
      await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async runManualPost(ctx: Context, challengeId: number, type: string) {
    if (!this.scheduler) {
      await ctx.reply('❌ Scheduler not initialized.');
      return;
    }

    try {
      if (type === 'morning') {
        await this.scheduler.sendMorningPostsForChallenge(challengeId);
        await ctx.reply('✅ Morning posts sent!');
      } else if (type === '2hour') {
        await this.scheduler.send2HourReminder(challengeId);
        await ctx.reply('✅ 2-hour reminder sent!');
      } else if (type === '30min') {
        await this.scheduler.send30MinReminder(challengeId);
        await ctx.reply('✅ 30-minute reminder sent!');
      } else if (type === 'live') {
        await this.scheduler.startChallenge(challengeId);
        await ctx.reply('✅ Challenge is now LIVE!');
      } else if (type === 'results') {
        await this.scheduler.endChallenge(challengeId);
        await ctx.reply('✅ Challenge ended and results posted!');
      } else if (type === 'all') {
        await ctx.reply('📤 Running all posts in sequence...\n\nThis will take about 30 seconds.');
        
        await ctx.reply('1️⃣ Sending morning posts...');
        await this.scheduler.sendMorningPostsForChallenge(challengeId);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        await ctx.reply('2️⃣ Sending 2-hour reminder...');
        await this.scheduler.send2HourReminder(challengeId);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        await ctx.reply('3️⃣ Sending 30-minute reminder...');
        await this.scheduler.send30MinReminder(challengeId);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        await ctx.reply('4️⃣ Starting challenge...');
        await this.scheduler.startChallenge(challengeId);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        await ctx.reply('5️⃣ Ending challenge and posting results...');
        await this.scheduler.endChallenge(challengeId);
        
        await ctx.reply('✅ All posts completed!');
      }
    } catch (error) {
      console.error('Error running manual post:', error);
      await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async launch() {
    await this.bot.launch();
    console.log('✅ Bot started successfully!');
  }

  async stop() {
    this.bot.stop();
  }
}
