import { describe, expect, it } from "vitest";
import { routeGate } from "./route-gate";

describe("routeGate", () => {
  it("sends guests to login, remembering where they were going", () => {
    expect(routeGate("/", "", false)).toEqual({ redirect: "/login" });
    expect(routeGate("/c/abc", "?tab=tests", false)).toEqual({ redirect: "/login?next=%2Fc%2Fabc%3Ftab%3Dtests" });
  });

  it("lets guests reach public auth pages and callbacks", () => {
    for (const p of ["/login", "/signup", "/forgot-password", "/auth/callback", "/auth/signout"]) {
      expect(routeGate(p, "", false)).toBeNull();
    }
  });

  it("does not treat lookalike paths as public", () => {
    expect(routeGate("/login-admin", "", false)).not.toBeNull();
    expect(routeGate("/authx", "", false)).not.toBeNull();
  });

  it("bounces signed-in users off login and signup only", () => {
    expect(routeGate("/login", "", true)).toEqual({ redirect: "/" });
    expect(routeGate("/signup", "", true)).toEqual({ redirect: "/" });
    expect(routeGate("/auth/signout", "", true)).toBeNull();
    expect(routeGate("/reset-password", "", true)).toBeNull();
    expect(routeGate("/", "", true)).toBeNull();
  });
});
