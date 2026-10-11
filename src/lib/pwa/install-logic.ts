// Install-prompt decisions. Pure: the components pass in what the browser reports and get back what to show.

export const INSTALL_DISMISS_KEY = "hosa-install-dismissed-at";
export const DISMISS_DAYS = 30;
const DAY_MS = 86_400_000;

export type Platform = "ios" | "android" | "other";

// iPadOS asks for desktop sites, so an iPad can report as a Mac; a Mac has no touch points.
export function platformOf(ua: string, maxTouchPoints = 0): Platform {
  if (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && maxTouchPoints > 1)
  )
    return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

// What can install a web app:
//   safari        Safari on iPhone/iPad: Share, then Add to Home Screen.
//   ios-browser   Chrome, Edge, Firefox and co. on iOS 16.4+: the same, from their own Share button.
//   chromium      Chrome-family browsers: they fire beforeinstallprompt, so the app shows its own button.
//   menu-install  Firefox and Samsung Internet on Android: Install / Add to Home screen in their menu.
//   in-app        Instagram, TikTok, Snapchat and other apps' built-in browsers: nothing can be installed.
export type Browser =
  "safari" | "ios-browser" | "chromium" | "menu-install" | "in-app";

const IN_APP =
  /FBAN|FBAV|FB_IAB|Instagram|Snapchat|musical_ly|TikTok|BytedanceWebview|Line\/|LinkedInApp|Twitter|Discord|GSA\//;
const IOS_BROWSERS =
  /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|YaBrowser|Brave/;

export function browserOf(ua: string, maxTouchPoints = 0): Browser {
  if (IN_APP.test(ua)) return "in-app";
  const platform = platformOf(ua, maxTouchPoints);
  if (platform === "ios") {
    if (IOS_BROWSERS.test(ua)) return "ios-browser";
    // A plain WebView leaves out Safari's "Safari/" token.
    return /Safari\//.test(ua) ? "safari" : "in-app";
  }
  if (platform === "android") {
    if (/; wv\)/.test(ua)) return "in-app";
    if (/Firefox\/|SamsungBrowser/.test(ua)) return "menu-install";
  }
  return "chromium";
}

// A dismissal holds for 30 days on this device. A missing, junk or future value counts as never dismissed.
export function isDismissed(stored: string | null, now: number): boolean {
  if (!stored) return false;
  const at = Number(stored);
  if (!Number.isFinite(at) || at > now) return false;
  return now - at < DISMISS_DAYS * DAY_MS;
}

// Pages that need full attention (a test in progress, a live battle, a study or match round) never get the card,
// and nor does Settings, whose Phone app tab already has the full steps.
const QUIET = [
  /^\/settings(\/|$)/,
  /^\/c\/[^/]+\/tests\/[^/]+\/a\//,
  /^\/battle\//,
  /^\/flashcards\/[^/]+\/(study|match)$/,
  /^\/career\/(quiz|flashcards)$/,
  /^\/blc\/[^/]+/,
];
export const isQuietPath = (path: string) => QUIET.some((re) => re.test(path));

export type InstallView = {
  standalone: boolean;
  phone: boolean;
  dismissed: boolean;
  // A beforeinstallprompt was captured.
  canPrompt: boolean;
  platform: Platform;
  browser: Browser;
  path: string;
};

export type InstallCard =
  "android-prompt" | "android-menu" | "ios" | "open-in-browser" | null;

// The card is for phones in a normal browser tab. The installed app, computers, quiet pages and a recent
// "Not now" never see it.
export function installCardMode(v: InstallView): InstallCard {
  if (v.standalone || !v.phone || v.dismissed || isQuietPath(v.path))
    return null;
  if (v.canPrompt) return "android-prompt";
  if (v.browser === "in-app")
    return v.platform === "other" ? null : "open-in-browser";
  if (v.platform === "ios") return "ios";
  if (v.platform === "android" && v.browser === "menu-install")
    return "android-menu";
  // Chrome on Android: wait for its install prompt (it never comes once the app is installed).
  return null;
}

export type InstallGuide =
  | "installed"
  | "prompt"
  | "ios"
  | "open-in-browser"
  | "android-menu"
  | "desktop";

// Settings > Phone app always explains, whatever the screen size or an earlier "Not now".
export function installGuide(v: InstallView): InstallGuide {
  if (v.standalone) return "installed";
  if (v.canPrompt) return "prompt";
  if (v.browser === "in-app") return "open-in-browser";
  if (v.platform === "ios") return "ios";
  if (v.platform === "android") return "android-menu";
  return "desktop";
}
