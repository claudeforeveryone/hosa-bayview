import { Heart } from "lucide-react";

export function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] select-none ${className}`}>
      <span>Joseph.L × Kaden.L</span>
      <span className="flex gap-0.5" role="img" aria-label="with love">
        {[0, 1, 2, 3, 4].map((i) => (
          <Heart key={i} size={10} strokeWidth={2} fill="currentColor" aria-hidden />
        ))}
      </span>
    </p>
  );
}
