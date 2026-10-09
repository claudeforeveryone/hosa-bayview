// Browser only: turn a picked photo into a 256px square, centre-cropped, WebP (JPEG where WebP can't be encoded).
// GIFs skip the canvas: a canvas keeps one frame, so the file goes up exactly as picked and stays animated.
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

export async function prepareAvatar(file: File): Promise<PreparedAvatar> {
  if (file.type === "image/gif") {
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
