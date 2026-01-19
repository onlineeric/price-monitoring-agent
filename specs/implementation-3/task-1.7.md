# Task 1.7: Create docker-compose.yml

**Type:** AI - Configuration
**Performer:** Claude
**Phase:** 1 - Local Development Simplification
**Dependencies:** None (can start immediately)
**Estimated Time:** 5 minutes

---

## What

Create a `docker-compose.yml` file in the project root that defines PostgreSQL 15 and Redis 7 services for local development, replacing the Multipass VM setup.

---

## Objective

Provide a simple, declarative configuration for local development services that:
- Starts PostgreSQL and Redis with one command
- Persists data in Docker volumes
- Exposes ports on localhost
- Includes healthchecks for reliability
- Matches production service versions

---

## How to Do

Create `docker-compose.yml` in project root with the following requirements:

### Service 1: PostgreSQL 15

**Image:** `postgres:15-alpine`

**Container Name:** `price-monitor-postgres`

**Environment Variables:**
- `POSTGRES_USER=postgres`
- `POSTGRES_PASSWORD=password`
- `POSTGRES_DB=priceMonitor`

**Ports:**
- Map host port 5432 to container port 5432

**Volume:**
- Named volume `postgres-data` mounted at `/var/lib/postgresql/data`

**Healthcheck:**
- Command: `pg_isready -U postgres`
- Interval: 10s
- Timeout: 5s
- Retries: 5

**Restart Policy:** `unless-stopped`

### Service 2: Redis 7

**Image:** `redis:7-alpine`

**Container Name:** `price-monitor-redis`

**Ports:**
- Map host port 6379 to container port 6379

**Volume:**
- Named volume `redis-data` mounted at `/data`

**Healthcheck:**
- Command: `redis-cli ping`
- Interval: 10s
- Timeout: 3s
- Retries: 5

**Restart Policy:** `unless-stopped`

### Compose File Version

Use Compose file format version `3.8`.

### Volumes Section

Define two named volumes:
- `postgres-data` (driver: local)
- `redis-data` (driver: local)

---

## Technical Specifications

### File Location

```
/home/onlineeric/repos/price-monitoring-agent/docker-compose.yml
```

### Expected Structure

```yaml
version: '3.8'

services:
  postgres:
    # PostgreSQL configuration

  redis:
    # Redis configuration

volumes:
  postgres-data:
  redis-data:
```

### Design Principles

1. **Simplicity:** Minimal configuration, sensible defaults
2. **Persistence:** Data survives container restarts
3. **Health:** Healthchecks ensure services are ready
4. **Isolation:** Named volumes prevent data loss
5. **Standards:** Follow docker-compose best practices

### Port Mappings

| Service | Container Port | Host Port | Protocol |
|---------|---------------|-----------|----------|
| PostgreSQL | 5432 | 5432 | TCP |
| Redis | 6379 | 6379 | TCP |

### Volume Persistence

Volumes are named and managed by Docker:
- **Location:** `/var/lib/docker/volumes/` (Linux) or Docker Desktop managed
- **Lifecycle:** Persist until explicitly removed with `docker-compose down -v`
- **Backup:** Can be backed up via `docker volume` commands

---

## Deliverables

- [ ] `docker-compose.yml` created in project root
- [ ] PostgreSQL service configured with Alpine image
- [ ] Redis service configured with Alpine image
- [ ] Both services have healthchecks
- [ ] Named volumes defined
- [ ] Ports exposed to localhost
- [ ] File follows docker-compose v3.8 syntax

---

## Verification Steps

### 1. Validate Syntax

```bash
docker-compose config
```

**Expected:** No errors, formatted YAML output.

### 2. Check Services Defined

```bash
docker-compose config --services
```

**Expected:**
```
postgres
redis
```

### 3. Check Volumes Defined

```bash
docker-compose config --volumes
```

**Expected:**
```
postgres-data
redis-data
```

### 4. Test Start (Optional)

```bash
docker-compose up -d
docker ps
docker-compose down
```

**Expected:** Both containers start and show "(healthy)".

---

## Success Criteria

- [x] docker-compose.yml exists in project root
- [x] Compose syntax validation passes
- [x] PostgreSQL service uses postgres:15-alpine
- [x] Redis service uses redis:7-alpine
- [x] Both services expose correct ports
- [x] Healthchecks configured for both services
- [x] Named volumes defined for data persistence
- [x] Environment variables set for PostgreSQL
- [x] Restart policy set to unless-stopped
- [x] File is properly formatted and commented

---

## Notes

### Why Alpine Images?

Alpine-based images are:
- **Smaller:** ~40-200MB vs ~300-800MB for Debian-based
- **Faster:** Quicker to pull and start
- **Secure:** Smaller attack surface
- **Production-like:** Same version, different base OS

**Trade-off:** Some tools missing (bash, etc.), but not needed for services.

### Healthchecks

Healthchecks ensure services are actually ready:
- **PostgreSQL:** `pg_isready` checks if DB accepts connections
- **Redis:** `redis-cli ping` returns PONG when ready

Docker marks containers "(healthy)" only after healthcheck passes.

### Restart Policy

`unless-stopped` means:
- Container auto-restarts on failure
- Stays stopped if manually stopped
- Auto-starts on machine reboot (if Docker is set to auto-start)

**Alternative:** `always` would restart even if manually stopped.

### Docker Compose V1 vs V2

This file works with both:
- **V1:** `docker-compose up`
- **V2:** `docker compose up`

Version `3.8` is compatible with both.

---

## Troubleshooting

### Syntax Error in YAML

**Symptom:** `docker-compose config` shows errors

**Common causes:**
- Incorrect indentation (use 2 spaces, not tabs)
- Missing colons
- Unquoted values with special characters

**Solution:** Validate YAML at yamllint.com or use `docker-compose config`.

### Port Already in Use

**Symptom:** `bind: address already in use`

**Solution:** See Task 1.4 troubleshooting. Change ports if needed:
```yaml
ports:
  - "5433:5432"  # Use alternate host port
```

### Invalid Image Tag

**Symptom:** `image not found` or `manifest unknown`

**Solution:** Verify image exists:
```bash
docker pull postgres:15-alpine
docker pull redis:7-alpine
```

---

## Next Steps

After completing this task:
1. Proceed to **Task 1.8: Create Docker Compose Scripts**
2. File will be used in Task 1.4 to start services
3. User can immediately test with `docker-compose up -d`

---

## Reference: Complete Example

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: price-monitor-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: priceMonitor
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: price-monitor-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    restart: unless-stopped

volumes:
  postgres-data:
    driver: local
  redis-data:
    driver: local
```

**Note:** This is for reference. Create the actual file following specifications above.

---

**Task Status:** Ready for execution
