import cron from 'node-cron';
import { Bot } from '../bot/bot';
import { tradingChallengeService, TradingChallenge } from '../services/tradingChallengeService';
import { exnessService } from '../services/exnessService';
import { config } from '../config';
import { Markup } from 'telegraf';

// Convert stored UTC date to EAT for display
const toEAT = (d: Date) => new Date(new Date(d).getTime() + 3 * 60 * 60 * 1000);

export class TradingScheduler {
  private bot: Bot;

  constructor(bot: Bot) {
    this.bot = bot;
  }

  start() {
    cron.schedule('* * * * *', () => this.checkTradingSchedules());
    console.log('✅ Trading scheduler started');
  }

  /**
   * Get current time in EAT (UTC+3) — same approach as weekly scheduler
   */
  private getEATTime() {
    const now = new Date();
    const eatTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const dateStr = `${eatTime.getUTCFullYear()}-${(eatTime.getUTCMonth() + 1).toString().padStart(2, '0')}-${eatTime.getUTCDate().toString().padStart(2, '0')}`;
    const timeStr = `${eatTime.getUTCHours().toString().padStart(2, '0')}:${eatTime.getUTCMinutes().toString().padStart(2, '0')}`;
    const dayOfWeek = eatTime.getUTCDay();
    return { dateStr, timeStr, eatTime, dayOfWeek };
  }

  /**
   * Convert a stored UTC date to EAT date/time strings
   * Dates are stored as real UTC (admin EAT input - 3h)
   * Add 3h back to get EAT for comparison with getEATTime()
   */
  private toEATStrings(date: Date): { dateStr: string; timeStr: string } {
    const d = new Date(new Date(date).getTime() + 3 * 60 * 60 * 1000);
    const dateStr = `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
    const timeStr = `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
    return { dateStr, timeStr };
  }

  private async checkTradingSchedules() {
    try {
      const { dateStr, timeStr, eatTime, dayOfWeek } = this.getEATTime();
      const challenges = await tradingChallengeService.getAllChallenges();

      // Log once per minute at :00 seconds
      if (eatTime.getUTCSeconds() === 0 && challenges.length > 0) {
        const active = challenges.filter(c => !['draft', 'completed'].includes(c.status));
        if (active.length > 0) {
          console.log(`🔍 Trading scheduler: ${dateStr} ${timeStr} EAT | ${active.length} active challenge(s)`);
          active.forEach(c => console.log(`  - ${c.title} [${c.status}]`));
        }
      }

      // Log all upcoming schedules once at 08:01 EAT
      if (timeStr === '08:01') {
        for (const c of challenges) {
          if (['draft', 'completed'].includes(c.status)) continue;
          const start = this.toEATStrings(c.start_date);
          const end = this.toEATStrings(c.end_date);
          const startMs = new Date(start.dateStr).getTime();
          const nowMs = new Date(dateStr).getTime();
          const daysToStart = Math.round((startMs - nowMs) / (1000 * 60 * 60 * 24));

          console.log(`📅 SCHEDULE for ${c.title} [${c.status}]:`);
          console.log(`  Start: ${start.dateStr} ${start.timeStr} EAT (${daysToStart} days away)`);
          console.log(`  End: ${end.dateStr} ${end.timeStr} EAT`);
          if (c.status === 'registration_open') {
            if (daysToStart === 3) console.log(`  ⏰ 3-day countdown: TODAY at 08:00`);
            else if (daysToStart === 2) console.log(`  ⏰ 2-day countdown: TODAY at 08:00`);
            else if (daysToStart === 1) console.log(`  ⏰ 1-day countdown: TODAY at 08:00`);
            else if (daysToStart > 3) console.log(`  ⏰ 3-day countdown: ${new Date(startMs - 3*86400000).toISOString().split('T')[0]} at 08:00`);
          }
          if (c.status === 'active') {
            const tradingDay = this.getTradingDay(c, dateStr);
            console.log(`  📊 Trading day: ${tradingDay}/10`);
            if (dayOfWeek >= 1 && dayOfWeek <= 5) {
              console.log(`  ☀️ Morning post: 08:00 EAT`);
              console.log(`  🌙 Evening post: 20:00 EAT`);
            } else {
              console.log(`  🚫 Weekend — no daily posts`);
            }
          }
        }
      }

      for (const challenge of challenges) {
        if (challenge.status === 'draft' || challenge.status === 'completed') continue;

        await this.checkCountdowns(challenge, dateStr, timeStr, eatTime);
        await this.checkChallengeStart(challenge, dateStr, timeStr);
        await this.checkDailyPosts(challenge, dateStr, timeStr, dayOfWeek);
        await this.checkChallengeEnd(challenge, dateStr, timeStr);
        await this.checkSubmissionDeadline(challenge, dateStr, timeStr);
        await this.checkDailyAdminSummary(challenge, dateStr, timeStr);
        await this.checkAutoEngagement(challenge, dateStr, timeStr, eatTime);
        await this.checkPartnerScreening(challenge, dateStr, timeStr);
      }
    } catch (error) {
      console.error('Trading scheduler error:', error);
    }
  }

  // ==================== COUNTDOWN POSTS (3, 2, 1 day before) ====================

  private countdownPostedToday: Set<string> = new Set();

  private async checkCountdowns(challenge: TradingChallenge, dateStr: string, timeStr: string, eatTime: Date) {
    if (challenge.status !== 'registration_open') return;

    // Only between 08:00-08:05 EAT (5 minute window for resilience)
    const hour = eatTime.getUTCHours();
    const minute = eatTime.getUTCMinutes();
    if (hour !== 8 || minute > 4) return;

    const start = this.toEATStrings(challenge.start_date);
    const startMs = new Date(start.dateStr).getTime();
    const nowMs = new Date(dateStr).getTime();
    const diffDays = Math.round((startMs - nowMs) / (1000 * 60 * 60 * 24));

    // Prevent duplicate posts on same day
    const key = `${challenge.id}_${dateStr}_${diffDays}`;
    if (this.countdownPostedToday.has(key)) return;

    if (diffDays >= 1 && diffDays <= 3) {
      console.log(`⏰ Trading countdown: ${diffDays} days before ${challenge.title} (${dateStr} ${timeStr} EAT)`);
      await this.postCountdown(challenge, diffDays);
      this.countdownPostedToday.add(key);
    }
  }

