import type { Metadata } from "next";
import { JoinForm } from "@/components/join-form";
import { PageTitle } from "@/components/page-title";

export const metadata: Metadata = { title: "Join an event" };

export default function JoinPage() {
  return (
    <div className="grid grid-cols-1 gap-8">
      <PageTitle>Join an event</PageTitle>
      <section aria-label="Join code" className="grid gap-5 bg-field px-4 py-6 text-on-field sm:px-8 lg:py-8">
        <JoinForm />
      </section>
    </div>
  );
}
