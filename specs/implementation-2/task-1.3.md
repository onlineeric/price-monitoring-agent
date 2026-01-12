# Task 1.3: Create Ubuntu VM

**Type:** Manual
**Performer:** User
**Phase:** 1 - Local VM + CICD

---

## What

Create an Ubuntu 22.04 LTS virtual machine using Multipass with sufficient resources to run Coolify and containerized applications.

---

## Objective

This VM simulates the production DigitalOcean Droplet environment. It will host Coolify, PostgreSQL, Redis, and the web/worker containers for local testing before production deployment.

**Resource Specs:**
- 4GB RAM (matches production Droplet)
- 2 vCPUs
- 20GB disk space

---

## How to Do

Use Multipass CLI to launch a new Ubuntu 22.04 VM with the specified resource configuration. Name the VM `coolify-local` for easy identification. After creation, verify the VM is running.

**Reference command pattern:**
```bash
multipass launch <version> --name <vm-name> --cpus <count> --memory <size> --disk <size>
```

---

## Expected Results

**Success Criteria:**
- Ubuntu 22.04 LTS VM created
- VM named `coolify-local`
- VM allocated 4GB RAM, 2 CPUs, 20GB disk
- VM status shows "Running"

**How to Verify:**
- Run `multipass list`
- Should show `coolify-local` VM with State: Running
- Resource specs visible in the list output