  async postCountdown(challenge: TradingChallenge, daysLeft: number) {
    const startStr = toEAT(challenge.start_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    const botInfo = await this.bot.bot.telegram.getMe();

    let header = '';
    let body = '';
    if (daysLeft === 3) {
      header = '<b>⏰ 3 DAYS REMAINING!</b>';
      body = `<b>${challenge.title}</b> starts in <b>3 days!</b>\n\nHaven't registered yet? Don't miss out!`;
    } else if (daysLeft === 2) {
      header = '<b>⏰ 2 DAYS REMAINING!</b>';
      body = `<b>${challenge.title}</b> starts in <b>2 days!</b>\n\nTime is running out to register!`;
    } else {
      header = '<b>🚨 LAST CHANCE TO REGISTER!</b>';
      body = `<b>${challenge.title}</b> starts <b>TOMORROW!</b>\n\nAfter the challenge starts, registration closes and no more entries will be accepted.\n\nDon't miss out — register <b>NOW!</b> 🚀`;
    }

    let links = '';
    if (challenge.pdf_url) links += `\n📄 Challenge Rules: <a href="${challenge.pdf_url}">Download PDF</a>`;
    if (challenge.video_url) links += `\n🎥 Challenge Guide: <a href="${challenge.video_url}">Watch Video</a>`;

    const prizeText = this.getPrizeSummary(challenge);
    const text = `${header}\n\n${body}\n\n📅 <b>Start:</b> ${startStr}\n💰 $${challenge.starting_balance} → 🎯 $${challenge.target_balance}\n${prizeText}\n${links}\n\n👉 <b>Tap "Join Challenge" below to register!</b>`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🚀 Join Challenge', `https://t.me/${botInfo.username}?start=tc_register_${challenge.id}`)],
      [Markup.button.url('💰 Open Exness Account', config.exnessPartnerSignupLink)],
    ]);

    const opts = { parse_mode: 'HTML' as const, ...keyboard, link_preview_options: { is_disabled: true } };

