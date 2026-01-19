# Task 2.13: Verify Code and Commit

**Type:** Manual
**Performer:** User
**Phase:** 2 - Production Deployment

---

## What

Review all code changes from AI tasks 2.9-2.12, run linting and builds, test with local VM, then commit to `dev` branch, create PR, and merge to `main`.

---

## Objective

Final code verification before production deployment ensures:
- Production-ready code quality
- No build errors
- All changes reviewed and tested
- Changes merged to `main` branch
- `:latest` images built automatically

**This is the gate to production.**

---

## How to Do

Review all files modified by AI tasks. Run linting to check quality. Build both applications to catch errors. Test locally to ensure functionality. Commit changes to `dev` branch, push, and verify `:dev` images build. Create PR from `dev` to `main`, review carefully, then merge. Verify GitHub Actions builds `:latest` images successfully.

---

## Expected Results

**Success Criteria:**
- All code reviewed and understood
- `pnpm lint` passes without errors
- Both apps build successfully
- Local dev/VM testing confirms no regressions
- Changes committed to `dev` branch
- PR created: `dev` → `main`
- PR reviewed and merged
- GitHub Actions builds `:latest` images
- `:latest` images appear in GitHub Packages

**How to Verify:**
- Check GitHub Actions - see workflow complete with green checkmark
- Check GitHub Packages - see `web:latest` and `worker:latest` with recent timestamp
- Merged PR shows in `main` branch history
