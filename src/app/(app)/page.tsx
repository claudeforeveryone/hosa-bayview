import { Panel } from "@/components/panel";
import { requireProfile } from "@/lib/auth";

export default async function HomePage() {
  const profile = await requireProfile();
  const first = profile.full_name.split(" ")[0] || "you";

  return (
    <div className="grid snap-y gap-6">
      <h1 className="sr-only">Home</h1>
      <Panel label="Your standing this week" tone="field">
        <ol className="grid gap-px">
          <li className="flex items-baseline gap-4 bg-you px-4 py-3 text-on-you sm:px-6">
            <span className="num font-display text-[clamp(3.5rem,14vw,7rem)] leading-[0.9] font-bold">&ndash;</span>
            <span className="min-w-0 flex-1 truncate font-display text-[clamp(2rem,8vw,4.5rem)] leading-none font-semibold uppercase">
              {first}
            </span>
            <span className="num font-display text-[clamp(1.25rem,4vw,2rem)] font-semibold whitespace-nowrap">0 answered</span>
          </li>
        </ol>
        <p className="mt-5 max-w-[40ch] text-[18px] text-on-field-2">
          You&rsquo;re not on this week&rsquo;s board yet. Answer one question and you&rsquo;re in.
        </p>
      </Panel>
    </div>
  );
}
