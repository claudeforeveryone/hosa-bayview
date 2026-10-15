import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { SendFeedback } from "@/components/send-feedback";
import { requireProfile } from "@/lib/auth";
import { CONTACT_EMAIL } from "@/lib/legal";
import { feedbackEnabled } from "@/lib/feedback-enabled";
import { FEEDBACK_DESCRIPTION } from "@/lib/owner-metrics";

export const metadata: Metadata = { title: "Send feedback" };

// Send feedback on its own page (it used to be a section at the foot of Settings > Account, so the More link
// dropped members into Settings). Email comes first, for anything, urgent or not (the owner's ask: he replies to
// every email). The form under it goes to the owner console's queue, and shows once the database has it.
export default async function FeedbackPage() {
  const [, enabled] = await Promise.all([
    requireProfile(),
    feedbackEnabled().catch(() => false),
  ]);
  return (
    <div className="grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-8">
      <PageTitle meta="Bugs, ideas, anything">Send feedback</PageTitle>
      <section
        aria-labelledby="feedback-email-h"
        className="grid border-[3px] border-ink"
      >
        <div className="bg-field px-4 py-4 text-on-field sm:px-6">
          <h2
            id="feedback-email-h"
            className="font-display text-[clamp(1.6rem,5vw,2.2rem)] leading-none font-bold uppercase"
          >
            Email Joseph
          </h2>
          <p className="mt-2 max-w-[60ch] text-16 text-on-field-2">
            The quickest way to reach us, for anything: a bug, an idea, a question, or just what you think of the
            site. It doesn&apos;t have to be urgent. Every email gets a reply, usually within 12 hours.
          </p>
        </div>
        <div className="grid gap-3 px-4 py-6 sm:px-6">
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("HOSA Bayview feedback")}`}
            className="caps step press inline-flex h-12 w-full items-center justify-center gap-2 bg-ink px-6 text-17 text-ground hover:bg-ink-2 sm:w-auto sm:justify-self-start"
          >
            <Mail size={20} strokeWidth={1.75} aria-hidden />
            Write an email
          </a>
          <p className="max-w-[60ch] text-15 text-ink-2">
            Or write to{" "}
            <span className="font-semibold break-all text-ink">{CONTACT_EMAIL}</span>. For a bug, say what you
            tapped, what you expected and what happened.
          </p>
        </div>
      </section>
      {enabled ? (
        <section
          aria-labelledby="feedback-form-h"
          className="grid gap-4 border-[3px] border-ink px-4 py-5 sm:px-6"
        >
          <div>
            <h2
              id="feedback-form-h"
              className="font-display text-[clamp(1.4rem,4.5vw,1.9rem)] leading-none font-bold uppercase"
            >
              Or leave a note here
            </h2>
            <p className="mt-2 max-w-[60ch] text-16 text-ink-2">
              {FEEDBACK_DESCRIPTION}
            </p>
          </div>
          <SendFeedback />
        </section>
      ) : null}
    </div>
  );
}
