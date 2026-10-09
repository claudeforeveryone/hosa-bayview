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
- Filters: this week, this month, all time.

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
- Navigation: Home (global leaderboard + my classrooms), Classroom pages, Profile, Admin (executives only).
- Tiny, low-contrast "made by J ♥" in the footer. Should not be noticeable.

## Later
- Weekly email reminders (Phase 8). Needs a real email provider (e.g. Resend) and a Vercel cron.

## Security notes
- First executive: `private.settings.first_executive_email` promotes that address once, during its own sign-up (the auth server inserts the user, then confirms it in the same transaction while "Confirm email" is off), and only if no executive exists; the setting is then deleted. Confirming an older account later never promotes. With confirmation off, nothing proves who owns the inbox, so the owner must sign up with that address before anyone else. If "Confirm email" is on, promote the first executive by hand in the SQL editor.
- Profiles are deleted only by deleting the auth user (admin API); the last executive can't be demoted or deleted.
- DB checks: `supabase/tests/roles.sql` and `supabase/tests/classrooms.sql` (each runs in a rolled-back transaction, raises on failure). Unit tests: `npm test`.
- Threat model: users are vetted chapter members (selective HOSA application), not the open internet. Keep RLS and role checks strict, but skip anti-abuse work like IP throttling or multi-account brute-force defence. The per-account join-code limit (10 misses / 10 min) is enough; accepted by the owner.
- Join codes are readable only through `my_classrooms`/`classroom_detail` (managers only); the column is not granted on the table.
