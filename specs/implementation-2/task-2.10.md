# Task 2.10: Update Documentation for Production

**Type:** AI Generation
**Performer:** AI
**Phase:** 2 - Production Deployment

---

## Objective

Update CLAUDE.md and README.md to document production deployment workflow, environment differences, and troubleshooting guidance.

---

## Context

Phase 1 documentation covers local VM setup. Now we need to add:
- Production deployment process
- Environment differences (local vs production)
- Auto-deployment workflow
- Troubleshooting common issues

---

## Files to Update

### 1. CLAUDE.md

Add/update the following sections:

#### A. Production Deployment Section

```markdown
## Production Deployment

### Infrastructure

**Platform:** DigitalOcean Droplet (Sydney region)
**Orchestration:** Coolify (self-hosted)
**Containers:** Pulled from GHCR (`:latest` tag)

### Deployment Process

**Automatic Deployment (Recommended):**
1. Develop and test on `dev` branch with local VM
2. Create PR from `dev` to `main`
3. Review and merge PR
4. GitHub Actions automatically:
   - Builds `:latest` images
   - Pushes to GHCR
   - Triggers Coolify webhooks
   - Coolify pulls and redeploys

**Manual Deployment (if needed):**
1. Access production Coolify: `http://<droplet-ip>:8000`
2. Navigate to application
3. Click "Redeploy"

### Environment Configuration

**Production Apps Environment Variables:**
Set in Coolify dashboard for each app:

```env
# Database (Coolify internal DNS)
DATABASE_URL="postgresql://postgres:<password>@price-monitor-postgres-prod:5432/priceMonitor"

# Redis (Coolify internal DNS)
REDIS_URL="redis://price-monitor-redis-prod:6379"

# AI Provider
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="<your-key>"

# Email
RESEND_API_KEY="<your-key>"

# Worker Scheduler (IMPORTANT: Only ONE worker should have this)
ENABLE_SCHEDULER="true"

# Environment
NODE_ENV="production"
```

### Production vs Local Differences

| Aspect | Local VM | Production |
|--------|----------|------------|
| **Location** | Multipass VM on dev machine | DigitalOcean Droplet (Sydney) |
| **Access** | `http://<vm-ip>:8000` | `http://<droplet-ip>:8000` |
| **Database URLs** | VM IP-based | Coolify internal DNS |
| **Deployment** | Manual trigger or CLI script | Automatic on `main` merge |
| **Images** | `:dev` tag | `:latest` tag |
| **SSL** | No (HTTP only) | Optional (can add domain + SSL) |
| **Cost** | Free (local resources) | ~$24/month |

### Monitoring

**Logs:**
- Production Coolify → Application → Logs tab
- Real-time log streaming
- Filter by severity

**Resource Usage:**
- Coolify dashboard shows CPU, memory, disk usage
- Monitor for spikes or issues

**Health Checks:**
- Web app: Access production URL, verify dashboard loads
- Worker: Check logs for "Connected to Redis" message
- Database: Query record count to verify data
```

#### B. Troubleshooting Section

Add comprehensive troubleshooting guide:

```markdown
## Troubleshooting

### Local VM Issues

**VM won't start:**
```bash
multipass list  # Check VM status
multipass start coolify-local
```

**Can't access Coolify dashboard:**
- Verify VM IP: `multipass info coolify-local`
- Check firewall: VM should allow port 8000
- Try: `http://<vm-ip>:8000`

**Database connection failed:**
- Verify containers running in Coolify
- Check connection string in `.env`
- Test: `pnpm --filter @price-monitor/db push`

### Production Issues

**Deployment failed:**
1. Check GitHub Actions logs
2. Verify Docker image built successfully
3. Check Coolify deployment logs
4. Verify environment variables set

**Application won't start:**
1. Check logs in Coolify
2. Verify environment variables
3. Check database connectivity
4. Verify image tag is correct (`:latest`)

**Worker not processing jobs:**
1. Check worker logs for errors
2. Verify Redis connection
3. Check `ENABLE_SCHEDULER` setting
4. Verify BullMQ connection in logs

**Scheduled emails not sending:**
1. Check worker logs for "Scheduler started"
2. Verify `ENABLE_SCHEDULER=true`
3. Check email schedule settings in DB
4. Verify RESEND_API_KEY is set
5. Check worker logs for cron pattern

### CICD Issues

**GitHub Actions failing:**
1. Check workflow file syntax
2. Verify Docker builds locally
3. Check GHCR authentication
4. Review Actions logs for specific error

**Webhooks not triggering:**
1. Verify GitHub Secrets are set
2. Check webhook URLs are correct
3. Test webhook manually with curl
4. Check Coolify logs for webhook received

**Images not updating:**
1. Verify image pushed to GHCR
2. Check image tag is correct
3. Manually trigger redeploy in Coolify
4. Clear image cache if needed
```

### 2. README.md

Update deployment section with production details:

```markdown
## Deployment

This project uses a self-hosted deployment approach with Coolify on DigitalOcean.

### Architecture

```
Developer → GitHub (code)
             ↓
         GitHub Actions
         (build `:latest` images)
             ↓
   GitHub Container Registry (GHCR)
             ↓
         Coolify (production)
         (auto-deploys via webhook)
             ↓
    Web + Worker + PostgreSQL + Redis
       (DigitalOcean Droplet, Sydney)
```

### Environments

**Local Development:**
- Code runs on host machine (`pnpm dev`)
- Connects to services in Multipass VM
- Fast iteration with hot reload

**Local Staging:**
- Full containerized deployment in Multipass VM
- Tests deployment process before production
- Uses `:dev` images from GHCR

**Production:**
- DigitalOcean Droplet in Sydney region
- Automatic deployment on `main` branch merge
- Uses `:latest` images from GHCR

### Deployment Workflow

1. **Develop:** Work on `dev` branch, test with local VM
2. **Build:** Push to `dev` → GitHub Actions builds `:dev` images
3. **Test:** Deploy `:dev` images to local VM, verify functionality
4. **Release:** Create PR `dev` → `main`, review, merge
5. **Deploy:** GitHub Actions builds `:latest`, triggers production deployment
6. **Verify:** Check production logs, test live application

### Production Access

**Web Application:** `http://<production-ip>`
**Coolify Dashboard:** `http://<production-ip>:8000`

For detailed deployment instructions, see [CLAUDE.md](CLAUDE.md).
```

---

## Deliverables

1. **Updated `CLAUDE.md`:**
   - Production deployment section
   - Environment differences table
   - Monitoring guidance
   - Comprehensive troubleshooting guide

2. **Updated `README.md`:**
   - Production deployment workflow
   - Architecture diagram updated
   - Environment descriptions
   - Production access information

---

## Success Criteria

- [ ] CLAUDE.md has production deployment section
- [ ] Environment differences clearly documented
- [ ] Troubleshooting guide comprehensive
- [ ] Covers common issues (VM, production, CICD)
- [ ] README.md updated with production workflow
- [ ] Architecture diagram includes production
- [ ] Deployment workflow clear and actionable
- [ ] All documentation accurate and helpful

---

## Notes

- Focus on practical, actionable guidance
- Include specific commands where helpful
- Address common pain points from testing
- Make troubleshooting easy to navigate
