# MCP Server Dockerfile
# This Dockerfile is built from the repository root
# Build command: docker build -f apps/mcp-server/Dockerfile -t price-monitor-mcp-server .
# Run command: docker run -p 3002:3002 -e DATABASE_URL="..." -e REDIS_URL="..." price-monitor-mcp-server
#
# The MCP server only talks to Postgres + Redis (no Playwright), so a slim
# node:20-alpine base is enough.

FROM node:20-alpine

WORKDIR /app

# Install curl for the Coolify / Docker HEALTHCHECK probe (alpine ships without it)
RUN apk add --no-cache curl

# Install pnpm (specific version for consistency with the rest of the monorepo)
RUN npm install -g pnpm@10.26.2

# Copy workspace configuration and package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/mcp-server/package.json ./apps/mcp-server/

# Install dependencies with shamefully-hoist for Docker compatibility
# --frozen-lockfile ensures reproducible builds
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Copy source code
COPY packages/db ./packages/db
COPY apps/mcp-server ./apps/mcp-server

# Build db package if needed (Drizzle schema compilation)
RUN pnpm --filter @price-monitor/db build || true

# Bake the MiniLM int8 embedding weights into the image (feature 008,
# research D3). The warm step runs the pipeline once so the model is downloaded
# into the baked cache dir; NODE_ENV is forced to development for this single
# command so remote model fetching is allowed at build time. At runtime the
# weights are already present and the Hub is never contacted.
ENV EMBEDDING_CACHE_DIR=/app/.cache/transformers
RUN cd /app/apps/mcp-server \
    && NODE_ENV=development ../../node_modules/.bin/tsx scripts/warm-embedding-model.ts

# Default to HTTP transport on port 3002 in production. Override
# MCP_TRANSPORT=stdio to use the IDE-style stdio transport.
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV MCP_HTTP_PORT=3002
# Offline at runtime: weights are baked in (above), so never reach the HF Hub.
# Belt-and-suspenders with the code's allowRemoteModels=false under production.
ENV TRANSFORMERS_OFFLINE=1
ENV HF_HUB_OFFLINE=1

EXPOSE 3002

# Change working directory to mcp-server app
WORKDIR /app/apps/mcp-server

# Start the MCP server using tsx for TypeScript execution.
# tsx is hoisted to /app/node_modules by the shamefully-hoist flag.
CMD ["../../node_modules/.bin/tsx", "src/index.ts"]
