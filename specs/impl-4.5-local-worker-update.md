# Implementation 4.5: Local Background Worker with Dev-Mode Switching

**Status:** Planned
**Type:** Developer Experience Improvement
**Estimated Changes:** 3 files modified, 1 file created

---

## Problem

The user wants a **background worker** running locally at all times (auto-starts with Docker Desktop on Windows login) to handle scheduled digest jobs. However, when doing development with `pnpm dev:worker`, **two workers compete for the same BullMQ queue**, causing unpredictable job routing.

Currently:
- `docker compose up -d` starts postgres, redis, **and** the worker together
- No way to run a persistent background worker separately from the dev worker
- No automated mechanism to avoid two workers running simultaneously

---

## Solution

Use **Docker Compose profiles** to separate the worker from infrastructure services, and a **wrapper script** for `dev:worker` that automatically stops the Docker worker before starting dev mode, then restarts it on exit.

### Behavior Matrix

| Scenario | Docker Worker | Dev Worker | How |
|----------|:---:|:---:|-----|
| Normal (not developing) | Running | - | Auto-starts with Docker Desktop |
| Start development | Auto-stopped by script | Running | `pnpm dev:worker` |
| Stop development (Ctrl+C) | Auto-restarted by script | - | Trap in wrapper script |

---

## Files to Change

### 1. `docker-compose.yml` — Add profile to worker service

**What:** Add `profiles: ["worker"]` to the worker service and add `ENABLE_SCHEDULER: "true"` to its environment.

**Why:** With a profile, `docker compose up -d` only starts postgres + redis. The worker requires an explicit `--profile worker` flag to start. Once started with `restart: unless-stopped`, Docker auto-restarts it on reboot without needing the profile flag again.

**Exact changes:**

Add `profiles` and `ENABLE_SCHEDULER` to the worker service:

```yaml
  worker:
    profiles:
      - worker
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    environment:
      # ... existing env vars ...
      # Scheduler - enabled for background worker
      ENABLE_SCHEDULER: "true"
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
```

**Important:** Only add the two items (`profiles` block and `ENABLE_SCHEDULER` line). Do NOT change any other existing environment variables or configuration.

---

### 2. `scripts/dev-worker.sh` — New wrapper script

**What:** Create a bash script that:
1. Stops the Docker worker container (if running)
2. Runs the dev worker (`pnpm --filter @price-monitor/worker dev`)
3. On exit (Ctrl+C or any termination), restarts the Docker worker container

**Full file content:**

```bash
#!/usr/bin/env bash
# dev-worker.sh — Start dev worker with automatic Docker worker management
#
# Stops the background Docker worker before starting the dev worker,
# and restarts it when the dev worker exits (Ctrl+C).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Track whether Docker worker was running before we stopped it
DOCKER_WORKER_WAS_RUNNING=false

# Check if Docker worker container is running
if docker compose -f "$PROJECT_ROOT/docker-compose.yml" ps --status running worker 2>/dev/null | grep -q worker; then
  DOCKER_WORKER_WAS_RUNNING=true
fi

# Stop Docker worker if running
if [ "$DOCKER_WORKER_WAS_RUNNING" = true ]; then
  echo "[dev-worker] Stopping background Docker worker..."
  docker compose -f "$PROJECT_ROOT/docker-compose.yml" stop worker
  echo "[dev-worker] Docker worker stopped."
fi

# Restart Docker worker on exit (only if it was running before)
cleanup() {
  echo ""
  if [ "$DOCKER_WORKER_WAS_RUNNING" = true ]; then
    echo "[dev-worker] Restarting background Docker worker..."
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" --profile worker up -d worker
    echo "[dev-worker] Docker worker restarted."
  else
    echo "[dev-worker] Docker worker was not running before, skipping restart."
  fi
}
trap cleanup EXIT

# Start dev worker
echo "[dev-worker] Starting development worker..."
pnpm --filter @price-monitor/worker dev
```

**Key design decisions:**
- Uses `trap cleanup EXIT` — runs on Ctrl+C, normal exit, and errors
- Only restarts Docker worker if it was previously running (respects user intent)
- Uses `set -euo pipefail` for safety
- Resolves PROJECT_ROOT from script location, so it works from any directory

After creating the file, make it executable: `chmod +x scripts/dev-worker.sh`

---

### 3. `package.json` (root) — Update scripts

**What:** Update `dev:worker` to use the wrapper script, and add convenience commands for Docker worker management.

**Changes to the `scripts` section:**

