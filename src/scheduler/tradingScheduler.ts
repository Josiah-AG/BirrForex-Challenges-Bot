import cron from 'node-cron';
import { Bot } from '../bot/bot';
import { tradingChallengeService, TradingChallenge } from '../services/tradingChallengeService';
import { config } from '../config';
import { Markup } from 'telegraf';

export class TradingScheduler {
  private bot: Bot;

  constructor(bot: Bot) {
    this.bot = bot;
  }

  start() {
    // Check every minute for trading challenge events
    cron.schedule('* * * * *', () => this.checkTradingSchedules());
    console.log('✅ Trading scheduler started');
  }

  private getEATTime(): { dateStr: string; timeStr: string; eatTime: Date; dayOfWeek: number } {
    const now = new Date();
    const eatTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const dateStr = `${eatTime.getUTCFullYear()}-${(eatTime.getUTCMonth() + 1).toString().padStart(2, '0')}-${eatTime.getUTCDate().toString().padStart(2, '0')}`;
    const timeStr = `${eatTime.getUTCHours().toString().padStart(2, '0')}:${eatTime.getUTCMinutes().toString().padStart(2, '0')}`;
    return { dateStr, timeStr, eatTime, dayOfWeek: eatTime.getUTCDay() };
  }

  private async checkTradingSchedules() {
    try {
      const { dateStr, timeStr, eatTime, dayOfWeek } = this.getEATTime();
      const challenges = await tradingChallengeService.getAllChallenges();

      for (const challenge of challenges) {
        await this.checkCountdowns(challenge, dateStr, timeStr, eatTime);
        await this.checkChallengeStart(challenge, dateStr, timeStr);
        await this.checkDailyPosts(challenge, dateStr, timeStr, dayOfWeek);
        await this.checkChallengeEnd(challenge, dateStr, timeStr);
        await this.checkSubmissionDeadline(challenge, dateStr, timeStr);
        await this.checkDailyAdminSummary(challenge, dateStr, timeStr);
      }
    } catch (error) {
      console.error('Trading scheduler error:', error);
    }
  }

  // ==================== COUNTDOWN POSTS (3, 2, 1 day before) ====================

