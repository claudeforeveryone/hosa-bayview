import { createECDH, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The network half of web-push is mocked: the tests never reach a real push service. Its encryption is the real
// one, because the sender relies on it to tell a broken subscription from a network blip.
const webpush = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));
vi.mock("web-push", async (importOriginal) => {
  const real = (await importOriginal<{ default: typeof import("web-push") }>())
    .default;
  return { default: { ...webpush, encrypt: real.encrypt } };
});

import { makeSender } from "./sender";

// A real browser's keys: an uncompressed P-256 public key and a 16-byte auth secret, base64url.
const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const P256DH = ecdh.getPublicKey().toString("base64url");
const AUTH = randomBytes(16).toString("base64url");

const cfg = {
  publicKey: `B${"a".repeat(86)}`,
  privateKey: "p".repeat(43),
  subject: "mailto:josephislockedin@gmail.com",
  internalSecret: "s".repeat(43),
};
const target = {
  endpoint: "https://fcm.googleapis.com/fcm/send/x",
  p256dh: P256DH,
  auth: AUTH,
};
const payload = {
  title: "New test: Medical Terminology",
  body: "Room",
  url: "/c/a/tests/b",
  tag: "n1",
  kind: "test",
  silent: false,
};

describe("makeSender", () => {
  beforeEach(() => {
    webpush.setVapidDetails.mockReset();
    webpush.sendNotification.mockReset();
  });

  it("sends the JSON payload signed with this site's VAPID keys, a day to live and a timeout", async () => {
    webpush.sendNotification.mockResolvedValueOnce({ statusCode: 201 });
    const result = await makeSender(cfg)(target, payload);
    expect(result).toEqual({ ok: true });
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: target.endpoint, keys: { p256dh: P256DH, auth: AUTH } },
      JSON.stringify(payload),
      {
        TTL: 86400,
        urgency: "normal",
        timeout: 10000,
        vapidDetails: {
          subject: cfg.subject,
          publicKey: cfg.publicKey,
          privateKey: cfg.privateKey,
        },
      },
    );
  });

  it("never changes web-push's global settings", () => {
    makeSender(cfg);
    expect(webpush.setVapidDetails).not.toHaveBeenCalled();
  });

  it("marks 404 and 410 as gone so the device is deleted", async () => {
    for (const statusCode of [404, 410]) {
      webpush.sendNotification.mockRejectedValueOnce(
        Object.assign(new Error("gone"), { statusCode }),
      );
      expect(await makeSender(cfg)(target, payload)).toEqual({
        ok: false,
        statusCode,
        gone: true,
      });
    }
  });

  it("reports other failures with their status but keeps the device", async () => {
    for (const statusCode of [400, 403, 413, 429, 500, 503]) {
      webpush.sendNotification.mockRejectedValueOnce(
        Object.assign(new Error("refused"), { statusCode }),
      );
      expect(await makeSender(cfg)(target, payload)).toEqual({
        ok: false,
        statusCode,
        gone: false,
      });
    }
  });

  it("reports a network error with no status and keeps the device", async () => {
    webpush.sendNotification.mockRejectedValueOnce(new Error("socket reset"));
    expect(await makeSender(cfg)(target, payload)).toEqual({
      ok: false,
      statusCode: null,
      gone: false,
    });
  });

  it("reports web-push's own socket timeout as a passing failure too", async () => {
    // web-push-lib.js destroys a request that times out with this plain Error: no status, no code.
    webpush.sendNotification.mockRejectedValueOnce(new Error("Socket timeout"));
    expect(await makeSender(cfg)(target, payload)).toEqual({
      ok: false,
      statusCode: null,
      gone: false,
    });
  });

  // web-push throws, before any network call, when a subscription's keys can't encrypt a push. Retrying can't fix
  // that, so it is a refusal (one strike against the device), not a passing failure to try 5 times.
  it("reports keys web-push can't encrypt with as a refusal, not a passing failure", async () => {
    const offCurve = Buffer.concat([
      Buffer.from([4]),
      Buffer.alloc(64),
    ]).toString("base64url");
    const broken = [
      { p256dh: `B${"a".repeat(87)}`, auth: AUTH }, // 66 bytes
      { p256dh: offCurve, auth: AUTH }, // 65 bytes, but not a point on the curve
      { p256dh: P256DH, auth: "a".repeat(10) }, // auth secret too short
    ];
    for (const keys of broken) {
      // What the real sendNotification does with these keys: reject before sending, with a plain Error.
      webpush.sendNotification.mockRejectedValueOnce(
        new Error("The subscription p256dh value should be 65 bytes long."),
      );
      expect(await makeSender(cfg)({ ...target, ...keys }, payload)).toEqual({
        ok: false,
        statusCode: 400,
        gone: false,
      });
    }
  });
});
