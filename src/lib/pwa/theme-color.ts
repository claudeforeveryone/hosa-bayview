// The installed app's status bar (Android, and the Home Screen app on iPhone) takes its colour from the page's
// theme-color tags. The root layout offers the two default grounds by the phone's own light or dark setting, but a
// member can pick a mode or colour theme in Settings that differs, which left a band of the wrong colour above
// every screen. So the page keeps every theme-color tag on the colour actually at the top of the screen: before
// first paint (appearanceScript runs THEME_COLOR_SCRIPT), then whenever the look, the page or the screen width
// changes (watchThemeColor, from AppearanceSync). That colour is the ground, except on the sign-in pages on a
// phone, which open with the navy field band (the (auth) layout, below the desktop breakpoint). The installed
// iPhone app always starts there, signed out, because its storage is separate from Safari's.

// The (auth) layout's pages; a test checks this against the route folders.
const FIELD_TOP = "^/(login|signup|forgot-password|reset-password|banned)(/|$)";
// Below Tailwind's lg breakpoint the (auth) layout stacks, field band first.
const NARROW = "(max-width: 1023px)";

export function statusBarToken(
  path: string,
  narrow: boolean,
): "--field" | "--ground" {
  return narrow && new RegExp(FIELD_TOP).test(path) ? "--field" : "--ground";
}

type Meta = {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
};

const SELECTOR = 'meta[name="theme-color"]';

// Sets every tag to the ground. The media attributes stay: with every tag on the same colour, whichever one the
// phone's setting picks is right. Returns how many tags changed, so a watcher can't feed itself.
export function paintThemeColor(
  metas: ArrayLike<Meta>,
  ground: string,
): number {
  const colour = ground.trim();
  if (!colour) return 0;
  let changed = 0;
  for (let i = 0; i < metas.length; i += 1) {
    if (metas[i].getAttribute("content") !== colour) {
      metas[i].setAttribute("content", colour);
      changed += 1;
    }
  }
  return changed;
}

// The colour at the top of the screen as the stylesheet resolves it for the current mode, theme and page. Empty if
// the stylesheet hasn't loaded, and then nothing changes.
export function syncThemeColor(): void {
  const token = statusBarToken(location.pathname, matchMedia(NARROW).matches);
  const colour = getComputedStyle(document.documentElement).getPropertyValue(
    token,
  );
  paintThemeColor(document.querySelectorAll(SELECTOR), colour);
}

// Follows every way the look changes (Settings, the header's theme button, the phone switching light and dark on
// Device, another tab), since each one lands on <html> as data-theme, data-palette or a custom colour in its style.
// The head is watched too, in case a navigation puts the layout's original tags back, and so is the screen width.
// AppearanceSync also calls syncThemeColor when the page changes.
export function watchThemeColor(): () => void {
  syncThemeColor();
  const look = new MutationObserver(syncThemeColor);
  look.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-palette", "style"],
  });
  const width = matchMedia(NARROW);
  width.addEventListener("change", syncThemeColor);
  const head = new MutationObserver(syncThemeColor);
  head.observe(document.head, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["content", "media", "name"],
  });
  return () => {
    look.disconnect();
    head.disconnect();
    width.removeEventListener("change", syncThemeColor);
  };
}

// syncThemeColor for appearanceScript, after it has set data-theme and data-palette. The script sits after the
// stylesheet link, so the browser has the stylesheet by the time it runs. `d` is <html>.
export const THEME_COLOR_SCRIPT = `try{var T=matchMedia('${NARROW}').matches&&new RegExp('${FIELD_TOP}').test(location.pathname)?'--field':'--ground',G=getComputedStyle(d).getPropertyValue(T).trim();if(G){var M=document.querySelectorAll('${SELECTOR}');for(var j=0;j<M.length;j++){if(M[j].getAttribute('content')!==G)M[j].setAttribute('content',G)}}}catch(e){}`;
