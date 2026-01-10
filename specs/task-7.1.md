# Technical Spec: Phase 7.1 - Dockerize Worker

**Phase:** 7.1
**Goal:** Create Docker configuration for the worker application and set up local full-stack development environment.
**Context:** The worker needs to run in a Docker container on Render with Playwright browsers pre-installed. We'll also create a docker-compose setup for local testing of the complete stack (web + worker + redis + postgres).

---

## Prerequisites

* **Task 6.3:** All worker functionality complete.
* **Docker Desktop:** Installed on Windows.

---

## Architecture Context

### Deployment Strategy

**Worker Deployment:**
- Runs in Docker container on Render
- Uses official Playwright Docker image (browsers pre-installed)
- Connects to external services (Neon DB, Upstash Redis)
- Auto-deploys when new image pushed to registry

**Local Development:**
- Docker Compose runs full stack locally
- Includes: Next.js web app, worker, Redis, PostgreSQL
- Allows testing complete flow before deploying

---

## Step 1: Create Worker Dockerfile (AI Generation Step)

**Instruction for AI:**

Create the Dockerfile for the worker application.

### File 1.1: `apps/worker/Dockerfile`

**Goal:** Create production-ready Docker image for worker with Playwright.

**Requirements:**

* **Base Image:**
  Use official Playwright image with Node.js:
  ```dockerfile
  FROM mcr.microsoft.com/playwright:v1.40.0-jammy
  ```

* **Working Directory:**
  ```dockerfile
  WORKDIR /app
  ```

* **Install pnpm:**
  ```dockerfile
  RUN npm install -g pnpm
  ```

* **Copy Package Files:**
  ```dockerfile
  # Copy root package files
  COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

  # Copy workspace package files
  COPY packages/db/package.json ./packages/db/
  COPY apps/worker/package.json ./apps/worker/
  ```

* **Install Dependencies:**
  ```dockerfile
  RUN pnpm install --frozen-lockfile
  ```

* **Copy Source Code:**
  ```dockerfile
  # Copy db package source
  COPY packages/db ./packages/db

  # Copy worker source
  COPY apps/worker ./apps/worker
  ```

* **Build (if needed):**
  ```dockerfile
  # Build db package if it has build step
  RUN cd packages/db && pnpm build || true

  # Worker doesn't need build (runs with tsx)
  ```

* **Environment:**
  ```dockerfile
  ENV NODE_ENV=production
  ```

* **Start Command:**
  ```dockerfile
  CMD ["pnpm", "--filter", "@price-monitor/worker", "start"]
  ```

**Full Dockerfile:**

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/worker/package.json ./apps/worker/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/db ./packages/db
COPY apps/worker ./apps/worker

# Build db package if needed
RUN cd packages/db && pnpm build || true

# Set environment
ENV NODE_ENV=production

# Start worker
CMD ["pnpm", "--filter", "@price-monitor/worker", "start"]
```

### File 1.2: `apps/worker/.dockerignore`

**Goal:** Exclude unnecessary files from Docker build context.

**Requirements:**

```
node_modules
.env
.env.*
dist
*.log
.DS_Store
.git
.gitignore
README.md
```

---

## Step 2: Update Worker Package Scripts (AI Generation Step)

**Instruction for AI:**

Update the worker package.json to include production start script.

### File 2.1: Update `apps/worker/package.json`

**Goal:** Add production start script for Docker.

**Requirements:**

Add to the `scripts` section:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts"
  }
}
```

**Note:** The `start` script uses `tsx` (not `watch`) for production. Docker CMD will run this.

---

## Step 3: Create Docker Compose Configuration (AI Generation Step)

**Instruction for AI:**

Create docker-compose.yml for local full-stack development.

### File 3.1: `docker-compose.yml` (in repository root)

**Goal:** Run complete stack locally: web, worker, redis, postgres.

**Requirements:**

```yaml
version: '3.8'

services:
  # PostgreSQL database (local alternative to Neon)
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: pricemonitor
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  # Redis (local alternative to Upstash)
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  # Worker application
  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    environment:
      # Database
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/pricemonitor
      # Redis
      REDIS_URL: redis://redis:6379
      # AI Provider (use your actual keys)
      AI_PROVIDER: ${AI_PROVIDER:-openai}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      OPENAI_MODEL: ${OPENAI_MODEL:-gpt-4o-mini}
      # Email
      RESEND_API_KEY: ${RESEND_API_KEY}
      EMAIL_FROM: ${EMAIL_FROM}
      ALERT_EMAIL: ${ALERT_EMAIL}
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  # Next.js web application
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    environment:
      # Database
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/pricemonitor
      # Redis
      REDIS_URL: redis://redis:6379
      # Admin
      ADMIN_USERNAME: ${ADMIN_USERNAME:-admin}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-admin}
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

volumes:
  postgres_data:
```

