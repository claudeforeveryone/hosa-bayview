import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routeGate } from "@/lib/route-gate";
import { sessionState } from "@/lib/session-state";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Refreshes the session cookie when needed. Must run before any redirect logic.
  const state = sessionState(await supabase.auth.getClaims());
  // Auth server unreachable: don't bounce anyone to login; the page shows the outage instead.
  if (state === "unavailable") return response;
  const gate = routeGate(request.nextUrl.pathname, request.nextUrl.search, state === "signed-in");
  if (!gate) return response;

  // Carry refreshed cookies and their no-store cache headers onto the redirect.
  const redirect = NextResponse.redirect(new URL(gate.redirect, request.url));
  response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie" && !key.toLowerCase().startsWith("x-middleware")) {
      redirect.headers.set(key, value);
    }
  });
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
