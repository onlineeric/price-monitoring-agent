#!/usr/bin/env bash
# dev-mcp.sh — Start dev MCP server with automatic Docker MCP container management
#
# Stops the background Docker MCP server before starting the dev MCP server,
# and restarts it when the dev MCP server exits (Ctrl+C). This guarantees you
# can never have two MCP servers competing for port 3001 on the host.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Track whether Docker MCP server was running before we stopped it
DOCKER_MCP_WAS_RUNNING=false

# Check if Docker MCP container is running
if docker compose -f "$PROJECT_ROOT/docker-compose.yml" ps --status running mcp-server 2>/dev/null | grep -q mcp-server; then
  DOCKER_MCP_WAS_RUNNING=true
fi

# Stop Docker MCP server if running
if [ "$DOCKER_MCP_WAS_RUNNING" = true ]; then
  echo "[dev-mcp] Stopping background Docker MCP server..."
  docker compose -f "$PROJECT_ROOT/docker-compose.yml" stop mcp-server
  echo "[dev-mcp] Docker MCP server stopped."
fi

# Restart Docker MCP server on exit (only if it was running before)
cleanup() {
  echo ""
  if [ "$DOCKER_MCP_WAS_RUNNING" = true ]; then
    echo "[dev-mcp] Restarting background Docker MCP server..."
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" --profile mcp up -d mcp-server
    echo "[dev-mcp] Docker MCP server restarted."
  else
    echo "[dev-mcp] Docker MCP server was not running before, skipping restart."
  fi
}
trap cleanup EXIT

# Start dev MCP server
echo "[dev-mcp] Starting development MCP server..."
pnpm --filter @price-monitor/mcp-server dev:tsx
