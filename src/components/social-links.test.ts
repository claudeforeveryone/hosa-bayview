import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SocialLinks } from "./social-links";

const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("SocialLinks", () => {
  it("is three named icons by default (the Members page header)", () => {
    const out = renderToStaticMarkup(createElement(SocialLinks));
    expect(out).toContain('href="https://www.instagram.com/hosabayview/"');
    expect(out).toContain('href="https://discord.gg/WRVY4r3tC"');
    expect(out).toContain('aria-label="Instagram"');
    expect(out).toContain('aria-label="Discord"');
    expect(out).toContain('aria-label="Copy email hosabayview@gmail.com"');
    expect(out).toContain("text-ink-2");
    // No visible words: the names live in aria-label and title.
    expect(text(out)).toBe("");
  });

  it("labelled on the navy band shows each name and the address, in the band's colours", () => {
    const out = renderToStaticMarkup(
      createElement(SocialLinks, { tone: "field", labelled: true }),
    );
    expect(text(out)).toBe("Instagram Discord hosabayview@gmail.com");
    expect(out).toContain("text-on-field-2");
    expect(out).not.toContain("text-ink-2");
    // Visible text is the name, so no duplicate aria-label; the copy button keeps its fuller name.
    expect(out).not.toContain('aria-label="Instagram"');
    expect(out).toContain('aria-label="Copy email hosabayview@gmail.com"');
    // Both links still open in a new tab without handing over window.opener.
    expect(out.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
  });
});
