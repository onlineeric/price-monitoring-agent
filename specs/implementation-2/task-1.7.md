# Task 1.7: Create Redis Container

**Type:** Manual
**Performer:** User
**Phase:** 1 - Local VM + CICD

---

## What

Create a Redis 7 container via Coolify dashboard with persistent storage.

---

## Objective

This Redis instance will replace the Upstash cloud Redis for local development. It serves as:
- BullMQ job queue storage
- Cache for application data
- Session storage (if needed)

**Key Configuration:**
- Port 6379 exposed to VM network (so host machine can connect)
- Persistent volume (queue data survives container restarts)

---

## How to Do

Use Coolify dashboard to create a new Redis database. Configure to ensure port 6379 is exposed. Enable persistent volume for data durability. Once created, generate and document the connection string for use in `.env` configuration.

**Connection String Format:**
```
redis://<vm-ip>:6379
```

---

## Expected Results

**Success Criteria:**
- Redis 7 container created in Coolify
- Container status: Running
- Port 6379 exposed to VM network
- Persistent volume attached
- Connection string documented

**How to Verify:**
- Check Coolify dashboard - Redis container shows "Running" status
- Container details show port mapping: 6379:6379
- Volume attached and showing storage path
- Can see connection details in Coolify
