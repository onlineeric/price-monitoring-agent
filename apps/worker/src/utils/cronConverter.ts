/**
 * Cron Pattern Converter for Email Schedule Settings
 *
 * Converts email schedule settings from the database into cron patterns
 * compatible with BullMQ Repeatable Jobs.
 *
 * Cron format: "minute hour day-of-month month day-of-week"
 *
 * Examples:
 * - Daily at 9am: "0 9 * * *"
 * - Weekly on Monday at 9am: "0 9 * * 1"
 */

export interface EmailScheduleSettings {
  frequency: 'daily' | 'weekly';
  hour: number; // 0-23
  minute?: number; // 0-59, defaults to 0 if not specified
  dayOfWeek?: number; // 1-7 (1 = Monday, 7 = Sunday)
}

/**
 * Convert email schedule settings to cron pattern
 */
export function settingsToCronPattern(settings: EmailScheduleSettings): string {
  const { frequency, hour, minute = 0, dayOfWeek } = settings;

  // Validate hour
  if (hour < 0 || hour > 23) {
    throw new Error(`Invalid hour: ${hour}. Must be between 0 and 23.`);
  }

  // Validate minute
  if (minute < 0 || minute > 59) {
    throw new Error(`Invalid minute: ${minute}. Must be between 0 and 59.`);
  }

  // Cron pattern: minute hour day-of-month month day-of-week

  if (frequency === 'daily') {
    // Daily at specified hour
    // Example: "0 9 * * *" = every day at 9:00 AM
    return `${minute} ${hour} * * *`;
  }

  if (frequency === 'weekly') {
    // Validate dayOfWeek
    if (!dayOfWeek || dayOfWeek < 1 || dayOfWeek > 7) {
      throw new Error(`Invalid dayOfWeek: ${dayOfWeek}. Must be between 1 (Monday) and 7 (Sunday).`);
    }

    // Weekly on specified day at specified hour
    // Example: "0 9 * * 1" = every Monday at 9:00 AM
    return `${minute} ${hour} * * ${dayOfWeek}`;
  }

  throw new Error(`Invalid frequency: ${frequency}`);
}

/**
 * Parse cron pattern back to human-readable description (for logging)
 */
export function cronPatternToDescription(cronPattern: string): string {
  const parts = cronPattern.split(' ');

  if (parts.length !== 5) {
    return cronPattern;
  }

  const [minute, hour, , , dayOfWeek] = parts;

  // Ensure hour and minute are defined
  if (!hour || !minute) {
    return cronPattern;
  }

  const hourStr = hour.padStart(2, '0');
  const minuteStr = minute.padStart(2, '0');

  if (dayOfWeek === '*') {
    return `Daily at ${hourStr}:${minuteStr}`;
  }

  // Ensure dayOfWeek is defined for weekly schedules
  if (!dayOfWeek) {
    return `Weekly at ${hourStr}:${minuteStr}`;
  }

  const dayNames: Record<string, string> = {
    '1': 'Monday',
    '2': 'Tuesday',
    '3': 'Wednesday',
    '4': 'Thursday',
    '5': 'Friday',
    '6': 'Saturday',
    '7': 'Sunday',
  };

  const dayName = dayNames[dayOfWeek] || `day ${dayOfWeek}`;
  return `Weekly on ${dayName} at ${hourStr}:${minuteStr}`;
}
