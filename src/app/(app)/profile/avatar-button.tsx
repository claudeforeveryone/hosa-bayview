"use client";

import { Camera, X } from "lucide-react";
import { useId, useRef } from "react";
import { Avatar } from "@/components/avatar";
import { AvatarForm } from "@/components/avatar-form";
import { useBackdropClose } from "@/hooks/use-backdrop-close";

// Your picture on the profile. Tapping it opens the picture changer (the same form as Settings) in a dialog.
export function AvatarButton({
  userId,
  name,
  src,
  hasPicture,
  animated,
  gifLimit,
}: {
  userId: string;
  name: string;
  src: string | null;
  hasPicture: boolean;
  animated: boolean;
  gifLimit: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const backdrop = useBackdropClose();
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-label={hasPicture ? "Change your picture" : "Add a picture"}
        className="group relative shrink-0 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <Avatar name={name} src={src} size="lg" />
        <span
          aria-hidden
          className="absolute right-0 bottom-0 grid size-9 place-items-center border-2 border-ground bg-ink text-ground group-hover:bg-ink-2"
        >
          <Camera size={18} strokeWidth={2} />
        </span>
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        {...backdrop}
        className="m-auto w-[calc(100%-2rem)] max-w-[36rem] max-h-[90dvh] overflow-y-auto border-2 border-ink bg-ground p-0 text-ink backdrop:bg-ink/50"
      >
        <div className="grid gap-5 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 border-b-[3px] border-ink pb-2">
            <h2
              id={titleId}
              className="font-display text-[clamp(1.6rem,6vw,2.2rem)] leading-none font-bold uppercase"
            >
              Picture
            </h2>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close"
              className="step grid size-11 place-items-center border-2 border-ink text-ink hover:bg-band"
            >
              <X size={20} strokeWidth={2} aria-hidden />
            </button>
          </div>
          <AvatarForm
            userId={userId}
            name={name}
            src={src}
            hasPicture={hasPicture}
            animated={animated}
            gifLimit={gifLimit}
          />
        </div>
      </dialog>
    </>
  );
}
