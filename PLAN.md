# Build plan

Each phase ends with: `npm run build`, `npm test`, browser check at phone width, /adversarial-review, fix, commit, push.

## Phase 0: Setup
- [x] Scaffold Next.js 16 + Tailwind v4 + TypeScript
- [x] CLAUDE.md (spec) and PLAN.md
- [x] Supabase project `hosa-bayview` (ca-central-1), `.env.local`
- [x] Private GitHub repo, first push
- [x] Install `@supabase/ssr`, `@supabase/supabase-js`, `zod`, `vitest`, `lucide-react`

## Phase 1: Schema, auth, roles
- [x] Migrations 0001-0005: `profiles`, role enum, `private.settings` (first exec email), signup trigger, one-shot first-exec promotion, role/last-exec guards, email sync, helpers (`is_executive`, `can_teach`)
- [x] Supabase clients: server, browser, admin (service role, server only)
- [x] `src/proxy.ts` session refresh and route gating
- [x] Pages: login, signup, forgot password, reset password, auth callback, logout action
- [x] App shell: header with logo, nav, theme toggle, footer credit
- [x] Verify: `supabase/tests/roles.sql` (30 checks) + `npm test` (42 unit tests); 5 adversarial review rounds, last one clean

## Phase 1.5: Brand and deploy pipeline
- [x] Replace placeholder logo with the official Bayview HOSA logo (one alpha mask, tinted per theme)
- [x] Vercel project linked to GitHub with env vars; push to `main` deploys (hosa-bayview.vercel.app)
- [ ] Supabase Site URL + redirect URLs for hosa-bayview.vercel.app (needed for password reset emails)

## Phase 2: Classrooms and join codes
- [x] Migration: `classrooms`, `classroom_members`, `owns_classroom`, `is_member`, `can_view_classroom`, `join_classroom(code)` RPC, RLS
- [x] Create / edit / delete classroom (trainer, exec), regenerate code
- [x] Join by code on Home
- [x] Classroom page with tabs: leaderboard, online, flashcards, tests, resources
- [x] Members list with remove (trainer, exec)

## Phase 2.5: App shell
- [x] Desktop sidebar (logo, nav, your classrooms, join, new classroom), phone drawer + bottom nav
- [x] Every section reachable from day one: Tests, Flashcards, Leaderboard, Join, Admin (execs) pages
- [x] Credit: Joseph Leung x Kaden Li with hearts

## Phase 2.6: Admin access
- [x] Admin sign-up path: "Admin" on sign-up, chapter passcode (hashed, set by an exec) makes the account an executive
- [x] Admin panel: overview counts, people list, role switch with confirm
- [x] Settings page (name, password; members: claim admin; execs: set admin passcode)

## Phase 3: Testing
- [x] Migration 0013: `tests`, `questions`, `question_keys`, `attempts`, `attempt_answers`, RPCs (save/import/delete question, start/answer/submit attempt, attempt_sheet, classroom_tests, test_results)
- [x] `parse/questions.ts` + Vitest cases (messy pastes, `A)` vs `A.`, E options, explanations, missing answers)
- [x] SQL checks for the tests RPCs (`supabase/tests/test_teaching.sql`, `test_results.sql`)
- [x] Question builder: type the question, the right answer, then the other choices (add/remove), explanation; edit/delete
- [x] Paste import (past BLC / competition questions) with editable preview
- [x] Take test: timed (countdown, auto-submit) and practice; shuffle questions and choices
- [x] Results page with correct answers + explanations; attempt history; trainer results

## Phase 4: Flashcards
- [x] Migration: `decks` (classroom decks by trainers; private trainee decks, shareable to a classroom or to people), `cards`, `card_reviews`
- [x] `parse/cards.ts` + tests; deck CRUD, bulk paste
- [x] Study mode: flip, shuffle, known / still learning
- [x] Match mode: match terms to definitions against the clock

## Phase 5: Activity, Elo, leaderboards
- [x] Migration: `activity_minutes` (heartbeat, one row per user-minute), `presence`, streak days
- [x] Elo (the one score): starts at 100, grows from time spent + flashcards reviewed + questions done (accuracy counts), streaks multiply it
- [x] Home: club leaderboard by hours, toggle to flashcards reviewed / questions done / accuracy / Elo; "Members online N" top right
- [x] Classroom Leaderboard tab with the same toggles; who's online tab

## Phase 6: Members, profiles, career
- [x] Members directory: everyone in HOSA Bayview, with search
- [x] Profile page per member: Elo, streak, hours, cards, questions, accuracy by classroom/event. Keep it simple: plain stat rows, no charts or flourishes
- [x] Career section: every question you got right and wrong (with the answer), Elo history, your rank

## Phase 6.5: Resources and attendance
- [x] Resources tab: links (and files), trainers add/edit/delete
- [x] Event breakdown: trainers set the % weight of each topic for the event, shown on the Resources tab
- [x] Attendance: trainers take and save attendance per session for their classroom; members see their own record
- [x] Admin tab (execs only): all attendance across classrooms, all classrooms/tests/decks/resources

## Phase 7: Polish and ship
- [ ] Empty, loading, error states everywhere; a11y pass
- [ ] `npm run seed` demo data (local only)
- [ ] README: setup, env vars, Supabase, Vercel, SMTP upgrade
- [ ] Live check on hosa-bayview.vercel.app

## Phase 7.5: Chapter-wide (all events, not just MC)
- [x] Announcements per classroom and chapter-wide, written and edited by trainers / execs
- [x] Notifications in the app (new test, announcement, attendance)
- [x] BLC: run mock competitions online (timed test window, chapter ranking); execs can spin up as many as they want (0053, 0055, 0056; /blc)
- [x] Calendar: chapter and class events, "Coming up" on Home (0052; /calendar)
- [x] Library: chapter files and links, class files on Resources, private bucket with signed URLs (0052; /library)
- [x] Admin log and content lists with delete on /admin (0052)
- [x] Optional admin passcode on sign-up; preset exec logins retired (0049)
- [x] Settings > Look: highlight colour, text size, calm motion, reset
- [x] SQL checks for 0050-0056 (`supabase/tests/chapter_tools.sql`)

## Phase 8 (later): Weekly email updates
- [ ] Weekly email = that week's announcements + your progress; trainers can edit before it sends
- [ ] Email provider (Resend) + custom SMTP for Supabase auth
- [ ] Vercel cron, weekly summary email per member, unsubscribe toggle on profile
