"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/app/(app)/c/actions";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { torontoToIso } from "@/lib/when";

const id = z.string().uuid();

const competitionFields = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give it a name.")
    .max(80, "Keep the name under 80 characters."),
  event: z.string().trim().max(80, "Keep the event under 80 characters."),
  description: z
    .string()
    .trim()
    .max(1000, "Keep the description under 1000 characters."),
});

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues)
    out[String(issue.path[0])] ??= issue.message;
  return out;
}

function failed(where: string, message: string): FormState {
  console.error(`[blc:${where}]`, message);
  return { error: "That didn't save. Try again." };
}

// datetime-local values are typed in Toronto time. Both ends are optional; a closing time needs to come after the opening one.
function parseWindow(
  opens: string,
  closes: string,
):
  | { ok: true; opens_at: string | null; closes_at: string | null }
  | { ok: false; fieldErrors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const o = opens.trim() ? torontoToIso(opens) : null;
  const c = closes.trim() ? torontoToIso(closes) : null;
  if (opens.trim() && !o) errors.opens = "Pick a real date and time.";
  if (closes.trim() && !c) errors.closes = "Pick a real date and time.";
  if (
    !errors.opens &&
    !errors.closes &&
    o &&
    c &&
    Date.parse(c) <= Date.parse(o)
  )
    errors.closes = "Closing has to be after opening.";
  return Object.keys(errors).length
    ? { ok: false, fieldErrors: errors }
    : { ok: true, opens_at: o, closes_at: c };
}

export async function createCompetition(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  if (profile.role !== "executive")
    return { error: "Only executives can run mock competitions." };

  const values = {
    name: String(form.get("name") ?? ""),
    event: String(form.get("event") ?? ""),
    // Browsers send textarea newlines as CRLF but count them as one character for maxLength.
    description: String(form.get("description") ?? "").replace(/\r\n?/g, "\n"),
    opens: String(form.get("opens") ?? ""),
    closes: String(form.get("closes") ?? ""),
  };
  const parsed = competitionFields.safeParse(values);
  const win = parseWindow(values.opens, values.closes);
  const errors = {
    ...(parsed.success ? {} : fieldErrors(parsed.error)),
    ...(win.ok ? {} : win.fieldErrors),
  };
  if (Object.keys(errors).length) return { fieldErrors: errors, values };
  if (!parsed.success || !win.ok)
    return { error: "That didn't save. Try again.", values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classrooms")
    .insert({
      ...parsed.data,
      kind: "competition",
      opens_at: win.opens_at,
      closes_at: win.closes_at,
    })
    .select("id")
    .single();
  if (error) return { ...failed("create", error.message), values };
  redirect(`/blc/${data.id}`);
}

export async function updateCompetitionWindow(
  competitionId: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  if (profile.role !== "executive")
    return { error: "Only executives can change a competition's times." };

  const values = {
    opens: String(form.get("opens") ?? ""),
    closes: String(form.get("closes") ?? ""),
  };
  if (!id.safeParse(competitionId).success)
    return { error: "That competition doesn't exist.", values };
  const win = parseWindow(values.opens, values.closes);
  if (!win.ok) return { fieldErrors: win.fieldErrors, values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classrooms")
    .update({ opens_at: win.opens_at, closes_at: win.closes_at })
    .eq("id", competitionId)
    .eq("kind", "competition")
    .select("id");
  if (error) return { ...failed("window", error.message), values };
  if (!data?.length)
    return { error: "That competition doesn't exist.", values };
  refresh();
  return { ok: "Times saved.", values };
}
