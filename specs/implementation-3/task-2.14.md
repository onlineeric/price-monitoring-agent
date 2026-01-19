# Task 2.14: Configure Web App in Production Coolify

**Type:** Manual
**Performer:** User
**Phase:** 2 - Production Deployment

---

## What

Configure the web application in production Coolify to pull the `:latest` image from GHCR and set up all environment variables.

---

## Objective

Create production web app configuration with:
- Pulls `web:latest` from GHCR
- Uses Coolify internal DNS for database/Redis
- All environment variables properly set
- Domain configured (or Coolify-generated URL)
- Webhook URL for auto-deployment

**Reference:** Use `docs/production-env.md` (from task 2.11) for environment variables.

---

## How to Do

In production Coolify dashboard, create new application using Docker Image type. Set image to `web:latest` from GHCR. Configure all environment variables from production-env.md checklist. Set up domain or use Coolify-generated URL. Get the webhook URL from application settings and save it as GitHub Secret `COOLIFY_WEBHOOK_WEB_PROD`. Don't deploy yet (deployment in task 2.16).

**Image:** `ghcr.io/<username>/<repo>/web:latest`

---

## Expected Results

**Success Criteria:**
- Web app configured in production Coolify
- Image set to GHCR `web:latest`
- All environment variables configured (use checklist from docs/production-env.md)
- Domain or URL configured
- Webhook URL copied
- GitHub Secret `COOLIFY_WEBHOOK_WEB_PROD` created with webhook URL
- Configuration saved

**How to Verify:**
- Production Coolify shows web app in applications list
- Environment variables match production-env.md checklist
- Webhook URL visible in app settings
- GitHub repository → Settings → Secrets shows COOLIFY_WEBHOOK_WEB_PROD
