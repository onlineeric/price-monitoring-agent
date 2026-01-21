# Task 2.5: Install Coolify on Droplet

**Type:** Manual
**Performer:** User
**Phase:** 2 - Production Deployment

---

## What

Install Coolify on the production Droplet using the official installation script.

---

## Objective

Install Coolify to provide the container orchestration platform used for production deployment. This enables:
- Container management
- Database provisioning
- Application deployment
- SSL/HTTPS with Let's Encrypt
- Reverse proxy (Traefik)

Installation process is identical to task 1.5, but on production server.

---

## How to Do

While SSH'd into the Droplet, run the Coolify installation script. The installation takes approximately 5-10 minutes and will install Docker, Coolify, and all dependencies. After installation, access the Coolify dashboard from your browser using the Droplet IP. Complete the initial setup wizard to create an admin account.

**Installation URL:** https://coolify.io/docs/installation

**Dashboard Access:** `http://<droplet-ip>:8000`

---

## Expected Results

**Success Criteria:**
- Coolify installed successfully on Droplet
- Installation completed without errors
- Coolify dashboard accessible at `http://<droplet-ip>:8000`
- Admin account created during setup
- Coolify credentials documented securely
- Dashboard loads and shows project overview

**How to Verify:**
- Open browser on local machine
- Navigate to `http://<droplet-ip>:8000`
- See Coolify login or setup page
- Can log in with created admin credentials
- Dashboard shows welcome or empty project state
