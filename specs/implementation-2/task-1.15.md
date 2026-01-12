# Task 1.15: Implement BullMQ Repeatable Jobs

**Type:** AI Generation
**Performer:** AI
**Phase:** 1 - Local VM + CICD

---

## Objective

Implement BullMQ Repeatable Jobs in the worker to handle scheduled digest emails based on database settings, replacing the old Vercel Cron approach.

---

## Context

**Old Approach (Implementation 1):**
```
Vercel Cron → API endpoint → Check schedule settings → Enqueue jobs
```

**New Approach (Implementation 2):**
```
Worker startup → Read schedule from DB → Register BullMQ Repeatable Job → Auto-execute on schedule
```

**Benefits:**
- No dependency on external cron service
- Worker is always running (no cold starts)
- Schedule changes take effect immediately (with polling)
- Single scheduler instance prevents duplicate jobs

---

## Technical Specifications

### Database Settings Schema

The `settings` table stores configuration as key-value pairs:

```typescript
// Example settings rows:
{
  key: 'emailSchedule.frequency',
  value: 'daily'  // or 'weekly'
}
{
  key: 'emailSchedule.dailyTime',
  value: '09:00'  // HH:mm format
}
{
  key: 'emailSchedule.weeklyDay',
  value: '1'  // 0 = Sunday, 1 = Monday, etc.
}
{
  key: 'emailSchedule.weeklyTime',
  value: '09:00'
}
```

### BullMQ Repeatable Jobs

BullMQ supports repeatable jobs using cron expressions:
```typescript
await queue.add(
  'send-digest',
  {},
  {
    repeat: {
      pattern: '0 9 * * 1',  // Cron expression
      // OR
      every: 86400000,       // Milliseconds
    },
  }
);
```

### Implementation Requirements

1. **Worker Startup:**
   - Read email schedule settings from database
   - Convert settings to cron pattern
   - Register BullMQ repeatable job

2. **Schedule Polling:**
   - Every 5 minutes, check if settings have changed
   - If changed, remove old repeatable job
   - Register new repeatable job with updated schedule

3. **Single Scheduler:**
   - Implement environment variable flag: `ENABLE_SCHEDULER=true`
   - Only ONE worker instance should have scheduler enabled
   - Other workers process jobs but don't register repeatable jobs
   - Document this in comments

4. **Logging:**
   - Log when repeatable job is registered
   - Log the cron pattern used
   - Log when schedule is updated
   - Log when repeatable job is removed

---

## Implementation Details

### File Locations

**Primary Implementation:**
- `apps/worker/src/scheduler.ts` (new file) - Scheduler logic
- `apps/worker/src/index.ts` - Initialize scheduler on startup

**Utility Functions:**
- `apps/worker/src/utils/cronConverter.ts` (new file) - Convert settings to cron pattern

### Scheduler Class Structure

```typescript
// apps/worker/src/scheduler.ts

export class DigestScheduler {
  private queue: Queue;
  private currentJobId: string | null = null;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(queue: Queue) {
    this.queue = queue;
  }

  async start(): Promise<void> {
    // Read settings from DB
    // Register repeatable job
    // Start polling for changes
  }

  async stop(): Promise<void> {
    // Clear interval
    // Remove repeatable job
  }

  private async updateSchedule(): Promise<void> {
    // Read current settings
    // Compare with cached settings
    // If changed: remove old job, add new job
  }

  private async registerRepeatableJob(cronPattern: string): Promise<void> {
    // Remove existing job if any
    // Add new repeatable job with cron pattern
    // Save job ID for later removal
  }
}
```

### Cron Pattern Conversion

```typescript
// apps/worker/src/utils/cronConverter.ts

export function settingsToCronPattern(
  frequency: 'daily' | 'weekly',
  dailyTime?: string,    // "09:00"
  weeklyDay?: number,    // 0-6
  weeklyTime?: string    // "09:00"
): string {
  // Convert to cron pattern
  // Daily: "0 9 * * *" (9am every day)
  // Weekly: "0 9 * * 1" (9am every Monday)
}
```

### Worker Integration

