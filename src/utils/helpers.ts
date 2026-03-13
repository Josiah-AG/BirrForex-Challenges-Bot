import { format, formatDistanceToNow } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';
import { config } from '../config';

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Format time in seconds to readable format (e.g., "2m 34s")
 */
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

/**
 * Format time with milliseconds from completed_at timestamp
 * Shows format like "55.234s" or "1m 23.456s"
 */
export function formatTimeWithMs(completedAt: Date, startedAt: Date): string {
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
 * Get current time in configured timezone
 */
export function getCurrentTime(): Date {
  return utcToZonedTime(new Date(), config.timezone);
}

/**
 * Format date for display
 */
export function formatDate(date: Date): string {
  return format(utcToZonedTime(date, config.timezone), 'MMMM d, yyyy');
}

/**
 * Format date with day of week
 */
export function formatDateWithDay(date: Date): string {
  return format(utcToZonedTime(date, config.timezone), 'EEEE, MMMM d, yyyy');
}

/**
 * Get time until a future date
 */
export function getTimeUntil(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: false });
}

/**
 * Escape markdown special characters
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

/**
 * Get ordinal suffix for numbers (1st, 2nd, 3rd, etc.)
 */
export function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Calculate percentage
 */
export function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100 * 10) / 10;
}

/**
 * Generate deep link for challenge
 */
export function generateChallengeDeepLink(botUsername: string, challengeId: number): string {
  return `https://t.me/${botUsername}?start=challenge_${challengeId}`;
}

/**
 * Parse deep link parameter
 */
export function parseChallengeDeepLink(startParam: string): number | null {
  const match = startParam.match(/^challenge_(\d+)$/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Check if user is admin
 */
export function isAdmin(telegramId: number): boolean {
  return telegramId.toString() === config.adminUserId;
}

/**
 * Format time in 24-hour format for EAT timezone
 * Converts "20:00" to "8:00 PM" or "01:00" to "1:00 AM"
 */
export function formatTimeEAT(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format time from HH:MM to readable AM/PM format
 * e.g., "20:00" -> "8:00 PM", "01:00" -> "1:00 AM"
 */
export function formatChallengeTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
