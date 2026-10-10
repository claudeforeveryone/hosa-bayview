import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/csp";
import { routeGate } from "@/lib/route-gate";
import { sessionState } from "@/lib/session-state";
import { SHORT_SESSION, sessionCookieOptions } from "@/lib/session-length";

export async function proxy(request: NextRequest) {
  // A fresh nonce per request. Next.js reads it from the request's CSP header and puts it on its own scripts;
  // the root layout reads x-nonce for the inline theme scripts. Set before any NextResponse.next({ request }).
  const nonce = newNonce();
  const csp = buildCsp(nonce, {
    dev: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);
  const withCsp = <T extends NextResponse>(res: T): T => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

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
          const short = request.cookies.get(SHORT_SESSION)?.value === "1";
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, sessionCookieOptions(options, short)),
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
  if (state === "unavailable") return withCsp(response);
  const gate = routeGate(request.nextUrl.pathname, request.nextUrl.search, state === "signed-in");
  if (!gate) return withCsp(response);

  // Carry refreshed cookies and their no-store cache headers onto the redirect.
  const redirect = NextResponse.redirect(new URL(gate.redirect, request.url));
  response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie" && !key.toLowerCase().startsWith("x-middleware")) {
      redirect.headers.set(key, value);
    }
  });
  return withCsp(redirect);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
