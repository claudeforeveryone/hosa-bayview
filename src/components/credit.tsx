import { Heart } from "lucide-react";

// "Built with (heart) by Joseph & Kaden". The heart is from the app's icon set and reads aloud as "love".
export function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-13 select-none ${className}`}>
      <span>Built with</span>
      <Heart size={11} strokeWidth={2} fill="currentColor" role="img" aria-label="love" />
      <span>by Joseph &amp; Kaden</span>
    </p>
  );
}
