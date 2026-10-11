import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Loaded } from "@/lib/owner-data";
import type { AuditPage, OwnerOverview, SystemData } from "@/lib/owner-types";

// The /developer gate as the page applies it. Only a stats viewer gets past the first line; a refusal from any
// owner_* function (42501, the viewer row went away mid-request) is the same not-found page; a missing function
// (migrations not applied) is a plain note for the owner. The database checks again either way (0232).

let viewer = false;
let overview: Loaded<OwnerOverview> = { ok: false, reason: "missing" };
let system: Loaded<SystemData> & { latencyMs: number | null } = {
  ok: false,
  reason: "missing",
  latencyMs: null,
};
let members: unknown[] | null = null;
let audit: Loaded<AuditPage> = { ok: false, reason: "missing" };
let role: string | null = "executive";
const loaders = {
  overview: vi.fn(),
  system: vi.fn(),
  members: vi.fn(),
  audit: vi.fn(),
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  getProfile: async () => (role ? { role } : null),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/developer",
  useRouter: () => ({ refresh: () => {} }),
}));
vi.mock("@/lib/dev-stats-data", () => ({
  canSeeDevStats: async () => viewer,
  getDevStats: async () => {
    loaders.members();
    return members;
  },
}));
vi.mock("@/lib/owner-data", () => ({
  loadOverview: async () => {
    loaders.overview();
    return overview;
  },
  loadSystem: async () => {
    loaders.system();
    return system;
  },
  loadGrowth: async () => ({ ok: false, reason: "missing" }),
  loadEngagement: async () => ({ ok: false, reason: "missing" }),
  loadContent: async () => ({ ok: false, reason: "missing" }),
  loadFeedback: async () => ({ ok: false, reason: "missing" }),
  loadAudit: async (...args: unknown[]) => {
    loaders.audit(...args);
    return audit;
  },
}));
vi.mock("./actions", () => ({ triageFeedback: async () => ({}) }));

const { default: DeveloperPage } = await import("./page");

const open = async (search: Record<string, string> = {}) =>
  renderToStaticMarkup(
    await DeveloperPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(search),
    } as never),
  );
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const OVERVIEW: OwnerOverview = {
  today: "2026-10-11",
  members: 13,
  new_7d: 6,
  new_30d: 13,
  dau: null,
  wau: 9,
  wau_prev: 0,
  mau: 13,
  returning_7d: null,
  first_week_7d: null,
};

beforeEach(() => {
  viewer = false;
  overview = { ok: false, reason: "missing" };
  system = { ok: false, reason: "missing", latencyMs: null };
  members = null;
  audit = { ok: false, reason: "missing" };
  role = "executive";
  for (const l of Object.values(loaders)) l.mockClear();
});

describe("/developer", () => {
  it("is not found for anyone who isn't a stats viewer, before any owner read", async () => {
    await expect(open()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(open({ tab: "system" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loaders.overview).not.toHaveBeenCalled();
    expect(loaders.system).not.toHaveBeenCalled();
  });

  it("renders the console for a stats viewer", async () => {
    viewer = true;
    overview = { ok: true, data: OVERVIEW };
    const out = text(await open());
    expect(out).toContain("Developer");
    expect(out).toContain("Members 13");
    expect(out).toContain("Active today Under 5");
  });

  it("turns a refusal from the database into not found, like any non-owner", async () => {
    viewer = true;
    overview = { ok: false, reason: "denied" };
    await expect(open()).rejects.toThrow("NEXT_NOT_FOUND");
    system = { ok: false, reason: "denied", latencyMs: null };
    await expect(open({ tab: "system" })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("says the migrations are missing instead of breaking", async () => {
    viewer = true;
    const out = text(await open());
    expect(out).toContain("needs migrations 0230 to 0232");
  });

  it("calls a database error on System an error, not an outage", async () => {
    viewer = true;
    system = { ok: false, reason: "failed", latencyMs: null };
    const out = text(await open({ tab: "system" }));
    expect(out).toContain("Database Error");
    expect(out).not.toContain("No answer");
  });

  it("is not found when the member table refuses", async () => {
    viewer = true;
    await expect(open({ tab: "members" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loaders.members).toHaveBeenCalled();
  });

  // The audit log is admin_log, which only executives may read (0052). A stats viewer with another role keeps the
  // console but gets a plain note on that tab, and the page never asks for the log (owner_audit refuses them too).
  it("keeps the audit log from a stats viewer who isn't an executive, without reading it", async () => {
    viewer = true;
    for (const r of ["trainee", "trainer", "jobless"]) {
      role = r;
      const out = text(await open({ tab: "audit" }));
      expect(out).toContain("Only executives can read the audit log");
      expect(out).toContain("Developer");
    }
    expect(loaders.audit).not.toHaveBeenCalled();
  });

  it("reads the audit log for an executive viewer", async () => {
    viewer = true;
    audit = {
      ok: true,
      data: {
        rows: [
          {
            id: 7,
            created_at: "2026-10-11T12:00:00Z",
            actor_name: "Sample Exec",
            action: "warned",
            target_name: "Sample Member",
            detail: "Sample warning",
          },
        ],
        hasMore: false,
      },
    };
    const out = text(await open({ tab: "audit", q: "warned", p: "2" }));
    expect(loaders.audit).toHaveBeenCalledWith("warned", 2);
    expect(out).toContain("Sample Exec warned Sample Member");
    expect(out).not.toContain("Only executives");
  });
});
