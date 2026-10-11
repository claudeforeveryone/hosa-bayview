import type { ReactNode } from "react";

// Nothing here yet: a band with an ink frame, the title in display caps, and one line of what to do next, with
// the way forward (a link or button) below it. Solid rules only.
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid justify-items-start gap-3 border-[3px] border-ink bg-band px-4 py-8 sm:px-6">
      <p className="font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.05] font-semibold uppercase">
        {title}
      </p>
      {children ? (
        <p className="max-w-[60ch] text-[17px] text-ink-2">{children}</p>
      ) : null}
      {action}
    </div>
  );
}
