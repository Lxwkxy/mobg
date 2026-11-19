import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  // Reset links carry a secret query parameter; do not echo them in dev access logs.
  logging: { incomingRequests: { ignore: [/^\/reset-password(?:\?|$)/] } },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingRoot: resolve(__dirname, ".."),
};

export default nextConfig;
