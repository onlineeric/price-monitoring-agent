# Task 1.17: Create CLI Redeploy Script

**Type:** AI Generation
**Performer:** AI
**Phase:** 1 - Local VM + CICD

---

## Objective

Create a CLI script that calls the Coolify API to trigger redeployment of both web and worker applications on the local VM, providing a faster alternative to manually clicking in the Coolify dashboard.

---

## Context

**Current Manual Process:**
1. Open browser
2. Navigate to Coolify dashboard
3. Click "Redeploy" on web app
4. Wait for deployment
5. Click "Redeploy" on worker app
6. Wait for deployment

**Desired CLI Process:**
```bash
pnpm redeploy:local
```
- Triggers both redeployments automatically
- Shows deployment status in terminal
- Much faster workflow

---

## Technical Specifications

### Coolify API

Coolify provides a REST API for triggering deployments:

**Endpoint:**
```
POST http://<coolify-url>/api/v1/applications/{uuid}/redeploy
```

**Authentication:**
```
Authorization: Bearer <api-token>
```

**Response:**
```json
{
  "message": "Deployment started",
  "deployment_uuid": "..."
}
```

### Implementation Language

Use **Node.js** (JavaScript) for compatibility with existing tooling:
- No additional runtime dependencies
- Can use `fetch` (Node 18+)
- Easy to debug

---

## Implementation Details

### File Structure

**Script Location:** `scripts/redeploy-local.js`

**Package.json Update:**
```json
{
  "scripts": {
    "redeploy:local": "node scripts/redeploy-local.js"
  }
}
```

### Script Implementation

