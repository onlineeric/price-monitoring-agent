# Task 1.3: Verify Docker Installation

**Type:** Manual - Verification
**Performer:** User
**Phase:** 1 - Local Development Simplification
**Dependencies:** Task 1.2 (Docker installed)
**Estimated Time:** 2 minutes

---

## What

Run a comprehensive verification of Docker and docker-compose installation to ensure the environment is ready for running PostgreSQL and Redis containers.

---

## Objective

Confirm that:
1. Docker daemon is running and accessible
2. docker-compose is functional
3. Container networking works correctly
4. Image pulling works (internet connectivity)

This prevents troubleshooting later when starting project services.

---

## How to Do

### Step 1: Check Docker Daemon Status

```bash
docker info
```

**Expected output includes:**
- Server Version: 20.10.x or newer
- Operating System: Docker Desktop or Ubuntu
- Containers: 0 running
- Images: Some number (from hello-world test)

**If command fails:** Docker daemon is not running. Start Docker Desktop or run `sudo systemctl start docker` (Linux).

### Step 2: Verify Docker Version

```bash
docker --version
docker-compose --version  # or: docker compose version
```

**Expected versions:**
- Docker: 20.10+ or newer
- Compose: 2.x or newer

### Step 3: Test Container Execution

```bash
docker run --rm hello-world
```

**Expected output:**
```
Hello from Docker!
This message shows that your installation appears to be working correctly.

To generate this message, Docker took the following steps:
 1. The Docker client contacted the Docker daemon.
 2. The Docker daemon pulled the "hello-world" image from the Docker Hub.
 3. The Docker daemon created a new container from that image...
 4. The Docker daemon streamed that output to the Docker client...

...
```

**What this tests:**
- Docker client → daemon communication
- Image pulling from Docker Hub
- Container creation and execution
- Output streaming

### Step 4: Test docker-compose

Create a temporary test file:

```bash
# Create test file
cat > /tmp/docker-compose-test.yml <<EOF
version: '3.8'
services:
  test:
    image: alpine:latest
    command: echo "docker-compose works!"
EOF

# Run test
docker-compose -f /tmp/docker-compose-test.yml up

# Clean up
rm /tmp/docker-compose-test.yml
```

**Expected output:**
```
Creating network "tmp_default" with the default driver
Creating tmp_test_1 ... done
Attaching to tmp_test_1
test_1  | docker-compose works!
tmp_test_1 exited with code 0
```

**Alternative command (Compose V2):**
```bash
docker compose -f /tmp/docker-compose-test.yml up
```

### Step 5: Check Docker Permissions (Linux only)

```bash
# Should return docker group membership
groups | grep docker

# Test running without sudo
docker ps
```

