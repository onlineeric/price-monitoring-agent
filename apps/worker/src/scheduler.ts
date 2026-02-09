/**
 * Digest Scheduler for BullMQ Repeatable Jobs
 *
 * Manages scheduled digest email jobs based on settings stored in the database.
 * Replaces the old Vercel Cron approach with worker-managed BullMQ Repeatable Jobs.
 *
 * Features:
 * - Reads email schedule settings from database on startup
 * - Registers BullMQ repeatable job with cron pattern
 * - Polls database every 5 minutes for schedule changes
 * - Updates repeatable job when settings change
 * - Ensures only one instance manages scheduling (via ENABLE_SCHEDULER flag)
 */

import { Queue } from 'bullmq';
import { db, settings, eq } from '@price-monitor/db';
import { settingsToCronPattern, cronPatternToDescription, type EmailScheduleSettings } from './utils/cronConverter.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const REPEATABLE_JOB_NAME = 'send-digest-scheduled';
const REPEATABLE_JOB_KEY = 'digest-schedule-v1';
const DEFAULT_TIMEZONE = 'UTC';

export class DigestScheduler {
  private queue: Queue;
  private checkInterval: NodeJS.Timeout | null = null;
  private currentSchedule: EmailScheduleSettings | null = null;
  private currentJobKey: string | null = null;
  private timezone: string;

  constructor(queue: Queue, timezone?: string) {
    this.queue = queue;
    this.timezone = timezone?.trim() || DEFAULT_TIMEZONE;
  }

  /**
   * Start the scheduler
   * - Loads current schedule from database
   * - Registers repeatable job
   * - Starts polling for changes
   */
  async start(): Promise<void> {
    console.log('📅 Starting digest scheduler...');

    // Load and register initial schedule
    await this.updateSchedule();

    // Start polling for changes every 5 minutes
    this.checkInterval = setInterval(() => {
      this.updateSchedule().catch((error) => {
        console.error('❌ Error updating schedule during polling:', error);
      });
    }, POLL_INTERVAL_MS);

    console.log('✅ Digest scheduler started successfully');
    console.log(`🔄 Polling for schedule changes every ${POLL_INTERVAL_MS / 1000 / 60} minutes`);
  }

  /**
   * Stop the scheduler
   * - Clears polling interval
   * - Removes repeatable job
   */
  async stop(): Promise<void> {
    console.log('⏹️  Stopping digest scheduler...');

    // Clear polling interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Remove repeatable jobs managed by this scheduler
    try {
      const removedCount = await this.removeAllDigestRepeatableJobs();
      if (removedCount > 0) {
        console.log(`✅ Removed ${removedCount} repeatable digest job(s)`);
      }
    } catch (error) {
      console.error('❌ Error removing repeatable jobs:', error);
    }

    this.currentSchedule = null;
    this.currentJobKey = null;

    console.log('✅ Digest scheduler stopped');
  }

  /**
   * Update schedule based on current database settings
   * - Fetches settings from database
   * - Compares with cached settings
   * - If changed, removes old job and registers new one
   */
  private async updateSchedule(): Promise<void> {
    try {
      // Fetch email schedule settings from database
      const scheduleSettings = await this.fetchScheduleSettings();

      if (!scheduleSettings) {
        console.log('⚠️  No email schedule configured in database');
        // Remove any existing scheduled digest jobs
        const removedCount = await this.removeAllDigestRepeatableJobs();
        if (removedCount > 0) {
          console.log(`🗑️  Removed ${removedCount} stale digest schedule(s)`);
        }
        this.currentSchedule = null;
        this.currentJobKey = null;
        return;
      }

      // Check if schedule has changed
      // Explicitly handle undefined vs missing property for dayOfWeek
      const currentDayOfWeek = this.currentSchedule?.dayOfWeek ?? null;
      const newDayOfWeek = scheduleSettings.dayOfWeek ?? null;

      const hasChanged = !this.currentSchedule ||
        this.currentSchedule.frequency !== scheduleSettings.frequency ||
        this.currentSchedule.hour !== scheduleSettings.hour ||
        currentDayOfWeek !== newDayOfWeek;

      if (hasChanged) {
        console.log('📝 Email schedule changed, reconciling repeatable jobs...');
      }

      // Always reconcile repeatable jobs, even when schedule hasn't changed.
      // This self-heals stale duplicate repeat jobs left in Redis.
      const reconciled = await this.ensureSingleRepeatableJob(scheduleSettings);

      // Update cached schedule
      this.currentSchedule = scheduleSettings;

      if (hasChanged || reconciled.removedCount > 0 || reconciled.created) {
        console.log('✅ Schedule reconciled successfully');
      }
    } catch (error) {
      console.error('❌ Error updating schedule:', error);
      throw error;
    }
  }

