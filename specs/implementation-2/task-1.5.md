# Task 1.5: Install Coolify on VM

**Type:** Manual
**Performer:** User
**Phase:** 1 - Local VM + CICD

---

## What

Install Coolify (self-hosted PaaS platform) on the local Ubuntu VM to manage Docker containers, databases, and deployments.

---

## Objective

Coolify provides:
- Container orchestration (Docker-based)
- Database provisioning (PostgreSQL, Redis)
- Application deployment from container registries
- Reverse proxy with SSL (Traefik)
- Web-based dashboard for management

This is the core platform that will manage all services and applications in both local and production environments.

---

## How to Do

SSH into the VM and run the official Coolify installation script. The installation takes approximately 5-10 minutes. After installation completes, access the Coolify dashboard from your host machine's browser. Complete the initial setup wizard to create an admin account and configure basic settings.

**Installation URL:** https://coolify.io/docs/installation

---

## Expected Results

**Success Criteria:**
- Coolify installed successfully on VM
- Coolify dashboard accessible at `http://<vm-ip>:8000`
- Admin account created
- Initial setup completed

**How to Verify:**
- Open browser on host machine
- Navigate to `http://<vm-ip>:8000`
- Should see Coolify login page
- Can log in with created admin credentials
- Dashboard shows "Welcome" or project overview page
