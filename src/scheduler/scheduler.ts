import cron from 'node-cron';
import { Bot } from '../bot/bot';
import { challengeService } from '../services/challengeService';
import { participantService } from '../services/participantService';
import { winnerService } from '../services/winnerService';
import { userService } from '../services/userService';
import { postService } from '../services/postService';
import { notificationService } from '../services/notificationService';
import { config } from '../config';

export class Scheduler {
  private bot: Bot;

  constructor(bot: Bot) {
    this.bot = bot;
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    // Admin reminders (8 AM on challenge days)
    cron.schedule('0 8 * * 0,3', () => this.sendAdminReminder('first'));

    // Admin reminders (4 PM on challenge days)
    cron.schedule('0 16 * * 0,3', () => this.sendAdminReminder('second'));

    // Morning posts (10 AM on challenge days)
    cron.schedule('0 10 * * 0,3', () => this.sendMorningPosts());

    // User notifications (2 PM on challenge days)
    cron.schedule('0 14 * * 0,3', () => this.sendUserNotifications());

    // Check every minute for challenges that need reminders or to start
    cron.schedule('* * * * *', () => this.checkChallengeSchedules());

    console.log('✅ Scheduler started');
  }

  /**
   * Send admin reminder
   */
  private async sendAdminReminder(type: 'first' | 'second') {
    try {
      const today = new Date();
      const challenge = await challengeService.getChallengeByDate(today);

      if (challenge) {
        // Challenge already configured
        return;
      }

      const day = today.getDay() === 0 ? 'Sunday' : 'Wednesday';
      
      let text = '';
      if (type === 'first') {
        text = `⚠️ REMINDER\n\nToday's challenge (${day}) is scheduled for 8:00 PM.\n\n❌ Questions not yet configured!\n\nPlease use /createchallenge to set up today's quiz.\n\n⏰ Next reminder: 4:00 PM`;
      } else {
        text = `🚨 URGENT REMINDER\n\nToday's challenge starts in 4 HOURS!\n\n❌ Questions still not configured!\n\nUse /createchallenge now or the challenge will be auto-cancelled.\n\n⏰ Auto-cancel at: 7:50 PM (if not configured)`;
      }

      await this.bot.bot.telegram.sendMessage(config.adminUserId, text);
    } catch (error) {
      console.error('Error sending admin reminder:', error);
    }
  }

  /**
   * Send morning posts
   */
  private async sendMorningPosts() {
    try {
      const today = new Date();
      const challenges = await challengeService.getChallengesByDate(today);

      if (challenges.length === 0) {
        console.log('No challenges configured for today');
        return;
      }

      // Send morning posts for all challenges today
      for (const challenge of challenges) {
        await this.sendMorningPostsForChallenge(challenge.id);
      }

      console.log('✅ Morning posts sent');
    } catch (error) {
      console.error('Error sending morning posts:', error);
    }
  }

  /**
   * Send morning posts for a specific challenge
   */
  async sendMorningPostsForChallenge(challengeId: number) {
    try {
      const challenge = await challengeService.getChallengeById(challengeId);
      
      if (!challenge) {
        console.log(`Challenge ${challengeId} not found`);
        return;
      }

      const questions = await challengeService.getQuestions(challenge.id);
      const botInfo = await this.bot.bot.telegram.getMe();

      // Main channel post with image
      const mainPost = postService.generateMainChannelPost(challenge, questions.length);
      
      try {
        // Try to send with image
        await this.bot.bot.telegram.sendPhoto(
          config.mainChannelId,
          { source: './assets/weekly_challenges_banner.jpg' },
          { 
            caption: mainPost.text,
            parse_mode: mainPost.parse_mode,
            ...mainPost.keyboard
          }
        );
      } catch (imageError) {
        // Fallback to text-only if image fails
        console.log('Image not found, sending text-only post');
        await this.bot.bot.telegram.sendMessage(
          config.mainChannelId,
          mainPost.text,
          { ...mainPost.keyboard, parse_mode: mainPost.parse_mode, link_preview_options: { is_disabled: true } }
        );
      }

      // Challenge channel terms post
      const termsPost = postService.generateTermsPost(challenge);
      await this.bot.bot.telegram.sendMessage(
        config.challengeChannelId,
        termsPost.text,
        { ...termsPost.keyboard, parse_mode: termsPost.parse_mode, link_preview_options: { is_disabled: true } }
      );

      console.log(`✅ Morning posts sent for challenge ${challengeId}`);
    } catch (error) {
      console.error(`Error sending morning posts for challenge ${challengeId}:`, error);
    }
  }

