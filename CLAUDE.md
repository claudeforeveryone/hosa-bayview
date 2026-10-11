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
- Deploy target: Vercel (GitHub integration, push to `main` deploys). Repo: `claudemaxforeveryone-hue/hosa-bayview` (moved from idontreallyknow-20 on 2026-10-10; old URLs redirect, idontreallyknow-20 keeps write access) (**public** since 2026-10-10, so cloud sessions on the shared Claude account can clone it). Everything committed is world-readable: secrets stay in Vercel/Supabase env, never in the repo, and new code comments name roles ("an executive"), not people or emails.
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
- Elo (0080-0083, 0105) is the sum of `elo_events` from 0, no base. Answers on published tests count for everyone (managers included): first answer to a question 2, +3 if right; answering it again 1, or 2 if right, once per question per Toronto day (`repeat`). Plus reviews, daily sign-in and lucky bonuses, scaled by the study streak multiplier.

## Executive dashboard

- Chapter overview stats, manage users and roles, view and manage all classrooms, tests, flashcards, files, links.

## Design

- Matches the Bayview HOSA logo: tiger in a triangle with an ECG line, "HOSA BAYVIEW" wordmark.
- Two colour modes: light (pale ice-blue background, navy ink) and dark (deep navy `~#1E3D62` background, pale ice ink). Toggle in the header, defaults to system.
- Logo top left, fairly big.
- Flat and bold: square corners (except the round notification badge), no shadows, gradients, glass or emoji. Members asked for less bland pages: boxed sections with 3px ink rules, solid lines only (never dashed), tabular numerals for stats.
- Mobile first; students mostly use phones.
- Navigation: desktop navy sidebar (logo with the notification bell; Home, Events, Career, Profile; collapsible Chapter group with Announcements, Calendar, Leaderboard, BLC, Resources; collapsible Your events; a More dropdown holds Settings, Attendance (execs), Help and Log out; Admin and Members for execs). "Join with a code" shows only to a non-exec in no event (otherwise it lives in Settings > Events). Phones get a logo bar (bell, theme, menu), the same panel in a drawer, and a bottom bar: Home, Events, Calendar, Profile, More (opens a sheet with every other page, the More items and Log out; /more still works as a page). Events opens a member's only event directly. Every section is reachable from day one, never gated behind setup.
- Settings has tabs (`?tab=appearance|sound|app|account|events`; the old `?tab=look` still opens Appearance; tab list in `src/lib/settings-tabs.ts`, rail on desktop, scrolling tab row on phones, where Phone app shows as "Phone"). Phone app: install steps for this device and the "Notifications on this device" switch (see Push below). Appearance (saved per device in localStorage, applied before first paint by `appearanceScript`, which with `AppearanceSync` also keeps every theme-color tag on the page's `--ground` so the installed app's status bar matches; `src/lib/pwa/theme-color.ts`): mode (Light/Dark/Device), colour theme or a custom hex, highlight colour or a custom hex (validated hex only; readable text colour picked by luminance), text size (`data-text` zooms `#main` but media is counter-zoomed), font (Default or Dyslexia-friendly), sidebar text case, and a reset. Sound tab: sound (default on), volume, notification sound, haptics. Motion follows the OS reduced-motion setting (a stored `data-motion="calm"` still works).
- Footer credit: "Joseph & Kaden" with one small heart, low contrast (sidebar bottom on desktop, page foot on phones, auth pages).

## Admins

