# Task 1.20: Verify Code and Commit

**Type:** Manual
**Performer:** User
**Phase:** 1 - Local VM + CICD

---

## What

Review all code changes from AI tasks 1.11-1.19, run linting and builds to ensure no errors, test locally, then commit changes to the `dev` branch.

---

## Objective

This verification step ensures:
- All AI-generated code is correct and functional
- No lint errors or build failures
- Local development still works
- Changes are safely committed to dev branch
- GitHub Actions workflow runs successfully

**Critical checkpoint before deployment.**

---

## How to Do

1. Review all files created/modified by AI tasks
2. Run linting to check code quality
3. Build both applications to catch compilation errors
4. Test locally with `pnpm dev` to ensure no runtime errors
5. Commit all changes with appropriate message
6. Push to `dev` branch and verify GitHub Actions builds `:dev` images

---

## Expected Results

**Success Criteria:**
- All code reviewed and understood
- `pnpm lint` passes with no errors
- `pnpm --filter @price-monitor/web build` succeeds
- `pnpm --filter @price-monitor/worker build` succeeds
- Local dev mode works (`pnpm dev`)
- Changes committed to `dev` branch
- Push to `dev` triggers GitHub Actions
- GitHub Actions workflow completes successfully
- `:dev` images appear in GitHub Packages

**How to Verify:**
- Check terminal output for lint/build success
- Visit GitHub repository → Actions tab → see green checkmark
- Visit GitHub repository → Packages → see `web:dev` and `worker:dev` images with recent timestamp
