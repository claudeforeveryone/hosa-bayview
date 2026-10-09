import { describe, expect, it } from "vitest";
import { SHORT_SESSION, sessionCookieOptions } from "./session-length";

describe("sessionCookieOptions", () => {
  const options = {
    path: "/",
    maxAge: 34_560_000,
    expires: new Date("2027-11-13"),
    sameSite: "lax" as const,
  };

  it("keeps the long expiry when the member stays signed in", () => {
    expect(sessionCookieOptions(options, false)).toEqual(options);
  });

  it("drops the expiry for a short session, so the browser forgets it on close", () => {
    expect(sessionCookieOptions(options, true)).toEqual({
      path: "/",
      sameSite: "lax",
    });
  });

  it("still clears a cookie (maxAge 0) during a short session, e.g. on sign-out", () => {
    expect(sessionCookieOptions({ path: "/", maxAge: 0 }, true)).toEqual({
      path: "/",
      maxAge: 0,
    });
  });

  it("names its marker cookie", () => {
    expect(SHORT_SESSION).toBe("hosa-short-session");
  });
});
