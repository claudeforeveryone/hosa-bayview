import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid justify-items-start gap-4 py-10">
      <h1 className="font-display text-[clamp(2.75rem,10vw,5rem)] leading-[0.92] font-bold uppercase">Not here</h1>
      <p className="max-w-[50ch] text-ink-2">
        Page doesn&rsquo;t exist, or you&rsquo;re not in that event.
      </p>
      <Link href="/" className="caps step inline-flex h-12 items-center bg-ink px-6 text-[17px] text-ground hover:bg-ink-2">
        Back home
      </Link>
    </div>
  );
}
