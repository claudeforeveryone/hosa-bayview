// Small keyboard hints for answering. Shown only where a fine pointer (a mouse or trackpad) is the main input,
// so phones and tablets never see them. Decorative: screen readers get the shortcut from aria-keyshortcuts.
// The class names are written out in full so Tailwind can see them.

export function KeyHint({ n }: { n: number }) {
  return (
    <kbd
      aria-hidden
      className="num hidden size-6 shrink-0 place-items-center border border-current text-14 leading-none font-semibold not-italic opacity-70 [@media(hover:hover)_and_(pointer:fine)]:grid"
    >
      {n}
    </kbd>
  );
}

export function KeyLine({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  if (!text) return null;
  return (
    <p
      className={`caps num hidden text-14 text-ink-2 [@media(hover:hover)_and_(pointer:fine)]:block ${className}`}
    >
      {text}
    </p>
  );
}
