# Task 1.18: Remove Old Deployment Configs

**Type:** AI Generation
**Performer:** AI
**Phase:** 1 - Local VM + CICD

---

## Objective

Clean up old deployment configurations and references from Implementation 1 that are no longer needed with the new Coolify-based deployment approach.

---

## Context

Implementation 1 used:
- Vercel for web app deployment
- Render.com for worker deployment
- Various configuration files for these platforms

Implementation 2 uses:
- Coolify for all deployments
- GHCR for container images
- No platform-specific configs needed

Old files should be removed to avoid confusion.

---

## Files to Remove

### 1. Vercel Configuration

**File:** `vercel.json` (if exists)

**Locations to check:**
- Project root: `vercel.json`
- Web app: `apps/web/vercel.json`

**Actions:**
- Delete if found (entire file)
- If it contains other useful config, extract that config elsewhere first

**Typical content:**
```json
{
  "crons": [...],  // Already removed in task 1.14
  "buildCommand": "...",
  "outputDirectory": "..."
}
```

### 2. Render Configuration

**File:** `render.yaml` (if exists)

**Locations to check:**
- Project root: `render.yaml`
- Worker app: `apps/worker/render.yaml`

**Actions:**
- Delete if found

**Typical content:**
```yaml
services:
  - type: web
    name: price-monitor-worker
    env: docker
    ...
```

### 3. Deployment Scripts

**Files to check:**
- `scripts/deploy-*`
- `scripts/render-*`
- `.github/workflows/deploy-render.yml` (old workflow)

**Actions:**
- Delete any old deployment scripts
- Keep only the new `build-and-push.yml` workflow

### 4. Platform-Specific Documentation

**Files to update:**
- `README.md`
- `CLAUDE.md` (already handled in task 1.16)
- Any `docs/deployment-*.md` files

**Remove references to:**
- Vercel deployment instructions
- Render.com deployment instructions
- Neon database setup
- Upstash Redis setup

**Keep references to:**
- Docker and Dockerfiles (still needed)
- GitHub Actions (still used)
- Database/Redis (now on Coolify)

---

## Implementation Steps

1. **Search for Vercel files:**
   ```bash
   find . -name "vercel.json" -o -name "vercel.yaml"
   ```
   Delete all found

2. **Search for Render files:**
   ```bash
   find . -name "render.yaml" -o -name "render.yml"
   ```
   Delete all found

3. **Check for old workflows:**
   ```bash
   ls -la .github/workflows/
   ```
   Delete any old deployment workflows except `build-and-push.yml`

4. **Search for deployment scripts:**
   ```bash
   ls scripts/
   ```
   Remove old deploy-related scripts

5. **Update README.md:**
   - Remove "Deployment" sections mentioning Vercel/Render
   - Add brief note about new Coolify-based deployment
   - Link to CLAUDE.md for detailed deployment docs

6. **Search codebase for references:**
   ```bash
   grep -r "vercel" . --exclude-dir=node_modules --exclude-dir=.git
   grep -r "render.com" . --exclude-dir=node_modules --exclude-dir=.git
   grep -r "neon.tech" . --exclude-dir=node_modules --exclude-dir=.git
   grep -r "upstash" . --exclude-dir=node_modules --exclude-dir=.git
   ```
   Remove or update found references

---

## Files to KEEP

**Important:** Do NOT remove these:

1. **Dockerfiles:**
   - `apps/web/Dockerfile` (created in task 1.11)
   - `apps/worker/Dockerfile` (existing)
   - `.dockerignore` files

2. **GitHub Actions:**
   - `.github/workflows/build-and-push.yml` (created in task 1.13)

3. **Database/Redis Code:**
   - Drizzle schema and config
   - Redis connection code
   - BullMQ setup

4. **Application Code:**
   - All Next.js pages, components, API routes (except `/api/cron/check-all`)
   - All worker processing logic
   - Email templates and services

---

## README.md Updates

### Remove Old Deployment Section

Delete or replace sections like:
```markdown
## Deployment

### Web App (Vercel)
1. Connect repository to Vercel...
2. Configure environment variables...
3. Deploy...

### Worker (Render)
1. Create new Web Service...
2. Select Docker environment...
3. Deploy...
```

### Add New Deployment Section

Replace with:
```markdown
## Deployment

This project uses a self-hosted deployment approach with Coolify on DigitalOcean.

**Architecture:**
- **Local Testing:** Coolify on Multipass VM
- **Production:** Coolify on DigitalOcean Droplet (Sydney)
- **Container Registry:** GitHub Container Registry (GHCR)
- **CICD:** GitHub Actions → GHCR → Coolify

**Deployment Process:**
1. Push code to `dev` or `main` branch
2. GitHub Actions builds Docker images
3. Images pushed to GHCR
4. Coolify pulls and deploys images

For detailed deployment instructions, see [CLAUDE.md](CLAUDE.md).
```

---

## Deliverables

1. **Deleted Files:**
   - `vercel.json` (if exists)
   - `render.yaml` (if exists)
   - Old deployment scripts
   - Old GitHub workflows

2. **Updated `README.md`:**
   - Old deployment sections removed
   - New Coolify deployment section added
   - References to Vercel/Render removed

3. **Clean Codebase:**
   - No references to old platforms in code comments
   - No references to old platforms in documentation
   - Docker files preserved

---

## Verification Steps

1. **Check for config files:**
   ```bash
   find . -name "vercel.json" -o -name "render.yaml"
   # Should return nothing
   ```

2. **Check workflows:**
   ```bash
   ls .github/workflows/
   # Should only show: build-and-push.yml
   ```

3. **Search for references:**
   ```bash
   grep -r "vercel\|render.com\|neon.tech\|upstash" . \
     --exclude-dir=node_modules \
     --exclude-dir=.git \
     --exclude-dir=.next
   # Should only return this task spec file (acceptable)
   ```

4. **Build succeeds:**
   ```bash
   pnpm --filter @price-monitor/web build
   pnpm --filter @price-monitor/worker build
   # Should build without errors
   ```

---

## Success Criteria

- [ ] `vercel.json` removed (if existed)
- [ ] `render.yaml` removed (if existed)
- [ ] Old deployment scripts removed
- [ ] Old GitHub workflows removed (except build-and-push.yml)
- [ ] README.md updated with new deployment section
- [ ] No references to Vercel in codebase
- [ ] No references to Render.com in codebase
- [ ] No references to Neon in documentation (code OK)
- [ ] No references to Upstash in documentation (code OK)
- [ ] Docker files preserved
- [ ] GitHub Actions workflow preserved
- [ ] Build succeeds for both apps

---

## Notes

- Some code references to database/Redis are OK (connection logic)
- Focus on removing **platform-specific deployment configs**
- Keep generic Docker and GitHub Actions files
- If unsure about a file, don't delete it - document the question
