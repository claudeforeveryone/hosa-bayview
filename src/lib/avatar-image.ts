// Browser only: turn a picked photo into a 256px square, centre-cropped, WebP (JPEG where WebP can't be encoded).
// An executive's GIF skips the canvas so it stays animated; anyone else's goes through it and keeps one frame.
import { AVATAR_SIZE, squareCrop, type AvatarExt } from "@/lib/avatar";

export type PreparedAvatar = {
  blob: Blob;
  mime: "image/webp" | "image/jpeg" | "image/gif";
  ext: AvatarExt;
};

function encode(
  canvas: HTMLCanvasElement,
  mime: "image/webp" | "image/jpeg",
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), mime, quality),
  );
}

export async function prepareAvatar(
  file: File,
  animated = true,
): Promise<PreparedAvatar> {
  if (file.type === "image/gif" && animated) {
    return { blob: file, mime: "image/gif", ext: "gif" };
  }
  const bitmap = await createImageBitmap(file);
  try {
    const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    // Browsers that can't encode WebP hand back PNG; ask for JPEG instead.
    const webp = await encode(canvas, "image/webp", 0.85);
    if (webp && webp.type === "image/webp")
      return { blob: webp, mime: "image/webp", ext: "webp" };
    const jpeg = await encode(canvas, "image/jpeg", 0.88);
    if (!jpeg) throw new Error("Could not encode the picture");
    return { blob: jpeg, mime: "image/jpeg", ext: "jpg" };
  } finally {
    bitmap.close();
  }
}
