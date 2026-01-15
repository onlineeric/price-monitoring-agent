# Task 1.12: Update Worker Dockerfile

**Type:** AI Generation
**Performer:** AI
**Phase:** 1 - Local VM + CICD

---

## Objective

Review the existing worker Dockerfile and ensure it's compatible with Coolify deployment and GHCR image distribution. Make updates if needed.

---

## Context

The worker already has a Dockerfile from Implementation 1 (created in Phase 7.1). This task is to:
- Review the existing implementation
- Verify Playwright browsers are correctly installed
- Ensure compatibility with Coolify
- Update if needed for new deployment approach
- Confirm it works with GHCR workflow

**IMPORTANT: Deployment Flow**
- GitHub Actions builds this Dockerfile and pushes the image to GHCR
- Coolify pulls the pre-built image from GHCR (does NOT build locally)
- The VPS never compiles code - all image building happens in GitHub Actions
- This "build once, deploy anywhere" approach ensures consistency across environments

---

## Review Checklist

### 1. Dockerfile Location
- [ ] File exists at `apps/worker/Dockerfile`
- [ ] Uses appropriate base image

### 2. Playwright Installation
- [ ] Playwright dependencies installed correctly
- [ ] Browsers (Chromium) downloaded during build
- [ ] Browser binaries work in container environment
- [ ] No runtime browser download (should install at build time)

### 3. Environment Variables
- [ ] Supports runtime environment configuration
- [ ] No hardcoded secrets
- [ ] `NODE_ENV=production` supported

### 4. User Permissions
- [ ] Runs as non-root user (security best practice)
- [ ] Or runs as root only if Playwright requires it

### 5. Dependencies
- [ ] pnpm installed and used correctly
- [ ] Monorepo dependencies handled properly
- [ ] Production dependencies only in final image

### 6. Build Optimization
- [ ] Multi-stage build if possible
- [ ] Minimized image size
- [ ] Build cache layers optimized

---

## Required Updates (If Needed)

### If Dockerfile needs changes:

1. **Update Comments:**
   - Add clear build command example
   - Add run command example
   - Document environment variables

2. **Optimize for GHCR:**
   - Ensure image layers cache well
   - Minimize final image size
   - Fast rebuilds when code changes

3. **Coolify Compatibility:**
   - No interactive prompts during build
   - Environment variables passed at runtime
   - Graceful shutdown handling (SIGTERM)

4. **Playwright Stability:**
   - Install specific Playwright version
   - Lock browser versions
   - Include all required system dependencies

---

## Implementation Details

### Common Playwright Dockerfile Pattern

```dockerfile
# Install Playwright system dependencies
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    # ... other dependencies
    && rm -rf /var/lib/apt/lists/*

# Install Playwright browsers (at build time)
RUN npx playwright install chromium --with-deps
```

### Graceful Shutdown

Worker should handle SIGTERM for clean shutdown:
- Close database connections
- Finish current jobs
- Exit cleanly

Ensure this is implemented in worker code and Dockerfile doesn't interfere.

---

## Deliverables

**If changes needed:**
- Updated `apps/worker/Dockerfile`
- Updated comments and documentation

**If no changes needed:**
- Document that review was completed
- Confirm existing Dockerfile meets all requirements

---

## Verification Steps

After review/update:

```bash
# Build image (from repository root)
docker build -f apps/worker/Dockerfile -t price-monitor-worker:test .

# Run container (with env vars)
docker run \
  -e DATABASE_URL="..." \
  -e REDIS_URL="..." \
  -e NODE_ENV=production \
  price-monitor-worker:test

# Check logs
# Should show: "Worker started", "Connecting to Redis", etc.
# Should NOT show: "Downloading browsers..." (browsers should be pre-installed)
```

---

## Success Criteria

- [ ] Existing Dockerfile reviewed
- [ ] Playwright browsers install at build time
- [ ] No runtime browser downloads
- [ ] Compatible with Coolify deployment
- [ ] Environment variables configurable at runtime
- [ ] Build command documented in comments
- [ ] Run command documented in comments
- [ ] Image builds successfully
- [ ] Container runs and processes jobs
- [ ] No breaking changes from existing implementation

---

## Notes

- The existing Dockerfile was created in Implementation 1, Phase 7.1
- It was designed for Render.com deployment
- May need minor updates for Coolify, but core structure should be sound
- Focus on verification and documentation improvements
- Avoid breaking existing functionality
