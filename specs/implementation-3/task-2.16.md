# Task 2.16: Deploy to Production

**Type:** Manual
**Performer:** User
**Phase:** 2 - Production Deployment

---

## What

Deploy both web and worker applications to production Coolify and verify they start successfully.

---

## Objective

This is the production launch. It validates:
- Production infrastructure is correctly configured
- Docker images pull from GHCR successfully
- Applications connect to production database and Redis
- Web UI is accessible to the public
- Worker processes jobs in production
- Environment variables are correct

**This is go-live moment.**

---

## How to Do

In production Coolify dashboard, deploy the web application first. Monitor deployment logs. Once running, deploy the worker application. Monitor its logs for successful startup. Push database schema to production if needed. Access the production web UI to verify it loads. Check both application logs for errors.

**Database Schema:**
If first deployment, push schema:
```bash
# Point to production DB temporarily
DATABASE_URL="<production-url>" pnpm --filter @price-monitor/db push
```

---

## Expected Results

**Success Criteria:**
- Web app deployed successfully
- Web app status: "Running"
- Production URL accessible
- Dashboard loads without errors
- Worker deployed successfully
- Worker status: "Running"
- Worker logs show successful startup
- Worker logs show "Connected to Redis"
- Worker logs show "Scheduler started" (if ENABLE_SCHEDULER=true)
- Database schema exists
- No critical errors in logs

**How to Verify:**
- Production Coolify shows both apps with "Running" status
- Open production URL → dashboard loads
- Check web logs → no errors
- Check worker logs → connection messages visible
- Worker logs show scheduler registration
- Can add test product (optional)
