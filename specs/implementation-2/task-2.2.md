# Task 2.2: Create Droplet in Sydney

**Type:** Manual
**Performer:** User
**Phase:** 2 - Production Deployment

---

## What

Create a DigitalOcean Droplet (Virtual Machine) in the Sydney region with Ubuntu 22.04 LTS and 4GB RAM to host the production Coolify instance.

---

## Objective

This Droplet serves as the production server for all services:
- Coolify orchestration platform
- PostgreSQL database
- Redis cache/queue
- Web and worker containers

**Specifications:**
- **Region:** Sydney (SYD1) - low latency for AU/NZ usage
- **OS:** Ubuntu 22.04 LTS - matches local VM
- **Size:** 4GB RAM, 2 vCPUs, 80GB SSD - matches local VM specs
- **SSH Key:** Added for secure access

---

## How to Do

In DigitalOcean dashboard, create a new Droplet. Choose Sydney as the region, Ubuntu 22.04 as the image, and the Basic plan with 4GB RAM. Add your SSH key for authentication (create one if needed). Set hostname to `price-monitor-prod`. Wait for provisioning to complete, then document the assigned IP address.

**Cost:** ~$24/month (verify current pricing)

---

## Expected Results

**Success Criteria:**
- Droplet created in Sydney (SYD1) region
- Ubuntu 22.04 LTS installed
- 4GB RAM, 2 vCPUs, 80GB SSD allocated
- SSH key configured
- Droplet status: Running (green)
- IP address assigned and documented
- Hostname set to `price-monitor-prod`

**How to Verify:**
- DigitalOcean dashboard shows Droplet in Droplets list
- Droplet status shows green "Active"
- IP address visible in dashboard
- Can copy IP address for use in next tasks
