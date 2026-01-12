# Implementation 2 - Task Overview

## Document overview

This document provides a technical implementation plan for migrating Price Monitoring Agent from serverless/SaaS infrastructure to a self-hosted Micro-PaaS architecture. It breaks down the implementation into two phases with actionable tasks.

**Cautions:** This document is an overview technical implementation plan document. Do NOT put technical details in this document.

## Quick Links
- [Architecture Old](specs\implementation-2\architecture-old.md) - overview of the old architecture (implementation 1)
- [Architecture Change](specs\implementation-2\architecture-change.md) - overview of the architecture change plan
- **Detailed task specifications**: multiple files named `specs/implementation-2/task-X.Y.md` files
    - Example: `task-1.1.md` = Phase 1, Task 1; `task-2.5.md` = Phase 2, Task 5

## Implementation Plan
- We are using **Spec-Driven Development** (Write Spec → Generate Code → Review & Refine) to implement the project.
- Spec documents are the source of truth for the implementation.
- For any updates to the implementation plan, update the spec documents first.

---

## Implementation Summary

| Phase | Name | Focus | Manual Tasks | AI Tasks | Total |
|-------|------|-------|--------------|----------|-------|
| 1 | Local VM + CICD | Setup local infrastructure, build pipeline, remove old code | 15 | 9 | 25 |
| 2 | Production Deployment | DigitalOcean setup, auto-deploy configuration | 13 | 4 | 18 |

**Total Estimated Tasks:** 43

---

## Phase 1: Local VM + CICD

### Goal
Set up local VPS simulation, build CICD pipeline with GHCR, implement BullMQ Repeatable Jobs, remove old serverless code, and validate deployment on local VM.

### Prerequisites
- Windows machine with Hyper-V or VirtualBox support
- Admin access to install Multipass
- GitHub repository with Actions enabled
- Stable internet connection

---

### Manual Tasks (Infrastructure Setup)

#### task-1.1: Create Dev Branch
**Type:** Manual
**Performer:** User

- Create `dev` branch from `main` branch
- Push `dev` branch to GitHub
- Verify branch appears in GitHub repository
- Document branching strategy

**Acceptance Criteria:**
- [ ] `dev` branch created and pushed to GitHub
- [ ] Branch visible in GitHub repository

---

#### task-1.2: Install Multipass
**Type:** Manual
**Performer:** User

- Download Multipass installer for Windows
- Run installer with admin privileges
- Verify installation: `multipass version`
- Document installation path and version

**Acceptance Criteria:**
- [ ] Multipass installed successfully
- [ ] Command `multipass version` returns version number

---

#### task-1.3: Create Ubuntu VM
**Type:** Manual
**Performer:** User

- Create Ubuntu 22.04 LTS VM with 4GB RAM, 2 CPUs, 20GB disk
- Command: `multipass launch 22.04 --name coolify-local --cpus 2 --memory 4G --disk 20G`
- Verify VM is running: `multipass list`
- Document VM name and status

**Acceptance Criteria:**
- [ ] VM created with specified resources
- [ ] VM status shows "Running"

---

#### task-1.4: Configure VM Networking
**Type:** Manual
**Performer:** User

- Get VM IP address: `multipass info coolify-local`
- Test connectivity: `ping <vm-ip>`
- Document VM IP address for use in later tasks
- Verify SSH access: `multipass shell coolify-local`

**Acceptance Criteria:**
- [ ] VM IP address documented
- [ ] Ping successful from host machine
- [ ] SSH access verified

---

#### task-1.5: Install Coolify on VM
**Type:** Manual
**Performer:** User

- SSH into VM: `multipass shell coolify-local`
- Run Coolify installation script:
  ```bash
  curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
  ```
- Wait for installation to complete (~5-10 minutes)
- Access Coolify dashboard from host: `http://<vm-ip>:8000`
- Complete initial setup (create admin account)
- Document Coolify admin credentials

**Acceptance Criteria:**
- [ ] Coolify installed successfully
- [ ] Dashboard accessible at `http://<vm-ip>:8000`
- [ ] Admin account created
- [ ] Credentials documented securely

---

#### task-1.6: Create PostgreSQL Container
**Type:** Manual
**Performer:** User

- Open Coolify dashboard
- Navigate to "Databases" → "Add Database"
- Select "PostgreSQL 15"
- Configure:
  - Name: `price-monitor-postgres`
  - Database: `priceMonitor`
  - Username: `postgres`
  - Password: (generate strong password)
  - Port: `5432` (exposed to VM network)
