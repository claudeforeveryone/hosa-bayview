// When the element that holds keyboard focus leaves the page (a control swapped for a message, a card closing), the
// browser drops focus to <body>: a keyboard user's next Tab starts again from the top, and a screen reader says
// nothing about what happened. handOffFocus returns a ref callback for that element. React runs its cleanup just
// before taking the element out, while focus is still inside; if it is, `move` runs once the page has settled,
// unless something else has taken focus by then.

type Env = { doc?: Document; nextFrame?: (fn: () => void) => void };

export function handOffFocus(move: () => void, env: Env = {}) {
  return (el: HTMLElement | null): (() => void) | undefined => {
    if (!el) return undefined;
    return () => {
      const doc = env.doc ?? document;
      if (!el.contains(doc.activeElement)) return;
      const nextFrame = env.nextFrame ?? requestAnimationFrame;
      nextFrame(() => {
        // Still there (the ref was only swapped on a re-render), or focus already went somewhere on purpose.
        if (el.isConnected) return;
        const active = doc.activeElement as
          (Element & { isConnected?: boolean }) | null;
        if (active && active !== doc.body && active.isConnected) return;
        move();
      });
    };
  };
}

// Focuses a landmark such as <main> that isn't focusable by itself, without scrolling the page, and makes it
// unfocusable again once focus moves on, so a click inside it later doesn't land focus on the whole region.
export function focusRegion(el: HTMLElement | null): void {
  if (!el) return;
  if (!el.hasAttribute("tabindex")) {
    el.setAttribute("tabindex", "-1");
    el.addEventListener("blur", () => el.removeAttribute("tabindex"), {
      once: true,
    });
  }
  el.focus({ preventScroll: true });
}
