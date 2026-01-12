# Task 1.21: Configure Web App in Coolify

**Type:** Manual
**Performer:** User
**Phase:** 1 - Local VM + CICD

---

## What

Configure the web application in Coolify dashboard to pull the `:dev` image from GHCR and set up environment variables.

---

## Objective

Create the web app configuration in Coolify so it can:
- Pull the web Docker image from GHCR
- Run with proper environment variables
- Expose port 3000 for access
- Generate a URL via Coolify's reverse proxy

This prepares for containerized deployment on local VM.

---

## How to Do

In Coolify dashboard, create a new application using "Docker Image" type. Configure it to use the `web:dev` image from GHCR. Set all required environment variables (DATABASE_URL, REDIS_URL, API keys, etc.). Configure reverse proxy settings. Save the configuration (but don't deploy yet - that's task 1.23).

**Image Format:**
```
ghcr.io/<your-username>/<your-repo>/web:dev
```

---

## Expected Results

**Success Criteria:**
- Web app configured in Coolify
- Image source set to GHCR
- All environment variables configured
- Port 3000 exposed
- Reverse proxy configured
- Configuration saved

**How to Verify:**
- Coolify shows application in applications list
- Application details show correct image URL
- Environment variables listed in configuration
- Port mapping configured (3000)
- Status shows "Not deployed" or "Stopped" (deployment happens in task 1.23)