- Create persistent volume
- Start container
- Verify container status is "Running"
- Document connection string: `postgresql://postgres:<password>@<vm-ip>:5432/priceMonitor`

**Acceptance Criteria:**
- [ ] PostgreSQL container created
- [ ] Container status: Running
- [ ] Port 5432 exposed
- [ ] Connection string documented

---

#### task-1.7: Create Redis Container
**Type:** Manual
**Performer:** User

- Open Coolify dashboard
- Navigate to "Databases" → "Add Database"
- Select "Redis 7"
- Configure:
  - Name: `price-monitor-redis`
  - Port: `6379` (exposed to VM network)
- Create persistent volume
- Start container
- Verify container status is "Running"
- Document connection string: `redis://<vm-ip>:6379`

**Acceptance Criteria:**
- [ ] Redis container created
- [ ] Container status: Running
- [ ] Port 6379 exposed
- [ ] Connection string documented

---

#### task-1.8: Test Database Connectivity
**Type:** Manual
**Performer:** User

- Update `.env` file with VM connection strings:
  ```
  DATABASE_URL="postgresql://postgres:<password>@<vm-ip>:5432/priceMonitor"
  REDIS_URL="redis://<vm-ip>:6379"
  ```
- Test PostgreSQL: `pnpm --filter @price-monitor/db push`
- Verify schema created in database
- Test Redis connection (use redis-cli or connection test script)
- Document successful connections

**Acceptance Criteria:**
- [ ] `.env` updated with VM URLs
- [ ] Database schema pushed successfully
- [ ] Redis connection verified
- [ ] No connection errors

---

#### task-1.9: Create GitHub Personal Access Token (PAT)
**Type:** Manual
**Performer:** User

- Navigate to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
- Click "Generate new token (classic)"
- Configure token:
  - Name: `Coolify GHCR Access`
  - Scopes: `write:packages`, `read:packages`, `delete:packages`
- Generate token
- Copy token immediately (only shown once)
- Document token in secure location (password manager)

**Acceptance Criteria:**
- [ ] PAT created with correct scopes
- [ ] Token copied and stored securely

---

#### task-1.10: Configure GHCR Access in Coolify
**Type:** Manual
**Performer:** User

- Open Coolify dashboard
- Navigate to "Settings" → "Registries"
- Add new registry:
  - Type: GitHub Container Registry (GHCR)
  - URL: `ghcr.io`
  - Username: (your GitHub username)
  - Password: (PAT from task-1.9)
- Test connection
- Document registry configuration

**Acceptance Criteria:**
- [ ] GHCR registry added to Coolify
- [ ] Connection test successful
- [ ] Registry configuration documented

---

### AI Tasks (Code Generation)

**Instructions for User:** Once you complete tasks 1.1-1.10, you can run all AI tasks (1.11-1.19) in one session. Tell Claude: "Please complete tasks 1.11 through 1.19."

---

#### task-1.11: Create Web App Dockerfile
**Type:** AI Generation
**Performer:** AI

- Create `apps/web/Dockerfile` for Next.js standalone build
- Use multi-stage build for optimization
- Configure for production deployment
- Create `apps/web/.dockerignore`
- Document build and run commands in comments

**Deliverables:**
- `apps/web/Dockerfile`
- `apps/web/.dockerignore`

**Acceptance Criteria:**
- [ ] Dockerfile uses Next.js standalone output
- [ ] Multi-stage build implemented
- [ ] Image size optimized
- [ ] Build commands documented

---

#### task-1.12: Update Worker Dockerfile
**Type:** AI Generation
**Performer:** AI

- Review existing `apps/worker/Dockerfile`
- Verify compatibility with Coolify deployment
- Ensure Playwright browsers properly installed
- Update if needed for GHCR deployment
- Document any changes

**Deliverables:**
- Updated `apps/worker/Dockerfile` (if needed)

**Acceptance Criteria:**
- [ ] Dockerfile compatible with Coolify
- [ ] Playwright browsers work in container
- [ ] No breaking changes

---

#### task-1.13: Create GitHub Actions Workflow
**Type:** AI Generation
**Performer:** AI

- Create/update `.github/workflows/build-and-push.yml`
- Configure triggers:
  - `main` branch → build `:latest` tags
  - `dev` branch → build `:dev` tags
- Build both `web` and `worker` images
- Push images to GHCR
- Add path filters to avoid unnecessary builds
- Document workflow in comments

**Deliverables:**
- `.github/workflows/build-and-push.yml`

**Acceptance Criteria:**
- [ ] Workflow triggers on main and dev branches
- [ ] Builds both web and worker images
- [ ] Correct image tagging (`:latest` vs `:dev`)
- [ ] Pushes to GHCR successfully
- [ ] Path filters configured

