import { describe, expect, it } from "vitest";
import {
  MAX_BYTES,
  uploadType,
  buildStoragePath,
  cleanFileName,
  fileKind,
  formatBytes,
  formatDay,
  isStoragePath,
  materialMeta,
  storageFolder,
  tooBigMessage,
  titleFromFile,
  type MaterialRow,
} from "./materials";

const ID = "3f2c1b0a-9d8e-4f7a-8b6c-5d4e3f2a1b0c";
const ROOM = "7a1e2d3c-4b5a-4968-8777-6655443322aa";

describe("storageFolder", () => {
  it("uses the chapter folder for null and the lowercased id otherwise", () => {
    expect(storageFolder(null)).toBe("chapter");
    expect(storageFolder(ROOM.toUpperCase())).toBe(ROOM);
  });
});

describe("buildStoragePath", () => {
  it("builds folder/uuid-slug.ext with the given id", () => {
    expect(buildStoragePath("chapter", "Lab Notes (final).PDF", ID)).toBe(
      `chapter/${ID}-lab-notes-final.pdf`,
    );
    expect(buildStoragePath(ROOM, "Guide.docx", ID)).toBe(
      `${ROOM}/${ID}-guide.docx`,
    );
  });

  it("makes a fresh uuid when none is given", () => {
    const a = buildStoragePath("chapter", "same.pdf");
    const b = buildStoragePath("chapter", "same.pdf");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^chapter\/[0-9a-f-]{36}-same\.pdf$/);
  });

  it("keeps the name ascii and falls back to 'file'", () => {
    expect(buildStoragePath("chapter", "Résumé café.pdf", ID)).toBe(
      `chapter/${ID}-resume-cafe.pdf`,
    );
    expect(buildStoragePath("chapter", "???.png", ID)).toBe(
      `chapter/${ID}-file.png`,
    );
    expect(buildStoragePath("chapter", "noext", ID)).toBe(
      `chapter/${ID}-noext`,
    );
  });

  it("caps the name part at 100 characters and keeps the extension", () => {
    const path = buildStoragePath("chapter", `${"a".repeat(300)}.pdf`, ID);
    const name = path.slice("chapter/".length);
    expect(name.length).toBeLessThanOrEqual(100);
    expect(name.endsWith(".pdf")).toBe(true);
  });

  it("drops a long odd extension", () => {
    const path = buildStoragePath("chapter", "x.a-very-long-extension", ID);
    expect(path).toBe(`chapter/${ID}-x.averylonge`);
  });

  it("produces paths isStoragePath accepts", () => {
    const path = buildStoragePath(ROOM, `${"b".repeat(200)}.mp4`, ID);
    expect(isStoragePath(path, ROOM)).toBe(true);
  });
});

describe("isStoragePath", () => {
  it("accepts paths in the right folder only", () => {
    expect(isStoragePath(`chapter/${ID}-notes.pdf`, "chapter")).toBe(true);
    expect(isStoragePath(`${ROOM}/${ID}-notes.pdf`, ROOM)).toBe(true);
    expect(isStoragePath(`${ROOM}/${ID}-notes.pdf`, "chapter")).toBe(false);
    expect(isStoragePath(`chapter/${ID}-notes.pdf`, ROOM)).toBe(false);
  });

  it("rejects traversal, nested folders and free-text names", () => {
    expect(isStoragePath(`chapter/../${ID}-x.pdf`, "chapter")).toBe(false);
    expect(isStoragePath(`chapter/sub/${ID}-x.pdf`, "chapter")).toBe(false);
    expect(isStoragePath("chapter/notes.pdf", "chapter")).toBe(false);
    expect(isStoragePath(`chapter/${ID}-Notes.pdf`, "chapter")).toBe(false);
    expect(isStoragePath(`chapter/${ID}-x.pdf?x=1`, "chapter")).toBe(false);
  });

  it("rejects names over 100 characters", () => {
    expect(isStoragePath(`chapter/${ID}-${"a".repeat(100)}`, "chapter")).toBe(
      false,
    );
  });
});

describe("cleanFileName", () => {
  it("strips control characters, trims and caps length", () => {
    expect(cleanFileName("  a\u0000b\n.pdf ")).toBe("ab.pdf");
    expect(cleanFileName("   ")).toBe("file");
    expect(cleanFileName("x".repeat(500))).toHaveLength(200);
  });
});

describe("formatBytes", () => {
  it("shows bytes, then KB, MB and GB with one decimal under 10", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(2516582)).toBe("2.4 MB");
    expect(formatBytes(MAX_BYTES)).toBe("25 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3 GB");
  });

  it("moves to the next unit when rounding would show 1024", () => {
    expect(formatBytes(1024 * 1023.9)).toBe("1 MB");
  });

  it("treats bad numbers as zero", () => {
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});

describe("tooBigMessage", () => {
  it("allows up to 25 MB and refuses empty or larger files", () => {
    expect(tooBigMessage(1)).toBeNull();
    expect(tooBigMessage(MAX_BYTES)).toBeNull();
    expect(tooBigMessage(MAX_BYTES + 1)).toBe(
      "That file is over 25 MB. Pick a smaller one.",
    );
    expect(tooBigMessage(0)).toBe("That file is empty.");
  });
});

describe("titleFromFile", () => {
  it("drops the extension", () => {
    expect(titleFromFile("Week 3 review.pdf")).toBe("Week 3 review");
    expect(titleFromFile("archive.tar.gz")).toBe("archive.tar");
    expect(titleFromFile(".hidden")).toBe(".hidden");
  });
});

describe("fileKind", () => {
  it("reads the extension, then the mime type", () => {
    expect(fileKind("notes.PDF", null)).toBe("PDF");
    expect(fileKind("scan.jpeg", "image/jpeg")).toBe("Image");
    expect(fileKind("clip", "video/mp4")).toBe("Video");
    expect(fileKind("data.parquet", null)).toBe("PARQUE");
    expect(fileKind(null, null)).toBe("File");
    expect(fileKind("constructor", null)).toBe("File");
  });
});

describe("formatDay", () => {
  it("formats on the Toronto clock, not UTC", () => {
    expect(formatDay("2026-10-09T15:00:00Z")).toBe("Oct 9");
    // 02:00 UTC on the 10th is still the 9th in Toronto (EDT, UTC-4).
    expect(formatDay("2026-10-10T02:00:00Z")).toBe("Oct 9");
  });
});

describe("materialMeta", () => {
  const base: MaterialRow = {
    id: ID,
    classroom_id: null,
    title: "Notes",
    note: "",
    url: null,
    path: `chapter/${ID}-notes.pdf`,
    file_name: "notes.pdf",
    size_bytes: 2516582,
    mime: "application/pdf",
    created_at: "2026-10-09T15:00:00Z",
  };

  it("joins kind, size and day for files", () => {
    expect(materialMeta(base)).toBe("PDF · 2.4 MB · Oct 9");
  });

  it("shows the host for links", () => {
    expect(
      materialMeta({
        ...base,
        path: null,
        file_name: null,
        size_bytes: null,
        url: "https://www.example.com/a",
      }),
    ).toBe("example.com");
  });
});

describe("uploadType", () => {
  it("keeps safe types and flattens the rest", () => {
    expect(uploadType("application/pdf")).toBe("application/pdf");
    expect(uploadType("IMAGE/PNG")).toBe("image/png");
    expect(uploadType("text/html")).toBe("application/octet-stream");
    expect(uploadType("image/svg+xml")).toBe("application/octet-stream");
    expect(uploadType("")).toBe("application/octet-stream");
  });
});
