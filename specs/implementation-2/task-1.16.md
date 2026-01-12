# Task 1.16: Update Environment Documentation

**Type:** AI Generation
**Performer:** AI
**Phase:** 1 - Local VM + CICD

---

## Objective

Update `.env.example` and CLAUDE.md to reflect the new local VM development workflow and environment variable requirements.

---

## Context

With the migration to local VM infrastructure, the environment configuration has changed:
- Database: Neon cloud → PostgreSQL on local VM
- Redis: Upstash cloud → Redis on local VM
- New variables: `ENABLE_SCHEDULER` for worker

Documentation needs to be updated to guide developers on the new setup.

---

## Files to Update

### 1. `.env.example`

**Location:** Project root (`.env.example`)

**Updates Needed:**

```env
# ===================================
# Database Configuration
# ===================================

# Local VM Development
# Use VM IP from task 1.4
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@<VM_IP>:5432/priceMonitor"

# Production (Coolify internal URL - set in Coolify dashboard)
# DATABASE_URL="postgresql://postgres:password@price-monitor-postgres-prod:5432/priceMonitor"

# ===================================
# Redis Configuration
# ===================================

# Local VM Development
REDIS_URL="redis://<VM_IP>:6379"

# Production (Coolify internal URL - set in Coolify dashboard)
# REDIS_URL="redis://price-monitor-redis-prod:6379"

# ===================================
# AI Provider Configuration
# ===================================

# Provider selection: openai | google | anthropic
AI_PROVIDER="anthropic"

# API Keys (get from respective providers)
OPENAI_API_KEY=""
GOOGLE_GENERATIVE_AI_API_KEY=""
ANTHROPIC_API_KEY=""

# AI Models
OPENAI_MODEL="gpt-5-mini"
ANTHROPIC_MODEL="claude-haiku-4-5"
GOOGLE_MODEL="gemini-2.5-flash"

# Debug mode
FORCE_AI_EXTRACTION=false

# ===================================
# Email Configuration
# ===================================

# Resend API Key (get from resend.com)
RESEND_API_KEY=""

# ===================================
# Worker Configuration
# ===================================

# Enable scheduler for BullMQ repeatable jobs
# IMPORTANT: Only ONE worker instance should have this enabled
# Local VM: Set to "true" for the worker container
# Production: Set to "true" for ONE worker instance only
ENABLE_SCHEDULER="false"

# ===================================
# Node Environment
# ===================================

NODE_ENV="development"  # development | production

# ===================================
# Coolify Local Deployment (Optional)
# ===================================

# Coolify API token for local redeploy script
# Get from Coolify dashboard: Settings → API Tokens
# COOLIFY_API_TOKEN=""
# COOLIFY_WEB_APP_UUID=""
# COOLIFY_WORKER_APP_UUID=""
```

**Key Changes:**
- Add sections for Local VM vs Production
- Add comments explaining VM IP placeholder
- Add `ENABLE_SCHEDULER` with detailed comments
- Add Coolify-related variables for redeploy script
- Improve organization with section headers
- Add context comments for each variable

### 2. CLAUDE.md

**Location:** Project root (`CLAUDE.md`)

**Sections to Update:**

#### A. Environment Variables Section

Add new section explaining the two environments:

```markdown
## Environment Configuration

### Local Development (VM Services)

When developing locally with code on host machine:

1. **Start VM Services** (task 1.1-1.10):
   - PostgreSQL and Redis running in Coolify on local VM
   - Get VM IP: `multipass info coolify-local`

2. **Configure `.env`:**
   ```env
   DATABASE_URL="postgresql://postgres:password@<VM_IP>:5432/priceMonitor"
   REDIS_URL="redis://<VM_IP>:6379"
   ENABLE_SCHEDULER="false"  # Not needed for local dev
   ```

3. **Run Apps:**
   ```bash
   pnpm --filter @price-monitor/web dev
   pnpm --filter @price-monitor/worker dev
   ```

### Containerized Deployment (Local VM or Production)

When deploying via Coolify:

1. **Environment Variables** set in Coolify dashboard for each app
2. **Database URLs** use Coolify internal DNS:
   ```
   postgresql://postgres:password@price-monitor-postgres:5432/priceMonitor
   redis://price-monitor-redis:6379
   ```
3. **Scheduler Enabled** for ONE worker instance:
   ```env
   ENABLE_SCHEDULER="true"
   ```

### Production Deployment

Same as containerized deployment, but using production Coolify instance on DigitalOcean.
```

#### B. Development Workflow Section

Update with new workflow:

