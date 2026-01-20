# Task 1.4: Create and Start Services

**Type:** Manual - Infrastructure
**Performer:** User
**Phase:** 1 - Local Development Simplification
**Dependencies:** Task 1.3 (Docker verified), Task 1.7 (docker-compose.yml created)
**Estimated Time:** 3-5 minutes

---

## What

Start PostgreSQL and Redis containers using the docker-compose.yml file created in Task 1.7, and verify both services are running and healthy.

---

## Objective

Bring up the local development services that replace the Multipass VM:
- PostgreSQL 15 on port 5432
- Redis 7 on port 6379

These services will persist data in Docker volumes and be accessible at `localhost`.

---

## How to Do

### Step 1: Navigate to Project Root

```bash
cd /home/onlineeric/repos/price-monitoring-agent
```

**Verify docker-compose.yml exists:**
```bash
ls docker-compose.yml
```

### Step 2: Start Services with Compose

```bash
pnpm docker:up
```

**Or directly:**
```bash
docker compose up -d
```

**Flags explained:**
- `-d` = detached mode (runs in background)
- Without `-d`, logs stream to terminal (use Ctrl+C to stop)

**Expected output:**
```
Creating network "price-monitoring-agent_default" with the default driver
Creating volume "price-monitoring-agent_postgres-data" with default driver
Creating volume "price-monitoring-agent_redis-data" with default driver
Creating price-monitoring-agent-postgres-1 ... done
Creating price-monitoring-agent-redis-1    ... done
```

### Step 3: Verify Containers Are Running

```bash
docker ps
```

**Expected output:**
```
CONTAINER ID   IMAGE              STATUS                    PORTS                    NAMES
abc123def456   postgres:18-alpine Up 10 seconds (healthy)   0.0.0.0:5432->5432/tcp   price-monitoring-agent-postgres-1
xyz789uvw012   redis:8-alpine     Up 10 seconds (healthy)   0.0.0.0:6379->6379/tcp   price-monitoring-agent-redis-1
```

**Key indicators:**
- **STATUS:** Should show "Up" and "(healthy)" after ~5-10 seconds
- **PORTS:** Shows port mappings (host:container)

### Step 4: Check Container Logs

```bash
pnpm docker:logs
```

**Or directly:**
```bash
docker-compose logs
```

**For specific service:**
```bash
docker-compose logs postgres
docker-compose logs redis
```

**Expected PostgreSQL logs:**
```
PostgreSQL init process complete; ready for start up.
...
database system is ready to accept connections
```

**Expected Redis logs:**
```
Ready to accept connections tcp
```

### Step 5: Wait for Healthchecks

Healthchecks run every 10 seconds. Wait ~15 seconds, then:

```bash
docker ps
```

**Confirm:** STATUS column shows "(healthy)" for both containers.

---

## Technical Specifications

### Services Started

1. **PostgreSQL 15**
   - Container name: `price-monitoring-agent-postgres-1`
   - Port: `5432` (localhost:5432 → container:5432)
   - Volume: `price-monitoring-agent_postgres-data`
   - Healthcheck: `pg_isready -U postgres`
   - Environment:
     - `POSTGRES_USER=postgres`
     - `POSTGRES_PASSWORD=password`
     - `POSTGRES_DB=priceMonitor`

2. **Redis 7**
   - Container name: `price-monitoring-agent-redis-1`
   - Port: `6379` (localhost:6379 → container:6379)
   - Volume: `price-monitoring-agent_redis-data`
   - Healthcheck: `redis-cli ping`

### Network Configuration

- **Network:** Docker bridge network (auto-created)
- **Service discovery:** Containers can reach each other by service name
- **Host access:** Services accessible at `localhost:5432` and `localhost:6379`

### Data Persistence

- **Volumes:** Named volumes store data outside containers
- **Lifecycle:** Data persists even if containers are stopped/removed
- **Location:** Docker manages volume storage (typically `/var/lib/docker/volumes/`)

---

## Deliverables

