# Task 1.23: Deploy Both Apps to Local VM

**Type:** Manual
**Performer:** User
**Phase:** 1 - Local VM + CICD

---

## What

Deploy both web and worker applications on the local VM by triggering deployment in Coolify and verify they start successfully.

---

## Objective

This is the first containerized deployment test. It verifies:
- Docker images pull successfully from GHCR
- Containers start without errors
- Applications connect to PostgreSQL and Redis
- Web UI is accessible
- Worker processes jobs
- Environment variables are correct

This validates the entire CICD pipeline: Code → GitHub → Actions → GHCR → Coolify → Running Containers.

---

## How to Do

In Coolify dashboard, deploy the web application first. Wait for deployment to complete and verify it's running. Then deploy the worker application. Wait for it to complete and verify it's running. Check logs for both applications to ensure no startup errors. Access the web UI through the Coolify-generated URL.

---

## Expected Results

**Success Criteria:**
- Web app deployed successfully
- Web app status: "Running" in Coolify
- Web UI accessible via generated URL
- Worker deployed successfully
- Worker status: "Running" in Coolify
- No errors in web app logs
- No errors in worker logs
- Worker logs show "Connected to Redis" or similar
- Worker logs show "Scheduler started" (if ENABLE_SCHEDULER=true)

**How to Verify:**
- Coolify dashboard shows both apps with green "Running" status
- Click on web app URL → dashboard loads
- Check web app logs → no errors
- Check worker logs → shows successful startup messages
- Worker logs show BullMQ connection
