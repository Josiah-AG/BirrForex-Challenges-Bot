import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Telegram Bot
  botToken: process.env.BOT_TOKEN || '',
  adminUserId: process.env.ADMIN_USER_ID || '',
  
  // Channels
  mainChannelId: process.env.MAIN_CHANNEL_ID || '@BirrForex',
  challengeChannelId: process.env.CHALLENGE_CHANNEL_ID || '@BirrForex_Challenges',
  
  // Database
  databaseUrl: process.env.DATABASE_URL || '',
  
  // Bot Configuration
  timezone: process.env.TIMEZONE || 'Africa/Addis_Ababa',
  defaultPrizeAmount: parseInt(process.env.DEFAULT_PRIZE_AMOUNT || '20'),
  challengeDurationMinutes: parseInt(process.env.CHALLENGE_DURATION_MINUTES || '10'),
  prizeClaimDeadlineHours: parseInt(process.env.PRIZE_CLAIM_DEADLINE_HOURS || '1'),
  backupListSize: parseInt(process.env.BACKUP_LIST_SIZE || '5'),
  
  // External Links
  exnessSignupLink: process.env.EXNESS_SIGNUP_LINK || '',
  
  // Schedule
  morningPostTime: process.env.MORNING_POST_TIME || '10:00',
  twoHourReminderTime: process.env.TWO_HOUR_REMINDER_TIME || '18:00',
  thirtyMinReminderTime: process.env.THIRTY_MIN_REMINDER_TIME || '19:30',
  challengeTime: process.env.CHALLENGE_TIME || '20:00',
  resultsTime: process.env.RESULTS_TIME || '20:10',
  
  // Challenge Days
  challengeDays: ['wednesday', 'sunday'] as const,
};

// Validation
if (!config.botToken) {
  throw new Error('BOT_TOKEN is required in .env file');
}

if (!config.adminUserId) {
  throw new Error('ADMIN_USER_ID is required in .env file');
}

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required in .env file');
}

export type ChallengeDay = typeof config.challengeDays[number];
