"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AvatarForm } from "@/components/avatar-form";
import { Button, Field, FormMessage, TextArea } from "@/components/form";
import type { Role } from "@/lib/auth";
import {
  BAN_CHOICES,
  BAN_LABEL,
  banStatus,
  banUntil,
  banWhen,
  type BanChoice,
} from "@/lib/moderation";
import { gradeLabel } from "@/lib/profile";
import {
  banMember,
  removeMember,
  unbanMember,
  warnMember,
  type ModState,
} from "./moderation-actions";
import { RoleSwitch } from "./role-switch";
import { roleLabel } from "@/lib/role-label";
import { useBackdropClose } from "@/hooks/use-backdrop-close";

export type PersonRow = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  created_at: string;
  avatar_path: string | null;
  // Signed URL for the picture, made on the server. Null when there is none (or it couldn't be signed).
  avatar_src: string | null;
  // Largest GIF this person may upload, in bytes: 1 MB for executives, the bucket limit for the exempt.
  gif_limit: number;
  // May this person have a GIF picture (a few named accounts, 0101)?
  gif: boolean;
  // Can the viewer give or remove executive (the chapter leads only)? Same for every row.
  can_grant_exec: boolean;
  grade: number | null;
  banned_until: string | null;
  ban_reason: string | null;
  title: string | null;
};

export type WarningRow = {
  id: string;
  message: string;
  created_at: string;
  seen_at: string | null;
};

const WHEN = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  year: "numeric",
  month: "short",
  day: "numeric",
});

function Result({ state }: { state: ModState }) {
  if (state.error) return <FormMessage tone="error">{state.error}</FormMessage>;
  if (state.ok) return <FormMessage tone="ok">{state.ok}</FormMessage>;
  return null;
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 border-t border-rule pt-5"
    >
      <h3
        id={id}
        className="font-display text-[clamp(1.6rem,6vw,2rem)] leading-none font-semibold uppercase"
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function WarnForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<ModState, FormData>(
    warnMember,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="userId" value={userId} />
      <TextArea
        label="Message"
        name="message"
        required
        maxLength={500}
        hint="Shows at the top of their screen until they click Got it. Keep it short."
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending" : "Send warning"}
        </Button>
      </div>
      <Result state={state} />
    </form>
  );
}

function BanForm({ userId, name }: { userId: string; name: string }) {
  const [choice, setChoice] = useState<BanChoice>("week");
  const [customDay, setCustomDay] = useState("");
  const [confirming, setConfirming] = useState(false);
  const groupId = useId();
  // Controlled inputs: on success, reset the inputs' state (not the form) so radios and date stay in step with React.
  const [state, action, pending] = useActionState<ModState, FormData>(
    async (prev, form) => {
      const result = await banMember(prev, form);
      if (result.ok) {
        setConfirming(false);
        setCustomDay("");
        setChoice("week");
      }
      return result;
    },
    {},
  );

  const until = banUntil(choice, new Date(), customDay);
  const preview =
    until === null
      ? "Pick a date that's still to come."
      : until === "permanent"
        ? "permanently"
        : banWhen({ permanent: false, until });

  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="userId" value={userId} />
      <fieldset className="grid gap-2">
        <legend className="text-[15px] font-medium">How long</legend>
        <div className="flex flex-wrap gap-2">
          {BAN_CHOICES.map((c) => {
            const checked = choice === c;
            return (
              <label
                key={c}
                className={`caps step inline-flex min-h-11 cursor-pointer items-center border px-3 text-[15px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                  checked
                    ? "border-ink bg-ink text-ground"
                    : "border-rule-strong hover:bg-band"
                }`}
              >
                <input
                  type="radio"
                  name="choice"
                  value={c}
                  checked={checked}
                  onChange={() => {
                    setChoice(c);
                    setConfirming(false);
                  }}
                  className="sr-only"
                  aria-describedby={`${groupId}-preview`}
                />
                {BAN_LABEL[c]}
              </label>
            );
          })}
        </div>
      </fieldset>
      {choice === "custom" ? (
        <Field
          label="Until (last day)"
          name="custom_day"
          type="date"
          value={customDay}
          onChange={(e) => setCustomDay(e.target.value)}
          hint="Through the end of that day, Toronto time."
        />
      ) : null}
      <Field
        label="Reason (optional)"
        name="reason"
        maxLength={200}
        hint="They see it on the banned page."
      />
      <p id={`${groupId}-preview`} className="text-[16px]">
        Ban {name} {preview}.
      </p>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || until === null}>
            {pending ? "Banning" : "Yes, ban"}
          </Button>
          <Button
            variant="line"
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div>
          <Button
            variant="line"
            type="button"
            onClick={() => setConfirming(true)}
            disabled={until === null}
          >
            Ban
          </Button>
        </div>
      )}
      <Result state={state} />
    </form>
  );
}

function UnbanForm({ userId, name }: { userId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<ModState, FormData>(
    async (prev, form) => {
      const result = await unbanMember(prev, form);
      if (result.ok) setConfirming(false);
      return result;
    },
    {},
  );
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="userId" value={userId} />
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[16px]">Lift the ban on {name}?</p>
          <Button type="submit" disabled={pending}>
            {pending ? "Lifting" : "Yes, lift ban"}
          </Button>
          <Button
            variant="line"
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div>
          <Button
            variant="line"
            type="button"
            onClick={() => setConfirming(true)}
          >
            Lift ban
          </Button>
        </div>
      )}
      <Result state={state} />
    </form>
  );
}

