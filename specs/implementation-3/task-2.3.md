# Task 2.3: Configure Droplet Firewall

**Type:** Manual
**Performer:** User
**Phase:** 2 - Production Deployment

---

## What

Create and apply a firewall to the Droplet that restricts access to only necessary ports.

---

## Objective

Security is critical for production. The firewall ensures:
- SSH (port 22) only accessible from your IP
- HTTP (port 80) accessible from anywhere (for web UI)
- HTTPS (port 443) accessible from anywhere (for SSL)
- All other ports blocked
- Outbound traffic allowed

This protects the server from unauthorized access while allowing legitimate traffic.

---

## How to Do

In DigitalOcean dashboard, navigate to the Networking section and create a new firewall. Configure inbound rules for SSH (22, your IP only), HTTP (80, all IPs), and HTTPS (443, all IPs). Allow all outbound traffic. Apply the firewall to the `price-monitor-prod` Droplet.

**Inbound Rules:**
- SSH (22) → Your IP address
- HTTP (80) → All IPv4, All IPv6
- HTTPS (443) → All IPv4, All IPv6

**Outbound Rules:**
- All protocols → All destinations

---

## Expected Results

**Success Criteria:**
- Firewall created with name like `price-monitor-firewall`
- Inbound rules configured (SSH, HTTP, HTTPS)
- SSH restricted to your IP
- HTTP/HTTPS open to all
- Outbound rules allow all traffic
- Firewall applied to Droplet
- Firewall status: Active

**How to Verify:**
- DigitalOcean Firewall section shows the firewall
- Firewall details show correct rules
- Droplet shows firewall applied
- SSH connection works from your IP
- SSH connection fails from other IPs (optional test with VPN)
