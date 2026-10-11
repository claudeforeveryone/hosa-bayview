import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

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
  // The app is not for search engines. Set here (not in the proxy) so static files get it too. The public pages
  // override it below (INDEXED_PATHS in src/lib/seo.ts).
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
    return [
      { source: "/:path*", headers: securityHeaders },
      // Log in, sign up, terms and privacy may be indexed. A later rule with the same key wins.
      { source: "/:page(login|signup|terms|privacy)", headers: [{ key: "X-Robots-Tag", value: "index, follow" }] },
      // So may the images those pages point to: the logo in the JSON-LD (Google ignores a noindex logo), the app icons
      // and the social card. The dots are escaped so only these exact file names match.
      {
        source: "/:file(icon\\.png|apple-icon\\.png|opengraph-image\\.png|twitter-image\\.png)",
        headers: [{ key: "X-Robots-Tag", value: "index, follow" }],
      },
    ];
  },
};

// Dev-only pages are named page.dev.tsx (the owner console's fixture gallery). Only `next dev` reads .dev.tsx as a
// page, so a production build has no such route and never bundles what it imports (src/lib/dev-only-routes.test.ts).
const PAGE_EXTENSIONS = ["tsx", "ts", "jsx", "js"];

export default function config(phase: string): NextConfig {
  return {
    ...nextConfig,
    pageExtensions:
      phase === PHASE_DEVELOPMENT_SERVER
        ? ["dev.tsx", ...PAGE_EXTENSIONS]
        : PAGE_EXTENSIONS,
  };
}
