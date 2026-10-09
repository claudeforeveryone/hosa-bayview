"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { AVATAR_BUCKET, isAnimatedImage, isAvatarPath } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/server";

export type PictureState = { error?: string; ok?: string };

const uuid = z.string().uuid();

// Members change their own picture. Executives can change anyone's; the database refuses demo accounts doing so.
async function allowed(userId: string) {
  const me = await requireProfile();
  return me.id === userId || me.role === "executive";
}

const NOT_ALLOWED = "You can't change that picture.";

// Called after the browser has uploaded the file to the owner's folder. Points the profile at it and removes the old file.
export async function savePicture(
  userId: string,
  path: string,
): Promise<PictureState> {
  const parsed = z
    .object({ userId: uuid, path: z.string().max(200) })
    .safeParse({ userId, path });
  if (!parsed.success || !isAvatarPath(path, userId))
    return { error: "Pick a picture." };
  if (!(await allowed(userId))) return { error: NOT_ALLOWED };

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("profiles")
    .select("avatar_path, role")
    .eq("id", userId)
    .maybeSingle();
  if (readError || !current) {
    if (readError) console.error("[picture] read:", readError.message);
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    return { error: "That person is gone. Reload the page." };
  }

  // Moving pictures are for executives. The name can't be trusted, so look at the bytes.
  if (current.role !== "executive") {
    const { data: file, error: fileError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .download(path);
    const animated =
      !fileError && file
        ? isAnimatedImage(new Uint8Array(await file.arrayBuffer()))
        : null;
    if (animated !== false) {
      if (fileError) console.error("[picture] check:", fileError.message);
      const { error: removeError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .remove([path]);
      if (removeError) console.error("[picture] drop:", removeError.message);
      return {
        error: animated
          ? "Animated pictures are for executives."
          : "Couldn't save that. Try again.",
      };
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", userId)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("[picture] save:", error.message);
    // Don't leave the new file behind when the profile didn't take it.
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    return {
      error:
        error?.code === "42501"
          ? NOT_ALLOWED
          : "Couldn't save that. Try again.",
    };
  }

  const old = current.avatar_path as string | null;
  if (old && old !== path) {
    const { error: removeError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .remove([old]);
    if (removeError) console.error("[picture] old file:", removeError.message);
  }
  refresh();
  return { ok: "Picture saved." };
}

// Takes the picture off. The profile falls back to initials.
export async function removePicture(userId: string): Promise<PictureState> {
  if (!uuid.safeParse(userId).success) return { error: NOT_ALLOWED };
  if (!(await allowed(userId))) return { error: NOT_ALLOWED };

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", userId)
    .maybeSingle();
  if (readError || !current)
    return { error: "That person is gone. Reload the page." };

  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_path: null })
    .eq("id", userId)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("[picture] remove:", error.message);
    return {
      error:
        error?.code === "42501"
          ? NOT_ALLOWED
          : "Couldn't remove that. Try again.",
    };
  }

  const old = current.avatar_path as string | null;
  if (old) {
    const { error: removeError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .remove([old]);
    if (removeError) console.error("[picture] file:", removeError.message);
  }
  refresh();
  return { ok: "Picture removed." };
}
