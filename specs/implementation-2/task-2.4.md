# Task 2.4: SSH into Droplet

**Type:** Manual
**Performer:** User
**Phase:** 2 - Production Deployment

---

## What

Establish SSH connection to the production Droplet and perform initial system update.

---

## Objective

Verify SSH access works correctly and prepare the server for Coolify installation by:
- Testing SSH authentication
- Updating system packages
- Confirming root access

---

## How to Do

Using the Droplet IP address from task 2.2, connect via SSH from your terminal. Accept the SSH fingerprint when prompted. Once connected, run system updates to ensure all packages are current. Document successful access.

**SSH Command Format:**
```bash
ssh root@<droplet-ip>
```

---

## Expected Results

**Success Criteria:**
- SSH connection successful
- Logged in as root user
- System packages updated (`apt update && apt upgrade -y`)
- No connection errors
- Server responsive

**How to Verify:**
- Terminal shows Ubuntu welcome message
- Prompt shows: `root@price-monitor-prod:~#`
- System update completes without errors
- Can run basic commands (ls, pwd, etc.)
