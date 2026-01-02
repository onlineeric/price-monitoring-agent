# Technical Spec: Phase 7.2 - GitHub Actions CI/CD

**Phase:** 7.2
**Goal:** Set up automated CI/CD pipeline using GitHub Actions to build and deploy the worker on every push to main.
**Context:** When code is pushed to the main branch, GitHub Actions should automatically build the worker Docker image, push it to GitHub Container Registry (GHCR), and trigger Render to deploy the new version. The web app will auto-deploy via Vercel's GitHub integration (configured in Phase 7.3).

---

## Prerequisites

* **Task 7.1:** Worker Dockerfile created and tested.
* **GitHub Repository:** Code pushed to GitHub.

---

## Architecture Context

### CI/CD Flow

```
Developer pushes to main branch
            ↓
    GitHub Actions triggers
            ↓
    1. Build worker Docker image
    2. Push to GitHub Container Registry (GHCR)
            ↓
    Render detects new image
            ↓
    Render auto-deploys worker
            ↓
    (Vercel auto-deploys web app separately)
```

**Key Points:**
- **GitHub Container Registry (GHCR)**: Free Docker registry for GitHub repos
- **Render**: Pulls image from GHCR and deploys automatically
- **Vercel**: Separate auto-deploy via GitHub integration (no GitHub Actions needed)

---

## Step 1: Create GitHub Actions Workflow (AI Generation Step)

**Instruction for AI:**

Create the GitHub Actions workflow file for automated deployment.

### File 1.1: `.github/workflows/deploy-worker.yml`

**Goal:** Automate worker Docker build and deployment on push to main.

**Requirements:**

* **Workflow Name & Trigger:**
  ```yaml
  name: Deploy Worker

  on:
    push:
      branches:
        - main
      paths:
        - 'apps/worker/**'
        - 'packages/db/**'
        - '.github/workflows/deploy-worker.yml'
        - 'pnpm-lock.yaml'
  ```

* **Environment Variables:**
  ```yaml
  env:
    REGISTRY: ghcr.io
    IMAGE_NAME: ${{ github.repository }}/worker
  ```

* **Jobs:**

  1. **Build and Push Job:**
     ```yaml
     jobs:
       build-and-push:
         runs-on: ubuntu-latest
         permissions:
           contents: read
           packages: write

         steps:
           - name: Checkout code
             uses: actions/checkout@v4

           - name: Log in to GitHub Container Registry
             uses: docker/login-action@v3
             with:
               registry: ${{ env.REGISTRY }}
               username: ${{ github.actor }}
               password: ${{ secrets.GITHUB_TOKEN }}

           - name: Extract metadata for Docker
             id: meta
             uses: docker/metadata-action@v5
             with:
               images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
               tags: |
                 type=sha,prefix={{branch}}-
                 type=raw,value=latest,enable={{is_default_branch}}

           - name: Build and push Docker image
             uses: docker/build-push-action@v5
             with:
               context: .
               file: apps/worker/Dockerfile
               push: true
               tags: ${{ steps.meta.outputs.tags }}
               labels: ${{ steps.meta.outputs.labels }}

           - name: Trigger Render Deploy
             if: success()
             run: |
               curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK_URL }}"
     ```

**Full Workflow File:**

```yaml
name: Deploy Worker

on:
  push:
    branches:
      - main
    paths:
      - 'apps/worker/**'
      - 'packages/db/**'
      - '.github/workflows/deploy-worker.yml'
      - 'pnpm-lock.yaml'

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}/worker

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/worker/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}

      - name: Trigger Render Deploy
        if: success()
        run: |
          curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK_URL }}"
```

---

## Step 2: Configure GitHub Container Registry (Manual Step)

**User Action:**

GitHub Container Registry (GHCR) is automatically enabled for your repository. No additional setup needed.

**Verify GHCR is enabled:**

1. Go to your GitHub repository
2. Click on **Settings** → **Actions** → **General**
3. Scroll to **Workflow permissions**
4. Ensure **Read and write permissions** is selected
5. Check **Allow GitHub Actions to create and approve pull requests** (optional)
6. Click **Save**

**Note:** The `GITHUB_TOKEN` secret is automatically provided by GitHub Actions. No need to create it manually.

---

## Step 3: Get Render Deploy Hook URL (Manual Step)

**User Action:**

### 3.1: Create Render Service

**Note:** Detailed Render setup is in Phase 7.3. For now, just get the deploy hook URL.

