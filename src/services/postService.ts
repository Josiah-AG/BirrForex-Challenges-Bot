import { Challenge, Participant, Winner } from '../types';
import { config } from '../config';
import { formatTime, formatDateWithDay, getOrdinal, calculatePercentage, formatChallengeTime } from '../utils/helpers';
import { Markup } from 'telegraf';

export class PostService {
  /**
   * Generate main channel announcement post (10 AM)
   */
  generateMainChannelPost(challenge: Challenge, numQuestions: number) {
const text = `<b>🎯 BirrForex Weekly Challenge - ${challenge.day.charAt(0).toUpperCase() + challenge.day.slice(1)} Round</b>

<b>📚 Topic:</b> <a href="${challenge.topic_link}">${challenge.topic}</a>

<i>${challenge.short_text}</i>

<b>⏰ Challenge Details:</b>
➡️ Posted on <b>@${config.challengeChannelUsername}</b> at <b>${formatChallengeTime(challenge.challenge_time)}</b> sharp
➡️ Contains <b>${numQuestions} questions</b> from the topic
➡️ First correct answer wins <b>${challenge.prize_amount}</b> 🎁

👉 <b>Study the topic and get ready!</b>

<b>Good luck, traders!</b> 🍀`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.url(`📊 ${challenge.topic}`, challenge.topic_link),
        Markup.button.url('🚀 Join Challenge', `https://t.me/${config.challengeChannelUsername}`)
      ]
    ]);

    return { text, keyboard, parse_mode: 'HTML' as const };
  }

  /**
   * Generate challenge channel terms post (10 AM)
   */
  generateTermsPost(challenge: Challenge) {
const text = `<b>🎯 BirrForex Challenges - ${challenge.day.charAt(0).toUpperCase() + challenge.day.slice(1)} Round</b>
<b>Today ${formatChallengeTime(challenge.challenge_time)}</b>

<b>📖 How to Join:</b>

➡️ Check out the content posted on our main channel <b>@${config.mainChannelUsername}</b> and get ready
➡️ Challenge questions will come directly from that content
➡️ The challenge will stay open for only <b>${config.challengeDurationMinutes} minutes</b> ⏰
➡️ Be the first to answer correctly and win a reward! 🎁

<b>📝 Terms & Conditions</b>

👉 Rewards will be sent <b>ONLY</b> via internal transfer on Exness to users who are verified and registered through the links shared in our channel. 😊

💡 <i>Already joined from our past challenges or social media links? You're all set!</i> ✅

<b>🎯 Note:</b>
If the first winner is not eligible, the reward will go to the next eligible participant (up to the ${getOrdinal(config.backupListSize + 1)} person).

<b>📌 Ready to join the fun? Open your Exness account here 👇</b>
${config.exnessSignupLink}

<b>ARE YOU READY? TAP 🔥 if you are</b>

#TurnKnowledgeToProfit`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('💰 Open Exness Account', config.exnessSignupLink)]
    ]);

    return { text, keyboard, parse_mode: 'HTML' as const };
  }

  /**
   * Generate 2-hour reminder post
   */
  generate2HourReminder(challenge: Challenge) {
const text = `<b>⏰ 2 HOURS Remaining for Today's Challenge</b>

<b>📖 How to Join:</b>

➡️ Study the topic content <a href="${challenge.topic_link}"><b>${challenge.topic}</b></a> (Questions will be from it)
➡️ Join 👉 <b>@${config.challengeChannelUsername}</b>
➡️ The challenge will be posted sharp at <b>${formatChallengeTime(challenge.challenge_time)}</b> ⏰
➡️ Be the first to answer correctly and win a reward! 🎁

<a href="https://t.me/${config.challengeChannelUsername}">📝 <b>Read the Terms & Conditions before you start</b></a>

👉 <b>Not ready yet? Check it out now:</b>`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.url(`📊 ${challenge.topic}`, challenge.topic_link),
        Markup.button.url('🚀 Join Challenge', `https://t.me/${config.challengeChannelUsername}`)
      ]
    ]);

    return { text, keyboard, parse_mode: 'HTML' as const };
  }

  /**
   * Generate 30-minute reminder post
   */
  generate30MinReminder(challenge: Challenge) {
const text = `<b>⏰ 30 MIN Remaining for Today's Challenge</b>

<b>📖 How to Join:</b>

➡️ Study the topic content <a href="${challenge.topic_link}"><b>${challenge.topic}</b></a> (Questions will be from it)
➡️ Join 👉 <b>@${config.challengeChannelUsername}</b>
➡️ The challenge will be posted sharp at <b>${formatChallengeTime(challenge.challenge_time)}</b> ⏰
➡️ Be the first to answer correctly and win a reward! 🎁

<a href="https://t.me/${config.challengeChannelUsername}">📝 <b>Read the Terms & Conditions before you start</b></a>

<b>⚡ Get ready! Challenge starts soon!</b>`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.url(`📊 ${challenge.topic}`, challenge.topic_link),
        Markup.button.url('🚀 Join Challenge', `https://t.me/${config.challengeChannelUsername}`)
      ]
    ]);

    return { text, keyboard, parse_mode: 'HTML' as const };
  }

  /**
   * Generate challenge live post
   */
  generateChallengeLivePost(challenge: Challenge, numQuestions: number, botUsername: string) {
    const endTime = this.calculateEndTime(challenge.challenge_time, config.challengeDurationMinutes);

const text = `<b>🎯 BIRRFOREX WEEKLY CHALLENGE 🎯</b>
<b>${challenge.day.charAt(0).toUpperCase() + challenge.day.slice(1)} Round is LIVE NOW!</b>

<b>💰 Prize:</b> $${challenge.prize_amount}
<b>⏰ Time Limit:</b> ${config.challengeDurationMinutes} Minutes
<b>📝 Questions:</b> ${numQuestions}
<b>🏆 Winners:</b> ${challenge.num_winners}

<b>📊 Topic:</b> <i>${challenge.topic}</i>

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
   * Generate results post
   */
  generateResultsPost(
    challenge: Challenge,
    winners: Winner[],
    backups: Participant[],
    stats: any,
    botUsername: string
  ) {
const text = `<b>⏰ BirrForex Weekly Challenge - ${challenge.day.charAt(0).toUpperCase() + challenge.day.slice(1)} Round IS CLOSED</b>

<b>📊 CHALLENGE RESULTS 📊</b>
<i>${formatDateWithDay(challenge.date)}</i>

<b>🏆 WINNER:</b>
${winners[0] ? `<b>@${winners[0].username || 'user'}</b> - <b>${backups[0]?.score}/${backups[0]?.total_questions}</b> in <b>${formatTime(backups[0]?.completion_time_seconds || 0)}</b>` : 'No winner'}

<b>💰 Prize: $${challenge.prize_amount}</b>

<b>📋 BACKUP LIST (Perfect Scores):</b>
${backups.slice(1, config.backupListSize + 1).map((p, i) => 
  `${this.getPositionEmoji(i + 2)} <b>@${p.username || 'user'}</b> - <b>${p.score}/${p.total_questions}</b> in <b>${formatTime(p.completion_time_seconds)}</b>`
).join('\n')}

<b>📈 STATS:</b>
➡️ <b>Total Participants:</b> ${stats.total_participants}
➡️ <b>Perfect Scores:</b> ${stats.perfect_scores} (${calculatePercentage(stats.perfect_scores, stats.total_participants)}%)
➡️ <b>Average Score:</b> ${stats.avg_score?.toFixed(1)}/${backups[0]?.total_questions || 5}
➡️ <b>Average Completion Time:</b> ${formatTime(Math.round(stats.avg_time))}

<b>🎉 Congratulations to the winner!</b>

<b>Next Challenge:</b> ${this.getNextChallengeDay(challenge.day)}`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.url('📖 VIEW CORRECT ANSWERS', `https://t.me/${botUsername}?start=answers_${challenge.id}`),
        Markup.button.url('🏅 VIEW YOUR RANK', `https://t.me/${botUsername}?start=rank_${challenge.id}`)
      ]
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
<b>@${newWinner.username || 'user'}</b> - <b>${participant.score}/${participant.total_questions}</b> in <b>${formatTime(participant.completion_time_seconds)}</b>

<b>💰 Prize: $${newWinner.prize_amount}</b>

<b>⏰ Prize must be claimed within ${config.prizeClaimDeadlineHours} hour</b>

<b>Congratulations!</b> 🎉`;
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

  private getNextChallengeDay(currentDay: string): string {
    return currentDay.toLowerCase() === 'wednesday' ? 'Sunday' : 'Wednesday';
  }
}

export const postService = new PostService();
