import Link from "next/link";
import { Mail } from "lucide-react";
import { CONTACT_EMAIL } from "@/lib/legal";

const SUBJECT = encodeURIComponent("Forgot my HOSA Bayview password");
const BODY = encodeURIComponent(
  "Hi, I forgot my password. The email on my account is: \n\nMy name: ",
);

// Reset emails are off for now: Supabase's auth URL settings sent the link to localhost, and fixing that is a
// dashboard change. Until then members email the site's contact, who sorts it out by hand. requestReset in
// ../actions.ts still works; swap this back to a form that calls it once the dashboard is fixed.
export function ForgotForm() {
  return (
    <div className="grid gap-5">
      <h1 className="font-display text-44 leading-none font-bold uppercase">Forgot password?</h1>
      <p className="text-17">
        No problem. Email Joseph from the email on your account and he&rsquo;ll get you back in, usually
        within a day.
      </p>
      <a
        href={`mailto:${CONTACT_EMAIL}?subject=${SUBJECT}&body=${BODY}`}
        className="caps step press inline-flex h-12 w-full items-center justify-center gap-2 bg-ink px-6 text-17 text-ground hover:bg-ink-2"
      >
        <Mail size={20} strokeWidth={1.75} aria-hidden />
        Email Joseph
      </a>
      <p className="text-15 text-ink-2 [overflow-wrap:anywhere]">
        Or write to <span className="font-semibold text-ink">{CONTACT_EMAIL}</span> yourself.
      </p>
      <Link href="/login" className="text-16 underline">
        Back to log in
      </Link>
    </div>
  );
}
