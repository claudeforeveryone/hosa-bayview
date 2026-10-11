"use client";

import {
  useActionState,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type { FormState } from "@/app/(app)/c/actions";
import { prepareUpload } from "@/app/(app)/library/actions";
import { Button, Field, FormMessage, TextArea } from "@/components/form";
import { createClient } from "@/lib/supabase/client";
import { SECTION_MAX, formatBytes, tooBigMessage, titleFromFile, uploadType } from "@/lib/materials";

type Mode = "file" | "link";
type Action = (state: FormState, form: FormData) => Promise<FormState>;

// Add a link or a file. Link is first and the default: the free storage plan is small, so a link (Drive, Docs)
// is the preferred way to share. A file goes straight from the browser to storage on a signed URL, then the server
// action records the row. Adding clears the form after it saves.
export function MaterialForm({
  action,
  classroomId,
  modes = ["link", "file"],
  sections = [],
}: {
  action: Action;
  classroomId: string | null;
  modes?: Mode[];
  sections?: string[];
}) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<Mode>(modes[0]);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<null | "uploading" | "saving">(null);
  const [result, setResult] = useState<FormState>({});

  function switchMode(next: Mode) {
    setMode(next);
    setFile(null);
    setResult({});
  }

  function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0] ?? null;
    setResult({});
    const problem = next ? tooBigMessage(next.size) : null;
    if (next && problem) {
      e.target.value = "";
      setFile(null);
      setResult({ error: problem });
      return;
    }
    setFile(next);
    if (next) setTitle(titleFromFile(next.name));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    form.set("kind", mode);
    setResult({});
    try {
      if (mode === "file") {
        if (!file) {
          setResult({ error: "Choose a file first." });
          return;
        }
        const problem = tooBigMessage(file.size);
        if (problem) {
          setResult({ error: problem });
          return;
        }
        // Checked before uploading, so a rejected title doesn't leave an orphaned file behind.
        const cleanTitle = String(form.get("title") ?? "").trim();
        if (!cleanTitle || cleanTitle.length > 120) {
          setResult({
            fieldErrors: {
              title: cleanTitle
                ? "Keep the title under 120 characters."
                : "Give it a title.",
            },
          });
          return;
        }
        setBusy("uploading");
        const prepared = await prepareUpload(
          classroomId,
          file.name,
          file.size,
          file.type,
        );
        if ("error" in prepared) {
          setResult({ error: prepared.error });
          return;
        }
        const sent = await createClient()
          .storage.from("materials")
          .uploadToSignedUrl(prepared.path, prepared.token, file, {
            // Only types the bucket allows go up as-is; anything else is stored as plain bytes.
            contentType: uploadType(file.type),
          });
        if (sent.error) {
          setResult({ error: "That upload didn't finish. Try again." });
          return;
        }
        form.set("path", prepared.path);
        form.set("file_name", file.name);
        form.set("size_bytes", String(file.size));
        form.set("mime", file.type);
      }
      setBusy("saving");
      const next = await action({}, form);
      setResult(next);
      if (next.ok) {
        formRef.current?.reset();
        setFile(null);
        setTitle("");
      }
    } catch {
      setResult({ error: "That didn't save. Try again." });
    } finally {
      setBusy(null);
    }
  }

  const label =
    busy === "uploading"
      ? "Uploading"
      : busy === "saving"
        ? "Saving"
        : mode === "file"
          ? "Add file"
          : "Add link";
  const locked = busy !== null;

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="grid max-w-xl gap-5"
      noValidate
    >
      {result.error ? (
        <FormMessage tone="error">{result.error}</FormMessage>
      ) : null}
      {modes.length > 1 ? (
        <div
          role="group"
          aria-label="What to add"
          className="grid grid-flow-col auto-cols-fr border border-ink"
        >
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              disabled={locked}
              onClick={() => switchMode(m)}
              className={`caps step h-12 text-15 disabled:opacity-60 ${
                mode === m ? "bg-ink text-ground" : "text-ink hover:bg-band"
              }`}
            >
              {m === "file" ? "File" : "Link"}
            </button>
          ))}
        </div>
      ) : null}

      {mode === "file" ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${uid}-file`} className="text-15 font-medium">
            File
          </label>
          <input
            id={`${uid}-file`}
            type="file"
            disabled={locked}
            onChange={pickFile}
            aria-describedby={`${uid}-file-hint`}
            className="step block h-12 w-full min-w-0 border border-rule-strong text-15 file:mr-4 file:h-full file:cursor-pointer file:border-0 file:border-r file:border-rule-strong file:bg-band file:px-4 file:font-semibold file:text-ink disabled:opacity-60"
          />
          <p
            id={`${uid}-file-hint`}
            className="text-15 text-ink-2 [overflow-wrap:anywhere]"
          >
            {file ? (
              <>
                <span className="text-ink">{file.name}</span>{" "}
                <span className="num">{formatBytes(file.size)}</span>
              </>
            ) : (
              "Any type, up to 50 MB."
            )}
          </p>
        </div>
      ) : null}

      <Field
        id={`${uid}-title`}
        label="Title"
        name="title"
        maxLength={120}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={locked}
        error={result.fieldErrors?.title}
      />

      {mode === "link" ? (
        <Field
          id={`${uid}-url`}
          label="Web address"
          name="url"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://"
          disabled={locked}
          error={result.fieldErrors?.url}
          hint="Opens in a new tab."
        />
      ) : null}

      <Field
        id={`${uid}-section`}
        label="Section"
        name="section"
        maxLength={SECTION_MAX}
        list={`${uid}-sections`}
        autoComplete="off"
        disabled={locked}
        error={result.fieldErrors?.section}
        hint="Optional. Groups files together, like Past tests or Textbooks."
      />
      <datalist id={`${uid}-sections`}>
        {sections.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <TextArea
        id={`${uid}-note`}
        label="Note"
        name="note"
        maxLength={500}
        disabled={locked}
        error={result.fieldErrors?.note}
        hint="Optional."
      />

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={locked}>
          {label}
        </Button>
        {result.ok ? <FormMessage tone="ok">{result.ok}</FormMessage> : null}
      </div>
    </form>
  );
}

// Title and note for an existing row. The link or file itself can't be changed here.
export function MaterialEditForm({
  action,
  initial,
  sections = [],
}: {
  action: Action;
  initial: { title: string; note: string; section: string };
  sections?: string[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const uid = useId();
  const v = state.values ?? initial;

  return (
    <form action={formAction} className="grid max-w-xl gap-5" noValidate>
      {state.error ? (
        <FormMessage tone="error">{state.error}</FormMessage>
      ) : null}
      <Field
        id={`${uid}-title`}
        label="Title"
        name="title"
        maxLength={120}
        defaultValue={v.title}
        error={state.fieldErrors?.title}
      />
      <Field
        id={`${uid}-section`}
        label="Section"
        name="section"
        maxLength={SECTION_MAX}
        list={`${uid}-sections`}
        autoComplete="off"
        defaultValue={v.section}
        error={state.fieldErrors?.section}
        hint="Optional."
      />
      <datalist id={`${uid}-sections`}>
        {sections.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <TextArea
        id={`${uid}-note`}
        label="Note"
        name="note"
        maxLength={500}
        defaultValue={v.note}
        error={state.fieldErrors?.note}
        hint="Optional."
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save"}
        </Button>
        {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
      </div>
    </form>
  );
}
