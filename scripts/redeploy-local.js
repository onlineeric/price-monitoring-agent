#!/usr/bin/env node

/**
 * Redeploy Script for Coolify
 *
 * Triggers redeployment of web and worker apps on a Coolify instance.
 *
 * Usage:
 *   COOLIFY_URL=https://<coolify-host>:8000 \
 *   COOLIFY_API_TOKEN=xxx \
 *   COOLIFY_WEB_APP_UUID=xxx \
 *   COOLIFY_WORKER_APP_UUID=xxx \
 *   pnpm redeploy:coolify
 *
 * Or set in .env:
 *   COOLIFY_URL="https://<coolify-host>:8000"
 *   COOLIFY_API_TOKEN=""
 *   COOLIFY_WEB_APP_UUID=""
 *   COOLIFY_WORKER_APP_UUID=""
 *
 * Get API token from Coolify: Settings -> API Tokens
 * Get app UUIDs from Coolify: Application -> Settings -> General
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
// Load environment variables from .env
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const COOLIFY_URL = process.env.COOLIFY_URL;
const API_TOKEN = process.env.COOLIFY_API_TOKEN;
const WEB_APP_UUID = process.env.COOLIFY_WEB_APP_UUID;
const WORKER_APP_UUID = process.env.COOLIFY_WORKER_APP_UUID;

async function redeployApp(appName, appUuid) {
  console.log(`🚀 Triggering redeploy for ${appName}...`);

  try {
    const response = await fetch(`${COOLIFY_URL}/api/v1/applications/${appUuid}/redeploy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    console.log(`✅ ${appName} deployment started`);
    console.log(`   Deployment UUID: ${data.deployment_uuid || "N/A"}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to redeploy ${appName}:`, error.message);
    return false;
  }
}

async function main() {
  console.log("🔄 Coolify Redeploy Script\n");

  // Validate environment variables
  if (!API_TOKEN) {
    console.error("❌ COOLIFY_API_TOKEN not set");
    console.error("   Get token from Coolify: Settings → API Tokens");
    process.exit(1);
  }

  if (!WEB_APP_UUID) {
    console.error("❌ COOLIFY_WEB_APP_UUID not set");
    console.error("   Get UUID from Coolify: Web App → Settings → General");
    process.exit(1);
  }

  if (!WORKER_APP_UUID) {
    console.error("❌ COOLIFY_WORKER_APP_UUID not set");
    console.error("   Get UUID from Coolify: Worker App → Settings → General");
    process.exit(1);
  }

  if (!COOLIFY_URL) {
    console.error("❌ COOLIFY_URL not set");
    console.error("   Example: https://<coolify-host>:8000");
    process.exit(1);
  }

  console.log(`Coolify URL: ${COOLIFY_URL}\n`);

  // Redeploy both apps
  const webSuccess = await redeployApp("Web", WEB_APP_UUID);
  console.log("");
  const workerSuccess = await redeployApp("Worker", WORKER_APP_UUID);

  console.log(`\n${"=".repeat(50)}`);

  if (webSuccess && workerSuccess) {
    console.log("✅ Both applications redeployed successfully");
    console.log("   Check Coolify dashboard for deployment progress");
  } else {
    console.log("❌ Some deployments failed");
    console.log("   Check Coolify dashboard and verify credentials");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
});
