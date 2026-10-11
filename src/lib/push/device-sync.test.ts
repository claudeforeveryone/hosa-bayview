import { describe, expect, it } from "vitest";
import { deviceSyncStep, type DeviceFacts } from "./device-sync";

const EP = "https://fcm.googleapis.com/fcm/send/phone-a";

function facts(over: Partial<DeviceFacts> = {}): DeviceFacts {
  return {
    userId: "u1",
    permission: "granted",
    subscription: { endpoint: EP, sameKey: true },
    sound: true,
    shortSession: false,
    lastSaved: null,
    ...over,
  };
}

describe("deviceSyncStep", () => {
  it("saves a device with notifications on once per page load, for whoever is signed in", () => {
    const step = deviceSyncStep(facts());
    expect(step).toEqual({ kind: "save", key: `u1|${EP}|on` });
    expect(
      deviceSyncStep(
        facts({ lastSaved: step.kind === "save" ? step.key : null }),
      ),
    ).toEqual({
      kind: "none",
    });
  });

  it("saves again when the Notification sound setting changes", () => {
    expect(
      deviceSyncStep(facts({ sound: false, lastSaved: `u1|${EP}|on` })),
    ).toEqual({ kind: "save", key: `u1|${EP}|off` });
  });

  it("saves again for a different member on the same browser, so the device follows the session", () => {
    expect(
      deviceSyncStep(facts({ userId: "u2", lastSaved: `u1|${EP}|on` })),
    ).toEqual({
      kind: "save",
      key: `u2|${EP}|on`,
    });
  });

  it("does nothing on a browser without a subscription", () => {
    expect(deviceSyncStep(facts({ subscription: null }))).toEqual({
      kind: "none",
    });
  });

  it("drops a subscription made with an older server key: every push to it is refused", () => {
    expect(
      deviceSyncStep(facts({ subscription: { endpoint: EP, sameKey: false } })),
    ).toEqual({ kind: "drop" });
  });

  it("drops a subscription once the member has blocked notifications for the site", () => {
    expect(deviceSyncStep(facts({ permission: "denied" }))).toEqual({
      kind: "drop",
    });
  });

  it("drops the device during a session without Stay signed in, which ends when the browser closes", () => {
    expect(deviceSyncStep(facts({ shortSession: true }))).toEqual({
      kind: "drop",
    });
    expect(
      deviceSyncStep(facts({ shortSession: true, lastSaved: `u1|${EP}|on` })),
    ).toEqual({ kind: "drop" });
    expect(
      deviceSyncStep(facts({ shortSession: true, subscription: null })),
    ).toEqual({ kind: "none" });
  });

  it("leaves an undecided permission alone rather than guess", () => {
    expect(deviceSyncStep(facts({ permission: "default" }))).toEqual({
      kind: "none",
    });
  });
});
