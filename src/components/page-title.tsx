import type { ReactNode } from "react";

export function PageTitle({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <header className="grid gap-2">
      <h1 className="font-display text-[clamp(2.75rem,10vw,5rem)] leading-[0.92] font-bold uppercase">{children}</h1>
      {meta ? <p className="caps text-[17px] text-ink-2">{meta}</p> : null}
    </header>
  );
}
