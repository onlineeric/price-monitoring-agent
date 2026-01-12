# Task 1.2: Install Multipass

**Type:** Manual
**Performer:** User
**Phase:** 1 - Local VM + CICD

---

## What

Install Multipass on Windows development machine to enable creation of Ubuntu VMs for local testing.

---

## Objective

Multipass provides lightweight Ubuntu VMs that simulate the production DigitalOcean Droplet environment. This allows testing the entire deployment infrastructure locally before spending money on cloud resources.

---

## How to Do

Download Multipass installer for Windows from the official website and run the installer with administrator privileges. After installation, verify that the Multipass CLI is available in the command prompt.

---

## Expected Results

**Success Criteria:**
- Multipass installed on Windows machine
- Multipass CLI accessible from command prompt
- Version command returns valid output

**How to Verify:**
- Open command prompt
- Run `multipass version`
- Should display Multipass version number (e.g., "multipass 1.x.x")
