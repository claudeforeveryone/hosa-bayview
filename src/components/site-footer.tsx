import Link from "next/link";
import { Credit } from "@/components/credit";

// 44px tall on touch screens, tighter where there's a mouse. The underline thickens on hover, so the links work on
// any surface (ice ground, navy field) without a colour of their own.
const link =
  "inline-flex min-h-11 items-center underline underline-offset-4 hover:decoration-2 pointer-fine:min-h-8";

export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap items-center gap-x-5 ${className}`}>
      <li>
        <Link href="/terms" className={link}>
          Terms
        </Link>
      </li>
      <li>
        <Link href="/privacy" className={link}>
          Privacy
        </Link>
      </li>
    </ul>
  );
}

// The quiet foot of every page: Terms and Privacy, then the credit. In the app, the desktop sidebar's foot holds the
// credit (sticky, always in view), so creditInSidebar hides this one from lg up and the line never shows twice.
export function SiteFooter({
  className = "",
  creditInSidebar = false,
}: {
  className?: string;
  creditInSidebar?: boolean;
}) {
  return (
    <footer
      className={`flex flex-wrap items-center gap-x-6 text-[14px] ${className}`}
    >
      <nav aria-label="Legal">
        <LegalLinks />
      </nav>
      <Credit className={creditInSidebar ? "lg:hidden" : ""} />
    </footer>
  );
}
