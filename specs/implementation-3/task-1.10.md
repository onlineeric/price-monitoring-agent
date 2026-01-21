# Task 1.10: Update CLAUDE.md

**Type:** AI - Documentation
**Performer:** Claude
**Phase:** 1 - Local Development Simplification
**Dependencies:** Tasks 1.7, 1.8, 1.9 (Config files created)
**Estimated Time:** 10 minutes

---

## What

Update `CLAUDE.md` to replace Implementation 2's Multipass VM workflow with Implementation 3's Docker Compose (v2 `docker compose`) setup, ensuring the AI guidance document accurately reflects the new local development architecture.

---

## Objective

Update the project guide so future Claude sessions understand:
- Local services run via Docker Compose (v2 `docker compose`, not `docker-compose`) (not VM)
- Environment variables use localhost URLs
- Commands use `pnpm docker:*` scripts
- Production deployment remains unchanged (Coolify)

---

## How to Do

### Sections to Update

#### 1. Project Overview

**Current:** Mentions 3 environments (Dev, VM, Prod)

**Update to:** 2 environments (Dev, Prod)

**New text:**
```markdown
### Implementation Status

**Implementation Status:** Implementation 3 (Simplified Local Development)
**Spec-Driven Development:** See `specs/implementation-3/` for task specs
```

#### 2. Repository Structure

**Action:** No changes needed (structure unchanged).

#### 3. Commands Section

**Add Docker Compose commands** after "Development" section:

```markdown
### Docker Services (Local Development)
```bash
pnpm docker:up        # Start PostgreSQL and Redis
pnpm docker:down      # Stop servicess
pnpm docker:logs      # View service logs
```

**Remove or archive:**
- Multipass commands section
- Local VM commands

#### 4. Environment Configuration Section

**Major rewrite needed.** Replace with:

```markdown
## Environment Configuration

### Local Development

Development on host machine with Docker Compose services:

1. **Start Services:**
   ```bash
   pnpm docker:up
   ```

2. **Configure `.env`:**
   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/priceMonitor"
   REDIS_URL="redis://localhost:6379"
   AI_PROVIDER="anthropic"
   ANTHROPIC_API_KEY="your-key"
   RESEND_API_KEY="your-key"
   NODE_ENV="development"
   ENABLE_SCHEDULER="false"
   ```

3. **Run Apps:**
   ```bash
   pnpm --filter @price-monitor/web dev      # Port 3000
   pnpm --filter @price-monitor/worker dev   # Background
   ```

### Production Deployment

Production environment (DigitalOcean):

1. **Database URLs** use Coolify internal DNS:
   ```
   postgresql://postgres:password@price-monitor-postgres-prod:5432/priceMonitor
   redis://price-monitor-redis-prod:6379
   ```
2. **Environment Variables** set in production Coolify dashboard
3. **Scheduler**: Only ONE worker with `ENABLE_SCHEDULER="true"`
4. **Node Environment**: `NODE_ENV="production"`
```

#### 5. Development Workflow Section

**Rewrite to:**

```markdown
## Development Workflow

### Local Development

Fast iteration with hot reload:

1. **One-Time Setup:**
   ```bash
   # Install Docker Desktop (or Docker Engine)
   # Clone repository
   pnpm install

   # Copy environment template
   cp .env.example .env
   # Add your API keys to .env

   # Start services
   pnpm docker:up

   # Set up database
   pnpm --filter @price-monitor/db push
   ```

2. **Daily Development:**
   ```bash
   # Start services (if not running)
   pnpm docker:up

   # Start dev servers
   pnpm --filter @price-monitor/web dev      # Terminal 1
   pnpm --filter @price-monitor/worker dev   # Terminal 2

   # Stop services when done
   pnpm docker:down
   ```

### Production Deployment

1. Merge to `main` branch
2. GitHub Actions builds `:latest` images
3. Coolify webhooks trigger auto-deployment
4. Production deploys on DigitalOcean
```

#### 6. Architecture Section

**Update infrastructure table:**

```markdown
### Infrastructure Stack

| Component | Local Dev | Production |
|-----------|-----------|------------|
| **Orchestration** | Docker Compose | Coolify (DigitalOcean Sydney) |
| **PostgreSQL/Redis** | Docker containers | Containers on Droplet |
| **Web/Worker** | pnpm dev | GHCR `:latest` images |
| **CICD** | N/A | Auto-deploy on `main` merge |
```

#### 7. Troubleshooting Section

**Add new subsection:**

```markdown
### Local Docker Services

- **Services won't start:** Check Docker is running with `docker ps`
- **Port conflicts:** Check if 5432 or 6379 already in use: `sudo lsof -i :5432`
- **DB connection failed:** Verify services healthy: `docker ps`, check .env URLs
- **Data corruption:** Clean and restart: `pnpm docker:clean && pnpm docker:up`
```