---

## Step 4: Create Web Dockerfile (AI Generation Step)

**Instruction for AI:**

Create Dockerfile for Next.js web application (for docker-compose).

### File 4.1: `apps/web/Dockerfile`

**Goal:** Create Docker image for Next.js app.

**Requirements:**

```dockerfile
FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Dependencies stage
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# Builder stage
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY packages/db ./packages/db
COPY apps/web ./apps/web
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Build db package
RUN cd packages/db && pnpm build || true

# Build Next.js
RUN cd apps/web && pnpm build

# Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/packages/db ./packages/db
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["pnpm", "--filter", "@price-monitor/web", "start"]
```

### File 4.2: `apps/web/.dockerignore`

**Goal:** Exclude files from web Docker build.

**Requirements:**

```
node_modules
.next
.env
.env.*
*.log
.DS_Store
.git
.gitignore
README.md
```

---

## Step 5: Create Environment Template (AI Generation Step)

**Instruction for AI:**

Create .env.example template for docker-compose.

### File 5.1: `.env.example` (in repository root)

**Goal:** Template for environment variables needed by docker-compose.

**Requirements:**

```env
# AI Provider Configuration
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Email Service (Resend)
RESEND_API_KEY=re_...
EMAIL_FROM=Price Monitor <alerts@yourdomain.com>
ALERT_EMAIL=your-email@example.com

# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password

# Note: DATABASE_URL and REDIS_URL are set in docker-compose.yml
# for local development. For production, use Neon and Upstash URLs.
```

---

## Step 6: Local Testing Guide (Manual Step)

**User Action:**

### 6.1: Copy Environment Template

```powershell
# Copy .env.example to .env and fill in your API keys
Copy-Item .env.example .env

# Edit .env with your actual keys
notepad .env
```

### 6.2: Start Full Stack

**Option 1: Docker Compose CLI (PowerShell)**

```powershell
# Build and start all services
docker-compose up --build
```

**Option 2: Docker Desktop GUI**

1. Open **Docker Desktop**
2. Click **Containers** in the left sidebar
3. Click the **"+"** button (or **Import** if you see it)
4. Navigate to your project root folder (`C:\repos\price-monitoring-agent`)
5. Select `docker-compose.yml`
6. Docker Desktop will parse the compose file and start all services
7. View running containers grouped together in the Containers tab

This will start:
- PostgreSQL on port 5432
- Redis on port 6379
- Worker (background process)
- Web app on http://localhost:3000

### 6.3: Initialize Database

**Option 1: Docker Compose CLI (PowerShell)**

In a new terminal:

```powershell
# Run database migrations
docker-compose exec web pnpm --filter @price-monitor/db push
```

**Option 2: Docker Desktop GUI**

1. Open **Docker Desktop** → **Containers** tab
2. Find the running **web** container (should show as part of your compose stack)
3. Click on the **web** container row to open details
4. Click the **Exec** tab (or look for a **CLI/Terminal** icon)
5. In the terminal that opens inside the container, run:
   ```bash
   pnpm --filter @price-monitor/db push
   ```

**Option 3: Connect to Local PostgreSQL Directly**

```powershell
# Set local DATABASE_URL
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pricemonitor"

# Run migrations from packages/db
cd packages/db
pnpm push
```

### 6.4: Verify Services

**Check logs:**

**Option 1: Docker Compose CLI (PowerShell)**

```powershell
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f worker
docker-compose logs -f web
```

**Option 2: Docker Desktop GUI**

1. Open **Docker Desktop** → **Containers** tab
2. Click on a specific container (e.g., **worker** or **web**) to view its logs
3. Logs appear in the **Logs** tab (auto-refreshing)
4. Use the search box to filter log messages
5. Toggle **Auto-scroll** to follow new logs in real-time

**Test web app:**
1. Open http://localhost:3000
2. Try adding a product
3. Check worker logs for price check jobs

**Test worker:**
1. Add a product via web UI
2. Worker should automatically pick up job
3. Check logs for scraping activity

### 6.5: Stop Services

**Option 1: Docker Compose CLI (PowerShell)**

```powershell
# Stop all services
docker-compose down

# Stop and remove volumes (deletes database data)
docker-compose down -v
```

