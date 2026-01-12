# Task 2.9: Update GitHub Actions for Production Webhook

**Type:** AI Generation
**Performer:** AI
**Phase:** 2 - Production Deployment

---

## Objective

Update the GitHub Actions workflow to trigger Coolify webhooks when images are pushed to the `main` branch, enabling automatic production deployment.

---

## Context

Currently (after task 1.13), the workflow:
- Builds images on push to `main` and `dev`
- Tags as `:latest` or `:dev`
- Pushes to GHCR

Now we need to add:
- Webhook calls to production Coolify after `main` branch builds
- Triggers redeployment of both web and worker in production
- Uses GitHub Secrets for webhook URLs

**Important:** Webhooks should ONLY trigger on `main` branch (not `dev`).

---

## Technical Specifications

### Coolify Webhook

Production Coolify provides webhook URLs for each application:
```
POST https://<droplet-ip>:8000/api/v1/deploy/webhooks/<webhook-id>
```

**Webhook URLs stored in GitHub Secrets:**
- `COOLIFY_WEBHOOK_WEB_PROD`
- `COOLIFY_WEBHOOK_WORKER_PROD`

**These values will be provided by the user in task 2.14-2.15.**

---

## Implementation Details

### Workflow Updates

**File:** `.github/workflows/build-and-push.yml`

Add a new step after the "Build and push" steps that:
1. Only runs if branch is `main`
2. Calls both webhook URLs
3. Uses `curl` or `gh api` to trigger webhooks
4. Shows success/failure in logs

### Example Implementation

```yaml
# After the "Build and push worker image" step

- name: Trigger Production Deployment (Web)
  if: github.ref == 'refs/heads/main'
  run: |
    curl -X POST "${{ secrets.COOLIFY_WEBHOOK_WEB_PROD }}" || echo "Webhook failed (non-blocking)"

- name: Trigger Production Deployment (Worker)
  if: github.ref == 'refs/heads/main'
  run: |
    curl -X POST "${{ secrets.COOLIFY_WEBHOOK_WORKER_PROD }}" || echo "Webhook failed (non-blocking)"
```

### Error Handling

- Webhook failures should NOT fail the entire workflow
- Use `|| true` or `|| echo "..."` to make non-blocking
- Log webhook call results for debugging

### Documentation in Workflow

Add comments explaining:
```yaml
# ===================================
# Production Auto-Deployment
# ===================================
# These steps only run on 'main' branch
# They trigger Coolify to pull latest images and redeploy
# Webhook URLs are configured in GitHub Secrets:
#   - COOLIFY_WEBHOOK_WEB_PROD
#   - COOLIFY_WEBHOOK_WORKER_PROD
# Get these URLs from production Coolify (tasks 2.14-2.15)
```

---

## GitHub Secrets Documentation

While the AI cannot create GitHub Secrets, add comments documenting how to set them up:

```yaml
# GitHub Secrets Required (set these in repository settings):
#
# 1. Navigate to: Repository → Settings → Secrets and variables → Actions
# 2. Click "New repository secret"
# 3. Add the following secrets:
#
#    Name: COOLIFY_WEBHOOK_WEB_PROD
#    Value: <webhook URL from production Coolify web app>
#
#    Name: COOLIFY_WEBHOOK_WORKER_PROD
#    Value: <webhook URL from production Coolify worker app>
#
# How to get webhook URLs:
#    - Production Coolify → Application → Settings → Webhooks
#    - Copy the webhook URL for each app
```

---

## Implementation Checklist

- [ ] Add webhook trigger steps after image push
- [ ] Steps only run on `main` branch (use `if:` condition)
- [ ] Call `COOLIFY_WEBHOOK_WEB_PROD` secret
- [ ] Call `COOLIFY_WEBHOOK_WORKER_PROD` secret
- [ ] Make webhook calls non-blocking (don't fail workflow on error)
- [ ] Add clear comments explaining webhook purpose
- [ ] Document how to set up GitHub Secrets
- [ ] Test condition ensures dev branch doesn't trigger webhooks

---

## Deliverables

1. **Updated `.github/workflows/build-and-push.yml`:**
   - Webhook trigger steps added
   - Only runs on `main` branch
   - Uses GitHub Secrets
   - Well-documented with comments

2. **Comments in workflow:**
   - Explain purpose of webhooks
   - Document required GitHub Secrets
   - Instructions for getting webhook URLs from Coolify

---

## Verification Steps

After implementation, verify the changes:

1. **Check workflow structure:**
   ```yaml
   # Should have new steps after image build
   - name: Trigger Production Deployment (Web)
     if: github.ref == 'refs/heads/main'
     ...
   ```

2. **Verify branch condition:**
   - Webhook steps should have `if: github.ref == 'refs/heads/main'`
   - Should NOT run on `dev` branch

3. **Check secret usage:**
   - Uses `${{ secrets.COOLIFY_WEBHOOK_WEB_PROD }}`
   - Uses `${{ secrets.COOLIFY_WEBHOOK_WORKER_PROD }}`

4. **Test will happen in task 2.17:**
   - After user sets up webhooks
   - Push to `main` should trigger deployment

---

## Success Criteria

- [ ] `.github/workflows/build-and-push.yml` updated
- [ ] Webhook trigger steps added after image push
- [ ] Steps only run on `main` branch
- [ ] Uses correct GitHub Secrets for webhook URLs
- [ ] Non-blocking error handling (won't fail workflow)
- [ ] Clear comments explain webhook functionality
- [ ] Documents how to set up required GitHub Secrets
- [ ] Documents how to get webhook URLs from Coolify
- [ ] Workflow syntax is valid YAML

---

## Notes

- User will set up the actual GitHub Secrets in tasks 2.14-2.15
- Webhook URLs come from Coolify after apps are configured
- Workflow will complete successfully even if secrets aren't set yet (non-blocking)
- This enables automatic deployment: merge to main → build → push → webhook → Coolify redeploys
