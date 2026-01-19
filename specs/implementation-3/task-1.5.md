# Task 1.5: Verify Database Connectivity

**Type:** Manual - Verification
**Performer:** User
**Phase:** 1 - Local Development Simplification
**Dependencies:** Task 1.4 (Services running)
**Estimated Time:** 2 minutes

---

## What

Verify that the Next.js application and worker can connect to PostgreSQL and Redis running in docker-compose containers, and successfully push the database schema using Drizzle ORM.

---

## Objective

Confirm that:
1. Application can connect to `localhost:5432` (PostgreSQL)
2. Application can connect to `localhost:6379` (Redis)
3. Drizzle schema migrations work correctly
4. Database credentials and URLs are configured properly

This ensures the docker-compose services are ready for local development.

---

## How to Do

### Step 1: Update .env File

Ensure `.env` file exists in project root with localhost URLs:

```bash
cd /home/onlineeric/repos/price-monitoring-agent
```

**Check if .env exists:**
```bash
ls .env
```

**If missing, copy from template:**
```bash
cp .env.example .env
```

**Verify DATABASE_URL and REDIS_URL:**
```bash
grep -E "DATABASE_URL|REDIS_URL" .env
```

**Should show:**
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/priceMonitor"
REDIS_URL="redis://localhost:6379"
```

**If different (like VM IP):** Update to localhost URLs.

### Step 2: Push Database Schema

```bash
pnpm --filter @price-monitor/db push
```

**This command:**
1. Reads Drizzle schema from `packages/db/src/schema.ts`
2. Connects to PostgreSQL at localhost:5432
3. Creates tables, indexes, foreign keys
4. Confirms schema is applied

**Expected output:**
```
[✓] Changes applied successfully!
```

Or similar success message from Drizzle.

### Step 3: Verify Tables Created

Connect to PostgreSQL and list tables:

```bash
docker exec -it price-monitoring-agent-postgres-1 psql -U postgres -d priceMonitor -c "\dt"
```

**Expected output:**
```
              List of relations
 Schema |       Name       | Type  |  Owner
--------+------------------+-------+----------
 public | products         | table | postgres
 public | priceRecords     | table | postgres
 public | settings         | table | postgres
 public | runLogs          | table | postgres
 public | drizzle_migrations | table | postgres
```

**Key tables:**
- `products` - Product information
- `priceRecords` - Price history
- `settings` - Application settings
- `runLogs` - Job execution logs

### Step 4: Test Redis Connection

```bash
pnpm --filter @price-monitor/worker dev &
```

**This starts the worker in background.** Wait 5 seconds, then check logs:

```bash
# Check worker output
jobs
```

**Look for:**
```
Worker connected to Redis at localhost:6379
Queue: price-monitor-queue
Listening for jobs...
```

**Stop the background worker:**
```bash
# Get job number from 'jobs' command (e.g., [1])
kill %1
```

### Step 5: Test BullMQ Queue

Verify queue is accessible:

```bash
docker exec -it price-monitoring-agent-redis-1 redis-cli KEYS "*"
```

**After starting worker (Step 4), should show:**
```
1) "bull:price-monitor-queue:id"
2) "bull:price-monitor-queue:meta"
...
```

**Empty result is OK** if worker wasn't started yet.

---

## Technical Specifications

### Connection Details

**PostgreSQL:**
- Host: `localhost`
- Port: `5432`
- User: `postgres`
- Password: `password`
- Database: `priceMonitor`
- URL: `postgresql://postgres:password@localhost:5432/priceMonitor`

**Redis:**
- Host: `localhost`
- Port: `6379`
- No password (local development)
- URL: `redis://localhost:6379`

### Database Schema

Drizzle ORM manages schema through:
- **Schema file:** `packages/db/src/schema.ts`
- **Push command:** Applies schema to database
- **Migrations:** Optional, not used in demo app

**Tables created:**
1. `products` - Product tracking
2. `priceRecords` - Price history entries
3. `settings` - Key-value configuration
4. `runLogs` - Job execution logs
5. `drizzle_migrations` - Migration history (internal)

---

## Deliverables

- [ ] .env file updated with localhost URLs
- [ ] Database schema pushed successfully
- [ ] Tables visible in PostgreSQL
- [ ] Worker connects to Redis
- [ ] No connection errors in logs

---

