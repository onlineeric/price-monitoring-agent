# Task 1.22: Configure Worker App in Coolify

**Type:** Manual
**Performer:** User
**Phase:** 1 - Local VM + CICD

---

## What

Configure the worker application in Coolify dashboard to pull the `:dev` image from GHCR and set up environment variables.

---

## Objective

Create the worker app configuration in Coolify so it can:
- Pull the worker Docker image from GHCR
- Run with proper environment variables
- Process BullMQ jobs in background
- No port exposure needed (background service)

**Important:** Set `ENABLE_SCHEDULER=true` to enable BullMQ Repeatable Jobs.

---

## How to Do

In Coolify dashboard, create a new application using "Docker Image" type. Configure it to use the `worker:dev` image from GHCR. Set all required environment variables (same as web app, plus `ENABLE_SCHEDULER=true`). No port mapping needed since worker is a background service. Save configuration (deployment happens in task 1.23).

**Image Format:**
```
ghcr.io/<your-username>/<your-repo>/worker:dev
```

---

## Expected Results

**Success Criteria:**
- Worker app configured in Coolify
- Image source set to GHCR
- All environment variables configured
- `ENABLE_SCHEDULER=true` set
- No port mapping (background service)
- Configuration saved

**How to Verify:**
- Coolify shows worker in applications list
- Application details show correct image URL
- Environment variables listed (including ENABLE_SCHEDULER)
- No port mappings configured
- Status shows "Not deployed" or "Stopped"
