import { describe, expect, it } from "vitest";
import { pushUiState, type PushFacts } from "./state";

const base: PushFacts = {
  configured: true,
  iosNeedsHomeScreen: false,
  supported: true,
  permission: "default",
  subscribed: false,
  shortSession: false,
};

describe("pushUiState", () => {
  it("is off when supported and not yet allowed", () => {
    expect(pushUiState(base)).toBe("off");
  });

  it("is on only when this device is subscribed and the permission is granted", () => {
    expect(
      pushUiState({ ...base, permission: "granted", subscribed: true }),
    ).toBe("on");
    expect(
      pushUiState({ ...base, permission: "default", subscribed: true }),
    ).toBe("off");
    expect(
      pushUiState({ ...base, permission: "granted", subscribed: false }),
    ).toBe("off");
  });

  it("is blocked when the browser has refused the permission", () => {
    expect(pushUiState({ ...base, permission: "denied" })).toBe("blocked");
  });

  it("is unavailable while the VAPID settings are missing, whatever else is true", () => {
    expect(
      pushUiState({
        ...base,
        configured: false,
        permission: "granted",
        subscribed: true,
      }),
    ).toBe("unavailable");
  });

  it("asks an iPhone in Safari to add HOSA to the home screen first", () => {
    expect(
      pushUiState({ ...base, iosNeedsHomeScreen: true, supported: false }),
    ).toBe("needs-home-screen");
  });

  it("is unsupported where the browser has no push", () => {
    expect(
      pushUiState({ ...base, supported: false, permission: "unsupported" }),
    ).toBe("unsupported");
  });

  it("needs Stay signed in when the session ends with the browser, even if this device was on", () => {
    expect(pushUiState({ ...base, shortSession: true })).toBe(
      "needs-stay-signed-in",
    );
    expect(
      pushUiState({
        ...base,
        shortSession: true,
        permission: "granted",
        subscribed: true,
      }),
    ).toBe("needs-stay-signed-in");
    // What can't be fixed by signing in again still comes first.
    expect(pushUiState({ ...base, shortSession: true, configured: false })).toBe(
      "unavailable",
    );
    expect(
      pushUiState({ ...base, shortSession: true, iosNeedsHomeScreen: true }),
    ).toBe("needs-home-screen");
    expect(
      pushUiState({
        ...base,
        shortSession: true,
        supported: false,
        permission: "unsupported",
      }),
    ).toBe("unsupported");
  });
});
