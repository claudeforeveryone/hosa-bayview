import { CircleAlert, CircleCheck } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export function Field({
  label,
  name,
  error,
  hint,
  id: idProp,
  ...input
}: {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
} & ComponentProps<"input">) {
  const id = idProp ?? `f-${name}`;
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[15px] font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="step h-12 w-full border border-rule-strong bg-transparent px-3 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)] aria-invalid:border-danger"
        {...input}
      />
      {error ? (
        <p id={`${id}-err`} className="text-[15px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[15px] text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Select({
  label,
  name,
  error,
  hint,
  id: idProp,
  children,
  ...select
}: {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
} & ComponentProps<"select">) {
  const id = idProp ?? `f-${name}`;
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[15px] font-medium">
        {label}
      </label>
      <select
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="step h-12 w-full border border-rule-strong bg-ground px-3 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)] aria-invalid:border-danger"
        {...select}
      >
        {children}
      </select>
      {error ? (
        <p id={`${id}-err`} className="text-[15px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[15px] text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextArea({
  label,
  name,
  error,
  hint,
  id: idProp,
  ...input
}: {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
} & ComponentProps<"textarea">) {
  const id = idProp ?? `f-${name}`;
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[15px] font-medium">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="step min-h-28 w-full resize-y border border-rule-strong bg-transparent px-3 py-2.5 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)] aria-invalid:border-danger"
        {...input}
      />
      {error ? (
        <p id={`${id}-err`} className="text-[15px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[15px] text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Button({
  variant = "solid",
  className = "",
  ...props
}: { variant?: "solid" | "line" | "you" } & ComponentProps<"button">) {
  const styles = {
    solid: "bg-ink text-ground hover:bg-ink-2",
    line: "border border-ink text-ink hover:bg-band",
    you: "bg-you text-on-you hover:brightness-110",
  }[variant];
  return (
    <button
      className={`caps step inline-flex h-12 items-center justify-center gap-2 px-6 text-[17px] disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`}
      {...props}
    />
  );
}

export function FormMessage({
  tone,
  children,
}: {
  tone: "error" | "ok";
  children: ReactNode;
}) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`flex gap-2 text-[16px] ${tone === "error" ? "text-danger" : "text-ok"}`}
    >
      <Icon
        size={20}
        strokeWidth={1.75}
        className="mt-0.5 shrink-0"
        aria-hidden
      />
      <span>{children}</span>
    </p>
  );
}
