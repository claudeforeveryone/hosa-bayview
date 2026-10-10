import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeGate } from "@/lib/route-gate";
import { MATERIAL_LINK_SECONDS } from "@/lib/link-lifetimes";
import { materialHref, openableUrl } from "@/lib/materials";

type Row = {
  url: string | null;
  path: string | null;
  file_name: string | null;
} | null;

const state: {
  sub: string | null;
  row: Row;
  readError: unknown;
  signed: string | null;
  signError: unknown;
} = {
  sub: "user-1",
  row: null,
  readError: null,
  signed: null,
  signError: null,
};
const eq = vi.fn();
const createSignedUrl = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: state.sub ? { claims: { sub: state.sub } } : null,
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => {
          eq(table, col, val);
          return {
            maybeSingle: async () => ({
              data: state.row,
              error: state.readError,
            }),
          };
        },
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (...args: unknown[]) => {
          createSignedUrl(bucket, ...args);
          return {
            data: state.signed ? { signedUrl: state.signed } : null,
            error: state.signError,
          };
        },
      }),
    },
  }),
}));

import { GET } from "./route";

const ID = "00000000-0000-4000-8000-000000000123";
const open = (id = ID) =>
  GET(new NextRequest(`http://localhost/files/${id}`), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  Object.assign(state, {
    sub: "user-1",
    row: null,
    readError: null,
    signed: null,
    signError: null,
  });
  eq.mockClear();
  createSignedUrl.mockClear();
});

describe("GET /files/[id]", () => {
  it("a guest never reaches it: the proxy sends them to login with the way back", () => {
    expect(routeGate(`/files/${ID}`, "", false)).toEqual({
      redirect: `/login?next=${encodeURIComponent(`/files/${ID}`)}`,
    });
  });

  it("a session that ended in between redirects to login, without reading the row", async () => {
    state.sub = null;
    const res = await open();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `http://localhost/login?next=${encodeURIComponent(`/files/${ID}`)}`,
    );
    expect(eq).not.toHaveBeenCalled();
  });

  it("someone RLS hides the row from (not a viewer of that event) gets 404", async () => {
    state.row = null;
    const res = await open();
    expect(res.status).toBe(404);
    expect(eq).toHaveBeenCalledWith("materials", "id", ID);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("a malformed id is 404 without a lookup", async () => {
    const res = await open("not-a-uuid");
    expect(res.status).toBe(404);
    expect(eq).not.toHaveBeenCalled();
  });

  it("a link material redirects to its URL", async () => {
    state.row = {
      url: "https://www.hosa.org/guidelines.pdf",
      path: null,
      file_name: null,
    };
    const res = await open();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://www.hosa.org/guidelines.pdf",
    );
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("a file redirects to a fresh 60 s signed URL that downloads under its name", async () => {
    state.row = {
      url: null,
      path: "room/abc-notes.pdf",
      file_name: "Notes.pdf",
    };
    state.signed =
      "https://x.supabase.co/storage/v1/object/sign/materials/room/abc-notes.pdf?token=t&download=Notes.pdf";
    const res = await open();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(state.signed);
    expect(createSignedUrl).toHaveBeenCalledWith(
      "materials",
      "room/abc-notes.pdf",
      60,
      { download: "Notes.pdf" },
    );
    expect(MATERIAL_LINK_SECONDS).toBe(60);
  });

  it("a signing failure is a 502, not a broken redirect", async () => {
    state.row = {
      url: null,
      path: "room/abc-notes.pdf",
      file_name: "Notes.pdf",
    };
    state.signError = { message: "Object not found" };
    expect((await open()).status).toBe(502);
  });

  it("a javascript: or data: link is refused (404), never redirected", async () => {
    for (const url of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,hi",
      "ftp://x.org/a",
    ]) {
      state.row = { url, path: null, file_name: null };
      const res = await open();
      expect(res.status, url).toBe(404);
      expect(res.headers.get("location"), url).toBeNull();
    }
  });

  it("a placeholder (no file, no link) is 404", async () => {
    state.row = { url: null, path: null, file_name: null };
    expect((await open()).status).toBe(404);
  });
});

describe("material links in the UI", () => {
  it("files and links open through /files/<id>; placeholders have no link", () => {
    expect(materialHref({ id: ID, path: "room/a.pdf", url: null })).toBe(
      `/files/${ID}`,
    );
    expect(materialHref({ id: ID, path: null, url: "https://a.org" })).toBe(
      `/files/${ID}`,
    );
    expect(materialHref({ id: ID, path: null, url: null })).toBeNull();
  });

  it("openableUrl keeps only absolute http(s) URLs", () => {
    expect(openableUrl("https://a.org/x?y=1")).toBe("https://a.org/x?y=1");
    expect(openableUrl("http://a.org")).toBe("http://a.org/");
    for (const bad of [
      null,
      "",
      "a.org",
      "javascript:alert(1)",
      "mailto:a@b.c",
      "data:,x",
    ]) {
      expect(openableUrl(bad), String(bad)).toBeNull();
    }
  });
});
