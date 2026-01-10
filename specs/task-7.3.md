# Technical Spec: Phase 7.3 - Production Deployment

**Phase:** 7.3
**Goal:** Complete production setup guide for all cloud services and verify the entire system works end-to-end in production.
**Context:** This is the final deployment phase. We'll set up Neon (PostgreSQL), Upstash (Redis), Resend (Email), Vercel (Web App + Cron), and Render (Worker), configure all environment variables, run migrations, and verify the complete system works in production.

---

## Prerequisites

* **Task 7.2:** GitHub Actions CI/CD pipeline configured.
* **Task 7.1:** Docker configuration complete.
* **All phases 1-6:** Complete and tested locally.

---

## Architecture Context

### Production Infrastructure

```
┌──────────────────────────────────────────────────────────┐
│                    Production Stack                       │
├──────────────────────────────────────────────────────────┤
│  Vercel          → Next.js Web App + API + Cron         │
│  Render          → Worker (Docker container)             │
│  Neon            → PostgreSQL Database                   │
│  Upstash         → Redis (BullMQ queue)                  │
│  Resend          → Email delivery                        │
│  GitHub          → Source code + CI/CD                   │
│  GHCR            → Docker image registry                 │
└──────────────────────────────────────────────────────────┘
```

**Deployment Flow:**
1. Push to main → GitHub Actions builds worker → GHCR
2. Render auto-deploys worker from GHCR
3. Vercel auto-deploys web app from GitHub
4. All services connect to shared Neon DB and Upstash Redis

---

## Step 1: Set Up Neon Database (Manual Step)

**User Action:**

### 1.1: Create Neon Account and Project

