const BASE = "http://local.invalid";

// Only allow same-site relative paths as post-login destinations.
// Parses like a browser does (strips tabs/newlines, collapses dot segments), then checks
// both the origin and that the normalised path can't be read as protocol-relative.
export function safeNext(value: FormDataEntryValue | string | null | undefined, fallback = "/") {
  const raw = typeof value === "string" ? value : "";
  if (!raw.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE || url.pathname.startsWith("//")) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
