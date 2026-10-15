import Link from "next/link";
import {
  IndependenceNote,
  LegalDoc,
  LegalSection,
  List,
  Mail,
  SubList,
  Term,
} from "@/components/legal-doc";
import type { PolicyCovers } from "@/lib/legal";

// "a and b", or "a, b, and c" (items like "files and links" need that last comma), leaving out the parts that are off.
function series(parts: (string | false)[]) {
  const on = parts.filter((p): p is string => Boolean(p));
  if (on.length < 3) return on.join(" and ");
  return `${on.slice(0, -1).join(", ")}, and ${on[on.length - 1]}`;
}

// The privacy policy. `covers` says which features from other work are in this build (POLICY_COVERS in
// src/lib/legal.ts); their lines show only when they are, so the page describes what this build collects.
export function PrivacyPolicy({ covers }: { covers: PolicyCovers }) {
  const { phoneApp, usageCounts, feedback } = covers;
  return (
    <LegalDoc
      title="Privacy policy"
      summary={[
        <>
          We collect what the site needs to work: your account, your study
          activity and what you post.
        </>,
        <>No ads, no selling your information, no third-party trackers.</>,
        <>
          Your information is stored in Canada (Montreal). Our US-based
          providers may handle some of it, like server logs.
        </>,
        <>
          Other members can see your name, picture, grade and leaderboard
          numbers.
        </>,
        <>
          Trainers can see your results in the events they run. Executives can
          see your email address, all your results and your private decks.
        </>,
        <>
          To see, fix or delete your information, email <Mail />.
        </>,
      ]}
    >
      <LegalSection id="who" title="Who we are">
        <p>
          HOSA Bayview is a study site for members of the HOSA Bayview chapter
          at Bayview Secondary School in Ontario. Two student members, Joseph
          &amp; Kaden, built it and run it. <IndependenceNote />
        </p>
        <p>
          We try to follow the principles of Canada&apos;s privacy law (PIPEDA):
          collect only what we need, say why, keep it safe, and let you see and
          fix it.
        </p>
      </LegalSection>

      <LegalSection id="collect" title="What we collect">
        <List>
          {[
            <>
              <Term>Your account.</Term> Your name, email address and password.
              The password is stored scrambled (hashed) by our sign-in provider,
              so nobody can read it, us included. You can add a grade and a
              profile picture. You also have a role in the chapter (like member,
              trainer or executive) and sometimes a title.
            </>,
            <>
              <Term>Your studying.</Term> The tests and practice runs you start
              and finish, the answers you pick and your scores, flashcards you
              mark known or still learning, match-game times, questions you
              favourite or flag, and the points (Elo) you earn and why. The
              site&apos;s developers can set someone&apos;s Elo by hand; that
              change is kept with who made it.
            </>,
            <>
              <Term>Battles.</Term> The live quiz battles you join: your team,
              when you joined, left and were last seen, each answer you pick and
              when, its points, and whether you won.
            </>,
            <>
              <Term>Your study time.</Term> While the site is open and
              you&apos;re active, it checks in every 30 seconds. We keep one
              record per active minute (with the event room you were in), the
              days you signed in and studied, when you were last online, and how
              many clicks you made each minute. Only the number of clicks, never
              what you clicked.
            </>,
            <>
              <Term>Your announcements.</Term> Which announcements you marked
              read, and which you deleted from your list. Only you see these.
            </>,
            <>
              <Term>What you make or post.</Term>{" "}
              {series([
                "Flashcard decks, tests and questions",
                "announcements",
                "calendar events (including ones on your own calendar)",
                "files and links",
                "questions you send with Ask teacher",
                feedback && "feedback you send us",
              ])}
              .
            </>,
            <>
              <Term>Chapter records.</Term> Attendance (present or absent at
              each meeting) and attendance lists with names and grades. An
              executive may add your name to a list before you have an account.
              Warnings and bans, with the reason, and a log of role, title and
              ban changes. A warning an executive takes back stops showing to
              anyone but is kept until the account is deleted.
            </>,
            <>
              <Term>Notifications.</Term> The notices the site sends you. One
              you delete leaves your inbox for good, but we keep the notice
              itself until your account is deleted.
              {phoneApp ? (
                <>
                  {" "}
                  If you turn on notifications on a device, we store that
                  device&apos;s push address and keys from your browser, and
                  whether sound is on.
                </>
              ) : null}
            </>,
            ...(usageCounts
              ? [
                  <>
                    <Term>Usage counts.</Term>{" "}
                    {phoneApp
                      ? "A few actions, like opening a resource, finishing a flashcard round, installing the app or turning on notifications,"
                      : "A few actions, like opening a resource or finishing a flashcard round,"}{" "}
                    are counted with the time, your account ID and a short code
                    {phoneApp
                      ? " (like file or link, or Android or iPhone when you're offered the app or install it)"
                      : " (like file or link)"}
                    , so we know how many members use a feature. Never question
                    text, answers, anything you type, your IP address, or your
                    browser or device model.
                  </>,
                ]
              : []),
            <>
              <Term>Wrong codes.</Term> To stop guessing, each wrong event join
              code is logged with your account and the time. If the chapter
              turns on a sign-up code, each wrong one is logged with the time
              and a scrambled form of the IP address it came from.
            </>,
            <>
              <Term>On your device.</Term> Cookies that keep you signed in and
              remember the calendar view and your recent event rooms. Your
              Appearance and Sound settings are saved in your browser only.
            </>,
            <>
              <Term>Server logs.</Term> Our hosting providers keep standard logs
              of requests (including IP address and browser type) to run and
              protect the service.
            </>,
          ]}
        </List>
      </LegalSection>

      <LegalSection id="never" title="What we don't do">
        <List>
          {[
            <>No ads, and we never sell, rent or trade your information.</>,
            <>
              No third-party trackers or analytics scripts, such as Google
              Analytics or social media pixels. The site loads its scripts and
              fonts from its own address.
            </>,
            <>
              We don&apos;t ask for your location, contacts, camera or
              microphone.
            </>,
          ]}
        </List>
      </LegalSection>

      <LegalSection id="why" title="Why we use it">
        <p>
          To{" "}
          {series([
            "run your account and the site, show your progress and the leaderboards, let trainers and executives run events, tests and attendance, send you notices",
            "keep the site safe",
            usageCounts && "count usage so we know what to fix",
          ])}
          . Nothing else.
        </p>
      </LegalSection>

      <LegalSection id="see" title="Who can see it">
        <List>
          {[
            <>
              <Term>You</Term> can see your own account, results, decks and
              stats.
            </>,
            <>
              <Term>Every signed-in member</Term> can see:
              <SubList>
                {[
                  <>Your name, picture, grade, role and title</>,
                  <>
                    Your leaderboard and profile stats: time on site, flashcards
                    reviewed, questions answered, accuracy, points, streaks,
                    battles won, and your last five lucky bonuses and when you
                    got them
                  </>,
                  <>Your best match-game times on decks they can open</>,
                  <>When you&apos;re online in an event room you share</>,
                ]}
              </SubList>
              Flashcard decks you keep private are hidden from other members, and
              events on your own calendar are seen only by you.
            </>,
            <>
              <Term>In a battle</Term>, anyone who can open that event room sees
              the players&apos; names and teams, and once each round closes,
              every player&apos;s pick and points for it.
            </>,
            <>
              <Term>Trainers</Term> can see, for members of the events they run,
              their email address, test results and the answers they picked, the
              questions they flagged, and their attendance.
            </>,
            <>
              <Term>Executives</Term> can see every member&apos;s account
              (including email address), test results and the answers they
              picked, flashcard progress, flagged questions, warnings, every
              classroom and its attendance, the moderation log, and every test,
              deck and file, including what&apos;s inside private decks. They
              need this to run the chapter and moderate.
            </>,
            <>
              <Term>The people who run the site</Term> (Joseph &amp; Kaden) can
              see the database when looking after it, plus a usage page with
              member activity: time on site, clicks, questions answered and when
              people were last active. They can also open every event room and
              see what its members see there.
            </>,
            <>
              <Term>Our service providers.</Term> Supabase stores the database
              and files, handles sign-in and sends account emails like password
              resets. Vercel hosts the website and runs its server code.
              {phoneApp ? (
                <>
                  {" "}
                  If you turn on notifications, your browser&apos;s push service
                  (from Google, Apple, Mozilla or Microsoft) delivers them.
                </>
              ) : null}{" "}
              They handle your information only to provide their service.
            </>,
            <>We may also share information if the law requires it.</>,
          ]}
        </List>
      </LegalSection>

      <LegalSection id="where" title="Where it's stored">
        <p>
          The database, files and sign-in live in Supabase&apos;s Canada
          (Central) region in Montreal. The site&apos;s server code runs in
          Vercel&apos;s Montreal region. Pages are delivered through
          Vercel&apos;s worldwide network, and Supabase and Vercel are American
          companies, so some logs and support access may be outside Canada.
        </p>
      </LegalSection>

      <LegalSection id="keep" title="How long we keep it">
        <List>
          {[
            <>
              Your account and everything tied to it: until the account is
              deleted.
            </>,
            ...(usageCounts ? [<>Usage counts: 13 months.</>] : []),
            <>
              Wrong join codes and sign-up codes: we use them only to slow down
              guessing, and clear out old ones.
            </>,
            <>Server logs: on our providers&apos; own schedules.</>,
            <>
              When an account is deleted, its{" "}
              {series([
                "profile, results, battle picks, study time, notifications, announcement read marks, your own calendar events",
                phoneApp && "push addresses",
                usageCounts && "usage counts",
                feedback && "feedback",
                "warnings",
              ])}{" "}
              go with it. Its picture is erased too, usually straight away, and
              when we delete an account because you asked, we check that the
              picture is gone. Things you made, like announcements, tests,
              flashcard decks, files and calendar events, stay without your name
              on them unless you ask us to remove them too. Attendance lists
              keep the name as it was typed, and the moderation log keeps the
              names it recorded.
            </>,
          ]}
        </List>
      </LegalSection>

      <LegalSection id="safe" title="How we keep it safe">
        <p>
          Everything travels over HTTPS. Passwords are hashed. Database rules,
          checked on the server for every read and write, decide what each
          account can see or change, so the app can&apos;t show you more than
          your role allows. Files are private and open through links that
          expire.
        </p>
        <p>
          No system is perfect. If a breach could seriously harm you, we&apos;ll
          tell the members affected as soon as we can, and report it to the
          Office of the Privacy Commissioner of Canada where the law requires.
        </p>
      </LegalSection>

      <LegalSection id="choices" title="Your choices">
        <List>
          {[
            <>
              Change your name, grade, picture and password in Settings,
              Account.
            </>,
            phoneApp ? (
              <>
                Turn push notifications off in Settings, Phone app, or in your
                device&apos;s settings. Notices inside the site (the bell) stay
                on.
              </>
            ) : (
              <>Notices inside the site (the bell) can&apos;t be turned off.</>
            ),
            <>
              Ask for a copy of your information, ask us to correct it, or ask
              us to delete your account. Email <Mail /> from your account&apos;s
              email address. We&apos;ll check it&apos;s you and reply within 30
              days.
            </>,
            <>
              If you&apos;re not happy with our answer, you can complain to the{" "}
              <a
                href="https://www.priv.gc.ca/"
                className="underline underline-offset-4"
              >
                Office of the Privacy Commissioner of Canada
              </a>
              .
            </>,
          ]}
        </List>
      </LegalSection>

      <LegalSection id="minors" title="If you're under 18">
        <p>
          Most members are high school students, and many are under 18. If
          that&apos;s you, please go over this policy with a parent or guardian.
          A parent or guardian can email us to see or delete their child&apos;s
          information. The site is for members 13 and older: if we learn that
          someone under 13 made an account, we&apos;ll delete it.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes">
        <p>
          When this policy changes, we update the date at the top. If a change
          matters, we&apos;ll tell members in the app before it takes effect.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>
          Questions or requests: <Mail />. The rules for using the site are in
          the{" "}
          <Link href="/terms" className="underline underline-offset-4">
            Terms of use
          </Link>
          .
        </p>
      </LegalSection>
    </LegalDoc>
  );
}
