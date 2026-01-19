# Task 1.2: Install Docker Desktop

**Type:** Manual - Infrastructure
**Performer:** User
**Phase:** 1 - Local Development Simplification
**Dependencies:** Task 1.1 (VM removed)
**Estimated Time:** 5-10 minutes

---

## What

Install Docker Desktop (or Docker Engine) on WSL Ubuntu to run PostgreSQL and Redis containers locally via docker-compose.

---

## Objective

Provide the container runtime needed for Implementation 3's docker-compose setup. Docker replaces the Multipass VM as the container platform for local development services.

---

## How to Do

### Option A: Docker Desktop (Recommended for WSL)

Docker Desktop integrates seamlessly with WSL2 and provides a GUI for managing containers.

#### Step 1: Download Docker Desktop

Visit: https://www.docker.com/products/docker-desktop

**System Requirements:**
- Windows 10/11 with WSL2 enabled
- 4GB RAM minimum
- Virtualization enabled in BIOS

#### Step 2: Install Docker Desktop

1. Run the installer (`.exe` file)
2. During installation, ensure "Use WSL 2 instead of Hyper-V" is checked
3. Complete installation and restart if prompted

#### Step 3: Start Docker Desktop

1. Launch Docker Desktop from Start Menu
2. Wait for "Docker Desktop is running" in system tray
3. Accept the Docker Subscription Service Agreement (free for personal use)

#### Step 4: Enable WSL Integration

1. Open Docker Desktop Settings
2. Navigate to "Resources" → "WSL Integration"
3. Enable integration for your Ubuntu distribution
4. Click "Apply & Restart"

#### Step 5: Verify Installation in WSL

Open WSL Ubuntu terminal:

```bash
docker --version
docker-compose --version
```

**Expected output:**
```
Docker version 24.0.x, build xxxxxx
Docker Compose version v2.x.x
```

### Option B: Docker Engine (Alternative for Linux)

If you prefer the CLI-only version or Docker Desktop isn't available:

#### Step 1: Install Docker Engine

```bash
# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up the repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add your user to docker group (avoid sudo)
sudo usermod -aG docker $USER

# Apply group membership (or logout/login)
newgrp docker
```

#### Step 2: Start Docker Service

```bash
sudo systemctl start docker
sudo systemctl enable docker
```

#### Step 3: Verify Installation

```bash
docker --version
docker compose version  # Note: no hyphen with plugin
```

---

## Technical Specifications

### Docker Components Needed

1. **Docker Engine:** Container runtime
2. **docker-compose (or compose plugin):** Multi-container orchestration
3. **Docker CLI:** Command-line interface

### Version Requirements

- **Docker:** 20.10.x or newer
- **Docker Compose:** 2.x or newer (Compose V2 with `docker compose` command)

**Note:** Compose V1 (`docker-compose` with hyphen) is deprecated. Prefer V2.

### Resource Allocation

Docker Desktop allows configuring:
- **Memory:** 4GB recommended (2GB minimum)
- **CPUs:** 2 cores recommended
- **Disk:** 20GB recommended

**Location:** Docker Desktop Settings → Resources

---

## Deliverables

- [ ] Docker installed and running
- [ ] docker-compose (or compose plugin) available
- [ ] Docker daemon accessible without sudo (Linux only)
- [ ] Version commands return expected output

---

## Verification Steps

Run these commands in WSL Ubuntu terminal:

```bash
# Check Docker version
docker --version

# Check Compose version
docker-compose --version  # Docker Desktop
docker compose version    # Docker Engine with plugin

# Test Docker with hello-world
docker run hello-world
```

**Expected output for hello-world:**
```
Hello from Docker!
This message shows that your installation appears to be working correctly.
...
```

### Verify Docker Desktop WSL Integration (if using Desktop)

```bash
# Check Docker context
docker context ls

# Should show "desktop-linux" as current context
```

---

## Success Criteria

- [x] Docker installed (Desktop or Engine)
- [x] `docker --version` returns 20.10+ or newer
- [x] `docker-compose --version` or `docker compose version` works
- [x] `docker run hello-world` succeeds
- [x] Docker commands work without sudo (Linux)
- [x] Docker Desktop running (if using Desktop)

---

## Notes

### Docker Desktop vs Docker Engine

| Feature | Docker Desktop | Docker Engine |
|---------|----------------|---------------|
| **GUI** | Yes | No |
| **WSL Integration** | Automatic | Manual setup |
| **Compose** | Included (V2) | Plugin install |
| **Resource Limits** | Configurable UI | System-wide |
| **License** | Free (personal) | Open source |

**Recommendation:** Use Docker Desktop for easier WSL integration.

### Docker Compose V1 vs V2

Implementation 3 specs use **V2 syntax**:
- Command: `docker compose` (no hyphen)
- Provided by: docker-compose-plugin

If you have V1 (`docker-compose`), it should still work, but V2 is preferred.

### Disk Space Considerations

Docker images and volumes consume disk space:
- PostgreSQL image: ~200MB
- Redis image: ~40MB
- Volumes: Depends on data (likely <100MB for this project)

**Total:** ~500MB with overhead

---

## Troubleshooting

### Docker Desktop Won't Start (WSL)

**Symptom:** "Docker Desktop starting..." never completes

**Solutions:**
1. Ensure WSL2 is installed: `wsl --set-default-version 2`
2. Update WSL: `wsl --update`
3. Restart WSL: `wsl --shutdown` then reopen terminal
4. Check Windows virtualization: Enable "Virtual Machine Platform" in Windows Features

### Command Not Found: docker

**Symptom:** `docker: command not found` in WSL

**Solutions:**
1. Restart terminal to refresh PATH
2. Verify Docker Desktop is running (system tray)
3. Check WSL integration enabled in Docker Desktop settings

### Permission Denied (Linux)

**Symptom:** `permission denied while trying to connect to the Docker daemon socket`

**Solution:**
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Logout and login, OR:
newgrp docker

# Verify group membership
groups | grep docker
```

### hello-world Fails to Pull

**Symptom:** `Error response from daemon: Get https://registry-1.docker.io/v2/: net/http: request canceled`

**Solutions:**
1. Check internet connection
2. Check proxy settings (if behind corporate proxy)
3. Restart Docker daemon:
   ```bash
   sudo systemctl restart docker  # Linux
   # Or restart Docker Desktop
   ```

### Docker Compose Not Found

**Symptom:** `docker-compose: command not found`

**Solution for Docker Engine:**
```bash
# Install compose plugin
sudo apt-get update
sudo apt-get install docker-compose-plugin

# Use: docker compose (no hyphen)
docker compose version
```

---

## Next Steps

After completing this task:
1. Proceed to **Task 1.3: Verify Docker Installation**
2. Confirm Docker daemon is running
3. Familiarize yourself with Docker Desktop dashboard (if using Desktop)

---

**Task Status:** Ready for execution
