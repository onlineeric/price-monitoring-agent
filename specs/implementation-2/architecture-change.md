# Price Monitoring Agent - Architecture Changes

## Document overview
This document provides an overview of the architecture changes for our Price Monitor AI Agent (implementation 2), from the old architecture to the new architecture.

**Cautions:** This document is an overview document. Do NOT put technical details in this document.

## Quick Links
- [Architecture Old](specs\implementation-2\architecture-old.md) - overview of the old architecture (implementation 1)
- [Task Overview](specs\implementation-2\task-overview.md) - overview of the implementation change tasks, don't put technical details in this document.
- **Detailed task specifications**: multiple files named `specs/implementation-2/task-X.Y.md` files
    - Example: `task-1.1.md` = Phase 1, Task 1; `task-2.5.md` = Phase 2, Task 5

## Implementation Plan for Implementation 2
- We are using **Spec-Driven Development** (Write Spec → Generate Code → Review & Refine) to implement the project.  
- Spec documents are the source of truth for the implementation.  
- For any updates to the implementation plan, update the spec documents first.

---

## 1. Executive Summary

This document outlines the new infrastructure and architecture plan for **Price Monitoring Agent**. The goal is to establish a unified, high-performance hosting environment capable of running multiple demo projects (starting with the *Price Monitoring Agent*) with enterprise-grade reliability at a fixed, personal-budget-friendly cost.

The architecture shifts from disjointed serverless components (which suffer from cold starts) to a consolidated **Micro-PaaS** model using a Virtual Private Server (VPS) and container orchestration.

**Key Change:** From Vercel + Render + Neon + Upstash → DigitalOcean + Coolify (self-hosted containers)

---

## 2. Core Requirements

### 2.1 Performance & Availability

* **Zero Cold Starts:** All services (Frontend, API, Workers, DB) must be "Always Online" to ensure instant response times for demo purposes, regardless of traffic frequency.
* **Low Latency:** Infrastructure must be physically located in the **AU/NZ region (Sydney)** to ensure fast load times for local usage and interviews.

### 2.2 Scalability & Flexibility

* **Multi-App Support:** The platform must host the *Price Monitoring Agent* now but support adding future demo apps with shared infrastructure. Path-based routing (e.g., `/price-monitor-agent`, `/other-app`) enables multiple apps under one domain.
* **Easy Deployment:** Automated CI/CD pipelines (Git Push → Deploy) similar to Vercel/Heroku.

### 2.3 Cost Constraints

* **Budget:** Fixed monthly cost (DigitalOcean Droplet pricing).
* **Efficiency:** Maximize resource usage by sharing PostgreSQL and Redis instances across different demo apps.

### 2.4 Security Baseline

* **Network Firewall:** Only expose necessary ports (80/443 for web, 22 for SSH).
* **Admin Protection:** Coolify dashboard protected with authentication.
* **Secret Management:** Secrets stored in Coolify environment variables and GitHub Secrets (never committed to repo).

---

## 3. Infrastructure Architecture

### 3.1 Hosting Provider

| Attribute | Value |
|-----------|-------|
| **Provider** | DigitalOcean |
| **Service** | Droplet (Virtual Machine) |
| **Region** | Sydney (SYD1) |
| **Spec** | 4GB RAM / 2 vCPUs (Basic Droplet) |

### 3.2 Orchestration Platform

