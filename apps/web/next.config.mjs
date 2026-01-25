import { readFileSync } from "fs";
import { join } from "path";

// Read version from root package.json at build time
const rootPkg = JSON.parse(
  readFileSync(join(process.cwd(), "../../package.json"), "utf-8")
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // Required for Docker deployment
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: rootPkg.version,
  },
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