1. Go to [neon.tech](https://neon.tech)
2. Click **Sign Up** (free tier includes 0.5GB storage)
3. Sign up with GitHub (recommended) or email
4. After login, click **Create a project**
5. Configure project:
   - **Project name:** `price-monitor`
   - **Database name:** `neondb` (default is fine)
   - **Region:** Choose closest to your users
   - **Postgres version:** Latest (15 or 16)
6. Click **Create project**

### 1.2: Get Database Connection String

1. In your Neon project dashboard, you'll see **Connection Details**
2. Copy the **Connection string** (looks like: `postgresql://user:password@ep-xyz.region.aws.neon.tech/neondb`)
3. **Important:** Select **Pooled connection** for better performance with serverless
4. Save this URL - you'll need it for environment variables

### 1.3: Test Connection (Optional)

Using Drizzle Studio locally:

```powershell
# In packages/db, create temporary .env
cd packages/db
echo "DATABASE_URL=your-neon-url-here" > .env

# Test connection with Drizzle Studio
pnpm studio
```

If it opens successfully, connection works!

---

## Step 2: Set Up Upstash Redis (Manual Step)

**User Action:**

### 2.1: Create Upstash Account and Database

1. Go to [upstash.com](https://upstash.com)
2. Click **Sign Up** (free tier includes 10,000 commands/day)
3. Sign up with GitHub or email
4. After login, click **Create database**
5. Configure database:
   - **Name:** `price-monitor-queue`
   - **Type:** Regional (cheaper, lower latency)
   - **Region:** Choose same region as Neon if possible
   - **Eviction:** No eviction (recommended for queue)
6. Click **Create**

### 2.2: Get Redis Connection URL

1. In your Upstash database dashboard, scroll to **REST API** section
2. Copy **UPSTASH_REDIS_REST_URL** (looks like: `https://xyz.upstash.io`)
3. Or use the **Redis URL** for standard connection (looks like: `redis://default:password@xyz.upstash.io:6379`)

**Note:** BullMQ works with standard Redis URL. Use the format:
```
redis://default:<password>@<endpoint>:6379
```

You can find the password in the database details.

---

## Step 3: Verify Resend (Already Set Up) (Manual Step)

**User Action:**

You should already have Resend configured from Phase 4.2. Verify:

1. Go to [resend.com](https://resend.com)
2. Log in to your account
3. Go to **API Keys** → verify you have an API key
4. Go to **Domains** → verify your domain or use `onboarding@resend.dev` for testing

**If not set up yet:**
1. Sign up at [resend.com](https://resend.com)
2. Create an API key
3. (Optional) Add and verify your domain for production emails

---

## Step 4: Deploy Web App to Vercel (Manual Step)

**User Action:**

### 4.1: Create Vercel Account and Import Project

1. Go to [vercel.com](https://vercel.com)
2. Click **Sign Up** (free tier includes 100GB bandwidth)
3. Sign up with GitHub (recommended)
4. After login, click **Add New...** → **Project**
5. Click **Import** next to your `price-monitoring-agent` repository
6. Configure project:
   - **Framework Preset:** Next.js (auto-detected)
   - **Root Directory:** `apps/web`
   - **Build Command:** `cd ../.. && pnpm install && pnpm --filter @price-monitor/web build`
   - **Output Directory:** `apps/web/.next`
   - **Install Command:** `pnpm install`

### 4.2: Configure Environment Variables

In the Vercel project settings, add these environment variables:

**Database:**
```
DATABASE_URL = <your-neon-connection-string>
```

**Redis:**
```
REDIS_URL = <your-upstash-redis-url>
```

**Important:** Click **Add** for each variable. These will be used in all environments (Production, Preview, Development).

### 4.3: Deploy

1. Click **Deploy**
2. Wait for deployment (~2-5 minutes)
3. You'll get a URL like: `https://price-monitoring-agent.vercel.app`
4. Click on the URL to verify deployment

### 4.4: Configure Vercel Cron

1. In your Vercel project dashboard, go to **Settings** → **Cron Jobs**
2. Click **Create Cron Job**
3. Configure:
   - **Path:** `/api/cron/check-all`
   - **Schedule (Cron expression):** `*/30 * * * *` (every 30 minutes)
   - **Timezone:** Your timezone (or UTC)
4. Click **Create**

**Or use vercel.json:**

Ensure your `vercel.json` in repository root has:
```json
{
  "crons": [
    {
      "path": "/api/cron/check-all",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

Then commit and push - Vercel will auto-configure.

### 4.5: Optional - Add Cron Secret

For added security:

1. In Vercel project settings → Environment Variables
2. Add:
   ```
   CRON_SECRET = <random-secret-string>
   ```
3. Vercel Cron will automatically include this in the `Authorization` header

---

## Step 5: Deploy Worker to Render (Manual Step)

**User Action:**

### 5.1: Create Render Web Service

**Note:** You may have already created this in Phase 7.2. If so, just configure environment variables.

1. Go to [render.com](https://render.com)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure service:
   - **Name:** `price-monitor-worker`
   - **Region:** Same as Neon/Upstash if possible
   - **Branch:** `main`
   - **Runtime:** Docker
   - **Docker Build Context Directory:** `.` (root)
   - **Dockerfile Path:** `apps/worker/Dockerfile`
   - **Docker Command:** (leave empty, uses CMD from Dockerfile)
5. **Instance Type:**
   - Free tier: Limited to 750 hours/month, sleeps after inactivity
   - **Starter ($7/month):** Recommended - always on, better performance
6. Scroll down, **DO NOT CLICK CREATE YET**

### 5.2: Configure Environment Variables

Before clicking Create, add these environment variables:

**Database:**
```
DATABASE_URL = <your-neon-connection-string>
```

**Redis:**
```
REDIS_URL = <your-upstash-redis-url>
```

**AI Provider:**
```
AI_PROVIDER = anthropic
OPENAI_API_KEY = <your-openai-key>
OPENAI_MODEL = gpt-5-mini
GOOGLE_GENERATIVE_AI_API_KEY = <your-google-key>
GOOGLE_MODEL = gemini-2.5-flash
ANTHROPIC_API_KEY = <your-anthropic-key>
ANTHROPIC_MODEL = claude-haiku-4-5
```

**Debug:**
```
FORCE_AI_EXTRACTION = false
```

**Email:**
```
RESEND_API_KEY = <your-resend-key>
EMAIL_FROM = Price Monitor <alerts@yourdomain.com>
ALERT_EMAIL = <your-email@example.com>
```

**Node Environment:**
```
NODE_ENV = production
```

### 5.3: Deploy

1. Click **Create Web Service**
2. Wait for initial deployment (~10-15 minutes for first build)
3. Watch the **Logs** tab to verify:
   - Docker image pulled from GHCR
   - Dependencies installed
   - Worker started successfully
   - Connected to Redis
   - Listening for jobs

**Expected logs:**
```
[Worker] Starting price monitor worker...
[Worker] Redis connected
[Worker] Worker started and waiting for jobs
```

### 5.4: Configure Auto-Deploy from GHCR

1. In Render service settings, find **Image URL**
2. Set to: `ghcr.io/<your-github-username>/price-monitoring-agent/worker:latest`
3. Enable **Auto-Deploy:** Yes
4. Save changes

Now whenever GitHub Actions pushes a new image to GHCR, Render will automatically deploy it.

---

## Step 6: Run Database Migrations (Manual Step)

**User Action:**

### 6.1: Run Migrations from Local Machine

```powershell
# Set production database URL
$env:DATABASE_URL="<your-neon-connection-string>"

# Navigate to db package
cd packages/db

# Push schema to production database
pnpm push
```

### 6.2: Verify Tables Created

1. Go to Neon dashboard → your project
2. Click **SQL Editor**
3. Run query:
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public';
   ```
4. Verify tables exist:
   - `products`
   - `price_records`
   - `settings`
   - `run_logs`

### 6.3: Initialize Default Settings

In Neon SQL Editor, run:

```sql
INSERT INTO settings (key, value, updated_at)
VALUES ('email_schedule', '{"frequency":"daily","hour":9}', NOW())
ON CONFLICT DO NOTHING;
```

---

## Step 7: End-to-End Production Testing (Manual Step)

**User Action:**

### 7.1: Test Web App

1. Open your Vercel URL: `https://your-app.vercel.app`
2. Verify dashboard loads
3. Try adding a product:
   - Fill in URL (e.g., `https://www.amazon.com/dp/B0...`)
   - Click "Add Product"
   - Verify success message

### 7.2: Verify Worker Processes Job

1. Go to Render dashboard → `price-monitor-worker` → **Logs**
2. You should see:
   ```
   [<job-id>] Processing price check for URL: https://...
   [Scraper] Trying HTML fetcher for: https://...
   [Scraper] HTML fetcher succeeded
   [<job-id>] Price saved to database
   ```

### 7.3: Verify Data in Database

1. Go to Neon dashboard → SQL Editor
2. Query products:
   ```sql
   SELECT * FROM products ORDER BY created_at DESC LIMIT 5;
   ```
3. Query price records:
   ```sql
   SELECT * FROM price_records ORDER BY scraped_at DESC LIMIT 10;
   ```
4. Verify your product and price appear

### 7.4: Test Manual Digest Trigger

1. On your Vercel app, scroll to **Manual Digest Trigger**
2. Click **"Check All & Send Email"**
3. Verify success message
4. Check Render worker logs for:
   ```
   [Digest Flow] All child jobs completed, sending email...
   [Email] Digest sent successfully
   ```
6. Check your email inbox for digest email

### 7.5: Test Scheduled Cron

Wait 30 minutes (or until next 30-minute mark), then:

1. Go to Vercel → your project → **Deployments**
2. Click on latest deployment → **Functions** tab
3. Find `/api/cron/check-all` function
4. Check logs (may take a few minutes to appear)
5. Verify cron runs and decides whether to send

**Or check Render worker logs** for digest job activity around :00 and :30 each hour.

### 7.6: Test Settings Update

1. On your app, go to **Email Schedule Settings**
2. Change to weekly on Monday at 10:00
3. Save settings
4. Verify success message
5. Refresh page - verify setting persisted

---

## Step 8: Production Monitoring Setup (Manual Step)

**User Action:**

### 8.1: Vercel Monitoring

1. Go to Vercel project dashboard
2. Click **Analytics** tab
3. Monitor:
   - Page views
   - API requests
   - Function executions (including cron)

### 8.2: Render Monitoring

1. Go to Render service dashboard
2. Monitor:
   - **Logs:** Real-time worker activity
   - **Metrics:** CPU, memory usage
   - **Events:** Deployment history

### 8.3: Upstash Monitoring

1. Go to Upstash database dashboard
2. Monitor:
   - Commands/day (stay under free tier limit)
   - Memory usage
   - Connection count

### 8.4: Neon Monitoring

1. Go to Neon project dashboard
2. Monitor:
   - Storage usage (stay under 0.5GB free tier)
   - Active connections
   - Query performance

### 8.5: Resend Monitoring

1. Go to Resend dashboard
2. Monitor:
   - Emails sent today
   - Delivery rate
   - Bounce/complaint rates

---

## Environment Variables Checklist

**Vercel (Web App):**
```
✓ DATABASE_URL
✓ REDIS_URL
✓ CRON_SECRET (optional)
```

**Render (Worker):**
```
✓ DATABASE_URL
✓ REDIS_URL
✓ AI_PROVIDER
✓ OPENAI_API_KEY
✓ OPENAI_MODEL
✓ GOOGLE_GENERATIVE_AI_API_KEY
✓ GOOGLE_MODEL
✓ ANTHROPIC_API_KEY
✓ ANTHROPIC_MODEL
✓ FORCE_AI_EXTRACTION
✓ RESEND_API_KEY
✓ EMAIL_FROM
✓ ALERT_EMAIL
✓ NODE_ENV
```

**GitHub Secrets:**
```
✓ RENDER_DEPLOY_HOOK_URL
```

---

## Production URLs Reference

Save these for easy access:

```
Web App (Vercel):     https://your-app.vercel.app
Worker Logs (Render): https://dashboard.render.com/web/<service-id>
Database (Neon):      https://console.neon.tech/app/projects/<project-id>
Redis (Upstash):      https://console.upstash.com/redis/<db-id>
Email (Resend):       https://resend.com/emails
GitHub Actions:       https://github.com/<user>/<repo>/actions
Docker Images (GHCR): https://github.com/<user>/<repo>/pkgs/container/worker
```

---

## Troubleshooting

### Issue: Worker not processing jobs

**Cause:** Redis connection issue or queue name mismatch.

**Solution:**
1. Check Render logs for connection errors
2. Verify `REDIS_URL` is correct in Render environment variables
3. Verify queue name is `price-monitor-queue` in both web and worker

### Issue: Vercel deployment fails

**Cause:** Build command can't find dependencies.

**Solution:**
1. Verify Root Directory is set to `apps/web`
2. Verify Build Command includes `cd ../.. && pnpm install`
3. Check build logs for specific error

### Issue: Cron not running

**Cause:** Vercel Cron only works in production, not preview.

**Solution:**
1. Ensure cron configured in production environment
2. Check Vercel Functions logs (may take 30+ min for first run)
3. Manually test endpoint: `curl https://your-app.vercel.app/api/cron/check-all`

### Issue: Database migrations fail

**Cause:** Connection string format or permissions.

**Solution:**
1. Use **pooled connection** string from Neon (not direct)
2. Verify connection string includes `?sslmode=require`
3. Test connection with Drizzle Studio first

### Issue: Email not sending

**Cause:** Resend API key invalid or domain not verified.

**Solution:**
1. Verify `RESEND_API_KEY` in Render environment variables
2. Check Resend dashboard for email status
3. Use `onboarding@resend.dev` sender for testing

### Issue: Worker keeps restarting

**Cause:** Crash on startup or memory limit.

**Solution:**
1. Check Render logs for error messages
2. Verify all environment variables are set
3. Upgrade to Starter plan if on free tier (more memory)

---

## Cost Breakdown

**Monthly costs (estimated):**

| Service | Free Tier | Paid Tier | Recommendation |
|---------|-----------|-----------|----------------|
| Neon | 0.5GB storage | $19/mo (3GB) | Free tier sufficient initially |
| Upstash | 10K commands/day | $0.2/100K commands | Free tier sufficient |
| Resend | 100 emails/day | $20/mo (50K emails) | Free tier sufficient |
| Vercel | 100GB bandwidth | $20/mo (1TB) | Free tier sufficient |
| Render | 750 hrs/mo | $7/mo (24/7 uptime) | **Starter recommended** |
| **Total** | **$0** (with limits) | **$7-27/mo** | **$7/mo recommended** |

**Recommendation:** Start with free tier + Render Starter ($7/mo) for reliable 24/7 worker.

---

## Completion Criteria

Task 7.3 is complete when:

- [ ] Neon database created and connection string obtained
- [ ] Upstash Redis created and connection string obtained
- [ ] Resend account verified
- [ ] Vercel project deployed with all environment variables
- [ ] Vercel Cron configured (every 30 minutes)
- [ ] Render worker deployed with all environment variables
- [ ] Database migrations run successfully in production
- [ ] Default settings initialized
- [ ] Can add products via web UI
- [ ] Worker processes price check jobs
- [ ] Manual digest trigger works
- [ ] Digest email received successfully
- [ ] Scheduled cron executes correctly
- [ ] All services communicating properly
- [ ] No errors in logs
- [ ] Production monitoring set up

---

## Post-Deployment Checklist

**After successful deployment:**

1. **Test all features:**
   - [ ] Add product
   - [ ] View dashboard
   - [ ] Manual price check
   - [ ] Manual digest trigger
   - [ ] Email received
   - [ ] Settings updated
   - [ ] Scheduled cron (wait 30 min)

2. **Monitor for 24 hours:**
   - [ ] Check Render logs (no errors)
   - [ ] Check Vercel logs (cron running)
   - [ ] Check Upstash usage (commands count)
   - [ ] Check Neon storage (not exceeding limit)

3. **Optimize if needed:**
   - [ ] Upgrade Render to Starter if worker sleeping
   - [ ] Add custom domain to Vercel (optional)
   - [ ] Verify domain with Resend for production emails
   - [ ] Set up error alerting (optional)

4. **Documentation:**
   - [ ] Save all credentials securely (use password manager)
   - [ ] Document production URLs
   - [ ] Create runbook for common issues

---

## Next Steps

**Congratulations! Your price monitor is now live in production.**

**Future Enhancements:**
- Add authentication (user accounts, OAuth)
- Multiple email recipients per product
- Webhook notifications (Slack, Discord)
- Advanced analytics dashboard
- Mobile app or PWA
- Price prediction using ML
- Multiple currency support
- Product comparison features

**Maintenance:**
- Monitor error logs weekly
- Check service quotas monthly
- Update dependencies quarterly
- Review and optimize costs monthly

---

## Notes

- Vercel auto-deploys from GitHub (no manual deploys needed)
- Render auto-deploys when GitHub Actions pushes new Docker image
- Neon has automatic backups (7 days retention on free tier)
- Upstash has data persistence enabled by default
- All services have generous free tiers suitable for initial launch
- Scale up as usage grows (easy to upgrade plans)
