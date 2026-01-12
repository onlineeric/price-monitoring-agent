# Task 2.17: Test Auto-Deployment

**Type:** Manual
**Performer:** User
**Phase:** 2 - Production Deployment

---

## What

Test the automatic deployment workflow by making a small change to README, pushing to `main`, and verifying that GitHub Actions triggers production redeployment via webhooks.

---

## Objective

Verify the complete CICD pipeline works end-to-end:
1. Push to `main` branch
2. GitHub Actions builds `:latest` images
3. Images pushed to GHCR
4. Webhooks called
5. Production Coolify pulls new images
6. Applications redeploy automatically

**This validates the entire automated deployment system.**

---

## How to Do

Make a small, safe change (like adding a line to README.md). Commit and push to `main` branch. Watch the GitHub Actions workflow execute. Monitor the Actions log to see webhook calls. Check production Coolify for redeployment activity. Wait for deployments to complete. Verify both apps are running with the new version.

**Test Change Example:**
```markdown
<!-- Add to README.md -->
Deployed on: [current date]
```

---

## Expected Results

**Success Criteria:**
- Small change committed and pushed to `main`
- GitHub Actions workflow triggers
- Workflow builds `:latest` images successfully
- Images pushed to GHCR
- Workflow logs show webhook calls (web and worker)
- Production Coolify shows redeployment triggered for both apps
- Both apps redeploy successfully
- Both apps return to "Running" status
- New version visible (if verifiable)
- Auto-deployment working as expected

**How to Verify:**
- GitHub Actions → see workflow run and complete (green)
- Workflow logs show: "Triggering production deployment"
- Production Coolify → see deployment activity
- Both apps show recent deployment timestamp
- Apps running without errors
- Can revert test change if desired
