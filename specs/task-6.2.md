# Technical Spec: Phase 6.2 - Manual Digest Trigger & Job Flow

**Phase:** 6.2
**Goal:** Implement manual "Check All & Send Email" functionality using BullMQ Flow to orchestrate price check jobs and send digest email after completion.
**Context:** Users need a button on the dashboard to trigger an immediate price check for all products and receive a digest email. This requires implementing a parent-child job pattern where the parent waits for all child price check jobs to complete before calculating trends and sending the email.

---

## Prerequisites

* **Task 6.1:** Trend calculation service complete.
* **Task 5.3:** Settings UI complete.
* **Task 4.2:** Email service complete.

---

## Architecture Context

### Job Flow Pattern

**BullMQ Flow (Parent-Child Jobs):**
```
User clicks button → API enqueues "digest" parent job
                   ↓
         Worker receives parent job
                   ↓
    Creates child jobs (one per product)
                   ↓
         Waits for all children to complete
                   ↓
      All children done → Parent callback triggers
                   ↓
         Calculate trends from database
                   ↓
            Generate & send digest email
```

**Key Concepts:**
- **Parent Job:** Orchestrates the flow, waits for children
- **Child Jobs:** Individual price check jobs (existing `priceCheck` job)
- **Completion Callback:** Runs when all children succeed/fail
- **Flow API:** BullMQ feature for parent-child relationships

---

## Step 1: Install Dependencies (Manual Step)

**User Action:**

BullMQ Flow is included in the `bullmq` package, no additional installation needed. Verify:

```bash
cd apps/worker
# Check that bullmq is already installed
pnpm list bullmq
```

---

## Step 2: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate the following files to implement manual digest trigger with job flow.

### File 2.1: `apps/worker/src/jobs/sendDigest.ts`

**Goal:** Create the parent job processor that orchestrates digest email flow.

**Requirements:**

* **Imports:**
  ```typescript
  import { Job, FlowProducer } from 'bullmq';
  import { db, products } from '@price-monitor/db';
  import { eq } from 'drizzle-orm';
  import { redisConnection } from '../config.js';
  import { calculateTrendsForAllProducts } from '../services/trendCalculator.js';
  import { sendDigestEmail } from '../services/emailService.js';
  ```

* **Flow Producer (Singleton):**
  ```typescript
  let flowProducer: FlowProducer | null = null;

  function getFlowProducer(): FlowProducer {
    if (!flowProducer) {
      flowProducer = new FlowProducer({
        connection: redisConnection,
      });
    }
    return flowProducer;
  }
  ```

* **Job Handler:**
  ```typescript
  export async function sendDigestJob(job: Job) {
    console.log(`[${job.id}] Starting digest flow...`);

    try {
      // Get all active products
      const allProducts = await db
        .select()
        .from(products)
        .where(eq(products.active, true));

      console.log(`[${job.id}] Found ${allProducts.length} active products`);

      if (allProducts.length === 0) {
        console.log(`[${job.id}] No products to check, skipping`);
        return { success: true, message: 'No products to check' };
      }

      // Create child jobs for each product (price checks)
      const flow = getFlowProducer();

      const childJobs = allProducts.map((product) => ({
        name: 'check-price',
        data: { url: product.url },
        queueName: 'price-monitor-queue',
      }));

      // Create flow with parent-child relationship
      await flow.add({
        name: 'send-digest-flow',
        queueName: 'price-monitor-queue',
        data: { triggerType: 'manual' },
        children: childJobs,
      });

      console.log(`[${job.id}] Created flow with ${childJobs.length} child jobs`);

      // Note: The actual email sending happens in the completion callback
      // This job just sets up the flow
      return {
        success: true,
        message: `Enqueued ${childJobs.length} price check jobs`,
      };
    } catch (error) {
      console.error(`[${job.id}] Error setting up digest flow:`, error);
      throw error;
    }
  }
  ```

* **Flow Completion Callback:**
  ```typescript
  export async function onDigestFlowComplete(job: Job, token?: string) {
    console.log(`[Digest Flow] All child jobs completed, sending email...`);

    try {
      // Calculate trends for all products
      const trends = await calculateTrendsForAllProducts();

      // Transform to email format
      const emailData = trends.map((trend) => ({
        name: trend.name,
        url: trend.url,
        imageUrl: trend.imageUrl,
        currentPrice: trend.currentPrice,
        currency: trend.currency,
        lastChecked: trend.lastChecked,
        lastFailed: trend.lastFailed,
        vsLastCheck: trend.vsLastCheck,
        vs7dAvg: trend.vs7dAvg,
        vs30dAvg: trend.vs30dAvg,
        vs90dAvg: trend.vs90dAvg,
        vs180dAvg: trend.vs180dAvg,
      }));

      // Send digest email
      const recipientEmail = process.env.ALERT_EMAIL || 'test@example.com';

      const success = await sendDigestEmail({
        to: recipientEmail,
        products: emailData,
      });

      if (success) {
        console.log('[Digest Flow] Email sent successfully');
      } else {
        console.error('[Digest Flow] Failed to send email');
      }

      return { success, productCount: trends.length };
    } catch (error) {
      console.error('[Digest Flow] Error in completion callback:', error);
      throw error;
    }
  }
  ```

