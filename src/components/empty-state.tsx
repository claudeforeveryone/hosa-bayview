import type { ReactNode } from "react";

// Nothing here yet. Dashed rules: in this system dashed means pending, solid means live.
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-start gap-3 border-y border-dashed border-rule-strong px-1 py-8 sm:px-3">
      <p className="font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.05] font-semibold uppercase">{title}</p>
      {children ? <p className="max-w-[60ch] text-[17px] text-ink-2">{children}</p> : null}
      {action}
    </div>
  );
}
