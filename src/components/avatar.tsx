"use client";

import { useState } from "react";
import { initials } from "@/lib/profile";

const SIZE = {
  sm: "size-8 text-13",
  md: "size-14 text-22",
  lg: "size-28 text-44 sm:size-36 sm:text-56",
} as const;

// Square always. A picture when there is one (a signed URL from the server), otherwise the initials. Signed URLs
// expire after an hour, so a page left open (or the installed app resumed) can hold a dead link: a picture that
// fails to load falls back to the initials instead of a broken image.
// The name next to it carries the meaning, so the image is decorative. GIFs render animated: the file is
// shown as it is, never converted.
export function Avatar({
  name,
  src,
  size = "md",
}: {
  name: string;
  src: string | null;
  size?: keyof typeof SIZE;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const box = `${SIZE[size]} shrink-0 overflow-hidden border border-rule bg-band`;
  if (src && failed !== src) {
    return (
      // A signed URL from the private bucket; not routed through the image optimizer.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={256}
        height={256}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(src)}
        className={`${box} object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${box} grid place-items-center font-display font-semibold text-ink-2 uppercase`}
    >
      {initials(name)}
    </span>
  );
}
