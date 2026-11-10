import type { NextConfig } from "next";
import { localHostAliases } from "./src/lib/local-hosts";
const config: NextConfig = {
  output: "standalone",
  distDir: process.env.JOBOPS_BUILD_DIR ?? ".next",
  agentRules: false,
  allowedDevOrigins: localHostAliases(),
  serverExternalPackages: ["pdf-parse", "pg"],
  experimental: {
    // Leave room for the multipart fields around a 10 MiB PDF.
    proxyClientMaxBodySize: "12mb",
    serverActions: { bodySizeLimit: "12mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};
export default config;
