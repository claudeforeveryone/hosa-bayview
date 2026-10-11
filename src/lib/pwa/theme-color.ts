// The installed app's status bar (Android, and the Home Screen app on iPhone) takes its colour from the page's
// theme-color tags. The root layout offers the two default grounds by the phone's own light or dark setting, but a
// member can pick a mode or colour theme in Settings that differs, which left a band of the wrong colour above
// every screen. So the page keeps every theme-color tag on its actual ground: before first paint (appearanceScript
// runs THEME_COLOR_SCRIPT), then whenever the look changes (watchThemeColor, from AppearanceSync).

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

// The page's ground as the stylesheet resolves it for the current mode and theme. Empty if the stylesheet hasn't
// loaded, and then nothing changes.
export function syncThemeColor(): void {
  const ground = getComputedStyle(document.documentElement).getPropertyValue(
    "--ground",
  );
  paintThemeColor(document.querySelectorAll(SELECTOR), ground);
}

// Follows every way the look changes (Settings, the header's theme button, the phone switching light and dark on
// Device, another tab), since each one lands on <html> as data-theme or data-palette. The head is watched too, in
// case a navigation puts the layout's original tags back.
export function watchThemeColor(): () => void {
  syncThemeColor();
  const look = new MutationObserver(syncThemeColor);
  look.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-palette"],
  });
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
  };
}

// syncThemeColor for appearanceScript, after it has set data-theme and data-palette. The script sits after the
// stylesheet link, so the browser has the stylesheet by the time it runs. `d` is <html>.
export const THEME_COLOR_SCRIPT = `try{var G=getComputedStyle(d).getPropertyValue('--ground').trim();if(G){var M=document.querySelectorAll('${SELECTOR}');for(var j=0;j<M.length;j++){if(M[j].getAttribute('content')!==G)M[j].setAttribute('content',G)}}}catch(e){}`;
