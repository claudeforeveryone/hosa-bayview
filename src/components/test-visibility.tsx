"use client";

import { useRef, useState, useTransition, type KeyboardEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  schedulePublish,
  setPublished,
} from "@/app/(app)/c/[id]/tests/actions";
import { Segments } from "@/components/appearance";
import { Button, Field, FormMessage } from "@/components/form";
import {
  arrowTarget,
  tapSaves,
  visibilityOf,
  type Visibility,
} from "@/lib/test-visibility";
import { formatWhen, isoToToronto } from "@/lib/when";

const OPTIONS: { id: Visibility; label: string }[] = [
  { id: "hidden", label: "Hidden" },
  { id: "scheduled", label: "Scheduled" },
  { id: "posted", label: "Posted" },
];

const HINT =
  "While it's hidden, members can't open it, practise it, or see its questions in Career or battles. Only this room's trainers and executives can.";

// Arrow keys only move focus between the segments here; Space or a tap picks (see arrowTarget).
function moveFocusOnly(e: KeyboardEvent<HTMLDivElement>) {
  if (!(e.target instanceof HTMLInputElement)) return;
  const radios = [
    ...e.currentTarget.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    ),
  ];
  const to = arrowTarget(e.key, radios.indexOf(e.target), radios.length);
  if (to === null) return;
  e.preventDefault();
  radios[to].focus();
}

// Hidden | Scheduled | Posted for one test, on its page and its editor. Hidden and Posted save on the tap;
// Scheduled waits for a Toronto date and time and Save (0298's job posts it then and notifies the room).
export function TestVisibility({
  testId,
  published,
  publishAt,
}: {
  testId: string;
  published: boolean;
  publishAt: string | null;
}) {
  const saved = visibilityOf(published, publishAt);
  const [mode, setMode] = useState<Visibility>(saved);
  const [local, setLocal] = useState(() => isoToToronto(publishAt));
  // Follows the server (a save, someone else's change, the job posting it), state or time alike, without
  // remounting, which would drop the message.
  const now = `${saved}|${publishAt ?? ""}`;
  const [seen, setSeen] = useState(now);
  if (seen !== now) {
    setSeen(now);
    setMode(saved);
    setLocal(isoToToronto(publishAt));
  }
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  // A refused tap puts the switch back on what's saved.
  const pick = (next: Visibility) => {
    setMessage(null);
    setTimeError(null);
    setMode(next);
    const tap = tapSaves(saved, next);
    if (!tap) return;
    start(async () => {
      const r = await setPublished(testId, tap === "post");
      if (r.error) {
        setMessage({ tone: "error", text: r.error });
        setMode(saved);
      } else if (r.ok) {
        setMessage({ tone: "ok", text: r.ok });
      }
    });
  };

  // A refused schedule keeps the time field open, with the reason on the field itself.
  const schedule = () => {
    setMessage(null);
    setTimeError(null);
    start(async () => {
      const r = await schedulePublish(testId, local);
      if (r.error) {
        setTimeError(r.error);
        timeRef.current?.focus();
      } else if (r.ok) {
        setMessage({ tone: "ok", text: r.ok });
      }
    });
  };

  return (
    <div className="grid max-w-xl gap-4">
      <div onKeyDown={moveFocusOnly}>
        <Segments
          name={`visibility-${testId}`}
          label="Who can see it"
          options={OPTIONS}
          value={mode}
          onPick={pick}
          busy={pending}
          hint={HINT}
        />
      </div>
      {mode === "scheduled" ? (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) schedule();
          }}
          className="grid justify-items-start gap-3"
        >
          <div className="w-full">
            <Field
              ref={timeRef}
              id={`publish-at-${testId}`}
              label="Post it at (Toronto time)"
              name="publish_at"
              type="datetime-local"
              value={local}
              onChange={(e) => {
                setLocal(e.target.value);
                setTimeError(null);
              }}
              error={timeError ?? undefined}
              hint={
                saved === "scheduled" && publishAt
                  ? `Posts ${formatWhen(publishAt)} and members get a notification then.`
                  : saved === "posted"
                    ? "Saving hides it from members now, until then. They get a notification again when it posts."
                    : "Stays hidden until then. Members get a notification when it posts."
              }
            />
          </div>
          {/* aria-disabled, not disabled, so focus stays on Save while it saves. */}
          <Button
            type="submit"
            aria-disabled={pending || undefined}
            className="aria-disabled:cursor-wait aria-disabled:opacity-60"
          >
            {pending ? "Saving" : "Save"}
          </Button>
        </form>
      ) : null}
      {message ? (
        <FormMessage tone={message.tone}>{message.text}</FormMessage>
      ) : null}
    </div>
  );
}

// One tap on a row of a room's Tests tab: hide a posted test, or post a hidden one now (any schedule is dropped).
// The eye shows where the test stands; the label says what the tap does. Sits beside the row's link, never in it.
// aria-disabled, not disabled, while it saves, so keyboard focus stays on it; the result is read out politely.
export function VisibilityToggle({
  testId,
  title,
  published,
  scheduled = false,
}: {
  testId: string;
  title: string;
  published: boolean;
  scheduled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const Icon = published ? Eye : EyeOff;
  const label = published
    ? `Hide ${title} from members`
    : scheduled
      ? `Post ${title} now (cancels its schedule)`
      : `Post ${title} now`;
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={
          published
            ? "Hide from members"
            : scheduled
              ? "Post now, not on its schedule"
              : "Post now"
        }
        aria-disabled={pending || undefined}
        onClick={() => {
          if (pending) return;
          setResult(null);
          start(async () => {
            const r = await setPublished(testId, !published);
            setResult(
              r.error
                ? { tone: "error", text: r.error }
                : r.ok
                  ? { tone: "ok", text: r.ok }
                  : null,
            );
          });
        }}
        className={`step inline-flex h-11 w-11 items-center justify-center hover:bg-band hover:text-ink aria-disabled:cursor-wait aria-disabled:opacity-60 ${
          published ? "text-ink" : "text-ink-2"
        }`}
      >
        <Icon size={22} strokeWidth={1.75} aria-hidden />
      </button>
      {result?.tone === "error" ? (
        <p
          role="alert"
          className="col-span-full px-1 pb-3 text-15 text-danger sm:px-3"
        >
          {result.text}
        </p>
      ) : null}
      {/* Always mounted, so screen readers announce the change; out of the row's grid flow. */}
      <span role="status" className="sr-only">
        {result?.tone === "ok" ? result.text : ""}
      </span>
    </>
  );
}
