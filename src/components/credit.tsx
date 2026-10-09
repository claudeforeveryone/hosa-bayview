import { Heart } from "lucide-react";

export function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={`flex items-center gap-1 text-[12px] text-ink-2/80 select-none ${className}`}>
      Made by J + K
      <Heart size={11} strokeWidth={2} fill="currentColor" aria-label="with love" role="img" />
    </p>
  );
}
