import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* dashboard app with live-time simulation reads: classic behavior */
  cacheComponents: false,
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
