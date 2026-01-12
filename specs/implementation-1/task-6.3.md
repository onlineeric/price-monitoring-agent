# Technical Spec: Phase 6.3 - Scheduled Automation

**Phase:** 6.3
**Goal:** Implement scheduled automated digest email using Vercel Cron and smart scheduling logic.
**Context:** The system should automatically check all products and send digest emails based on the schedule configured in settings (daily/weekly at specific time). Vercel Cron runs every 30 minutes and triggers the API, which determines if it's time to send the digest based on last sent time and schedule settings.

---

## Prerequisites

* **Task 6.2:** Manual digest trigger and job flow complete.
* **Task 5.3:** Settings UI and API complete.
* **Vercel Account:** For deploying web app with Cron (or can test locally with manual calls).

---

## Architecture Context

### Scheduled Automation Flow

```
Vercel Cron (every 30 min)
         ↓
   GET /api/cron/check-all
         ↓
   Read email_schedule from settings
         ↓
   Calculate: should we send now?
   (based on last_sent_at + schedule)
         ↓
   If YES: Trigger digest flow (same as Phase 6.2)
           Update last_sent_at
   If NO:  Skip and return
```

**Smart Scheduling Logic:**
- Cron hits API every 30 minutes
- API calculates next scheduled send time based on settings
- Compares current time with next send time and last sent time
- Only sends if current time >= next send time AND not sent yet

**Example:**
```
Settings: Daily at 09:00
Last sent: 2026-01-01 09:15
Current time: 2026-01-02 09:25

Next send time = 2026-01-02 09:00
Should send? YES (current >= next AND last sent was yesterday)
```

---

## Step 1: Configure Vercel Cron (Manual Step)

**User Action:**

### Option A: Using `vercel.json`

Create `vercel.json` in the repository root:

