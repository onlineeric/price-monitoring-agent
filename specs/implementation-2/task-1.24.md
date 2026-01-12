# Task 1.24: Test CLI Redeploy Script

**Type:** Manual
**Performer:** User
**Phase:** 1 - Local VM + CICD

---

## What

Test the CLI redeploy script created in task 1.17 by getting the Coolify API token and app UUIDs, configuring environment variables, and running the script.

---

## Objective

Verify that the automated redeploy script works correctly, providing a faster alternative to manually clicking "Redeploy" in the Coolify dashboard. This improves developer workflow for iterative testing.

**Workflow:**
1. Get API token from Coolify
2. Get app UUIDs for web and worker
3. Configure .env
4. Run `pnpm redeploy:local`
5. Verify both apps redeploy

---

## How to Do

Access Coolify dashboard settings to create an API token. Navigate to each application's settings to find their UUIDs. Update the `.env` file with the token and UUIDs. Run the redeploy script and watch the console output. Verify in Coolify dashboard that both applications are redeploying.

**Getting Values:**
- API Token: Coolify Settings → API Tokens
- Web UUID: Web app → Settings → General
- Worker UUID: Worker app → Settings → General

---

## Expected Results

**Success Criteria:**
- Coolify API token obtained
- Web app UUID documented
- Worker app UUID documented
- `.env` updated with all three values
- `pnpm redeploy:local` runs successfully
- Script shows success messages for both apps
- Coolify dashboard shows redeployment activity
- Both apps successfully redeploy

**How to Verify:**
- Run `pnpm redeploy:local`
- Console shows: "✅ Web deployment started" and "✅ Worker deployment started"
- Check Coolify dashboard → both apps show "Deploying" status
- Wait for completion → both apps return to "Running" status
- Script completes without errors
