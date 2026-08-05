import path from "node:path";
import type { NextConfig } from "next";

import { productImageRemotePatterns } from "./lib/product-image-remote-patterns";

const repositoryRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: repositoryRoot,
  images: {
    remotePatterns: productImageRemotePatterns(),
  },
  turbopack: {
    root: repositoryRoot,
  },
};

export default nextConfig;
