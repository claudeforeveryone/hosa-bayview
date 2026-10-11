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

// iPhone photos (HEIC/HEIF) decode only in Safari, and Windows often gives them no type at all.
function isHeic(file: File): boolean {
  return /^image\/hei[cf]/.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

// Something the canvas can draw, with its size and how to free it.
type Source = {
  image: CanvasImageSource;
  width: number;
  height: number;
  done: () => void;
};

async function viaBitmap(blob: Blob): Promise<Source> {
  const bitmap = await createImageBitmap(blob);
  return {
    image: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    done: () => bitmap.close(),
  };
}

function viaImg(blob: Blob): Promise<Source> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0) {
        resolve({
          image: img,
          width: img.naturalWidth,
          height: img.naturalHeight,
          done: () => URL.revokeObjectURL(url),
        });
      } else {
        URL.revokeObjectURL(url);
        reject(new Error("Empty picture"));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode the picture"));
    };
    img.src = url;
  });
}

// createImageBitmap first; then an <img>, which some browsers decode more formats with (and which copes with
// very large photos on iOS); then, for HEIC outside Safari, a converter loaded only when needed (it's large).
async function decode(file: File): Promise<Source> {
  try {
    return await viaBitmap(file);
  } catch {}
  try {
    return await viaImg(file);
  } catch (err) {
    if (!isHeic(file)) throw err;
  }
  const { default: heic2any } = await import("heic2any");
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const jpeg = Array.isArray(out) ? out[0] : out;
  try {
    return await viaBitmap(jpeg);
  } catch {
    return viaImg(jpeg);
  }
}

export async function prepareAvatar(
  file: File,
  animated = true,
): Promise<PreparedAvatar> {
  if (file.type === "image/gif" && animated) {
    return { blob: file, mime: "image/gif", ext: "gif" };
  }
  const source = await decode(file);
  try {
    const { sx, sy, side } = squareCrop(source.width, source.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source.image, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    // Browsers that can't encode WebP hand back PNG; ask for JPEG instead.
    const webp = await encode(canvas, "image/webp", 0.85);
    if (webp && webp.type === "image/webp")
      return { blob: webp, mime: "image/webp", ext: "webp" };
    const jpeg = await encode(canvas, "image/jpeg", 0.88);
    if (!jpeg) throw new Error("Could not encode the picture");
    return { blob: jpeg, mime: "image/jpeg", ext: "jpg" };
  } finally {
    source.done();
  }
}
