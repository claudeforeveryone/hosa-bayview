import { describe, expect, it } from "vitest";
import { pushConfig } from "./config";

// Shapes as `npx web-push generate-vapid-keys` prints them: a 65-byte public key (87 base64url characters, starting
// with B for an uncompressed point) and a 32-byte private key (43 characters). Not real keys.
const PUBLIC = `B${"x".repeat(86)}`;
const PRIVATE = "y".repeat(43);
const SECRET = "z".repeat(43);

const good = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: PUBLIC,
  VAPID_PRIVATE_KEY: PRIVATE,
  VAPID_SUBJECT: "mailto:josephislockedin@gmail.com",
  PUSH_INTERNAL_SECRET: SECRET,
};

describe("pushConfig", () => {
  it("is on only when every value is present", () => {
    expect(pushConfig(good)).toEqual({
      publicKey: PUBLIC,
      privateKey: PRIVATE,
      subject: "mailto:josephislockedin@gmail.com",
      internalSecret: SECRET,
    });
  });

  it("trims stray whitespace from pasted values", () => {
    expect(
      pushConfig({ ...good, VAPID_PRIVATE_KEY: ` ${PRIVATE}\n` })?.privateKey,
    ).toBe(PRIVATE);
  });

  it("switches itself off when any value is missing or blank", () => {
    for (const key of Object.keys(good) as (keyof typeof good)[]) {
      expect(pushConfig({ ...good, [key]: undefined }), key).toBeNull();
      expect(pushConfig({ ...good, [key]: "   " }), key).toBeNull();
    }
  });

  it("switches itself off when a key is not the shape web-push makes, instead of failing at send time", () => {
    expect(
      pushConfig({
        ...good,
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BPublicKeyForTests",
      }),
    ).toBeNull();
    expect(
      pushConfig({
        ...good,
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: `A${"x".repeat(86)}`,
      }),
    ).toBeNull();
    expect(pushConfig({ ...good, VAPID_PRIVATE_KEY: "short" })).toBeNull();
    expect(
      pushConfig({ ...good, VAPID_PRIVATE_KEY: `${"y".repeat(42)}+` }),
    ).toBeNull();
  });

  it("switches itself off when the database secret is too short to be safe", () => {
    expect(
      pushConfig({ ...good, PUSH_INTERNAL_SECRET: "s".repeat(31) }),
    ).toBeNull();
  });

  it("refuses a contact that is neither mailto: nor https:", () => {
    expect(
      pushConfig({ ...good, VAPID_SUBJECT: "josephislockedin@gmail.com" }),
    ).toBeNull();
    expect(
      pushConfig({ ...good, VAPID_SUBJECT: "http://example.com" }),
    ).toBeNull();
  });

  it("accepts an https: contact", () => {
    expect(
      pushConfig({ ...good, VAPID_SUBJECT: "https://hosa-bayview.vercel.app" })
        ?.subject,
    ).toBe("https://hosa-bayview.vercel.app");
  });
});
