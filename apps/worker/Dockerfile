FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Install pnpm (specific version for consistency)
RUN npm install -g pnpm@10.26.2

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/worker/package.json ./apps/worker/

# Install dependencies with shamefully-hoist for Docker compatibility
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Copy source code
COPY packages/db ./packages/db
COPY apps/worker ./apps/worker

# Build db package if needed
RUN pnpm --filter @price-monitor/db build || true

# Set environment
ENV NODE_ENV=production

# Change working directory to worker app
WORKDIR /app/apps/worker

# Start worker directly (tsx is hoisted to /app/node_modules)
CMD ["../../node_modules/.bin/tsx", "src/index.ts"]
