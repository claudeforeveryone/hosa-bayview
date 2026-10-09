import "server-only";
import { AVATAR_BUCKET } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/server";

// Pictures are private. A signed URL lasts an hour, and only a signed-in member can get one (storage policy).
const LIFETIME_SECONDS = 60 * 60;

// Signed URLs for a set of picture paths, fetched in one request. A path that can't be signed is left out,
// so the caller falls back to initials.
export async function avatarSources(
  paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (unique.length === 0) return out;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrls(unique, LIFETIME_SECONDS);
  if (error) {
    console.error("[avatars] signed urls:", error.message);
    return out;
  }
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}
