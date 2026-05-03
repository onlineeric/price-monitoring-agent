import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load the monorepo's root .env BEFORE Next.js evaluates this config so all
// process.env reads — server-side code, NEXT_PUBLIC_* inlining, and the
// runtime worker — see the same vars in local dev. In production (Coolify),
// the file does not exist and dotenv silently no-ops; container env wins.
const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../../.env"), quiet: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // Required for Docker deployment
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/dashboard",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
