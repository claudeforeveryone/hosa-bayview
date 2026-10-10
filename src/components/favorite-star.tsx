"use client";

import { Star } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { favoriteIds, setFavorite, type FavoriteState } from "@/app/(app)/career/actions";

// Stars on a reviewed attempt come in one request per page, not one per question: every star that mounts
// without a known state joins the next batch.
type Batch = { ids: Set<string>; waiters: ((stars: Set<string>) => void)[] };
let pending: Batch | null = null;
function loadStar(questionId: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!pending) {
      const batch: Batch = { ids: new Set(), waiters: [] };
      pending = batch;
      setTimeout(() => {
        pending = null;
        favoriteIds([...batch.ids])
          .then((ids) => new Set(ids))
          .catch(() => new Set<string>())
          .then((stars) => batch.waiters.forEach((w) => w(stars)));
      }, 0);
    }
    pending.ids.add(questionId);
    pending.waiters.push((stars) => resolve(stars.has(questionId)));
  });
}

// A star toggle for one question. Pass `initial` when the page already knows; otherwise it asks once mounted.
export function FavoriteStar({
  questionId,
  initial,
  onChange,
  label = "Favourite",
}: {
  questionId: string;
  initial?: boolean;
  onChange?: (questionId: string, favorite: boolean) => void;
  label?: string;
}) {
  const [on, setOn] = useState<boolean | null>(initial ?? null);
  const [error, setError] = useState(false);
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (initial !== undefined) return;
    let live = true;
    loadStar(questionId).then((v) => {
      if (live) setOn(v);
    });
    return () => {
      live = false;
    };
  }, [questionId, initial]);

  function toggle() {
    if (on === null || busy) return;
    const next = !on;
    setOn(next);
    setError(false);
    onChange?.(questionId, next);
    startTransition(async () => {
      const res = await setFavorite(questionId, next).catch((): FavoriteState => ({ error: "network" }));
      if (res.error) {
        setOn(!next);
        setError(true);
        onChange?.(questionId, !next);
      }
    });
  }

  const pressed = on === true;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={on === null}
      aria-pressed={pressed}
      aria-label={label}
      title={error ? "Couldn't save. Tap to try again." : pressed ? "Remove from favourites" : "Add to favourites"}
      className={`step grid size-11 shrink-0 place-items-center border-2 ${
        pressed ? "border-ink bg-ink text-ground" : "border-rule-strong text-ink-2 hover:border-ink hover:text-ink"
      } ${error ? "border-danger" : ""} disabled:opacity-40 ${busy ? "cursor-progress" : ""}`}
    >
      <Star size={20} strokeWidth={2} fill={pressed ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}
