# Task 2.7: Create Redis Container on Droplet

**Type:** Manual
**Performer:** User
**Phase:** 2 - Production Deployment

---

## What

Create a Redis 7 container in production Coolify with persistent storage.

---

## Objective

Provision the production Redis instance for:
- BullMQ job queue
- Application caching
- Session storage

**Key Configuration:**
- Port NOT exposed publicly (internal only)
- Persistent volume for queue durability

---

## How to Do

In production Coolify dashboard, create a new Redis database. Ensure port is NOT exposed to public (internal Coolify network only). Enable persistent volume for data durability. Start the container and document the internal connection string.

**Internal Connection String Format (Coolify DNS):**
```
redis://price-monitor-redis-prod:6379
```

---

## Expected Results

**Success Criteria:**
- Redis 7 container created in production Coolify
- Container name: `price-monitor-redis-prod` (or similar)
- Port 6379 internal only (NOT exposed to public)
- Persistent volume configured
- Container status: Running
- Internal connection string documented

**How to Verify:**
- Production Coolify shows Redis in databases list
- Container status: Running
- Port configuration shows internal only
- Volume attached
- Can see internal connection details in Coolify
