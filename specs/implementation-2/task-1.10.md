# Task 1.10: Configure GHCR Access in Coolify

**Type:** Manual
**Performer:** User
**Phase:** 1 - Local VM + CICD

---

## What

Add GitHub Container Registry (GHCR) as a container registry source in Coolify using the PAT from task 1.9.

---

## Objective

This configuration allows Coolify to:
- Pull Docker images from GHCR (your private repository)
- Deploy applications using images built by GitHub Actions
- Automatically redeploy when new images are pushed

Without this, Coolify cannot access private images stored in GHCR.

**Registry Details:**
- Registry URL: `ghcr.io`
- Username: Your GitHub username
- Password: PAT from task 1.9

---

## How to Do

In Coolify dashboard, navigate to registry settings and add a new GitHub Container Registry. Enter your GitHub username and the PAT as the password. Test the connection to verify authentication works.

---

## Expected Results

**Success Criteria:**
- GHCR registry added to Coolify
- Registry URL: `ghcr.io`
- Username configured
- PAT configured as password
- Connection test successful

**How to Verify:**
- Coolify shows registry in registry list
- Registry status shows "Connected" or similar
- Test connection button returns success
- No authentication errors
