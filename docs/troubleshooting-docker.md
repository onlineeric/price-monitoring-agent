# Docker Compose Troubleshooting (Local Development)

This guide covers common issues when running this project locally with Docker Compose (PostgreSQL + Redis) on Linux and WSL2 Ubuntu.

If you are blocked and none of the fixes work, collect the output from the commands in [Diagnostic Commands](#diagnostic-commands) and share it in the project chat / issue.

## Table of Contents

- [Docker Installation Issues](#docker-installation-issues)
  - [Issue: Docker command not found](#issue-docker-command-not-found)
  - [Issue: Docker daemon not running](#issue-docker-daemon-not-running)
  - [Issue: Permission denied on /var/run/docker.sock](#issue-permission-denied-on-varrundockersock)
  - [Issue: WSL integration problems (Docker Desktop)](#issue-wsl-integration-problems-docker-desktop)
- [Service Startup Issues](#service-startup-issues)
  - [Issue: Containers won't start](#issue-containers-wont-start)
  - [Issue: Port 5432 already in use](#issue-port-5432-already-in-use)
  - [Issue: Port 6379 already in use](#issue-port-6379-already-in-use)
  - [Issue: Image pull failures](#issue-image-pull-failures)
  - [Issue: Container exits immediately](#issue-container-exits-immediately)
  - [Issue: Healthcheck never passes](#issue-healthcheck-never-passes)
- [Connection Issues](#connection-issues)
  - [Issue: Cannot connect to PostgreSQL (ECONNREFUSED)](#issue-cannot-connect-to-postgresql-econnrefused)
  - [Issue: Cannot connect to Redis (ECONNREFUSED)](#issue-cannot-connect-to-redis-econnrefused)
  - [Issue: Database authentication failed](#issue-database-authentication-failed)
  - [Issue: localhost not resolving / wrong host](#issue-localhost-not-resolving--wrong-host)
- [Data and Volume Issues](#data-and-volume-issues)
  - [Issue: Volume permission errors in WSL](#issue-volume-permission-errors-in-wsl)
  - [Issue: Data not persisting](#issue-data-not-persisting)
  - [Issue: Corrupted data / migrations fail](#issue-corrupted-data--migrations-fail)
  - [Issue: Disk space errors](#issue-disk-space-errors)
- [Network Issues](#network-issues)
  - [Issue: Containers can't reach internet](#issue-containers-cant-reach-internet)
  - [Issue: DNS resolution failures](#issue-dns-resolution-failures)
  - [Issue: Proxy / firewall problems](#issue-proxy--firewall-problems)
- [Performance Issues](#performance-issues)
  - [Issue: Slow container startup](#issue-slow-container-startup)
  - [Issue: High CPU / memory usage](#issue-high-cpu--memory-usage)
  - [Issue: Disk I/O problems](#issue-disk-io-problems)
- [WSL-Specific Issues](#wsl-specific-issues)
  - [Issue: Docker Desktop WSL2 integration not enabled](#issue-docker-desktop-wsl2-integration-not-enabled)
  - [Issue: File system performance is slow under /mnt/c](#issue-file-system-performance-is-slow-under-mntc)
  - [Issue: WSL networking is weird (localhost vs Windows)](#issue-wsl-networking-is-weird-localhost-vs-windows)
  - [Issue: WSL resource limits (memory/CPU)](#issue-wsl-resource-limits-memorycpu)
- [Diagnostic Commands](#diagnostic-commands)

## Docker Installation Issues

### Issue: Docker command not found

**Symptoms:**
- Running `docker` prints:
  ```
  docker: command not found
  ```
- `pnpm docker:up` fails immediately

**Cause:**
Docker CLI is not installed, or your shell cannot find it.

**Solution:**
1. Verify Docker is installed:
   ```bash
   which docker
   docker --version
   ```
2. Install Docker:
   - **WSL2 Ubuntu (Recommended):** Install Docker Desktop on Windows and enable WSL integration (see [WSL integration problems](#issue-wsl-integration-problems-docker-desktop)).
   - **Native Linux:** Install Docker Engine using your distro instructions:
     https://docs.docker.com/engine/install/

**Verification:**
```bash
docker --version
docker info
```

### Issue: Docker daemon not running

**Symptoms:**
- `docker ps` prints:
  ```
  Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?
  ```
- Docker Desktop shows "Stopped" / "Starting" forever

**Cause:**
The Docker daemon (engine) is not running, or WSL is not connected to Docker Desktop.

**Solution:**
1. Check if Docker is reachable:
   ```bash
   docker info
   ```
2. **WSL2:** Start Docker Desktop on Windows and wait for it to say "Running".
3. **Native Linux:** Start the service:
   ```bash
   sudo systemctl start docker
   sudo systemctl enable docker
   ```
4. Retry:
   ```bash
   docker ps
   pnpm docker:up
   ```

**Verification:**
```bash
docker ps
```

### Issue: Permission denied on /var/run/docker.sock

**Symptoms:**
- Running any docker command prints:
  ```
  permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock
  ```

**Cause:**
Your user is not allowed to access the Docker daemon socket.

**Solution:**
1. Confirm the socket permissions:
   ```bash
   ls -l /var/run/docker.sock
   ```
2. If you are on native Linux, add your user to the `docker` group:
   ```bash
   sudo usermod -aG docker $USER
   ```
3. Restart your shell session (log out/in) or run:
   ```bash
   newgrp docker
   ```
4. Try again:
   ```bash
   docker ps
   ```

**Verification:**
```bash
docker ps
```

### Issue: WSL integration problems (Docker Desktop)

**Symptoms:**
- Docker works in Windows PowerShell, but not inside WSL
- `docker ps` in WSL shows daemon errors
- `docker context ls` shows contexts but WSL is not using the right one

**Cause:**
Docker Desktop is not integrated with your WSL distro (or integration is disabled).

**Solution:**
1. Open Docker Desktop (Windows)
2. Go to `Settings -> Resources -> WSL Integration`
3. Enable:
   - "Enable integration with my default WSL distro"
   - Your distro (e.g. Ubuntu)
4. In WSL, restart your terminal and check:
   ```bash
   docker context ls
   docker info
   ```

**Verification:**
```bash
docker info
```

## Service Startup Issues

### Issue: Containers won't start

**Symptoms:**
- `pnpm docker:up` fails
- `docker compose up` exits with errors
- `docker ps` shows nothing, or containers show `Exited`

**Cause:**
Common causes include port conflicts, missing images, permission problems, or invalid Compose configuration.

**Solution:**
1. Get the current status:
   ```bash
   docker compose ps
   docker ps -a
   ```
2. Check logs for the failing service:
   ```bash
   docker compose logs --tail=200 postgres
   docker compose logs --tail=200 redis
   ```
3. Common quick fixes:
   - Port conflict: see [Port 5432 already in use](#issue-port-5432-already-in-use) and [Port 6379 already in use](#issue-port-6379-already-in-use)
   - Image pull: see [Image pull failures](#issue-image-pull-failures)
   - Exits: see [Container exits immediately](#issue-container-exits-immediately)
4. Retry:
   ```bash
   pnpm docker:down
   pnpm docker:up
   ```

**Verification:**
```bash
docker compose ps
```

### Issue: Port 5432 already in use

**Symptoms:**
- Error when starting PostgreSQL:
  ```
  Error starting userland proxy: listen tcp 0.0.0.0:5432: bind: address already in use
  ```
- PostgreSQL container fails to start while Redis runs

**Cause:**
Another process is already listening on port `5432` (system PostgreSQL, another container, or an old dev setup).

**Solution:**
**Option 1: Stop the conflicting service (Recommended)**
1. Find what is using the port:
   ```bash
   sudo lsof -i :5432
   # or
   sudo ss -lptn 'sport = :5432'
   ```
2. Stop the conflicting process:
   - If it's system PostgreSQL (native Linux):
     ```bash
     sudo systemctl stop postgresql
     ```
   - If it's another container:
     ```bash
     docker ps
     docker stop <container>
     ```

**Option 2: Change the host port**
1. Update `docker-compose.yml` to map a different host port (example `5433:5432`).
2. Update `.env` to match:
   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5433/priceMonitor"
   ```

**Verification:**
```bash
pnpm docker:up
docker compose ps
```

### Issue: Port 6379 already in use

**Symptoms:**
- Error when starting Redis:
  ```
  Error starting userland proxy: listen tcp 0.0.0.0:6379: bind: address already in use
  ```
- Redis container fails to start

**Cause:**
Another process is already listening on port `6379` (system Redis, another container, or a local install).

**Solution:**
**Option 1: Stop the conflicting service (Recommended)**
1. Find what is using the port:
   ```bash
   sudo lsof -i :6379
   # or
   sudo ss -lptn 'sport = :6379'
   ```
2. Stop it:
   - Native Linux system service:
     ```bash
     sudo systemctl stop redis
     sudo systemctl stop redis-server
     ```
   - Another container:
     ```bash
     docker ps
     docker stop <container>
     ```

**Option 2: Change the host port**
1. Update `docker-compose.yml` to map a different host port (example `6380:6379`).
2. Update `.env` to match:
   ```env
   REDIS_URL="redis://localhost:6380"
   ```

**Verification:**
```bash
pnpm docker:up
docker compose ps
```

### Issue: Image pull failures

**Symptoms:**
- Compose fails with messages like:
  ```
  pull access denied
  failed to resolve source metadata
  TLS handshake timeout
  ```

**Cause:**
Docker cannot download images due to network/DNS issues, registry auth problems, or proxies.

**Solution:**
1. Verify general internet connectivity:
   ```bash
   curl -I https://registry-1.docker.io
   ```
2. Retry pulling explicitly:
   ```bash
   docker compose pull
   ```
3. If the error is TLS/DNS-related, see [DNS resolution failures](#issue-dns-resolution-failures) and [Containers can't reach internet](#issue-containers-cant-reach-internet).
4. If the image is private, ensure you are logged in:
   ```bash
   docker login
   ```

**Verification:**
```bash
docker compose pull
pnpm docker:up
```

### Issue: Container exits immediately

**Symptoms:**
- `docker ps` does not show the container running
- `docker ps -a` shows `Exited (1)` or similar
- `docker compose ps` shows a service restarting or stopped

**Cause:**
The container process crashes early due to invalid configuration, bad environment variables, corrupted volume data, or incompatible images.

**Solution:**
1. Inspect logs:
   ```bash
   docker compose logs --tail=300 <service>
   ```
2. Inspect exit code and last state:
   ```bash
   docker inspect <container> --format '{{.State.Status}} {{.State.ExitCode}}'
   ```
3. For databases, common fixes:
   - If Postgres complains about data files, see [Corrupted data](#issue-corrupted-data--migrations-fail)
   - If the config is wrong, re-check `.env` variables

**Verification:**
```bash
docker compose up -d
docker compose ps
```

### Issue: Healthcheck never passes

**Symptoms:**
- `docker compose ps` shows `(health: starting)` for a long time
- Dependent services cannot connect even though the container is running

**Cause:**
The service is running but not ready (e.g., Postgres still initializing), the healthcheck command is failing, or the container cannot access required files/volumes.

**Solution:**
1. Watch logs while it starts:
   ```bash
   docker compose logs -f postgres
   ```
2. Inspect health output:
   ```bash
   docker inspect <container> --format '{{json .State.Health}}'
   ```
3. For Postgres, verify the internal healthcheck command works:
   ```bash
   docker exec -it <postgres-container> pg_isready -U postgres -d priceMonitor
   ```
4. If healthchecks fail due to auth, see [Database authentication failed](#issue-database-authentication-failed).

**Verification:**
```bash
docker compose ps
# Expect "healthy" for postgres/redis
```

## Connection Issues

### Issue: Cannot connect to PostgreSQL (ECONNREFUSED)

**Symptoms:**
- App logs show:
  ```
  connect ECONNREFUSED 127.0.0.1:5432
  ```
- `pnpm --filter @price-monitor/db push` fails with connection refused

**Cause:**
PostgreSQL is not running, not healthy yet, or the host/port in `DATABASE_URL` is wrong.

**Solution:**
1. Confirm Postgres container is running and healthy:
   ```bash
   docker compose ps
   docker compose logs --tail=200 postgres
   ```
2. Verify `DATABASE_URL` matches your compose port mapping.
3. Confirm the port is open:
   ```bash
   nc -vz localhost 5432
   ```
4. If the port is in use by something else, see [Port 5432 already in use](#issue-port-5432-already-in-use).

**Verification:**
```bash
pnpm --filter @price-monitor/db push
```

### Issue: Cannot connect to Redis (ECONNREFUSED)

**Symptoms:**
- Worker logs show:
  ```
  connect ECONNREFUSED 127.0.0.1:6379
  ```
- BullMQ jobs never run

**Cause:**
Redis is not running, not ready, or `REDIS_URL` is wrong.

**Solution:**
1. Confirm Redis container is running:
   ```bash
   docker compose ps
   docker compose logs --tail=200 redis
   ```
2. Confirm the port is open:
   ```bash
   nc -vz localhost 6379
   ```
3. Verify the URL:
   ```env
   REDIS_URL="redis://localhost:6379"
   ```
4. If the port is in use by something else, see [Port 6379 already in use](#issue-port-6379-already-in-use).

**Verification:**
```bash
docker exec -it price-monitoring-agent-redis-1 redis-cli ping
# Expect: PONG
```

### Issue: Database authentication failed

**Symptoms:**
- Postgres logs show:
  ```
  password authentication failed for user "postgres"
  ```
- App errors mention `28P01` or "authentication failed"

**Cause:**
Your `DATABASE_URL` password does not match the password configured for the Postgres container, or the Postgres volume contains an old password from a previous init.

**Solution:**
1. Confirm the `.env` value matches the compose configuration.
2. If you recently changed the Postgres password in compose/env, the existing volume will still have the old credentials.
3. To reset local data (DANGER: deletes local DB data):
   ```bash
   pnpm docker:down
   docker volume ls | grep price-monitor
   docker volume rm <postgres-volume-name>
   pnpm docker:up
   ```
   If you do not want to delete data, revert your password change to the old value.

**Verification:**
```bash
pnpm --filter @price-monitor/db push
```

### Issue: localhost not resolving / wrong host

**Symptoms:**
- Connection errors only inside containers or only inside WSL
- Using `localhost` from inside a container fails

**Cause:**
`localhost` means "this container" when used inside containers. From WSL, `localhost` should point to WSL itself (and Docker Desktop provides the bridge), but mixing contexts (Windows vs WSL vs container) can cause confusion.

**Solution:**
1. From your host shell (WSL), `DATABASE_URL` should usually use `localhost`.
2. From inside a container, use the service name (`postgres`, `redis`) rather than `localhost`.
3. If you are running tooling from Windows (not WSL) you may need to use `localhost` from Windows, not WSL.
4. Sanity checks:
   ```bash
   # From WSL host
   nc -vz localhost 5432
   nc -vz localhost 6379

   # From inside a container (example)
   docker exec -it price-monitoring-agent-postgres-1 sh
   # inside:
   # nc -vz postgres 5432
   ```

**Verification:**
- Host tools can connect using `localhost`
- Container-to-container traffic uses service names

## Data and Volume Issues

### Issue: Volume permission errors in WSL

**Symptoms:**
- Errors like:
  ```
  permission denied
  operation not permitted
  ```
- Postgres fails to initialize with messages about `chown` / `chmod`

**Cause:**
Project files or bind-mounted volumes are located on the Windows filesystem (`/mnt/c/...`) where Linux permissions behave differently. Some images (especially databases) require proper Linux file ownership/permissions.

**Solution:**
1. Ensure the repo is stored in the WSL filesystem, e.g.:
   - Good: `/home/<user>/repos/...`
   - Avoid: `/mnt/c/Users/<user>/...`
2. If you must work under `/mnt/c`, avoid bind-mounting database data directories. Prefer named volumes.
3. Recreate volumes if permissions are already broken:
   ```bash
   pnpm docker:down
   docker volume prune
   pnpm docker:up
   ```

**Verification:**
```bash
docker compose ps
# Postgres should become healthy
```

### Issue: Data not persisting

**Symptoms:**
- Database tables disappear after restarting Docker
- Postgres re-initializes on every `pnpm docker:up`

**Cause:**
Volumes are not configured, were pruned, or you are using ephemeral containers without persistent storage.

**Solution:**
1. Check that a named volume exists:
   ```bash
   docker volume ls
   ```
2. Ensure you are not running cleanup commands like `docker compose down -v` or `docker volume prune`.
3. If your compose file uses a bind mount, ensure the target directory exists and is writable.

**Verification:**
- Restart containers and confirm data remains:
  ```bash
  pnpm docker:down
  pnpm docker:up
  ```

### Issue: Corrupted data / migrations fail

**Symptoms:**
- Postgres logs show data directory errors
- `pnpm --filter @price-monitor/db push` fails unexpectedly after an unclean shutdown

**Cause:**
The Postgres data volume is corrupted, or your schema state is inconsistent with the local volume.

**Solution:**
1. Check Postgres logs:
   ```bash
   docker compose logs --tail=300 postgres
   ```
2. If you can connect, consider dumping data before reset.
3. Reset the local DB volume (DANGER: deletes local DB data):
   ```bash
   pnpm docker:down
   docker volume ls | grep price-monitor
   docker volume rm <postgres-volume-name>
   pnpm docker:up
   ```

**Verification:**
```bash
docker compose ps
pnpm --filter @price-monitor/db push
```

### Issue: Disk space errors

**Symptoms:**
- Docker fails with:
  ```
  no space left on device
  ```
- Image pulls fail even though you have free space in Windows

**Cause:**
Docker uses a dedicated disk image / storage area. On WSL2 this can fill up independently from your Windows C: drive.

**Solution:**
1. Check Docker disk usage:
   ```bash
   docker system df
   ```
2. Remove unused images/containers/networks:
   ```bash
   docker system prune
   ```
   If you also want to remove unused volumes (DANGER):
   ```bash
   docker system prune --volumes
   ```
3. In Docker Desktop, increase disk size if needed.

**Verification:**
```bash
docker system df
```

## Network Issues

### Issue: Containers can't reach internet

**Symptoms:**
- Image pulls time out
- Inside a container:
  ```
  ping: bad address
  curl: (6) Could not resolve host
  ```

**Cause:**
DNS/network is misconfigured for Docker, or a VPN/proxy is interfering.

**Solution:**
1. Test from host:
   ```bash
   curl -I https://example.com
   ```
2. Test from inside a container:
   ```bash
   docker run --rm busybox nslookup registry-1.docker.io
   ```
3. If you use a VPN, try disconnecting temporarily.
4. If you use a corporate proxy, see [Proxy / firewall problems](#issue-proxy--firewall-problems).
5. Restart Docker Desktop (WSL2) or Docker service (Linux).

**Verification:**
```bash
docker run --rm busybox nslookup google.com
```

### Issue: DNS resolution failures

**Symptoms:**
- `docker compose pull` fails with DNS errors
- `nslookup` inside containers fails

**Cause:**
Docker's embedded DNS resolver is failing, or WSL `resolv.conf` is misconfigured.

**Solution:**
1. Inspect DNS config in WSL:
   ```bash
   cat /etc/resolv.conf
   ```
2. For Docker Desktop + WSL2, restart Docker Desktop.
3. As a workaround, configure Docker daemon DNS servers (Docker Desktop: Settings -> Docker Engine):
   ```json
   {
     "dns": ["1.1.1.1", "8.8.8.8"]
   }
   ```
4. Retry pulls:
   ```bash
   docker compose pull
   ```

**Verification:**
```bash
docker run --rm busybox nslookup registry-1.docker.io
```

### Issue: Proxy / firewall problems

**Symptoms:**
- Docker pulls fail only on certain networks
- `curl` works on host but fails in containers

**Cause:**
Proxy settings are missing for Docker, or firewall rules block container traffic.

**Solution:**
1. Check if `HTTP_PROXY` / `HTTPS_PROXY` are set in your shell:
   ```bash
   env | grep -i proxy
   ```
2. If you need a proxy, configure it for Docker Desktop (Settings -> Resources -> Proxies) or Docker Engine.
3. If on a restricted network, try a different network to confirm.

**Verification:**
- `docker compose pull` succeeds
- `docker run --rm busybox wget -qO- https://example.com` succeeds

## Performance Issues

### Issue: Slow container startup

**Symptoms:**
- Postgres takes minutes to become healthy
- `docker compose up` is very slow on WSL

**Cause:**
WSL filesystem performance, low allocated resources, or heavy disk I/O when initializing databases.

**Solution:**
1. Ensure the repo is on the WSL filesystem (not `/mnt/c`). See [File system performance](#issue-file-system-performance-is-slow-under-mntc).
2. Increase Docker Desktop resources (memory/CPU) if possible.
3. Avoid running many heavy services at once.

**Verification:**
```bash
docker compose ps
# Postgres becomes healthy within a reasonable time
```

### Issue: High CPU / memory usage

**Symptoms:**
- Laptop fans spin up
- `docker stats` shows postgres/redis using lots of CPU/memory

**Cause:**
Insufficient resources, runaway queries, or repeated container restarts.

**Solution:**
1. Check container stats:
   ```bash
   docker stats
   ```
2. Check for restarts:
   ```bash
   docker compose ps
   ```
3. If postgres is repeatedly initializing, see [Data not persisting](#issue-data-not-persisting).
4. Restart the stack:
   ```bash
   pnpm docker:down
   pnpm docker:up
   ```

**Verification:**
- CPU stabilizes after startup
- Containers stop restarting

### Issue: Disk I/O problems

**Symptoms:**
- Very slow DB operations
- High disk usage in `docker stats`

**Cause:**
Database containers are sensitive to disk speed. WSL `/mnt/c` and antivirus scanning can make disk I/O slow.

**Solution:**
1. Keep DB volumes as named volumes (default) rather than bind mounts.
2. Store the repo under WSL home (`/home/...`).
3. Consider excluding Docker/WSL directories from antivirus indexing on Windows.

**Verification:**
- Startup time improves
- DB queries complete quickly

## WSL-Specific Issues

### Issue: Docker Desktop WSL2 integration not enabled

**Symptoms:**
- In WSL, `docker ps` fails, but Docker works in Windows
- Docker Desktop shows running, but WSL cannot connect

**Cause:**
WSL integration is disabled for your distro.

**Solution:**
1. Docker Desktop (Windows): `Settings -> Resources -> WSL Integration`
2. Enable integration for your distro
3. Restart the WSL terminal

**Verification:**
```bash
docker info
```

### Issue: File system performance is slow under /mnt/c

**Symptoms:**
- `pnpm install` is slow
- Docker bind mounts and file watching are slow

**Cause:**
Accessing Windows files from Linux (`/mnt/c/...`) is slower than native Linux FS, and permission semantics differ.

**Solution:**
1. Move the repository to the WSL filesystem:
   ```bash
   mkdir -p ~/repos
   cp -r /mnt/c/Users/<you>/path/to/price-monitoring-agent ~/repos/
   ```
2. Work from the WSL path:
   ```bash
   cd ~/repos/price-monitoring-agent
   ```

**Verification:**
- Commands run faster
- Fewer permission issues

### Issue: WSL networking is weird (localhost vs Windows)

**Symptoms:**
- Service works in WSL but not from Windows (or vice versa)
- Ports appear open but clients cannot connect

**Cause:**
WSL2 uses a virtualized network. Windows and WSL have different network interfaces and may route `localhost` differently depending on direction.

**Solution:**
1. Prefer running dev commands inside WSL.
2. If you must connect from Windows to a service in WSL, confirm the port is published and try using the WSL IP:
   ```bash
   hostname -I
   ```
3. If you must connect from WSL to a service running on Windows, try:
   ```bash
   cat /etc/resolv.conf | grep nameserver
   ```
   Often the Windows host is reachable via the nameserver IP.

**Verification:**
- Connection succeeds from the environment you are using

### Issue: WSL resource limits (memory/CPU)

**Symptoms:**
- Containers get killed
- Postgres becomes very slow
- The whole WSL VM feels sluggish

**Cause:**
WSL2 and Docker Desktop have resource limits. If memory is too low, Linux may kill processes (OOM).

**Solution:**
1. In Docker Desktop, increase allocated memory/CPU.
2. Optionally configure a `.wslconfig` on Windows to allocate more resources:
   https://learn.microsoft.com/en-us/windows/wsl/wsl-config
3. Restart WSL:
   ```powershell
   wsl --shutdown
   ```

**Verification:**
- `docker stats` shows stable usage
- Postgres starts reliably

## Diagnostic Commands

Use these commands to quickly collect information about what is wrong.

```bash
# Docker status
docker --version
docker info

docker compose version

docker ps
docker ps -a
docker compose ps

# Compose logs
docker compose logs --tail=200

docker compose logs --tail=200 postgres
docker compose logs --tail=200 redis

# Ports
sudo ss -lptn | grep -E ':5432|:6379'

# Disk usage
docker system df

# Volumes
docker volume ls

# WSL checks
uname -a
cat /etc/os-release

# WSL DNS
cat /etc/resolv.conf

# Resource usage
docker stats
```

## External References

- Docker Engine install: https://docs.docker.com/engine/install/
- Docker Desktop WSL2 backend: https://docs.docker.com/desktop/features/wsl/
- WSL configuration (.wslconfig): https://learn.microsoft.com/en-us/windows/wsl/wsl-config
- Docker Compose overview: https://docs.docker.com/compose/
