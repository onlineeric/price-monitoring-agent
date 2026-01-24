# Task 2.8: Test Database Connectivity on Droplet

**Type:** Manual
**Performer:** User
**Phase:** 2 - Production Deployment

---

## What

Verify that PostgreSQL and Redis resources are running correctly in Coolify and note the internal endpoints that the app containers will use.

---

## Objective

Validate database connectivity before deploying applications to ensure:
- Containers are running
- Internal networking works
- Connection strings are correct
- Ready for application deployment

---

## How to Do

Open the Coolify dashboard and verify health status for the PostgreSQL and Redis resources. Use Coolify logs/status to confirm both services are started and stable, then document the internal hostnames/ports for application configuration.

**Dashboard Checklist:**
1. Coolify dashboard -> Project/Environment where Postgres + Redis are deployed.
2. Open the **PostgreSQL** resource/service:
   - Status shows `Running` (or `Healthy` if healthchecks are enabled)
   - No restart loop (restart count not increasing)
   - Logs contain a readiness message like: `database system is ready to accept connections`
3. Open the **Redis** resource/service:
   - Status shows `Running` (or `Healthy` if healthchecks are enabled)
   - No restart loop
   - Logs contain a readiness message like: `Ready to accept connections`
4. In Coolify, find and record the **internal endpoints** (service hostname + port) for both resources:
   - Postgres: internal hostname + port `5432`
   - Redis: internal hostname + port `6379`
5. Document the production env var values you will set on web/worker:
   - `DATABASE_URL=postgresql://postgres:<password>@<postgres-internal-host>:5432/priceMonitor`
   - `REDIS_URL=redis://<redis-internal-host>:6379`

---

## Expected Results

**Success Criteria:**
- PostgreSQL resource/service shows `Running`/`Healthy` in Coolify
- Redis resource/service shows `Running`/`Healthy` in Coolify
- Logs indicate both services are ready (no crash/restart loops)
- Internal hostnames/ports documented for application configuration
- No obvious connection/auth/startup errors in logs

**How to Verify:**
- PostgreSQL: Coolify status is `Running`/`Healthy`, logs show ready/accepting connections
- Redis: Coolify status is `Running`/`Healthy`, logs show ready/accepting connections
- Both resources show as running in Coolify resources list
- Logs show no repeated failures/auth errors

> Note: This dashboard-only approach validates that the services are up and stable. If the web/worker later reports connection errors, follow up with an interactive connectivity test (e.g., exec into a container with `psql`/`redis-cli`) to confirm internal networking end-to-end.
