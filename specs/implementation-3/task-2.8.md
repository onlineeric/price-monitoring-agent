# Task 2.8: Test Database Connectivity on Droplet

**Type:** Manual
**Performer:** User
**Phase:** 2 - Production Deployment

---

## What

Verify that PostgreSQL and Redis containers are running correctly and accessible within the Coolify internal network.

---

## Objective

Validate database connectivity before deploying applications to ensure:
- Containers are running
- Internal networking works
- Connection strings are correct
- Ready for application deployment

---

## How to Do

SSH into the Droplet and use Docker commands to access the database containers directly. For PostgreSQL, connect using psql client. For Redis, use redis-cli to ping the server. Document the test results.

**Test Commands:**
```bash
# PostgreSQL
docker exec -it <postgres-container-id> psql -U postgres -d priceMonitor

# Redis
docker exec -it <redis-container-id> redis-cli ping
```

Get container IDs from: `docker ps`

---

## Expected Results

**Success Criteria:**
- PostgreSQL container accessible via docker exec
- Can connect to priceMonitor database
- Redis container accessible via docker exec
- Redis responds to PING with PONG
- Internal URLs documented for application configuration
- No connection errors

**How to Verify:**
- PostgreSQL: psql command connects, shows `priceMonitor=#` prompt
- Redis: `redis-cli ping` returns `PONG`
- Both containers show in `docker ps` output
- Container logs show no errors
