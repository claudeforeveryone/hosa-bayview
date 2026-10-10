import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { MATERIAL_LINK_SECONDS } from "@/lib/link-lifetimes";
import { openableUrl } from "@/lib/materials";
import { createClient } from "@/lib/supabase/server";

const LINK_SECONDS = MATERIAL_LINK_SECONDS;
const uuid = z.string().uuid();

// Every redirect and refusal is per user and short-lived: never cache it.
const NO_STORE = { "Cache-Control": "private, no-store" };

const notFound = () =>
  new NextResponse("Not found", { status: 404, headers: NO_STORE });

function go(to: string | URL): NextResponse {
  const res = NextResponse.redirect(to, 302);
  res.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
  return res;
}

// Opens a material. The row is read with the caller's own session, so RLS decides who may see it (anything
// hidden reads as not found). Files redirect to a fresh signed URL that downloads under the file's name;
// links redirect to the link (http and https only); placeholders have nothing to open.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  // The proxy already sends guests to login; this covers a session that ended in between.
  if (!auth?.claims?.sub) {
    return go(
      new URL(
        `/login?next=${encodeURIComponent(`/files/${id}`)}`,
        request.nextUrl.origin,
      ),
    );
  }
  if (!uuid.safeParse(id).success) return notFound();

  const { data: row, error } = await supabase
    .from("materials")
    .select("url, path, file_name")
    .eq("id", id)
    .maybeSingle<{
      url: string | null;
      path: string | null;
      file_name: string | null;
    }>();
  if (error) {
    console.error("[files:read]", error.message);
    return new NextResponse("Couldn't open that file. Try again.", {
      status: 502,
      headers: NO_STORE,
    });
  }
  if (!row) return notFound();

  if (row.path) {
    const { data, error: signError } = await supabase.storage
      .from("materials")
      .createSignedUrl(row.path, LINK_SECONDS, {
        download: row.file_name || true,
      });
    if (signError || !data?.signedUrl) {
      console.error("[files:sign]", signError?.message ?? "no url");
      return new NextResponse("Couldn't open that file. Try again.", {
        status: 502,
        headers: NO_STORE,
      });
    }
    return go(data.signedUrl);
  }

  const link = openableUrl(row.url);
  return link ? go(link) : notFound();
}
