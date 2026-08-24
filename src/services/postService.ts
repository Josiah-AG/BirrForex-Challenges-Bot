import { Challenge, Participant, Winner } from '../types';
import { config } from '../config';
import { formatTime, formatTimeSmart, formatDateWithDay, getOrdinal, calculatePercentage, formatChallengeTime } from '../utils/helpers';
import { Markup } from 'telegraf';

export class PostService {
  /**
   * Generate main channel announcement post (12:00 PM)
   * moduleMessageLink: link to the forwarded PDF module message in main channel
   */
  generateMainChannelPost(challenge: Challenge, numQuestions: number, moduleMessageLink?: string) {
    const youtubeLink = (challenge as any).youtube_link || challenge.topic_link;
    const pdfLine = moduleMessageLink
      ? `\n👉<a href="${moduleMessageLink}">You can find the PDF Module here</a>👈\n`
      : '';

    const text = `<b>📚 BirrForex Academy | Forex ከዜሮ እስከ ፕሮፌሽናል</b>

🎬 <a href="${youtubeLink}"><b>${challenge.topic}</b></a> is released!

<i>${challenge.short_text}</i>
${pdfLine}
<b>We will have an easy Q&A challenge about this section!</b>

<b>⏰ Challenge Details:</b>
➡️ Posted on <b>@${config.challengeChannelUsername}</b> at <b>${formatChallengeTime(challenge.challenge_time)}</b> sharp
➡️ Contains <b>${numQuestions} questions</b> from this section
➡️ 🏆 Winners: <b>${challenge.num_winners}</b> | 💰 Prize: <b>$${challenge.prize_amount}${challenge.num_winners > 1 ? ' each' : ''}</b> 🎁

👉 <b>Study the Video, Read the Module and get ready!</b>

<b>Good luck, traders!</b> 🍀`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🎬 Watch Video', youtubeLink)],
      [Markup.button.url('🚀 Join Challenge', `https://t.me/${config.challengeChannelUsername}`)]
    ]);

    return { text, keyboard, parse_mode: 'HTML' as const };
  }

  /**
   * Generate challenge channel terms post (12:00 PM)
   */
  generateTermsPost(challenge: Challenge) {
    const text = `<b>📚 BirrForex Academy | Forex ከዜሮ እስከ ፕሮፌሽናል</b>
<b>Q&A Challenge — ${challenge.day.charAt(0).toUpperCase() + challenge.day.slice(1)} Round</b>
<i>Today ${formatChallengeTime(challenge.challenge_time)}</i>

<b>📖 How to Join:</b>

➡️ Watch the video and read the module posted on <b>@${config.mainChannelUsername}</b>
➡️ Challenge questions will come directly from that content
➡️ The challenge will stay open for only <b>${config.challengeDurationMinutes} minutes</b> ⏰
➡️ 🏆 Winners: <b>${challenge.num_winners}</b> | 💰 Prize: <b>$${challenge.prize_amount}${challenge.num_winners > 1 ? ' each' : ''}</b> 🎁

<b>📝 Terms & Conditions</b>

👉 Rewards will be sent <b>ONLY</b> via internal transfer on Exness to users who are verified and registered through the links shared in our channel. 😊

💡 <i>Already joined from our past challenges or social media links? You're all set!</i> ✅

<b>🎯 Note:</b>
If the first winner is not eligible, the reward will go to the next eligible participant (up to the ${getOrdinal(config.backupListSize + 1)} person).

<b>📌 Ready to join the fun? Open your Exness account here 👇</b>
${config.exnessSignupLink}

<b>ARE YOU READY? TAP 🔥 if you are</b>

#BirrForexAcademy #TurnKnowledgeToProfit`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('💰 Open Exness Account', config.exnessSignupLink)]
    ]);

    return { text, keyboard, parse_mode: 'HTML' as const };
  }

  /**
   * Generate 2-hour reminder post
   */
  generate2HourReminder(challenge: Challenge) {
    const youtubeLink = (challenge as any).youtube_link || challenge.topic_link;

    const text = `<b>⏰ 2 HOURS until today's Academy Challenge!</b>

📚 <b>BirrForex Academy | Forex ከዜሮ እስከ ፕሮፌሽናል</b>

<b>📖 How to prepare:</b>

➡️ Watch the video: <a href="${youtubeLink}"><b>${challenge.topic}</b></a>
➡️ Read the module on <b>@${config.mainChannelUsername}</b>
➡️ Challenge goes live at <b>${formatChallengeTime(challenge.challenge_time)}</b> on <b>@${config.challengeChannelUsername}</b>
➡️ Be the first to answer correctly and win! 🎁

<a href="https://t.me/${config.challengeChannelUsername}">📝 <b>Read the Terms & Conditions</b></a>

<b>⚡ Not ready yet? Watch now and get prepared!</b>`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🎬 Watch Video', youtubeLink)],
      [Markup.button.url('🚀 Join Challenge', `https://t.me/${config.challengeChannelUsername}`)]
    ]);

    return { text, keyboard, parse_mode: 'HTML' as const };
  }

  /**
   * Generate 30-minute reminder post
   */
  generate30MinReminder(challenge: Challenge) {
    const youtubeLink = (challenge as any).youtube_link || challenge.topic_link;

    const text = `<b>⏰ 30 MINUTES until the Academy Challenge!</b>

📚 <b>BirrForex Academy | Forex ከዜሮ እስከ ፕሮፌሽናል</b>

➡️ Section: <a href="${youtubeLink}"><b>${challenge.topic}</b></a>
➡️ Join <b>@${config.challengeChannelUsername}</b>
➡️ Challenge goes live at <b>${formatChallengeTime(challenge.challenge_time)}</b> ⏰

<b>⚡ Starting soon — make sure you're ready!</b>`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🎬 Watch Video', youtubeLink)],
      [Markup.button.url('🚀 Join Challenge', `https://t.me/${config.challengeChannelUsername}`)]
    ]);

    return { text, keyboard, parse_mode: 'HTML' as const };
  }

  /**
   * Generate challenge live post
   */
  generateChallengeLivePost(challenge: Challenge, numQuestions: number, botUsername: string) {
    const endTime = this.calculateEndTime(challenge.challenge_time, config.challengeDurationMinutes);

    const text = `<b>📚 BIRRFOREX ACADEMY — Q&A CHALLENGE 📚</b>
<b>${challenge.day.charAt(0).toUpperCase() + challenge.day.slice(1)} Round</b>

<b>💰 Prize:</b> $${challenge.prize_amount}
<b>⏰ Time Limit:</b> ${config.challengeDurationMinutes} Minutes
<b>📝 Questions:</b> ${numQuestions}
<b>🏆 Winners:</b> ${challenge.num_winners}

<b>📊 Section:</b> <i>${challenge.topic}</i>

<b>⚡ RULES:</b>
✓ Perfect score (${numQuestions}/${numQuestions}) required to win
✓ One attempt only
✓ Fastest correct submission wins
✓ No consecutive wins allowed

<b>⏱️ Challenge closes at ${formatChallengeTime(endTime)}</b>`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🚀 JOIN CHALLENGE NOW', `https://t.me/${botUsername}?start=challenge_${challenge.id}`)]
    ]);

    return { text, keyboard, parse_mode: 'HTML' as const };
  }

  /**
   * Generate countdown post text
   */
  generateCountdownPost(minutesLeft: number, secondsLeft: number): string {
    const timeStr = `${minutesLeft}:${secondsLeft.toString().padStart(2, '0')}`;
    return `<b>⏰ COUNTDOWN BEGINS</b>

<b>⏳ ${timeStr} remaining</b>

Are you ready?

Tap 🔥 if you are ready!`;
  }

  /**
   * Generate countdown final post (when it hits 0:00)
   */
  generateCountdownLivePost(): string {
    return `<b>🚀 CHALLENGE IS LIVE NOW!</b>

Go go go! Start the challenge 👇`;
  }

  /**
   * Generate results post
   */
  generateResultsPost(
    challenge: Challenge,
    winners: Winner[],
    backups: Participant[],
    stats: any,
    botUsername: string
  ) {
    const winnersSection = winners.length > 0
      ? winners.map((w, i) => {
          const scorer = backups.find(b => b.telegram_id === w.telegram_id) || backups[i];
          const timeStr = challenge.started_at && scorer ? formatTimeSmart(scorer, backups, challenge.started_at) : (scorer ? formatTime(scorer.completion_time_seconds) : '—');
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅';
          return `${medal} <b>${w.username ? '@' + w.username : (w as any).first_name || 'Participant'}</b> - <b>${scorer?.score || '?'}/${scorer?.total_questions || '?'}</b> in <b>${timeStr}</b>`;
        }).join('\n')
      : 'No winner';

    const backupStart = winners.length;
    const backupList = backups.slice(backupStart, backupStart + config.backupListSize);

    const nextChallenge = (challenge as any).next_challenge_date
      ? `${(challenge as any).next_challenge_date} | Same time`
      : `will be announced on @${config.mainChannelUsername}`;

    const text = `<b>⏰ BirrForex Academy — Q&A Challenge IS CLOSED</b>

<b>📊 CHALLENGE RESULTS 📊</b>
<i>${formatDateWithDay(challenge.date)}</i>

<b>🏆 WINNER${winners.length > 1 ? 'S' : ''}:</b>
${winnersSection}

<b>💰 Prize: $${challenge.prize_amount}${winners.length > 1 ? ' each' : ''}</b>

<b>📋 BACKUP LIST (Perfect Scores):</b>
${backupList.map((p, i) =>
      `${this.getPositionEmoji(backupStart + i + 1)} <b>${p.username ? '@' + p.username : 'Participant'}</b> - <b>${p.score}/${p.total_questions}</b> in <b>${challenge.started_at ? formatTimeSmart(p, backups, challenge.started_at) : formatTime(p.completion_time_seconds)}</b>`
    ).join('\n') || '  No backups'}

<b>📈 STATS:</b>
➡️ <b>Total Participants:</b> ${stats.total_participants}
➡️ <b>Perfect Scores:</b> ${stats.perfect_scores} (${calculatePercentage(stats.perfect_scores, stats.total_participants)}%)
➡️ <b>Average Score:</b> ${parseFloat(stats.avg_score).toFixed(1)}/${stats.total_questions}
➡️ <b>Average Completion Time:</b> ${formatTime(Math.round(stats.avg_time))}

<b>🎉 Congratulations to the winner${winners.length > 1 ? 's' : ''}!</b>

<b>📅 Next Challenge:</b> ${nextChallenge}`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('📖 VIEW CORRECT ANSWERS', `https://t.me/${botUsername}?start=answers_${challenge.id}`)],
      [Markup.button.url('🏅 VIEW YOUR RANK', `https://t.me/${botUsername}?start=rank_${challenge.id}`)]
    ]);

    return { text, keyboard, parse_mode: 'HTML' as const };
  }

  /**
   * Generate cancellation post
   */
  generateCancellationPost(day: string, nextChallengeDate: string) {
    return `<b>⚠️ CHALLENGE CANCELLED</b>

Sorry, today's challenge (<b>${day.charAt(0).toUpperCase() + day.slice(1)}</b>) will not take place due to internal reasons.

The challenge will resume on the next scheduled day.

<b>📅 Next Challenge:</b> ${nextChallengeDate}

<i>Thank you for your understanding!</i> 🙏`;
  }

  /**
   * Generate winner update post
   */
  generateWinnerUpdatePost(oldPosition: number, newWinner: Winner, participant: Participant) {
    const positions = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

    return `<b>📢 WINNER UPDATE</b>

The <b>${positions[oldPosition - 1]}</b> place winner was found ineligible.

The prize has been passed to the <b>${positions[newWinner.position - 1]}</b> backup.

<b>🏆 NEW WINNER:</b>
<b>@${newWinner.username || (newWinner as any).first_name || 'Participant'}</b> - <b>${participant.score}/${participant.total_questions}</b> in <b>${formatTime(participant.completion_time_seconds)}</b>

<b>💰 Prize: $${newWinner.prize_amount}</b>

<b>⏰ Prize must be claimed within ${config.prizeClaimDeadlineHours} hour</b>

<b>Congratulations!</b> 🎉`;
  }

  /**
   * Generate module caption for copyMessage to main channel
   */
  generateModuleCaption(challenge: Challenge): string {
    return `📖 <b>BirrForex Academy | Forex ከዜሮ እስከ ፕሮፌሽናል</b>\n<b>${challenge.topic}</b>`;
  }

  // Helper methods
  private calculateEndTime(startTime: string, durationMinutes: number): string {
    const [hours, minutes] = startTime.split(':').map(Number);
    const endMinutes = minutes + durationMinutes;
    const endHours = hours + Math.floor(endMinutes / 60);
    const finalMinutes = endMinutes % 60;
    return `${endHours}:${finalMinutes.toString().padStart(2, '0')}`;
  }

  private getPositionEmoji(position: number): string {
    const emojis: { [key: number]: string } = {
      2: '🥈',
      3: '🥉',
      4: '4️⃣',
      5: '5️⃣',
      6: '6️⃣',
    };
    return emojis[position] || `${position}️⃣`;
  }
}

export const postService = new PostService();
