import type { Metadata } from "next";
import { POLICY_COVERS } from "@/lib/legal";
import { publicPage } from "@/lib/seo";
import { PrivacyPolicy } from "./policy";

export const metadata: Metadata = publicPage({
  title: "Privacy policy",
  description:
    "What HOSA Bayview collects, why, who can see it, where it's stored (Canada), how long we keep it, and how to get it corrected or deleted.",
  path: "/privacy",
});

// The text is in ./policy.tsx. It was checked against the migrations, the live database (tables, foreign keys,
// row-level security and the functions that decide who reads what, region) and the app code. If a feature starts
// collecting something new, or lets a role see more, add it there and change LEGAL_EFFECTIVE in src/lib/legal.ts.
// Push notifications, usage counts and the feedback form come from other work: their lines show only when
// POLICY_COVERS says they're in this build, and ./privacy.test.ts keeps those flags equal to supabase/migrations.
// Retention, wrong codes and deleted accounts' pictures: these lines promise no deadline, because the daily cron's
// housekeeping (/api/keepalive with 0250 and 0251) stays off until the owner approves it and HOUSEKEEPING=on is set in
// production. True today: join_classroom drops day-old wrong tries on the next wrong try. Removing an account in the
// app erases the profile's current picture straight away, but an upload never saved to the profile, or a failed
// erase, leaves a file (one did on 2026-10-09), so the page says "usually" and docs/DELETE_ACCOUNT.md checks the
// folder on every request. Once housekeeping runs in production, these may say "up to two days" and "within two
// days" (the Hobby cron fires anywhere in its hour, so runs can be 25 hours apart); change LEGAL_EFFECTIVE with them.
// Production runs on Vercel (vercel.json: Montreal, the cron). main also carries an OpenNext/Cloudflare setup
// (wrangler.toml): if production moves there, rewrite "Our service providers" and "Where it's stored", and give the
// cron a Cloudflare Cron Trigger.
export default function PrivacyPage() {
  return <PrivacyPolicy covers={POLICY_COVERS} />;
}
