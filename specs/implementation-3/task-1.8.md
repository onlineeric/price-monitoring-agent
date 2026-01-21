# Task 1.8: Create Docker Compose Scripts

**Type:** AI - Configuration
**Performer:** Claude
**Phase:** 1 - Local Development Simplification
**Dependencies:** Task 1.7 (docker-compose.yml created)
**Estimated Time:** 3 minutes

---

## What

Add convenience scripts to `package.json` for managing docker-compose services, making it easy to start, stop, clean, and view logs for PostgreSQL and Redis containers.

---

## Objective

Provide developer-friendly commands:
- `pnpm docker:up` - Start services
- `pnpm docker:down` - Stop services
- `pnpm docker:clean` - Remove services and volumes
- `pnpm docker:logs` - View service logs

These scripts abstract docker-compose commands and follow the project's pnpm script conventions.

---

## How to Do

### Script Specifications

Add these scripts to the root `package.json` in the `scripts` section:

#### 1. docker:up
**Command:** `docker-compose up -d`
**Purpose:** Start PostgreSQL and Redis in detached mode
**Usage:** `pnpm docker:up`

#### 2. docker:down
**Command:** `docker-compose down`
**Purpose:** Stop and remove containers (preserves volumes)
**Usage:** `pnpm docker:down`

#### 3. docker:logs
**Command:** `docker-compose logs -f`
**Purpose:** Follow logs from both services
**Usage:** `pnpm docker:logs`

### Additional Helpful Scripts (Optional)

#### 4. docker:restart
**Command:** `docker-compose restart`
**Purpose:** Restart services without removing containers
**Usage:** `pnpm docker:restart`

#### 5. docker:ps
**Command:** `docker-compose ps`
**Purpose:** Show running services
**Usage:** `pnpm docker:ps`

---

## Technical Specifications

### File Location

```
/home/onlineeric/repos/price-monitoring-agent/package.json
```

### Script Naming Convention

Follow the project's existing patterns:
- Namespace: `docker:*` (groups all docker commands)
- Lowercase: `docker:up` not `docker:Up`
- Descriptive: Clear what each command does

### Integration with Existing Scripts

These scripts should integrate with existing development workflow:

**Typical development session:**
```bash
# 1. Start services
pnpm docker:up

# 2. Run migrations
pnpm --filter @price-monitor/db push

# 3. Start dev servers
pnpm --filter @price-monitor/web dev      # Terminal 1
pnpm --filter @price-monitor/worker dev   # Terminal 2

# 4. Stop services when done
pnpm docker:down
```

### Docker Compose Command Reference

| Script | Command | Flags | Effect |
|--------|---------|-------|--------|
| docker:up | docker-compose up | -d | Start detached |
| docker:down | docker-compose down | none | Stop, keep volumes |
| docker:clean | docker-compose down | -v | Stop, remove volumes |
| docker:logs | docker-compose logs | -f | Follow logs |

---

## Deliverables

- [ ] Root package.json updated with docker scripts
- [ ] All 4 core scripts added (up, down, clean, logs)
- [ ] Optional scripts added (restart, ps) if helpful
- [ ] Scripts follow project naming conventions
- [ ] Scripts work cross-platform (Linux, macOS, Windows)

---

## Verification Steps

### 1. Check Scripts Added

```bash
cat package.json | grep "docker:"
```

**Expected output:**
```json
"docker:up": "docker-compose up -d",
"docker:down": "docker-compose down",
"docker:clean": "docker-compose down -v",
"docker:logs": "docker-compose logs -f",
```

### 2. List Available Scripts

```bash
pnpm run | grep docker
```

**Expected output:**
```
docker:up
docker:down
docker:clean
docker:logs
```

### 3. Test docker:up (Optional)

```bash
pnpm docker:up
```

**Expected:** Services start successfully.

### 4. Test docker:down (Optional)

```bash
pnpm docker:down
```

**Expected:** Services stop gracefully.

---

## Success Criteria

- [x] package.json contains docker:up script
- [x] package.json contains docker:down script
- [x] package.json contains docker:clean script
- [x] package.json contains docker:logs script
- [x] Scripts use correct docker-compose commands
- [x] `pnpm run` lists docker scripts
- [x] Scripts are properly formatted JSON

---

## Notes

### Why Namespace with docker:?

Namespacing groups related commands:
```bash
pnpm docker:    # Tab completion shows all docker commands
```

Similar to existing patterns:
- `build:*` - Build commands
- `dev:*` - Development commands
- `db:*` - Database commands

### docker-compose vs docker compose

Scripts use `docker-compose` (with hyphen) for compatibility with:
- Docker Compose V1 (standalone)
- Docker Compose V2 (plugin, also supports hyphen form)

Both work identically in practice.

### Detached Mode (-d)

`docker:up` uses `-d` flag:
- Services run in background
- Terminal is freed for other commands
- View logs with `pnpm docker:logs`

**Without -d:** Logs stream to terminal, Ctrl+C stops services.

### Volume Management

Two cleanup options:
1. **docker:down** - Stop but keep data (resume later with same data)
2. **docker:clean** - Stop and wipe data (fresh start)

**Use docker:down** for daily workflow.
**Use docker:clean** when troubleshooting or resetting.

---

## Troubleshooting

### Script Not Found

**Symptom:** `pnpm docker:up` shows "script not found"

**Solutions:**
1. Verify script added to package.json
2. Check JSON syntax (trailing commas, quotes)
3. Run `pnpm install` to refresh script cache
4. Try `pnpm run docker:up` (explicit)

### Command Not Found: docker-compose

**Symptom:** Script fails with "command not found"

**Solution:** User needs to install docker-compose (Task 1.2).

**Alternative:** Update scripts to use `docker compose` (no hyphen):
```json
"docker:up": "docker compose up -d"
```

### Permission Denied (Linux)

**Symptom:** Script fails with "permission denied"

**Solution:** User needs to add themselves to docker group:
```bash
sudo usermod -aG docker $USER
newgrp docker
```

---

## Next Steps

After completing this task:
1. Proceed to **Task 1.9: Update .env.example**
2. Scripts will be used in Task 1.4 (start services)
3. Document scripts in README.md (Task 1.11)

---

## Reference: Script Section Example

```json
{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "biome check .",

    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down",
    "docker:clean": "docker-compose down -v",
    "docker:logs": "docker-compose logs -f",
    "docker:restart": "docker-compose restart",
    "docker:ps": "docker-compose ps",

    "redeploy:local": "./scripts/redeploy-local.sh"
  }
}
```

**Note:** This is for reference. Actual placement may vary based on existing package.json structure.

---

**Task Status:** Ready for execution
