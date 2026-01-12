# Implementation 2 - Task Overview

## Document overview

This document provides a technical implementation plan for migrating Price Monitoring Agent from serverless/SaaS infrastructure to a self-hosted Micro-PaaS architecture. It breaks down each phase into actionable tasks with dependencies and acceptance criteria.

**Cautions:** This document is an overview technical implementation plan document. Do NOT put technical details in this document.

## Quick Links
- [Architecture Old](specs\implementation-2\architecture-old.md) - overview of the old architecture
- [Architecture Change](specs\implementation-2\architecture-change.md) - overview of the architecture change plan
- **Detailed task specifications**: multiple files named `specs/implementation-2/task-X.md` files, where X = Task number
    - Example: `task-01.md` = Task 1, `task-03.md` = Task 3

---

## Implementation Summary

| Phase | Name | Focus | Est. Tasks |
|-------|------|-------|------------|
| 1 | Local Infrastructure Setup | Multipass + Coolify + Services | 3 |
| 2 | Hybrid Development Workflow | Local dev against VM services | 2 |
| 3 | CI/CD Pipeline Construction | Dockerfiles + GitHub Actions | 4 |
| 4 | Local Staging Verification | Full deployment test + Scheduling | 3 |
| 5 | Production Launch | DigitalOcean + Go Live | 3 |

**Total Estimated Tasks:** 15

---

## Phase 1: Local Infrastructure Setup

### Goal
Create a local VPS simulation using Multipass to safely test the Coolify-based architecture before spending money on cloud resources.

### Prerequisites
- Windows machine with Hyper-V or VirtualBox support
- Admin access to install Multipass
- Stable internet connection

### Tasks

#### Task 1.1: Install and Configure Multipass
- Install Multipass on Windows development machine
- Create Ubuntu 22.04 LTS VM with adequate resources (4GB RAM, 2 CPUs, 20GB disk)
- Configure network bridging for host-to-VM communication
- Document VM IP address and access method

#### Task 1.2: Install Coolify on Local VM
- SSH into Multipass VM
- Run Coolify installation script
- Complete initial Coolify setup (admin account, settings)
- Verify Coolify dashboard accessible from host browser
- Document Coolify access URL and credentials

#### Task 1.3: Provision Shared Services (PostgreSQL & Redis)
- Create PostgreSQL 15 container via Coolify
- Create Redis 7 container via Coolify
- Configure persistent volumes for both services
- Expose ports to VM network (5432, 6379)
- Test connectivity from host machine
- Document connection strings

### Phase 1 Acceptance Criteria
- [ ] Multipass VM running Ubuntu 22.04
- [ ] Coolify dashboard accessible at `http://<vm-ip>:8000`
- [ ] PostgreSQL container running and accessible from host
- [ ] Redis container running and accessible from host
- [ ] Connection strings documented for Phase 2

### Dependencies
- None (this is the foundation phase)

---

## Phase 2: Hybrid Development Workflow

### Goal
Enable local code development (`pnpm dev`) while connecting to the Dockerized PostgreSQL and Redis services running in the Multipass VM.

### Prerequisites
- Phase 1 completed
- PostgreSQL and Redis connection strings from Phase 1

### Tasks

#### Task 2.1: Configure Local Environment
- Update `.env` file with VM connection strings
- Update `.env.example` with placeholder patterns for VM setup
- Test database connection with `pnpm --filter @price-monitor/db push`
- Verify schema creates successfully in VM PostgreSQL

#### Task 2.2: Validate Development Workflow
- Run `pnpm --filter @price-monitor/web dev` (Next.js)
- Run `pnpm --filter @price-monitor/worker dev` (Worker)
- Test complete flow: Add product → Worker processes → Price saved
- Verify hot reload works for both web and worker
- Document the hybrid dev workflow

### Phase 2 Acceptance Criteria
- [ ] `.env` configured with VM service URLs
- [ ] Database schema pushed to VM PostgreSQL
- [ ] Web app runs locally with hot reload
- [ ] Worker runs locally and processes jobs
- [ ] Complete flow works: UI → API → Queue → Worker → DB

### Dependencies
- Phase 1 (Multipass VM with services running)

---

## Phase 3: CI/CD Pipeline Construction

### Goal
Create Docker images for both web and worker applications, and set up GitHub Actions to build and push images to GHCR on branch pushes.

### Prerequisites
- Phase 2 completed (verified apps work against VM services)
- GitHub repository with Actions enabled
- Understanding of existing worker Dockerfile

### Tasks

#### Task 3.1: Create Web App Dockerfile
- Create `apps/web/Dockerfile` using Next.js standalone output
- Create `apps/web/.dockerignore`
- Test local Docker build: `docker build -f apps/web/Dockerfile -t web:test .`
- Test container runs successfully with environment variables
- Document build and run commands

#### Task 3.2: Update Worker Dockerfile (if needed)
- Review existing `apps/worker/Dockerfile`
- Ensure compatibility with Coolify deployment
- Test local Docker build and run
- Verify Playwright browsers work in container

#### Task 3.3: Create GitHub Actions Workflow
- Create/update `.github/workflows/build-and-push.yml`
- Configure triggers for `main` and `dev` branches
- Build both `web` and `worker` images
- Tag strategy: `:latest` for main, `:dev` for dev branch
- Push to GHCR with proper authentication
- Add path filters to avoid unnecessary builds

#### Task 3.4: Create Dev Branch
- Create `dev` branch from `main`
- Push to GitHub to trigger initial `:dev` image build
- Verify images appear in GitHub Packages
- Document branching workflow