* **Cleanup Function:**
  ```typescript
  export async function closeFlowProducer() {
    if (flowProducer) {
      await flowProducer.close();
      flowProducer = null;
    }
  }
  ```

### File 2.2: Update `apps/worker/src/queue/worker.ts`

**Goal:** Register the send-digest job and flow completion callback.

**Requirements:**

* **Add Import:**
  ```typescript
  import { sendDigestJob, onDigestFlowComplete, closeFlowProducer } from '../jobs/sendDigest.js';
  ```

* **Add Job Handler:**
  ```typescript
  // In the worker processor function, add case for send-digest
  async function processJob(job: Job) {
    switch (job.name) {
      case 'check-price':
        return await priceCheckJob(job);

      case 'send-digest':
        return await sendDigestJob(job);

      case 'send-digest-flow':
        // This is the parent job created by FlowProducer
        // When it completes (all children done), trigger callback
        return await onDigestFlowComplete(job);

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }
  ```

* **Add Cleanup to Shutdown:**
  ```typescript
  // In the shutdown handler
  async function shutdown() {
    console.log('Shutting down worker...');
    await worker.close();
    await closeFlowProducer();
    // ... other cleanup
  }
  ```

### File 2.3: `apps/web/src/app/api/digest/trigger/route.ts`

**Goal:** Create API endpoint to trigger manual digest.

**Note:** Authentication intentionally removed in this phase. Proper authentication will be added app-wide in a future phase.

**Requirements:**

* **Imports:**
  ```typescript
  import { NextRequest, NextResponse } from 'next/server';
  import { Queue } from 'bullmq';
  import { redisConnection } from '@/lib/redis';
  ```

* **Queue Instance (Singleton):**
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

* **POST Handler:**
  ```typescript
  export async function POST(request: NextRequest) {
    try {
      const queue = getQueue();

      // Enqueue send-digest job
      const job = await queue.add('send-digest', {
        triggeredBy: 'manual',
        triggeredAt: new Date().toISOString(),
      });

      console.log('[API] Digest job enqueued:', job.id);

      return NextResponse.json({
        success: true,
        jobId: job.id,
        message: 'Digest email process started',
      });
    } catch (error) {
      console.error('[API] Error triggering digest:', error);
      return NextResponse.json(
        { error: 'Failed to trigger digest' },
        { status: 500 }
      );
    }
  }
  ```

### File 2.4: Update `apps/web/src/lib/redis.ts`

**Goal:** Create shared Redis connection configuration for web app.

**Requirements:**

```typescript
export const redisConnection = {
  host: process.env.REDIS_URL?.replace('redis://', '').split(':')[0] || 'localhost',
  port: parseInt(process.env.REDIS_URL?.split(':')[2] || '6379'),
};
```

Or if using Upstash (with authentication):

```typescript
import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});
```

### File 2.5: `apps/web/src/components/TriggerDigestButton.tsx`

**Goal:** Create UI button to trigger manual digest with confirmation dialog and Force AI option (disabled).

**Note:** Authentication removed - will be added app-wide in a future phase.

**Requirements:**

* **"use client" directive**

