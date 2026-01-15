# Task 1.9: Create GitHub Personal Access Token (PAT)

**Type:** Manual
**Performer:** User
**Phase:** 1 - Local VM + CICD

---

## What

Generate a GitHub Personal Access Token (classic) with package permissions to allow Coolify to pull Docker images from GitHub Container Registry (GHCR).

---

## Objective

Coolify needs authentication to pull private Docker images from GHCR. The PAT provides:
- Read access to pull images

**Required Scopes:**
- `write:packages`

---

## How to Do

Navigate to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic). Generate a new token with the required package scopes. Copy the token immediately as it's only shown once. Store it securely in a password manager or secure note.

**Important:** Never commit this token to the repository.

---

## Expected Results

**Success Criteria:**
- PAT created with correct scopes (read:packages)
- Token copied and stored securely
- Token documented for use in task 1.10

**How to Verify:**
- Token should be a long alphanumeric string (e.g., `ghp_xxxxxxxxxxxx`)
- Can view token in GitHub Settings (but value is hidden)
- Token stored in secure location (password manager)
