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
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" --profile worker up -d --build worker
    echo "[dev-worker] Docker worker restarted."
  else
    echo "[dev-worker] Docker worker was not running before, skipping restart."
  fi
}
trap cleanup EXIT

# Start dev worker
echo "[dev-worker] Starting development worker..."
pnpm --filter @price-monitor/worker dev