* **Component Implementation:**
  ```typescript
  'use client';

  import { useState } from 'react';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from '@/components/ui/alert-dialog';
  import { Switch } from '@/components/ui/switch';
  import { Label } from '@/components/ui/label';

  export default function TriggerDigestButton() {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [open, setOpen] = useState(false);
    const [forceAI, setForceAI] = useState(false);

    const handleConfirm = async () => {
      setLoading(true);
      setMessage('');
      setOpen(false);

      try {
        const response = await fetch('/api/digest/trigger', {
          method: 'POST',
        });

        const data = await response.json();

        if (response.ok) {
          setMessage('✓ Digest process started! Email will be sent when all checks complete.');
        } else {
          setMessage(`✗ Error: ${data.error || 'Failed to trigger digest'}`);
        }
      } catch (error) {
        setMessage(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="bg-white dark:bg-gray-800 border rounded-lg p-6 mb-8">
        <h2 className="text-2xl font-bold mb-4">Manual Digest Trigger</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Check all product prices now and send a digest email immediately.
        </p>

        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <button
              disabled={loading}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Processing...' : 'Check All & Send Email'}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Digest Trigger</AlertDialogTitle>
              <AlertDialogDescription>
                This will check all active products and send a digest email. Are you sure you want to continue?
              </AlertDialogDescription>
            </AlertDialogHeader>

            {/* Force AI Option (Disabled) */}
            <div className="flex items-center space-x-2 py-4">
              <Switch
                id="force-ai"
                checked={forceAI}
                onCheckedChange={setForceAI}
                disabled
              />
              <Label htmlFor="force-ai" className="text-sm">
                Force AI Extraction
              </Label>
            </div>
            <p className="text-xs text-gray-500 -mt-2 ml-12">
              (Feature under construction)
            </p>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirm}>
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {message && (
          <div className={`mt-4 text-sm ${message.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
            {message}
          </div>
        )}
      </div>
    );
  }
  ```

### File 2.6: Update `apps/web/src/app/page.tsx`

**Goal:** Add trigger button to dashboard.

**Requirements:**

* **Add import:**
  ```typescript
  import TriggerDigestButton from '@/components/TriggerDigestButton';
  ```

* **Add button before EmailScheduleSettings:**
  ```typescript
  {/* Trigger Digest Button */}
  <TriggerDigestButton />

  {/* Email Schedule Settings */}
  <EmailScheduleSettings />
  ```

---

## Step 3: Verification (Manual Step)

### 3.1: Start Services

```bash
# Terminal 1: Redis
docker-compose up -d

# Terminal 2: Worker
cd apps/worker && pnpm dev

# Terminal 3: Web
cd apps/web && pnpm dev
```

### 3.2: Test Manual Trigger

1. Open `http://localhost:3000`
2. Click "Check All & Send Email" button
3. Confirm the dialog
4. Enter admin credentials
5. Verify success message appears

### 3.3: Monitor Worker Logs

Watch the worker terminal for:
```
[<job-id>] Starting digest flow...
[<job-id>] Found X active products
[<job-id>] Created flow with X child jobs
[<child-job-id>] Processing price check for URL: ...
[<child-job-id>] Price saved to database
[Digest Flow] All child jobs completed, sending email...
[Trend Calculator] Calculating trends for all products...
[Email] Digest sent successfully: <email-id>
```

### 3.4: Verify Email Received

Check your inbox (configured in `ALERT_EMAIL`) for the digest email with all products.

### 3.5: Test API Endpoint Directly

```powershell
$credentials = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:your-password"))

Invoke-WebRequest -Uri "http://localhost:3000/api/digest/trigger" `
  -Method POST `
  -Headers @{ Authorization = "Basic $credentials" }
```

---

## File Structure After Completion

```
apps/worker/src/
├── jobs/
│   ├── priceCheck.ts
│   └── sendDigest.ts          # NEW: Digest job with flow
└── queue/
    └── worker.ts              # UPDATED: Added send-digest handler

apps/web/src/
├── app/
│   ├── api/
│   │   └── digest/
│   │       └── trigger/
│   │           └── route.ts   # NEW: Trigger endpoint
│   └── page.tsx               # UPDATED: Added trigger button
├── components/
│   └── TriggerDigestButton.tsx # NEW: Trigger button UI
└── lib/
    └── redis.ts               # NEW: Redis connection config
```

---

## Troubleshooting

### Issue: Flow not creating child jobs

**Cause:** FlowProducer not configured correctly or wrong queue name.

**Solution:** Verify queue name matches ('price-monitor-queue'). Check Redis connection.

### Issue: Email not sent after jobs complete

**Cause:** Completion callback not registered or not triggered.

**Solution:** Verify `onDigestFlowComplete` is called when parent job completes. Check worker logs for errors.

### Issue: Some products not checked

**Cause:** Child jobs failing or timing out.

**Solution:** Check worker logs for individual job errors. Verify all products have valid URLs.

### Issue: "Missing API Key" for email

**Cause:** `RESEND_API_KEY` not set in worker environment.

**Solution:** Verify `.env` has the key and restart worker.

---

## Completion Criteria

Task 6.2 is complete when:

- [ ] `sendDigest.ts` job handler created with FlowProducer
- [ ] Flow completion callback implemented
- [ ] Worker registers send-digest and send-digest-flow handlers
- [ ] API endpoint `/api/digest/trigger` created
- [ ] TriggerDigestButton component works
- [ ] Button appears on dashboard
- [ ] Clicking button triggers flow
- [ ] All products are checked (child jobs execute)
- [ ] Email is sent after all checks complete
- [ ] Email contains all products with trends
- [ ] Authentication protects trigger endpoint
- [ ] No errors in worker or API logs

---

## Notes

- BullMQ Flow automatically manages parent-child relationships
- Parent job waits for all children before completing
- Failed child jobs don't block email sending (email shows failed products)
- This is the same flow that will be used for scheduled digests (Phase 6.3)
- Manual trigger is useful for testing and immediate updates
