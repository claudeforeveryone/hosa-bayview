import type { NextConfig } from "next";

// Fixed security headers for every response. The Content-Security-Policy is per request (it carries a nonce),
// so src/proxy.ts sets it; frame-ancestors 'none' there and X-Frame-Options here both stop framing.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  // Nothing on this site is for search engines. Set here (not in the proxy) so static files and robots.txt get it too.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  // Two years, subdomains too. No preload: that list is hard to leave.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

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
  // A pasted test goes up in one server action call. 500 questions with long case stems and explanations can
  // pass the 1 MB default; 2 MB covers that (the editor stops anything bigger, see src/lib/question-rules.ts).
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
