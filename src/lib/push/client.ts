// Browser-side push helpers. Only imported by client components.

// PushManager wants the VAPID public key as bytes; the key is base64url with no padding.
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normal);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

// True when an existing subscription was made with this site's current public key. After a key change the
// browser refuses to subscribe again until the old one is dropped.
export function sameServerKey(
  existing: ArrayBuffer | null | undefined,
  publicKey: string,
): boolean {
  if (!existing) return false;
  const a = new Uint8Array(existing);
  const b = urlBase64ToUint8Array(publicKey);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// Reads the server's answer as an error message, falling back to a plain line.
export async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}
