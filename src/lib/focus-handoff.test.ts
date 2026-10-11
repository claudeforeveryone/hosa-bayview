import { describe, expect, it, vi } from "vitest";
import { focusRegion, handOffFocus } from "./focus-handoff";

// A stand-in page: a body, the element that may hold focus, and a queue standing in for the next frame.
function page() {
  const body = { isConnected: true };
  const doc: { activeElement: unknown; body: unknown } = {
    activeElement: body,
    body,
  };
  const frames: (() => void)[] = [];
  const control = {
    isConnected: true,
    contains: (x: unknown) => x === control || x === inner,
  };
  const inner = { isConnected: true };
  const env = {
    doc: doc as unknown as Document,
    nextFrame: (fn: () => void) => {
      frames.push(fn);
    },
  };
  // The element leaves the page: the browser drops focus to <body> if it was inside.
  const remove = () => {
    control.isConnected = false;
    inner.isConnected = false;
    if (doc.activeElement === control || doc.activeElement === inner)
      doc.activeElement = body;
  };
  const flush = () => frames.splice(0).forEach((fn) => fn());
  return { doc, body, control, inner, env, remove, flush };
}

describe("handOffFocus", () => {
  it("moves focus on when the element holding it leaves the page", () => {
    const p = page();
    const move = vi.fn();
    const cleanup = handOffFocus(
      move,
      p.env,
    )(p.control as unknown as HTMLElement);
    p.doc.activeElement = p.inner;
    // React runs the ref's cleanup before it takes the element out of the page.
    cleanup!();
    p.remove();
    p.flush();
    expect(move).toHaveBeenCalledTimes(1);
  });

  it("leaves focus alone when the element didn't hold it", () => {
    const p = page();
    const move = vi.fn();
    const cleanup = handOffFocus(
      move,
      p.env,
    )(p.control as unknown as HTMLElement);
    cleanup!();
    p.remove();
    p.flush();
    expect(move).not.toHaveBeenCalled();
  });

  it("leaves focus alone when something else has taken it by then", () => {
    const p = page();
    const move = vi.fn();
    const other = { isConnected: true };
    const cleanup = handOffFocus(
      move,
      p.env,
    )(p.control as unknown as HTMLElement);
    p.doc.activeElement = p.control;
    cleanup!();
    p.remove();
    p.doc.activeElement = other;
    p.flush();
    expect(move).not.toHaveBeenCalled();
  });

  it("does nothing when the element stays (a re-render that swaps the ref)", () => {
    const p = page();
    const move = vi.fn();
    const cleanup = handOffFocus(
      move,
      p.env,
    )(p.control as unknown as HTMLElement);
    p.doc.activeElement = p.control;
    cleanup!();
    p.flush();
    expect(move).not.toHaveBeenCalled();
  });

  it("returns no cleanup for a null element", () => {
    const p = page();
    expect(handOffFocus(vi.fn(), p.env)(null)).toBeUndefined();
  });
});

describe("focusRegion", () => {
  function region(tabindex: string | null) {
    const attrs = new Map<string, string>();
    if (tabindex !== null) attrs.set("tabindex", tabindex);
    const listeners: Record<string, () => void> = {};
    const el = {
      attrs,
      hasAttribute: (k: string) => attrs.has(k),
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      removeAttribute: (k: string) => attrs.delete(k),
      addEventListener: (type: string, fn: () => void) => {
        listeners[type] = fn;
      },
      focus: vi.fn(),
      blur: () => listeners.blur?.(),
    };
    return el;
  }

  it("makes a plain region focusable for the moment, focuses it without scrolling, and tidies up on blur", () => {
    const main = region(null);
    focusRegion(main as unknown as HTMLElement);
    expect(main.attrs.get("tabindex")).toBe("-1");
    expect(main.focus).toHaveBeenCalledWith({ preventScroll: true });
    main.blur();
    expect(main.attrs.has("tabindex")).toBe(false);
  });

  it("keeps a tabindex the region already had", () => {
    const main = region("0");
    focusRegion(main as unknown as HTMLElement);
    main.blur();
    expect(main.attrs.get("tabindex")).toBe("0");
  });

  it("does nothing without a region", () => {
    expect(() => focusRegion(null)).not.toThrow();
  });
});
