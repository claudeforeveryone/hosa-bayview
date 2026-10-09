import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { sessionState } from "./session-state";

describe("sessionState", () => {
  it("reads a valid session as signed in", () => {
    expect(sessionState({ data: { claims: { sub: "u1" } }, error: null })).toBe("signed-in");
  });

  it("reads no session as signed out", () => {
    expect(sessionState({ data: null, error: null })).toBe("signed-out");
  });

  it("reads a rejected refresh token as signed out", () => {
    const err = new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found");
    expect(sessionState({ data: null, error: err })).toBe("signed-out");
  });

  it("reads a network or 5xx failure as unavailable, not signed out", () => {
    expect(sessionState({ data: null, error: new AuthRetryableFetchError("fetch failed", 0) })).toBe("unavailable");
    expect(sessionState({ data: null, error: new AuthRetryableFetchError("bad gateway", 502) })).toBe("unavailable");
  });
});