function RemoveForm({
  userId,
  name,
  onRemoved,
}: {
  userId: string;
  name: string;
  onRemoved: () => void;
}) {
  const [state, action, pending] = useActionState<ModState, FormData>(
    removeMember,
    {},
  );
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const ready = typed.trim().toLowerCase() === name.trim().toLowerCase();
  useEffect(() => {
    if (state.ok) onRemoved();
  }, [state, onRemoved]);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="userId" value={userId} />
      <p id={`${inputId}-warn`} className="text-[16px] text-ink-2">
        Deletes their account, sign-in and picture. Their activity goes with it.
        This can&apos;t be undone.
      </p>
      <Field
        label={`Type ${name} to confirm`}
        name="confirm_name"
        id={inputId}
        autoComplete="off"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        aria-describedby={`${inputId}-warn`}
      />
      <div>
        <Button type="submit" variant="line" disabled={!ready || pending}>
          {pending ? "Removing" : "Remove account"}
        </Button>
      </div>
      <Result state={state} />
    </form>
  );
}

function PersonBody({
  person,
  warnings,
  meId,
  onRemoved,
  onClose,
}: {
  person: PersonRow;
  warnings: WarningRow[];
  meId: string;
  onRemoved: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const isMe = person.id === meId;
  const isExec = person.role === "executive";
  const ban = banStatus(person.banned_until, new Date());
  const canModerate = !isMe && !isExec;

  return (
    <div className="grid gap-5 p-5 sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id={`${id}-title`}
            className="font-display text-[clamp(2rem,7vw,2.75rem)] leading-none font-bold [overflow-wrap:anywhere] uppercase"
          >
            {person.full_name}
          </h2>
          <p className="mt-2 text-[16px] text-ink-2 [overflow-wrap:anywhere]">
            {person.email} · {roleLabel(person.role, person.title)} ·{" "}
            {gradeLabel(person.grade)}
          </p>
        </div>
        <Button
          variant="line"
          type="button"
          onClick={onClose}
          className="h-11 shrink-0 px-4"
        >
          Close
        </Button>
      </header>

      <Section id={`${id}-role`} title="Role">
        <RoleSwitch
          userId={person.id}
          name={person.full_name}
          role={person.role}
          isMe={isMe}
          canGrantExec={person.can_grant_exec}
        />
      </Section>

      <Section id={`${id}-picture`} title="Picture">
        <AvatarForm
          userId={person.id}
          name={person.full_name}
          src={person.avatar_src}
          hasPicture={person.avatar_path !== null}
          animated={person.gif}
          gifLimit={person.gif_limit}
        />
      </Section>

      {canModerate ? (
        <>
          <Section id={`${id}-warn`} title="Warn">
            <WarnForm userId={person.id} />
          </Section>

          <Section id={`${id}-ban`} title="Ban">
            {ban.banned ? (
              <div className="grid gap-4">
                <p className="text-[17px]">
                  Banned {banWhen(ban)}.
                  {person.ban_reason ? <> Reason: {person.ban_reason}</> : null}
                </p>
                <UnbanForm userId={person.id} name={person.full_name} />
              </div>
            ) : (
              <BanForm userId={person.id} name={person.full_name} />
            )}
          </Section>

          <Section id={`${id}-history`} title="Warnings">
            {warnings.length ? (
              <ol className="border-t border-rule">
                {warnings.map((w) => (
                  <li
                    key={w.id}
                    className="grid gap-1 border-b border-rule py-3"
                  >
                    <p className="flex flex-wrap gap-x-3 text-[14px] text-ink-2">
                      <span className="num">
                        {WHEN.format(new Date(w.created_at))}
                      </span>
                      <span>{w.seen_at ? "Seen" : "Not seen yet"}</span>
                    </p>
                    <p className="text-[16px] [overflow-wrap:anywhere]">
                      {w.message}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[16px] text-ink-2">No warnings.</p>
            )}
          </Section>

          <Section id={`${id}-remove`} title="Remove">
            <RemoveForm
              userId={person.id}
              name={person.full_name}
              onRemoved={onRemoved}
            />
          </Section>
        </>
      ) : (
        <p className="border-t border-rule pt-5 text-[16px] text-ink-2">
          {isMe
            ? "You can't warn, ban or remove your own account."
            : "Executives can't be warned, banned or removed. Demote them first."}
        </p>
      )}
    </div>
  );
}

// One dialog for whichever person is open. Native dialog: focus is held inside it, Escape closes it,
// and focus goes back to the Manage button when it closes.
export function PersonDialog({
  person,
  warnings,
  meId,
  onClose,
  onRemoved,
}: {
  person: PersonRow | null;
  warnings: WarningRow[];
  meId: string;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const backdrop = useBackdropClose();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (person && !dialog.open) dialog.showModal();
    if (!person && dialog.open) dialog.close();
  }, [person]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      {...backdrop}
      className="m-auto w-[calc(100%-2rem)] max-w-[44rem] max-h-[90dvh] overflow-y-auto border border-ink bg-ground p-0 text-ink backdrop:bg-ink/50"
    >
      <span id={titleId} className="sr-only">
        {person ? `Manage ${person.full_name}` : "Manage member"}
      </span>
      {person ? (
        <PersonBody
          key={person.id}
          person={person}
          warnings={warnings}
          meId={meId}
          onRemoved={onRemoved}
          onClose={() => ref.current?.close()}
        />
      ) : null}
    </dialog>
  );
}