  private async checkCountdowns(challenge: TradingChallenge, dateStr: string, timeStr: string, eatTime: Date) {
    if (challenge.status !== 'registration_open') return;
    if (timeStr !== '08:00') return; // Only at 8:00 AM EAT

    const startDate = new Date(challenge.start_date);
    const diffMs = startDate.getTime() - eatTime.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 3 || diffDays === 2 || diffDays === 1) {
      await this.postCountdown(challenge, diffDays);
    }
  }

  async postCountdown(challenge: TradingChallenge, daysLeft: number) {
    const startStr = new Date(challenge.start_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
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

    const text = `${header}\n\n${body}\n\n📅 <b>Start:</b> ${startStr}\n💰 $${challenge.starting_balance} → 🎯 $${challenge.target_balance}\n${links}`;

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

  // ==================== CHALLENGE START ====================

  private async checkChallengeStart(challenge: TradingChallenge, dateStr: string, timeStr: string) {
    if (challenge.status !== 'registration_open') return;

    const startDate = new Date(challenge.start_date);
    const startDateStr = `${startDate.getFullYear()}-${(startDate.getMonth() + 1).toString().padStart(2, '0')}-${startDate.getDate().toString().padStart(2, '0')}`;
    const startTimeStr = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;

    if (dateStr === startDateStr && timeStr === startTimeStr) {
      await tradingChallengeService.updateChallengeStatus(challenge.id, 'active');
      console.log(`✅ Trading challenge ${challenge.id} is now active`);
    }
  }

  // ==================== DAILY POSTS ====================

  private async checkDailyPosts(challenge: TradingChallenge, dateStr: string, timeStr: string, dayOfWeek: number) {
    if (challenge.status !== 'active') return;
    // Skip weekends (0=Sun, 6=Sat)
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    const tradingDay = this.getTradingDay(challenge, dateStr);
    if (tradingDay < 1 || tradingDay > 10) return;

    if (timeStr === '08:00') {
      await this.postMorningMessage(challenge, tradingDay);
    }
    if (timeStr === '20:00') {
      await this.postEveningMessage(challenge, tradingDay);
    }
  }

  private getTradingDay(challenge: TradingChallenge, currentDateStr: string): number {
    const startDate = new Date(challenge.start_date);
    const current = new Date(currentDateStr);
    let tradingDay = 0;
    const d = new Date(startDate);

    while (d <= current) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) tradingDay++;
      if (d.toISOString().split('T')[0] === currentDateStr) break;
      d.setDate(d.getDate() + 1);
    }
    return tradingDay;
  }

  async postMorningMessage(challenge: TradingChallenge, day: number) {
    const morningMessages: { [key: number]: { emoji: string; text: string } } = {
      1: { emoji: '🚀', text: 'is officially <b>LIVE!</b>\n\n💪 Stay focused, follow the rules, and trade smart.\nThis is your journey — make every trade count!\n\n<i>Good luck, traders!</i> 🍀' },
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
    if (day === 1) header = `<b>${msg.emoji} CHALLENGE HAS STARTED!</b>\n\n<b>${challenge.title}</b> ${msg.text}`;
    else if (day === 6) header = `<b>${msg.emoji} WEEK 2 — DAY ${day} OF 10</b>\n\n<b>${challenge.title}</b>${msg.text}`;
    else if (day === 10) header = `<b>${msg.emoji} FINAL DAY!</b>\n\n<b>${challenge.title}</b> — <b>DAY ${day} OF 10</b>${msg.text}`;
    else header = `<b>${msg.emoji} DAY ${day} OF 10</b>\n\n<b>${challenge.title}</b>${msg.text}`;

    let links = '';
    if (challenge.pdf_url) links += `\n📄 Rules: <a href="${challenge.pdf_url}">Download PDF</a>`;
    if (challenge.video_url) links += `\n🎥 Guide: <a href="${challenge.video_url}">Watch Video</a>`;

    const text = `${header}\n${links}\n\n@${config.mainChannelUsername}`;
    const opts = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };

    // Day 1, 6, 10 → BOTH channels. Others → challenge channel only
    const bothChannels = day === 1 || day === 6 || day === 10;

    try {
      if (bothChannels) {
        await this.bot.bot.telegram.sendMessage(config.mainChannelId, text, opts);
      }
      await this.bot.bot.telegram.sendMessage(config.challengeChannelId, text, opts);
      console.log(`✅ Trading morning post Day ${day} for ${challenge.title}`);
    } catch (e) {
      console.error('Error posting morning message:', e);
    }
  }

  async postEveningMessage(challenge: TradingChallenge, day: number) {
    const dayWords = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];

    let text = '';
    let links = '';
    if (challenge.pdf_url) links = `\n📄 Rules: <a href="${challenge.pdf_url}">Download PDF</a>`;

    if (day === 5) {
      // Week 1 end — BOTH channels
      text = `<b>🔥 WEEK 1 IS ALMOST OVER!</b>\n\nHow was the week, traders?\n\nReact below:\n🔥 If you crushed it this week!\n😎 If it was decent, but there's room for more\n👍 If you had a tough week, but still in the game\n✍️ If you hit your drawdown limit\n\nEnjoy the weekend and come back stronger! 💪\n\n<b>DON'T FORGET — NO WEEKEND TRADING!</b>\n${links}\n\n@${config.mainChannelUsername}`;
    } else if (day === 9) {
      text = `<b>🔥 DAY ${dayWords[day]} IS ALMOST OVER</b>\n\nHow was the Day, traders?\n\nReact below:\n🔥 If you crushed it today!\n😎 If it was decent, but there's room for more\n👍 If you had a tough day, but still in the game\n✍️ If you hit your daily drawdown\n\n<b>TOMORROW IS THE FINAL DAY!</b> 🏁\n${links}\n\n@${config.mainChannelUsername}`;
    } else if (day === 10) {
      // Final day — BOTH channels
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
      console.log(`✅ Trading evening post Day ${day} for ${challenge.title}`);
    } catch (e) {
      console.error('Error posting evening message:', e);
    }
  }

  // ==================== CHALLENGE END ====================

  private async checkChallengeEnd(challenge: TradingChallenge, dateStr: string, timeStr: string) {
    if (challenge.status !== 'active') return;

    const endDate = new Date(challenge.end_date);
    const endDateStr = `${endDate.getFullYear()}-${(endDate.getMonth() + 1).toString().padStart(2, '0')}-${endDate.getDate().toString().padStart(2, '0')}`;
    const endTimeStr = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;

    // Check if we've passed the end date (next day at 00:00 for Friday 11:59 PM end)
    const nextDay = new Date(endDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = `${nextDay.getFullYear()}-${(nextDay.getMonth() + 1).toString().padStart(2, '0')}-${nextDay.getDate().toString().padStart(2, '0')}`;

    if ((dateStr === endDateStr && timeStr === endTimeStr) || (dateStr === nextDayStr && timeStr === '00:00')) {
      await this.endChallenge(challenge);
    }
  }

  async endChallenge(challenge: TradingChallenge) {
    // Set submission deadline (48 hours from now)
    const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await tradingChallengeService.setSubmissionDeadline(challenge.id, deadline);
    await tradingChallengeService.updateChallengeStatus(challenge.id, 'submission_open');

    const deadlineStr = deadline.toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
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
      console.log(`✅ Trading challenge ${challenge.id} ended, submission open`);
    } catch (e) {
      console.error('Error posting challenge end:', e);
    }
  }

  // ==================== SUBMISSION DEADLINE ====================

  private async checkSubmissionDeadline(challenge: TradingChallenge, dateStr: string, timeStr: string) {
    if (challenge.status !== 'submission_open' || !challenge.submission_deadline) return;

    const deadline = new Date(challenge.submission_deadline);
    const deadlineDateStr = `${deadline.getFullYear()}-${(deadline.getMonth() + 1).toString().padStart(2, '0')}-${deadline.getDate().toString().padStart(2, '0')}`;
    const deadlineTimeStr = `${deadline.getHours().toString().padStart(2, '0')}:${deadline.getMinutes().toString().padStart(2, '0')}`;

    if (dateStr === deadlineDateStr && timeStr === deadlineTimeStr) {
      await tradingChallengeService.updateChallengeStatus(challenge.id, 'reviewing');

      // Post deadline closed message
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

      // Send admin report
      await this.sendAdminReport(challenge);
    }
  }

  // ==================== ADMIN REPORT ====================

  async sendAdminReport(challenge: TradingChallenge) {
    const counts = await tradingChallengeService.getRegistrationCounts(challenge.id);
    const subCounts = await tradingChallengeService.getSubmissionCount(challenge.id);
    const startStr = new Date(challenge.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const endStr = new Date(challenge.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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

      // Generate and send CSV
      const csv = await this.generateCSV(challenge.id);
      if (csv) {
        await this.bot.bot.telegram.sendDocument(config.adminUserId, {
          source: Buffer.from(csv),
          filename: `${challenge.title.replace(/\s+/g, '_')}_report.csv`,
        });
      }

      console.log(`✅ Admin report sent for ${challenge.title}`);
    } catch (e) {
      console.error('Error sending admin report:', e);
    }
  }

  private async generateCSV(challengeId: number): Promise<string> {
    const submissions = await tradingChallengeService.getSubmissions(challengeId);

    let csv = 'Position,Username,Email,Type,Account Number,MT5 Server,Investor Password,Final Balance,Submitted At\n';

    submissions.forEach((s, i) => {
      csv += `${i + 1},@${s.username || 'unknown'},${s.email},${s.account_type},${s.account_number},${s.mt5_server || 'N/A'},${s.investor_password},${s.final_balance},${new Date(s.submitted_at).toISOString()}\n`;
    });

    return csv;
  }

  // ==================== DAILY ADMIN SUMMARY (8 AM EAT) ====================

  private async checkDailyAdminSummary(challenge: TradingChallenge, dateStr: string, timeStr: string) {
    if (challenge.status !== 'registration_open') return;
    if (timeStr !== '08:00') return;

    // Get yesterday's date
    const yesterday = new Date(dateStr);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${(yesterday.getMonth() + 1).toString().padStart(2, '0')}-${yesterday.getDate().toString().padStart(2, '0')}`;

    const dailyStats = await tradingChallengeService.getDailyStats(challenge.id, yesterdayStr);
    const totalStats = await tradingChallengeService.getTotalStats(challenge.id);
    const counts = await tradingChallengeService.getRegistrationCounts(challenge.id);

    const startStr = new Date(challenge.start_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

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
    } catch (e) {
      console.error('Error sending daily summary:', e);
    }
  }
}
