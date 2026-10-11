import { describe, expect, it } from "vitest";
import { subscribeSchema, unsubscribeSchema } from "./subscription";

// A P-256 key is 65 bytes, 87 characters once base64url-encoded without padding. The auth secret is 16 bytes, 22 characters.
const P256DH = `B${"a".repeat(86)}`;
const AUTH = "a".repeat(22);
const FCM = "https://fcm.googleapis.com/fcm/send/abc123";

const valid = { endpoint: FCM, keys: { p256dh: P256DH, auth: AUTH } };

describe("subscribeSchema", () => {
  it("accepts a well-formed browser subscription", () => {
    expect(subscribeSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts the sound setting either way and defaults nothing", () => {
    expect(subscribeSchema.parse({ ...valid, sound: false }).sound).toBe(false);
    expect(subscribeSchema.parse(valid).sound).toBeUndefined();
  });

  it("refuses an endpoint off the allowlist", () => {
    const result = subscribeSchema.safeParse({
      ...valid,
      endpoint: "https://evil.example/send/x",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "That push service is not allowed",
    );
  });

  it("refuses keys that are the wrong shape or length", () => {
    expect(
      subscribeSchema.safeParse({
        ...valid,
        keys: { p256dh: "short", auth: AUTH },
      }).success,
    ).toBe(false);
    expect(
      subscribeSchema.safeParse({
        ...valid,
        keys: { p256dh: P256DH, auth: "short" },
      }).success,
    ).toBe(false);
    expect(
      subscribeSchema.safeParse({
        ...valid,
        keys: { p256dh: `${P256DH}+/=`, auth: AUTH },
      }).success,
    ).toBe(false);
  });

  // web-push refuses any key that doesn't decode to exactly 65 bytes, so a near miss saved here would only fail at
  // send time, over and over.
  it("refuses keys that are close to the right size but not exactly it", () => {
    const keys = (p256dh: string, auth: string) =>
      subscribeSchema.safeParse({ ...valid, keys: { p256dh, auth } }).success;
    expect(keys(`B${"a".repeat(85)}`, AUTH)).toBe(false); // 86 characters: 64 bytes
    expect(keys(`B${"a".repeat(87)}`, AUTH)).toBe(false); // 88 characters: 66 bytes
    expect(keys(`B${"a".repeat(79)}`, AUTH)).toBe(false); // 80, the old floor
    expect(keys(`A${"a".repeat(86)}`, AUTH)).toBe(false); // not an uncompressed point (first byte 0x04)
    expect(keys(P256DH, "a".repeat(21))).toBe(false);
    expect(keys(P256DH, "a".repeat(23))).toBe(false);
    expect(keys(P256DH, "a".repeat(32))).toBe(false); // the old ceiling
    expect(keys(`${P256DH}==`, AUTH)).toBe(false); // 65 bytes take one pad character, not two
    expect(keys(P256DH, `${AUTH}=`)).toBe(false); // 16 bytes take two, not one
  });

  it("accepts keys with base64 padding, as some browsers send them", () => {
    expect(
      subscribeSchema.safeParse({
        ...valid,
        keys: { p256dh: `${P256DH}=`, auth: `${AUTH}==` },
      }).success,
    ).toBe(true);
  });

  it("refuses a missing endpoint or keys", () => {
    expect(subscribeSchema.safeParse({ keys: valid.keys }).success).toBe(false);
    expect(subscribeSchema.safeParse({ endpoint: FCM }).success).toBe(false);
  });
});

describe("unsubscribeSchema", () => {
  it("accepts only an allowed endpoint", () => {
    expect(unsubscribeSchema.safeParse({ endpoint: FCM }).success).toBe(true);
    expect(
      unsubscribeSchema.safeParse({ endpoint: "http://fcm.googleapis.com/x" })
        .success,
    ).toBe(false);
  });
});
