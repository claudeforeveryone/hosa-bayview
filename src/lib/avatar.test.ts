import { describe, expect, it } from "vitest";
import {
  AVATAR_MAX_BYTES,
  checkAvatarFile,
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