```markdown
## Development Workflow

### Option 1: Local Code + VM Services (Recommended for development)

**Use Case:** Fast iteration with hot reload

1. Ensure VM services running (PostgreSQL, Redis)
2. Update `.env` with VM connection strings
3. Run apps locally:
   ```bash
   pnpm --filter @price-monitor/web dev      # Port 3000
   pnpm --filter @price-monitor/worker dev   # Background
   ```
4. Code changes auto-reload

### Option 2: Full Containerized (Recommended for testing)

**Use Case:** Test deployment before production

1. Push code to `dev` branch
2. GitHub Actions builds `:dev` images
3. Redeploy on local Coolify:
   ```bash
   pnpm redeploy:local
   ```
4. Test containerized apps

### Option 3: Production Deployment

**Use Case:** Deploy to production

1. Merge `dev` to `main`
2. GitHub Actions builds `:latest` images
3. Automatic deployment to production Coolify
4. Monitor logs and verify
```

#### C. Commands Section

Update commands to reflect new workflow:

```markdown
## Commands

### Database (packages/db)
```bash
pnpm --filter @price-monitor/db generate  # Generate Drizzle migrations
pnpm --filter @price-monitor/db push      # Push schema to database (use VM or prod)
pnpm --filter @price-monitor/db studio    # Open Drizzle Studio (connects to DB)
```

### Web App (apps/web)
```bash
pnpm --filter @price-monitor/web dev      # Start Next.js dev server (local)
pnpm --filter @price-monitor/web build    # Production build (for testing)
pnpm --filter @price-monitor/web lint     # Run ESLint
```

### Worker (apps/worker)
```bash
pnpm --filter @price-monitor/worker dev   # Run worker with hot reload (local)
```

### Local VM Management
```bash
multipass list                            # List all VMs
multipass info coolify-local              # Get VM details (IP, resources)
multipass shell coolify-local             # SSH into VM
multipass stop coolify-local              # Stop VM
multipass start coolify-local             # Start VM
```

### Local Deployment
```bash
pnpm redeploy:local                       # Trigger redeploy on local Coolify
```

### Docker (Local Testing)
```bash
# Build images locally
docker build -f apps/web/Dockerfile -t web:test .
docker build -f apps/worker/Dockerfile -t worker:test .

# Run containers locally
docker run -p 3000:3000 --env-file .env web:test
docker run --env-file .env worker:test
```
```

#### D. Architecture Section

Update to reflect new infrastructure:

```markdown
## Architecture (Implementation 2)

### Infrastructure

| Component | Local VM | Production |
|-----------|----------|------------|
| **Orchestration** | Coolify on Multipass VM | Coolify on DigitalOcean |
| **PostgreSQL** | Container on VM | Container on Droplet |
| **Redis** | Container on VM | Container on Droplet |
| **Web App** | Container from GHCR `:dev` | Container from GHCR `:latest` |
| **Worker** | Container from GHCR `:dev` | Container from GHCR `:latest` |
| **CICD** | GitHub Actions → GHCR | GitHub Actions → GHCR → Coolify |

### Scheduling

**Old (Implementation 1):**
- Vercel Cron → API endpoint → Enqueue jobs

**New (Implementation 2):**
- Worker startup → Read DB settings → BullMQ Repeatable Jobs
- Auto-executes on schedule
- No external cron dependency
```

---

## Deliverables

1. **Updated `.env.example`:**
   - Local VM configuration examples
   - Production configuration examples
   - New `ENABLE_SCHEDULER` variable
   - Coolify variables for redeploy script
   - Clear comments and sections

2. **Updated `CLAUDE.md`:**
   - New environment configuration section
   - Updated development workflow section
   - Updated commands section
   - Updated architecture section
   - Removed Vercel/Render/Neon/Upstash references

---

## Success Criteria

- [ ] `.env.example` updated with VM connection patterns
- [ ] Clear comments distinguish local vs production setup
- [ ] `ENABLE_SCHEDULER` documented with usage notes
- [ ] Coolify variables added for redeploy script
- [ ] CLAUDE.md updated with new development workflow
- [ ] Commands section updated for VM management
- [ ] Architecture section reflects Implementation 2
- [ ] All old infrastructure references removed
- [ ] Documentation clear and easy to follow

---

## Notes

- Keep both local and production examples in `.env.example`
- Use `<VM_IP>` placeholder to indicate user needs to replace
- Emphasize that only ONE worker should have `ENABLE_SCHEDULER=true`
- Make it clear which workflow to use for which scenario
- Remove all mentions of Vercel, Render, Neon, Upstash