**Option 2: Docker Desktop GUI**

1. Open **Docker Desktop** → **Containers** tab
2. Find your compose stack (containers will be grouped together)
3. **To Stop:** Click the **Stop** button (square icon) on the stack or individual containers
4. **To Remove:** Click the **Delete** button (trash icon) after stopping
5. **To Remove Volumes:**
   - Go to **Volumes** tab in the left sidebar
   - Find `postgres_data` volume
   - Click the **Delete** button (trash icon) to remove database data

---

## Step 7: Build Worker Image for Production (Manual Step)

**User Action:**

Test building the worker image locally:

**Option 1: Docker CLI (PowerShell) - Recommended**

```powershell
# Build worker image
docker build -f apps/worker/Dockerfile -t price-monitor-worker:test .

# Test run (requires env vars)
docker run --rm `
  -e DATABASE_URL="your-neon-url" `
  -e REDIS_URL="your-upstash-url" `
  -e AI_PROVIDER="openai" `
  -e OPENAI_API_KEY="your-key" `
  -e OPENAI_MODEL="gpt-4o-mini" `
  -e RESEND_API_KEY="your-key" `
  -e EMAIL_FROM="test@example.com" `
  -e ALERT_EMAIL="your-email" `
  price-monitor-worker:test
```

**Option 2: Docker Desktop GUI**

**Build Image:**
1. Open **Docker Desktop**
2. Open **PowerShell** or **Terminal** (Docker Desktop doesn't have a GUI for custom builds with specific Dockerfiles)
3. Use the CLI command above to build

**Run Container:**
1. After building, go to **Docker Desktop** → **Images** tab
2. Find `price-monitor-worker:test` image
3. Click the **Run** button (play icon)
4. Click **Optional settings** to expand environment variables section
5. Add all required environment variables (DATABASE_URL, REDIS_URL, etc.)
6. Click **Run**
7. Monitor logs in the **Containers** tab

**Note:** This is just for testing. In production, GitHub Actions will build and push the image.

---

## File Structure After Completion

```
├── docker-compose.yml           # NEW: Local development stack
├── .env.example                 # NEW: Environment template
├── apps/
│   ├── web/
│   │   ├── Dockerfile          # NEW: Web app Docker image
│   │   └── .dockerignore       # NEW: Web ignore file
│   └── worker/
│       ├── Dockerfile          # NEW: Worker Docker image
│       ├── .dockerignore       # NEW: Worker ignore file
│       └── package.json        # UPDATED: Added start script
```

---

## Troubleshooting

### Issue: "Cannot connect to database" in worker

**Cause:** Database not ready when worker starts.

**Solution:** Add `depends_on` with health check in docker-compose, or add retry logic in worker connection.

### Issue: Playwright browsers not working in container

**Cause:** Using wrong base image.

**Solution:** Ensure Dockerfile uses `mcr.microsoft.com/playwright:v1.40.0-jammy` base image.

### Issue: Build fails with "workspace not found"

**Cause:** Missing pnpm-workspace.yaml in build context.

**Solution:** Ensure `COPY pnpm-workspace.yaml` is in Dockerfile and file exists at root.

### Issue: Out of memory during build

**Cause:** Docker Desktop memory limit too low.

**Solution:** Increase memory in Docker Desktop settings (recommend 4GB+).

---

## Completion Criteria

Task 7.1 is complete when:

- [ ] `apps/worker/Dockerfile` created with Playwright base image
- [ ] `apps/worker/.dockerignore` created
- [ ] `apps/worker/package.json` has `start` script
- [ ] `apps/web/Dockerfile` created for Next.js
- [ ] `apps/web/.dockerignore` created
- [ ] `docker-compose.yml` created with all services
- [ ] `.env.example` template created
- [ ] Can run `docker-compose up` successfully
- [ ] Web app accessible at http://localhost:3000
- [ ] Worker processes jobs from queue
- [ ] Database migrations run successfully
- [ ] Can build worker image for production
- [ ] All services communicate correctly

---

## Notes

- Docker Compose is for **local development only**
- Production uses: Vercel (web), Render (worker), Neon (DB), Upstash (Redis)
- The worker Dockerfile will be used by GitHub Actions in Phase 7.2
- Next.js Dockerfile is only for local docker-compose (Vercel deploys directly)
- Playwright base image includes Chromium, Firefox, WebKit (we only use Chromium)
- Image size ~1-2GB due to Playwright browsers (acceptable for Render)