  /**
   * Send user notifications
   */
  private async sendUserNotifications() {
    try {
      await notificationService.sendChallengeNotifications(this.bot);
      console.log('✅ User notifications sent');
    } catch (error) {
      console.error('Error sending user notifications:', error);
    }
  }

  /**
   * Check challenge schedules and trigger appropriate actions
   */
  private async checkChallengeSchedules() {
    try {
      // Get current time in EAT timezone (UTC+3)
      const now = new Date();
      const eatOffset = 3; // EAT is UTC+3
      const eatTime = new Date(now.getTime() + (eatOffset * 60 * 60 * 1000));
      const currentTime = `${eatTime.getUTCHours().toString().padStart(2, '0')}:${eatTime.getUTCMinutes().toString().padStart(2, '0')}`;
      
      // Create date strings in YYYY-MM-DD format for database comparison
      const currentDateStr = `${eatTime.getUTCFullYear()}-${(eatTime.getUTCMonth() + 1).toString().padStart(2, '0')}-${eatTime.getUTCDate().toString().padStart(2, '0')}`;
      const today = new Date(currentDateStr);
      
      const tomorrowEat = new Date(eatTime);
      tomorrowEat.setUTCDate(tomorrowEat.getUTCDate() + 1);
      const tomorrowDateStr = `${tomorrowEat.getUTCFullYear()}-${(tomorrowEat.getUTCMonth() + 1).toString().padStart(2, '0')}-${tomorrowEat.getUTCDate().toString().padStart(2, '0')}`;
      const tomorrow = new Date(tomorrowDateStr);
      
      // Log what we're searching for (only at :00 seconds)
      if (eatTime.getUTCSeconds() === 0) {
        console.log(`🔍 Scheduler searching for challenges on: ${currentDateStr} and ${tomorrowDateStr}`);
      }
      
      const todayChallenges = await challengeService.getChallengesByDate(today);
      const tomorrowChallenges = await challengeService.getChallengesByDate(tomorrow);
      const allChallenges = [...todayChallenges, ...tomorrowChallenges];

      if (allChallenges.length === 0) return;
      
      // Log found challenges (only once per minute to avoid spam)
      if (eatTime.getUTCSeconds() === 0) {
        console.log(`📅 Found ${allChallenges.length} challenge(s) at ${currentTime} EAT`);
        allChallenges.forEach(c => {
          const challengeDateStr = new Date(c.date).toISOString().split('T')[0];
          console.log(`  - ID ${c.id}: ${c.day} ${challengeDateStr} at ${c.challenge_time}, status: ${c.status}`);
        });
      }

      const currentDate = new Date(eatTime.getUTCFullYear(), eatTime.getUTCMonth(), eatTime.getUTCDate());

      for (const challenge of allChallenges) {
        const challengeDateRaw = new Date(challenge.date);
        // Normalize challenge date to midnight (strip time component)
        const challengeDate = new Date(challengeDateRaw.getFullYear(), challengeDateRaw.getMonth(), challengeDateRaw.getDate());
        const challengeTime = challenge.challenge_time.substring(0, 5); // Strip seconds if present (e.g., "06:00:00" -> "06:00")
        const [hours, minutes] = challengeTime.split(':').map(Number);
        
        // Calculate 2-hour reminder time
        let twoHourHours = hours - 2;
        let twoHourDate = new Date(challengeDate.getTime());
        if (twoHourHours < 0) {
          twoHourHours += 24;
          twoHourDate.setDate(twoHourDate.getDate() - 1); // Previous day
        }
        const twoHourTime = `${twoHourHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        
        // Calculate 30-min reminder time
        let thirtyMinHours = hours;
        let thirtyMinMinutes = minutes - 30;
        let thirtyMinDate = new Date(challengeDate.getTime());
        if (thirtyMinMinutes < 0) {
          thirtyMinMinutes += 60;
          thirtyMinHours -= 1;
          if (thirtyMinHours < 0) {
            thirtyMinHours += 24;
            thirtyMinDate.setDate(thirtyMinDate.getDate() - 1); // Previous day
          }
        }
        const thirtyMinTime = `${thirtyMinHours.toString().padStart(2, '0')}:${thirtyMinMinutes.toString().padStart(2, '0')}`;
        
        // Calculate end time (10 minutes after start)
        let endHours = hours;
        let endMinutes = minutes + 10;
        let endDate = new Date(challengeDate.getTime());
        if (endMinutes >= 60) {
          endMinutes -= 60;
          endHours += 1;
          if (endHours >= 24) {
            endHours -= 24;
            endDate.setDate(endDate.getDate() + 1); // Next day
          }
        }
        const endTimeStr = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;

        // Use date strings for comparison (avoids timezone mismatch)
        const currentDateStr2 = `${currentDate.getFullYear()}-${(currentDate.getMonth()+1).toString().padStart(2,'0')}-${currentDate.getDate().toString().padStart(2,'0')}`;
        const challengeDateStr = `${challengeDate.getFullYear()}-${(challengeDate.getMonth()+1).toString().padStart(2,'0')}-${challengeDate.getDate().toString().padStart(2,'0')}`;
        const twoHourDateStr = `${twoHourDate.getFullYear()}-${(twoHourDate.getMonth()+1).toString().padStart(2,'0')}-${twoHourDate.getDate().toString().padStart(2,'0')}`;
        const thirtyMinDateStr = `${thirtyMinDate.getFullYear()}-${(thirtyMinDate.getMonth()+1).toString().padStart(2,'0')}-${thirtyMinDate.getDate().toString().padStart(2,'0')}`;
        const endDateStr = `${endDate.getFullYear()}-${(endDate.getMonth()+1).toString().padStart(2,'0')}-${endDate.getDate().toString().padStart(2,'0')}`;

        // Log comparison details once per minute
        if (eatTime.getUTCSeconds() === 0) {
          console.log(`⏰ Challenge ${challenge.id}: now=${currentDateStr2} ${currentTime} | start=${challengeDateStr} ${challengeTime} | end=${endDateStr} ${endTimeStr} | status=${challenge.status}`);
        }
        // 2-hour reminder (check if it's the right date and time)
        if (currentDateStr2 === twoHourDateStr && currentTime === twoHourTime && challenge.status === 'scheduled') {
          await this.send2HourReminder(challenge.id);
        }

        // 30-minute reminder
        if (currentDateStr2 === thirtyMinDateStr && currentTime === thirtyMinTime && challenge.status === 'scheduled') {
          await this.send30MinReminder(challenge.id);
        }

        // Start challenge
        if (currentDateStr2 === challengeDateStr && currentTime === challengeTime && challenge.status === 'scheduled') {
          await this.startChallenge(challenge.id);
        }

        // End challenge
        if (currentDateStr2 === endDateStr && currentTime === endTimeStr && challenge.status === 'active') {
          await this.endChallenge(challenge.id);
        }
      }
    } catch (error) {
      console.error('Error checking challenge schedules:', error);
    }
  }

  /**
   * Send 2-hour reminder
   */
  private async send2HourReminder(challengeId?: number) {
    try {
      let challenge;
      if (challengeId) {
        challenge = await challengeService.getChallengeById(challengeId);
      } else {
        const today = new Date();
        challenge = await challengeService.getChallengeByDate(today);
      }

      if (!challenge) return;

      const reminderPost = postService.generate2HourReminder(challenge);
      await this.bot.bot.telegram.sendMessage(
        config.mainChannelId,
        reminderPost.text,
        { ...reminderPost.keyboard, parse_mode: reminderPost.parse_mode, link_preview_options: { is_disabled: true } }
      );

      console.log(`✅ 2-hour reminder sent for challenge ${challenge.id}`);
    } catch (error) {
      console.error('Error sending 2-hour reminder:', error);
    }
  }

  /**
   * Send 30-minute reminder
   */
  private async send30MinReminder(challengeId?: number) {
    try {
      let challenge;
      if (challengeId) {
        challenge = await challengeService.getChallengeById(challengeId);
      } else {
        const today = new Date();
        challenge = await challengeService.getChallengeByDate(today);
      }

      if (!challenge) return;

      const reminderPost = postService.generate30MinReminder(challenge);
      await this.bot.bot.telegram.sendMessage(
        config.mainChannelId,
        reminderPost.text,
        { ...reminderPost.keyboard, parse_mode: reminderPost.parse_mode, link_preview_options: { is_disabled: true } }
      );

      console.log(`✅ 30-minute reminder sent for challenge ${challenge.id}`);
    } catch (error) {
      console.error('Error sending 30-minute reminder:', error);
    }
  }

  /**
   * Start challenge
   */
  private async startChallenge(challengeId?: number) {
    try {
      let challenge;
      if (challengeId) {
        challenge = await challengeService.getChallengeById(challengeId);
      } else {
        const today = new Date();
        challenge = await challengeService.getChallengeByDate(today);
      }

      if (!challenge) return;

      // Update status to active
      await challengeService.updateChallengeStatus(challenge.id, 'active');

      const questions = await challengeService.getQuestions(challenge.id);
      const botInfo = await this.bot.bot.telegram.getMe();

      const livePost = postService.generateChallengeLivePost(challenge, questions.length, botInfo.username!);
      await this.bot.bot.telegram.sendMessage(
        config.challengeChannelId,
        livePost.text,
        { ...livePost.keyboard, parse_mode: livePost.parse_mode, link_preview_options: { is_disabled: true } }
      );

      console.log(`✅ Challenge ${challenge.id} started`);
    } catch (error) {
      console.error('Error starting challenge:', error);
    }
  }

  /**
   * End challenge and post results
   */
  private async endChallenge(challengeId?: number) {
    try {
      let challenge;
      if (challengeId) {
        challenge = await challengeService.getChallengeById(challengeId);
      } else {
        const today = new Date();
        challenge = await challengeService.getChallengeByDate(today);
      }

      if (!challenge || challenge.status !== 'active') return;

      // Update status to completed
      await challengeService.updateChallengeStatus(challenge.id, 'completed');

      // Calculate ranks
      await participantService.calculateRanks(challenge.id);

      // Get perfect scorers
      const perfectScorers = await participantService.getPerfectScorers(challenge.id);

      // Determine winners (check consecutive win rule)
      const eligibleWinners: typeof perfectScorers = [];
      for (const scorer of perfectScorers) {
        const wonLast = await userService.wonLastChallenge(scorer.telegram_id, challenge.date);
        if (!wonLast) {
          eligibleWinners.push(scorer);
        }
      }

      // Create winner entries
      const numWinners = Math.min(challenge.num_winners, eligibleWinners.length);
      for (let i = 0; i < numWinners; i++) {
        const winner = eligibleWinners[i];
        const user = await userService.getUserByTelegramId(winner.telegram_id);
        if (user) {
          await winnerService.createWinner(
            challenge.id,
            user.id,
            winner.telegram_id,
            winner.username,
            i + 1,
            challenge.prize_amount
          );
        }
      }

      // Send notifications to perfect scorers
      await this.sendResultNotifications(challenge.id, eligibleWinners, perfectScorers);

      // Post results to channel
      const stats = await participantService.getChallengeStats(challenge.id);
      const winners = await winnerService.getWinners(challenge.id);
      const botInfo = await this.bot.bot.telegram.getMe();

      const resultsPost = postService.generateResultsPost(
        challenge,
        winners,
        perfectScorers,
        stats,
        botInfo.username!
      );

      await this.bot.bot.telegram.sendMessage(
        config.challengeChannelId,
        resultsPost.text,
        { ...resultsPost.keyboard, parse_mode: resultsPost.parse_mode, link_preview_options: { is_disabled: true } }
      );

      // Send admin report
      await this.sendAdminReport(challenge.id);

      console.log('✅ Challenge ended and results posted');
    } catch (error) {
      console.error('Error ending challenge:', error);
    }
  }

  /**
   * Send result notifications to perfect scorers
   */
  private async sendResultNotifications(challengeId: number, eligibleWinners: any[], allPerfectScorers: any[]) {
    const stats = await participantService.getChallengeStats(challengeId);
    const challenge = await challengeService.getChallengeById(challengeId);
    const backupLimit = config.backupListSize + 1; // 1 winner + 5 backups

    if (!challenge || !challenge.started_at) return;

    for (let i = 0; i < allPerfectScorers.length && i < backupLimit; i++) {
      const scorer = allPerfectScorers[i];
      
      // Check if this person is eligible (not a consecutive winner)
      const isEligible = eligibleWinners.some(w => w.telegram_id === scorer.telegram_id);
      if (!isEligible) continue; // Skip consecutive winners
      
      try {
        let message = '';
        
        // Calculate precise time with milliseconds
        const preciseTime = this.formatTimeWithMs(scorer.completed_at, challenge.started_at);
        
        if (i === 0) {
          // Winner (first eligible perfect scorer)
          message = `🏆 <b>CONGRATULATIONS!</b> 🏆\n\n` +
            `<b>You WON today's challenge!</b>\n\n` +
            `💰 <b>Prize:</b> $${challenge.prize_amount}\n` +
            `📊 <b>Final Score:</b> ${scorer.score}/${scorer.total_questions} ✅\n` +
            `⚡ <b>Response Time:</b> ${preciseTime}\n` +
            `📍 <b>Completion Order:</b> #${scorer.completion_order}\n` +
            `🏅 <b>Final Rank:</b> ${scorer.rank}\n` +
            `👥 <b>Total Participants:</b> ${stats.total_participants}\n` +
            `🎯 <b>Perfect Scores:</b> ${allPerfectScorers.length}\n\n` +
            `📸 <b>TO CLAIM YOUR PRIZE:</b>\n` +
            `DM @birrFXadmin with this screenshot\n\n` +
            `⚠️ <i>Prize must be claimed within ${config.prizeClaimDeadlineHours} HOUR</i>`;
        } else if (i > 0 && i < backupLimit) {
          // Backup (positions 2-6)
          const backupPosition = this.getOrdinal(i);
          message = `✨ <b>EXCELLENT PERFORMANCE!</b>\n\n` +
            `📊 <b>Final Score:</b> ${scorer.score}/${scorer.total_questions} ✅\n` +
            `⚡ <b>Response Time:</b> ${preciseTime}\n` +
            `📍 <b>Completion Order:</b> #${scorer.completion_order}\n` +
            `🏅 <b>Final Rank:</b> ${scorer.rank}\n` +
            `👥 <b>Total Participants:</b> ${stats.total_participants}\n` +
            `🎯 <b>Perfect Scores:</b> ${allPerfectScorers.length}\n\n` +
            `🎯 <b>You are the ${backupPosition} BACKUP!</b>\n\n` +
            `<i>If the previous winner(s) are found ineligible or don't claim the prize within ${config.prizeClaimDeadlineHours} hour, you may receive it.</i>\n\n` +
            `Great job! 🎉`;
        }

        if (message) {
          await this.bot.bot.telegram.sendMessage(scorer.telegram_id, message, { parse_mode: 'HTML' });
        }
      } catch (error) {
        console.error(`Error sending notification to ${scorer.telegram_id}:`, error);
      }
    }
  }

  /**
   * Format time with milliseconds
   */
  private formatTimeWithMs(completedAt: Date, startedAt: Date): string {
    const diffMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    const totalSeconds = diffMs / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = (totalSeconds % 60).toFixed(3);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Get ordinal suffix for numbers (1st, 2nd, 3rd, etc.)
   */
  private getOrdinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /**
   * Send admin report
   */
  private async sendAdminReport(challengeId: number) {
    try {
      const challenge = await challengeService.getChallengeById(challengeId);
      const stats = await participantService.getChallengeStats(challengeId);
      const perfectScorers = await participantService.getPerfectScorers(challengeId);
      const winners = await winnerService.getWinners(challengeId);

      let report = `📊 ADMIN REPORT\n${challenge?.day} Challenge - ${new Date(challenge?.date!).toDateString()}\n\n`;
      report += `⏰ TIMING:\n• Started: 8:00 PM\n• Ended: 8:10 PM\n• Duration: 10 minutes\n\n`;
      report += `👥 PARTICIPATION:\n• Total Attempts: ${stats.total_participants}\n\n`;
      report += `🎯 SCORING:\n• Perfect Scores: ${stats.perfect_scores}\n• Average Score: ${(stats.avg_score * 5).toFixed(1)}/5\n\n`;
      report += `🏆 WINNERS:\n`;
      
      if (winners.length > 0) {
        winners.forEach((w, i) => {
          report += `${i + 1}. @${w.username || 'user'}\n`;
        });
      } else {
        report += 'No winners\n';
      }

      // Add backup list
      if (perfectScorers.length > 1) {
        const backupLimit = Math.min(config.backupListSize + 1, perfectScorers.length);
        report += `\n📋 BACKUP LIST:\n`;
        for (let i = 1; i < backupLimit; i++) {
          const backup = perfectScorers[i];
          report += `${i}. @${backup.username || 'user'} - ${backup.completion_time_seconds}s\n`;
        }
      }

      await this.bot.bot.telegram.sendMessage(config.adminUserId, report);
    } catch (error) {
      console.error('Error sending admin report:', error);
    }
  }

  /**
   * Auto-cancel if not configured
   */
  private async autoCancel() {
    try {
      const today = new Date();
      const challenge = await challengeService.getChallengeByDate(today);

      if (!challenge) {
        const day = today.getDay() === 0 ? 'Sunday' : 'Wednesday';
        const cancelPost = postService.generateCancellationPost(day, 'Next challenge day');
        
        await this.bot.bot.telegram.sendMessage(config.mainChannelId, cancelPost);
        await this.bot.bot.telegram.sendMessage(config.challengeChannelId, cancelPost);
        
        console.log('✅ Challenge auto-cancelled');
      }
    } catch (error) {
      console.error('Error auto-cancelling challenge:', error);
    }
  }
}
