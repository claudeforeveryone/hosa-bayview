import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INDEPENDENCE_NOTE } from "@/lib/legal";
import { IndependenceNote, LegalDoc, LegalSection } from "./legal-doc";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'");

const section = (id: string, title: string) =>
  createElement(LegalSection, { id, title }, "text");

function doc() {
  return renderToStaticMarkup(
    createElement(
      LegalDoc,
      { title: "Privacy policy", summary: ["One line."] },
      section("collect", "What we collect"),
      section("see", "Who can see it"),
      section("contact", "Contact"),
    ),
  );
}

describe("LegalDoc contents", () => {
  it("links to every section, in page order, by its title", () => {
    const nav = doc().match(/<nav[^>]*>([\s\S]*?)<\/nav>/);
    expect(nav, "contents nav").not.toBeNull();
    const links = [
      ...nav![1].matchAll(/<a[^>]*href="#([^"]+)"[^>]*>([^<]+)<\/a>/g),
    ].map((m) => [m[1], m[2]]);
    expect(links).toEqual([
      ["collect", "What we collect"],
      ["see", "Who can see it"],
      ["contact", "Contact"],
    ]);
  });

  it("names the contents for screen readers", () => {
    const html = doc();
    expect(html).toMatch(/<nav aria-labelledby="contents-h"/);
    expect(html).toMatch(/id="contents-h"[^>]*>On this page</);
  });

  it("puts the anchor on the heading the link jumps to, with room above it", () => {
    const html = doc();
    expect(html).toMatch(/<h2 id="see" class="[^"]*scroll-mt-/);
  });
});

describe("IndependenceNote", () => {
  it("says the same as the shared note", () => {
    expect(
      text(
        renderToStaticMarkup(
          createElement(Fragment, null, createElement(IndependenceNote)),
        ),
      ),
    ).toBe(INDEPENDENCE_NOTE);
  });

  it("keeps HOSA-Future from breaking at its hyphen", () => {
    expect(renderToStaticMarkup(createElement(IndependenceNote))).toMatch(
      /<span class="whitespace-nowrap">HOSA-Future<\/span>/,
    );
  });
});
