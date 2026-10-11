import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint, MAX_ENDPOINT_LENGTH } from "./endpoints";

describe("isAllowedPushEndpoint", () => {
  it("accepts the push services browsers hand out", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc123",
      "https://updates.push.services.mozilla.com/wpush/v2/abc123",
      "https://wns2-pn1p.notify.windows.com/w/?token=abc",
      "https://web.push.apple.com/QGMvAbCdEf",
      "https://api.push.apple.com/abc123",
      "https://fcm.googleapis.com:443/fcm/send/x",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(true);
    }
  });

  it("refuses lookalike hosts, plain http and anything else", () => {
    for (const url of [
      "http://fcm.googleapis.com/fcm/send/x",
      "https://fcm.googleapis.com.evil.example/send/x",
      "https://evil.example/fcm.googleapis.com/send/x",
      "https://push.apple.com.evil.example/x",
      "https://evil-notify.windows.com.example/x",
      "https://notify.windows.com/x",
      "https://fcm.googleapis.com@evil.example/x",
      "https://example.com/",
      "not a url",
      "",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(false);
    }
  });

  it("refuses an endpoint longer than the limit", () => {
    const long = `https://fcm.googleapis.com/${"a".repeat(MAX_ENDPOINT_LENGTH)}`;
    expect(isAllowedPushEndpoint(long)).toBe(false);
  });
});
