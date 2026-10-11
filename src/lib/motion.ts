// Whether motion should land at once: the device's Reduce Motion setting, or the calm motion an older Settings
// stored (<html data-motion="calm">, still honoured). CSS covers both in globals.css; JS that animates or
// scrolls with an explicit `behavior: "smooth"` overrides that CSS, so it asks here first. Browser only.
export function prefersCalm(): boolean {
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.dataset.motion === "calm"
  );
}
