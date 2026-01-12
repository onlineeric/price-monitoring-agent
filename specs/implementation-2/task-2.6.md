# Task 2.6: Create PostgreSQL Container on Droplet

**Type:** Manual
**Performer:** User
**Phase:** 2 - Production Deployment

---

## What

Create a PostgreSQL 15 database container in production Coolify with persistent storage.

---

## Objective

Provision the production database that will store:
- Product information
- Price history
- Settings
- Run logs

**Key Differences from Local VM:**
- Port NOT exposed publicly (internal Coolify network only)
- Strong password (production security)
- Persistent volume for data durability

---

## How to Do

In production Coolify dashboard, create a new PostgreSQL database. Configure database name, username, and a strong password. Ensure port is NOT exposed to public (internal only). Enable persistent volume. Start the container and document the internal connection string for use in application configuration.

**Internal Connection String Format (Coolify DNS):**
```
postgresql://postgres:<password>@price-monitor-postgres-prod:5432/priceMonitor
```

**Note:** Use Coolify's internal DNS name, not IP address.

---

## Expected Results

**Success Criteria:**
- PostgreSQL 15 container created in production Coolify
- Container name: `price-monitor-postgres-prod` (or similar)
- Database: `priceMonitor`
- Username: `postgres`
- Strong password set
- Port 5432 internal only (NOT exposed to public)
- Persistent volume configured
- Container status: Running
- Internal connection string documented

**How to Verify:**
- Production Coolify shows PostgreSQL in databases list
- Container status: Running
- Port configuration shows internal only
- Volume attached and showing size
- Can see internal connection details in Coolify
