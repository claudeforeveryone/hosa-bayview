// The push_subscriptions row this browser saved, kept in an HttpOnly cookie. Signing out reads it to remove this
// device's row on the server, so a phone that is signed out (or handed to someone else) stops getting the last
// member's notifications. Only a row id: no endpoint or keys, and RLS limits any use of it to the member's own rows.

export const PUSH_DEVICE_COOKIE = "hosa-push-device";

const ROW_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseDeviceId(value: unknown): string | null {
  return typeof value === "string" && ROW_ID.test(value)
    ? value.toLowerCase()
    : null;
}

// Reads the cookie straight from a request's Cookie header (route handlers get a plain Request).
export function deviceIdFromCookieHeader(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at === -1) continue;
    if (part.slice(0, at).trim() === PUSH_DEVICE_COOKIE) {
      return parseDeviceId(part.slice(at + 1).trim());
    }
  }
  return null;
}

// Chrome keeps a cookie for at most 400 days; a device that hasn't re-saved in that time has re-saved by now
// anyway (Settings and every signed-in visit refresh it).
export function deviceCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 400 * 24 * 60 * 60,
  };
}
