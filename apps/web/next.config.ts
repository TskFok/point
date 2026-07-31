import path from "node:path";
import type { NextConfig } from "next";

const defaultApiServerBaseUrl = "http://localhost:3000/api/v1";

function apiServerBaseUrl() {
  const configured = process.env.API_SERVER_BASE_URL?.trim();
  return (configured || defaultApiServerBaseUrl).replace(/\/+$/, "");
}

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiServerBaseUrl()}/:path*`,
      },
    ];
  },
};

export default nextConfig;
