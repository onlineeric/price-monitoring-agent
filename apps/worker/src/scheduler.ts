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

export class DigestScheduler {
  private queue: Queue;
  private checkInterval: NodeJS.Timeout | null = null;
  private currentSchedule: EmailScheduleSettings | null = null;
  private currentJobKey: string | null = null;

  constructor(queue: Queue) {
    this.queue = queue;
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

    // Remove repeatable job
    if (this.currentJobKey) {
      try {
        await this.queue.removeRepeatableByKey(this.currentJobKey);
        console.log('✅ Removed repeatable job');
      } catch (error) {
        console.error('❌ Error removing repeatable job:', error);
      }
    }

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
        // If there was a previous job, remove it
        if (this.currentJobKey) {
          await this.removeCurrentRepeatableJob();
          this.currentSchedule = null;
          this.currentJobKey = null;
        }
        return;
      }

      // Check if schedule has changed
      const hasChanged = !this.currentSchedule ||
        this.currentSchedule.frequency !== scheduleSettings.frequency ||
        this.currentSchedule.hour !== scheduleSettings.hour ||
        this.currentSchedule.dayOfWeek !== scheduleSettings.dayOfWeek;

      if (!hasChanged) {
        // Schedule hasn't changed, no action needed
        return;
      }

      console.log('📝 Email schedule changed, updating repeatable job...');

      // Remove old repeatable job if exists
      if (this.currentJobKey) {
        await this.removeCurrentRepeatableJob();
      }

      // Register new repeatable job
      await this.registerRepeatableJob(scheduleSettings);

      // Update cached schedule
      this.currentSchedule = scheduleSettings;

      console.log('✅ Schedule updated successfully');
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
      // Fetch individual settings from database
      const frequencySetting = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'emailSchedule.frequency'))
        .limit(1);

      const hourSetting = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'emailSchedule.hour'))
        .limit(1);

      const dayOfWeekSetting = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'emailSchedule.dayOfWeek'))
        .limit(1);

      // Check if required settings exist
      if (!frequencySetting[0] || !hourSetting[0]) {
        return null;
      }

      const frequency = frequencySetting[0].value as 'daily' | 'weekly';
      const hour = Number.parseInt(hourSetting[0].value);
      const dayOfWeek = dayOfWeekSetting[0] ? Number.parseInt(dayOfWeekSetting[0].value) : undefined;

      // Conditionally include dayOfWeek to satisfy exactOptionalPropertyTypes
      if (dayOfWeek !== undefined) {
        return { frequency, hour, dayOfWeek };
      }
      return { frequency, hour };
    } catch (error) {
      console.error('❌ Error fetching schedule settings:', error);
      return null;
    }
  }

  /**
   * Register a new repeatable job with BullMQ
   */
  private async registerRepeatableJob(scheduleSettings: EmailScheduleSettings): Promise<void> {
    try {
      // Convert settings to cron pattern
      const cronPattern = settingsToCronPattern(scheduleSettings);
      const description = cronPatternToDescription(cronPattern);

      console.log(`📅 Registering repeatable job: ${description}`);
      console.log(`   Cron pattern: ${cronPattern}`);

      // Add repeatable job to queue
      const job = await this.queue.add(
        REPEATABLE_JOB_NAME,
        {
          type: 'scheduled',
          triggeredAt: new Date().toISOString(),
        },
        {
          repeat: {
            pattern: cronPattern,
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

      // Store job key for later removal
      if (job.opts.repeat) {
        this.currentJobKey = job.opts.repeat.key || null;
      }

      console.log(`✅ Repeatable job registered: ${description}`);
    } catch (error) {
      console.error('❌ Error registering repeatable job:', error);
      throw error;
    }
  }

  /**
   * Remove current repeatable job
   */
  private async removeCurrentRepeatableJob(): Promise<void> {
    if (!this.currentJobKey) {
      return;
    }

    try {
      console.log('🗑️  Removing old repeatable job...');
      await this.queue.removeRepeatableByKey(this.currentJobKey);
      console.log('✅ Old repeatable job removed');
    } catch (error) {
      console.error('❌ Error removing old repeatable job:', error);
      // Don't throw - continue with registration
    }
  }
}
