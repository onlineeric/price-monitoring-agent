# Price Monitor AI Agent – Overall Architecture

## Goal
A demo-friendly, low-cost, production-style system that:
- Monitors product prices from URLs
- Stores price history
- Sends daily digests and instant discount alerts
- Uses AI only where it adds real value
- Demonstrates senior-level system design + delivery practices

---

## Tech Stack

### Application
- **Frontend + API**: Next.js (TypeScript) → **Vercel**
- **Background Worker**: Node.js (Docker) → **Render**

### Data & Messaging
- **Database**: PostgreSQL → **Neon**
- **Redis**: **Upstash**
- **Queue**: **BullMQ** (uses Redis)

### Extraction & AI
- **Web extraction**: HTTP fetch + **Playwright** (fallback)
- **AI**: OpenAI API (fallback extraction + explanations)

### Email
- **Email service**: **Resend**
- **Templates**: **React Email**

---

## High-Level Components

### 1) Next.js App (Vercel)
**Responsibilities**
- Minimal UI:
  - Tracked products list
  - Current price + basic trend
- API routes:
  - Add / edit / remove products
  - Configure alert rules
  - Trigger manual recheck

---

### 2) Background Worker (Render)
**Responsibilities**
- Periodically checks product prices
- Runs extraction pipeline
- Stores price history
- Evaluates alert rules
- Sends notification emails

---

### 3) Price Extraction Pipeline
**Strategy**
1. Parse structured data / HTML
2. Use Playwright for JS-rendered pages
3. Use OpenAI only when extraction is uncertain

---

### 4) Notification System
**Emails**
- Daily digest (all tracked products)
- Instant alert (when rule is triggered)

**Delivery**
- Resend API + React Email templates

---

## Data Model (High Level)
- **Product**: URL, name, active flag, check interval
- **PricePoint**: productId, price, currency, timestamp
- **AlertRule**: productId, threshold configuration
- **RunLog** (optional): status + error info

---

## Job Flow (Simplified)
1. Product added via UI
2. API enqueues a “check price” job (BullMQ)
3. Worker processes the job: Fetch → Extract → Store
4. Alert rules evaluated and emails sent if triggered
5. Daily digest job runs once per day

---

## Hosting Summary
| Component | Platform |
|---|---|
| Web App | Vercel |
| Worker | Render |
| PostgreSQL | Neon |
| Redis | Upstash |
| Email | Resend |

---

## CI/CD (GitHub Actions)

### Approach
On every push/merge to `main`, GitHub Actions will:
1. Build & test the repo
2. Deploy **Web App** to Vercel
3. Build and deploy **Worker** to Render

### Web App Deploy (Vercel)
- Use Vercel’s official GitHub integration **or** deploy via GitHub Actions.
- Recommended for simplicity: **Vercel Git integration** (auto-deploy on `main`).

### Worker Deploy (Render)
- Build a Docker image and deploy to Render.
- Two valid approaches:
  - **Render builds from GitHub repo** on `main` (simplest)
  - **GitHub Actions builds image + triggers Render deploy** (more control)

### Docker Hub (Optional)
Not required, but you can use it if you want:
- GitHub Actions builds the worker Docker image
- Pushes to Docker Hub
- Render pulls that image to deploy

This is useful if you want:
- versioned images
- reproducible builds
- clear “CI pipeline” story

---

## Design Principles
- Separate web and background workloads
- Prefer managed services
- Keep costs minimal and demo performance high
- Use CI/CD to show production readiness
