import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageTitle } from "@/components/page-title";
import { SendFeedback } from "@/components/send-feedback";
import { requireProfile } from "@/lib/auth";
import { CONTACT_EMAIL } from "@/lib/legal";
import { feedbackEnabled } from "@/lib/feedback-enabled";
import { FEEDBACK_DESCRIPTION } from "@/lib/owner-metrics";

export const metadata: Metadata = { title: "Send feedback" };

// Send feedback on its own page (it used to be a section at the foot of Settings > Account, so the More link
// dropped members into Settings). The form is the same one; it goes to the owner console's queue. Something that
// can't wait goes by email instead, from the box under the form (shown even before the form is switched on).
export default async function FeedbackPage() {
  const [, enabled] = await Promise.all([
    requireProfile(),
    feedbackEnabled().catch(() => false),
  ]);
  return (
    <div className="grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-8">
      <PageTitle meta="Bugs, ideas, anything">Send feedback</PageTitle>
      {enabled ? (
        <section
          aria-labelledby="feedback-form-h"
          className="grid border-[3px] border-ink"
        >
          <div className="bg-field px-4 py-4 text-on-field sm:px-6">
            <h2
              id="feedback-form-h"
              className="font-display text-[clamp(1.6rem,5vw,2.2rem)] leading-none font-bold uppercase"
            >
              Tell us what you think
            </h2>
            <p className="mt-2 max-w-[60ch] text-16 text-on-field-2">
              {FEEDBACK_DESCRIPTION}
            </p>
          </div>
          <div className="px-4 py-6 sm:px-6">
            <SendFeedback />
          </div>
        </section>
      ) : (
        <EmptyState title="Feedback isn't open yet">
          The feedback form switches on once the site&apos;s database has it.
        </EmptyState>
      )}
      <section
        aria-labelledby="feedback-urgent-h"
        className="grid gap-3 border-[3px] border-ink px-4 py-5 sm:px-6"
      >
        <h2
          id="feedback-urgent-h"
          className="font-display text-[clamp(1.4rem,4.5vw,1.9rem)] leading-none font-bold uppercase"
        >
          Urgent? Email it
        </h2>
        <p className="max-w-[60ch] text-16 text-ink-2">
          Something broken that stops you studying, or that needs fixing fast? Email your bug to{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Urgent bug: HOSA Bayview")}`}
            className="font-semibold break-all text-ink underline underline-offset-4"
          >
            {CONTACT_EMAIL}
          </a>
          . Say what you tapped, what you expected and what happened. You&apos;ll hear back within 12 hours.
        </p>
      </section>
    </div>
  );
}
