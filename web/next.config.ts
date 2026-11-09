import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Reset links carry a secret query parameter; do not echo them in dev access logs.
  logging: { incomingRequests: { ignore: [/^\/reset-password(?:\?|$)/] } },
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
