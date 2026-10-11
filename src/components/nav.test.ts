import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/settings" }));
vi.mock("@/app/(auth)/actions", () => ({ logout: async () => {} }));

const { Sidebar } = await import("./nav");

// Other work adds props (hosa-owner: canSendFeedback); the cast keeps this test about the layout, not the prop list.
const props = {
  isExec: false,
  canSeeStats: false,
  canTeach: false,
  rooms: [{ id: "r1", num: 1, name: "Medical Terminology" }],
  unread: 0,
} as Parameters<typeof Sidebar>[0];

const sidebar = () => renderToStaticMarkup(createElement(Sidebar, props));

// The class lists of every element inside the sidebar, the <aside> itself left out.
const innerClasses = (html: string) =>
  [...html.matchAll(/<(?!aside)[a-z]+\b[^>]*\bclass="([^"]*)"/g)].map((m) =>
    m[1].split(/\s+/),
  );

describe("desktop sidebar", () => {
  // A foot pinned to the bottom of the scrolling column covered the last ~73px of links: at 1440x900 opening More put
  // Settings under it, and at 1280x800 it hid the member's own event room.
  it("pins nothing over its links", () => {
    const pinned = innerClasses(sidebar()).filter((c) =>
      c.some((x) => /^(\w+:)*(sticky|fixed)$/.test(x)),
    );
    expect(pinned).toEqual([]);
  });

  // The page footer shows "Built with (heart) by Joseph & Kaden" at every width, so the sidebar doesn't repeat it.
  it("leaves the credit to the page footer", () => {
    expect(sidebar()).not.toContain("Built with");
  });

  it("keeps the theme switch and every More link", () => {
    const html = sidebar();
    expect(html).toMatch(/aria-label="Switch to dark mode"/);
    expect(html).toContain('href="/settings"');
    expect(html).toContain("Log out");
  });
});
