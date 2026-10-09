import { describe, expect, it } from "vitest";
import {
  AVATAR_MAX_BYTES,
  checkAvatarFile,
  isAnimatedImage,
  extensionFor,
  isAvatarPath,
  newAvatarPath,
  squareCrop,
} from "./avatar";

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const FILE = "11111111-1111-4111-8111-111111111111";

describe("isAvatarPath", () => {
  it("accepts <uuid>/<uuid>.webp, .jpg or .gif", () => {
    expect(isAvatarPath(`${OWNER}/${FILE}.webp`)).toBe(true);
    expect(isAvatarPath(`${OWNER}/${FILE}.jpg`)).toBe(true);
    expect(isAvatarPath(`${OWNER}/${FILE}.gif`)).toBe(true);
  });

  it("rejects other extensions, names, and traversal", () => {
    expect(isAvatarPath(`${OWNER}/${FILE}.png`)).toBe(false);
    expect(isAvatarPath(`${OWNER}/photo.gif`)).toBe(false);
    expect(isAvatarPath(`${OWNER}/photo.webp`)).toBe(false);
    expect(isAvatarPath(`../${OWNER}/${FILE}.webp`)).toBe(false);
    expect(isAvatarPath(`${OWNER}/${FILE}.webp/../x`)).toBe(false);
  });

  it("requires the owner's folder when one is given", () => {
    expect(isAvatarPath(`${OWNER}/${FILE}.webp`, OWNER)).toBe(true);
    expect(isAvatarPath(`${FILE}/${FILE}.webp`, OWNER)).toBe(false);
  });
});

describe("checkAvatarFile", () => {
  it("holds a non-executive's GIF to the photo limit, since it's made still", () => {
    expect(
      checkAvatarFile({ type: "image/gif", size: 6 * 1024 * 1024 }, false),
    ).toBeNull();
    expect(checkAvatarFile({ type: "image/gif", size: 6 * 1024 * 1024 })).toBe(
      "Keep the picture under 2 MB.",
    );
  });

  it("takes a big phone photo, since it is shrunk before upload", () => {
    expect(
      checkAvatarFile({ type: "image/jpeg", size: 6 * 1024 * 1024 }),
    ).toBeNull();
    expect(
      checkAvatarFile({ type: "image/jpeg", size: 30 * 1024 * 1024 }),
    ).toBe("Keep the picture under 25 MB.");
  });
  it("accepts a static picture or a GIF up to 2 MB", () => {
    expect(checkAvatarFile({ type: "image/heic", size: 1000 })).toBeNull();
    expect(checkAvatarFile({ type: "image/gif", size: 1000 })).toBeNull();
    expect(
      checkAvatarFile({ type: "image/gif", size: AVATAR_MAX_BYTES }),
    ).toBeNull();
  });

  it("refuses non-images, empty files, and anything over 2 MB", () => {
    expect(checkAvatarFile({ type: "application/pdf", size: 1000 })).toBe(
      "Pick a picture file.",
    );
    expect(checkAvatarFile({ type: "image/png", size: 0 })).toBe(
      "That file is empty.",
    );
    expect(
      checkAvatarFile({ type: "image/gif", size: AVATAR_MAX_BYTES + 1 }),
    ).toBe("Keep the picture under 2 MB.");
  });
});

describe("paths, extensions and crops", () => {
  it("names the file in the owner's folder with its extension", () => {
    expect(newAvatarPath(OWNER, FILE, "webp")).toBe(`${OWNER}/${FILE}.webp`);
    expect(newAvatarPath(OWNER, FILE, "gif")).toBe(`${OWNER}/${FILE}.gif`);
  });

  it("maps mime types to extensions", () => {
    expect(extensionFor("image/webp")).toBe("webp");
    expect(extensionFor("image/gif")).toBe("gif");
    expect(extensionFor("image/jpeg")).toBe("jpg");
  });

  it("crops the largest centred square", () => {
    expect(squareCrop(400, 300)).toEqual({ sx: 50, sy: 0, side: 300 });
    expect(squareCrop(300, 301)).toEqual({ sx: 0, sy: 0, side: 300 });
    expect(squareCrop(200, 200)).toEqual({ sx: 0, sy: 0, side: 200 });
  });
});

describe("isAnimatedImage", () => {
  const bytes = (...parts: (string | number[])[]) =>
    new Uint8Array(
      parts.flatMap((p) =>
        typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p,
      ),
    );
  const chunk = (type: string, len = 0) =>
    bytes([0, 0, 0, len], type, new Array(len + 4).fill(0));

  it("flags any GIF, whatever it is called", () => {
    expect(isAnimatedImage(bytes("GIF89a", [0, 0, 0]))).toBe(true);
    expect(isAnimatedImage(bytes("GIF87a"))).toBe(true);
  });

  it("flags a WebP only when its animation bit is set", () => {
    const webp = (flags: number) =>
      bytes(
        "RIFF",
        [0, 0, 0, 0],
        "WEBP",
        "VP8X",
        [10, 0, 0, 0],
        [flags, 0, 0, 0],
      );
    expect(isAnimatedImage(webp(0x02))).toBe(true);
    expect(isAnimatedImage(webp(0x10))).toBe(false);
    expect(isAnimatedImage(bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8 "))).toBe(
      false,
    );
  });

  it("flags an animated PNG but not a still one", () => {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const png = (...chunks: Uint8Array[]) =>
      new Uint8Array([...sig, ...chunks.flatMap((c) => [...c])]);
    expect(
      isAnimatedImage(
        png(chunk("IHDR", 13), chunk("acTL", 8), chunk("IDAT", 2)),
      ),
    ).toBe(true);
    expect(
      isAnimatedImage(png(chunk("IHDR", 13), chunk("IDAT", 2), chunk("IEND"))),
    ).toBe(false);
  });

  it("flags an AVIF sequence but not a still AVIF", () => {
    expect(isAnimatedImage(bytes([0, 0, 0, 32], "ftyp", "avis"))).toBe(true);
    expect(isAnimatedImage(bytes([0, 0, 0, 32], "ftyp", "avif"))).toBe(false);
  });

  it("passes a JPEG", () => {
    expect(isAnimatedImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      false,
    );
  });
});
