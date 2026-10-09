"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { setMode } from "@/lib/appearance";

type Theme = "light" | "dark";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const read = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-label={`Switch to ${next} mode`}
      className={`grid size-11 place-items-center ${className}`}
    >
      {theme === "dark" ? <Sun size={22} strokeWidth={1.75} /> : <Moon size={22} strokeWidth={1.75} />}
    </button>
  );
}
