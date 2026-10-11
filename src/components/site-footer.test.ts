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

  // In the app, the desktop sidebar's foot (sticky, always in view) holds the credit. Showing it in the footer too
  // put the same line twice on one screen.
  it("leaves the credit to the sidebar from lg up when it's there, and keeps it on phones", () => {
    const html = render({ creditInSidebar: true });
    expect(html).toContain("by Joseph &amp; Kaden");
    expect(hiders(creditClasses(html))).toEqual(["lg:hidden"]);
    // Terms and Privacy stay at every width.
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    const links = linkClasses(html);
    expect(links).toHaveLength(2);
    for (const classes of links) expect(hiders(classes)).toEqual([]);
  });
});
