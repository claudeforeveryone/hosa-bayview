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

// Something drawImage can take, with its size and a way to let it go. createImageBitmap first; some photo
// formats (HEIC on some browsers) only decode through an <img>, so that is the fallback.
type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decode(file: File): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }
}

export async function prepareAvatar(
  file: File,
  animated = true,
): Promise<PreparedAvatar> {
  if (file.type === "image/gif" && animated) {
    return { blob: file, mime: "image/gif", ext: "gif" };
  }
  const image = await decode(file);
  try {
    if (!image.width || !image.height) throw new Error("The picture has no size");
    const { sx, sy, side } = squareCrop(image.width, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image.source, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    // Browsers that can't encode WebP hand back PNG; ask for JPEG instead.
    const webp = await encode(canvas, "image/webp", 0.85);
    if (webp && webp.type === "image/webp")
      return { blob: webp, mime: "image/webp", ext: "webp" };
    const jpeg = await encode(canvas, "image/jpeg", 0.88);
    if (!jpeg) throw new Error("Could not encode the picture");
    return { blob: jpeg, mime: "image/jpeg", ext: "jpg" };
  } finally {
    image.release();
  }
}