### Phase 3 Acceptance Criteria
- [ ] Web Dockerfile created and tested locally
- [ ] Worker Dockerfile verified working
- [ ] GitHub Actions workflow builds both images
- [ ] Push to `main` creates `:latest` tagged images
- [ ] Push to `dev` creates `:dev` tagged images
- [ ] Images visible in GitHub Packages (GHCR)
- [ ] `dev` branch created and pushed

### Dependencies
- Phase 2 (working development environment)
- GitHub repository access

---

## Phase 4: Local Staging Verification

### Goal
Deploy the containerized applications to Local Coolify, test the complete system, and implement BullMQ Repeatable Jobs for scheduling.

### Prerequisites
- Phase 3 completed (images in GHCR)
- GHCR images accessible (public or PAT configured)

### Tasks

#### Task 4.1: Configure Coolify to Pull from GHCR
- Add GitHub Container Registry credentials to Coolify (if private repo)
- Create "price-monitor-web" application in Coolify
  - Image: `ghcr.io/<username>/<repo>/web:dev`
  - Configure environment variables
  - Configure port mapping and reverse proxy
- Create "price-monitor-worker" application in Coolify
  - Image: `ghcr.io/<username>/<repo>/worker:dev`
  - Configure environment variables
- Deploy both applications
- Verify containers start and connect to services

#### Task 4.2: Implement BullMQ Repeatable Jobs
- Modify worker to read email schedule settings from DB on startup
- Register BullMQ repeatable job with cron pattern from settings
- Implement schedule update mechanism (poll or event-driven)
- Test scheduled job execution
- Ensure single scheduler instance (prevent duplicate jobs)

#### Task 4.3: End-to-End Testing
- Test complete user flow in containerized environment:
  - Add product via web UI
  - Verify worker processes job
  - Check price record in database
  - Verify scheduled digest works
  - Test email sending (if configured)
- Compare behavior with hybrid dev environment
- Document any differences or issues

### Phase 4 Acceptance Criteria
- [ ] Web container deployed and accessible via Coolify proxy
- [ ] Worker container deployed and processing jobs
- [ ] BullMQ Repeatable Jobs implemented and working
- [ ] Schedule settings from DB control job frequency
- [ ] Complete flow works in containerized environment
- [ ] No regressions from hybrid dev environment

### Dependencies
- Phase 3 (Docker images in GHCR)
- Phase 1 (Coolify and services running)

---

## Phase 5: Production Launch

### Goal
Provision DigitalOcean Droplet, replicate the local setup, deploy production images, and configure auto-deployment.

### Prerequisites
- Phase 4 completed (proven deployment process)
- DigitalOcean account
- Credit card for Droplet billing

### Tasks

#### Task 5.1: Provision DigitalOcean Droplet
- Create Droplet in Sydney (SYD1) region
- Spec: 4GB RAM / 2 vCPUs (Basic)
- Choose Ubuntu 22.04 LTS
- Add SSH key for access
- Configure firewall (80, 443, 22 only)
- Document Droplet IP address

#### Task 5.2: Install and Configure Production Coolify
- SSH into Droplet
- Run Coolify installation script
- Complete initial setup
- Replicate Local Coolify configuration:
  - PostgreSQL container with persistent volume
  - Redis container with persistent volume
  - Web application (`:latest` image)
  - Worker application (`:latest` image)
- Configure all environment variables
- Deploy applications

#### Task 5.3: Configure Auto-Deployment Webhook
- Get Coolify webhook URL for web application
- Get Coolify webhook URL for worker application
- Add webhook URLs to GitHub Secrets
- Update GitHub Actions to trigger webhooks on `main` branch
- Test auto-deployment: push change → image builds → Coolify deploys
- Document the deployment flow

### Phase 5 Acceptance Criteria
- [ ] DigitalOcean Droplet running in Sydney
- [ ] Coolify installed and configured
- [ ] PostgreSQL and Redis containers running
- [ ] Web and Worker containers deployed with `:latest` images
- [ ] Push to `main` triggers automatic deployment
- [ ] System accessible via Droplet IP
- [ ] All features working in production

### Dependencies
- Phase 4 (proven deployment process)
- DigitalOcean account and billing

---

## Task Naming Convention

Each task will have a detailed spec document following this pattern:

```
task-P.S.md
```

Where:
- `P` = Phase number (1-5)
- `S` = Step/Task number within phase

**Examples:**
- `task-1.1.md` - Install and Configure Multipass
- `task-3.3.md` - Create GitHub Actions Workflow
- `task-4.2.md` - Implement BullMQ Repeatable Jobs

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Multipass networking issues on Windows | High | Document troubleshooting, fallback to WSL2 |
| GHCR authentication failures | Medium | Test with public images first, document PAT setup |
| Coolify version compatibility | Medium | Pin Coolify version, document tested version |
| BullMQ scheduler conflicts | High | Implement single-instance locking pattern |
| Droplet resource constraints | Medium | Monitor usage, document scaling path |

---

## Open Questions

1. **Coolify webhook format:** Need to research exact webhook configuration for Coolify auto-deploy
2. **GHCR visibility:** Should images be public (simpler) or private (more secure)?
3. **BullMQ scheduler pattern:** Poll DB for changes vs event-driven updates?
4. **Health checks:** Should we add container health checks for Coolify?
5. **Logging:** How to aggregate logs from multiple containers in Coolify?

---

## Notes

- Each phase builds on the previous one - do not skip phases
- Local staging (Phase 4) is critical for catching issues before production
- The hybrid dev workflow (Phase 2) remains useful even after production launch
- Consider creating backup/restore procedures for production PostgreSQL data
