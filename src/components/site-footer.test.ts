import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./site-footer";

const render = (props: Parameters<typeof SiteFooter>[0] = {}) =>
  renderToStaticMarkup(createElement(SiteFooter, props));

// The class list of the credit's <p>, and of each legal link.
const creditClasses = (html: string) => {
  const credit = html.match(
    /<p class="([^"]*)"[^>]*>(?:(?!<\/p>).)*Built with/,
  );
  expect(credit).not.toBeNull();
  return credit![1].split(/\s+/);
};
const linkClasses = (html: string) =>
  [...html.matchAll(/<a [^>]*class="([^"]*)"/g)].map((m) => m[1].split(/\s+/));
const hiders = (classes: string[]) =>
  classes.filter((c) => /^(\w+:)*hidden$/.test(c));

describe("SiteFooter", () => {
  it("links Terms and Privacy and shows the credit at every width", () => {
    const html = render();
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain("Built with");
    expect(html).toContain("by Joseph &amp; Kaden");
    expect(hiders(creditClasses(html))).toEqual([]);
  });

  it("keeps Terms and Privacy visible at every width", () => {
    const links = linkClasses(render());
    expect(links).toHaveLength(2);
    for (const classes of links) expect(hiders(classes)).toEqual([]);
  });
});
