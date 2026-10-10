// Everything else needs a session. /reset-password and /banned are deliberately not here: both only make sense
// with a session (the recovery link signs the browser in first; a banned member is signed in).
export const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/auth"];
const GUEST_ONLY = ["/login", "/signup"];

export type Gate = { redirect: string } | null;

const matches = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(`${p}/`));

// Decides where the proxy sends a request, given only the path and whether a session exists.
export function routeGate(path: string, search: string, signedIn: boolean): Gate {
  if (!signedIn && !matches(path, PUBLIC_PATHS)) {
    return { redirect: path === "/" ? "/login" : `/login?next=${encodeURIComponent(path + search)}` };
  }
  if (signedIn && matches(path, GUEST_ONLY)) return { redirect: "/" };
  return null;
}