- Everyone signs up as a member (trainee). Executive is given or removed only by the chapter leads, whose account ids are in `private.exec_granters` (0101, filled by hand in the SQL editor; no ids in the repo). Other executives can still switch people between trainee and trainer, but not touch executive. The admin passcode route is closed: `claim_admin` refuses, and the sign-up and Settings passcode UI is gone. GIF pictures are for the accounts in `private.gif_users` only (0101), whatever their role; `my_powers()` tells the UI what the viewer may do, `can_use_gif(uid)` and `gif_user_ids()` (execs) cover editing others. Executives listed in `private.gif_granters` (0108, filled by hand) get a GIFs on/off switch in the /admin person panel (`set_gif_user`, logged); `can_grant_gif()` tells the UI. Accounts in `private.locked_accounts` (0109, filled by hand) can't have their role or title changed from the site by anyone; only the SQL editor can.
- Chapter code (0090): when an executive sets one in Admin, sign-up needs it. `check_chapter_code(code, ip)` (10 misses per IP, 100 overall per 10 min) returns a single-use 15 min ticket that the BEFORE INSERT trigger on `auth.users` redeems; only a bcrypt hash is stored (`private.settings.chapter_passcode_hash`). No row = open sign-up. While a code is set, dashboard "Add user"/"Invite" are refused too: clear the code first. Tests: `supabase/tests/chapter_passcode.sql`.
- Executives change anyone's role from /admin. Planned admins: Joseph Leung, Kaden Li, Bernice Au, Jenna Bae.
- Never create real accounts or handle real passwords on their behalf; they sign up themselves.

## Chapter-wide features (all events, not just MC)