**If `docker ps` requires sudo:** Complete the group setup:
```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Step 6: Verify Network Connectivity

```bash
docker run --rm alpine:latest ping -c 3 google.com
```

**Expected output:**
```
PING google.com (xxx.xxx.xxx.xxx): 56 data bytes
64 bytes from xxx.xxx.xxx.xxx: seq=0 ttl=xx time=xx ms
...
--- google.com ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
```

**What this tests:**
- Container networking
- DNS resolution
- Outbound internet connectivity

---

## Technical Specifications

### Verification Checklist

1. **Docker Daemon:** Running and accessible
2. **Docker Version:** 20.10+ (24.x recommended)
3. **Compose Version:** 2.x (V2 syntax preferred)
4. **Image Pull:** Can download from Docker Hub
5. **Container Execution:** Can create and run containers
6. **Networking:** Containers can reach internet
7. **Permissions:** Can run Docker without sudo (Linux)

### Expected Environment

After this task, you should have:
- Docker daemon running in background
- Access to Docker Hub registry
- Ability to run containers
- docker-compose functional

---

## Deliverables

- [ ] `docker info` shows daemon status
- [ ] `docker --version` returns 20.10+
- [ ] `docker-compose --version` returns 2.x+
- [ ] `docker run hello-world` succeeds
- [ ] docker-compose test file runs successfully
- [ ] Containers can access internet

---

## Verification Steps

Run all commands from "How to Do" section and confirm:

1. **No errors** in any command
2. **hello-world** message displayed
3. **docker-compose** test echoes "docker-compose works!"
4. **Network test** shows successful pings

---

## Success Criteria

- [x] `docker info` shows running daemon
- [x] Docker version is 20.10+ or newer
- [x] docker-compose version is 2.x or newer
- [x] `docker run hello-world` completes successfully
- [x] docker-compose test file runs without errors
- [x] Containers can ping external hosts
- [x] Docker commands work without sudo (Linux only)

---

## Notes

### Why This Matters

This task catches common issues:
- Docker daemon not running
- Permissions not configured
- Network/proxy problems
- docker-compose not installed

Catching these now saves time in Task 1.4 (starting services).

### Docker Desktop Users

If using Docker Desktop, you should see:
- Green "Docker Desktop is running" in system tray
- `docker context ls` shows "desktop-linux" as current

### Compose Command Variants

Both work in Implementation 3:
- `docker-compose` (V1 standalone)
- `docker compose` (V2 plugin)

Specs use `docker-compose` for compatibility, but V2 is preferred.

---

## Troubleshooting

### Cannot Connect to Docker Daemon

**Symptom:**
```
Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

**Solutions:**

**Docker Desktop:**
1. Ensure Docker Desktop is running (check system tray)
2. Restart Docker Desktop
3. Check WSL integration enabled in settings

**Docker Engine:**
```bash
# Start daemon
sudo systemctl start docker

# Enable auto-start
sudo systemctl enable docker
```

### hello-world Fails: Image Not Found

**Symptom:**
```
Unable to find image 'hello-world:latest' locally
Error response from daemon: Get https://registry-1.docker.io/v2/: ...
```

**Solutions:**
1. Check internet connection: `ping docker.io`
2. Check proxy settings (if behind corporate proxy)
3. Verify firewall allows Docker Hub access

**Configure proxy (if needed):**
```bash
# Create Docker config
mkdir -p ~/.docker
cat > ~/.docker/config.json <<EOF
{
  "proxies": {
    "default": {
      "httpProxy": "http://proxy.example.com:8080",
      "httpsProxy": "http://proxy.example.com:8080"
    }
  }
}
EOF
```

### docker-compose: command not found

**Solution:**
```bash
# Check if compose plugin is installed
docker compose version

# If not, install it
sudo apt-get install docker-compose-plugin  # Linux

# Or update Docker Desktop to latest version
```

### Permission Denied (socket access)

**Symptom:**
```
permission denied while trying to connect to the Docker daemon socket
```

**Solution:**
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Logout and login, or:
newgrp docker

# Verify
docker ps  # Should work without sudo
```

### Container Cannot Reach Internet

**Symptom:** Ping fails in Step 6

**Solutions:**

**WSL:**
```bash
# Check DNS in WSL
cat /etc/resolv.conf

# If needed, update WSL DNS
echo "[network]" | sudo tee /etc/wsl.conf
echo "generateResolvConf = false" | sudo tee -a /etc/wsl.conf
sudo rm /etc/resolv.conf
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf

# Restart WSL
wsl --shutdown  # Run in PowerShell
```

**Docker Desktop:**
1. Check Docker Desktop → Settings → Resources → Network
2. Try different DNS: 8.8.8.8 or 1.1.1.1

---

## Next Steps

After completing this task:
1. Proceed to **Task 1.7: Create docker-compose.yml** (AI task)
2. Confirm you understand basic Docker commands
3. Optionally explore Docker Desktop dashboard

**Note:** Task 1.4 (start services) depends on Task 1.7 (config file), so we'll do AI tasks next.

---

**Task Status:** Ready for execution
