# Task 1.15: End-to-End Testing

**Type:** Manual - Verification
**Performer:** User
**Phase:** 1 - Local Development Simplification
**Dependencies:** Task 1.14 (Changes committed)
**Estimated Time:** 10 minutes

---

## What

Perform comprehensive end-to-end testing of the price monitoring application using the new docker-compose setup to verify all features work correctly with localhost services.

---

## Objective

Validate that Implementation 3 Phase 1 is complete by testing:
- Service connectivity (PostgreSQL, Redis)
- Web application functionality
- Worker job processing
- Background queue operations
- Price checking workflow
- Digest email generation

This ensures the docker-compose setup is production-ready for local development.

---

## How to Do

### Prerequisites Check

Before testing, ensure:

```bash
# 1. Services are running
docker ps
# Should show postgres and redis with (healthy) status

# 2. Database schema is applied
pnpm --filter @price-monitor/db push

# 3. .env file configured
grep -E "DATABASE_URL|REDIS_URL|ANTHROPIC_API_KEY|RESEND_API_KEY" .env
# Should show localhost URLs and your real API keys
```

### Test 1: Service Connectivity

**Objective:** Verify applications can connect to docker-compose services

```bash
# Terminal 1: Start web app
pnpm --filter @price-monitor/web dev
```

**Expected:**
- Server starts on http://localhost:3000
- No database connection errors
- Console shows successful connection

```bash
# Terminal 2: Start worker
pnpm --filter @price-monitor/worker dev
```

**Expected:**
- Worker connects to Redis
- Shows "Queue: price-monitor-queue"
- Shows "Listening for jobs..."
- No connection errors

**Verification:**
- [ ] Web app starts without errors
- [ ] Worker starts without errors
- [ ] No ECONNREFUSED errors
- [ ] Both show successful connections

### Test 2: Database Operations

**Objective:** Verify database read/write operations

1. **Open web application:** http://localhost:3000

2. **Check dashboard loads:**
   - Should see dashboard UI
   - No database errors
   - May show empty state (no products yet)

3. **Add a product:**
   - Click "Add Product" or similar
   - Enter a URL (e.g., `https://www.amazon.com/dp/B0BSHF7WHW`)
   - Submit form

4. **Verify product saved:**
   - Product appears in dashboard
   - Shows product name, image, current price
   - Data persisted to PostgreSQL

**Verification:**
- [ ] Dashboard loads successfully
- [ ] Can add product via UI
- [ ] Product appears in list
- [ ] Data persists across page refresh

### Test 3: Price Check Job

**Objective:** Verify BullMQ queue and worker processing

**Method 1: Via API (if debug endpoint exists):**

```bash
curl -X POST http://localhost:3000/api/debug/trigger \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.amazon.com/dp/B0BSHF7WHW"}'
```

**Method 2: Via UI:**
- Click "Check Price Now" button on a product
- Or trigger check via dashboard UI

**Expected behavior:**

**In worker logs (Terminal 2):**
```
Processing job: check-price
URL: https://www.amazon.com/dp/B0BSHF7WHW
Extraction tier: HTML Fetcher
Price found: $49.99
Saved price record
Job completed
```

**In web UI:**
- Product shows updated timestamp
- New price appears in history
- Price chart updates (if visible)

**Verification:**
- [ ] Job enqueued successfully
- [ ] Worker picks up job
- [ ] Extraction completes (tier 1 or 2)
- [ ] Price saved to database
- [ ] UI reflects new price

### Test 4: Redis Queue Operations

**Objective:** Verify Redis is storing queue data

```bash
# Check Redis keys
docker exec -it price-monitor-redis redis-cli KEYS "*"
```

**Expected output:**
```
1) "bull:price-monitor-queue:id"
2) "bull:price-monitor-queue:meta"
3) "bull:price-monitor-queue:completed"
...
```

**After triggering price check:**

```bash
# Check completed jobs
docker exec -it price-monitor-redis redis-cli LLEN bull:price-monitor-queue:completed
```

**Expected:** Returns number > 0 (jobs completed).

**Verification:**
- [ ] Redis contains queue keys
- [ ] Completed jobs tracked
- [ ] Queue metadata present

### Test 5: Database Persistence

**Objective:** Verify data persists across container restarts

