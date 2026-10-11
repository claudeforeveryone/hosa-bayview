import {
  createBrowserClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import { SHORT_SESSION, sessionCookieOptions } from "@/lib/session-length";

// Inlined at build time where the host sets them then (Vercel). A host that sets them only at run time leaves
// them empty in this bundle, so the root layout also writes them into the page; fall back to that.
const meta = (name: string) =>
  typeof document === "undefined"
    ? ""
    : (document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? "");

export function browserSupabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || meta("hosa-supabase-url");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || meta("hosa-supabase-key");
  return { url: url.replace(/\/+$/, ""), key };
}

export function createClient() {
  const { url, key } = browserSupabaseEnv();
  return createBrowserClient(
    url,
    key,
    {
      cookies: {
        getAll: () =>
          parseCookieHeader(document.cookie).map(({ name, value }) => ({
            name,
            value: value ?? "",
          })),
        // A token refresh in the browser keeps a "Stay signed in" off session short, like the server does.
        setAll(cookiesToSet) {
          const short = parseCookieHeader(document.cookie).some(
            (c) => c.name === SHORT_SESSION && c.value === "1",
          );
          for (const { name, value, options } of cookiesToSet)
            document.cookie = serializeCookieHeader(
              name,
              value,
              sessionCookieOptions(options, short),
            );
        },
      },
    },
  );
}
