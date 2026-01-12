# Task 1.6: Create PostgreSQL Container

**Type:** Manual
**Performer:** User
**Phase:** 1 - Local VM + CICD

---

## What

Create a PostgreSQL 15 database container via Coolify dashboard with persistent storage.

---

## Objective

This PostgreSQL instance will replace the Neon cloud database for local development. It stores:
- Product information
- Price history records
- Settings (email schedules)
- Run logs

**Key Configuration:**
- Port 5432 exposed to VM network (so host machine can connect)
- Persistent volume (data survives container restarts)
- Strong password for security

---

## How to Do

Use Coolify dashboard to create a new PostgreSQL database. Configure the database name, username, password, and ensure port 5432 is exposed. Enable persistent volume for data durability. Once created, generate and document the connection string for use in `.env` configuration.

**Connection String Format:**
```
postgresql://postgres:<password>@<vm-ip>:5432/priceMonitor
```

---

## Expected Results

**Success Criteria:**
- PostgreSQL 15 container created in Coolify
- Container status: Running
- Port 5432 exposed to VM network
- Persistent volume attached
- Connection string documented

**How to Verify:**
- Check Coolify dashboard - PostgreSQL container shows "Running" status
- Container details show port mapping: 5432:5432
- Volume attached and showing storage path
- Can see connection details in Coolify
