import { IndependenceNote, Mail } from "@/components/legal-doc";

// The credits spot: a short About block under every Settings tab. A layout, so the Settings page itself is
// untouched. Terms, Privacy and the heart credit are in the footer right below, so they aren't repeated here.
export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-14">
      {children}
      <section
        aria-labelledby="about-h"
        className="grid max-w-[38rem] gap-2 text-[15px] text-ink-2"
      >
        <h2 id="about-h" className="caps text-[17px] text-ink">
          About HOSA Bayview
        </h2>
        <p>Made for the chapter by two of its members, Joseph &amp; Kaden.</p>
        <p>
          <IndependenceNote />
        </p>
        <p>
          Ideas, problems or a request about your data: <Mail />
        </p>
      </section>
    </div>
  );
}