**Remove:**
- Local VM troubleshooting section

#### 8. Implementation Status Section

**Update to reflect Implementation 3:**

```markdown
### Implementation Status

- **Implementation 1:** Serverless (Vercel) - Archived
- **Implementation 2:** Self-hosted with Local VM - Completed
- **Implementation 3:** Simplified Local Dev - Current
  - Phase 1: Local Docker Compose setup - Current
  - Phase 2: Production deployment - Planned
```

---

## Technical Specifications

### File Location

```
/home/onlineeric/repos/price-monitoring-agent/CLAUDE.md
```

### Key Changes Summary

| Section | Change Type | Description |
|---------|-------------|-------------|
| Project Overview | Update | Mention Implementation 3 |
| Commands | Add | docker:* scripts |
| Environment Config | Rewrite | localhost URLs, remove VM |
| Development Workflow | Rewrite | Docker Compose setup |
| Architecture | Update | 2 environments instead of 3 |
| Troubleshooting | Update | Docker issues, remove VM |
| Implementation Status | Update | Add Impl-3 status |

### Preserve These Sections

**Don't change:**
- Tech Stack (unchanged)
- Data Model (unchanged)
- Extraction Pipeline (unchanged)
- Queue Flow (unchanged)
- Production Deployment details (unchanged)

---

## Deliverables

- [ ] CLAUDE.md updated with Implementation 3 workflow
- [ ] All VM references removed from current instructions
- [ ] Docker Compose commands documented
- [ ] Environment configuration uses localhost
- [ ] Development workflow simplified
- [ ] Troubleshooting updated for Docker
- [ ] Historical context preserved (Implementation 2 mentioned)

---

## Verification Steps

### 1. Check for VM References

```bash
grep -i "multipass" CLAUDE.md
grep -i "coolify-local" CLAUDE.md
grep "192.168" CLAUDE.md
```

**Expected:** Only in historical/comparison context.

### 2. Check for localhost URLs

```bash
grep "localhost:5432" CLAUDE.md
grep "localhost:6379" CLAUDE.md
```

**Expected:** Found in Environment Configuration section.

### 3. Check docker Commands

```bash
grep "pnpm docker:" CLAUDE.md
```

**Expected:** Found in Commands and Development Workflow sections.

### 4. Verify Structure

```bash
grep "^##" CLAUDE.md
```

**Expected:** All major sections present, logical order.

---

## Success Criteria

- [x] CLAUDE.md reflects Implementation 3 architecture
- [x] Multipass/VM removed from current workflow
- [x] Docker Compose commands documented
- [x] Environment variables use localhost
- [x] Development workflow is clear and concise
- [x] Troubleshooting covers Docker issues
- [x] Production deployment section unchanged
- [x] Historical context preserved
- [x] File is well-formatted and readable

---

## Notes

### Preserve Historical Context

**Good approach:**
```markdown
Implementation 3 uses Docker Compose for local services (replaces the Multipass VM from Implementation 2).
```

**Bad approach:**
Don't just delete all mentions of VM without context.

### Two Environments, Not Three

**Implementation 2:** Dev → VM (testing) → Production
**Implementation 3:** Dev → Production

The VM was only for local testing of containerized deployment, not needed anymore.

### Keep Production Details

Implementation 3 **only changes local development**. Production sections should remain mostly unchanged:
- Coolify orchestration
- DigitalOcean hosting
- GitHub Actions CICD
- Internal DNS URLs

### Tone and Style

CLAUDE.md is written for AI consumption:
- Clear, structured sections
- Code examples with context
- Technical details emphasized
- Links to related specs/docs

---

## Troubleshooting

### Section Removal vs Update

**Decision guide:**
- **Remove:** VM-specific instructions with no equivalent
- **Update:** Sections that apply to both (change details)
- **Preserve:** Production, code architecture, data models

**Example:**
```markdown
<!-- REMOVE -->
## Local VM (Multipass)
Start VM: `multipass start coolify-local`

<!-- UPDATE -->
## Local Services
Start services: `pnpm docker:up`
```

### Conflicting Information

**Symptom:** One section says VM, another says Docker Compose

**Solution:** Standardize on Docker Compose for "Local Development", preserve VM mentions only in:
- Implementation history
- Migration guides
- Comparisons

### Breaking Existing Links

**Symptom:** Internal links broken after section removal

**Solution:**
1. Search for `](#local-vm)` style links
2. Update to new section names
3. Or remove link if section no longer exists

---

## Next Steps

After completing this task:
1. Proceed to **Task 1.11: Update README.md**
2. CLAUDE.md serves as authoritative guide for future AI sessions
3. User will review in Task 1.6

---

**Task Status:** Ready for execution
