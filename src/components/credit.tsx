export function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[11px] text-ink-2/60 select-none ${className}`}>
      made by J <span aria-label="with love">♥</span>
    </p>
  );
}
