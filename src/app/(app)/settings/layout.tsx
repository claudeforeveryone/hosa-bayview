import { IndependenceNote, Mail } from "@/components/legal-doc";

// Who built the site, shown under every Settings tab.
const CREDITS: { role: string; names: string[] }[] = [
  { role: "Main engineers", names: ["Joseph Leung", "Kaden Li"] },
  { role: "Contributors", names: ["Alvin Ip", "Jay Tong", "Robert Wang"] },
];

// The credits spot: a short About block under every Settings tab. A layout, so the Settings page itself is
// untouched. Terms, Privacy and the heart credit are in the footer right below, so they aren't repeated here.
export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-14">
      {children}
      <section
        aria-labelledby="about-h"
        className="grid max-w-[38rem] gap-2 text-15 text-ink-2"
      >
        <h2 id="about-h" className="caps text-17 text-ink">
          About HOSA Bayview
        </h2>
        <p>Made for the chapter by its own members.</p>
        <p>
          <IndependenceNote />
        </p>
        <p>
          Ideas, problems or a request about your data: <Mail />
        </p>
      </section>
      <section
        aria-labelledby="credits-h"
        className="grid max-w-[38rem] gap-4 border-[3px] border-ink p-5 sm:p-6"
      >
        <h2 id="credits-h" className="caps text-17">
          Credits
        </h2>
        {CREDITS.map((group) => (
          <div key={group.role} className="grid gap-1">
            <h3 className="caps text-14 text-ink-2">{group.role}</h3>
            <ul className="grid gap-0.5 text-17">
              {group.names.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
