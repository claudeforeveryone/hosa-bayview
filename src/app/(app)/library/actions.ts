"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/app/(app)/c/actions";
import { requireProfile } from "@/lib/auth";
import {
  MAX_MATERIAL_BYTES,
  SECTION_MAX,
  buildStoragePath,
  cleanFileName,
  isStoragePath,
  storageFolder,
  TOO_BIG,
  tooBigMessage,
} from "@/lib/materials";
import { cleanUrl } from "@/lib/resources";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid();

const NOT_MANAGER = "Only the trainer or an executive can change this.";
const NOT_POSTER = "Only the trainer or an executive can add here.";
const NOT_EXEC = "Only executives can add to Resources.";
const DIDNT_SAVE = "That didn't save. Try again.";

function failed(where: string, message: string): FormState {
  console.error(`[library:${where}]`, message);
  return { error: DIDNT_SAVE };
}

// Storage refuses an upload it has no permission for; the code and message differ by version.
function storageDenied(
  error: { statusCode?: string; message?: string } | null,
): boolean {
  return (
    error?.statusCode === "403" ||
    error?.statusCode === "401" ||
    /row-level security/i.test(error?.message ?? "")
  );
}

// Title and note, shared by add and edit. Values echo back on error so the form keeps what was typed.
function readDetails(form: FormData) {
  const values = {
    title: String(form.get("title") ?? "").trim(),
    note: String(form.get("note") ?? "")
      .replace(/\r\n?/g, "\n")
      .trim(),
    section: String(form.get("section") ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  };
  const fieldErrors: Record<string, string> = {};
  if (!values.title) fieldErrors.title = "Give it a title.";
  else if (values.title.length > 120)
    fieldErrors.title = "Keep the title under 120 characters.";
  if (values.note.length > 500)
    fieldErrors.note = "Keep the note under 500 characters.";
  if (values.section.length > SECTION_MAX)
    fieldErrors.section = `Keep the section under ${SECTION_MAX} characters.`;
  return { values, fieldErrors };
}

// Step one of a file upload: a signed URL for a fresh path in the right folder. The browser then sends the bytes.
export async function prepareUpload(
  classroomId: string | null,
  fileName: string,
  size: number,
  mime: string,
): Promise<{ path: string; token: string } | { error: string }> {
  await requireProfile();
  if (classroomId !== null && !id.safeParse(classroomId).success)
    return { error: "That classroom doesn't exist." };
  if (!Number.isInteger(size))
    return { error: "That file didn't come through. Pick it again." };
  const sizeError = tooBigMessage(size);
  if (sizeError) return { error: sizeError };
  if (String(mime ?? "").length > 120)
    return { error: "That file type is too long to save." };

  const path = buildStoragePath(
    storageFolder(classroomId),
    cleanFileName(String(fileName ?? "")),
  );
  // The user's own client, so the storage insert policy decides who may upload where.
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("materials")
    .createSignedUploadUrl(path);
  if (error || !data) {
    if (storageDenied(error))
      return { error: classroomId === null ? NOT_EXEC : NOT_POSTER };
    console.error("[library:prepare]", error?.message);
    return { error: DIDNT_SAVE };
  }
  return { path: data.path, token: data.token };
}

// Step two: a link, or a file the browser has finished uploading (path and file details as hidden fields).
export async function saveMaterial(
  classroomId: string | null,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  if (classroomId !== null && !id.safeParse(classroomId).success)
    return { error: "That classroom doesn't exist." };
  const { values, fieldErrors } = readDetails(form);
  const kind = String(form.get("kind") ?? "");

  let extra: Record<string, unknown>;
  if (kind === "link") {
    const url = cleanUrl(String(form.get("url") ?? ""));
    if (!url) fieldErrors.url = "Use a web address, like https://example.com.";
    extra = { url };
  } else if (kind === "file") {
    const path = String(form.get("path") ?? "");
    const size = String(form.get("size_bytes") ?? "");
    if (!isStoragePath(path, storageFolder(classroomId)))
      return { error: "That upload didn't finish. Try again.", values };
    if (!/^\d+$/.test(size) || Number(size) > MAX_MATERIAL_BYTES)
      return { error: TOO_BIG, values };
    const mime = String(form.get("mime") ?? "").slice(0, 120);
    extra = {
      path,
      file_name: cleanFileName(String(form.get("file_name") ?? "")),
      size_bytes: Number(size),
      mime: mime || null,
    };
  } else {
    return { error: DIDNT_SAVE, values };
  }
  const supabase = await createClient();
  // A failed save drops the file it uploaded, so nothing is left behind unreferenced.
  const discard = async () => {
    if (kind !== "file") return;
    const { error: removeError } = await supabase.storage.from("materials").remove([extra.path as string]);
    if (removeError) console.error("[library:discard]", removeError.message);
  };
  if (Object.keys(fieldErrors).length) {
    await discard();
    return { fieldErrors, values };
  }

  // A file row must point at an object that really landed, and its size and type come from storage, not the form.
  if (kind === "file") {
    const path = extra.path as string;
    const slash = path.indexOf("/");
    const { data: found, error: listError } = await supabase.storage
      .from("materials")
      .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
    const object = found?.find((o) => o.name === path.slice(slash + 1));
    if (listError || !object)
      return { error: "That upload didn't finish. Try again.", values };
    const meta = (object.metadata ?? {}) as { size?: number; mimetype?: string };
    if (typeof meta.size !== "number")
      return { error: "That upload didn't finish. Try again.", values };
    if (meta.size > MAX_MATERIAL_BYTES) {
      await discard();
      return { error: TOO_BIG, values };
    }
    extra.size_bytes = meta.size;
    extra.mime = typeof meta.mimetype === "string" ? meta.mimetype.slice(0, 120) : null;
  }
  // RLS decides who may add here; a 42501 means they may not.
  const { error } = await supabase
    .from("materials")
    .insert({
      ...extra,
      classroom_id: classroomId,
      title: values.title,
      note: values.note,
      section: values.section || null,
    });
  if (error) {
    await discard();
    if (error.code === "42501")
      return { error: classroomId === null ? NOT_EXEC : NOT_POSTER, values };
    return { ...failed("add", error.message), values };
  }
  refresh();
  return {
    ok: classroomId === null ? "Added to Resources." : "Added.",
    values: {},
  };
}

// Title and note only. The row's link or file can't change; add a new one instead.
export async function updateMaterial(
  materialId: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(materialId).success)
    return { error: "That file doesn't exist." };
  const { values, fieldErrors } = readDetails(form);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .update({
      title: values.title,
      note: values.note,
      section: values.section || null,
    })
    .eq("id", materialId)
    .select("id");
  if (error) {
    if (error.code === "42501") return { error: NOT_MANAGER, values };
    return { ...failed("edit", error.message), values };
  }
  if (!data?.length) return { error: NOT_MANAGER, values };
  refresh();
  return { ok: "Saved.", values };
}

// The row goes first, so a missing file never shows up as a live link. If the file removal fails after that,
// the object is left unreachable and only logged.
export async function deleteMaterial(materialId: string): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(materialId).success)
    return { error: "That file doesn't exist." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .delete()
    .eq("id", materialId)
    .select("id, path");
  if (error) {
    if (error.code === "42501") return { error: NOT_MANAGER };
    return failed("delete", error.message);
  }
  if (!data?.length) return { error: NOT_MANAGER };

  const path = (data[0] as { path: string | null }).path;
  if (path) {
    const { error: removeError } = await supabase.storage
      .from("materials")
      .remove([path]);
    if (removeError)
      console.error("[library:remove-file]", removeError.message);
  }
  refresh();
  return { ok: "Deleted." };
}
