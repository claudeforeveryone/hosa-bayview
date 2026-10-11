import { SHORT_SESSION } from "@/lib/session-length";

// "Stay signed in" off: the sign-in sets a browser-session marker (src/lib/session-length.ts), and the session ends
// when the browser closes. A push subscription outlives that, and nothing on the server learns the session ended,
// so the member's notifications would keep landing on a shared or borrowed device. Push needs Stay signed in.
// The marker isn't HttpOnly, so this reads a request's Cookie header and document.cookie alike.
export function isShortSession(cookies: string | null): boolean {
  if (!cookies) return false;
  return cookies
    .split(";")
    .some((part) => part.trim() === `${SHORT_SESSION}=1`);
}

// Said by the subscribe route's refusal and shown in place of the switch, so both read the same.
export const NEEDS_STAY_SIGNED_IN =
  "Notifications need Stay signed in. Log out, then log back in with Stay signed in ticked.";
