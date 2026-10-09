// Pure helpers for profile pictures: the storage path and checks on a picked file.
// Pictures are private; the app shows them through signed URLs (avatar-urls.ts, server only).
// The browser-only resize lives in avatar-image.ts.

export const AVATAR_SIZE = 256;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
// Executives' GIFs are capped at 1 MB, except the two exempt executives (private.gif_size_exempt), who keep
// the bucket's 2 MB limit. The database enforces this in two places: the storage upload policy (0060-0062)
// and the profile guard on avatar_path (0063), which reads the saved object's size on every picture change.
export const EXEC_GIF_MAX_BYTES = 1024 * 1024;

// The GIF size limit for an executive's picture. Exempt executives keep the bucket limit.
export const gifLimitBytes = (exempt: boolean): number =>
  exempt ? AVATAR_MAX_BYTES : EXEC_GIF_MAX_BYTES;
// Photos are shrunk to 256 px before upload, so the original only needs to be sane.
const PHOTO_MAX_BYTES = 25 * 1024 * 1024;
export const AVATAR_BUCKET = "avatars";

export type AvatarExt = "webp" | "jpg" | "gif";

const PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|gif)$/;

// True for "<uuid>/<uuid>.webp", ".jpg" or ".gif". With an owner id, the folder must be that id.
export function isAvatarPath(path: string, owner?: string): boolean {
  if (!PATH.test(path)) return false;
  return owner === undefined || path.startsWith(`${owner}/`);
}

export const extensionFor = (mime: string): AvatarExt =>
  mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "jpg";

// A new object name in the owner's folder. The random part is a fresh uuid, never the file's name.
export function newAvatarPath(
  owner: string,
  random: string,
  ext: AvatarExt,
): string {
  return `${owner}/${random}.${ext}`;
}

// Null when the file can be used, otherwise a short message for the member.
// Static pictures are resized in the browser; animated GIFs (executives only) go up as they are, so they must
// fit the limit as they are. Anyone else's GIF is resized to a still like a photo.
export function checkAvatarFile(
  file: {
    type: string;
    size: number;
  },
  animated = true,
  gifMax = AVATAR_MAX_BYTES,
): string | null {
  if (!file.type.startsWith("image/")) return "Pick a picture file.";
  if (file.size === 0) return "That file is empty.";
  if (file.type === "image/gif" && animated) {
    if (file.size > gifMax)
      return gifMax === EXEC_GIF_MAX_BYTES
        ? "Keep the GIF under 1 MB."
        : "Keep the picture under 2 MB.";
  } else if (file.size > PHOTO_MAX_BYTES)
    return "Keep the picture under 25 MB.";
  return null;
}

// The largest centred square in a w by h image: where to start cropping and how wide it is.
export function squareCrop(
  width: number,
  height: number,
): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return {
    sx: Math.floor((width - side) / 2),
    sy: Math.floor((height - side) / 2),
    side,
  };
}

// True when the bytes are a moving picture, whatever the file is called: any GIF, a WebP with its animation
// flag, an animated PNG, or an AVIF image sequence. Stills from the browser are always WebP or JPEG, so only executives' GIFs pass.
export function isAnimatedImage(bytes: Uint8Array): boolean {
  const ascii = (at: number, len: number) =>
    String.fromCharCode(...bytes.subarray(at, at + len));
  if (ascii(0, 4) === "GIF8") return true;
  if (ascii(4, 4) === "ftyp") return ascii(8, 4) === "avis";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP")
    return ascii(12, 4) === "VP8X" && (bytes[20] & 0x02) !== 0;
  if (bytes[0] === 0x89 && ascii(1, 3) === "PNG") {
    // Walk the chunks: an acTL chunk before the image data makes it animated.
    for (let at = 8; at + 8 <= bytes.length;) {
      const len =
        ((bytes[at] << 24) |
          (bytes[at + 1] << 16) |
          (bytes[at + 2] << 8) |
          bytes[at + 3]) >>>
        0;
      const type = ascii(at + 4, 4);
      if (type === "acTL") return true;
      if (type === "IDAT" || type === "IEND") return false;
      at += 12 + len;
    }
  }
  return false;
}