```typescript
// apps/worker/src/index.ts

const ENABLE_SCHEDULER = process.env.ENABLE_SCHEDULER === 'true';

if (ENABLE_SCHEDULER) {
  const scheduler = new DigestScheduler(digestQueue);
  await scheduler.start();
  console.log('📅 Digest scheduler started');
} else {
  console.log('⏭️  Scheduler disabled (ENABLE_SCHEDULER not set)');
}
```

---

## Repeatable Job Details

### Job Name
Use consistent job name: `send-digest-scheduled`

### Job Data
Can be empty `{}` or include metadata:
```typescript
{
  type: 'scheduled',
  triggeredAt: new Date().toISOString()
}
```

### Job Processing
Reuse existing digest job processor:
- Same handler as manual digest trigger
- Check all products
- Calculate trends
- Send digest email

### Removing Old Jobs
Before adding new repeatable job, remove old one:
```typescript
const repeatableJobs = await queue.getRepeatableJobs();
for (const job of repeatableJobs) {
  if (job.name === 'send-digest-scheduled') {
    await queue.removeRepeatableByKey(job.key);
  }
}
```

---

## Settings Polling Implementation

### Polling Interval
Check for changes every 5 minutes:
```typescript
setInterval(() => this.updateSchedule(), 5 * 60 * 1000);
```

### Change Detection
- Cache current settings in memory
- On each poll, read settings from DB
- Compare with cached values
- If different, update repeatable job

### Graceful Shutdown
Handle SIGTERM/SIGINT:
```typescript
process.on('SIGTERM', async () => {
  await scheduler.stop();
  // ... other cleanup
});
```

---

## Deliverables

1. **New Files:**
   - `apps/worker/src/scheduler.ts` - DigestScheduler class
   - `apps/worker/src/utils/cronConverter.ts` - Cron conversion utilities

2. **Modified Files:**
   - `apps/worker/src/index.ts` - Initialize scheduler
   - Add `ENABLE_SCHEDULER` environment variable handling

3. **Documentation:**
   - Comments in code explaining scheduler logic
   - Document `ENABLE_SCHEDULER` flag in CLAUDE.md

---

## Verification Steps

1. **Start worker with scheduler enabled:**
   ```bash
   ENABLE_SCHEDULER=true pnpm --filter @price-monitor/worker dev
   ```

2. **Check logs:**
   - Should see: "📅 Digest scheduler started"
   - Should see: "Registered repeatable job with pattern: ..."
   - Should see the cron pattern logged

3. **Verify repeatable job registered:**
   ```typescript
   // In BullBoard or Redis
   // Check queue.getRepeatableJobs()
   // Should show scheduled digest job
   ```

4. **Test schedule update:**
   - Change email schedule settings in database
   - Wait 5 minutes (or trigger manually in code)
   - Check logs for "Schedule updated" message
   - Verify new cron pattern logged

5. **Test with multiple workers:**
   - Start worker 1 with `ENABLE_SCHEDULER=true`
   - Start worker 2 with `ENABLE_SCHEDULER=false`
   - Only worker 1 should register repeatable job
   - Both should process jobs when they run

---

## Success Criteria

- [ ] `DigestScheduler` class created in `apps/worker/src/scheduler.ts`
- [ ] Cron conversion utility created
- [ ] Worker reads schedule from database on startup
- [ ] BullMQ repeatable job registered with correct cron pattern
- [ ] Polling checks for schedule changes every 5 minutes
- [ ] Schedule updates remove old job and add new job
- [ ] `ENABLE_SCHEDULER` environment variable flag implemented
- [ ] Only one worker instance should enable scheduler
- [ ] Comprehensive logging added
- [ ] Graceful shutdown handles cleanup
- [ ] Worker starts successfully with scheduler enabled
- [ ] Repeatable job visible in queue
- [ ] Schedule changes detected and applied
- [ ] No duplicate digest emails sent

---

## Notes

- The digest job handler already exists from Implementation 1
- This task only adds the **scheduling mechanism**
- Job processing logic remains unchanged
- In production, only ONE worker instance should have `ENABLE_SCHEDULER=true`
- Local VM: Set `ENABLE_SCHEDULER=true` for the worker container
- Consider adding health check endpoint to verify scheduler status
