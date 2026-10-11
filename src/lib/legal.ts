// Facts the terms, the privacy policy, the sign-up line, Settings and the sitemap share. When either document
// changes, change the date here and say what changed at the top of that page.
export const LEGAL_EFFECTIVE = "October 11, 2026";
// Midnight in Toronto on that day (EDT), for the sitemap.
export const LEGAL_EFFECTIVE_AT = "2026-10-11T00:00:00-04:00";
export const CONTACT_EMAIL = "josephislockedin@gmail.com";

// Privacy policy lines for features other work adds. Each flag must match this tree: src/app/(legal)/privacy's test
// fails when a flag is on without its table in supabase/migrations, or off with it. Flip a flag in the commit that
// brings its feature in, and change LEGAL_EFFECTIVE if the policy is already live.
//   phoneApp     push notifications (public.push_subscriptions, 0220), Settings > Phone app, install prompts
//   usageCounts  usage counts (public.analytics_events, 0230), kept 13 months
//   feedback     the Send feedback form (public.feedback, 0231)
export type PolicyCovers = {
  phoneApp: boolean;
  usageCounts: boolean;
  feedback: boolean;
};
export const POLICY_COVERS: PolicyCovers = {
  phoneApp: false,
  usageCounts: true,
  feedback: true,
};

export const HOSA_ORG = "HOSA-Future Health Professionals";
// Pages show it through <IndependenceNote> (src/components/legal-doc.tsx), which keeps the name from breaking at
// its hyphen; the JSON-LD uses the plain text.
export const INDEPENDENCE_NOTE = `HOSA Bayview is an independent study tool. It is not affiliated with or endorsed by ${HOSA_ORG}.`;
