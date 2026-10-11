import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  it("links Terms and Privacy and shows the credit at every width", () => {
    const html = renderToStaticMarkup(createElement(SiteFooter));
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain("Built with");
    expect(html).toContain("by Joseph &amp; Kaden");
    // The desktop sidebar's own credit sits below its scroll on most screens, so the footer never hides this one.
    const credit = html.match(/<p class="([^"]*)"[^>]*>(?:(?!<\/p>).)*Built with/);
    expect(credit).not.toBeNull();
    expect(credit![1]).not.toMatch(/(^|\s)(\w+:)?hidden(\s|$)/);
  });
});