  /**
   * Fetch email schedule settings from database
   */
  private async fetchScheduleSettings(): Promise<EmailScheduleSettings | null> {
    try {
      // Fetch email_schedule setting from database (stored as JSON)
      const scheduleSetting = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'email_schedule'))
        .limit(1);

      // Check if setting exists
      if (!scheduleSetting[0]) {
        return null;
      }

      // Parse JSON value
      const schedule = JSON.parse(scheduleSetting[0].value) as EmailScheduleSettings;

      // Validate required fields
      if (!schedule.frequency || schedule.hour === undefined) {
        console.error('❌ Invalid email_schedule format:', scheduleSetting[0].value);
        return null;
      }

      return schedule;
    } catch (error) {
      console.error('❌ Error fetching schedule settings:', error);
      return null;
    }
  }

  /**
   * Keep exactly one valid repeatable job for digest scheduling.
   */
  private async ensureSingleRepeatableJob(
    scheduleSettings: EmailScheduleSettings
  ): Promise<{ removedCount: number; created: boolean }> {
    const cronPattern = settingsToCronPattern(scheduleSettings);
    const description = cronPatternToDescription(cronPattern);

    const digestJobs = await this.getDigestRepeatableJobs();
    const matchingJobs = digestJobs.filter(
      (job) => job.pattern === cronPattern && this.normalizeTimezone(job.tz) === this.timezone
    );

    // Keep one matching job if present; remove everything else.
    const jobToKeep = matchingJobs[0] || null;
    const jobsToRemove = digestJobs.filter((job) => !jobToKeep || job.key !== jobToKeep.key);

    let removedCount = 0;
    for (const job of jobsToRemove) {
      try {
        await this.queue.removeRepeatableByKey(job.key);
        removedCount += 1;
      } catch (error) {
        console.error(`❌ Error removing stale repeatable job (${job.key}):`, error);
      }
    }

    if (removedCount > 0) {
      console.log(`🗑️  Removed ${removedCount} stale repeatable digest job(s)`);
    }

    if (jobToKeep) {
      this.currentJobKey = jobToKeep.key;
      return { removedCount, created: false };
    }

    await this.registerRepeatableJob(scheduleSettings, cronPattern, description);
    return { removedCount, created: true };
  }

  /**
   * Register a repeatable job with deterministic key and timezone.
   */
  private async registerRepeatableJob(
    _scheduleSettings: EmailScheduleSettings,
    cronPattern: string,
    description: string
  ): Promise<void> {
    console.log(`📅 Registering repeatable job: ${description}`);
    console.log(`   Cron pattern: ${cronPattern}`);
    console.log(`   Timezone: ${this.timezone}`);

    await this.queue.add(
      REPEATABLE_JOB_NAME,
      {
        type: 'scheduled',
      },
      {
        repeat: {
          pattern: cronPattern,
          key: REPEATABLE_JOB_KEY,
          tz: this.timezone,
        },
        // Remove job data after completion to prevent memory buildup
        removeOnComplete: {
          count: 10, // Keep last 10 completed jobs
        },
        removeOnFail: {
          count: 50, // Keep last 50 failed jobs for debugging
        },
      }
    );

    // Refresh and cache the actual repeat key from Redis.
    const digestJobs = await this.getDigestRepeatableJobs();
    const createdJob = digestJobs.find(
      (job) => job.pattern === cronPattern && this.normalizeTimezone(job.tz) === this.timezone
    );
    this.currentJobKey = createdJob?.key || null;

    console.log(`✅ Repeatable job registered: ${description}`);
  }

  /**
   * Remove all repeatable digest jobs from Redis.
   */
  private async removeAllDigestRepeatableJobs(): Promise<number> {
    const digestJobs = await this.getDigestRepeatableJobs();

    let removedCount = 0;
    for (const job of digestJobs) {
      try {
        await this.queue.removeRepeatableByKey(job.key);
        removedCount += 1;
      } catch (error) {
        console.error(`❌ Error removing repeatable job (${job.key}):`, error);
      }
    }

    return removedCount;
  }

  private async getDigestRepeatableJobs() {
    const repeatableJobs = await this.queue.getRepeatableJobs();
    return repeatableJobs.filter((job) => job.name === REPEATABLE_JOB_NAME);
  }

  private normalizeTimezone(timezone: string | null | undefined): string {
    return timezone?.trim() || DEFAULT_TIMEZONE;
  }
}
