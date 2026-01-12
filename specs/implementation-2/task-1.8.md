# Task 1.8: Test Database Connectivity

**Type:** Manual
**Performer:** User
**Phase:** 1 - Local VM + CICD

---

## What

Update local `.env` file with VM database connection strings and verify that both PostgreSQL and Redis are accessible from the host machine.

---

## Objective

This task validates that:
- The host machine can connect to databases running in the VM
- Network configuration is correct
- The development environment is ready for hybrid workflow (local code, VM services)

This is critical before proceeding to AI code generation tasks.

---

## How to Do

Update the `.env` file at the project root with the PostgreSQL and Redis connection strings from tasks 1.6 and 1.7. Test PostgreSQL by running the Drizzle schema push command to create database tables. Test Redis by attempting a connection (using redis-cli or a simple connection test script).

**Environment Variables to Update:**
- `DATABASE_URL`
- `REDIS_URL`

---

## Expected Results

**Success Criteria:**
- `.env` file updated with VM connection strings
- PostgreSQL connection successful
- Database schema created in PostgreSQL
- Redis connection successful
- No connection errors

**How to Verify:**
- Run `pnpm --filter @price-monitor/db push`
- Should see success message: "Schema pushed successfully"
- Check Coolify database viewer or use psql to verify tables exist
- For Redis: run `pnpm --filter @price-monitor/worker dev` briefly - should connect without errors