1. Go to [render.com](https://render.com)
2. Sign up / Log in
3. Click **New +** → **Web Service**
4. Connect your GitHub repository
5. Configure service:
   - **Name:** `price-monitor-worker`
   - **Region:** Choose closest to your users
   - **Branch:** `main`
   - **Runtime:** `Docker`
   - **Docker Command:** (leave empty, uses Dockerfile CMD)
   - **Instance Type:** `Free` or `Starter` ($7/month recommended for better performance)
6. Click **Create Web Service**

### 3.2: Get Deploy Hook URL

1. In your Render service dashboard, click **Settings**
2. Scroll to **Deploy Hook**
3. Click **Create Deploy Hook**
4. Copy the webhook URL (looks like: `https://api.render.com/deploy/srv-xxxxx?key=yyyyy`)

### 3.3: Add to GitHub Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `RENDER_DEPLOY_HOOK_URL`
5. Value: Paste the Render deploy hook URL
6. Click **Add secret**

---

## Step 4: Test GitHub Actions Workflow (Manual Step)

**User Action:**

### 4.1: Commit and Push Workflow File

```powershell
git add .github/workflows/deploy-worker.yml
git commit -m "[task-7.2] add GitHub Actions workflow for worker deployment"
git push origin main
```

### 4.2: Monitor Workflow Execution

1. Go to your GitHub repository
2. Click **Actions** tab
3. You should see the "Deploy Worker" workflow running
4. Click on the workflow run to see details
5. Watch each step execute:
   - ✓ Checkout code
   - ✓ Log in to GHCR
   - ✓ Extract metadata
   - ✓ Build and push Docker image (~5-10 minutes)
   - ✓ Trigger Render deploy

### 4.3: Verify Image in GHCR

1. Go to your GitHub repository
2. Click on **Packages** (right sidebar)
3. You should see `worker` package listed
4. Click on it to see the Docker image with tags:
   - `latest`
   - `main-<commit-sha>`

### 4.4: Verify Render Deployment

1. Go to Render dashboard
2. Click on your `price-monitor-worker` service
3. Check **Events** tab for deployment progress
4. Wait for deployment to complete (~5-10 minutes)
5. Check **Logs** tab to verify worker started successfully

---

## Step 5: Test Automated Deployment (Manual Step)

**User Action:**

Make a small change to test the full pipeline:

### 5.1: Make a Test Change

```powershell
# Edit a file in apps/worker (e.g., add a console log)
notepad apps/worker/src/index.ts
```

Add a log line like:
```typescript
console.log('[Worker] Starting price monitor worker - v2');
```

### 5.2: Commit and Push

```powershell
git add apps/worker/src/index.ts
git commit -m "test: trigger automated deployment"
git push origin main
```

### 5.3: Verify Automatic Deployment

1. GitHub Actions workflow triggers automatically
2. New Docker image built and pushed to GHCR
3. Render detects new image and redeploys
4. Check Render logs to see your new log message

**Expected timeline:**
- GitHub Actions: ~5-10 minutes (build + push)
- Render deploy: ~5-10 minutes (pull + deploy)
- **Total:** ~10-20 minutes from push to deployed

---

## File Structure After Completion

```
.github/
  └── workflows/
      └── deploy-worker.yml    # NEW: CI/CD workflow
```

---

## Troubleshooting

### Issue: "Error: buildx failed with: permission denied"

**Cause:** GitHub Actions doesn't have permission to write packages.

**Solution:**
1. Go to repository Settings → Actions → General
2. Set Workflow permissions to "Read and write permissions"
3. Save and re-run workflow

### Issue: "Error: failed to push to registry"

**Cause:** Authentication issue with GHCR.

**Solution:** Verify:
- Workflow has `permissions: packages: write`
- Using `${{ secrets.GITHUB_TOKEN }}` (automatically provided)
- Repository visibility allows packages (public repos work by default)

### Issue: Render deploy hook returns 404

**Cause:** Wrong deploy hook URL or service deleted.

**Solution:**
1. Go to Render service → Settings → Deploy Hook
2. Generate a new deploy hook
3. Update GitHub secret `RENDER_DEPLOY_HOOK_URL`

### Issue: Workflow doesn't trigger on push

**Cause:** Changed files not in `paths` filter.

**Solution:**
- Check if modified files match paths in workflow trigger
- Or remove `paths:` filter to trigger on any push to main

### Issue: Docker build fails with "no space left on device"

**Cause:** GitHub Actions runner out of disk space.

**Solution:** This is rare. Try:
- Clean up build with multi-stage Dockerfile
- Remove unnecessary files in .dockerignore
- Contact GitHub support if persistent

---

## Completion Criteria

Task 7.2 is complete when:

- [ ] `.github/workflows/deploy-worker.yml` created
- [ ] GitHub repository has workflow permissions enabled
- [ ] Render deploy hook URL added to GitHub secrets
- [ ] Workflow triggers on push to main
- [ ] Docker image builds successfully
- [ ] Image pushed to GHCR successfully
- [ ] Image visible in GitHub Packages
- [ ] Render service deploys automatically
- [ ] Worker starts and processes jobs in production
- [ ] Test deployment works end-to-end
- [ ] Logs show successful deployment

---

## Workflow Optimization (Optional)

**Future Enhancements:**
- Add linting/testing step before build
- Use Docker layer caching for faster builds
- Add notifications (Slack, Discord) on deployment
- Deploy to staging environment first (manual approval for production)
- Run health checks after deployment

---

## Notes

- `GITHUB_TOKEN` is automatically provided by GitHub Actions (no manual setup)
- GHCR is free for public repositories
- Render free tier has limited hours (750 hours/month) - upgrade to Starter for 24/7
- The workflow only triggers on changes to worker, db, or workflow files (efficient)
- Vercel deployment is separate and configured via Vercel dashboard (Phase 7.3)
- First build may take longer due to Docker layer caching setup
- Subsequent builds are faster with cached layers