```bash
# 1. Note current products count
docker exec -it price-monitor-postgres psql -U postgres -d priceMonitor -c "SELECT COUNT(*) FROM products;"

# 2. Stop services
pnpm docker:down

# 3. Restart services
pnpm docker:up

# Wait for healthy status
docker ps

# 4. Check data still exists
docker exec -it price-monitor-postgres psql -U postgres -d priceMonitor -c "SELECT COUNT(*) FROM products;"
```

**Expected:** Count is the same (data persisted).

**Verification:**
- [ ] Services restart successfully
- [ ] Product count unchanged
- [ ] Price records intact
- [ ] Settings preserved

### Test 6: Digest Email (Optional)

**Objective:** Verify email sending works (if Resend key configured)

**Prerequisites:**
- RESEND_API_KEY set in .env
- At least one product with price history

**Via UI:**
- Trigger manual digest send (if button exists)

**Via API (if endpoint exists):**
```bash
curl -X POST http://localhost:3000/api/debug/send-digest
```

**Expected:**
- Worker processes send-digest job
- Spawns child check-price jobs for each product
- Calculates trends
- Sends email via Resend
- Email received in inbox

**Verification (if testing email):**
- [ ] send-digest job enqueued
- [ ] Worker processes digest
- [ ] Email sends successfully
- [ ] Email received with product trends

### Test 7: Data Volume

**Objective:** Verify volumes are created and used

```bash
# List volumes
docker volume ls | grep price-monitor

# Check volume details
docker volume inspect price-monitoring-agent_postgres-data
docker volume inspect price-monitoring-agent_redis-data
```

**Expected:**
- Two volumes exist
- Mounted in containers
- Non-zero size

**Verification:**
- [ ] postgres-data volume exists
- [ ] redis-data volume exists
- [ ] Volumes contain data

---

## Technical Specifications

### Test Coverage

**Infrastructure:**
- [x] Docker containers running
- [x] Ports accessible on localhost
- [x] Healthchecks passing
- [x] Volumes persisting data

**Application:**
- [x] Web app connects to PostgreSQL
- [x] Worker connects to Redis
- [x] Database operations (CRUD)
- [x] Queue operations (enqueue, process)
- [x] Price extraction pipeline
- [x] Data persistence across restarts

**Optional:**
- [ ] Email sending (if Resend configured)
- [ ] Scheduler (if enabled)
- [ ] AI extraction (if forced)

### Success Metrics

**All critical paths must work:**
1. Add product → Saved to database
2. Trigger check → Job processes → Price saved
3. View history → Shows price records
4. Restart services → Data intact

**No errors in:**
- Web app console
- Worker logs
- Docker logs
- Browser console

---

## Deliverables

- [ ] All 7 tests completed
- [ ] All critical features working
- [ ] No connection errors
- [ ] Data persists correctly
- [ ] Services restart cleanly
- [ ] Test results documented (notes or checklist)

---

## Verification Steps

### Final Checklist

After all tests:

```bash
# 1. Verify services healthy
docker ps

# 2. Check logs for errors
pnpm docker:logs | grep -i error

# 3. Verify database has data
docker exec -it price-monitor-postgres psql -U postgres -d priceMonitor -c "SELECT COUNT(*) FROM products; SELECT COUNT(*) FROM \"priceRecords\";"

# 4. Check Redis queue stats
docker exec -it price-monitor-redis redis-cli INFO stats

# 5. Confirm web app accessible
curl -s http://localhost:3000 | grep -i "price monitor"
```

**All should succeed with no critical errors.**

---

## Success Criteria

### Must Pass
- [x] Services start and stay healthy
- [x] Web app loads without errors
- [x] Worker connects to Redis
- [x] Can add product via UI
- [x] Price check job completes successfully
- [x] Data persists across service restart
- [x] No ECONNREFUSED or connection errors

### Should Pass
- [x] Dashboard shows products correctly
- [x] Price history displays
- [x] Redis contains queue data
- [x] Volumes retain data after `docker:down`

### Optional (Nice to Have)
- [ ] Digest email sends (if configured)
- [ ] AI extraction works (if API key set)
- [ ] Multiple products tracked simultaneously

---

## Notes

### Test Data

**Sample product URLs:**
- Amazon: `https://www.amazon.com/dp/B0BSHF7WHW`
- Any public e-commerce product page

