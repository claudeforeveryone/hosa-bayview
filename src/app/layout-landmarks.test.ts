import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AuthLayout from "./(auth)/layout";
import LegalLayout from "./(legal)/layout";

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

type Open = { tag: string; attrs: string };

// Walks the markup with a stack of open elements. Calls onTag for every opening tag and onText for every run of text,
// each with the elements around it, outermost first.
function walk(
  html: string,
  on: {
    tag?: (tag: string, around: Open[]) => void;
    text?: (text: string, around: Open[]) => void;
  },
) {
  const stack: Open[] = [];
  let last = 0;
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    const text = html.slice(last, m.index).trim();
    if (text) on.text?.(text, stack);
    last = m.index + m[0].length;
    const [, closing, raw, attrs, selfClosing] = m;
    const tag = raw.toLowerCase();
    if (closing) {
      const at = stack.map((o) => o.tag).lastIndexOf(tag);
      if (at !== -1) stack.length = at;
      continue;
    }
    on.tag?.(tag, stack);
    if (!VOID.has(tag) && !selfClosing) stack.push({ tag, attrs });
  }
}

// HTML-AAM: a <header> or <footer> is the page's banner or contentinfo only when it isn't inside one of these.
const SCOPING = ["article", "aside", "main", "nav", "section"];
const scoped = (around: Open[]) => around.some((o) => SCOPING.includes(o.tag));

function isLandmark(o: Open, around: Open[]) {
  if (["main", "nav", "aside"].includes(o.tag)) return true;
  if (o.tag === "header" || o.tag === "footer")
    return !scoped(around.slice(0, around.indexOf(o)));
  return false;
}

// Text that no landmark holds: what axe's "region" rule reports. Skip links ("#main") are allowed, as axe allows them.
function textOutsideLandmarks(html: string): string[] {
  const loose: string[] = [];
  walk(html, {
    text(text, around) {
      if (around.some((o) => o.tag === "script" || o.tag === "style")) return;
      if (around.some((o) => o.tag === "a" && /href="#/.test(o.attrs))) return;
      if (!around.some((o) => isLandmark(o, around))) loose.push(text);
    },
  });
  return loose;
}

type Layout = (props: {
  children: ReactNode;
  params: Promise<object>;
}) => ReactNode;
// Both layouts are plain (no hooks of their own), so calling one gives the tree Next would render.
const render = (layout: Layout) =>
  renderToStaticMarkup(
    layout({
      children: createElement("p", null, "page"),
      params: Promise.resolve({}),
    }),
  );

const layouts = [
  ["sign-in pages", AuthLayout as unknown as Layout],
  ["terms and privacy", LegalLayout as unknown as Layout],
] as const;

describe("landmarks", () => {
  it.each(layouts)("%s: the footer is the page's contentinfo", (_, layout) => {
    const html = render(layout);
    const footers: Open[][] = [];
    walk(html, {
      tag: (tag, around) => tag === "footer" && footers.push([...around]),
    });
    expect(footers).toHaveLength(1);
    expect(footers[0].filter((o) => SCOPING.includes(o.tag))).toEqual([]);
  });

  // The credit and the hero's screen-reader line were outside every landmark on the sign-in pages.
  it.each(layouts)("%s: every line sits in a landmark", (_, layout) => {
    const html = render(layout);
    expect(html).toContain("Built with");
    expect(textOutsideLandmarks(html)).toEqual([]);
  });
});

describe("terms and privacy header", () => {
  it("has a plain way back to the app", () => {
    const header = render(LegalLayout as unknown as Layout).match(
      /<header[\s\S]*?<\/header>/,
    );
    expect(header).not.toBeNull();
    const back = header![0].match(/<a [^>]*href="\/"[^>]*>([\s\S]*?)<\/a>/g);
    expect(
      back?.some((a) => a.replace(/<[^>]+>/g, "") === "Back to the app"),
    ).toBe(true);
  });
});
