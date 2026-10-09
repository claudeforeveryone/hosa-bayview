import { initials } from "@/lib/profile";

const SIZE = {
  sm: "size-8 text-[13px]",
  md: "size-14 text-[22px]",
  lg: "size-28 text-[44px] sm:size-36 sm:text-[56px]",
} as const;

// Square always. A picture when there is one (a signed URL from the server), otherwise the initials.
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
  const box = `${SIZE[size]} shrink-0 overflow-hidden border border-rule bg-band`;
  if (src) {
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
