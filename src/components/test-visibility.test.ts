import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/c/[id]/tests/actions", () => ({
  schedulePublish: vi.fn(),
  setPublished: vi.fn(),
}));

const { TestVisibility, VisibilityToggle } = await import("./test-visibility");

const TEST = "44444444-4444-4444-8444-444444444444";
const AT = "2026-10-27T13:00:00.000Z";
const checked = (markup: string) =>
  /<input[^>]*value="(\w+)"[^>]*checked=""/.exec(markup)?.[1] ??
  /<input[^>]*checked=""[^>]*value="(\w+)"/.exec(markup)?.[1];

describe("TestVisibility", () => {
  it("starts on what's saved, with the hint about hidden tests", () => {
    const hidden = renderToStaticMarkup(
      createElement(TestVisibility, {
        testId: TEST,
        published: false,
        publishAt: null,
      }),
    );
    expect(checked(hidden)).toBe("hidden");
    expect(hidden).toContain("Who can see it");
    expect(hidden).toContain(
      "practise it, or see its questions in Career or battles",
    );
    expect(hidden).not.toContain('type="datetime-local"');

    const posted = renderToStaticMarkup(
      createElement(TestVisibility, {
        testId: TEST,
        published: true,
        publishAt: null,
      }),
    );
    expect(checked(posted)).toBe("posted");
    expect(posted).not.toContain('type="datetime-local"');
  });

  it("opens a saved schedule with its Toronto time filled in and when it posts", () => {
    const out = renderToStaticMarkup(
      createElement(TestVisibility, {
        testId: TEST,
        published: false,
        publishAt: AT,
      }),
    );
    expect(checked(out)).toBe("scheduled");
    expect(out).toContain('type="datetime-local"');
    expect(out).toContain('value="2026-10-27T09:00"');
    expect(out).toMatch(
      /Posts Tue, Oct\.? 27, 9:00 a\.m\. and members get a notification then\./,
    );
    expect(out).toContain(">Save<");
  });
});

describe("VisibilityToggle", () => {
  it("names the tap's action and shows where the test stands", () => {
    const posted = renderToStaticMarkup(
      createElement(VisibilityToggle, {
        testId: TEST,
        title: "Vet FLC",
        published: true,
      }),
    );
    expect(posted).toContain('aria-label="Hide Vet FLC from members"');
    expect(posted).toContain("lucide-eye");
    expect(posted).not.toContain("lucide-eye-off");

    const hidden = renderToStaticMarkup(
      createElement(VisibilityToggle, {
        testId: TEST,
        title: "Vet FLC",
        published: false,
      }),
    );
    expect(hidden).toContain('aria-label="Post Vet FLC now"');
    expect(hidden).toContain("lucide-eye-off");
  });

  it("warns that posting a scheduled test now cancels its schedule", () => {
    const out = renderToStaticMarkup(
      createElement(VisibilityToggle, {
        testId: TEST,
        title: "Vet FLC",
        published: false,
        scheduled: true,
      }),
    );
    expect(out).toContain(
      'aria-label="Post Vet FLC now (cancels its schedule)"',
    );
  });

  it("keeps an empty polite status mounted, so a result is announced", () => {
    const out = renderToStaticMarkup(
      createElement(VisibilityToggle, {
        testId: TEST,
        title: "Vet FLC",
        published: true,
      }),
    );
    expect(out).toContain('<span role="status" class="sr-only"></span>');
  });
});
