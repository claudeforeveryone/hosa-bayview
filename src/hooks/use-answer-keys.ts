"use client";

import { useEffect, useRef } from "react";
import { answerAction, type AnswerKeyContext } from "@/lib/answer-keys";

export type AnswerKeyHandlers = {
  // Choices on screen the number and letter keys can pick (0 when none are open to answer).
  options?: number;
  // Only number keys pick, not letters.
  digitsOnly?: boolean;
  onPick?: (index: number) => void;
  // Present only when that move exists; its presence also tells the keys the move is available.
  onPrev?: () => void;
  onNext?: () => void;
  onEnter?: () => void;
  onSpace?: () => void;
  // False turns every key off (a dialog of the surface's own, or a screen with nothing to answer).
  enabled?: boolean;
};

// One window listener per surface. The handlers are read at key time, so callers can pass fresh closures each render.
export function useAnswerKeys(handlers: AnswerKeyHandlers) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = latest.current;
      if (e.defaultPrevented || h.enabled === false) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      const sel = window.getSelection();
      const action = answerAction(
        e,
        el
          ? {
              tagName: el.tagName,
              isContentEditable: el.isContentEditable,
              role: el.getAttribute("role"),
            }
          : null,
        {
          options: h.options ?? 0,
          digitsOnly: h.digitsOnly,
          prev: Boolean(h.onPrev),
          next: Boolean(h.onNext),
          enter: Boolean(h.onEnter),
          space: Boolean(h.onSpace),
          dialogOpen: document.querySelector("dialog[open]") !== null,
          selecting: sel !== null && !sel.isCollapsed,
        } satisfies AnswerKeyContext,
      );
      if (!action) return;
      e.preventDefault();
      switch (action.kind) {
        case "pick":
          h.onPick?.(action.index);
          return;
        case "prev":
          h.onPrev?.();
          return;
        case "next":
          h.onNext?.();
          return;
        case "enter":
          h.onEnter?.();
          return;
        case "space":
          h.onSpace?.();
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
