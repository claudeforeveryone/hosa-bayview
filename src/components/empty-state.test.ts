import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";

const render = (props: Parameters<typeof EmptyState>[0]) =>
  renderToStaticMarkup(createElement(EmptyState, props));

describe("EmptyState", () => {
  it("draws the molecule mark, hidden from screen readers, on the screen's first empty state", () => {
    const html = render({ title: "No files or links yet" });
    expect(html).toContain("<svg");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  // Two empty states one after the other (Resources: files, then the breakdown) would repeat the same mark.
  it("leaves the mark off a later section's empty state, keeping the title and line", () => {
    const html = render({
      title: "No breakdown yet",
      children: "Your trainer adds it.",
      mark: false,
    });
    expect(html).not.toContain("<svg");
    expect(html).toContain("No breakdown yet");
    expect(html).toContain("Your trainer adds it.");
  });
});
