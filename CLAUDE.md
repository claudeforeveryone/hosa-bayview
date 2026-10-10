@AGENTS.md

# HOSA Bayview training platform

Web app for HOSA Bayview, the HOSA chapter at Bayview Secondary School. HOSA is a health science competition organization with many competitive events. This is a training platform, similar to Google Classroom, where members study and practice for their events.

## How to work
- Build in phases (see PLAN.md). After each phase: run the app, test it, fix bugs, run /adversarial-review, commit and push.
- Use relevant skills (impeccable first for any UI, then frontend-design).
- UX matters as much as features: every screen needs sensible empty, loading, and error states, and must work one-handed on a phone.

## Tech stack
- Next.js 16 (App Router, TypeScript, `src/`), Tailwind CSS v4. Read `node_modules/next/dist/docs/` before using Next APIs; this version differs from older training data.
- Supabase for auth, Postgres, and file storage. `@supabase/ssr` for cookies.
- Roles enforced with Row Level Security in Postgres, not just hidden in the UI.
- Deploy target: Vercel (GitHub integration, push to `main` deploys). Repo: `idontreallyknow-20/hosa-bayview` (private).
- Migrations live in `supabase/migrations/` and are applied with the Supabase MCP.

## Authentication
- Sign up, log in, log out, and password reset with email and password. Email confirmation is OFF.
- New accounts default to Trainee. Executives can change any user's role.
- First Executive: `josephislockedin@gmail.com` (promoted automatically on sign-up via `private.settings`).

## Roles
1. Executive (admin): full access. Sees all users, trainers, trainees, classrooms, tests, flashcards, files, links, stats. Can change roles and edit or delete any content.
2. Trainer: creates and manages their own classrooms. Sees and manages only trainees in their own classrooms. Adds tests, flashcards, files, and links to their classrooms.
3. Trainee: joins classrooms with a join code. Studies flashcards, takes tests, creates own flashcards, views leaderboards.

## Global leaderboard (all of HOSA Bayview)
- Rankings: most time on site, most questions answered, most questions correct, accuracy.
- Filters: all time (default), today, this week, this month, in a dropdown beside the measure dropdown.

## Classrooms
- One per HOSA event. Trainers create with name, event, description, and get a join code.
- Trainees can be in multiple classrooms.
- Tabs: leaderboard (questions done, correct, accuracy, time), who's online, flashcards, tests, resources (links and files).

## Flashcards
- Trainers and trainees create decks. Trainer decks are shared with the classroom. Trainee decks are private by default, optional share to classroom.
- Study mode: flip, shuffle, mark known / still learning.
- Bulk add by pasting term and definition pairs.

## Testing
- Multiple choice only.
- Bulk import by pasting past competition tests:
  ```
  1. Question text?
  A. Option
  B. Option
  C. Option
  D. Option
  Answer: B
  ```
- Preview after parsing so the trainer can fix mistakes before saving.
- Manual add, edit, delete, with optional explanation per question.
- Modes: timed test and untimed practice. Auto grade server-side; show results with correct answers and explanations.
- Every attempt is saved and counts toward stats and leaderboards. Answer keys are never readable by trainees before they submit.

## Activity tracking
- Heartbeat once a minute while the tab is visible and the user isn't idle. Stored one row per user per minute so it can't be inflated.
- Questions answered and correct per user, per classroom.
- Online status for "who's online" (seen in last 2 minutes).

## Executive dashboard
- Chapter overview stats, manage users and roles, view and manage all classrooms, tests, flashcards, files, links.

## Design
- Matches the Bayview HOSA logo: tiger in a triangle with an ECG line, "HOSA BAYVIEW" wordmark.
- Two colour modes: light (pale ice-blue background, navy ink) and dark (deep navy `~#1E3D62` background, pale ice ink). Toggle in the header, defaults to system.
- Logo top left, fairly big.
- Minimal and flat: square corners everywhere, no shadows, gradients, glass, emoji, or icon-in-a-circle cards. No tell-tale AI template look. Hairline rules, tabular numerals for stats.
- Mobile first; students mostly use phones.
- Navigation: desktop navy sidebar (logo with the notification bell, Home, Leaderboard, Tests, Flashcards, Members, Profile, Settings, Admin for execs; a Chapter group with Announcements, Calendar, BLC, Library; your classrooms, join, new classroom); phones get a logo bar (bell, theme, menu), the same panel in a drawer, and a 5-item bottom bar. Every section is reachable from day one, never gated behind setup.
- Look settings (Settings > Look, saved per device in localStorage, applied before first paint by `appearanceScript`): mode, colour theme, highlight colour (`data-accent`), text size (`data-text`, zooms `#main`), motion (`data-motion="calm"` stops animation and the intro), and a reset.
- Footer credit: "Joseph Leung × Kaden Li" with a row of small hearts, low contrast (sidebar bottom on desktop, page foot on phones, auth pages).

