# Task 1.13: Create GitHub Actions Workflow

**Type:** AI Generation
**Performer:** AI
**Phase:** 1 - Local VM + CICD

---

## Objective

Create a GitHub Actions workflow that automatically builds Docker images for both web and worker applications, tags them appropriately based on the branch, and pushes them to GitHub Container Registry (GHCR).

---

## Context

The CICD pipeline needs to:
- Build images on every push to `main` and `dev` branches
- Tag `main` branch builds as `:latest`
- Tag `dev` branch builds as `:dev`
- Push both web and worker images to GHCR
- Use path filters to avoid unnecessary builds
- Authenticate with GHCR using GitHub token

This workflow enables:
- Local testing with `:dev` images pulled from GHCR
- Production deployment with `:latest` images
- Single source of truth for container images

---

## Technical Specifications

### Workflow File

**Location:** `.github/workflows/build-and-push.yml`

**Triggers:**
- Push to `main` branch
- Push to `dev` branch

**Path Filters:**
Avoid rebuilding when only documentation changes:
- Include: `apps/**`, `packages/**`, `.github/workflows/**`
- Exclude: `**.md`, `docs/**`

### Jobs

**1. Build and Push Images**

Steps:
1. Checkout code
2. Set up Docker Buildx
3. Log in to GHCR
4. Determine image tag based on branch
5. Build and push web image
6. Build and push worker image

### Image Naming Convention

**Web Image:**
```
ghcr.io/<github-username>/<repo-name>/web:latest  # from main
ghcr.io/<github-username>/<repo-name>/web:dev     # from dev
```

**Worker Image:**
```
ghcr.io/<github-username>/<repo-name>/worker:latest  # from main
ghcr.io/<github-username>/<repo-name>/worker:dev     # from dev
```

**Note:** Replace `<github-username>` and `<repo-name>` with actual values or use GitHub context variables.

---

## Implementation Details

### GitHub Actions Syntax

```yaml
name: Build and Push Docker Images

on:
  push:
    branches:
      - main
      - dev
    paths:
      - 'apps/**'
      - 'packages/**'
      - '.github/workflows/**'
      - '!**.md'

jobs:
  build-and-push:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Determine image tag
        id: tag
        run: |
          if [ "${{ github.ref }}" == "refs/heads/main" ]; then
            echo "tag=latest" >> $GITHUB_OUTPUT
          else
            echo "tag=dev" >> $GITHUB_OUTPUT
          fi

      - name: Build and push web image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/web/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}/web:${{ steps.tag.outputs.tag }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build and push worker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/worker/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}/worker:${{ steps.tag.outputs.tag }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### Key Features

1. **GitHub Actions Cache:**
   - Uses `cache-from` and `cache-to` for layer caching
   - Speeds up subsequent builds
   - Reduces build time and GitHub Actions minutes

2. **Automatic Authentication:**
   - Uses `GITHUB_TOKEN` (automatically provided by GitHub)
   - No need for manual PAT creation for pushing

3. **Dynamic Tagging:**
   - Branch-based tagging logic
   - `main` → `:latest`
   - `dev` → `:dev`

4. **Matrix Build (Alternative):**
   If preferred, could use matrix strategy to build both apps in parallel:
   ```yaml
   strategy:
     matrix:
       app: [web, worker]
   ```
   However, sequential is simpler and sufficient for this project.

---

## Deliverables

1. **`.github/workflows/build-and-push.yml`**
   - Complete workflow file
   - Well-commented for clarity
   - Handles both branches

2. **Workflow Comments:**
   - Explain purpose of each step
   - Document image naming convention
   - Note where production webhook will be added (Phase 2)

---

## Verification Steps

After implementation:

1. **Commit and push to dev branch:**
   ```bash
   git checkout dev
   git add .github/workflows/build-and-push.yml
   git commit -m "[task-1.13] add GitHub Actions workflow"
   git push origin dev
   ```

2. **Check GitHub Actions:**
   - Go to repository → Actions tab
   - Should see workflow running
   - Wait for completion (~5-10 minutes)

3. **Verify images in GHCR:**
   - Go to repository → Packages
   - Should see `web:dev` and `worker:dev` images
   - Check image size and creation time

4. **Test image pull (optional):**
   ```bash
   docker pull ghcr.io/<username>/<repo>/web:dev
   docker pull ghcr.io/<username>/<repo>/worker:dev
   ```

---

## Success Criteria

- [ ] Workflow file created at `.github/workflows/build-and-push.yml`
- [ ] Triggers on push to `main` and `dev` branches
- [ ] Path filters configured
- [ ] Builds both web and worker images
- [ ] Tags images correctly (`:latest` vs `:dev`)
- [ ] Pushes to GHCR successfully
- [ ] Uses GitHub Actions cache for optimization
- [ ] Well-documented with comments
- [ ] Workflow runs successfully on dev push
- [ ] Images appear in GitHub Packages

---

## Notes

- `GITHUB_TOKEN` is automatically available in workflows
- Images are initially private by default
- Can make images public in GitHub Packages settings if desired
- Workflow will be extended in Phase 2 to add production webhooks
- Build time: ~5-10 minutes depending on cache
