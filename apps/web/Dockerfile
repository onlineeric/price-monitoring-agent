FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm@10.26.2

# Builder stage
FROM base AS builder
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/web/package.json ./apps/web/

# Install all dependencies with shamefully-hoist for Docker compatibility
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Copy source code
COPY packages/db ./packages/db
COPY apps/web ./apps/web

# Build using pnpm workspace commands
RUN pnpm --filter @price-monitor/db build || true
RUN pnpm --filter @price-monitor/web build

# Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy workspace configuration
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Copy node_modules (with hoisted dependencies)
COPY --from=builder /app/node_modules ./node_modules

# Copy packages
COPY --from=builder /app/packages/db ./packages/db

# Copy web app build
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["pnpm", "--filter", "@price-monitor/web", "start"]
