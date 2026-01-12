# Technical Spec: Phase 2.3 - End-to-End Queue Test

**Phase:** 2.3
**Goal:** Verify the complete job flow from API trigger to Worker processing.
**Context:** This is a validation task to confirm that Phase 2.1 (Worker) and Phase 2.2 (Producer) are correctly integrated. No new code is written; we validate existing infrastructure.

---

## Prerequisites

* **Task 2.1:** Worker setup completed (`apps/worker` can connect to Redis).
* **Task 2.2:** Producer setup completed (`apps/web` can enqueue jobs).
* **Docker:** Redis container running (`docker-compose up -d`).
* **Terminals:** Two terminal windows available for running services simultaneously.

---

## Step 1: Start Infrastructure (Manual Step)

**User Action:**

Ensure the local Redis container is running.

```bash
# From project root
docker-compose up -d
```

**Verification:**

```bash
docker ps
```

**Expected Output:**
A container named `price-monitor-redis` should be listed with status `Up`.

---

## Step 2: Start Worker Service (Manual Step)

**User Action:**

Open **Terminal 1** and start the worker service.

```bash
# From project root
cd apps/worker
pnpm dev
```

**Expected Output:**

```text
🚀 Worker Service is running and listening on queue...
```

**Note:** Keep this terminal open. The worker will log job events here.

---

## Step 3: Start Web Service (Manual Step)

**User Action:**

Open **Terminal 2** and start the Next.js development server.

```bash
# From project root
cd apps/web
pnpm dev
```

**Expected Output:**

```text
   ▲ Next.js 16.x.x
   - Local:        http://localhost:3000
   - Environments: .env

 ✓ Starting...
 ✓ Ready in X.Xs
```

**Note:** Keep this terminal open.

---

## Step 4: Trigger a Test Job (Manual Step)

**User Action:**

Open **Terminal 3** (or use a REST client like Postman/Insomnia) and send a POST request to the debug endpoint.

### Option A: PowerShell (Windows)

Using `Invoke-WebRequest`:

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"productId": "e2e-test-001"}'
```

Using `curl.exe` (if installed):

```powershell
curl.exe -X POST http://localhost:3000/api/debug/trigger -H "Content-Type: application/json" -d "{`"productId`": `"e2e-test-001`"}"
```

### Option B: Bash (Linux/macOS/WSL)

```bash
curl -X POST http://localhost:3000/api/debug/trigger \
  -H "Content-Type: application/json" \
  -d '{"productId": "e2e-test-001"}'
```

### Option C: REST Client (Postman/Insomnia)

* **Method:** POST
* **URL:** `http://localhost:3000/api/debug/trigger`
* **Headers:** `Content-Type: application/json`
* **Body (JSON):**
  ```json
  {
    "productId": "e2e-test-001"
  }
  ```

---

## Step 5: Verify API Response (Manual Step)

**Expected Response from API:**

```json
{
  "success": true,
  "jobId": "<generated-job-id>",
  "message": "Job enqueued"
}
```

**Checklist:**
- [ ] `success` is `true`
- [ ] `jobId` is present (not null/undefined)
- [ ] No error messages

---

## Step 6: Verify Worker Processing (Manual Step)

**User Action:**

Switch to **Terminal 1** (Worker) and observe the logs.

**Expected Output:**

```text
[<job-id>] Processing...
[Job Completed] <job-id> - Result: {"status":"success"}
```

**Checklist:**
- [ ] Worker received the job (shows "Processing...")
- [ ] Worker completed the job (shows "Job Completed")
- [ ] Job ID in worker logs matches the `jobId` from API response

---

## Step 7: Test Multiple Jobs (Manual Step - Optional)

**User Action:**

Send multiple requests to verify queue handling.

### PowerShell Example:

```powershell
# Send 3 jobs in sequence
1..3 | ForEach-Object {
  Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
    -Method POST `
    -ContentType "application/json" `
    -Body "{`"productId`": `"batch-test-$_`"}"
  Start-Sleep -Milliseconds 500
}
```

### Bash Example:

```bash
# Send 3 jobs in sequence
for i in 1 2 3; do
  curl -X POST http://localhost:3000/api/debug/trigger \
    -H "Content-Type: application/json" \
    -d "{\"productId\": \"batch-test-$i\"}"
  sleep 0.5
done
```

**Expected Behavior:**
* All jobs should be enqueued successfully.
* Worker should process each job sequentially (due to 1000ms simulated delay).
* All jobs should complete without errors.

---

## Step 8: Test Error Scenarios (Manual Step - Optional)

### 8.1: Worker Offline Test

1. Stop the worker (Ctrl+C in Terminal 1).
2. Send a job via API.
3. **Expected:** API returns success (job is queued in Redis).
4. Restart the worker.
5. **Expected:** Worker picks up and processes the queued job.

### 8.2: Invalid Request Test

Send a request without JSON body:

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" -Method POST
```

**Expected:** API should still work (uses default `productId: 'manual-test'`).

---

## Summary Checklist

| Component | Status | Verification |
|-----------|--------|--------------|
| Redis | Running | `docker ps` shows container |
| Worker | Listening | Logs show startup message |
| Web API | Responding | Returns `{ success: true }` |
| Job Flow | Working | Worker logs job completion |

---

## Troubleshooting

### Issue: API returns connection error

**Cause:** Redis is not running or `REDIS_URL` is incorrect.

**Solution:**
1. Check Docker: `docker ps`
2. Verify `.env` has `REDIS_URL="redis://localhost:6379"`
3. Restart Redis: `docker-compose down && docker-compose up -d`

### Issue: Worker doesn't receive jobs

**Cause:** Queue name mismatch or Redis connection issue.

**Solution:**
1. Verify `QUEUE_NAME` is `'price-monitor-queue'` in both:
   - `apps/worker/src/config.ts`
   - `apps/web/lib/queue.ts`
2. Check worker logs for Redis connection errors.

### Issue: Job stuck in "Processing"

**Cause:** Worker crashed during job execution.

**Solution:**
1. Check worker terminal for errors.
2. Restart worker: `pnpm dev`
3. Stale jobs will be retried automatically by BullMQ.

---

## Completion Criteria

Task 2.3 is complete when:
- [ ] Redis container is running
- [ ] Worker service starts without errors
- [ ] Web service starts without errors
- [ ] API endpoint returns success response with job ID
- [ ] Worker logs show job received and completed
- [ ] Job IDs match between API response and worker logs
