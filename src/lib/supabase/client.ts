import {
  createBrowserClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import { SHORT_SESSION, sessionCookieOptions } from "@/lib/session-length";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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
