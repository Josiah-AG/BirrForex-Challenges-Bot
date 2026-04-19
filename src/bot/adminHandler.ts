import { Context, Markup } from 'telegraf';
import { challengeService } from '../services/challengeService';
import { winnerService } from '../services/winnerService';
import { participantService } from '../services/participantService';
import { isAdmin } from '../utils/helpers';
import { config } from '../config';

interface AdminSession {
  step: string;
  data: any;
}

const adminSessions = new Map<number, AdminSession>();

export class AdminHandler {
  /**
   * Check if user is admin
   */
  private checkAdmin(ctx: Context): boolean {
    if (!isAdmin(ctx.from!.id)) {
      ctx.reply('❌ You are not authorized to use this command.');
      return false;
    }
    return true;
  }

  /**
   * Start challenge creation
   */
  async createChallenge(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const telegramId = ctx.from!.id;
    
    adminSessions.set(telegramId, {
      step: 'select_date',
      data: {},
    });

    await this.showCalendar(ctx, new Date());
  }

  /**
   * Show calendar for date selection
   */
  private async showCalendar(ctx: Context, currentMonth: Date) {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    const text = `📅 SELECT CHALLENGE DATE\n\n${monthNames[month]} ${year}\n\nSelect a date for the challenge:`;
    
    // Build calendar buttons
    const buttons: any[] = [];
    
    // Week day headers
    buttons.push([
      Markup.button.callback('Su', 'cal_ignore'),
      Markup.button.callback('Mo', 'cal_ignore'),
      Markup.button.callback('Tu', 'cal_ignore'),
      Markup.button.callback('We', 'cal_ignore'),
      Markup.button.callback('Th', 'cal_ignore'),
      Markup.button.callback('Fr', 'cal_ignore'),
      Markup.button.callback('Sa', 'cal_ignore'),
    ]);
    
    // Calendar days
    let week: any[] = [];
    
    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      week.push(Markup.button.callback(' ', 'cal_ignore'));
    }
    
    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0);
      
      // Only allow future dates
      if (date >= today) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        week.push(Markup.button.callback(String(day), `cal_select_${dateStr}`));
      } else {
        week.push(Markup.button.callback('·', 'cal_ignore'));
      }
      
      // New week
      if (week.length === 7) {
        buttons.push(week);
        week = [];
      }
    }
    
    // Fill last week
    if (week.length > 0) {
      while (week.length < 7) {
        week.push(Markup.button.callback(' ', 'cal_ignore'));
      }
      buttons.push(week);
    }
    
    // Navigation buttons
    buttons.push([
      Markup.button.callback('◀️ Previous', `cal_prev_${year}_${month}`),
      Markup.button.callback('Next ▶️', `cal_next_${year}_${month}`),
    ]);
    
    buttons.push([Markup.button.callback('❌ Cancel', 'admin_cancel_challenge')]);
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, keyboard);
    } else {
      await ctx.reply(text, keyboard);
    }
  }

  /**
   * Handle calendar navigation
   */
  async handleCalendarNav(ctx: Context, direction: 'prev' | 'next', year: number, month: number) {
    if (!this.checkAdmin(ctx)) return;

    let newMonth = month;
    let newYear = year;
    
    if (direction === 'next') {
      newMonth++;
      if (newMonth > 11) {
        newMonth = 0;
        newYear++;
      }
    } else {
      newMonth--;
      if (newMonth < 0) {
        newMonth = 11;
        newYear--;
      }
    }
    
    // Don't go to past months
    const today = new Date();
    const targetDate = new Date(newYear, newMonth, 1);
    if (targetDate < new Date(today.getFullYear(), today.getMonth(), 1)) {
      await ctx.answerCbQuery('Cannot select past dates');
      return;
    }
    
    await ctx.answerCbQuery();
    await this.showCalendar(ctx, new Date(newYear, newMonth, 1));
  }

  /**
   * Handle date selection
   */
  async handleDateSelection(ctx: Context, dateStr: string) {
    if (!this.checkAdmin(ctx)) return;

    const telegramId = ctx.from!.id;
    const session = adminSessions.get(telegramId);
    
    if (!session) {
      await ctx.answerCbQuery('Session expired');
      return;
    }

    const date = new Date(dateStr);
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
    
    session.data.date = date;
    session.data.day = dayName.toLowerCase();
    session.step = 'enter_time';
    
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `✅ Selected: ${dayName}, ${date.toDateString()}\n\n⏰ Challenge Time\n\nEnter the time when the challenge should go live (24-hour format HH:MM):\n\nDefault: 20:00 (8:00 PM EAT)\n\nExamples:\n• 20:00 (8:00 PM)\n• 14:00 (2:00 PM)\n• 18:30 (6:30 PM)`
    );
  }

  /**
   * Handle day selection (old method - kept for compatibility)
   */
  async handleDaySelection(ctx: Context, day: string) {
    if (!this.checkAdmin(ctx)) return;

    const telegramId = ctx.from!.id;
    const session = adminSessions.get(telegramId);
    
    if (!session) {
      await ctx.answerCbQuery('Session expired');
      return;
    }

    session.data.day = day;
    session.step = 'enter_topic';
    
    await ctx.answerCbQuery();
    await ctx.reply('📊 Challenge Topic\n\nEnter the topic name (e.g., "Weekend Gold Analysis"):');
  }

  /**
   * Handle text input based on current step
   */
  async handleTextInput(ctx: Context, text: string) {
    if (!this.checkAdmin(ctx)) return;

    const telegramId = ctx.from!.id;
    const session = adminSessions.get(telegramId);
    
    if (!session) return;

    switch (session.step) {
      case 'enter_time':
        // Validate time format (HH:MM)
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
        if (!timeRegex.test(text)) {
          await ctx.reply('❌ Invalid time format. Please use HH:MM (24-hour format)\n\nExamples:\n• 20:00\n• 14:00\n• 18:30');
          return;
        }
        session.data.challenge_time = text;
        session.step = 'enter_topic';
        await ctx.reply(`✅ Challenge time set to ${text} EAT\n\n📊 Challenge Topic\n\nEnter the topic name (e.g., "Weekend Gold Analysis"):`);
        break;

      case 'enter_topic':
        session.data.topic = text;
        session.step = 'enter_short_text';
        await ctx.reply('📝 Short Description\n\nEnter a short text for the announcement:');
        break;

      case 'enter_short_text':
        session.data.short_text = text;
        session.step = 'enter_topic_link';
        await ctx.reply('🔗 Topic Link\n\nEnter the reference link (YouTube, website, etc.):');
        break;

      case 'enter_topic_link':
        session.data.topic_link = text;
        session.step = 'enter_num_winners';
        await ctx.reply('🏆 Number of Winners\n\nHow many winners? (1-10):');
        break;

      case 'enter_num_winners':
        const numWinners = parseInt(text);
        if (isNaN(numWinners) || numWinners < 1 || numWinners > 10) {
          await ctx.reply('❌ Enter a number between 1 and 10.');
          return;
        }
        session.data.num_winners = numWinners;
        session.step = 'enter_num_questions';
        await ctx.reply('📝 Number of Questions\n\nHow many questions? (3-10):');
        break;

      case 'enter_num_questions':
        const numQuestions = parseInt(text);
        if (isNaN(numQuestions) || numQuestions < 3 || numQuestions > 10) {
          await ctx.reply('❌ Please enter a number between 3 and 10:');
          return;
        }
        session.data.num_questions = numQuestions;
        session.data.questions = [];
        session.data.current_question = 1;
        session.step = 'enter_question_text';
        await ctx.reply(`Question 1/${numQuestions}\n\nEnter the question text:`);
        break;

      case 'enter_question_text':
        if (!session.data.current_question_data) {
          session.data.current_question_data = {};
        }
        session.data.current_question_data.text = text;
        session.step = 'enter_option_a';
        await ctx.reply('Answer Choices for Question ' + session.data.current_question + '\n\nEnter option A:');
        break;

      case 'enter_option_a':
        session.data.current_question_data.option_a = text;
        session.step = 'enter_option_b';
        await ctx.reply('Enter option B:');
        break;

      case 'enter_option_b':
        session.data.current_question_data.option_b = text;
        session.step = 'enter_option_c';
        await ctx.reply('Enter option C:');
        break;

      case 'enter_option_c':
        session.data.current_question_data.option_c = text;
        session.step = 'enter_option_d';
        await ctx.reply('Enter option D:');
        break;

      case 'enter_option_d':
        session.data.current_question_data.option_d = text;
        session.step = 'enter_correct_answer';
        await ctx.reply('Which option is correct? (A/B/C/D):');
        break;

      case 'enter_correct_answer':
        const answer = text.toUpperCase();
        if (!['A', 'B', 'C', 'D'].includes(answer)) {
          await ctx.reply('❌ Please enter A, B, C, or D:');
          return;
        }
        session.data.current_question_data.correct_answer = answer;
        session.data.questions.push(session.data.current_question_data);
        session.data.current_question_data = {};
        
        if (session.data.current_question < session.data.num_questions) {
          session.data.current_question++;
          session.step = 'enter_question_text';
          await ctx.reply(`✅ Question ${session.data.current_question - 1} saved!\n\nQuestion ${session.data.current_question}/${session.data.num_questions}\n\nEnter the question text:`);
        } else {
          await this.confirmChallenge(ctx);
        }
        break;
    }
  }

  /**
   * Confirm and save challenge
   */
  async confirmChallenge(ctx: Context) {
    const telegramId = ctx.from!.id;
    const session = adminSessions.get(telegramId);
    
    if (!session) return;

    const data = session.data;
    const challengeTime = data.challenge_time || '20:00';
    
    // Calculate reminder times
    const [hours, minutes] = challengeTime.split(':').map(Number);
    
    // 2-hour reminder
    const twoHourBefore = new Date();
    twoHourBefore.setHours(hours - 2, minutes, 0, 0);
    const twoHourTime = `${twoHourBefore.getHours().toString().padStart(2, '0')}:${twoHourBefore.getMinutes().toString().padStart(2, '0')}`;
    
    // 30-min reminder
    const thirtyMinBefore = new Date();
    thirtyMinBefore.setHours(hours, minutes - 30, 0, 0);
    const thirtyMinTime = `${thirtyMinBefore.getHours().toString().padStart(2, '0')}:${thirtyMinBefore.getMinutes().toString().padStart(2, '0')}`;
    
    const summary = `✅ CHALLENGE CREATED!

📊 Summary:
• Day: ${data.day.charAt(0).toUpperCase() + data.day.slice(1)}
• Topic: ${data.topic}
• Questions: ${data.num_questions}
• Posting Time: ${challengeTime}

📅 Scheduled Posts:
• 10:00 AM - Announcement (both channels)
• ${twoHourTime} - 2 hour reminder
• ${thirtyMinTime} - 30 min reminder
• ${challengeTime} - Challenge goes live`;

    await ctx.reply(
      summary,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirm & Schedule', 'admin_confirm_challenge')],
        [Markup.button.callback('❌ Cancel', 'admin_cancel_challenge')],
      ])
    );
  }

  /**
   * Save challenge to database
   */
  async saveChallenge(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const telegramId = ctx.from!.id;
    const session = adminSessions.get(telegramId);
    
    if (!session) {
      await ctx.answerCbQuery('Session expired');
      return;
    }

    try {
      const data = session.data;
      
      // Use the selected date directly
      const challengeDate = data.date;
      const challengeTime = data.challenge_time || '20:00';

      // Create challenge
      const challenge = await challengeService.createChallenge(
        data.day,
        challengeDate,
        data.topic,
        data.short_text,
        data.topic_link,
        challengeTime,
        undefined,
        data.num_winners || 1
      );

      // Add questions
      for (let i = 0; i < data.questions.length; i++) {
        const q = data.questions[i];
        await challengeService.addQuestion(
          challenge.id,
          q.text,
          q.option_a,
          q.option_b,
          q.option_c,
          q.option_d,
          q.correct_answer,
          i + 1
        );
      }

      await ctx.answerCbQuery('✅ Challenge created!');
      await ctx.reply(`✅ Challenge created successfully!\n\nChallenge ID: ${challenge.id}\nDate: ${challengeDate.toDateString()}\nDay: ${data.day}\nTime: ${challengeTime} EAT\nTopic: ${data.topic}\nQuestions: ${data.questions.length}`);
      
      adminSessions.delete(telegramId);
    } catch (error) {
      console.error('Error saving challenge:', error);
      await ctx.reply('❌ Error creating challenge. Please try again.');
    }
  }

  /**
   * Cancel challenge creation
   */
  async cancelChallenge(ctx: Context) {
    const telegramId = ctx.from!.id;
    adminSessions.delete(telegramId);
    await ctx.answerCbQuery('Cancelled');
    await ctx.reply('❌ Challenge creation cancelled.');
  }

  /**
   * Pass winner to next
   */
  async passWinner(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    // Get active or recent challenge
    const challenge = await challengeService.getActiveChallenge();
    if (!challenge) {
      await ctx.reply('❌ No active challenge found.');
      return;
    }

    const winners = await winnerService.getWinners(challenge.id);
    if (winners.length === 0) {
      await ctx.reply('❌ No winners found for this challenge.');
      return;
    }

    const currentWinner = winners[0];
    
    await ctx.reply(
      `🔄 PASS WINNER TO NEXT\n\nCurrent Winner: @${currentWinner.username || 'user'}\n\nReason for passing:`,
      Markup.inlineKeyboard([
        [Markup.button.callback('Not Eligible', `admin_pass_noteligible_${challenge.id}`)],
        [Markup.button.callback('Didn\'t Claim (1hr)', `admin_pass_noclaim_${challenge.id}`)],
        [Markup.button.callback('Other', `admin_pass_other_${challenge.id}`)],
      ])
    );
  }

  /**
   * Handle pass winner
   */
  async handlePassWinner(ctx: Context, challengeId: number, reason: string) {
    if (!this.checkAdmin(ctx)) return;

    try {
      const newWinner = await winnerService.passToNext(challengeId, 1, reason);
      
      if (!newWinner) {
        await ctx.answerCbQuery('No eligible backup found');
        await ctx.reply('❌ No eligible backup winner found.');
        return;
      }

      await ctx.answerCbQuery('✅ Winner updated');
      await ctx.reply(`✅ Winner Updated!\n\n• Old Winner: Disqualified\n• New Winner: @${newWinner.username || 'user'}\n\nThe new winner has been notified.`);
    } catch (error) {
      console.error('Error passing winner:', error);
      await ctx.reply('❌ Error updating winner.');
    }
  }

  /**
   * Cancel today's challenge
   */
  async cancelTodayChallenge(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    const today = new Date();
    const challenge = await challengeService.getChallengeByDate(today);
    
    if (!challenge) {
      await ctx.reply('❌ No challenge scheduled for today.');
      return;
    }

    await ctx.reply(
      `⚠️ WARNING\n\nThis will cancel the ${challenge.day} challenge scheduled for today.\n\nConfirm cancellation?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirm', `admin_cancel_confirm_${challenge.id}`)],
        [Markup.button.callback('❌ Go Back', 'admin_cancel_back')],
      ])
    );
  }

  /**
   * Confirm challenge cancellation
   */
  async confirmCancellation(ctx: Context, challengeId: number) {
    if (!this.checkAdmin(ctx)) return;

    try {
      await challengeService.updateChallengeStatus(challengeId, 'cancelled');
      await ctx.answerCbQuery('✅ Challenge cancelled');
      await ctx.reply('✅ Challenge cancelled successfully.\n\nCancellation notices will be posted to channels.');
    } catch (error) {
      console.error('Error cancelling challenge:', error);
      await ctx.reply('❌ Error cancelling challenge.');
    }
  }

  /**
   * List all scheduled challenges
   */
  async listChallenges(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    try {
      const challenges = await challengeService.getUpcomingChallenges(10);

      if (challenges.length === 0) {
        await ctx.reply('📅 No scheduled challenges found.');
        return;
      }

      let text = '📅 SCHEDULED CHALLENGES\n\n';
      
      for (const challenge of challenges) {
        const questions = await challengeService.getQuestions(challenge.id);
        text += `━━━━━━━━━━━━━━━━━━━━\n`;
        text += `📆 ${challenge.day} - ${new Date(challenge.date).toDateString()}\n`;
        text += `⏰ Time: ${challenge.challenge_time}\n`;
        text += `📊 Topic: ${challenge.topic}\n`;
        text += `📝 Questions: ${questions.length}\n`;
        text += `💰 Prize: $${challenge.prize_amount}\n`;
        text += `🆔 ID: ${challenge.id}\n\n`;
      }

      const keyboard = Markup.inlineKeyboard(
        challenges.slice(0, 5).flatMap(c => [
          [
            Markup.button.callback(`✏️ Edit ${c.day} (${new Date(c.date).toLocaleDateString()})`, `admin_edit_${c.id}`),
            Markup.button.callback(`🗑️ Delete`, `admin_delete_${c.id}`)
          ],
          [
            Markup.button.callback(`📤 Post Now - ${c.day}`, `admin_post_now_${c.id}`)
          ]
        ])
      );

      await ctx.reply(text, keyboard);
    } catch (error) {
      console.error('Error listing challenges:', error);
      await ctx.reply('❌ Error loading challenges.');
    }
  }

  /**
   * Start edit challenge flow
   */
  async editChallenge(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    try {
      const challenges = await challengeService.getUpcomingChallenges(10);

      if (challenges.length === 0) {
        await ctx.reply('📅 No scheduled challenges to edit.');
        return;
      }

      let text = '✏️ SELECT CHALLENGE TO EDIT\n\n';
      
      for (const challenge of challenges) {
        text += `${challenge.day} - ${new Date(challenge.date).toDateString()}\n`;
        text += `Topic: ${challenge.topic}\n`;
        text += `ID: ${challenge.id}\n\n`;
      }

      const keyboard = Markup.inlineKeyboard(
        challenges.slice(0, 5).map(c => [
          Markup.button.callback(`${c.day} (${new Date(c.date).toLocaleDateString()})`, `admin_edit_${c.id}`)
        ])
      );

      await ctx.reply(text, keyboard);
    } catch (error) {
      console.error('Error in edit challenge:', error);
      await ctx.reply('❌ Error loading challenges.');
    }
  }

  /**
   * Handle edit challenge selection
   */
  async handleEditChallenge(ctx: Context, challengeId: number) {
    if (!this.checkAdmin(ctx)) return;

    try {
      const challenge = await challengeService.getChallengeById(challengeId);
      const questions = await challengeService.getQuestions(challengeId);

      if (!challenge) {
        await ctx.answerCbQuery('Challenge not found');
        return;
      }

      await ctx.answerCbQuery();

      let text = `✏️ EDIT CHALLENGE\n\n`;
      text += `📆 Date: ${challenge.day} - ${new Date(challenge.date).toDateString()}\n`;
      text += `📊 Topic: ${challenge.topic}\n`;
      text += `📝 Short Text: ${challenge.short_text}\n`;
      text += `🔗 Link: ${challenge.topic_link}\n`;
      text += `💰 Prize: $${challenge.prize_amount}\n`;
      text += `🏆 Winners: ${challenge.num_winners}\n`;
      text += `📋 Questions: ${questions.length}\n\n`;
      text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      text += `To edit this challenge, use:\n`;
      text += `/editchallenge_${challengeId}\n\n`;
      text += `Then follow the prompts to update:\n`;
      text += `• Topic\n`;
      text += `• Short text\n`;
      text += `• Topic link\n`;
      text += `• Prize amount\n`;
      text += `• Questions\n\n`;
      text += `⚠️ Note: You cannot change the date. Delete and recreate if needed.`;

      await ctx.reply(text);
    } catch (error) {
      console.error('Error handling edit:', error);
      await ctx.reply('❌ Error loading challenge details.');
    }
  }

  /**
   * Start delete challenge flow
   */
  async deleteChallenge(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    try {
      const challenges = await challengeService.getUpcomingChallenges(10);

      if (challenges.length === 0) {
        await ctx.reply('📅 No scheduled challenges to delete.');
        return;
      }

      let text = '🗑️ SELECT CHALLENGE TO DELETE\n\n';
      
      for (const challenge of challenges) {
        text += `${challenge.day} - ${new Date(challenge.date).toDateString()}\n`;
        text += `Topic: ${challenge.topic}\n`;
        text += `ID: ${challenge.id}\n\n`;
      }

      const keyboard = Markup.inlineKeyboard(
        challenges.slice(0, 5).map(c => [
          Markup.button.callback(`🗑️ ${c.day} (${new Date(c.date).toLocaleDateString()})`, `admin_delete_${c.id}`)
        ])
      );

      await ctx.reply(text, keyboard);
    } catch (error) {
      console.error('Error in delete challenge:', error);
      await ctx.reply('❌ Error loading challenges.');
    }
  }

  /**
   * Handle delete challenge selection
   */
  async handleDeleteChallenge(ctx: Context, challengeId: number) {
    if (!this.checkAdmin(ctx)) return;

    try {
      const challenge = await challengeService.getChallengeById(challengeId);
      const questions = await challengeService.getQuestions(challengeId);

      if (!challenge) {
        await ctx.answerCbQuery('Challenge not found');
        return;
      }

      await ctx.answerCbQuery();

      let text = `⚠️ CONFIRM DELETE\n\n`;
      text += `Are you sure you want to delete this challenge?\n\n`;
      text += `📆 Date: ${challenge.day} - ${new Date(challenge.date).toDateString()}\n`;
      text += `📊 Topic: ${challenge.topic}\n`;
      text += `📋 Questions: ${questions.length}\n\n`;
      text += `⚠️ This action cannot be undone!`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Yes, Delete', `admin_delete_confirm_${challengeId}`)],
        [Markup.button.callback('❌ Cancel', 'admin_delete_back')]
      ]);

      await ctx.reply(text, keyboard);
    } catch (error) {
      console.error('Error handling delete:', error);
      await ctx.reply('❌ Error loading challenge details.');
    }
  }

  /**
   * Confirm delete challenge
   */
  async confirmDeleteChallenge(ctx: Context, challengeId: number) {
    if (!this.checkAdmin(ctx)) return;

    try {
      const challenge = await challengeService.getChallengeById(challengeId);
      
      if (!challenge) {
        await ctx.answerCbQuery('Challenge not found');
        return;
      }

      await challengeService.deleteChallenge(challengeId);
      
      await ctx.answerCbQuery('✅ Challenge deleted');
      await ctx.reply(`✅ Challenge deleted successfully!\n\n${challenge.day} - ${new Date(challenge.date).toDateString()}\nTopic: ${challenge.topic}`);
    } catch (error) {
      console.error('Error deleting challenge:', error);
      await ctx.reply('❌ Error deleting challenge.');
    }
  }

  /**
   * List all past challenges
   */
  async pastChallenges(ctx: Context) {
    if (!this.checkAdmin(ctx)) return;

    try {
      const challenges = await challengeService.getPastChallenges(20);

      if (challenges.length === 0) {
        await ctx.reply('📜 No past challenges found.');
        return;
      }

      // Split into chunks to avoid message length limit
      const chunksOf5 = [];
      for (let i = 0; i < challenges.length; i += 5) {
        chunksOf5.push(challenges.slice(i, i + 5));
      }

      for (let chunkIndex = 0; chunkIndex < chunksOf5.length; chunkIndex++) {
        const chunk = chunksOf5[chunkIndex];
        let text = chunkIndex === 0 ? '📜 PAST CHALLENGES\n\n' : '📜 PAST CHALLENGES (continued)\n\n';
        
        for (const challenge of chunk) {
          const questions = await challengeService.getQuestions(challenge.id);
          const participants = await participantService.getParticipants(challenge.id);
          const winners = await winnerService.getWinners(challenge.id);
          
          text += `━━━━━━━━━━━━━━━━━━━━\n`;
          text += `📆 ${challenge.day} - ${new Date(challenge.date).toDateString()}\n`;
          text += `⏰ Time: ${challenge.challenge_time}\n`;
          text += `📊 Topic: ${challenge.topic}\n`;
          text += `📝 Questions: ${questions.length}\n`;
          text += `👥 Participants: ${participants.length}\n`;
          text += `🏆 Winners: ${winners.length}\n`;
          text += `📊 Status: ${challenge.status}\n`;
          text += `🆔 ID: ${challenge.id}\n\n`;
        }

        // Show delete buttons for this chunk
        const keyboard = Markup.inlineKeyboard(
          chunk.map(c => [
            Markup.button.callback(`🗑️ Delete ID ${c.id}`, `admin_delete_past_${c.id}`)
          ])
        );

        await ctx.reply(text, keyboard);
      }
    } catch (error) {
      console.error('Error listing past challenges:', error);
      await ctx.reply('❌ Error loading past challenges.');
    }
  }

  /**
   * Handle delete past challenge selection
   */
  async handleDeletePastChallenge(ctx: Context, challengeId: number) {
    if (!this.checkAdmin(ctx)) return;

    try {
      const challenge = await challengeService.getChallengeById(challengeId);
      const questions = await challengeService.getQuestions(challengeId);
      const participants = await participantService.getParticipants(challengeId);

      if (!challenge) {
        await ctx.answerCbQuery('Challenge not found');
        return;
      }

      await ctx.answerCbQuery();

      let text = `⚠️ CONFIRM DELETE PAST CHALLENGE\n\n`;
      text += `Are you sure you want to delete this challenge?\n\n`;
      text += `📆 Date: ${challenge.day} - ${new Date(challenge.date).toDateString()}\n`;
      text += `⏰ Time: ${challenge.challenge_time}\n`;
      text += `📊 Topic: ${challenge.topic}\n`;
      text += `📋 Questions: ${questions.length}\n`;
      text += `👥 Participants: ${participants.length}\n\n`;
      text += `⚠️ This will permanently delete:\n`;
      text += `• Challenge data\n`;
      text += `• All questions\n`;
      text += `• All participant records\n`;
      text += `• All winner records\n\n`;
      text += `This action cannot be undone!`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Yes, Delete Permanently', `admin_delete_past_confirm_${challengeId}`)],
        [Markup.button.callback('❌ Cancel', 'admin_delete_back')]
      ]);

      await ctx.reply(text, keyboard);
    } catch (error) {
      console.error('Error handling delete past challenge:', error);
      await ctx.reply('❌ Error loading challenge details.');
    }
  }

  /**
   * Confirm delete past challenge
   */
  async confirmDeletePastChallenge(ctx: Context, challengeId: number) {
    if (!this.checkAdmin(ctx)) return;

    try {
      const challenge = await challengeService.getChallengeById(challengeId);
      
      if (!challenge) {
        await ctx.answerCbQuery('Challenge not found');
        return;
      }

      await challengeService.deleteChallenge(challengeId);
      
      await ctx.answerCbQuery('✅ Challenge deleted');
      await ctx.reply(`✅ Past challenge deleted successfully!\n\n${challenge.day} - ${new Date(challenge.date).toDateString()}\nTime: ${challenge.challenge_time}\nTopic: ${challenge.topic}\n\n⚠️ All associated data (questions, participants, winners) has been permanently removed.`);
    } catch (error) {
      console.error('Error deleting past challenge:', error);
      await ctx.reply('❌ Error deleting challenge.');
    }
  }

  /**
   * Handle post now button
   */
  async handlePostNow(ctx: Context, challengeId: number) {
    if (!this.checkAdmin(ctx)) return;

    try {
      const challenge = await challengeService.getChallengeById(challengeId);
      
      if (!challenge) {
        await ctx.answerCbQuery('Challenge not found');
        return;
      }

      await ctx.answerCbQuery();

      const text = `📤 POST NOW - ${challenge.day}\n\n` +
        `Select which posts to send immediately:\n\n` +
        `📆 ${new Date(challenge.date).toDateString()}\n` +
        `⏰ Time: ${challenge.challenge_time}\n` +
        `📊 Topic: ${challenge.topic}`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📢 Morning Posts (10 AM)', `admin_post_morning_${challengeId}`)],
        [Markup.button.callback('⏰ 2-Hour Reminder', `admin_post_2hour_${challengeId}`)],
        [Markup.button.callback('⏰ 30-Min Reminder', `admin_post_30min_${challengeId}`)],
        [Markup.button.callback('🚀 Challenge Live', `admin_post_live_${challengeId}`)],
        [Markup.button.callback('📊 End & Results', `admin_post_results_${challengeId}`)],
        [Markup.button.callback('🎯 All Posts (Sequence)', `admin_post_all_${challengeId}`)],
        [Markup.button.callback('❌ Cancel', 'admin_delete_back')]
      ]);

      await ctx.reply(text, keyboard);
    } catch (error) {
      console.error('Error in post now:', error);
      await ctx.reply('❌ Error loading challenge.');
    }
  }
}

export const adminHandler = new AdminHandler();
export { adminSessions };
