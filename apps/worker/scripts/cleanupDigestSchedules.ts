import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const DEFAULT_QUEUE_NAME = 'price-monitor-queue';
const DEFAULT_JOB_NAME = 'send-digest-scheduled';

function getArgValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required');
  }

  const queueName = getArgValue('--queue') || process.env.QUEUE_NAME || DEFAULT_QUEUE_NAME;
  const jobName = getArgValue('--job-name') || DEFAULT_JOB_NAME;
  const apply = process.argv.includes('--apply');

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(queueName, { connection });

  try {
    const repeatableJobs = await queue.getRepeatableJobs();
    const digestJobs = repeatableJobs.filter((job) => job.name === jobName);

    console.log(`[cleanup] Redis URL`);
    console.log(`[cleanup] Queue: ${queueName}`);
    console.log(`[cleanup] Target job name: ${jobName}`);
    console.log(`[cleanup] Found ${digestJobs.length} repeatable job(s)`);

    for (const job of digestJobs) {
      console.log(
        `[cleanup] - key=${job.key} pattern=${job.pattern} tz=${job.tz || 'UTC'} next=${job.next ? new Date(job.next).toISOString() : 'n/a'}`
      );
    }

    if (!apply) {
      console.log('[cleanup] Dry run complete. Re-run with --apply to remove these jobs.');
      return;
    }

    let removedCount = 0;
    for (const job of digestJobs) {
      await queue.removeRepeatableByKey(job.key);
      removedCount += 1;
      console.log(`[cleanup] Removed repeatable job key=${job.key}`);
    }

    console.log(`[cleanup] Done. Removed ${removedCount} repeatable job(s).`);
  } finally {
    await queue.close();
    await connection.quit();
  }
}

main().catch((error) => {
  console.error('[cleanup] Failed:', error);
  process.exit(1);
});
