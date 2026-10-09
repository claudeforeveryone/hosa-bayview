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

## Phase 3: Testing
- [ ] Migration: `tests`, `questions`, `question_keys`, `attempts`, `attempt_answers`, RPCs `start_attempt`, `submit_attempt`, `get_attempt_review`
- [ ] `parse/questions.ts` + Vitest cases (messy pastes, `A)` vs `A.`, E options, explanations, missing answers)
- [ ] Paste import with editable preview
- [ ] Manual question CRUD with explanations
- [ ] Take test: timed (countdown, auto-submit) and practice
- [ ] Results page with correct answers + explanations; attempt history

## Phase 4: Flashcards
- [ ] Migration: `decks`, `cards`, `card_progress`, RLS
- [ ] `parse/cards.ts` + tests
- [ ] Deck CRUD, bulk paste, share toggle for trainee decks; add Decks to nav
- [ ] Study mode: flip, shuffle, known / still learning, filter to still learning

## Phase 5: Activity and leaderboards
- [ ] Migration: `activity_minutes`, `presence`, `heartbeat` RPC, `leaderboard(period, classroom)` RPC
- [ ] `useHeartbeat` hook (visible + not idle)
- [ ] Global leaderboard on Home (metric + week/month/all)
- [ ] Classroom leaderboard tab, who's online tab

## Phase 6: Executive dashboard, files, links
- [ ] Storage bucket `resources` + policies; `resources` table
- [ ] Resources tab: add link, upload file (≤ 10 MB), signed download, delete
- [ ] `/admin`: overview stats, users + role changer, all classrooms / tests / decks / resources; add Admin to nav

## Phase 7: Polish and ship
- [ ] Empty, loading, error states everywhere; a11y pass
- [ ] Profile page (name, password, my stats)
- [ ] `npm run seed` demo data
- [ ] README: setup, env vars, Supabase, Vercel, SMTP upgrade
- [ ] Vercel project linked to GitHub, env vars, Supabase redirect URLs, live check

## Phase 8 (later): Weekly email reminders
- [ ] Email provider (Resend) + custom SMTP for Supabase auth
- [ ] Vercel cron, weekly summary email per member, unsubscribe toggle on profile
