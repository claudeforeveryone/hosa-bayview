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

// The open elements around the first <footer>, outermost first.
function ancestorsOfFooter(html: string): string[] {
  const stack: string[] = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g)) {
    const [, closing, raw, selfClosing] = m;
    const tag = raw.toLowerCase();
    if (closing) {
      const at = stack.lastIndexOf(tag);
      if (at !== -1) stack.length = at;
    } else if (tag === "footer") {
      return stack;
    } else if (!VOID.has(tag) && !selfClosing) {
      stack.push(tag);
    }
  }
  throw new Error("no <footer> in the page");
}

// HTML-AAM: a <footer> is the page's contentinfo landmark only when it isn't inside one of these. Otherwise screen
// readers don't list it and axe reports its text (the credit) as outside every region.
const SCOPING = ["article", "aside", "main", "nav", "section"];

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

describe("page footers are the contentinfo landmark", () => {
  it.each([
    ["sign-in pages", AuthLayout as unknown as Layout],
    ["terms and privacy", LegalLayout as unknown as Layout],
  ])("%s", (_, layout) => {
    const html = render(layout);
    expect(html.match(/<footer[\s>]/g)).toHaveLength(1);
    const around = ancestorsOfFooter(html);
    expect(around.filter((tag) => SCOPING.includes(tag))).toEqual([]);
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
