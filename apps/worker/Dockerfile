# Worker Dockerfile for BullMQ Background Worker
# This Dockerfile is built from the repository root
# Build command: docker build -f apps/worker/Dockerfile -t price-monitor-worker .
# Run command: docker run -e DATABASE_URL="..." -e REDIS_URL="..." price-monitor-worker
#
# IMPORTANT: This container runs as root because Playwright requires elevated permissions
# for browser automation. This is a known limitation of Playwright in containerized environments.

# Use official Playwright base image (includes Chromium and all dependencies)
# IMPORTANT: This version MUST match the playwright version in package.json
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

# Install pnpm (specific version for consistency)
RUN npm install -g pnpm@10.26.2

# Copy workspace configuration and package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/worker/package.json ./apps/worker/

# Install dependencies with shamefully-hoist for Docker compatibility
# --frozen-lockfile ensures reproducible builds
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Copy source code
COPY packages/db ./packages/db
COPY apps/worker ./apps/worker

# Build db package if needed (Drizzle schema compilation)
RUN pnpm --filter @price-monitor/db build || true

# Set environment to production
ENV NODE_ENV=production

# Change working directory to worker app
WORKDIR /app/apps/worker

# Start worker using tsx for TypeScript execution
# tsx is hoisted to /app/node_modules by shamefully-hoist flag
CMD ["../../node_modules/.bin/tsx", "src/index.ts"]
