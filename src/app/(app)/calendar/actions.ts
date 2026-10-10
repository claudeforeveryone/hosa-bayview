"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/app/(app)/c/actions";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { torontoToIso } from "@/lib/when";

const id = z.string().uuid();
const NOT_ALLOWED =
  "You can only add to the calendar for the chapter (executives) or events you run.";

function failed(where: string, message: string): FormState {
  console.error(`[calendar:${where}]`, message);
  return { error: "That didn't save. Try again." };
}

function read(form: FormData) {
  const values = {
    where: String(form.get("where") ?? ""),
    title: String(form.get("title") ?? "").trim(),
    starts: String(form.get("starts") ?? ""),
    ends: String(form.get("ends") ?? ""),
    location: String(form.get("location") ?? "").trim(),
    details: String(form.get("details") ?? "")
      .replace(/\r\n?/g, "\n")
      .trim(),
    all_day: form.get("all_day") === "on" ? "on" : "",
  };
  // All-day events take a date (or the date part of a date-time) and start at Toronto midnight.
  const allDay = values.all_day === "on";
  const asLocal = (v: string) => (allDay && v ? `${v.slice(0, 10)}T00:00` : v);
  const fieldErrors: Record<string, string> = {};
  if (!values.title) fieldErrors.title = "Name the event.";
  else if (values.title.length > 120)
    fieldErrors.title = "Keep it under 120 characters.";
  const starts = torontoToIso(asLocal(values.starts));
  if (!starts)
    fieldErrors.starts = allDay
      ? "Pick a date."
      : "Pick a start date and time.";
  const ends = values.ends ? torontoToIso(asLocal(values.ends)) : null;
  if (values.ends && !ends)
    fieldErrors.ends = "That end time isn't a real date.";
  else if (starts && ends && ends < starts)
    fieldErrors.ends = "It can't end before it starts.";
  if (values.location.length > 200)
    fieldErrors.location = "Keep it under 200 characters.";
  if (values.details.length > 2000)
    fieldErrors.details = "Keep it under 2000 characters.";
  const row = Object.keys(fieldErrors).length
    ? null
    : {
        title: values.title,
        starts_at: starts!,
        ends_at: ends,
        location: values.location,
        details: values.details,
        all_day: allDay,
      };
  return { values, fieldErrors, row };
}

export async function saveEvent(
  eventId: string | null,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  const { values, fieldErrors, row } = read(form);
  if (eventId !== null && !id.safeParse(eventId).success)
    return { error: "That event doesn't exist.", values };
  if (!row) return { fieldErrors, values };

  const supabase = await createClient();
  if (eventId === null) {
    const where = values.where === "chapter" ? null : values.where;
    if (where !== null && !id.safeParse(where).success)
      return { fieldErrors: { where: "Pick where it's for." }, values };
    const { error } = await supabase
      .from("events")
      .insert({ ...row, classroom_id: where });
    if (error) {
      if (error.code === "42501") return { error: NOT_ALLOWED, values };
      return { ...failed("add", error.message), values };
    }
    refresh();
    return { ok: "Added to the calendar.", values: { where: values.where } };
  }

  const { data, error } = await supabase
    .from("events")
    .update(row)
    .eq("id", eventId)
    .select("id");
  if (error) {
    if (error.code === "42501") return { error: NOT_ALLOWED, values };
    return { ...failed("edit", error.message), values };
  }
  if (!data?.length) return { error: NOT_ALLOWED, values };
  refresh();
  return { ok: "Saved.", values };
}

export async function deleteEvent(eventId: string): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(eventId).success)
    return { error: "That event doesn't exist." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .select("id");
  if (error) return failed("delete", error.message);
  if (!data?.length) return { error: "You can't delete this one." };
  refresh();
  return { ok: "Deleted." };
}
