# Task 1.1: Create Dev Branch

**Type:** Manual
**Performer:** User
**Phase:** 1 - Local VM + CICD

---

## What

Create a `dev` branch from `main` to enable separate development and testing workflow before production deployment.

---

## Objective

Establish branch strategy for Implementation 2 where:
- `dev` branch → builds `:dev` Docker images → deploys to local VM (manual trigger)
- `main` branch → builds `:latest` Docker images → deploys to production (auto)

This allows safe testing of changes on local VM before promoting to production.

---

## How to Do

Create the `dev` branch from current `main` branch and push it to GitHub remote. Verify the branch appears in the GitHub repository.

---

## Expected Results

**Success Criteria:**
- `dev` branch exists locally
- `dev` branch pushed to GitHub remote
- Branch visible in GitHub repository (can see it in branch dropdown)

**How to Verify:**
- Run `git branch` - should show `dev` branch
- Check GitHub repository - branch should appear in branch list