## Verification Steps

### 1. Verify Database Connection

```bash
# Test connection with psql
docker exec -it price-monitoring-agent-postgres-1 psql -U postgres -d priceMonitor -c "SELECT NOW();"
```

**Expected:** Returns current timestamp.

### 2. Count Tables

```bash
docker exec -it price-monitoring-agent-postgres-1 psql -U postgres -d priceMonitor -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"
```

**Expected:** 5 or more tables.

### 3. Test Redis Ping

```bash
docker exec -it price-monitoring-agent-redis-1 redis-cli PING
```

**Expected:** `PONG`

### 4. Check .env Configuration

```bash
# Should show localhost URLs
cat .env | grep -E "DATABASE_URL|REDIS_URL"
```

---

## Success Criteria

- [x] `.env` file has localhost URLs (not VM IP)
- [x] `pnpm --filter @price-monitor/db push` succeeds
- [x] `\dt` in psql shows 5+ tables
- [x] Worker can connect to Redis (no connection errors)
- [x] PostgreSQL accepts queries
- [x] Redis accepts commands

---

## Notes

### Why This Matters

This task confirms the critical transition:
- **Before:** Apps connected to VM IP (e.g., `192.168.64.x`)
- **After:** Apps connect to `localhost`

If this task fails, subsequent development won't work.

### Drizzle Push vs Migrate

Implementation 3 uses `push` (not `migrate`):
- **Push:** Directly applies schema to database (fast, good for dev)
- **Migrate:** Generates migration files (more control, good for production)

For this demo app, `push` is simpler.

### Starting Worker to Test Redis

We start the worker briefly to verify Redis connection. In normal development, you'll run:
```bash
# Terminal 1
pnpm --filter @price-monitor/web dev

# Terminal 2
pnpm --filter @price-monitor/worker dev
```

---

## Troubleshooting

### Connection Refused (PostgreSQL)

**Symptom:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solutions:**
1. Verify container is running: `docker ps | grep postgres`
2. Check port mapping: Should show `0.0.0.0:5432->5432/tcp`
3. Verify .env has correct URL
4. Try connecting directly:
   ```bash
   docker exec -it price-monitoring-agent-postgres-1 psql -U postgres -d priceMonitor
   ```

### Connection Refused (Redis)

**Symptom:**
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Solutions:**
1. Verify container is running: `docker ps | grep redis`
2. Check Redis is listening:
   ```bash
   docker exec -it price-monitoring-agent-redis-1 redis-cli PING
   ```
3. Verify .env has `REDIS_URL="redis://localhost:6379"`

### Database Push Fails: Database Not Found

**Symptom:**
```
Error: database "priceMonitor" does not exist
```

**Solution:**
```bash
# Create database
docker exec -it price-monitoring-agent-postgres-1 psql -U postgres -c "CREATE DATABASE priceMonitor;"

# Retry push
pnpm --filter @price-monitor/db push
```

**Prevention:** docker-compose.yml should set `POSTGRES_DB=priceMonitor` (Task 1.7).

### Authentication Failed

**Symptom:**
```
Error: password authentication failed for user "postgres"
```

**Solution:**
1. Check .env password matches docker-compose.yml
2. Default password should be `password`
3. If changed, update both .env and docker-compose.yml

### Tables Not Created

**Symptom:** `\dt` shows "No relations found"

**Solution:**
```bash
# Check for errors in push
pnpm --filter @price-monitor/db push

# Verify schema file exists
ls packages/db/src/schema.ts

# Check database connection
docker exec -it price-monitoring-agent-postgres-1 psql -U postgres -d priceMonitor -c "SELECT version();"
```

### WSL DNS Issues

**Symptom:** `localhost` doesn't resolve

**Solution:**
```bash
# Ping localhost
ping localhost

# Should resolve to 127.0.0.1
# If not, check /etc/hosts
cat /etc/hosts | grep localhost

# Should contain:
# 127.0.0.1 localhost
```

---

## Next Steps

After completing this task:
1. Proceed to **Task 1.6: Clean Up Old VM Documentation**
2. Confirm you can connect to both services
3. Optionally query tables:
   ```bash
   docker exec -it price-monitoring-agent-postgres-1 psql -U postgres -d priceMonitor
   \d products
   \q
   ```

---

**Task Status:** Ready for execution (after Task 1.4)