```jsonc
{
  "scripts": {
    // ... existing scripts unchanged ...

    // CHANGE: update dev:worker to use wrapper script
    "dev:worker": "bash scripts/dev-worker.sh",

    // ADD: convenience commands for Docker worker
    "worker:up": "docker compose --profile worker up -d worker",
    "worker:down": "docker compose stop worker",
    "worker:logs": "docker compose logs -f worker",
    "worker:restart": "docker compose --profile worker restart worker"
  }
}
```

**Exact diff for `dev:worker`:**
- Before: `"dev:worker": "pnpm --filter @price-monitor/worker dev"`
- After: `"dev:worker": "bash scripts/dev-worker.sh"`

---

### 4. `.env.example` — Document ENABLE_SCHEDULER for local dev

**What:** Update the `ENABLE_SCHEDULER` comment to reflect the new setup.

**Change the ENABLE_SCHEDULER section from:**

```env
# Enable scheduler for BullMQ repeatable jobs
# IMPORTANT: Only ONE worker instance should have this enabled
# Local Development: Set to "false" (manual triggers only)
# Production: Set to "true" for ONE worker instance only
ENABLE_SCHEDULER="false"
```

**To:**

```env
# Enable scheduler for BullMQ repeatable jobs
# IMPORTANT: Only ONE worker instance should have this enabled
# The background Docker worker has ENABLE_SCHEDULER=true set in docker-compose.yml
# For dev worker: set to "true" if you want scheduled jobs during development
# Production: Set to "true" for ONE worker instance only
ENABLE_SCHEDULER="true"
```

Default changed to `"true"` so the dev worker also handles scheduled jobs (matching the Docker worker behavior). Since the wrapper script ensures only one worker runs at a time, this is safe.

---

## Setup Instructions (One-Time)

After implementing the changes above, the user needs to do the following once:

### Start the background Docker worker for the first time

```bash
pnpm worker:up
```

This pulls/builds the worker image, starts the container, and because of `restart: unless-stopped`, it will **auto-restart whenever Docker Desktop starts** (i.e., on Windows login).

### Verify it's running

```bash
pnpm worker:logs
```

Should show the worker processing jobs and scheduler output.

---

## Usage After Setup

### Day-to-day (not developing)

Nothing to do. Docker Desktop starts on Windows login, the worker container auto-restarts.

### Start development

```bash
pnpm dev:worker    # Automatically stops Docker worker, starts dev worker
```

### Stop development

Press `Ctrl+C`. The script automatically restarts the Docker worker.

### Manual Docker worker management

```bash
pnpm worker:up       # Start background Docker worker
pnpm worker:down     # Stop background Docker worker
pnpm worker:logs     # View Docker worker logs
pnpm worker:restart  # Restart Docker worker
```

---

## How Docker Compose Profiles Work

- **Without profile:** `docker compose up -d` starts only services without a `profiles` key (postgres, redis).
- **With profile:** `docker compose --profile worker up -d` starts postgres, redis, AND worker.
- **restart: unless-stopped:** Once a container is started (with or without profile flag), Docker auto-restarts it on daemon restart. It only stays stopped if explicitly stopped via `docker compose stop`.

This means after the initial `pnpm worker:up`, the worker auto-starts on every Docker Desktop restart — no profile flag needed.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Docker worker not started yet, run `pnpm dev:worker` | Works fine. Dev worker starts. On exit, Docker worker is NOT started (it wasn't running before). |
| Docker Desktop not running, run `pnpm dev:worker` | `docker compose` commands fail silently (stderr). Dev worker starts normally. On exit, restart attempt fails silently. No harm done. |
| Force-kill dev worker (kill -9) | Trap doesn't fire. Docker worker stays stopped. User runs `pnpm worker:up` manually to restart. |
| Two terminals run `pnpm dev:worker` | Second instance also tries to stop Docker worker (already stopped, no-op). Both dev workers compete for queue — same as running two workers. User should avoid this. |
| Docker worker image is outdated | Run `pnpm worker:up` after rebuilding: `docker compose --profile worker up -d --build worker` |

---

## What NOT to Change

- **Worker application code** (`apps/worker/src/`): No changes needed. The worker behaves the same regardless of how it's started.
- **Production deployment**: Unaffected. Production uses separate Docker images deployed via Coolify, not docker-compose profiles.
- **`docker compose up -d` / `pnpm docker:up`**: Still works as before for postgres + redis. The worker is no longer started by this command (which is the desired behavior).