**For testing, use real URLs** that are publicly accessible.

### Cleanup After Testing

```bash
# Stop services
pnpm docker:down

# Or fresh start (removes data)
pnpm docker:clean
```

### Expected Extraction Behavior

**Tier 1 (HTML Fetcher):**
- Fast (~100-500ms)
- May fail on JavaScript-heavy sites
- No AI cost

**Tier 2 (Playwright + AI):**
- Slower (~3-6s)
- More reliable
- Small AI cost (~$0.001-0.01)

**It's OK if Tier 1 fails and falls back to Tier 2.**

---

## Troubleshooting

### Web App Won't Start

**Check:**
1. Services running: `docker ps`
2. .env file exists: `ls .env`
3. DATABASE_URL correct: `grep DATABASE_URL .env`
4. Dependencies installed: `pnpm install`

**Solution:** See error message, usually:
- Connection refused → Services not running
- Authentication failed → Wrong .env credentials
- Port in use → Change Next.js port

### Worker Won't Process Jobs

**Check:**
1. Worker running: `ps aux | grep worker`
2. Redis accessible: `docker exec -it price-monitor-redis redis-cli PING`
3. Queue name correct: Check logs for "price-monitor-queue"

**Solution:**
- Restart worker
- Check Redis logs: `docker logs price-monitor-redis`
- Verify REDIS_URL in .env

### Price Check Fails

**Expected scenarios:**
- Tier 1 fails → Falls back to Tier 2 (OK)
- Tier 2 fails → Site has strong bot detection (expected for some sites)
- No price found → Selectors don't match (expected for new sites)

**Not errors, but expected behavior:**
- Some sites will block requests
- AI extraction may fail on complex pages

**Real errors:**
- Connection refused
- Playwright won't start
- API key invalid

### Data Not Persisting

**Check:**
1. Volumes exist: `docker volume ls`
2. Volumes mounted: `docker inspect price-monitor-postgres | grep -A 10 Mounts`
3. Using `docker:down` not `docker:clean`

**Solution:**
- Use `docker:down` to preserve data
- Recreate volumes if corrupted
- Check disk space: `df -h`

### Browser Can't Load localhost:3000

**Check:**
1. Web app running: `curl http://localhost:3000`
2. Port not blocked: `sudo lsof -i :3000`
3. WSL network: `curl http://127.0.0.1:3000`

**Solution:**
- Access via IP: `http://127.0.0.1:3000`
- Check Windows firewall (if WSL)
- Verify Next.js binds to 0.0.0.0 not 127.0.0.1

---

## Next Steps

After completing this task:

### If All Tests Pass ✅

**Congratulations!** Implementation 3 Phase 1 is complete.

**Next actions:**
1. Document any issues encountered (for troubleshooting guide)
2. Note any performance observations
3. Consider Phase 2 (production deployment) or other features

**Workflow validated:**
```
pnpm docker:up
pnpm --filter @price-monitor/web dev
pnpm --filter @price-monitor/worker dev
→ Full local development environment ready
```

### If Tests Fail ❌

**Troubleshoot:**
1. Review error messages in logs
2. Check `docs/troubleshooting-docker.md`
3. Verify each prerequisite met
4. Review individual task specs (1.1-1.13)

**Fix issues and re-test.**

**If stuck:** Create GitHub issue with:
- Error messages
- docker logs output
- Steps to reproduce
- Environment details (OS, Docker version)

---

## Appendix: Quick Test Script

Optional: Create a test script for future use:

```bash
#!/bin/bash
# test-impl3.sh - Quick E2E test script

echo "🧪 Testing Implementation 3..."

echo "1. Check services..."
docker ps | grep -E "postgres|redis"

echo "2. Check database..."
docker exec price-monitor-postgres psql -U postgres -d priceMonitor -c "SELECT version();"

echo "3. Check Redis..."
docker exec price-monitor-redis redis-cli PING

echo "4. Check web app..."
curl -s http://localhost:3000 | head -n 1

echo "5. Count products..."
docker exec price-monitor-postgres psql -U postgres -d priceMonitor -c "SELECT COUNT(*) FROM products;"

echo "✅ Tests complete!"
```

---

**Task Status:** Ready for execution (final task!)
