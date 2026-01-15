# Task 1.11: Create Web App Dockerfile

**Type:** AI Generation
**Performer:** AI
**Phase:** 1 - Local VM + CICD

---

## Objective

Create a production-ready Dockerfile for the Next.js web application that:
- Uses Next.js standalone output for minimal image size
- Implements multi-stage build for optimization
- Is compatible with Coolify deployment
- Can be deployed to both local VM and production

---

## Context

The web app (`apps/web`) is a Next.js 16 application that needs to be containerized for deployment via Coolify. Currently, there is no Dockerfile for the web app (only the worker has one).

**IMPORTANT: Build Process**
- GitHub Actions builds this Dockerfile and pushes the image to GHCR
- Coolify ONLY pulls pre-built images from GHCR (never builds locally)
- The VPS never compiles code - all builds happen in GitHub Actions
- This "build once, deploy anywhere" approach conserves VPS resources

**Next.js Standalone Mode:**
Next.js can build a standalone output that includes only necessary files, significantly reducing image size.

---

## Technical Specifications

### Dockerfile Requirements

**File Location:** `apps/web/Dockerfile`

**Multi-Stage Build:**
1. **Stage 1 - Dependencies:** Install dependencies using pnpm
2. **Stage 2 - Builder:** Build Next.js application with standalone output
3. **Stage 3 - Runner:** Final production image with minimal footprint

**Base Images:**
- Use `node:20-alpine` for smaller image size
- Alpine Linux provides minimal attack surface

**Build Configuration:**
- Enable Next.js standalone output
- Copy only necessary files to final image
- Set proper ownership and permissions
- Configure environment variable handling

**Port Configuration:**
- Expose port 3000 (Next.js default)
- Document port in Dockerfile

**Environment Variables:**
- Support runtime environment variables
- Do not bake secrets into image
- Use `NODE_ENV=production`

### .dockerignore Requirements

**File Location:** `apps/web/.dockerignore`

Exclude unnecessary files to speed up Docker build:
- `node_modules`
- `.next` (will be rebuilt)
- `dist`
- `.git`
- `*.md`
- `.env*` files
- Development files

---

## Implementation Details

### Dockerfile Structure

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
# Install pnpm
# Copy package files
# Install dependencies (production + dev for build)

# Stage 2: Builder
FROM node:20-alpine AS builder
# Copy dependencies from deps stage
# Copy source code
# Build Next.js with standalone output
# next.config.ts should have: output: 'standalone'

# Stage 3: Runner
FROM node:20-alpine AS runner
# Set NODE_ENV=production
# Create non-root user
# Copy standalone output
# Copy public and .next/static
# Set proper ownership
# Expose port 3000
# Start Next.js server
```

### Key Considerations

1. **Monorepo Context:**
   - Dockerfile runs from repository root
   - Must copy shared packages correctly
   - Handle pnpm workspace structure

2. **Next.js Standalone:**
   - Requires `output: 'standalone'` in `next.config.ts`
   - Creates `.next/standalone` directory
   - Includes only necessary dependencies

3. **Static Files:**
   - Copy `public/` folder
   - Copy `.next/static` folder
   - Serve static assets correctly

4. **Security:**
   - Run as non-root user
   - Minimize attack surface with Alpine
   - Don't expose unnecessary ports

---

## Deliverables

1. **`apps/web/Dockerfile`**
   - Production-ready multi-stage build
   - Well-commented for maintainability
   - Optimized for image size

2. **`apps/web/.dockerignore`**
   - Excludes unnecessary files
   - Speeds up build context transfer

3. **Comments in Dockerfile:**
   - Build command example
   - Run command example
   - Port mapping instructions

---

## Verification Steps

After implementation, the following should work:

```bash
# Build image (from repository root)
docker build -f apps/web/Dockerfile -t price-monitor-web:test .

# Run container (with env vars)
docker run -p 3000:3000 \
  -e DATABASE_URL="..." \
  -e REDIS_URL="..." \
  -e NODE_ENV=production \
  price-monitor-web:test

# Access web UI
# Open browser: http://localhost:3000
# Should see the application running
```

---

## Success Criteria

- [ ] `apps/web/Dockerfile` created
- [ ] Multi-stage build implemented (deps → builder → runner)
- [ ] Uses Node 20 Alpine
- [ ] Enables Next.js standalone output
- [ ] Exposes port 3000
- [ ] Runs as non-root user
- [ ] `apps/web/.dockerignore` created
- [ ] Dockerfile includes build/run command comments
- [ ] Image builds successfully
- [ ] Container runs and serves application

---

## Notes

- Check if `next.config.ts` needs modification for standalone output
- If `output: 'standalone'` not set, add it
- Ensure compatibility with existing Next.js configuration
- Keep Dockerfile maintainable with clear comments