## Admins
- Most people sign up as members (trainee). Admins (executives) either open "Signing up as an admin?" on the sign-up form and enter the chapter admin passcode (the action calls `claim_admin` right after `signUp`; a miss lands on Settings to retry), or enter it later in Settings. There are no preset or shared admin logins; the old preset exec accounts were retired in 0049. An executive sets/changes the passcode in Settings; only a bcrypt hash is stored (`private.settings.admin_passcode_hash`), 5 wrong tries per account per 10 min.
- Executives change anyone's role from /admin. Planned admins: Joseph Leung, Kaden Li, Bernice Au, Jenna Bae.
- Never create real accounts or handle real passwords on their behalf; they sign up themselves.

## Chapter-wide features (all events, not just MC)
- Notifications (0052): `notifications` rows written only by triggers (new announcement, event, published class test, trainer reply, role change, new competition), never by clients. Bell in the sidebar and phone bar polls `unread_notifications()`; opening /notifications calls `mark_notifications_read()`.
- Announcements (0052): `classroom_id` null = chapter-wide (/announcements, executives post, edit, pin); otherwise shown at the top of the classroom Board tab (the room's managers post). Posting notifies the audience.
- Calendar (0052): `events`, chapter (execs) or per class (its managers). /calendar lists coming up and past, grouped by Toronto day; Home shows the next 3 under "Coming up". Times are typed and shown in Toronto time (`src/lib/when.ts`).
- Library (0052): `materials` rows are a link or a file in the private `materials` bucket (`<classroom id>/...` or `chapter/...`, 50 MB, sections group files). /library is the chapter shelf (execs add); a classroom's Resources tab has a Files section. Uploads go browser to storage through a signed upload URL made with the user's own session (storage RLS applies); the bucket only accepts an allowlist of types (0057c), anything else goes up as octet-stream; the server checks the object exists and takes size and type from storage. Downloads are 1-hour signed URLs that force a download.
- BLC (0053, 0055, 0056): a mock competition is a classroom with `kind = 'competition'`, `opens_at`, `closes_at`. Every member can see it without a code; only execs create them. Upcoming: listed, tests hidden. Open: timed runs only, keys hidden. Closed: results board (`competition_results`), review and practice open up. /blc lists them, /blc/[id] runs them; execs manage tests at /c/[id]/tests.
- Admin log (0052): `admin_log`, filled by triggers on role, ban, title, warning, removal and passcode changes; executives read it on /admin. /admin also lists every classroom, test, deck and file with delete.
- Battles (0095-0097): live 1v1/2v2/3v3/Teams quiz rounds in MC and practical event rooms, on published tests with answers shown (not capped timed tests). Server-authoritative RPCs (`create_battle`, `join_battle(_code)`, `start_battle`, `answer_battle`, `advance_battle`, `battle_state`): 20 s rounds timed by `now()`, one answer per round, picks graded and the key shown only once a round closes, 100 + up to 50 speed points, 5 s reveal (the host can skip). No elo_events; wins are `battle_players.won`, read by `battle_wins`. Realtime: private channel `battle:<id>` (DB `realtime.send` 'sync' pokes + postgres_changes on `battle_rounds`), with a 3 s poll fallback. Entry points hide while the RPCs are missing (`src/lib/battles.ts` returns null). Tests: `supabase/tests/battles.sql`.
- Attendance, and weekly email updates trainers can edit (later, Phase 8).

## Later
- Weekly email reminders (Phase 8). Needs a real email provider (e.g. Resend) and a Vercel cron.

## Security notes
- First executive: `private.settings.first_executive_email` promotes that address once, during its own sign-up (the auth server inserts the user, then confirms it in the same transaction while "Confirm email" is off), and only if no executive exists; the setting is then deleted. Confirming an older account later never promotes. With confirmation off, nothing proves who owns the inbox, so the owner must sign up with that address before anyone else. If "Confirm email" is on, promote the first executive by hand in the SQL editor.
- Profiles are deleted only by deleting the auth user (admin API); the last executive can't be demoted or deleted.
- DB checks in `supabase/tests/` (roles, classrooms, admin_passcode, test_teaching, activity, chapter_tools and the rest; each runs in a rolled-back transaction and raises on failure). Run them with the Supabase MCP `execute_sql`. `chapter_tools.sql` covers 0050-0056.
- The Supabase MCP refuses DROP, DELETE and writes to `auth.*` in `apply_migration` (and DELETE in `execute_sql`); write migrations with CREATE OR REPLACE / ALTER POLICY.
- Banned members can still read rooms they belong to at the DB level (`can_view_classroom` has no ban check); the app sends them to /banned and the ban triggers block writes. Deleting a classroom (owner or /admin) removes its stored files first, while its managers still have storage access. Unit tests: `npm test`.
- Threat model: users are vetted chapter members (selective HOSA application), not the open internet. Keep RLS and role checks strict, but skip anti-abuse work like IP throttling or multi-account brute-force defence. The per-account join-code limit (10 misses / 10 min) is enough; accepted by the owner.
- Join codes are readable only through `my_classrooms`/`classroom_detail` (managers only); the column is not granted on the table.

## Deploy
- Vercel project `hosa-bayview` on the chapter account (josephislockedin@gmail.com, Hobby), linked to GitHub `idontreallyknow-20/hosa-bayview`. Push to `main` deploys to https://hosa-bayview.vercel.app.
- Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (all envs), NEXT_PUBLIC_SITE_URL (production).
- The old personal Vercel team (idontreallyknow-20's projects) is fair-use blocked; don't deploy there.