---

#### task-1.14: Remove Old Vercel Cron Endpoint
**Type:** AI Generation
**Performer:** AI

- Delete `/api/cron/check-all` route file
- Remove Vercel Cron configuration (if exists in `vercel.json`)
- Remove any related imports or dependencies
- Update documentation to reflect removal

**Deliverables:**
- Deleted files
- Updated documentation

**Acceptance Criteria:**
- [ ] `/api/cron/check-all` endpoint removed
- [ ] Vercel cron config removed
- [ ] No broken imports or references
- [ ] Documentation updated

---

#### task-1.15: Implement BullMQ Repeatable Jobs
**Type:** AI Generation
**Performer:** AI

- Modify worker to read email schedule settings from database on startup
- Register BullMQ repeatable job with cron pattern from settings
- Implement schedule update mechanism:
  - Poll database every 5 minutes for schedule changes
  - Update repeatable job if settings changed
- Ensure single scheduler instance (add flag to prevent duplicates)
- Add logging for schedule changes
- Document the implementation

**Deliverables:**
- Updated worker code with BullMQ Repeatable Jobs
- Schedule polling mechanism
- Documentation

**Acceptance Criteria:**
- [ ] Worker reads schedule from DB on startup
- [ ] BullMQ repeatable job registered correctly
- [ ] Schedule changes detected and applied
- [ ] Single scheduler instance enforced
- [ ] Comprehensive logging added

---

#### task-1.16: Update Environment Documentation
**Type:** AI Generation
**Performer:** AI

- Update `.env.example` with local VM patterns:
  ```
  # Local VM Services
  DATABASE_URL="postgresql://postgres:password@<vm-ip>:5432/priceMonitor"
  REDIS_URL="redis://<vm-ip>:6379"
  ```
- Add comments explaining local vs production setup
- Update CLAUDE.md with new development workflow
- Document environment variable differences

**Deliverables:**
- Updated `.env.example`
- Updated `CLAUDE.md`

**Acceptance Criteria:**
- [ ] `.env.example` includes VM patterns
- [ ] Clear comments for local vs production
- [ ] CLAUDE.md updated with new workflow
- [ ] All environment variables documented

---

#### task-1.17: Create CLI Redeploy Script
**Type:** AI Generation
**Performer:** AI

- Create `scripts/redeploy-local.js` (or .sh)
- Script should call Coolify API to trigger redeploy for web and worker
- Add script to package.json:
  ```json
  "scripts": {
    "redeploy:local": "node scripts/redeploy-local.js"
  }
  ```
- Accept Coolify API token as environment variable
- Show deployment status in console
- Document usage in script comments

**Deliverables:**
- `scripts/redeploy-local.js`
- Updated `package.json`

**Acceptance Criteria:**
- [ ] Script calls Coolify API correctly
- [ ] Triggers redeploy for both web and worker
- [ ] Shows clear console output
- [ ] Accepts API token from env var
- [ ] Usage documented

---

#### task-1.18: Remove Old Deployment Configs
**Type:** AI Generation
**Performer:** AI

- Remove Vercel-specific configurations (`vercel.json` if exists)
- Remove Render.com webhook configurations
- Clean up any old deployment scripts
- Remove references to old deployment platforms from docs
- Keep Docker-related files (needed for new deployment)

**Deliverables:**
- Deleted old config files
- Cleaned documentation

**Acceptance Criteria:**
- [ ] Vercel configs removed
- [ ] Render configs removed
- [ ] Docker files preserved
- [ ] Documentation cleaned up

---

#### task-1.19: Update Project Documentation
**Type:** AI Generation
**Performer:** AI

- Update `README.md` with new architecture overview
- Update `CLAUDE.md` with:
  - New deployment workflow
  - Local VM development setup
  - CLI redeploy script usage
- Update commands section for new workflow
- Remove references to old infrastructure

**Deliverables:**
- Updated `README.md`
- Updated `CLAUDE.md`

**Acceptance Criteria:**
- [ ] README reflects new architecture
- [ ] CLAUDE.md has complete new workflow
- [ ] All commands updated
- [ ] Old infrastructure references removed

---

### Manual Task (Verification)

#### task-1.20: Verify Code and Commit
**Type:** Manual
**Performer:** User

- Review all code changes from AI tasks 1.11-1.19
- Run linting: `pnpm lint`
- Fix any lint errors
- Build both applications:
  - `pnpm --filter @price-monitor/web build`
  - `pnpm --filter @price-monitor/worker build`
