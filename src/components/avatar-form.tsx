"use client";

import { useId, useState, type ChangeEvent } from "react";
import { Avatar } from "@/components/avatar";
import { Button, FormMessage } from "@/components/form";
import {
  removePicture,
  savePicture,
  type PictureState,
} from "@/app/(app)/picture-actions";
import {
  AVATAR_BUCKET,
  AVATAR_MAX_BYTES,
  checkAvatarFile,
  EXEC_GIF_MAX_BYTES,
  newAvatarPath,
} from "@/lib/avatar";
import { prepareAvatar } from "@/lib/avatar-image";
import { createClient } from "@/lib/supabase/client";

// Picture for one member: the current one, a file picker, and remove. Resizes in the browser, then uploads
// straight to the owner's folder (storage policies decide who may).
export function AvatarForm({
  userId,
  name,
  src,
  hasPicture,
  canRemove = true,
  animated = false,
  gifLimit = AVATAR_MAX_BYTES,
}: {
  userId: string;
  name: string;
  src: string | null;
  hasPicture: boolean;
  canRemove?: boolean;
  animated?: boolean; // the owner is an executive, so a GIF stays animated
  gifLimit?: number; // bytes; executives get 1 MB unless exempt (see gifLimitBytes)
}) {
  const inputId = useId();
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [result, setResult] = useState<PictureState | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setResult(null);
    const problem = checkAvatarFile(file, animated, gifLimit);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    setBusy("upload");
    try {
      const prepared = await prepareAvatar(file, animated);
      const objectPath = newAvatarPath(
        userId,
        crypto.randomUUID(),
        prepared.ext,
      );
      const supabase = createClient();
      const { error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(objectPath, prepared.blob, {
          contentType: prepared.mime,
          cacheControl: "3600",
        });
      if (error) {
        setLocalError("Couldn't upload that. Try again.");
        return;
      }
      setResult(await savePicture(userId, objectPath));
    } catch {
      setLocalError("Couldn't read that picture. Try a different one.");
    } finally {
      setBusy(null);
    }
  }

  async function onRemove() {
    setResult(null);
    setLocalError(null);
    setBusy("remove");
    try {
      setResult(await removePicture(userId));
    } finally {
      setBusy(null);
    }
  }

  const error = localError ?? result?.error ?? null;

  return (
    <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
      <Avatar name={name} src={src} size="lg" />
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <label htmlFor={inputId} className="text-[15px] font-medium">
            {hasPicture ? "Change picture" : "Add a picture"}
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            disabled={busy !== null}
            onChange={onPick}
            aria-describedby={`${inputId}-hint`}
            className="w-full min-w-0 text-[16px] file:caps file:mr-4 file:h-12 file:cursor-pointer file:border file:border-ink file:bg-transparent file:px-5 file:text-[16px] file:text-ink hover:file:bg-band focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
          />
          <p id={`${inputId}-hint`} className="text-[15px] text-ink-2">
            {!animated
              ? "Any photo. Animated GIFs are for executives."
              : gifLimit <= EXEC_GIF_MAX_BYTES
                ? "Any photo, or a GIF up to 1 MB."
                : "Any photo, or an animated GIF."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {hasPicture && canRemove ? (
            <Button
              variant="line"
              type="button"
              onClick={onRemove}
              disabled={busy !== null}
            >
              {busy === "remove" ? "Removing" : "Remove picture"}
            </Button>
          ) : null}
          {busy === "upload" ? (
            <p className="text-[16px] text-ink-2" role="status">
              Uploading
            </p>
          ) : null}
        </div>
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        {!error && result?.ok ? (
          <FormMessage tone="ok">{result.ok}</FormMessage>
        ) : null}
      </div>
    </div>
  );
}