```javascript
#!/usr/bin/env node

/**
 * Redeploy Script for Local Coolify
 *
 * Triggers redeployment of web and worker apps on local VM.
 *
 * Usage:
 *   COOLIFY_API_TOKEN=xxx COOLIFY_WEB_APP_UUID=xxx COOLIFY_WORKER_APP_UUID=xxx pnpm redeploy:local
 *
 * Or set in .env:
 *   COOLIFY_API_TOKEN=""
 *   COOLIFY_WEB_APP_UUID=""
 *   COOLIFY_WORKER_APP_UUID=""
 *
 * Get API token from Coolify: Settings → API Tokens
 * Get app UUIDs from Coolify: Application → Settings → General
 */

// Load environment variables from .env
require('dotenv').config();

const COOLIFY_URL = process.env.COOLIFY_URL || 'http://192.168.64.2:8000'; // Default VM IP
const API_TOKEN = process.env.COOLIFY_API_TOKEN;
const WEB_APP_UUID = process.env.COOLIFY_WEB_APP_UUID;
const WORKER_APP_UUID = process.env.COOLIFY_WORKER_APP_UUID;

async function redeployApp(appName, appUuid) {
  console.log(`🚀 Triggering redeploy for ${appName}...`);

  try {
    const response = await fetch(
      `${COOLIFY_URL}/api/v1/applications/${appUuid}/redeploy`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ ${appName} deployment started`);
    console.log(`   Deployment UUID: ${data.deployment_uuid || 'N/A'}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to redeploy ${appName}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🔄 Local Coolify Redeploy Script\n');

  // Validate environment variables
  if (!API_TOKEN) {
    console.error('❌ COOLIFY_API_TOKEN not set');
    console.error('   Get token from Coolify: Settings → API Tokens');
    process.exit(1);
  }

  if (!WEB_APP_UUID) {
    console.error('❌ COOLIFY_WEB_APP_UUID not set');
    console.error('   Get UUID from Coolify: Web App → Settings → General');
    process.exit(1);
  }

  if (!WORKER_APP_UUID) {
    console.error('❌ COOLIFY_WORKER_APP_UUID not set');
    console.error('   Get UUID from Coolify: Worker App → Settings → General');
    process.exit(1);
  }

  console.log(`Coolify URL: ${COOLIFY_URL}\n`);

  // Redeploy both apps
  const webSuccess = await redeployApp('Web', WEB_APP_UUID);
  console.log('');
  const workerSuccess = await redeployApp('Worker', WORKER_APP_UUID);

  console.log('\n' + '='.repeat(50));

  if (webSuccess && workerSuccess) {
    console.log('✅ Both applications redeployed successfully');
    console.log('   Check Coolify dashboard for deployment progress');
  } else {
    console.log('❌ Some deployments failed');
    console.log('   Check Coolify dashboard and verify credentials');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
```

### Environment Variables

Add to `.env`:
```env
# Coolify Local Deployment
COOLIFY_URL="http://<VM_IP>:8000"
COOLIFY_API_TOKEN="your-api-token-here"
COOLIFY_WEB_APP_UUID="web-app-uuid"
COOLIFY_WORKER_APP_UUID="worker-app-uuid"
```

Add to `.env.example`:
```env
# Coolify Local Deployment (Optional - for redeploy script)
# Get from Coolify dashboard after configuring apps
# COOLIFY_URL="http://<VM_IP>:8000"
# COOLIFY_API_TOKEN=""
# COOLIFY_WEB_APP_UUID=""
# COOLIFY_WORKER_APP_UUID=""
```

### Package.json

Add script to root `package.json`:
```json
{
  "scripts": {
    "redeploy:local": "node scripts/redeploy-local.js"
  }
}
```

Ensure `dotenv` is installed:
```json
{
  "devDependencies": {
    "dotenv": "^16.0.0"
  }
}
```

---

## Usage Documentation

### Getting Required Values

**1. Coolify API Token:**
- Open Coolify dashboard
- Settings → API Tokens
- Create new token
- Copy token value

**2. Application UUIDs:**
- Open Coolify dashboard
- Navigate to Web application
- Settings → General
- Copy UUID from URL or settings page
- Repeat for Worker application

### Running the Script

```bash
# Ensure .env is configured
pnpm redeploy:local
```

**Expected Output:**
```
🔄 Local Coolify Redeploy Script

Coolify URL: http://192.168.64.2:8000

🚀 Triggering redeploy for Web...
✅ Web deployment started
   Deployment UUID: abc-123-xyz

🚀 Triggering redeploy for Worker...
✅ Worker deployment started
   Deployment UUID: def-456-uvw

==================================================
✅ Both applications redeployed successfully
   Check Coolify dashboard for deployment progress
```

---

## Deliverables

1. **`scripts/redeploy-local.js`:**
   - Complete Node.js script
   - Well-commented with usage instructions
   - Error handling for missing env vars
   - Clear console output with emojis

2. **Updated `package.json`** (root):
   - Add `redeploy:local` script
   - Ensure `dotenv` dependency

3. **Updated `.env.example`:**
   - Add Coolify variables section
   - Include comments explaining where to get values

4. **Updated `CLAUDE.md`:**
   - Document redeploy script usage
   - Include instructions for getting API token and UUIDs

---

## Verification Steps

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment:**
   - Get Coolify API token
   - Get app UUIDs
   - Update `.env`

3. **Run script:**
   ```bash
   pnpm redeploy:local
   ```

4. **Verify:**
   - Script completes without errors
   - Check Coolify dashboard for deployment activity
   - Both apps show "Deploying" or "Running" status

---

## Success Criteria

- [ ] `scripts/redeploy-local.js` created
- [ ] Script calls Coolify API correctly
- [ ] Triggers redeploy for both web and worker
- [ ] Validates environment variables
- [ ] Shows clear console output
- [ ] Handles errors gracefully
- [ ] `package.json` updated with script
- [ ] `dotenv` dependency added
- [ ] `.env.example` updated with Coolify variables
- [ ] CLAUDE.md documents usage
- [ ] Script runs successfully: `pnpm redeploy:local`
- [ ] Both apps redeploy in Coolify

---

## Notes

- Coolify API documentation: https://coolify.io/docs/api
- API token should be kept secure (never commit to repo)
- UUIDs are not sensitive but still keep in `.env`
- Script can be extended later for production deployment if needed
- Consider adding `--web-only` or `--worker-only` flags for selective redeployment
