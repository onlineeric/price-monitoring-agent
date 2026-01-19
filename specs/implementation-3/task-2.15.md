# Task 2.15: Configure Worker App in Production Coolify

**Type:** Manual
**Performer:** User
**Phase:** 2 - Production Deployment

---

## What

Configure the worker application in production Coolify to pull the `:latest` image from GHCR and set up all environment variables.

---

## Objective

Create production worker app configuration with:
- Pulls `worker:latest` from GHCR
- Uses Coolify internal DNS for database/Redis
- **`ENABLE_SCHEDULER=true`** to enable BullMQ Repeatable Jobs
- All environment variables properly set
- Webhook URL for auto-deployment

**Reference:** Use `docs/production-env.md` (from task 2.11) for environment variables.

---

## How to Do

In production Coolify dashboard, create new application using Docker Image type. Set image to `worker:latest` from GHCR. Configure all environment variables from production-env.md checklist (including `ENABLE_SCHEDULER=true`). No port mapping needed. Get webhook URL and save as GitHub Secret `COOLIFY_WEBHOOK_WORKER_PROD`. Don't deploy yet.

**Image:** `ghcr.io/<username>/<repo>/worker:latest`

**Critical:** Set `ENABLE_SCHEDULER=true`

---

## Expected Results

**Success Criteria:**
- Worker app configured in production Coolify
- Image set to GHCR `worker:latest`
- All environment variables configured (use checklist from docs/production-env.md)
- **`ENABLE_SCHEDULER=true` confirmed**
- No port mapping (background service)
- Webhook URL copied
- GitHub Secret `COOLIFY_WEBHOOK_WORKER_PROD` created
- Configuration saved

**How to Verify:**
- Production Coolify shows worker in applications list
- Environment variables include `ENABLE_SCHEDULER=true`
- Webhook URL visible in app settings
- GitHub repository → Settings → Secrets shows COOLIFY_WEBHOOK_WORKER_PROD
- Both webhook secrets (web and worker) now exist
