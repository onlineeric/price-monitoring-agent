# Task 1.4: Configure VM Networking

**Type:** Manual
**Performer:** User
**Phase:** 1 - Local VM + CICD

---

## What

Obtain the VM's IP address, verify network connectivity from the host machine, and test SSH access.

---

## Objective

The VM needs to be accessible from the host machine for:
- Accessing Coolify dashboard in browser (`http://<vm-ip>:8000`)
- Connecting to PostgreSQL and Redis from local development
- SSH access for VM management

This task ensures network connectivity is working before installing services.

---

## How to Do

Use Multipass CLI to get the VM's IP address. Test connectivity using ping from the host machine. Verify SSH access using Multipass shell command. Document the VM IP address for use in subsequent tasks.

---

## Expected Results

**Success Criteria:**
- VM IP address obtained and documented
- Ping successful from host to VM
- SSH access verified

**How to Verify:**
- Run `multipass info coolify-local` - should show IP address
- Run `ping <vm-ip>` from host - should get replies
- Run `multipass shell coolify-local` - should open SSH session into VM