    try {
      await this.bot.bot.telegram.sendMessage(config.mainChannelId, text, opts);
      await this.bot.bot.telegram.sendMessage(config.challengeChannelId, text, opts);
      console.log(`✅ Trading countdown posted: ${daysLeft} days for ${challenge.title}`);
    } catch (e) {
      console.error('Error posting countdown:', e);
    }
  }

  private getPrizeSummary(challenge: TradingChallenge): string {
    if (challenge.prize_pool_text) {
      return `<b>🏆 PRIZE POOL</b>\n\n<b>${challenge.prize_pool_text}</b>`;
    }
    const realPrizes = typeof challenge.real_prizes === 'string' ? JSON.parse(challenge.real_prizes) : (challenge.real_prizes || []);
    const demoPrizes = typeof challenge.demo_prizes === 'string' ? JSON.parse(challenge.demo_prizes) : (challenge.demo_prizes || []);
    const allPrizes = [...realPrizes, ...demoPrizes];
    const numericPrizes = allPrizes.map((p: any) => parseFloat(String(p))).filter((n: number) => !isNaN(n));
    if (numericPrizes.length === allPrizes.length && numericPrizes.length > 0) {
      const total = numericPrizes.reduce((sum: number, n: number) => sum + n, 0);
      return `🏆 <b>Prize Pool: $${total}</b>`;
    } else if (allPrizes.length > 0) {
      return `🏆 <b>Prizes:</b> ${allPrizes.join(', ')}`;
    }
    return '';
  }

  // ==================== CHALLENGE START ====================

  private challengeStartPosted: Set<number> = new Set();

  private async checkChallengeStart(challenge: TradingChallenge, dateStr: string, timeStr: string) {
    if (challenge.status !== 'registration_open') return;

    const start = this.toEATStrings(challenge.start_date);
    const hour = parseInt(timeStr.split(':')[0]);
    const minute = parseInt(timeStr.split(':')[1]);

    // 5-minute window around start time
    if (dateStr === start.dateStr) {
      const startHour = parseInt(start.timeStr.split(':')[0]);
      const startMin = parseInt(start.timeStr.split(':')[1]);
      const diff = (hour * 60 + minute) - (startHour * 60 + startMin);

      if (diff >= 0 && diff <= 4 && !this.challengeStartPosted.has(challenge.id)) {
        this.challengeStartPosted.add(challenge.id);
        await tradingChallengeService.updateChallengeStatus(challenge.id, 'active');
        console.log(`✅ Trading challenge ${challenge.id} "${challenge.title}" is now ACTIVE (${dateStr} ${timeStr} EAT)`);

        // Send challenge start photo post to BOTH channels
        await this.postChallengeStartAnnouncement(challenge);
      }
    }
  }

  private async postChallengeStartAnnouncement(challenge: TradingChallenge) {
    let links = '';
    if (challenge.pdf_url) links += `\n📄 Rules: <a href="${challenge.pdf_url}">Download PDF</a>`;
    if (challenge.video_url) links += `\n🎥 Guide: <a href="${challenge.video_url}">Watch Video</a>`;

    const caption = `<b>🚀 CHALLENGE HAS STARTED!</b>\n\n` +
      `<b>${challenge.title}</b> is officially <b>LIVE!</b> 🔥\n\n` +
      `The race begins NOW!\n\n` +
      `💪 Stay focused, follow the rules, and trade smart.\n` +
      `This is your journey — make every trade count!\n\n` +
      `<i>Good luck, traders!</i> 🍀\n` +
      links + `\n\n@${config.mainChannelUsername}`;

    const opts = { caption, parse_mode: 'HTML' as const };

    try {
      await this.bot.bot.telegram.sendPhoto(config.mainChannelId, { source: './assets/challengestart.jpg' }, opts);
      await this.bot.bot.telegram.sendPhoto(config.challengeChannelId, { source: './assets/challengestart.jpg' }, opts);
      console.log(`✅ Challenge start photo posted for ${challenge.title}`);
    } catch (e) {
      console.error('Error posting challenge start photo:', e);
      // Fallback to text-only
      try {
        const textOpts = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };
        await this.bot.bot.telegram.sendMessage(config.mainChannelId, caption, textOpts);
        await this.bot.bot.telegram.sendMessage(config.challengeChannelId, caption, textOpts);
      } catch (e2) {
        console.error('Error posting challenge start text fallback:', e2);
      }
    }
  }

  // ==================== DAILY POSTS ====================

  private dailyPostsPosted: Set<string> = new Set();

  private async checkDailyPosts(challenge: TradingChallenge, dateStr: string, timeStr: string, dayOfWeek: number) {
    if (challenge.status !== 'active') return;
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    const tradingDay = this.getTradingDay(challenge, dateStr);
    if (tradingDay < 1 || tradingDay > 10) return;

    const hour = parseInt(timeStr.split(':')[0]);
    const minute = parseInt(timeStr.split(':')[1]);

    // Morning: 08:00-08:04
    const morningKey = `morning_${challenge.id}_${dateStr}`;
    if (hour === 8 && minute <= 4 && !this.dailyPostsPosted.has(morningKey)) {
      this.dailyPostsPosted.add(morningKey);
      console.log(`☀️ Trading morning post: Day ${tradingDay} for ${challenge.title}`);
      await this.postMorningMessage(challenge, tradingDay);
    }

    // Evening: 20:00-20:04
    const eveningKey = `evening_${challenge.id}_${dateStr}`;
    if (hour === 20 && minute <= 4 && !this.dailyPostsPosted.has(eveningKey)) {
      this.dailyPostsPosted.add(eveningKey);
      console.log(`🌙 Trading evening post: Day ${tradingDay} for ${challenge.title}`);
      await this.postEveningMessage(challenge, tradingDay);
    }
  }

  private getTradingDay(challenge: TradingChallenge, currentDateStr: string): number {
    const start = this.toEATStrings(challenge.start_date);
    const startDate = new Date(start.dateStr);
    const currentDate = new Date(currentDateStr);
    let tradingDay = 0;
    const d = new Date(startDate);

    while (d <= currentDate) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) tradingDay++;
      const dStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
      if (dStr === currentDateStr) break;
      d.setDate(d.getDate() + 1);
    }
    return tradingDay;
  }

  async postMorningMessage(challenge: TradingChallenge, day: number) {
    const morningMessages: { [key: number]: { emoji: string; text: string } } = {
      1: { emoji: '📈', text: '\n\nYour first trading day! Make it count.\nPlan your trades, manage your risk, and stay disciplined.\n\n<i>Every pip matters</i> 🎯' },
      2: { emoji: '📈', text: '\n\nNew day, new opportunities!\nStay disciplined and stick to your strategy.\n\n<i>Consistency beats luck every time</i> 🎯' },
      3: { emoji: '📊', text: '\n\nMidweek momentum! Keep your eyes on the target.\nEvery pip counts towards your goal 🎯\n\n<i>Trade smart, not hard</i> 💡' },
      4: { emoji: '💪', text: '\n\nAlmost through the first week!\nStay patient, protect your capital, and trust the process.\n\n<i>The best traders are the most disciplined ones</i> 🏆' },
      5: { emoji: '🏁', text: '\n\nLast trading day of Week 1!\nFinish the week strong and set yourself up for Week 2.\n\n<i>Have a great weekend!</i> 🌟' },
      6: { emoji: '🚀', text: '\n\nWelcome back! Week 2 is here.\n5 more trading days to hit your target!\n\n<i>Stay focused and finish strong</i> 💪' },
      7: { emoji: '🔥', text: '\n\nSecond week is heating up!\nReview your trades, learn from mistakes, and adapt.\n\n<i>The market rewards those who stay sharp</i> 📈' },
      8: { emoji: '⚡', text: '\n\nOnly 3 days left! The finish line is in sight.\nKeep your risk tight and your mind focused.\n\n<i>Champions are made in the final stretch</i> 🏆' },
      9: { emoji: '🎯', text: '\n\nTomorrow is the FINAL DAY!\nProtect your gains and position yourself for a strong finish.\n\n<i>You\'ve come this far — don\'t let up now</i> 💪' },
      10: { emoji: '🏁', text: '\n\nThis is it! Last trading day of the challenge.\nMake it count and finish strong!\n\n⚠️ <b>Challenge closes tonight at 11:59 PM</b>\n\nGive it everything you\'ve got! 🔥' },
    };

    const msg = morningMessages[day];
    if (!msg) return;

    let header = '';
    if (day === 1) header = `<b>${msg.emoji} DAY 1 OF 10</b>\n\n<b>${challenge.title}</b>${msg.text}`;
    else if (day === 6) header = `<b>${msg.emoji} WEEK 2 — DAY ${day} OF 10</b>\n\n<b>${challenge.title}</b>${msg.text}`;
    else if (day === 10) header = `<b>${msg.emoji} FINAL DAY!</b>\n\n<b>${challenge.title}</b> — <b>DAY ${day} OF 10</b>${msg.text}`;
    else header = `<b>${msg.emoji} DAY ${day} OF 10</b>\n\n<b>${challenge.title}</b>${msg.text}`;

    let links = '';
    if (challenge.pdf_url) links += `\n📄 Rules: <a href="${challenge.pdf_url}">Download PDF</a>`;
    if (challenge.video_url) links += `\n🎥 Guide: <a href="${challenge.video_url}">Watch Video</a>`;

    const text = `${header}\n${links}\n\n@${config.mainChannelUsername}`;
    const opts = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };

    const bothChannels = day === 1 || day === 6 || day === 10;

    try {
      if (bothChannels) {
        await this.bot.bot.telegram.sendMessage(config.mainChannelId, text, opts);
      }
      await this.bot.bot.telegram.sendMessage(config.challengeChannelId, text, opts);
    } catch (e) {
      console.error(`Error posting morning Day ${day}:`, e);
    }
  }

  async postEveningMessage(challenge: TradingChallenge, day: number) {
    const dayWords = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];

    let links = '';
    if (challenge.pdf_url) links = `\n📄 Rules: <a href="${challenge.pdf_url}">Download PDF</a>`;

    let text = '';
    if (day === 5) {
      text = `<b>🔥 WEEK 1 IS ALMOST OVER!</b>\n\nHow was the week, traders?\n\nReact below:\n🔥 If you crushed it this week!\n😎 If it was decent, but there's room for more\n👍 If you had a tough week, but still in the game\n✍️ If you hit your drawdown limit\n\nEnjoy the weekend and come back stronger! 💪\n\n<b>DON'T FORGET — NO WEEKEND TRADING!</b>\n${links}\n\n@${config.mainChannelUsername}`;
    } else if (day === 9) {
      text = `<b>🔥 DAY ${dayWords[day]} IS ALMOST OVER</b>\n\nHow was the Day, traders?\n\nReact below:\n🔥 If you crushed it today!\n😎 If it was decent, but there's room for more\n👍 If you had a tough day, but still in the game\n✍️ If you hit your daily drawdown\n\n<b>TOMORROW IS THE FINAL DAY!</b> 🏁\n${links}\n\n@${config.mainChannelUsername}`;
    } else if (day === 10) {
      text = `<b>⏰ CHALLENGE IS ALMOST OVER!</b>\n\n<b>${challenge.title}</b>\n\nWrap it up, traders!\nThe challenge closes in a few hours.\n\nMake your final trades and secure your position.\n\n⚠️ <b>No trades after the challenge ends will be counted.</b>\n\n<i>Good luck on your final trades!</i> 🍀\n${links}\n\n@${config.mainChannelUsername}`;
    } else {
      text = `<b>🔥 DAY ${dayWords[day]} IS ALMOST OVER</b>\n\nHow was the Day, traders?\n\nReact below:\n🔥 If you crushed it today!\n😎 If it was decent, but there's room for more\n👍 If you had a tough day, but still in the game\n✍️ If you hit your daily drawdown\n\nLet's keep pushing 💪\n\n<b>DON'T FORGET TO KEEP THE RULES!</b>\n${links}\n\n@${config.mainChannelUsername}`;
    }

    const opts = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };
    const bothChannels = day === 5 || day === 10;

    try {
      if (bothChannels) {
        await this.bot.bot.telegram.sendMessage(config.mainChannelId, text, opts);
      }
      await this.bot.bot.telegram.sendMessage(config.challengeChannelId, text, opts);
    } catch (e) {
      console.error(`Error posting evening Day ${day}:`, e);
    }
  }

  // ==================== CHALLENGE END ====================

  private challengeEndPosted: Set<number> = new Set();

  private async checkChallengeEnd(challenge: TradingChallenge, dateStr: string, timeStr: string) {
    if (challenge.status !== 'active') return;
    if (this.challengeEndPosted.has(challenge.id)) return;

    const end = this.toEATStrings(challenge.end_date);
    const hour = parseInt(timeStr.split(':')[0]);
    const minute = parseInt(timeStr.split(':')[1]);

    // 5-minute window around end time
    if (dateStr === end.dateStr) {
      const endHour = parseInt(end.timeStr.split(':')[0]);
      const endMin = parseInt(end.timeStr.split(':')[1]);
      const diff = (hour * 60 + minute) - (endHour * 60 + endMin);

      if (diff >= 0 && diff <= 4) {
        this.challengeEndPosted.add(challenge.id);
        console.log(`🏁 Trading challenge ending: ${challenge.title} (${dateStr} ${timeStr} EAT)`);
        await this.endChallenge(challenge);
        return;
      }
    }

    // Midnight fallback
    const endDate = new Date(end.dateStr);
    endDate.setDate(endDate.getDate() + 1);
    const nextDayStr = `${endDate.getFullYear()}-${(endDate.getMonth() + 1).toString().padStart(2, '0')}-${endDate.getDate().toString().padStart(2, '0')}`;

    if (dateStr === nextDayStr && hour === 0 && minute <= 4) {
      this.challengeEndPosted.add(challenge.id);
      console.log(`🏁 Trading challenge ending (midnight fallback): ${challenge.title}`);
      await this.endChallenge(challenge);
    }
  }

  async endChallenge(challenge: TradingChallenge) {
    // Deadline = 48 hours from now, stored as real UTC
    // toEATStrings will convert it to EAT for comparison
    const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await tradingChallengeService.setSubmissionDeadline(challenge.id, deadline);
    await tradingChallengeService.updateChallengeStatus(challenge.id, 'submission_open');

    const deadlineStr = toEAT(deadline).toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    const botInfo = await this.bot.bot.telegram.getMe();

    let guideLink = '';
    if (config.investorPasswordGuideLink) {
      guideLink = `\n📋 How to get your Investor Password: <a href="${config.investorPasswordGuideLink}">Guide Link</a>\n`;
    }

    const text = `<b>🏁 CHALLENGE IS OVER!</b>\n\n` +
      `<b>${challenge.title}</b> has officially ended!\n\n` +
      `What an exciting race! We hope you all gained valuable experience and sharpened your trading skills throughout this challenge.\n\n` +
      `<i>Thank you to every participant for your dedication and effort!</i> 💪\n\n` +
      `🎯 <b>If you hit the target ($${challenge.target_balance}), submit your details for evaluation!</b>\n\n` +
      `⚠️ <b>ONLY</b> participants who reached the target balance should submit results.\n\n` +
      `➡️ You have <b>48 HOURS</b> to submit your results\n` +
      `➡️ Click the button below to start your submission\n` +
      `➡️ Late submissions will <b>NOT</b> be accepted\n\n` +
      `⏰ <b>Submission deadline:</b> ${deadlineStr}\n` +
      guideLink;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('📋 Submit Results', `https://t.me/${botInfo.username}?start=tc_submit_${challenge.id}`)],
    ]);

    const opts = { parse_mode: 'HTML' as const, ...keyboard, link_preview_options: { is_disabled: true } };

    try {
      await this.bot.bot.telegram.sendMessage(config.mainChannelId, text, opts);
      await this.bot.bot.telegram.sendMessage(config.challengeChannelId, text, opts);
      console.log(`✅ Trading challenge ${challenge.id} ended, submission open until ${deadlineStr}`);
    } catch (e) {
      console.error('Error posting challenge end:', e);
    }
  }

  // ==================== SUBMISSION DEADLINE ====================

  private async checkSubmissionDeadline(challenge: TradingChallenge, dateStr: string, timeStr: string) {
    if (challenge.status !== 'submission_open' || !challenge.submission_deadline) return;

    const dl = this.toEATStrings(challenge.submission_deadline);
    const hour = parseInt(timeStr.split(':')[0]);
    const minute = parseInt(timeStr.split(':')[1]);
    const dlHour = parseInt(dl.timeStr.split(':')[0]);
    const dlMin = parseInt(dl.timeStr.split(':')[1]);
    const diff = (hour * 60 + minute) - (dlHour * 60 + dlMin);

    if (dateStr === dl.dateStr && diff >= 0 && diff <= 4) {
      console.log(`⏰ Submission deadline reached: ${challenge.title}`);
      await tradingChallengeService.updateChallengeStatus(challenge.id, 'reviewing');

      const text = `<b>⏰ SUBMISSION DEADLINE HAS ENDED</b>\n\n` +
        `The 48-hour submission window for <b>${challenge.title}</b> is now closed.\n\n` +
        `<b>No further submissions will be accepted.</b>\n\n` +
        `Our team will now review all submissions and announce the results soon.\n\n` +
        `<i>Thank you for your patience!</i> 🙏\n\n@${config.mainChannelUsername}`;

      const opts = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };

      try {
        await this.bot.bot.telegram.sendMessage(config.mainChannelId, text, opts);
        await this.bot.bot.telegram.sendMessage(config.challengeChannelId, text, opts);
      } catch (e) {
        console.error('Error posting deadline message:', e);
      }

      await this.sendAdminReport(challenge);
    }
  }

  // ==================== ADMIN REPORT ====================

  async sendAdminReport(challenge: TradingChallenge) {
    const counts = await tradingChallengeService.getRegistrationCounts(challenge.id);
    const subCounts = await tradingChallengeService.getSubmissionCount(challenge.id);
    const startStr = toEAT(challenge.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const endStr = toEAT(challenge.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const typeLabel = challenge.type === 'hybrid' ? 'Hybrid (Demo & Real)' : challenge.type === 'demo' ? 'Demo' : 'Real';

    const text = `<b>📊 TRADING CHALLENGE REPORT</b>\n<b>${challenge.title}</b>\n\n` +
      `📅 <b>Period:</b> ${startStr} - ${endStr}\n` +
      `📊 <b>Type:</b> ${typeLabel}\n` +
      `👥 <b>Total Registered:</b> ${counts.total} (Real: ${counts.real} | Demo: ${counts.demo})\n` +
      `📋 <b>Total Submissions:</b> ${subCounts.total} (Real: ${subCounts.real} | Demo: ${subCounts.demo})\n\n` +
      `📎 <i>Downloadable report attached below</i>\n\n` +
      `⏳ Review accounts and select winners using:\n/selectwinners`;

    try {
      await this.bot.bot.telegram.sendMessage(config.adminUserId, text, { parse_mode: 'HTML' });

      const prefix = challenge.title.replace(/\s+/g, '_');
      const submissions = await tradingChallengeService.getSubmissions(challenge.id);
      const header = '#,Username,Email,Account,Server,Password,Balance,Screenshot,Submitted\n';
      const toRow = (s: any, i: number) => `${i + 1},@${s.username || 'unknown'},${s.email},${s.account_number},${s.mt5_server || 'N/A'},${s.investor_password},${s.final_balance},${s.screenshot_link || 'N/A'},${new Date(s.submitted_at).toISOString()}\n`;

      if (challenge.type === 'hybrid') {
        const realSubs = submissions.filter(s => s.account_type === 'real').sort((a, b) => b.final_balance - a.final_balance);
        const demoSubs = submissions.filter(s => s.account_type === 'demo').sort((a, b) => b.final_balance - a.final_balance);

        if (realSubs.length > 0) {
          await this.bot.bot.telegram.sendDocument(config.adminUserId, {
            source: Buffer.from(header + realSubs.map(toRow).join('')),
            filename: `${prefix}_real_submissions.csv`,
          });
        }
        if (demoSubs.length > 0) {
          await this.bot.bot.telegram.sendDocument(config.adminUserId, {
            source: Buffer.from(header + demoSubs.map(toRow).join('')),
            filename: `${prefix}_demo_submissions.csv`,
          });
        }
      } else if (submissions.length > 0) {
        const sorted = submissions.sort((a, b) => b.final_balance - a.final_balance);
        await this.bot.bot.telegram.sendDocument(config.adminUserId, {
          source: Buffer.from(header + sorted.map(toRow).join('')),
          filename: `${prefix}_submissions.csv`,
        });
      }

      console.log(`✅ Admin report sent for ${challenge.title}`);
    } catch (e) {
      console.error('Error sending admin report:', e);
    }
  }

  private async generateCSV(challengeId: number): Promise<string> {
    const submissions = await tradingChallengeService.getSubmissions(challengeId);
    const realSubs = submissions.filter(s => s.account_type === 'real').sort((a, b) => b.final_balance - a.final_balance);
    const demoSubs = submissions.filter(s => s.account_type === 'demo').sort((a, b) => b.final_balance - a.final_balance);

    let csv = '';
    if (realSubs.length > 0) {
      csv += '=== REAL ACCOUNT SUBMISSIONS ===\n';
      csv += '#,Username,Email,Account,Server,Password,Balance,Screenshot,Submitted\n';
      realSubs.forEach((s, i) => {
        csv += `${i + 1},@${s.username || 'unknown'},${s.email},${s.account_number},${s.mt5_server || 'N/A'},${s.investor_password},${s.final_balance},${(s as any).screenshot_link || 'N/A'},${new Date(s.submitted_at).toISOString()}\n`;
      });
      csv += '\n';
    }
    if (demoSubs.length > 0) {
      csv += '=== DEMO ACCOUNT SUBMISSIONS ===\n';
      csv += '#,Username,Email,Account,Server,Password,Balance,Screenshot,Submitted\n';
      demoSubs.forEach((s, i) => {
        csv += `${i + 1},@${s.username || 'unknown'},${s.email},${s.account_number},${s.mt5_server || 'N/A'},${s.investor_password},${s.final_balance},${(s as any).screenshot_link || 'N/A'},${new Date(s.submitted_at).toISOString()}\n`;
      });
    }
    return csv;
  }

  // ==================== AUTO ENGAGEMENT ====================

  private engagementRunning = false;

  private async checkAutoEngagement(challenge: TradingChallenge, dateStr: string, timeStr: string, eatTime: Date) {
    // Only for registration_open challenges
    if (challenge.status !== 'registration_open') return;

    // Only between 8:30 AM and 9:30 PM EAT
    const hour = eatTime.getUTCHours();
    const minute = eatTime.getUTCMinutes();
    const timeMinutes = hour * 60 + minute;
    if (timeMinutes < 510 || timeMinutes > 1290) return; // 8:30=510, 21:30=1290

    // Only check every 10 minutes (at :00 and :30)
    if (minute % 10 !== 0) return;

    // Don't run if already running
    if (this.engagementRunning) return;

    // Check if last 3 days before start
    const start = this.toEATStrings(challenge.start_date);
    const startMs = new Date(start.dateStr).getTime();
    const nowMs = new Date(dateStr).getTime();
    const daysUntilStart = Math.round((startMs - nowMs) / (1000 * 60 * 60 * 24));
    const isLast3Days = daysUntilStart >= 0 && daysUntilStart <= 3;

    const dueUsers = await tradingChallengeService.getDueForEngagement(challenge.id, isLast3Days);
    if (dueUsers.length === 0) return;

    // Run in background — don't block scheduler
    this.engagementRunning = true;
    this.sendEngagementBatch(challenge, dueUsers).finally(() => {
      this.engagementRunning = false;
    });
  }

  private async sendEngagementBatch(challenge: TradingChallenge, users: any[]) {
    const botInfo = await this.bot.bot.telegram.getMe();
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🚀 Register Now', `https://t.me/${botInfo.username}?start=tc_register_${challenge.id}`)],
    ]);

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const message = this.getEngagementMessage(challenge.title, user.failure_type, user.engage_count);

      try {
        await this.bot.bot.telegram.sendMessage(user.telegram_id, message, { parse_mode: 'HTML', ...keyboard });
        await tradingChallengeService.markEngaged(challenge.id, user.telegram_id, true);
        sent++;
      } catch (e) {
        await tradingChallengeService.markEngaged(challenge.id, user.telegram_id, false);
        failed++;
      }

      // 2 second delay between messages
      await new Promise(r => setTimeout(r, 2000));

      // 30 second pause every 20 messages
      if ((i + 1) % 20 === 0 && i < users.length - 1) {
        await new Promise(r => setTimeout(r, 30000));
      }
    }

    console.log(`✅ Auto-engagement: sent ${sent}, failed ${failed} for ${challenge.title}`);
  }

  private getEngagementMessage(title: string, failureType: string, engageCount: number): string {
    const variant = engageCount % 3;
    const contact = '\n\n<i>If you face any problem, contact @birrFXadmin for assistance.</i>';

    if (failureType === 'allocation') {
      if (variant === 0) {
        return `👋 <b>Hello from BirrForex Team!</b>\n\n<b>${title}</b> starting day is approaching fast!\n\nHave you created a new Exness account or changed your partner yet?\n\nIf you have, register now before it's too late!\n\n👉 <b>Tap "Register Now" below to join the challenge.</b>${contact}`;
      } else if (variant === 1) {
        return `⏰ <b>Reminder from BirrForex!</b>\n\nTime is running out to join <b>${title}</b>!\n\nIf you've already changed your partner or created a new account, don't wait — register now!\n\nWe'd love to see you compete 💪${contact}`;
      } else {
        return `🚨 <b>Last chance!</b>\n\n<b>${title}</b> starts very soon!\n\nIf your Exness account is now under BirrForex, this is your final chance to register.\n\nDon't miss out on the prizes! 🏆${contact}`;
      }
    } else if (failureType === 'kyc') {
      if (variant === 0) {
        return `👋 <b>Hello from BirrForex Team!</b>\n\n<b>${title}</b> starting day is approaching fast!\n\nHave you completed your Exness account verification yet?\n\nIf not, verify now — it only takes a few minutes!\n➡️ Log in to Exness → Settings → Verification\n\nOnce verified, register for the challenge:${contact}`;
      } else if (variant === 1) {
        return `⏰ <b>Reminder from BirrForex!</b>\n\nDon't miss <b>${title}</b>!\n\nYour Exness account needs to be verified to participate. Have you completed it?\n\nVerification is quick and easy — do it now and join the challenge!${contact}`;
      } else {
        return `🚨 <b>Last chance!</b>\n\n<b>${title}</b> starts very soon!\n\nIf your account is now verified, register before it's too late!\n\nDon't miss out on the prizes! 🏆${contact}`;
      }
    } else {
      // real_acct
      if (variant === 0) {
        return `👋 <b>Hello from BirrForex Team!</b>\n\n<b>${title}</b> starting day is approaching fast!\n\nHave you created a new MT5 Real Account within your Exness yet?\n\nMake sure it's under the same email you registered with.${contact}`;
      } else if (variant === 1) {
        return `⏰ <b>Reminder from BirrForex!</b>\n\nTime is running out to join <b>${title}</b>!\n\nIf you've created your MT5 Real Account, register now!${contact}`;
      } else {
        return `🚨 <b>Last chance!</b>\n\n<b>${title}</b> starts very soon!\n\nIf your MT5 Real Account is ready, this is your final chance to register.\n\nDon't miss out! 🏆${contact}`;
      }
    }
  }

  // ==================== PARTNER SCREENING (10 PM EAT) ====================

  private screeningRunning = false;
  private screeningResults: any = null;
  private pendingMessages: { telegramId: number; message: string }[] = [];

  private screeningStarted: Set<string> = new Set();

  private async checkPartnerScreening(challenge: TradingChallenge, dateStr: string, timeStr: string) {
    if (challenge.status !== 'active') return;

    const hour = parseInt(timeStr.split(':')[0]);
    const minute = parseInt(timeStr.split(':')[1]);

    // Start screening at 10:00-10:04 PM EAT
    const screenKey = `screen_${challenge.id}_${dateStr}`;
    if (hour === 22 && minute <= 4 && !this.screeningRunning && !this.screeningStarted.has(screenKey)) {
      this.screeningStarted.add(screenKey);
      this.screeningRunning = true;
      this.runPartnerScreening(challenge).finally(() => { this.screeningRunning = false; });
    }

    // Send queued messages between 8:00-8:04 AM
    const msgKey = `screenmsg_${challenge.id}_${dateStr}`;
    if (hour === 8 && minute <= 4 && this.pendingMessages.length > 0 && !this.screeningStarted.has(msgKey)) {
      this.screeningStarted.add(msgKey);
      this.sendPendingMessages(challenge);
    }

    // Send admin report at 9:00-9:04 AM
    if (hour === 9 && minute <= 4 && this.screeningResults) {
      await this.sendScreeningReport(challenge, this.screeningResults);
      this.screeningResults = null;
    }
  }

  private async runPartnerScreening(challenge: TradingChallenge) {
    console.log(`🔍 Partner screening started for ${challenge.title}`);

    const registrations = await tradingChallengeService.getActiveRegistrations(challenge.id);
    const stats = { total_screened: 0, all_good: 0, changing_real: 0, changing_demo: 0, left_real: 0, left_demo: 0, warnings_cleared: 0, missed: 0, uids_backfilled: 0 };
    const changingUsers: any[] = [];
    const leftUsers: any[] = [];
    const clearedUsers: any[] = [];

    for (const reg of registrations) {
      try {
        let shortUid = reg.client_uid;

        // Backfill UID if missing
        if (!shortUid) {
          const alloc = await exnessService.checkAllocation(reg.email);
          if (alloc && alloc.client_uid) {
            shortUid = alloc.client_uid;
            await tradingChallengeService.updateClientUid(reg.id, shortUid);
            stats.uids_backfilled++;
          } else {
            stats.missed++;
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
        }

        // Get full UUID
        const fullUuid = await exnessService.getFullUuid(shortUid);
        if (!fullUuid) {
          // Retry
          await new Promise(r => setTimeout(r, 10000));
          const retry = await exnessService.getFullUuid(shortUid);
          if (!retry) {
            stats.missed++;
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
        }

        const uuid = fullUuid || await exnessService.getFullUuid(shortUid);
        if (!uuid) { stats.missed++; await new Promise(r => setTimeout(r, 3000)); continue; }

        // Get client status
        const clientInfo = await exnessService.getKycStatus(uuid);
        if (!clientInfo) {
          // Retry with backoff
          await new Promise(r => setTimeout(r, 10000));
          const retryInfo = await exnessService.getKycStatus(uuid);
          if (!retryInfo) {
            await new Promise(r => setTimeout(r, 30000));
            const retryInfo2 = await exnessService.getKycStatus(uuid);
            if (!retryInfo2) { stats.missed++; await new Promise(r => setTimeout(r, 3000)); continue; }
          }
        }

        const info = clientInfo || await exnessService.getKycStatus(uuid!);
        if (!info) { stats.missed++; await new Promise(r => setTimeout(r, 3000)); continue; }

        stats.total_screened++;
        const clientStatus = info.client_status;

        if (clientStatus === 'CHANGING') {
          if (!reg.partner_warned_at) {
            // First time — warn
            await tradingChallengeService.setPartnerWarning(reg.id);
            const cat = reg.account_type === 'real' ? 'changing_real' : 'changing_demo';
            (stats as any)[cat]++;
            changingUsers.push(reg);

            this.pendingMessages.push({
              telegramId: reg.telegram_id,
              message: `⚠️ <b>Notice from BirrForex Challenge Team</b>\n\nWe noticed a partner change request on your Exness account.\n\nAs per challenge rules, your Exness account must remain under <b>BirrForex</b> to be eligible for <b>${challenge.title}</b>.\n\nIf you want to continue competing, please <b>cancel your change request</b> in your Exness account.\n\n⚠️ <i>Your registration will be canceled when the partner change is approved.</i>\n\nIf you face any problem, contact <b>@birrFXadmin</b> for assistance.`,
            });
          } else {
            // Already warned
            const cat = reg.account_type === 'real' ? 'changing_real' : 'changing_demo';
            (stats as any)[cat]++;
          }
        } else if (clientStatus === 'LEFT') {
          // Double check allocation
          const alloc = await exnessService.checkAllocation(reg.email);
          if (!alloc || !alloc.affiliation) {
            await tradingChallengeService.markDisqualifiedPartner(reg.id);
            const cat = reg.account_type === 'real' ? 'left_real' : 'left_demo';
            (stats as any)[cat]++;
            leftUsers.push(reg);

            this.pendingMessages.push({
              telegramId: reg.telegram_id,
              message: `❌ <b>Registration Canceled</b>\n\nWe're sorry to inform you that your registration for <b>${challenge.title}</b> has been canceled.\n\nSince your Exness account is no longer under BirrForex, you are no longer eligible to participate in this challenge.\n\n<i>Thank you for your interest, and we hope to see you in future challenges!</i> 🙏\n\nIf you believe this is an error, contact <b>@birrFXadmin</b> for assistance.`,
            });
          } else {
            stats.all_good++;
          }
        } else {
          // ACTIVE or INACTIVE — all good
          if (reg.partner_warned_at) {
            // Was warned but now back to active — clear warning
            await tradingChallengeService.clearPartnerWarning(reg.id);
            stats.warnings_cleared++;
            clearedUsers.push(reg);
          }
          stats.all_good++;
        }

        // 3 second delay between checks
        await new Promise(r => setTimeout(r, 3000));

      } catch (e) {
        console.error(`Screening error for ${reg.email}:`, e);
        stats.missed++;
        // Back off on error
        await new Promise(r => setTimeout(r, 10000));
      }
    }

    // Save results
    const { dateStr: todayStr } = this.getEATTime();
    await tradingChallengeService.saveScreeningResult(challenge.id, todayStr, stats);

    this.screeningResults = { ...stats, changingUsers, leftUsers, clearedUsers };
    console.log(`✅ Partner screening done: ${stats.total_screened} screened, ${stats.changing_real + stats.changing_demo} changing, ${stats.left_real + stats.left_demo} left, ${stats.missed} missed`);
  }

  private async sendPendingMessages(challenge: TradingChallenge) {
    if (this.pendingMessages.length === 0) return;

    const messages = [...this.pendingMessages];
    this.pendingMessages = [];
    let sent = 0;

    for (const msg of messages) {
      try {
        await this.bot.bot.telegram.sendMessage(msg.telegramId, msg.message, { parse_mode: 'HTML' });
        sent++;
      } catch (e) {
        // User blocked bot
      }
      await new Promise(r => setTimeout(r, 2000));
      if (sent % 20 === 0) await new Promise(r => setTimeout(r, 10000));
    }

    console.log(`✅ Screening messages sent: ${sent}/${messages.length}`);
  }

  private async sendScreeningReport(challenge: TradingChallenge, results: any) {
    const { dateStr } = this.getEATTime();
    const yesterday = new Date(dateStr);
    yesterday.setDate(yesterday.getDate() - 1);
    const screeningDate = `${yesterday.getFullYear()}-${(yesterday.getMonth() + 1).toString().padStart(2, '0')}-${yesterday.getDate().toString().padStart(2, '0')}`;

    let text = `<b>🔍 PARTNER SCREENING REPORT</b>\n<b>${challenge.title}</b>\n📅 Screening: ${screeningDate} 10:00 PM\n\n`;
    text += `<b>📊 SCREENING RESULTS:</b>\n`;
    text += `➡️ <b>Total Screened:</b> ${results.total_screened}\n`;
    text += `➡️ <b>All Good:</b> ${results.all_good}\n\n`;

    const totalChanging = results.changing_real + results.changing_demo;
    if (totalChanging > 0) {
      text += `<b>⚠️ PARTNER CHANGING: ${totalChanging}</b>\n`;
      text += `Real Account: ${results.changing_real}\n`;
      results.changingUsers.filter((u: any) => u.account_type === 'real').forEach((u: any, i: number) => {
        text += `   ${i + 1}. @${u.username || 'unknown'} — ${u.email}\n`;
      });
      text += `Demo Account: ${results.changing_demo}\n`;
      results.changingUsers.filter((u: any) => u.account_type === 'demo').forEach((u: any, i: number) => {
        text += `   ${i + 1}. @${u.username || 'unknown'} — ${u.email}\n`;
      });
      text += '\n';
    }

    const totalLeft = results.left_real + results.left_demo;
    if (totalLeft > 0) {
      text += `<b>❌ PARTNER LEFT (Disqualified): ${totalLeft}</b>\n`;
      text += `Real Account: ${results.left_real}\n`;
      results.leftUsers.filter((u: any) => u.account_type === 'real').forEach((u: any, i: number) => {
        text += `   ${i + 1}. @${u.username || 'unknown'} — ${u.email}\n`;
      });
      text += `Demo Account: ${results.left_demo}\n`;
      results.leftUsers.filter((u: any) => u.account_type === 'demo').forEach((u: any, i: number) => {
        text += `   ${i + 1}. @${u.username || 'unknown'} — ${u.email}\n`;
      });
      text += '\n';
    }

    if (results.warnings_cleared > 0) {
      text += `<b>🔄 Warnings Cleared: ${results.warnings_cleared}</b>\n`;
      results.clearedUsers.forEach((u: any) => {
        text += `   @${u.username || 'unknown'} — cancelled change request ✅\n`;
      });
      text += '\n';
    }

    if (results.missed > 0) text += `❌ <b>Missed (API error):</b> ${results.missed}\n`;
    if (results.uids_backfilled > 0) text += `🔑 <b>UIDs Backfilled:</b> ${results.uids_backfilled}\n`;

    if (totalChanging === 0 && totalLeft === 0 && results.warnings_cleared === 0) {
      text += `\n✅ <i>No partner issues detected.</i>`;
    }

    try {
      await this.bot.bot.telegram.sendMessage(config.adminUserId, text, { parse_mode: 'HTML' });
    } catch (e) {
      console.error('Error sending screening report:', e);
    }
  }

  // ==================== DAILY ADMIN SUMMARY (8 AM EAT) ====================

  private adminSummaryPosted: Set<string> = new Set();

  private async checkDailyAdminSummary(challenge: TradingChallenge, dateStr: string, timeStr: string) {
    if (challenge.status !== 'registration_open') return;
    const hour = parseInt(timeStr.split(':')[0]);
    const minute = parseInt(timeStr.split(':')[1]);
    if (hour !== 8 || minute > 4) return;

    const key = `admin_${challenge.id}_${dateStr}`;
    if (this.adminSummaryPosted.has(key)) return;
    this.adminSummaryPosted.add(key);

    const yesterday = new Date(dateStr);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${(yesterday.getMonth() + 1).toString().padStart(2, '0')}-${yesterday.getDate().toString().padStart(2, '0')}`;

    const dailyStats = await tradingChallengeService.getDailyStats(challenge.id, yesterdayStr);
    const totalStats = await tradingChallengeService.getTotalStats(challenge.id);
    const counts = await tradingChallengeService.getRegistrationCounts(challenge.id);
    const startStr = toEAT(challenge.start_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

    let text = `<b>📊 DAILY REGISTRATION SUMMARY</b>\n<b>${challenge.title}</b>\n` +
      `📅 <b>Period:</b> ${yesterdayStr} 8:00 AM → ${dateStr} 8:00 AM\n\n`;

    if (dailyStats) {
      text += `<b>📈 LAST 24 HOURS:</b>\n` +
        `➡️ <b>New Registrations:</b> ${dailyStats.new_registrations}\n` +
        `   ├── Demo: ${dailyStats.demo_registrations}\n` +
        `   └── Real: ${dailyStats.real_registrations}\n` +
        `➡️ <b>Failed Registrations:</b> ${(dailyStats.allocation_failures || 0) + (dailyStats.kyc_failures || 0) + (dailyStats.real_acct_failures || 0)}\n` +
        `   ├── Allocation Failed: ${dailyStats.allocation_failures || 0}\n` +
        `   ├── KYC Failed: ${dailyStats.kyc_failures || 0}\n` +
        `   └── Real Acct Not Allocated: ${dailyStats.real_acct_failures || 0}\n` +
        `➡️ <b>Manual Reviews:</b> ${dailyStats.manual_reviews || 0}\n` +
        `➡️ <b>Account Changes:</b> ${dailyStats.account_changes || 0}\n` +
        `➡️ <b>Category Switches:</b> ${dailyStats.category_switches || 0}\n\n`;
    } else {
      text += `<b>📈 LAST 24 HOURS:</b>\nNo activity\n\n`;
    }

    text += `<b>📊 TOTALS (Since Registration Opened):</b>\n` +
      `➡️ <b>Total Registered:</b> ${counts.total}\n` +
      `   ├── Demo: ${counts.demo}\n` +
      `   └── Real: ${counts.real}\n` +
      `➡️ <b>Total Failed Attempts:</b> ${parseInt(totalStats?.total_allocation_failures || '0') + parseInt(totalStats?.total_kyc_failures || '0') + parseInt(totalStats?.total_real_acct_failures || '0')}\n` +
      `➡️ <b>Pending Manual Reviews:</b> ${totalStats?.total_manual_reviews || 0}\n\n` +
      `⏰ <b>Challenge starts:</b> ${startStr}`;

    try {
      await this.bot.bot.telegram.sendMessage(config.adminUserId, text, { parse_mode: 'HTML' });
      console.log(`✅ Daily admin summary sent for ${challenge.title}`);
    } catch (e) {
      console.error('Error sending daily summary:', e);
    }
  }
}
