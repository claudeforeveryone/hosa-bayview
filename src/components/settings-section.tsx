import type { ReactNode } from "react";

// One boxed section of a settings tab: a solid ink rule, a condensed heading, one plain line of description,
// then its settings with room between them.
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-7 border-t-[3px] border-ink pt-5"
    >
      <div className="grid gap-2">
        <h2
          id={id}
          className="font-display text-[clamp(1.75rem,5vw,2.25rem)] leading-none font-bold uppercase"
        >
          {title}
        </h2>
        {description ? (
          <p className="text-[16px] text-ink-2">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