- Fix any build errors
- Test locally with `pnpm dev` to ensure no breaking changes
- Commit all changes to `dev` branch:
  ```bash
  git add .
  git commit -m "[task-1.11-1.19] implement local VM CICD, remove old serverless code"
  git push origin dev
  ```
- Verify GitHub Actions workflow runs successfully

**Acceptance Criteria:**
- [ ] All lint errors fixed
- [ ] Both apps build successfully
- [ ] Local dev still works
- [ ] Code committed to dev branch
- [ ] GitHub Actions builds :dev images successfully

---

### Manual Tasks (Local Deployment)

#### task-1.21: Configure Web App in Coolify
**Type:** Manual
**Performer:** User

- Open Coolify dashboard
- Navigate to "Applications" → "Add Application"
- Select "Docker Image"
- Configure:
  - Name: `price-monitor-web`
  - Image: `ghcr.io/<username>/<repo>/web:dev`
  - Port: `3000`
  - Environment variables:
    - `DATABASE_URL`
    - `REDIS_URL`
    - `AI_PROVIDER`
    - `ANTHROPIC_API_KEY` (and other AI keys)
    - `RESEND_API_KEY`
    - `NODE_ENV=production`
- Configure reverse proxy (Coolify auto-generates)
- Save configuration (don't deploy yet)

**Acceptance Criteria:**
- [ ] Web app configured in Coolify
- [ ] All environment variables set
- [ ] Reverse proxy configured
- [ ] Configuration saved

---

#### task-1.22: Configure Worker App in Coolify
**Type:** Manual
**Performer:** User

- Open Coolify dashboard
- Navigate to "Applications" → "Add Application"
- Select "Docker Image"
- Configure:
  - Name: `price-monitor-worker`
  - Image: `ghcr.io/<username>/<repo>/worker:dev`
  - Environment variables (same as web):
    - `DATABASE_URL`
    - `REDIS_URL`
    - `AI_PROVIDER`
    - `ANTHROPIC_API_KEY`
    - `RESEND_API_KEY`
    - `NODE_ENV=production`
- No port mapping needed (background worker)
- Save configuration (don't deploy yet)

**Acceptance Criteria:**
- [ ] Worker app configured in Coolify
- [ ] All environment variables set
- [ ] Configuration saved

---

#### task-1.23: Deploy Both Apps to Local VM
**Type:** Manual
**Performer:** User

- Deploy web app:
  - Click "Deploy" on `price-monitor-web`
  - Wait for deployment to complete
  - Verify status: "Running"
  - Access web UI via Coolify-generated URL
- Deploy worker app:
  - Click "Deploy" on `price-monitor-worker`
  - Wait for deployment to complete
  - Verify status: "Running"
  - Check logs for successful startup
- Verify both containers running: check Coolify dashboard

**Acceptance Criteria:**
- [ ] Web app deployed and running
- [ ] Web UI accessible via URL
- [ ] Worker deployed and running
- [ ] No errors in logs

---

#### task-1.24: Test CLI Redeploy Script
**Type:** Manual
**Performer:** User

- Get Coolify API token from dashboard (Settings → API Tokens)
- Set environment variable: `COOLIFY_API_TOKEN=<token>`
- Run redeploy script: `pnpm redeploy:local`
- Verify script output shows redeployment triggered
- Check Coolify dashboard for redeployment progress
- Verify both apps redeploy successfully

**Acceptance Criteria:**
- [ ] CLI script runs without errors
- [ ] Both apps redeploy successfully
- [ ] Console output clear and helpful

---

#### task-1.25: End-to-End Testing
**Type:** Manual
**Performer:** User

Test complete flow in containerized environment:

1. **UI Access:**
   - Open web UI in browser
   - Verify dashboard loads

2. **Add Product:**
   - Add new product via UI
   - Use test URL (e.g., Amazon product)

3. **Manual Price Check:**
   - Click manual trigger button
   - Verify job enqueued

4. **Worker Processing:**
   - Check worker logs in Coolify
   - Verify job processed
   - Verify price extracted

5. **Database Verification:**
   - Check PostgreSQL for price record
   - Use Coolify database viewer or CLI

6. **Scheduled Digest:**
   - Update email schedule settings in UI
   - Wait for scheduled time (or trigger manually)
   - Verify digest email sent

7. **BullMQ Repeatable Jobs:**
   - Check worker logs for schedule registration
   - Verify cron pattern logged
   - Test schedule update (change settings, wait for poll)

Document any issues or differences from hybrid dev environment.

**Acceptance Criteria:**
- [ ] Web UI accessible and functional
- [ ] Product addition works
- [ ] Manual price check works
- [ ] Worker processes jobs successfully
- [ ] Price records saved to database
- [ ] Scheduled digest works
- [ ] BullMQ Repeatable Jobs working correctly
- [ ] No regressions from hybrid dev environment

---

## Phase 1 Completion Checklist

- [ ] All manual infrastructure tasks completed (1.1-1.10)
- [ ] All AI code generation tasks completed (1.11-1.19)
- [ ] Code verified, built, and committed (1.20)
- [ ] Apps deployed to local VM (1.21-1.23)
- [ ] CLI redeploy script tested (1.24)
- [ ] End-to-end testing passed (1.25)
- [ ] Local VM environment fully functional

---

## Phase 2: Production Deployment

### Goal
Provision DigitalOcean Droplet, replicate local setup, deploy production images, and configure auto-deployment.

### Prerequisites
- Phase 1 completed (local VM working)
- DigitalOcean account
- Credit card for Droplet billing
- GitHub repository with working CICD

---

### Manual Tasks (DigitalOcean Setup)

#### task-2.1: Create DigitalOcean Account
**Type:** Manual
**Performer:** User

- Navigate to https://www.digitalocean.com
- Sign up for new account (or log in to existing)
- Complete account verification
- Add payment method (credit card)
- Document account email and credentials

**Acceptance Criteria:**
- [ ] Account created and verified
- [ ] Payment method added
- [ ] Account credentials documented

---

#### task-2.2: Create Droplet in Sydney
**Type:** Manual
**Performer:** User

- Navigate to "Create" → "Droplets"
- Configure Droplet:
  - **Region:** Sydney (SYD1)
  - **Image:** Ubuntu 22.04 LTS
  - **Plan:** Basic
  - **CPU:** Regular (2 vCPUs, 4 GB RAM)
  - **Storage:** 80 GB SSD
- Add SSH key (create new or use existing)
- Choose hostname: `price-monitor-prod`
- Create Droplet
- Wait for provisioning (~1-2 minutes)
- Document Droplet IP address

**Acceptance Criteria:**
- [ ] Droplet created in Sydney region
- [ ] Droplet running (green status)
- [ ] IP address documented
- [ ] SSH key configured

---

#### task-2.3: Configure Droplet Firewall
**Type:** Manual
**Performer:** User

- Navigate to Droplet → "Networking" → "Firewalls"
- Create new firewall:
  - Name: `price-monitor-firewall`
  - **Inbound Rules:**
    - SSH (22) - Your IP only
    - HTTP (80) - All sources
    - HTTPS (443) - All sources
  - **Outbound Rules:**
    - All protocols - All destinations
- Apply firewall to Droplet
- Verify firewall active

**Acceptance Criteria:**
- [ ] Firewall created
- [ ] Correct inbound rules (22, 80, 443)
- [ ] Firewall applied to Droplet
- [ ] Firewall status: Active

---

#### task-2.4: SSH into Droplet
**Type:** Manual
**Performer:** User

- Get Droplet IP from dashboard
- SSH into Droplet:
  ```bash
  ssh root@<droplet-ip>
  ```
- Accept SSH fingerprint
- Verify successful login
- Update system packages:
  ```bash
  apt update && apt upgrade -y
  ```
- Document successful access

**Acceptance Criteria:**
- [ ] SSH connection successful
- [ ] System packages updated
- [ ] Root access confirmed

---

#### task-2.5: Install Coolify on Droplet
**Type:** Manual
**Performer:** User

- Run Coolify installation script:
  ```bash
  curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
  ```
- Wait for installation (~5-10 minutes)
- Access Coolify dashboard: `http://<droplet-ip>:8000`
- Complete initial setup:
  - Create admin account
  - Configure email (optional)
  - Set timezone
- Document Coolify admin credentials
- Enable HTTPS for Coolify dashboard (optional, if domain available)

**Acceptance Criteria:**
- [ ] Coolify installed successfully
- [ ] Dashboard accessible
- [ ] Admin account created
- [ ] Credentials documented securely

---

#### task-2.6: Create PostgreSQL Container on Droplet
**Type:** Manual
**Performer:** User

- Open Coolify dashboard
- Navigate to "Databases" → "Add Database"
- Select "PostgreSQL 15"
- Configure:
  - Name: `price-monitor-postgres-prod`
  - Database: `priceMonitor`
  - Username: `postgres`
  - Password: (generate strong password)
  - Port: `5432` (internal only, not exposed to public)
- Create persistent volume
- Start container
- Verify container running
- Document internal connection string

**Acceptance Criteria:**
- [ ] PostgreSQL container created
- [ ] Container status: Running
- [ ] Persistent volume configured
- [ ] Connection string documented

---

#### task-2.7: Create Redis Container on Droplet
**Type:** Manual
**Performer:** User

- Open Coolify dashboard
- Navigate to "Databases" → "Add Database"
- Select "Redis 7"
- Configure:
  - Name: `price-monitor-redis-prod`
  - Port: `6379` (internal only)
- Create persistent volume
- Start container
- Verify container running
- Document internal connection string

**Acceptance Criteria:**
- [ ] Redis container created
- [ ] Container status: Running
- [ ] Persistent volume configured
- [ ] Connection string documented

---

#### task-2.8: Test Database Connectivity on Droplet
**Type:** Manual
**Performer:** User

- Get internal container URLs from Coolify
- Test PostgreSQL connection from Droplet shell:
  ```bash
  docker exec -it <postgres-container-id> psql -U postgres -d priceMonitor
  ```
- Test Redis connection:
  ```bash
  docker exec -it <redis-container-id> redis-cli ping
  ```
- Verify both return successful responses
- Document connection test results

**Acceptance Criteria:**
- [ ] PostgreSQL connection successful
- [ ] Redis connection successful
- [ ] Internal URLs documented

---

### AI Tasks (Production CICD)

**Instructions for User:** Once you complete tasks 2.1-2.8, you can run all AI tasks (2.9-2.12) in one session. Tell Claude: "Please complete tasks 2.9 through 2.12."

---

#### task-2.9: Update GitHub Actions for Production Webhook
**Type:** AI Generation
**Performer:** AI

- Update `.github/workflows/build-and-push.yml`
- Add webhook trigger step for `main` branch:
  - Get Coolify webhook URLs (user will provide)
  - Call webhooks after successful image push
  - Trigger redeploy for web and worker
- Add GitHub Secrets placeholders in comments:
  - `COOLIFY_WEBHOOK_WEB_PROD`
  - `COOLIFY_WEBHOOK_WORKER_PROD`
- Document webhook configuration

**Deliverables:**
- Updated `.github/workflows/build-and-push.yml`

**Acceptance Criteria:**
- [ ] Webhook step added for main branch only
- [ ] Calls both web and worker webhooks
- [ ] Uses GitHub Secrets for webhook URLs
- [ ] Well-documented in workflow file

---

#### task-2.10: Update Documentation for Production
**Type:** AI Generation
**Performer:** AI

- Update `CLAUDE.md`:
  - Add production deployment section
  - Document production vs local environment differences
  - Add troubleshooting guide
- Update `README.md`:
  - Add production architecture diagram
  - Document deployment flow
  - Add production URL (placeholder)

**Deliverables:**
- Updated `CLAUDE.md`
- Updated `README.md`

**Acceptance Criteria:**
- [ ] Production deployment documented
- [ ] Environment differences clear
- [ ] Troubleshooting guide added
- [ ] Architecture diagram updated

---

#### task-2.11: Document Production Environment Variables
**Type:** AI Generation
**Performer:** AI

- Create `docs/production-env.md` with all required environment variables
- Include examples and descriptions
- Document where to set each variable (Coolify)
- Add security notes for sensitive values
- Create production environment checklist

**Deliverables:**
- `docs/production-env.md`

**Acceptance Criteria:**
- [ ] All env vars documented
- [ ] Clear examples provided
- [ ] Security notes included
- [ ] Checklist format for easy verification

---

#### task-2.12: Final Configuration Updates
**Type:** AI Generation
**Performer:** AI

- Review all configuration files for production readiness
- Update any hardcoded localhost references
- Ensure error handling for production
- Add production-specific logging
- Document any final changes

**Deliverables:**
- Updated configuration files
- Documentation of changes

**Acceptance Criteria:**
- [ ] No localhost hardcoding
- [ ] Production error handling added
- [ ] Logging configured for production
- [ ] All changes documented

---

### Manual Task (Verification)

#### task-2.13: Verify Code and Commit
**Type:** Manual
**Performer:** User

- Review all code changes from AI tasks 2.9-2.12
- Run linting: `pnpm lint`
- Fix any lint errors
- Build both applications:
  - `pnpm --filter @price-monitor/web build`
  - `pnpm --filter @price-monitor/worker build`
- Fix any build errors
- Commit changes to `dev` branch:
  ```bash
  git add .
  git commit -m "[task-2.9-2.12] add production CICD and documentation"
  git push origin dev
  ```
- Create PR from `dev` to `main`
- Review PR carefully
- Merge to `main`
- Verify GitHub Actions builds `:latest` images

**Acceptance Criteria:**
- [ ] All lint errors fixed
- [ ] Both apps build successfully
- [ ] Code committed to dev branch
- [ ] PR created and reviewed
- [ ] Merged to main
- [ ] GitHub Actions builds :latest images successfully

---

### Manual Tasks (Production Deployment)

#### task-2.14: Configure Web App in Production Coolify
**Type:** Manual
**Performer:** User

- Open production Coolify dashboard
- Navigate to "Applications" → "Add Application"
- Select "Docker Image"
- Configure:
  - Name: `price-monitor-web-prod`
  - Image: `ghcr.io/<username>/<repo>/web:latest`
  - Port: `3000`
  - Environment variables (from task-2.11 documentation):
    - `DATABASE_URL` (use internal Coolify URL)
    - `REDIS_URL` (use internal Coolify URL)
    - `AI_PROVIDER`
    - `ANTHROPIC_API_KEY`
    - `RESEND_API_KEY`
    - `NODE_ENV=production`
- Configure domain (if available) or use Coolify-generated URL
- Enable automatic SSL (if domain configured)
- Get webhook URL from Coolify
- Save webhook URL as GitHub Secret: `COOLIFY_WEBHOOK_WEB_PROD`
- Save configuration (don't deploy yet)

**Acceptance Criteria:**
- [ ] Web app configured
- [ ] All environment variables set correctly
- [ ] Domain/URL configured
- [ ] Webhook URL saved to GitHub Secrets
- [ ] Configuration saved

---

#### task-2.15: Configure Worker App in Production Coolify
**Type:** Manual
**Performer:** User

- Open production Coolify dashboard
- Navigate to "Applications" → "Add Application"
- Select "Docker Image"
- Configure:
  - Name: `price-monitor-worker-prod`
  - Image: `ghcr.io/<username>/<repo>/worker:latest`
  - Environment variables (same as web):
    - `DATABASE_URL`
    - `REDIS_URL`
    - `AI_PROVIDER`
    - `ANTHROPIC_API_KEY`
    - `RESEND_API_KEY`
    - `NODE_ENV=production`
- No port mapping (background worker)
- Get webhook URL from Coolify
- Save webhook URL as GitHub Secret: `COOLIFY_WEBHOOK_WORKER_PROD`
- Save configuration (don't deploy yet)

**Acceptance Criteria:**
- [ ] Worker app configured
- [ ] All environment variables set correctly
- [ ] Webhook URL saved to GitHub Secrets
- [ ] Configuration saved

---

#### task-2.16: Deploy to Production
**Type:** Manual
**Performer:** User

- Deploy web app:
  - Click "Deploy" on `price-monitor-web-prod`
  - Wait for deployment (~2-5 minutes)
  - Check deployment logs for errors
  - Verify status: "Running"
  - Access web UI via production URL
- Deploy worker app:
  - Click "Deploy" on `price-monitor-worker-prod`
  - Wait for deployment
  - Check deployment logs
  - Verify status: "Running"
- Run database migrations if needed:
  - `pnpm --filter @price-monitor/db push` (point to production DB)
- Verify both containers running in Coolify dashboard

**Acceptance Criteria:**
- [ ] Web app deployed and running
- [ ] Worker deployed and running
- [ ] No errors in deployment logs
- [ ] Database schema up to date
- [ ] Production URL accessible

---

#### task-2.17: Test Auto-Deployment
**Type:** Manual
**Performer:** User

- Make small test change to README.md
- Commit and push to `main` branch:
  ```bash
  git add README.md
  git commit -m "test: verify auto-deployment"
  git push origin main
  ```
- Watch GitHub Actions workflow:
  - Verify images build
  - Verify images push to GHCR
  - Verify webhooks called
- Check Coolify dashboard:
  - Verify web app redeployment triggered
  - Verify worker redeployment triggered
  - Wait for deployments to complete
- Verify both apps running with new version
- Revert test change if desired

**Acceptance Criteria:**
- [ ] GitHub Actions workflow completes successfully
- [ ] Webhooks triggered
- [ ] Both apps redeploy automatically
- [ ] New version running in production
- [ ] Auto-deployment working as expected

---

#### task-2.18: End-to-End Production Testing
**Type:** Manual
**Performer:** User

Test complete production flow:

1. **UI Access:**
   - Open production URL
   - Verify HTTPS (if domain configured)
   - Verify dashboard loads

2. **Add Product:**
   - Add new product via production UI
   - Use real e-commerce URL

3. **Manual Price Check:**
   - Trigger manual price check
   - Verify job enqueued

4. **Worker Processing:**
   - Check worker logs in production Coolify
   - Verify job processed successfully
   - Verify price extracted

5. **Database Verification:**
   - Check production PostgreSQL for price record
   - Use Coolify database viewer

6. **Email Functionality:**
   - Configure email schedule
   - Trigger manual digest
   - Verify email sent successfully

7. **BullMQ Repeatable Jobs:**
   - Check worker logs for schedule registration
   - Verify scheduled job runs
   - Update schedule and verify changes applied

8. **Performance Testing:**
   - Test with multiple products
   - Monitor resource usage in Coolify
   - Verify no memory leaks

9. **Error Handling:**
   - Test with invalid URL
   - Verify graceful error handling
   - Check error logs

Document all test results, issues found, and resolutions.

**Acceptance Criteria:**
- [ ] Production URL accessible
- [ ] SSL working (if configured)
- [ ] Product addition works
- [ ] Price extraction works
- [ ] Worker processes jobs
- [ ] Database records saved
- [ ] Email sending works
- [ ] Scheduled jobs execute
- [ ] Performance acceptable
- [ ] Error handling works
- [ ] No critical issues found

---

## Phase 2 Completion Checklist

- [ ] DigitalOcean account created (2.1)
- [ ] Droplet provisioned (2.2)
- [ ] Firewall configured (2.3)
- [ ] SSH access verified (2.4)
- [ ] Coolify installed on Droplet (2.5)
- [ ] PostgreSQL container created (2.6)
- [ ] Redis container created (2.7)
- [ ] Database connectivity tested (2.8)
- [ ] Production CICD implemented (2.9-2.12)
- [ ] Code verified and merged to main (2.13)
- [ ] Production apps configured (2.14-2.15)
- [ ] Production deployment successful (2.16)
- [ ] Auto-deployment tested (2.17)
- [ ] End-to-end testing passed (2.18)

---

## Task Naming Convention

Each task has a detailed spec document:

```
task-P.N.md
```

Where:
- `P` = Phase number (1 or 2)
- `N` = Task number within phase

**Examples:**
- `task-1.1.md` - Phase 1, Task 1 (Create Dev Branch)
- `task-1.15.md` - Phase 1, Task 15 (Implement BullMQ Repeatable Jobs)
- `task-2.9.md` - Phase 2, Task 9 (Update GitHub Actions)

---

## Implementation Strategy

### Task Type Legend
- **Manual**: Performed by user (infrastructure, deployment, verification)
- **AI Generation**: Performed by AI (code, configs, documentation)

### Execution Flow

**Phase 1:**
1. Complete manual tasks 1.1-1.10 (infrastructure setup)
2. Run AI tasks 1.11-1.19 in one session (code generation)
3. Complete manual task 1.20 (verify and commit)
4. Complete manual tasks 1.21-1.25 (deployment and testing)

**Phase 2:**
1. Complete manual tasks 2.1-2.8 (production infrastructure)
2. Run AI tasks 2.9-2.12 in one session (production CICD)
3. Complete manual task 2.13 (verify and commit)
4. Complete manual tasks 2.14-2.18 (production deployment and testing)

### Key Principles
- Manual tasks are granular (one action per task)
- AI tasks are grouped for efficient execution
- Each phase ends with comprehensive testing
- Git commits happen after AI tasks complete
- Documentation updated throughout

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Multipass networking issues on Windows | High | Document troubleshooting, fallback to WSL2 or native Linux |
| GHCR authentication failures | Medium | Test with public images first, document PAT setup clearly |
| Coolify version compatibility | Medium | Pin Coolify version, document tested version |
| BullMQ scheduler conflicts | High | Implement single-instance locking pattern |
| Droplet resource constraints | Medium | Monitor usage in Phase 1, adjust specs before Phase 2 |
| Webhook delivery failures | Medium | Add retry logic, implement health checks |
| Production database migration | High | Test migrations on local VM first, backup before migration |

---

## Success Criteria

Implementation 2 is complete when:

- [ ] Local VM fully functional with containerized apps
- [ ] CICD pipeline builds and pushes to GHCR automatically
- [ ] BullMQ Repeatable Jobs implemented and working
- [ ] Old Vercel Cron code removed
- [ ] CLI redeploy script working for local environment
- [ ] Production Droplet running in Sydney
- [ ] Auto-deployment working on main branch
- [ ] All features working in production
- [ ] Documentation complete and accurate
- [ ] No regressions from Implementation 1
