# Web App Dockerfile for Next.js
# This Dockerfile is built from the repository root
# Build command: docker build -f apps/web/Dockerfile -t price-monitor-web .
# Run command: docker run -p 3000:3000 -e DATABASE_URL="..." -e REDIS_URL="..." price-monitor-web

# ==========================================
# Stage 1: Dependencies
# ==========================================
FROM node:20-alpine AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace configuration
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy all package.json files for workspace dependencies
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/reporting/package.json ./packages/reporting/

# Install dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# ==========================================
# Stage 2: Builder
# ==========================================
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/reporting/node_modules ./packages/reporting/node_modules

# Copy workspace configuration
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy all source code
COPY apps/web ./apps/web
COPY packages/db ./packages/db
COPY packages/reporting ./packages/reporting

# Build Next.js with standalone output
# The output will be in apps/web/.next/standalone
WORKDIR /app/apps/web
RUN pnpm build

# ==========================================
# Stage 3: MCP Server Deploy Bundle
# ==========================================
# The chat route in /app/api/chat spawns the MCP server as a stdio child
# process. The Next.js standalone output (Stage 2) does NOT include
# apps/mcp-server, so we produce a self-contained MCP bundle here using
# `pnpm deploy --prod`. The bundle lands in /app/mcp/ in the runner stage
# and is launched via tsx (now a runtime dep of the MCP server).
FROM node:20-alpine AS mcp-deploy

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /workspace

# Workspace skeleton — needed for pnpm to resolve filters + workspace deps.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/mcp-server/package.json ./apps/mcp-server/
COPY packages/db/package.json ./packages/db/

# Install only deps reachable from @price-monitor/mcp-server (incl. workspace
# deps) so the install footprint stays small.
RUN pnpm install --frozen-lockfile --filter @price-monitor/mcp-server...

# Source — required so workspace deps (@price-monitor/db) deploy as real files.
COPY apps/mcp-server ./apps/mcp-server
COPY packages/db ./packages/db

# `pnpm deploy --prod` produces a self-contained directory with the MCP
# server's files at the root and ALL prod deps (including the workspace dep
# @price-monitor/db, copied as a regular package) under node_modules/.
RUN pnpm deploy --filter @price-monitor/mcp-server --prod --legacy /mcp-deploy

# ==========================================
# Stage 4: Runner (Production)
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output from builder
# Next.js standalone includes only necessary files
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# MCP server bundle — sibling to the standalone tree at /app/mcp/.
# Spawned by /api/chat via env vars MCP_SERVER_COMMAND + MCP_SERVER_ARGS:
#   MCP_SERVER_COMMAND=/app/mcp/node_modules/.bin/tsx
#   MCP_SERVER_ARGS=/app/mcp/src/index.ts
COPY --from=mcp-deploy --chown=nextjs:nodejs /mcp-deploy ./mcp

# Switch to non-root user
USER nextjs

# Expose port 3000
EXPOSE 3000

# Set environment variable for Next.js to use
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start Next.js server
# The standalone server is in apps/web/server.js
CMD ["node", "apps/web/server.js"]
