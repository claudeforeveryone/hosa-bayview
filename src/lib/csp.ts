// Content Security Policy, built per request in the proxy. Next.js reads the nonce out of the request's CSP
// header and stamps it on its own scripts; the root layout stamps it on the inline appearance and intro
// scripts. 'strict-dynamic' lets those trusted scripts load the app's chunks. Styles stay 'unsafe-inline':
// React style attributes and next/font need it, and style injection is low risk next to script injection.

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function origin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp(
  nonce: string,
  { dev, supabaseUrl }: { dev: boolean; supabaseUrl: string | undefined },
): string {
  const supabase = origin(supabaseUrl);
  const realtime = supabase ? supabase.replace(/^http/, "ws") : null;
  const list = (...items: (string | null | false)[]) =>
    items.filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    `script-src ${list("'self'", `'nonce-${nonce}'`, "'strict-dynamic'", dev && "'unsafe-eval'")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${list("'self'", "blob:", "data:", supabase)}`,
    "font-src 'self'",
    `connect-src ${list("'self'", supabase, realtime)}`,
    `media-src ${list("'self'", supabase)}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
