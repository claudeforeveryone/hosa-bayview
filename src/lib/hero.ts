// The banner on Home and the sign-in page plays its entrance once per browser session. A reload, or coming
// back later in the same tab, shows it at rest. Each variant counts on its own, so signing in still plays
// Home's banner after the sign-in page's.
export type HeroVariant = "bare" | "panel";
export const HERO_SEEN_KEY = "hosa-hero-seen";

// The stored value is a space-separated list of variants already seen.
export function addSeen(list: string | null, variant: HeroVariant): string {
  const seen = new Set(
    (list ?? "").split(" ").filter((v) => v === "bare" || v === "panel"),
  );
  seen.add(variant);
  return [...seen].sort().join(" ");
}

export function markHeroSeen(variant: HeroVariant) {
  try {
    sessionStorage.setItem(
      HERO_SEEN_KEY,
      addSeen(sessionStorage.getItem(HERO_SEEN_KEY), variant),
    );
  } catch {}
}

// Inline in <head>, before paint: <html data-hero-rest="bare panel"> lists the banners that rest on this
// page load. The stylesheet stops their entrance. Storage failing means the banner plays, as before.
export const heroRestScript = `(function(){try{var v=sessionStorage.getItem(${JSON.stringify(HERO_SEEN_KEY)});if(v&&/^(bare|panel)( (bare|panel))?$/.test(v))document.documentElement.setAttribute("data-hero-rest",v)}catch(e){}})();`;