- Notifications (0052): `notifications` rows written only by triggers (new announcement, event, published class test, trainer reply, Ask teacher question to the room's owner or execs (0099), role change, new competition), never by clients. Bell in the sidebar and phone bar polls `unread_notifications()`; opening /notifications calls `mark_notifications_read()`.
- Push (0220-0221, Omega PWA track): every `notifications` row also goes out as a Web Push (VAPID, `web-push`). `push_subscriptions` (one row per browser endpoint; members read/delete their own, change only `sound`; written through `push_subscribe()`, which checks the push-service allowlist and returns the row id). A statement-level AFTER INSERT trigger on `notifications` queues rows in `private.push_outbox` for members with a device and pokes `/api/push/deliver` through pg_net; that route is public in `route-gate.ts` because the database has no session, and it is gated only by the `x-push-secret` header (`PUSH_INTERNAL_SECRET` in Vercel = vault secret `push_internal_secret`; no vault row means push is off and nothing is queued). The route claims with `push_claim` (3 min lease), sends (`src/lib/push/deliver.ts`), reports with `push_report`: 404/410 drops a device, 10 failures in a row too, and a 429/5xx/timeout keeps the notification queued for the devices that missed it (`delivered`, 5 tries, 1-4 min apart). pg_cron jobs `hosa-push-sweep` (every minute, re-pokes) and `hosa-push-history` (prunes cron history). Devices follow the session: the subscribe route keeps the row id in the HttpOnly `hosa-push-device` cookie, `logout()` deletes that row, password changes delete the member's other rows, `/login` unsubscribes the browser, and every signed-in page re-saves the device with its Notification sound setting (`usePushDeviceSync`). Service worker `public/sw.js` (offline page `/offline`, push and click handlers; bump `VERSION` when its precache changes). Tests: `supabase/tests/push.sql`, `src/lib/push/*.test.ts`.
- Announcements (0052): `classroom_id` null = chapter-wide (/announcements, executives post, edit, pin); otherwise shown at the top of the classroom Board tab (the room's managers post). Posting notifies the audience.
- Calendar (0052): `events`, chapter (execs) or per class (its managers). /calendar is a month grid (`?m=YYYY-MM`, date math in `src/lib/calendar-grid.ts`): hover a day for its events, click for a dialog with details and edit/delete; phones also get the month as a list; Home shows the next 3 under "Coming up". Times are typed and shown in Toronto time (`src/lib/when.ts`).
- Weekly attendance tracker (0103), the chapter's paper sheet live: `roster_members` (names per class with grade and position; `user_id` set by a trigger when exactly one profile has the name, never by clients), `roster_weeks` (chapter-wide meeting dates = columns), `roster_marks` (one row per name per date, `present`, stamped `marked_by`), `classrooms.short_code` ("FS", execs only via trigger). RLS: a class's managers and execs read/write its names and marks; dates readable by trainers/execs, written by execs. /admin/attendance tabs: All events (default; every event's names for one meeting, one-tap Present / Not present, Mark all present, `?week=`), Season sheet (`?view=grid&class=<id>`, sticky-name grid with row/column totals and Manage roster), Reports (the older weekly-roll views). Managers also get the sheet on their class's Attendance tab. Linked from /admin, More and Settings > Events for execs. Names were loaded straight into the live DB and are never committed. Logic: `src/lib/roster.ts`; tests: `supabase/tests/attendance_roster.sql`.
- Library (0052): `materials` rows are a link or a file in the private `materials` bucket (`<classroom id>/...` or `chapter/...`, 10 MB, links first, sections group files). /library is the chapter shelf (execs add); a classroom's Resources tab has a Files section. Uploads go browser to storage through a signed upload URL made with the user's own session (storage RLS applies); the bucket only accepts an allowlist of types (0057c), anything else goes up as octet-stream; the server checks the object exists and takes size and type from storage. Downloads are 1-hour signed URLs that force a download.
- BLC (0053, 0055, 0056): a mock competition is a classroom with `kind = 'competition'`, `opens_at`, `closes_at`. Every member can see it without a code; only execs create them. Upcoming: listed, tests hidden. Open: timed runs only, keys hidden. Closed: results board (`competition_results`), review and practice open up. /blc lists them, /blc/[id] runs them; execs manage tests at /c/[id]/tests.
- Admin log (0052): `admin_log`, filled by triggers on role, ban, title, warning, removal and passcode changes; executives read it on /admin. /admin also lists every classroom, test, deck and file with delete.
- Battles (0095-0098): live 1v1/2v2/3v3/Teams quiz rounds in MC and practical event rooms, on published tests with answers shown (not capped timed tests). Server-authoritative RPCs (`create_battle`, `join_battle(_code)`, `start_battle`, `answer_battle`, `advance_battle(bid, round, step)`, `battle_ping`, `battle_state`): 20 s rounds timed by `now()` plus a 1.5 s grace for answers in flight, one answer per round, picks graded and the key shown only once a round closes, 100 + up to 50 speed points, 5 s reveal (only the host's Next skips it; `advance_battle` ignores a stale round or step). Players not seen for 15 s don't hold up a round. `battle_rounds.question_id` isn't granted to clients, and 0098 hides a live round's key from practice (`answer_question`, `attempt_sheet`, `attempt_questions`, `career`, `score_visible`). No elo_events; wins are `battle_players.won` (only when everyone answered at least half), read by `battle_wins`. Idle 30 min = ended. Realtime: private channel `battle:<id>` (broadcast pokes only: one `realtime.send` 'sync' per RPC; no battle table is in the `supabase_realtime` publication, clients read state through `battle_state`), polling 10 s while connected, 3 s when not. Entry points hide while the RPCs are missing (`src/lib/battles.ts` returns null). Tests: `supabase/tests/battles.sql`.
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

- Vercel project `hosa-bayview` on the chapter account (josephislockedin@gmail.com, Hobby), linked to GitHub `claudemaxforeveryone-hue/hosa-bayview` (Vercel GitHub app installed on claudemaxforeveryone-hue and the project reconnected on 2026-10-10; pushes deploy again). `CRON_SECRET` is set in Vercel (Production); without it `/api/keepalive` returns 503. Push to `main` deploys to https://hosa-bayview.vercel.app.
- Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (all envs), NEXT_PUBLIC_SITE_URL (production). Push (production; all four or push stays off): NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_INTERNAL_SECRET (same value as the vault secret `push_internal_secret`). A change to the public key needs a redeploy.
- The old personal Vercel team (idontreallyknow-20's projects) is fair-use blocked; don't deploy there.
- Supabase: project `vxlaswushshckxoblkyb`, org "claudemaxforeveryone-hue's Org" (Free; moved from org "chess" by project transfer on 2026-10-10, same ref, URL and keys), ca-central-1, Postgres 17.

## Moving Supabase to the other account

Done 2026-10-10 by project transfer, not a copy: the same project now lives in the other account's org, so nothing in Vercel changed. See `docs/MIGRATION.md`.
