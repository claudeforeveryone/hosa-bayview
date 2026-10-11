// Everything else needs a session. /reset-password and /banned are deliberately not here: both only make sense
// with a session (the recovery link signs the browser in first; a banned member is signed in).
export const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/auth"];
// Matched exactly, never as a prefix. Each handler checks its own secret: keepalive the CRON_SECRET bearer token,
// push delivery the database's shared secret (the database has no session). The manifest, service worker and
// offline page must load before anyone signs in, so a phone can install the app from the sign-in page.
export const EXACT_PUBLIC_PATHS = ["/api/keepalive", "/api/push/deliver", "/manifest.webmanifest", "/sw.js", "/offline"];
const GUEST_ONLY = ["/login", "/signup"];

export type Gate = { redirect: string } | null;

const matches = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(`${p}/`));
export const isPublicPath = (path: string) => matches(path, PUBLIC_PATHS) || EXACT_PUBLIC_PATHS.includes(path);

// Decides where the proxy sends a request, given only the path and whether a session exists.
export function routeGate(path: string, search: string, signedIn: boolean): Gate {
  if (!signedIn && !isPublicPath(path)) {
    return { redirect: path === "/" ? "/login" : `/login?next=${encodeURIComponent(path + search)}` };
  }
  if (signedIn && matches(path, GUEST_ONLY)) return { redirect: "/" };
  return null;
}
