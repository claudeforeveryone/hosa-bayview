"use client";

import { useRef, type MouseEvent, type PointerEvent } from "react";

// True when a point is outside the dialog's box: the dimmed backdrop, not its padding or scrollbar.
const outside = (el: HTMLElement, x: number, y: number) => {
  const r = el.getBoundingClientRect();
  return x < r.left || x > r.right || y < r.top || y > r.bottom;
};

// Tapping the dimmed area around a modal <dialog> closes it. Only when the press both starts and ends on the
// backdrop, so dragging out of a text field doesn't throw the panel away. Spread the result onto the dialog;
// its content must fill the dialog box (no padding on the dialog itself).
export function useBackdropClose() {
  const pressedOutside = useRef(false);
  return {
    onPointerDown(e: PointerEvent<HTMLDialogElement>) {
      pressedOutside.current =
        e.target === e.currentTarget && outside(e.currentTarget, e.clientX, e.clientY);
    },
    onClick(e: MouseEvent<HTMLDialogElement>) {
      if (
        pressedOutside.current &&
        e.target === e.currentTarget &&
        outside(e.currentTarget, e.clientX, e.clientY)
      )
        e.currentTarget.close();
      pressedOutside.current = false;
    },
  };
}