* **Platform:** Coolify (Self-hosted)
* **Role:** Manages Docker container lifecycles, reverse proxy (Traefik), and SSL certificates (Let's Encrypt).
* **Configuration:** Deploys pre-built images from Container Registry (VPS never builds code).

### 3.3 Container Registry

* **Service:** GitHub Container Registry (GHCR)
* **Role:** Stores built Docker images as single source of truth for all environments.
* **Access:** Private images pulled via GitHub Personal Access Token (PAT).

---

## 4. Technology Stack Comparison

### 4.1 Before vs After

| Component | Implementation 1 (Before) | Implementation 2 (After) |
|-----------|---------------------------|--------------------------|
| **Web/API** | Vercel (serverless) | Docker on Coolify |
| **Worker** | Render (Docker) | Docker on Coolify |
| **Database** | Neon (external SaaS) | PostgreSQL container on VPS |
| **Queue/Cache** | Upstash (external SaaS) | Redis container on VPS |
| **Scheduling** | Vercel Cron → API endpoint | BullMQ Repeatable Jobs (worker-managed) |
| **CI/CD** | GitHub Actions → Render webhook | GitHub Actions → Coolify webhook |
| **SSL/Proxy** | Vercel/Render managed | Coolify (Traefik + Let's Encrypt) |

### 4.2 Final Technology Stack

| Component | Technology | Hosting |
|-----------|------------|---------|
| **Orchestration** | Coolify | DigitalOcean Droplet |
| **CI/CD Pipeline** | GitHub Actions | GitHub-hosted runners |
| **Artifact Storage** | GHCR | GitHub Packages |
| **Frontend/API** | Next.js 16 (standalone) | Docker Container |
| **Background Worker** | Node.js + BullMQ | Docker Container |
| **Scheduled Tasks** | BullMQ Repeatable Jobs | Worker reads settings from DB |
| **Database** | PostgreSQL 15 | Docker Container (persistent volume) |
| **Queue/Cache** | Redis 7 | Docker Container (persistent volume) |
| **Email Service** | Resend | External SaaS (unchanged) |

---

## 5. CI/CD Strategy

### 5.1 Build Once, Deploy Anywhere

The VPS never builds code. GitHub Actions builds Docker images externally, pushes to GHCR, then triggers Coolify to pull and deploy.

**Benefits:**
- Conserves VPS CPU/memory resources
- Ensures identical images across environments
- Faster deployments (pull vs build)

### 5.2 Pipeline Flow

```
Developer pushes code to GitHub
            ↓
    GitHub Actions triggers
            ↓
    1. Run linting & tests
    2. Build Docker images (web + worker)
    3. Tag images (:latest or :dev)
    4. Push to GHCR
            ↓
    Webhook notifies Coolify
            ↓
    Coolify pulls new image & restarts container
```

### 5.3 Image Tagging Strategy

| Branch | Image Tag | Deployment |
|--------|-----------|------------|
| `main` | `:latest` | **Automatic** - Production Coolify pulls immediately |
| `dev` | `:dev` | **Manual** - Developer triggers redeploy on Local Coolify |

---

## 6. Branching & Development Workflow

### 6.1 Branch Strategy

```
main (production)
  ↑
  └── dev (staging/integration)
        ↑
        └── feature/xyz (working branches)
```

* **`main`**: Production-ready code. Merges trigger `:latest` image build and auto-deploy.
* **`dev`**: Integration branch for testing. Merges trigger `:dev` image build.
* **`feature/*`**: Short-lived branches for individual tasks. Merge into `dev` via PR.

### 6.2 Development Loop

1. **Create branch:** `git checkout -b feature/my-task dev`
2. **Develop:** Write code locally with `pnpm dev` (connects to Local VPS services)
3. **Push:** `git push origin feature/my-task`
4. **PR to dev:** Create PR, merge into `dev`
5. **Build:** GitHub Actions builds `:dev` image (~2-3 mins)
6. **Test:** Click "Redeploy" on Local Coolify to pull `:dev` image
7. **Verify:** Test in Local VM environment (realistic staging)
8. **Release:** PR from `dev` → `main`, merge triggers production deploy
9. **Live:** Production Coolify auto-pulls `:latest` image

---

## 7. Domain & Routing Strategy

### 7.1 Initial Setup (No Domain)

* Access via VPS IP address: `http://<droplet-ip>/`
* Coolify dashboard: `http://<droplet-ip>:8000/`

### 7.2 Future Setup (With Domain)

* **Domain:** To be purchased (e.g., `mydemo.com`)
* **Routing:** Path-based routing for multiple apps:

| Path | Application |
|------|-------------|
| `/price-monitor-agent/*` | Price Monitoring Agent |
| `/other-app/*` | Future demo app |
| `/` | Landing page or redirect |

* **SSL:** Automatic via Coolify (Let's Encrypt)

---

## 8. Scheduling Architecture Change

### 8.1 Before (Implementation 1)

```
Vercel Cron (every 30 mins)
    ↓
GET /api/cron/check-all
    ↓
API checks schedule settings
    ↓
Enqueues jobs to BullMQ
```

**Problem:** Depends on external cron service (Vercel). Cold starts delay execution.

### 8.2 After (Implementation 2)

```
Worker starts
    ↓
Reads email schedule settings from PostgreSQL
    ↓
Registers BullMQ Repeatable Job with cron pattern
    ↓
BullMQ automatically triggers jobs on schedule
    ↓
(Settings change in UI → Worker updates repeatable job)
```

**Benefits:**
- No external cron dependency
- Worker is always running (no cold start)
- Schedule changes take effect immediately
- Single scheduler-enabled worker instance prevents duplicate jobs

---

## 9. Migration Phases Overview

Implementation 1 completed through Phase 7.1 (Worker Dockerized) and partially Phase 7.2 (GitHub Actions created). Implementation 2 builds on this foundation.

### Phase 1: Local Infrastructure Setup

**Goal:** Create a local VPS simulation for safe testing.

* Install Multipass on development machine (Ubuntu VM)
* Install Coolify inside the Local VM
* Provision shared PostgreSQL and Redis containers via Coolify
* **Outcome:** Local server environment matching production architecture

### Phase 2: Hybrid Development Workflow

**Goal:** Enable local code development against Dockerized infrastructure.

* Expose PostgreSQL (5432) and Redis (6379) ports from Local VM
* Update `.env` to point to Local VM IP
* Run `pnpm dev` on host machine with hot reload
* **Outcome:** Fast development with realistic backend services

### Phase 3: CI/CD Pipeline Construction

**Goal:** Automate image builds and registry publishing.

* Create Web App Dockerfile (Next.js standalone)
* Update GitHub Actions to build both `web` and `worker` images
* Configure `:dev` and `:latest` tagging based on branch
* Push images to GHCR
* **Outcome:** Automated image pipeline ready for deployment

### Phase 4: Local Staging Verification

**Goal:** Validate full deployment process locally before spending money.

* Configure Local Coolify to pull `:dev` images from GHCR
* Deploy web and worker containers via Coolify
* Test complete flow: UI → API → Worker → DB → Email
* Implement BullMQ Repeatable Jobs for scheduling
* **Outcome:** Proven deployment process ready for production

### Phase 5: Production Launch

**Goal:** Go live on DigitalOcean.

* Provision DigitalOcean Droplet (Sydney region)
* Install Coolify and replicate Local VM configuration
* Deploy `:latest` images
* Configure Coolify webhook for auto-deploy on `main` branch
* (Later) Configure domain and SSL
* **Outcome:** Production environment live and auto-deploying

---

## 10. Scalability Path

### Vertical Scaling

If 4GB RAM becomes insufficient:
* Resize Droplet to 8GB+ with simple reboot
* No configuration changes needed

### Horizontal Scaling

If single VPS reaches limits:
* Coolify supports multi-server clusters
* Add additional Droplets to the same Coolify instance
* Unlikely needed for demo portal use case

---

## 11. Documentation Structure

### 11.1 Hierarchy

```
specs/implementation-2/
├── architecture-change.md      ← This document (high-level WHY)
├── task-overview.md            ← Technical implementation plan (HOW overview)
└── task-P.S.md                 ← Detailed task specs (HOW details)
    ├── task-1.1.md             (Phase 1, Step 1)
    ├── task-1.2.md             (Phase 1, Step 2)
    └── ...
```

### 11.2 Document Purposes

| Document | Purpose | Audience |
|----------|---------|----------|
| `architecture-change.md` | High-level architecture decisions and rationale | Anyone understanding the system |
| `task-overview.md` | Technical implementation plan with phase breakdown | Developer planning work |
| `task-P.S.md` | Step-by-step implementation details with code snippets | Developer executing tasks |

### 11.3 Naming Convention

* **Implementation 1:** Original cloud/serverless approach (archived)
* **Implementation 2:** Current Micro-PaaS migration (this document)

Task naming: `task-P.S.md` where P = Phase number, S = Step number
* Example: `task-1.2.md` = Phase 1, Step 2

---

## 12. Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **VPS Provider** | DigitalOcean | Sydney region, reliable, predictable pricing |
| **Orchestration** | Coolify | Open-source, Vercel-like UX, handles SSL/proxy |
| **Container Registry** | GHCR | Free for GitHub repos, integrates with Actions |
| **Scheduling** | BullMQ Repeatable Jobs | No external dependency, always-on worker |
| **Data Migration** | Fresh start | Demo app, no production data to preserve |
| **Domain** | Deferred | Start with IP access, add domain later |
| **Branch Strategy** | main/dev/feature | Clear separation of production and staging |