- [ ] PostgreSQL container running and healthy
- [ ] Redis container running and healthy
- [ ] Ports 5432 and 6379 accessible on localhost
- [ ] Volumes created for data persistence

---

## Verification Steps

### 1. Container Status

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Both containers should show "Up" and "(healthy)".

### 2. Test PostgreSQL Connection

```bash
docker exec -it price-monitoring-agent-postgres-1 psql -U postgres -d priceMonitor -c "SELECT version();"
```

**Expected output:**
```
PostgreSQL 15.x on x86_64-pc-linux-musl, compiled by gcc...
```

### 3. Test Redis Connection

```bash
docker exec -it price-monitoring-agent-redis-1 redis-cli ping
```

**Expected output:**
```
PONG
```

### 4. Verify Port Listening

```bash
# Check if ports are listening
ss -tuln | grep -E '5432|6379'
```

**Expected output:**
```
tcp   LISTEN 0.0.0.0:5432
tcp   LISTEN 0.0.0.0:6379
```

---

## Success Criteria

- [x] Ran `pnpm docker:up` successfully
- [x] `docker ps` shows 2 containers running
- [x] Both containers show "(healthy)" status
- [x] PostgreSQL responds to `psql` command
- [x] Redis responds to `redis-cli ping`
- [x] No error messages in `docker-compose logs`
- [x] Ports 5432 and 6379 listening on localhost

---

## Notes

### Container Names

Container names follow pattern: `{project-dir}_{service}_{instance}`
- `price-monitoring-agent-postgres-1`
- `price-monitoring-agent-redis-1`

### Detached Mode

Running with `-d` means containers run in background. To see logs:
```bash
pnpm docker:logs
docker-compose logs -f  # Follow mode (stream logs)
```

### Stopping Services

```bash
pnpm docker:down
# or: docker-compose down
```

This stops containers but **preserves volumes** (data persists).

### Removing Data

To remove volumes (fresh start):
```bash
pnpm docker:clean
# or: docker-compose down -v
```

---

## Troubleshooting

### Port Already in Use

**Symptom:**
```
Error starting userland proxy: listen tcp 0.0.0.0:5432: bind: address already in use
```

**Cause:** Another process (maybe old VM!) is using the port.

**Solutions:**

**Find what's using the port:**
```bash
sudo lsof -i :5432  # or :6379
```

**Stop old VM (if still running):**
```bash
multipass stop coolify-local
```

**Or change ports in docker-compose.yml:**
```yaml
ports:
  - "5433:5432"  # Use 5433 instead of 5432
```

### Container Exits Immediately

**Symptom:** `docker ps` shows 0 containers running

**Check logs:**
```bash
docker-compose logs
```

**Common causes:**
- Invalid environment variables
- Permission issues with volumes
- Port conflicts

### Healthcheck Never Passes

**Symptom:** Container stays "Up X seconds" but never shows "(healthy)"

**Check healthcheck logs:**
```bash
docker inspect price-monitoring-agent-postgres-1 | grep -A 10 Health
```

**Solution:** Wait longer (up to 30 seconds) or check service logs for errors.

### Volume Permission Errors (WSL)

**Symptom:**
```
initdb: error: could not access directory "/var/lib/postgresql/data": Permission denied
```

**Solution (WSL specific):**
```bash
# Restart Docker with proper permissions
wsl --shutdown  # In PowerShell
# Restart Docker Desktop
```

### Cannot Pull Images

**Symptom:**
```
Error response from daemon: Get https://registry-1.docker.io/v2/: net/http: request canceled
```

**Solution:**
1. Check internet connection
2. Verify Docker Hub is accessible: `ping hub.docker.com`
3. Check proxy settings (if behind corporate proxy)

---

## Next Steps

After completing this task:
1. Proceed to **Task 1.5: Verify Database Connectivity**
2. Keep containers running for subsequent tasks
3. Optionally explore Docker Desktop dashboard to see containers and volumes

---

**Task Status:** Ready for execution (after Task 1.7)
