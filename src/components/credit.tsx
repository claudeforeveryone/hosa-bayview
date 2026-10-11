import { Heart } from "lucide-react";

export function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] select-none ${className}`}>
      <span>Joseph &amp; Kaden</span>
      <Heart size={10} strokeWidth={2} fill="currentColor" role="img" aria-label="with love" />
    </p>
  );
}
