# Task 1.1: Stop and Remove Multipass VM

**Type:** Manual - Infrastructure
**Performer:** User
**Phase:** 1 - Local Development Simplification
**Dependencies:** None
**Estimated Time:** 2 minutes

---

## What

Stop and remove the Multipass VM (`coolify-local`) that was used in Implementation 2 for hosting PostgreSQL and Redis containers via Coolify.

---

## Objective

Clean up the old VM infrastructure to prevent:
- Resource conflicts (ports, memory)
- Confusion between old and new service locations
- Wasted system resources

This task prepares a clean slate for the docker-compose setup.

---

## How to Do

### Step 1: Check if VM Exists

```bash
multipass list
```

**Expected output if VM exists:**
```
Name                    State             IPv4             Release
coolify-local           Running           192.168.64.x     Ubuntu 22.04 LTS
```

**If VM doesn't exist:** Skip to "Success Criteria" - nothing to do.

### Step 2: Stop the VM

```bash
multipass stop coolify-local
```

This gracefully shuts down the VM and all containers running inside it.

**Wait for:** "coolify-local stopped" message or VM state changes to "Stopped" in `multipass list`.

### Step 3: Delete and Purge the VM

```bash
multipass delete coolify-local
multipass purge
```

**Commands explained:**
- `delete` marks the VM for deletion (soft delete)
- `purge` permanently removes all deleted VMs and their data

### Step 4: Verify Removal

```bash
multipass list
```

**Expected output:**
```
No instances found.
```

Or the `coolify-local` VM should not appear in the list.

---

## Technical Specifications

### VM Details (Being Removed)

- **VM Name:** coolify-local
- **Platform:** Multipass (lightweight Ubuntu VMs)
- **Resources:** 2 CPUs, 2GB RAM, 20GB disk
- **Services:** Coolify orchestrator, PostgreSQL, Redis
- **Network:** Bridged network with IP like 192.168.64.x

### Data Loss Warning

**Data in the VM will be permanently deleted** including:
- PostgreSQL database contents
- Redis cached data
- Coolify configuration

**Mitigation:** This is acceptable because:
1. Project is a demo application
2. Database schema can be recreated with `pnpm --filter @price-monitor/db push`
3. No critical production data exists

If you need to preserve data, export it before deletion:
```bash
# Export PostgreSQL (optional)
multipass exec coolify-local -- pg_dump -U postgres priceMonitor > backup.sql
```

---

## Deliverables

- [ ] Multipass VM stopped
- [ ] Multipass VM deleted and purged
- [ ] `multipass list` shows no `coolify-local` VM

---

## Verification Steps

Run these commands to verify successful completion:

```bash
# Should show no coolify-local VM
multipass list

# Should fail with "instance not found" (this is good)
multipass info coolify-local
```

**Expected result:** VM is gone, error message confirms it doesn't exist.

---

## Success Criteria

- [x] Ran `multipass list` and confirmed VM exists (or doesn't exist)
- [x] Stopped VM with `multipass stop coolify-local` (if it existed)
- [x] Deleted VM with `multipass delete coolify-local`
- [x] Purged VMs with `multipass purge`
- [x] Verified `multipass list` no longer shows `coolify-local`

---

## Notes

### If Multipass is Not Installed

If you get `command not found: multipass`, it means:
1. You never installed Multipass (good - skip this task)
2. OR you installed it differently

**Action:** Skip this task and proceed to Task 1.2.

### If You Want to Keep the VM

If you want to keep the VM for reference (not recommended):
1. Just stop it: `multipass stop coolify-local`
2. Don't run `delete` or `purge`

However, this may cause port conflicts with docker-compose (PostgreSQL 5432, Redis 6379).

### Optional: Uninstall Multipass Entirely

After removing the VM, you can uninstall Multipass:

**macOS:**
```bash
brew uninstall multipass
```

**Ubuntu/WSL:**
```bash
sudo snap remove multipass
```

**Windows:**
Uninstall via "Add or Remove Programs"

---

## Troubleshooting

### VM Won't Stop

**Symptom:** `multipass stop` hangs

**Solution:**
```bash
# Force stop
multipass stop coolify-local --force

# If still stuck, restart Multipass daemon
sudo systemctl restart snap.multipass.multipassd  # Linux
brew services restart multipass                    # macOS
```

### Delete Fails with "Instance is Running"

**Solution:** Stop the VM first, then delete:
```bash
multipass stop coolify-local --force
multipass delete coolify-local
multipass purge
```

### Purge Doesn't Free Disk Space

**Solution:** Multipass stores VMs in:
- macOS: `~/Library/Application Support/multipassd/`
- Linux: `/var/snap/multipass/common/`

Verify the directory is cleaned up after purge.

---

## Next Steps

After completing this task:
1. Proceed to **Task 1.2: Install Docker Desktop**
2. Confirm you no longer need to reference VM IP addresses
3. Update mental model: services now on `localhost`, not VM

---

**Task Status:** Ready for execution