```json
{
  "crons": [
    {
      "path": "/api/cron/check-all",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

This runs every 30 minutes: `*/30 * * * *`

### Option B: Using Vercel Dashboard

1. Go to your project in Vercel Dashboard
2. Navigate to Settings → Cron Jobs
3. Add new cron:
   - Path: `/api/cron/check-all`
   - Schedule: `*/30 * * * *`

**Note:** Vercel Cron only works in production. For local testing, manually call the endpoint.

---

## Step 2: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate the following files to implement scheduled automation.

### File 2.1: `apps/web/src/services/scheduler.ts`

**Goal:** Implement smart scheduling logic to determine if digest should be sent.

**Requirements:**

* **Imports:**
  ```typescript
  import { addDays, addWeeks, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
  ```

* **Types:**
  ```typescript
  interface EmailSchedule {
    frequency: 'daily' | 'weekly';
    dayOfWeek?: number; // 1-7 (Monday-Sunday)
    hour: number; // 0-23
  }
  ```

* **Calculate Next Send Time:**
  ```typescript
  export function calculateNextSendTime(
    lastSentAt: Date | null,
    schedule: EmailSchedule
  ): Date {
    // Start from last sent time, or now if never sent
    const baseDate = lastSentAt || new Date();

    // Set time to scheduled hour
    let nextSend = setHours(baseDate, schedule.hour);
    nextSend = setMinutes(nextSend, 0);
    nextSend = setSeconds(nextSend, 0);
    nextSend = setMilliseconds(nextSend, 0);

    if (schedule.frequency === 'daily') {
      // Daily: next occurrence is tomorrow at scheduled hour
      // If we already sent today, move to tomorrow
      if (lastSentAt && lastSentAt >= nextSend) {
        nextSend = addDays(nextSend, 1);
      }
    } else if (schedule.frequency === 'weekly') {
      // Weekly: next occurrence on specified day of week
      const targetDay = schedule.dayOfWeek || 1; // Default Monday
      const currentDay = nextSend.getDay() || 7; // Convert Sunday from 0 to 7

      // Calculate days until target day
      let daysUntilTarget = targetDay - currentDay;
      if (daysUntilTarget < 0) {
        daysUntilTarget += 7; // Next week
      }

      nextSend = addDays(nextSend, daysUntilTarget);

      // If we already sent this week on this day, move to next week
      if (lastSentAt && lastSentAt >= nextSend) {
        nextSend = addWeeks(nextSend, 1);
      }
    }

    return nextSend;
  }
  ```

* **Should Send Now:**
  ```typescript
  export function shouldSendDigestNow(
    currentTime: Date,
    lastSentAt: Date | null,
    schedule: EmailSchedule
  ): boolean {
    const nextSendTime = calculateNextSendTime(lastSentAt, schedule);

    // Send if:
    // 1. Current time is on or after next scheduled time
    // 2. We haven't sent yet at or after the next scheduled time

    if (lastSentAt === null) {
      // Never sent before, check if we're past the scheduled time
      return currentTime >= nextSendTime;
    }

    // Check if last sent time is before next scheduled time
    // AND current time is on or after next scheduled time
    return lastSentAt < nextSendTime && currentTime >= nextSendTime;
  }
  ```

### File 2.2: `apps/web/src/app/api/cron/check-all/route.ts`

**Goal:** Create cron endpoint that checks schedule and triggers digest if needed.

**Requirements:**

* **Imports:**
  ```typescript
  import { NextRequest, NextResponse } from 'next/server';
  import { db, settings } from '@price-monitor/db';
  import { eq } from 'drizzle-orm';
  import { shouldSendDigestNow, calculateNextSendTime } from '@/services/scheduler';
  import { Queue } from 'bullmq';
  import { redisConnection } from '@/lib/redis';
  ```

* **Queue Singleton:**
  ```typescript
  let queue: Queue | null = null;

  function getQueue(): Queue {
    if (!queue) {
      queue = new Queue('price-monitor-queue', {
        connection: redisConnection,
      });
    }
    return queue;
  }
  ```

* **GET Handler:**
  ```typescript
  export async function GET(request: NextRequest) {
    console.log('[Cron] Check-all endpoint called');

    try {
      // Verify this is a cron request (optional security check)
      const authHeader = request.headers.get('authorization');
      if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        console.warn('[Cron] Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Get email schedule settings
      const [scheduleRow] = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'email_schedule'))
        .limit(1);

      const schedule = scheduleRow
        ? JSON.parse(scheduleRow.value)
        : { frequency: 'daily', hour: 9 }; // Default

      // Get last sent timestamp
      const [lastSentRow] = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'last_email_sent_at'))
        .limit(1);

      const lastSentAt = lastSentRow ? new Date(lastSentRow.value) : null;

      // Check if we should send now
      const currentTime = new Date();
      const shouldSend = shouldSendDigestNow(currentTime, lastSentAt, schedule);

      if (!shouldSend) {
        const nextSendTime = calculateNextSendTime(lastSentAt, schedule);
        console.log(`[Cron] Not time to send yet. Next send: ${nextSendTime.toISOString()}`);

        return NextResponse.json({
          skipped: true,
          reason: 'Not scheduled time yet',
          nextSendTime: nextSendTime.toISOString(),
          currentTime: currentTime.toISOString(),
        });
      }

      // Time to send! Trigger digest job
      console.log('[Cron] Time to send digest, triggering job...');

      const queue = getQueue();
      const job = await queue.add('send-digest', {
        triggeredBy: 'cron',
        triggeredAt: currentTime.toISOString(),
      });

      // Update last sent timestamp
      await db
        .insert(settings)
        .values({
          key: 'last_email_sent_at',
          value: currentTime.toISOString(),
          updatedAt: currentTime,
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: currentTime.toISOString(),
            updatedAt: currentTime,
          },
        });

      console.log(`[Cron] Digest job enqueued: ${job.id}`);

      return NextResponse.json({
        success: true,
        jobId: job.id,
        sentAt: currentTime.toISOString(),
        message: 'Digest email process started',
      });
    } catch (error) {
      console.error('[Cron] Error in check-all endpoint:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
  ```

---

## Step 3: Optional Cron Secret (Manual Step)

**User Action:**

For added security, add a cron secret to `.env`:

```env
# Cron Security (optional)
CRON_SECRET="your-random-secret-here"
```

In Vercel Dashboard, add this as an environment variable.

Vercel Cron will automatically include `Authorization: Bearer <CRON_SECRET>` header.

---

## Step 4: Verification (Manual Step)

### 4.1: Local Testing (Manual Trigger)

Since Vercel Cron only works in production, test locally by calling the endpoint manually:

```bash
cd apps/web
pnpm dev
```

**Call the endpoint:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/cron/check-all"
```

### 4.2: Test Scheduling Logic

**Scenario 1: First time (never sent before)**
- Delete `last_email_sent_at` from settings table
- Call endpoint
- Expected: Should send if current time >= scheduled time

**Scenario 2: Already sent today (daily schedule)**
- Set `last_email_sent_at` to earlier today
- Call endpoint
- Expected: Should skip, return "Not scheduled time yet"

**Scenario 3: Sent yesterday (daily schedule)**
- Set `last_email_sent_at` to yesterday
- Call endpoint
- Expected: Should send if current time >= today's scheduled time

**Scenario 4: Weekly schedule**
- Set schedule to weekly, specific day
- Test on that day and other days
- Expected: Only sends on the configured day

### 4.3: Monitor Worker Logs

After triggering, watch worker logs for the same flow as Phase 6.2:
- Digest job received
- Child jobs created
- All jobs complete
- Email sent

### 4.4: Production Testing (Vercel)

**Deploy to Vercel:**
```bash
git add .
git commit -m "[task-6.3] implement scheduled automation"
git push
```

**Monitor in Vercel:**
1. Go to Vercel Dashboard → Your Project
2. Navigate to Logs
3. Filter for `/api/cron/check-all`
4. Wait for cron to run (every 30 minutes)
5. Verify logs show scheduling logic working

---

## File Structure After Completion

```
apps/web/src/
├── app/
│   └── api/
│       └── cron/
│           └── check-all/
│               └── route.ts      # NEW: Cron endpoint
├── services/
│   └── scheduler.ts              # NEW: Scheduling logic
└── lib/
    └── redis.ts

vercel.json                        # NEW: Cron configuration (optional)
```

---

## Troubleshooting

### Issue: Cron not running

**Cause:** Vercel Cron only works in production.

**Solution:** Deploy to Vercel. Cron won't run on `localhost` or preview deployments.

### Issue: Endpoint returns "Unauthorized"

**Cause:** Cron secret mismatch.

**Solution:** Verify `CRON_SECRET` in Vercel environment variables matches `.env`. Or remove the auth check for testing.

### Issue: Sends every 30 minutes

**Cause:** Scheduling logic not working correctly.

**Solution:** Check that `last_email_sent_at` is being updated after each send. Verify `shouldSendDigestNow` logic.

### Issue: Never sends

**Cause:** Schedule time never matches or logic error.

**Solution:** Check current time, schedule settings, and last sent time. Add debug logs to `shouldSendDigestNow`.

---

## Completion Criteria

Task 6.3 is complete when:

- [ ] `scheduler.ts` service created with scheduling logic
- [ ] `/api/cron/check-all` endpoint created
- [ ] `vercel.json` configured with cron (or Vercel Dashboard)
- [ ] Scheduling logic correctly calculates next send time
- [ ] Endpoint only triggers digest when scheduled
- [ ] `last_email_sent_at` updated after sending
- [ ] Local testing works (manual calls)
- [ ] Production cron runs every 30 minutes
- [ ] Digest emails sent according to schedule
- [ ] No duplicate emails sent
- [ ] Logs show scheduling decisions

---

## Monitoring & Observability

**In Production:**
- Monitor Vercel Logs for cron execution
- Check Redis for job queue status
- Monitor email delivery via Resend Dashboard
- Set up alerts for cron failures (optional)

**Key Metrics to Track:**
- Cron execution frequency (should be ~30 min)
- Digest jobs triggered vs skipped
- Email delivery success rate
- Job completion time

---

## Future Enhancements (Out of Scope)

- Multiple schedules (e.g., daily + weekly)
- Time zone support
- Pause/resume scheduling
- Email delivery reports
- Retry logic for failed deliveries
- Custom cron intervals
- Notification channels (Slack, Discord, etc.)

---

## Notes

- Vercel Cron has a maximum frequency of 1 minute (we use 30 min)
- The 30-minute window means emails may arrive up to 30 minutes after scheduled time
- This is acceptable for a digest email use case
- The smart scheduling logic prevents duplicate sends
- All scheduling state is stored in the database (no in-memory state)
- The same digest flow from Phase 6.2 is reused here
