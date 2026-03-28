import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Telegram Bot
  botToken: process.env.BOT_TOKEN || '',
  adminUserId: process.env.ADMIN_USER_ID || '',
  
  // Channels
  mainChannelId: process.env.MAIN_CHANNEL_ID || '@BirrForex',
  challengeChannelId: process.env.CHALLENGE_CHANNEL_ID || '@BirrForex_Challenges',
  
  // Channel usernames (for links and display) - without @ symbol
  mainChannelUsername: process.env.MAIN_CHANNEL_USERNAME || 'BirrForex',
  challengeChannelUsername: process.env.CHALLENGE_CHANNEL_USERNAME || 'BirrForex_Challenges',
  
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
  
  // Exness Partnership API
  exnessApiBaseUrl: process.env.EXNESS_API_BASE_URL || 'https://my.exnessaffiliates.com',
  exnessPartnerEmail: process.env.EXNESS_PARTNER_EMAIL || '',
  exnessPartnerPassword: process.env.EXNESS_PARTNER_PASSWORD || '',
  
  // Trading Challenge Links
  exnessPartnerSignupLink: process.env.EXNESS_PARTNER_SIGNUP_LINK || 'https://one.exnesstrack.org/boarding/sign-up/a/bqsuza6sq1/?campaign=32092',
  exnessPartnerChangeLink: process.env.EXNESS_PARTNER_CHANGE_LINK || 'https://one.exnessonelink.com/a/bqsuza6sq1/?campaign=32092',
  partnerChangeGuideLink: process.env.PARTNER_CHANGE_GUIDE_LINK || '',
  investorPasswordGuideLink: process.env.INVESTOR_PASSWORD_GUIDE_LINK || '',
  
  // Private channel for storing submission screenshots
  submissionChannelId: process.env.SUBMISSION_CHANNEL_ID || '',
  
  // Toggle equity/balance check for real account registration
  realAccountEquityCheck: process.env.REAL_ACCOUNT_EQUITY_CHECK !== 'false',
  
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
