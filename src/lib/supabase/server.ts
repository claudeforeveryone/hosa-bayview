import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SHORT_SESSION, sessionCookieOptions } from "@/lib/session-length";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Server Components can't write cookies; the proxy refreshes the session instead.
          try {
            const short = cookieStore.get(SHORT_SESSION)?.value === "1";
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, sessionCookieOptions(options, short)),
            );
          } catch {}
        },
      },
    },
  );
}
