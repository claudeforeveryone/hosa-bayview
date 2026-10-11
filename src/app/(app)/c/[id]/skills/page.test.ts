import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ROOM = "22222222-2222-4222-8222-222222222222";
let canManage = false;
let category: string | null = "practical";
let skills: unknown[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/classrooms", () => ({
  getClassroom: async () => ({ id: ROOM, can_manage: canManage }),
  getRoomInfo: async () => ({ kind: "class", category }),
}));
vi.mock("./queries", () => ({ getSkills: async () => skills }));
vi.mock("./actions", () => ({
  saveSkill: async () => ({}),
  deleteSkill: async () => ({}),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));

const { default: SkillsTab } = await import("./page");

const render = async () =>
  renderToStaticMarkup(
    await SkillsTab({ params: Promise.resolve({ id: ROOM }) } as never),
  );
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

beforeEach(() => {
  canManage = false;
  category = "practical";
  skills = [];
});

describe("Skills tab", () => {
  it("shows members a calm empty state and no edit controls", async () => {
    const out = text(await render());
    expect(out).toBe("No skills yet");
  });

  it("shows managers the empty state with the Add skill editor", async () => {
    canManage = true;
    const out = await render();
    expect(text(out)).toContain("No skills yet");
    expect(text(out)).toContain("Add skill");
    expect(out).toContain('name="steps"');
  });

  it("gives members the checklist but never Edit or Delete", async () => {
    skills = [
      {
        id: "s1",
        position: 0,
        name: "Hand hygiene",
        round: null,
        steps: [{ text: "Wash" }],
        note: null,
      },
    ];
    const out = text(await render());
    expect(out).toContain("Hand hygiene");
    expect(out).not.toMatch(/Edit|Delete|Add skill/);
  });

  it("gives managers Edit and Delete on each skill", async () => {
    canManage = true;
    skills = [
      {
        id: "s1",
        position: 0,
        name: "Hand hygiene",
        round: null,
        steps: [{ text: "Wash" }],
        note: null,
      },
    ];
    const out = text(await render());
    expect(out).toContain("Edit");
    expect(out).toContain("Delete");
  });

  it("sends non-practical rooms back to the hub", async () => {
    category = "mc";
    await expect(render()).rejects.toMatchObject({ to: `/c/${ROOM}` });
  });
});
