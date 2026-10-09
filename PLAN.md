# Build plan

Each phase ends with: `npm run build`, `npm test`, browser check at phone width, /adversarial-review, fix, commit, push.

## Phase 0: Setup
- [x] Scaffold Next.js 16 + Tailwind v4 + TypeScript
- [x] CLAUDE.md (spec) and PLAN.md
- [ ] Supabase project `hosa-bayview` (ca-central-1), `.env.local`
- [ ] Private GitHub repo, first push
- [ ] Install `@supabase/ssr`, `@supabase/supabase-js`, `zod`, `vitest`

## Phase 1: Schema, auth, roles
- [ ] Migration: `profiles`, role enum, `private.settings` (first exec email), `handle_new_user` trigger, role-change guard trigger, helper fns (`is_executive`, `is_trainer`)
- [ ] Supabase clients: server, browser, admin (service role, server only)
- [ ] `src/proxy.ts` session refresh and route gating
- [ ] Pages: login, signup, forgot password, reset password, auth callback, logout action
- [ ] App shell: header with logo, nav, theme toggle, footer credit
- [ ] Verify: exec email becomes executive, others trainee, trainee can't change own role (SQL as role)

## Phase 2: Classrooms and join codes
- [ ] Migration: `classrooms`, `classroom_members`, `owns_classroom`, `is_member`, `can_view_classroom`, `join_classroom(code)` RPC, RLS
- [ ] Create / edit / delete classroom (trainer, exec), regenerate code
- [ ] Join by code on Home
- [ ] Classroom page with tabs: leaderboard, online, flashcards, tests, resources
- [ ] Members list with remove (trainer, exec)

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
- [ ] Deck CRUD, bulk paste, share toggle for trainee decks
- [ ] Study mode: flip, shuffle, known / still learning, filter to still learning

## Phase 5: Activity and leaderboards
- [ ] Migration: `activity_minutes`, `presence`, `heartbeat` RPC, `leaderboard(period, classroom)` RPC
- [ ] `useHeartbeat` hook (visible + not idle)
- [ ] Global leaderboard on Home (metric + week/month/all)
- [ ] Classroom leaderboard tab, who's online tab

## Phase 6: Executive dashboard, files, links
- [ ] Storage bucket `resources` + policies; `resources` table
- [ ] Resources tab: add link, upload file (≤ 10 MB), signed download, delete
- [ ] `/admin`: overview stats, users + role changer, all classrooms / tests / decks / resources

## Phase 7: Polish and ship
- [ ] Empty, loading, error states everywhere; a11y pass
- [ ] Profile page (name, password, my stats)
- [ ] `npm run seed` demo data
- [ ] README: setup, env vars, Supabase, Vercel, SMTP upgrade
- [ ] Vercel project linked to GitHub, env vars, Supabase redirect URLs, live check

## Phase 8 (later): Weekly email reminders
- [ ] Email provider (Resend) + custom SMTP for Supabase auth
- [ ] Vercel cron, weekly summary email per member, unsubscribe toggle on profile
