import type { NextConfig } from "next";

import { fileURLToPath } from "node:url";

const proxyTarget = process.env.FRONTEND_PROXY_TARGET?.replace(/\/$/, "");
const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: workspaceRoot,
  },
  async rewrites() {
    if (!proxyTarget) {
      return [];
    }

    return [
      {
        source: "/auth/:path*",
        destination: `${proxyTarget}/auth/:path*`,
      },
      {
        source: "/api/admin/:path*",
        destination: `${proxyTarget}/admin/:path*`,
      },
      {
        source: "/api/billing/:path*",
        destination: `${proxyTarget}/billing/:path*`,
      },
      {
        source: "/health",
        destination: `${proxyTarget}/health`,
      },
    ];
  },
};

export default nextConfig;
