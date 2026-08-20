/**
 * Timezone utilities for per-challenge timezone support.
 * Uses native Intl.DateTimeFormat — no external dependencies.
 */

export interface LocalTime {
  year: number;
  month: number;   // 1-12
  day: number;     // 1-31
  hour: number;    // 0-23
  minute: number;  // 0-59
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  dateStr: string; // "YYYY-MM-DD"
  timeStr: string; // "HH:MM"
}

/**
 * Convert a UTC Date to local time components in the given IANA timezone.
 * Example: getLocalTime(new Date(), 'America/New_York')
 */
export function getLocalTime(utcDate: Date, timezone: string): LocalTime {
  const tz = timezone || 'Africa/Nairobi';

  // Use Intl to get parts in the target timezone
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(utcDate);

  const get = (type: string) => parts.find(p => p.type === type)?.value || '';

  const year = parseInt(get('year'));
  const month = parseInt(get('month'));
  const day = parseInt(get('day'));
  let hour = parseInt(get('hour'));
  if (hour === 24) hour = 0; // Intl may return 24 for midnight
  const minute = parseInt(get('minute'));

  // Get day of week (0=Sun)
  const weekdayStr = get('weekday'); // "Sun", "Mon", etc.
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayOfWeek = weekdays.indexOf(weekdayStr);

  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return { year, month, day, hour, minute, dayOfWeek, dateStr, timeStr };
}

/**
 * Check if a given UTC date falls on a weekend (Saturday or Sunday) in the given timezone.
 */
export function isWeekendInTimezone(utcDate: Date, timezone: string): boolean {
  const { dayOfWeek } = getLocalTime(utcDate, timezone);
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/**
 * Get current time in a timezone as HH:MM string (for pull schedule matching).
 */
export function getCurrentHHMM(timezone: string): string {
  return getLocalTime(new Date(), timezone).timeStr;
}

/**
 * Format a UTC date for user-facing display in the challenge timezone.
 * Returns e.g. "Jan 5, 2026, 10:30 AM"
 */
export function formatInTimezone(utcDate: Date | string, timezone: string): string {
  const d = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  const tz = timezone || 'Africa/Nairobi';
  return d.toLocaleString('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format just the time portion (HH:MM) in the challenge timezone.
 */
export function formatTimeInTimezone(utcDate: Date | string, timezone: string): string {
  const d = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  const tz = timezone || 'Africa/Nairobi';
  return d.toLocaleString('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Get the short timezone abbreviation for display (e.g. "EAT", "EST", "PST").
 * Falls back to UTC offset if abbreviation not available.
 */
export function getTimezoneAbbr(timezone: string): string {
  const tz = timezone || 'Africa/Nairobi';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(new Date());
    return parts.find(p => p.type === 'timeZoneName')?.value || tz;
  } catch {
    return tz;
  }
}
