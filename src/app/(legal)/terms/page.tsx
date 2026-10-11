import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, LegalSection, List, Mail } from "@/components/legal-doc";
import { INDEPENDENCE_NOTE } from "@/lib/legal";
import { publicPage } from "@/lib/seo";

export const metadata: Metadata = publicPage({
  title: "Terms of use",
  description:
    "The rules for using HOSA Bayview, the chapter's study site: accounts, playing fair, what you post, and why study content is not medical advice.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of use"
      summary={[
        <>The site is for HOSA Bayview chapter members.</>,
        <>Be respectful, play fair and keep your password to yourself.</>,
        <>Study content can have mistakes, and it is not medical advice.</>,
        <>We&apos;re an independent student project, not run by HOSA.</>,
      ]}
    >
      <LegalSection id="about" title="About the site">
        <p>
          HOSA Bayview is a free study site for members of the HOSA Bayview
          chapter at Bayview Secondary School, built and run by two student
          members, Joseph &amp; Kaden. {INDEPENDENCE_NOTE} By making an account
          or using the site, you agree to these terms and to our{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection id="who" title="Who can use it">
        <List>
          {[
            <>
              Accounts are for chapter members. Executives can remove an account
              that doesn&apos;t belong.
            </>,
            <>
              You must be at least 13. If you&apos;re under 18, go over these
              terms with a parent or guardian.
            </>,
          ]}
        </List>
      </LegalSection>

      <LegalSection id="account" title="Your account">
        <List>
          {[
            <>Use your real name and one account.</>,
            <>
              Keep your password to yourself. What happens on your account is on
              you.
            </>,
            <>
              If you think someone else got into your account, change your
              password and email <Mail />.
            </>,
          ]}
        </List>
      </LegalSection>

      <LegalSection id="fair" title="Play fair">
        <List>
          {[
            <>
              Be respectful. No harassment, threats, hate, or sharing someone
              else&apos;s private information.
            </>,
            <>
              No cheating: don&apos;t share answers during a timed test, and
              don&apos;t use scripts, extra accounts or other tricks to farm
              points, answers or study time.
            </>,
            <>
              Don&apos;t try to get into accounts or records you aren&apos;t
              allowed to see, or load the site in ways that slow it down for
              everyone. Found a security problem? Email us instead of testing
              it.
            </>,
          ]}
        </List>
      </LegalSection>

      <LegalSection id="post" title="What you post">
        <List>
          {[
            <>
              You keep what you make. By sharing a deck, test, file or post with
              the chapter, you let members use it on the site to study, even
              after you leave.
            </>,
            <>
              Only post or upload what you&apos;re allowed to share with the
              chapter. Files can be up to 10 MB and profile pictures up to 2 MB.
            </>,
            <>Executives can remove anything that breaks these terms.</>,
          ]}
        </List>
      </LegalSection>

      <LegalSection id="medical" title="Not medical advice">
        <p>
          Questions, answers, flashcards and explanations here are written by
          students to practise for HOSA competitive events. They can have
          mistakes, and they are not official HOSA material. Nothing on this
          site is medical advice: don&apos;t use it to make decisions about
          anyone&apos;s health. For a health question, ask a doctor, nurse or
          pharmacist. In an emergency, call 911.
        </p>
      </LegalSection>

      <LegalSection id="points" title="Points and leaderboards">
        <p>
          Points, streaks and leaderboards are there to keep you going. They are
          not official results, and we may fix or remove points that come from a
          bug or from cheating.
        </p>
      </LegalSection>

      <LegalSection id="moderation" title="Warnings and bans">
        <p>
          Executives can warn members, remove content and ban accounts that
          break these terms. If you think a call was wrong, email <Mail />.
        </p>
      </LegalSection>

      <LegalSection id="service" title="The site itself">
        <p>
          The site is free and provided as it is. It can have bugs, go down,
          change or shut down, so keep your own copy of anything important. To
          the extent the law allows, we aren&apos;t responsible for losses from
          using it. Nothing here takes away rights you have under Ontario or
          Canadian law. These terms are governed by the laws of Ontario and of
          Canada.
        </p>
      </LegalSection>

      <LegalSection id="ending" title="Leaving">
        <p>
          You can stop using the site any time, and ask us to delete your
          account. We can suspend or delete an account that breaks these terms.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes">
        <p>
          When these terms change, we update the date at the top. If a change
          matters, we&apos;ll tell members in the app before it takes effect.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>
          Questions: <Mail />.
        </p>
      </LegalSection>
    </LegalDoc>
  );
}
