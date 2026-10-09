// Pure helpers for profile pictures: the storage path and checks on a picked file.
// Pictures are private; the app shows them through signed URLs (avatar-urls.ts, server only).
// The browser-only resize lives in avatar-image.ts.

export const AVATAR_SIZE = 256;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
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
// Static pictures are resized in the browser; GIFs go up as they are, so they must fit the limit as they are.
export function checkAvatarFile(file: {
  type: string;
  size: number;
}): string | null {
  if (!file.type.startsWith("image/")) return "Pick a picture file.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > AVATAR_MAX_BYTES) return "Keep the picture under 2 MB.";
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
