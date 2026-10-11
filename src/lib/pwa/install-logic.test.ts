import { describe, expect, it } from "vitest";
import {
  browserOf,
  DISMISS_DAYS,
  installCardMode,
  installGuide,
  isDismissed,
  isQuietPath,
  platformOf,
  type InstallView,
} from "./install-logic";

// Real user-agent strings, one per browser family that matters here.
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.0.0 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 380.0.0.24.104 (iPhone15,3; iOS 18_5; en_CA; en; scale=3.00; 1290x2796; 715322045)";
const IPHONE_WEBVIEW =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
const ANDROID_FIREFOX =
  "Mozilla/5.0 (Android 15; Mobile; rv:139.0) Gecko/139.0 Firefox/139.0";
const ANDROID_SAMSUNG =
  "Mozilla/5.0 (Linux; Android 15; SAMSUNG SM-S921W) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36";
const ANDROID_INSTAGRAM =
  "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP4A.250205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 Mobile Safari/537.36 Instagram 370.0.0.0.0 Android";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";

describe("platformOf", () => {
  it("finds iPhone, iPad (also in desktop mode) and Android", () => {
    expect(platformOf(IPHONE_SAFARI, 5)).toBe("ios");
    expect(platformOf(IPAD_DESKTOP_MODE, 5)).toBe("ios");
    expect(platformOf(ANDROID_CHROME, 5)).toBe("android");
    expect(platformOf(ANDROID_FIREFOX, 5)).toBe("android");
  });

  it("does not call a desktop Mac ios", () => {
    expect(platformOf(MAC_SAFARI, 0)).toBe("other");
  });
});

describe("browserOf", () => {
  it("tells Safari from other iPhone browsers, which can also add to the Home Screen since iOS 16.4", () => {
    expect(browserOf(IPHONE_SAFARI, 5)).toBe("safari");
    expect(browserOf(IPAD_DESKTOP_MODE, 5)).toBe("safari");
    expect(browserOf(IPHONE_CHROME, 5)).toBe("ios-browser");
  });

  it("spots in-app browsers, which can't add anything to the home screen", () => {
    expect(browserOf(IPHONE_INSTAGRAM, 5)).toBe("in-app");
    expect(browserOf(IPHONE_WEBVIEW, 5)).toBe("in-app");
    expect(browserOf(ANDROID_INSTAGRAM, 5)).toBe("in-app");
  });

  it("knows which Android browsers install from their menu instead of an install prompt", () => {
    expect(browserOf(ANDROID_CHROME, 5)).toBe("chromium");
    expect(browserOf(ANDROID_FIREFOX, 5)).toBe("menu-install");
    expect(browserOf(ANDROID_SAMSUNG, 5)).toBe("menu-install");
  });
});

describe("isDismissed", () => {
  const now = Date.UTC(2026, 9, 11);
  const day = 86_400_000;

  it("holds a dismissal for 30 days", () => {
    expect(DISMISS_DAYS).toBe(30);
    expect(isDismissed(String(now - 29 * day), now)).toBe(true);
    expect(isDismissed(String(now - 31 * day), now)).toBe(false);
  });

  it("treats a missing, junk or future value as never dismissed", () => {
    expect(isDismissed(null, now)).toBe(false);
    expect(isDismissed("soon", now)).toBe(false);
    expect(isDismissed(String(now + 5 * day), now)).toBe(false);
  });
});

describe("isQuietPath", () => {
  it("keeps the card off pages that need full attention", () => {
    for (const path of [
      "/c/r1/tests/t1/a/a1",
      "/battle/b1",
      "/flashcards/d1/study",
      "/flashcards/d1/match",
      "/career/quiz",
      "/career/flashcards",
      "/blc/x",
    ]) {
      expect(isQuietPath(path), path).toBe(true);
    }
  });

  it("lets it show on ordinary pages", () => {
    for (const path of [
      "/",
      "/events",
      "/c/r1",
      "/c/r1/tests",
      "/settings",
      "/calendar",
    ]) {
      expect(isQuietPath(path), path).toBe(false);
    }
  });
});

const phone: InstallView = {
  standalone: false,
  phone: true,
  dismissed: false,
  canPrompt: false,
  platform: "ios",
  browser: "safari",
  path: "/",
};

describe("installCardMode", () => {
  it("shows the Add to Home Screen steps in Safari and other iPhone browsers", () => {
    expect(installCardMode(phone)).toBe("ios");
    expect(installCardMode({ ...phone, browser: "ios-browser" })).toBe("ios");
  });

  it("asks iPhone in-app browsers to open the page in Safari", () => {
    expect(installCardMode({ ...phone, browser: "in-app" })).toBe(
      "open-in-browser",
    );
  });

  it("offers the install button once Chrome on Android has offered to install", () => {
    const android = {
      ...phone,
      platform: "android" as const,
      browser: "chromium" as const,
    };
    expect(installCardMode(android)).toBeNull();
    expect(installCardMode({ ...android, canPrompt: true })).toBe(
      "android-prompt",
    );
  });

  it("points Firefox and Samsung Internet on Android to their menu, unless they offered a prompt", () => {
    const firefox = {
      ...phone,
      platform: "android" as const,
      browser: "menu-install" as const,
    };
    expect(installCardMode(firefox)).toBe("android-menu");
    expect(installCardMode({ ...firefox, canPrompt: true })).toBe(
      "android-prompt",
    );
  });

  it("asks Android in-app browsers to open the page in a browser", () => {
    expect(
      installCardMode({ ...phone, platform: "android", browser: "in-app" }),
    ).toBe("open-in-browser");
  });

  it("never shows in the installed app, on a computer, after a dismissal or on a quiet page", () => {
    expect(installCardMode({ ...phone, standalone: true })).toBeNull();
    expect(installCardMode({ ...phone, phone: false })).toBeNull();
    expect(installCardMode({ ...phone, dismissed: true })).toBeNull();
    expect(installCardMode({ ...phone, path: "/battle/b1" })).toBeNull();
    expect(
      installCardMode({
        ...phone,
        platform: "other",
        browser: "chromium",
        canPrompt: true,
        phone: false,
      }),
    ).toBeNull();
  });
});

describe("installGuide (the permanent entry in Settings)", () => {
  const view = { ...phone, phone: false, dismissed: true, path: "/settings" };

  it("says it's installed when running from the home screen", () => {
    expect(installGuide({ ...view, standalone: true })).toBe("installed");
  });

  it("ignores dismissals and screen size: Settings always explains", () => {
    expect(installGuide(view)).toBe("ios");
    expect(installGuide({ ...view, browser: "in-app" })).toBe(
      "open-in-browser",
    );
    expect(
      installGuide({
        ...view,
        platform: "android",
        browser: "chromium",
        canPrompt: true,
      }),
    ).toBe("prompt");
    expect(
      installGuide({ ...view, platform: "android", browser: "chromium" }),
    ).toBe("android-menu");
    expect(
      installGuide({
        ...view,
        platform: "other",
        browser: "chromium",
        canPrompt: true,
      }),
    ).toBe("prompt");
    expect(
      installGuide({ ...view, platform: "other", browser: "chromium" }),
    ).toBe("desktop");
  });
});
