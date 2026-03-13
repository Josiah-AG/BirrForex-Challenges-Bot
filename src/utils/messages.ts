import { Challenge, Participant, Winner } from '../types';
import { formatTime, formatDate, formatDateWithDay, getOrdinal, calculatePercentage } from './helpers';
import { config } from '../config';

export const messages = {
  // Welcome message when user starts bot
  welcome: () => `🎯 Welcome to BirrForex Challenge Bot!

Get ready to test your forex knowledge and win prizes!

💰 Weekly challenges every Wednesday & Sunday
⏰ 10-minute quiz challenges
🏆 Perfect score required to win

Use the menu below to get started!`,

  // Challenge welcome when user joins from channel
  challengeWelcome: (challenge: Challenge, numQuestions: number) => `🎯 Welcome to BirrForex Challenge!

📊 Topic: ${challenge.topic}
⏰ Time Limit: ${config.challengeDurationMinutes} minutes from your first answer
📝 Questions: ${numQuestions} multiple choice

⚡ Remember:
• You can only attempt once
• Perfect score (${numQuestions}/${numQuestions}) required to win
• Fastest correct submission wins

Ready? Let's go! 🚀`,

  // Question display
  question: (questionNum: number, total: number, questionText: string, options: { [key: string]: string }) => 
    `Question ${questionNum}/${total} ⏱️

${questionText}`,

  // Answer recorded
  answerRecorded: () => `✓ Answer recorded`,

  // Completion - Not perfect score
  completionNotPerfect: (score: number, total: number, timeSeconds: number, completionOrder: number) => 
    `<b>📊 CHALLENGE COMPLETED</b>

<b>Your Score:</b> ${score}/${total} ❌
<b>⚡ Response Time:</b> ${formatTime(timeSeconds)}
<b>📍 Completion Order:</b> #${completionOrder}

<i>Unfortunately, a perfect score (${total}/${total}) is required to win.</i>

💪 Study the material and try again next time!

📅 <b>Next Challenge:</b> ${getNextChallengeDay()}

⏳ <i>Your final rank will be available after the challenge ends</i>`,

  // Completion - Perfect score
  completionPerfect: (timeSeconds: number, completionOrder: number, challengeEndTime: string) => 
    `<b>🎉 PERFECT SCORE! 🎉</b>

<b>Your Score:</b> ✅ All Correct!
<b>⚡ Response Time:</b> ${formatTime(timeSeconds)}
<b>📍 Completion Order:</b> #${completionOrder}

⏳ <i>Challenge ends at ${challengeEndTime}</i>
<i>Your final rank will be determined after the challenge closes.</i>

We'll notify you here when results are posted!

Stay tuned... 🏆`,

  // Winner notification
  winnerNotification: (participant: Participant, totalParticipants: number, totalPerfectScores: number, prizeAmount: number) => 
    `🏆 CONGRATULATIONS! 🏆

You WON today's challenge!

💰 Prize: $${prizeAmount}
📊 Final Score: ${participant.score}/${participant.total_questions}
⚡ Your Time: ${formatTime(participant.completion_time_seconds)}
📍 Completion Order: You were the ${getOrdinal(participant.completion_order)} to complete the challenge
🏅 Final Rank: ${getOrdinal(participant.rank!)} out of ${totalParticipants} participants
👥 Total Participants: ${totalParticipants}
🎯 Total Perfect Scores: ${totalPerfectScores}

📸 TO CLAIM YOUR PRIZE:
DM @birrFXadmin with this screenshot

⚠️ Important:
• Prize must be claimed within ${config.prizeClaimDeadlineHours} HOUR
• Sent via Exness internal transfer only
• Must be verified Exness user
• Terms and conditions apply`,

  // Backup list notification
  backupNotification: (participant: Participant, totalParticipants: number, totalPerfectScores: number) => 
    `✨ EXCELLENT PERFORMANCE!

📊 Final Score: ${participant.score}/${participant.total_questions} ✅
⚡ Your Time: ${formatTime(participant.completion_time_seconds)}
📍 Completion Order: You were the ${getOrdinal(participant.completion_order)} to complete the challenge
🏅 Final Rank: ${getOrdinal(participant.rank!)} out of ${totalParticipants} participants
👥 Total Participants: ${totalParticipants}
🎯 Total Perfect Scores: ${totalPerfectScores}

You're on the BACKUP LIST!

If the winner is found ineligible or doesn't claim the prize within ${config.prizeClaimDeadlineHours} hour, you may receive it.

We'll contact you here if that happens.

Great job! 🎉`,

  // Perfect score but beyond backup list
  perfectScoreBeyondBackup: (participant: Participant, totalParticipants: number, totalPerfectScores: number) => 
    `✨ PERFECT SCORE!

📊 Final Score: ${participant.score}/${participant.total_questions} ✅
⚡ Your Time: ${formatTime(participant.completion_time_seconds)}
📍 Completion Order: You were the ${getOrdinal(participant.completion_order)} to complete the challenge
🏅 Final Rank: ${getOrdinal(participant.rank!)} out of ${totalParticipants} participants
👥 Total Participants: ${totalParticipants}
🎯 Total Perfect Scores: ${totalPerfectScores}

You answered everything correctly!

However, you ranked ${getOrdinal(participant.rank!)} among perfect scorers, which is beyond the backup list (top ${config.backupListSize + 1}).

🚀 Next time, try to be even faster!

📅 Next Challenge: ${getNextChallengeDay()}`,

  // Consecutive winner (disqualified)
  consecutiveWinner: (participant: Participant, totalParticipants: number, totalPerfectScores: number, lastWinDay: string) => 
    `🎯 PERFECT SCORE AGAIN!

📊 Your Score: ${participant.score}/${participant.total_questions} ✅
⚡ Your Time: ${formatTime(participant.completion_time_seconds)}
📍 Completion Order: You were the ${getOrdinal(participant.completion_order)} to complete the challenge
🏅 Final Rank: Would be ${getOrdinal(participant.rank!)}, but ineligible
👥 Total Participants: ${totalParticipants}
🎯 Total Perfect Scores: ${totalPerfectScores}

However...

⚠️ Consecutive Win Rule Applied

You won the last challenge (${lastWinDay}). To keep things fair and give everyone a chance, the prize passes to the next eligible participant.

🎉 Amazing performance! You can win again in the next round.

📅 Next Challenge: ${getNextChallengeDay()}`,

  // Late arrival
  challengeClosed: (endTime: string, nextChallengeDate: string) => 
    `⏰ CHALLENGE CLOSED

This challenge ended at ${endTime}.

You can no longer participate in this round.

📅 Next Challenge:
${nextChallengeDate}

💡 Tip: Set a reminder so you don't miss it!`,

  // Duplicate attempt
  alreadyAttempted: (nextChallengeDate: string) => 
    `⚠️ ALREADY ATTEMPTED

You've already participated in this challenge.

One attempt per challenge is allowed.

📅 Next chance: ${nextChallengeDate}`,
};

function getNextChallengeDay(): string {
  // This will be implemented with actual logic
  return 'Sunday, 2:00 PM';
}
