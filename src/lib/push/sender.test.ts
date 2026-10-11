import { beforeEach, describe, expect, it, vi } from "vitest";

// web-push is mocked: the tests never reach a real push service.
const webpush = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));
vi.mock("web-push", () => ({ default: webpush }));

import { makeSender } from "./sender";

const cfg = {
  publicKey: `B${"a".repeat(86)}`,
  privateKey: "p".repeat(43),
  subject: "mailto:josephislockedin@gmail.com",
  internalSecret: "s".repeat(43),
};
const target = {
  endpoint: "https://fcm.googleapis.com/fcm/send/x",
  p256dh: "key",
  auth: "secret",
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
      { endpoint: target.endpoint, keys: { p256dh: "key", auth: "secret" } },
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
});
