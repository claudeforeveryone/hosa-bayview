import type { ReactNode } from "react";

// A feed panel: content anchored low-left, actions stacked on a right rail.
// On phones it owns the viewport height under the header; on desktop it sizes to content.
export function Panel({
  children,
  rail,
  tone = "ground",
  label,
  size = "full",
  className = "",
}: {
  children: ReactNode;
  rail?: ReactNode;
  tone?: "ground" | "field";
  label: string;
  // "auto" for secondary panels further down the feed that shouldn't claim a whole screen.
  size?: "full" | "auto";
  className?: string;
}) {
  const toneClass = tone === "field" ? "bg-field text-on-field" : "border-y border-rule";
  const sizeClass = size === "full" ? "min-h-[calc(100dvh-13rem)] lg:min-h-[28rem]" : "";
  return (
    <section
      aria-label={label}
      className={`relative flex snap-start flex-col justify-end ${sizeClass} ${toneClass} ${className}`}
    >
      <div className="flex items-end gap-4 px-4 py-6 sm:px-8 lg:px-10 lg:py-10">
        <div className="min-w-0 flex-1">{children}</div>
        {rail ? <div className="flex flex-col items-center gap-5 self-center">{rail}</div> : null}
      </div>
    </section>
  );
}

export function RailButton({
  label,
  children,
  ...rest
}: { label: string; children: ReactNode } & React.ComponentProps<"button">) {
  return (
    <button type="button" className="step flex w-14 flex-col items-center gap-1" {...rest}>
      <span className="grid size-12 place-items-center border border-current">{children}</span>
      <span className="caps text-[12px] leading-none">{label}</span>
    </button>
  );
}
