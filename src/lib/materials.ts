// Pure helpers for the file and link library: names, storage paths, sizes, labels. Safe on client and server.
import { hostOf } from "@/lib/resources";

export const MAX_BYTES = 26214400; // 25 MB, the bucket limit too.
export const MAX_PATH_NAME = 100;

export type MaterialRow = {
  id: string;
  classroom_id: string | null;
  title: string;
  note: string;
  url: string | null;
  path: string | null;
  file_name: string | null;
  size_bytes: number | null;
  mime: string | null;
  created_at: string;
};

// A row plus a link to open it: the URL itself, or a signed storage URL for files (null if signing failed).
export type MaterialItem = MaterialRow & { href: string | null };

// Storage folder for a classroom id, or the chapter-wide folder when null.
export function storageFolder(classroomId: string | null): string {
  return classroomId ? classroomId.toLowerCase() : "chapter";
}

function stripControl(name: string): string {
  return name.replace(/\p{Cc}/gu, "").trim();
}

// Drops control characters and trims, capped at 200 for the file_name column. Never empty.
export function cleanFileName(name: string): string {
  return stripControl(name).slice(0, 200) || "file";
}

function asciiSlug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0080-\uffff]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// "<folder>/<uuid>-<slug>.<ext>". The name part stays ascii and at most 100 characters.
// The uuid keeps two uploads with the same name apart; the extension is kept for the browser.
export function buildStoragePath(
  folder: string,
  fileName: string,
  id: string = crypto.randomUUID(),
): string {
  // Not cleanFileName: its 200 cap would cut off a long name's extension before it is read.
  const name = stripControl(fileName) || "file";
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext =
    dot > 0
      ? asciiSlug(name.slice(dot + 1))
          .replace(/-/g, "")
          .slice(0, 10)
      : "";
  const suffix = ext ? `.${ext}` : "";
  const room = MAX_PATH_NAME - id.length - 1 - suffix.length;
  const slug = asciiSlug(stem).slice(0, room).replace(/-+$/, "") || "file";
  return `${folder}/${id}-${slug}${suffix}`;
}

const STORED_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9-]{1,100}(?:\.[a-z0-9]{1,10})?$/;

// True only for a path this app would have built for that folder. Guards the row's path column.
export function isStoragePath(path: string, folder: string): boolean {
  const prefix = `${folder}/`;
  if (!path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  return name.length <= MAX_PATH_NAME && STORED_NAME.test(name);
}

// "2.4 MB". Bytes below 1 KB stay in bytes.
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1023.5 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const shown = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${shown} ${units[i]}`;
}

// Default title for a picked file: the name without its extension.
export function titleFromFile(fileName: string): string {
  const name = cleanFileName(fileName);
  const dot = name.lastIndexOf(".");
  const stem = (dot > 0 ? name.slice(0, dot) : name).trim();
  return (stem || name).slice(0, 120);
}

// Client and server both check this before uploading.
export function tooBigMessage(size: number): string | null {
  if (size <= 0) return "That file is empty.";
  if (size > MAX_BYTES) return "That file is over 25 MB. Pick a smaller one.";
  return null;
}

const KINDS = new Map<string, string>([
  ["pdf", "PDF"],
  ["doc", "Word"],
  ["docx", "Word"],
  ["ppt", "Slides"],
  ["pptx", "Slides"],
  ["xls", "Excel"],
  ["xlsx", "Excel"],
  ["csv", "CSV"],
  ["txt", "Text"],
  ["md", "Text"],
  ["rtf", "Text"],
  ["png", "Image"],
  ["jpg", "Image"],
  ["jpeg", "Image"],
  ["gif", "Image"],
  ["webp", "Image"],
  ["mp4", "Video"],
  ["mov", "Video"],
  ["mp3", "Audio"],
  ["m4a", "Audio"],
  ["zip", "Zip"],
]);

// Short label for the meta line: from the extension first, then the mime type.
export function fileKind(fileName: string | null, mime: string | null): string {
  const dot = fileName ? fileName.lastIndexOf(".") : -1;
  const ext = dot > 0 && fileName ? fileName.slice(dot + 1).toLowerCase() : "";
  const known = KINDS.get(ext);
  if (known) return known;
  if (mime?.startsWith("image/")) return "Image";
  if (mime?.startsWith("video/")) return "Video";
  if (mime?.startsWith("audio/")) return "Audio";
  if (ext) return ext.toUpperCase().slice(0, 6);
  return "File";
}

const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/Toronto",
});

// "Oct 9", on the chapter's clock.
export function formatDay(iso: string): string {
  return DAY.format(new Date(iso));
}

// Meta line under a title: "PDF · 2.4 MB · Oct 9" for files, the host for links.
export function materialMeta(row: MaterialRow): string {
  if (row.path) {
    return [
      fileKind(row.file_name, row.mime),
      row.size_bytes == null ? null : formatBytes(row.size_bytes),
      formatDay(row.created_at),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return row.url ? hostOf(row.url) : "";
}

// Types the materials bucket accepts as-is (supabase/migrations/0057c). Anything else goes up as plain bytes,
// so a browser never runs an uploaded file as a page or script.
export const SAFE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/zip",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export function uploadType(type: string): string {
  const t = type.trim().toLowerCase();
  return SAFE_TYPES.has(t) ? t : "application/octet-stream";
}
