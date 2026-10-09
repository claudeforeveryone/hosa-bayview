import type { NextConfig } from "next";

// Cache Components is off on purpose: nearly every route is per-user and reads the
// session cookie, so classic dynamic rendering is simpler and just as fast here.
const nextConfig: NextConfig = {
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
