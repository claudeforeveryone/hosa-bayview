// "Stay signed in" off: the sign-in sets this marker as a browser-session cookie. While it is there, the auth
// cookies are written without an expiry too, so closing the browser signs the member out. Clearing a cookie
// (maxAge 0) still goes through, so sign-out works either way.
export const SHORT_SESSION = "hosa-short-session";

type Options = { maxAge?: number; expires?: Date } & Record<string, unknown>;

export function sessionCookieOptions<T extends Options>(
  options: T,
  short: boolean,
): T {
  if (!short || options.maxAge === 0) return options;
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}
