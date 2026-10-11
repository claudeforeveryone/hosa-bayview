import { offlineHtml } from "@/lib/pwa/offline-html";

// Precached by the service worker and shown when a page can't load. Public (src/lib/route-gate.ts) because a
// phone installs the worker from the sign-in page too. Holds no member data.
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  // The proxy's per-request CSP nonce, so the page's one inline script may run. The worker stores the page with
  // the same response's CSP header, so the pair still matches when it is served offline.
  return new Response(offlineHtml(request.headers.get("x-nonce")), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
