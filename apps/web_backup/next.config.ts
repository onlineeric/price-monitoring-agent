import type { NextConfig } from "next";
import path from "path";

// Load environment variables from monorepo root
// Using require() for dotenv as Next.js config compilation has CJS/ESM conflicts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dotenv = require("dotenv");
const envPath = path.resolve(process.cwd(), "../../.env");
dotenv.config({ path: envPath });

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
