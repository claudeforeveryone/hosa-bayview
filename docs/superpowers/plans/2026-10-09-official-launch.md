# Official Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get hosa-bayview ready for Bayview HOSA to run officially: 14 event classrooms filled with the Drive content and imported MC tests, a Skills section for practical events, a simpler nav with the event page as the hub, a member font picker, demo/test data gone, zero errors.

**Architecture:** Additive Supabase migration (classroom category, material sections, 50 MB files, skills table, storage usage RPC) plus UI changes on branch `official-launch`. Content goes in through one-off Node/Python tools in `D:\hosa-import\tools\` (outside the repo) using the service-role key from `.env.local`, driven by a reviewed manifest. The preview deploy shares the live Supabase project, so data work (cleanup, classrooms, imports) happens directly on live after the migration is applied; code merges to `main` only after the user checks the preview.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, Supabase (Postgres + RLS + Storage), vitest, zod, lucide-react. Python 3 (`python -I`) with python-docx, pdfplumber, python-pptx for extraction.

**Spec:** Design approved in chat on 2026-10-09 (user said "just go"). Decisions recorded under Global Constraints.

## Global Constraints

- Supabase project `vxlaswushshckxoblkyb` (hosa-bayview, ca-central-1), free plan: 1 GB storage, 50 MB per-file hard limit.
- Read `AGENTS.md` first: Next 16 breaking changes; docs live in `node_modules/next/dist/docs/`. `params`/`searchParams` are Promises. Server Actions default to a 1 MB body.
- Design rules from CLAUDE.md: square corners, no shadows, no gradients/glass, no emoji, hairline rules, mobile first. No em dashes in copy. Canadian spelling.
- Classrooms (exactly 14, `kind='class'`, owner = the first exec account, Joseph):
  - MC: Epidemiology, Human Growth and Development, Medical Terminology, Nutrition
  - Practical: Clinical Laboratory Science, Clinical Nursing, Dental Science, Forensic Science, Pharmacy Science, Sports Medicine, Veterinary Science
  - Showcase: Community Awareness, Mental Health Promotion, Public Health (no tests, no MC section)
- Delete existing classrooms "Medical Terminology" and "Forensic Science" (start fresh).
- Delete accounts: Demo Trainer + Demo Member (`@example.com`), TEST (`test@gmail.com`), and everything they own. Keep the three exec accounts (Joseph, Kaden, Bernice).
- No student names in titles/filenames shown on the site (e.g. "HOSA FLC NUTRITION 2025 - Mira Kuang" becomes "FLC Nutrition 2025"). Textbook author names may stay in a textbook's title. Strip "Copy of", "(1)", "Anna's Archive", trailing underscores. Fix `.pdf_` to `.pdf`.
- Files over 50 MB, the published textbooks, and the 3 videos are NOT uploaded: each becomes a placeholder material with `url` null-safe note "Link coming soon" in section "Textbooks" or "Videos". Personal contact sheets (Vet "Group Information.docx") are not uploaded.
- Imported MC tests: `is_published=false` (trainers review, then publish), `allow_practice=true`, `show_answers=true`. Title format: `<Source> <Year>` e.g. "FLC 2021", "Official Practice Test", "Unofficial Practice Exam 3". Tests without a trustworthy key are not imported as tests; their files stay as materials.
- Skills: never invent steps. Pharmacy gets its 7 skills with steps and points from `D:\hosa-import\inventory\skills.json`; Dental, Vet, Sports Medicine get skill names only with note "Steps: see the official HOSA guidelines".
- Trainers may upload only to classrooms they own (existing `can_post`), max 50 MB per file.
- Fonts: per-device like the rest of Look (localStorage via `src/lib/appearance.ts`).

## Review Focus

1. A member (not owner) opening a classroom must never see unpublished imported tests or answer keys. Test: SQL check in `supabase/tests/` as a trainee member.
2. Upload of a 49 MB file succeeds and a 51 MB file fails with a clear message, not a crash. Test in Task 2 (client-side size guard unit test + bucket limit check).
3. Classroom with zero materials / zero sections / zero skills renders a calm empty state, not a blank or error. Test in Task 3 render tests.
4. Font choice persists across reloads and does not flash the default font first (applied by `appearanceScript` before paint). Test in Task 5.
5. Deleting a classroom with uploaded files also removes the storage objects (existing `removeClassroomFiles`); sections must not break that path. Covered in Task 8 cleanup verification query.

---

### Task 1: Migration 0064 (category, sections, 50 MB, skills, storage usage)

**Files:**

- Create: `supabase/migrations/0064_official_launch.sql`
- Create: `supabase/tests/official_launch.sql`

**Produces:**

- `classrooms.category text check (category in ('mc','practical','showcase'))` nullable.
- `materials.section text` (nullable, 1-80 chars), index on `(classroom_id, section)`.
- `materials` size check raised to `<= 52428800`; `storage.buckets` `materials` `file_size_limit = 52428800`.
- Table `public.skills(id uuid pk default gen_random_uuid(), classroom_id uuid not null references classrooms on delete cascade, position int not null default 0, name text not null check (char_length(name) between 1 and 120), round text, steps jsonb not null default '[]' check (jsonb_typeof(steps)='array'), note text, created_by uuid default auth.uid() references profiles on delete set null, created_at timestamptz default now())`. RLS: select if `private.can_view_classroom(classroom_id)`; insert/update/delete if `private.can_manage_classroom(classroom_id)`. `steps` element shape: `{"text": string, "points"?: number}`.
- Function `public.storage_usage()` returns `table(bucket text, files bigint, bytes bigint)`, `security definer`, `set search_path = ''`, raises unless caller is executive (use the same exec check other exec RPCs use, see 0052 `private.is_exec` or equivalent; grep before writing).

- [ ] Step 1: Grep existing helpers (`can_view_classroom`, `can_manage_classroom`, exec check fn name, the materials size constraint name in 0052) so the migration references real names.
- [ ] Step 2: Write `supabase/tests/official_launch.sql` in the style of the other files there (rolled-back transaction, `set local role authenticated`, `request.jwt.claims`): asserts a non-member cannot select skills, a manager can insert a skill, `storage_usage()` raises for a trainee, bucket limit is 52428800.
- [ ] Step 3: Write the migration. Apply with Supabase MCP `apply_migration` (name `0064_official_launch`).
- [ ] Step 4: Run the SQL test via `execute_sql`; expect all asserts pass. Run `get_advisors` (security) and fix any new warning.
- [ ] Step 5: Commit `feat(db): categories, sections, skills, 50 MB files`.

### Task 2: Sections in Resources, one resource system

**Files:**

- Modify: `src/components/material-form.tsx` (add Section input with `<datalist>` of existing sections; client size guard 50 MB with message "Files can be up to 50 MB. Add big files as a link instead.")
- Modify: `src/lib/materials.ts` (size constant 50 MB; pure `groupBySection(items)` returning `{section: string|null, items}[]` sorted: named sections alphabetically by natural order, "Textbooks" and "Videos" last, null section first as "General")
- Modify: `src/app/(app)/library/actions.ts` (accept `section`, zod 1-80 optional, size limit), `src/app/(app)/c/[id]/resources/page.tsx` + `queries.ts` (render materials grouped by section with collapsible `<details>` per section showing count; remove the separate link-only `ResourceForm` block, links are added through MaterialForm which already supports URLs; keep topic weights)
- Modify: nav label "Library" -> "Resources" (route stays `/library`), page heading on `src/app/(app)/library/page.tsx`
- Test: `src/lib/materials.test.ts` (groupBySection ordering, size guard), existing tests still pass.
- Data: one SQL statement moves any rows in `resources` into `materials` (url rows, section null) — run in Task 8, not here.

- [ ] Step 1: Write failing tests for `groupBySection` and `MAX_MATERIAL_BYTES === 52428800`.
- [ ] Step 2: Implement; tests pass.
- [ ] Step 3: Wire section through form, action, queries, page. Placeholder materials (no file, no url) render as a muted row with their note ("Link coming soon").
- [ ] Step 4: `npm test`, `npm run lint`, `npx tsc --noEmit` pass.
- [ ] Step 5: Commit `feat: resource sections, 50 MB uploads, one resource list`.

### Task 3: Event page hub + Skills tab + category

**Files:**

- Modify: `src/app/(app)/c/[id]/page.tsx` (order: pinned + recent announcements; Resources preview = section list with counts linking to the Resources tab; Practice strip = published test count, deck count, skill count for practical; existing BoardView leaderboard stays last)
- Create: `src/app/(app)/c/[id]/skills/page.tsx`, `queries.ts`, `actions.ts`, `src/components/skill-editor.tsx` (manager form: name, round, steps textarea one per line, optional trailing `| 5` = points; pure parser `parseSteps(text)` in `src/lib/parse/steps.ts`), `src/components/skill-card.tsx` (ordered steps as a checklist with local-only checkboxes, total points if any, note)
- Modify: `src/components/classroom-tabs.tsx` (Skills tab only when `category === 'practical'`; hide Tests tab when `category === 'showcase'`)
- Modify: classroom create/settings forms and actions (`src/app/(app)/c/new/*`, `c/[id]/settings/*`) to set `category` (radio MC / Practical / Showcase)
- Test: `src/lib/parse/steps.test.ts`, render/logic tests for tab visibility helper `tabsFor(category, isManager)` in `src/lib/classroom-tabs.ts`

- [ ] Step 1: Failing tests: `parseSteps("Wash hands | 2\nDon gloves")` -> `[{text:"Wash hands",points:2},{text:"Don gloves"}]`; blank lines ignored; `tabsFor('showcase', false)` has no Tests and no Skills; `tabsFor('practical', false)` has Skills.
- [ ] Step 2: Implement helpers; tests pass.
- [ ] Step 3: Build pages and actions (actions call `requireProfile`; RLS is the real gate). Empty states: "No skills yet." with editor for managers.
- [ ] Step 4: Apply impeccable design pass on the hub and skills page (square, hairlines, existing tokens).
- [ ] Step 5: `npm test`, lint, tsc; commit `feat: event hub, skills tab, event categories`.

### Task 4: Simpler nav + Events page

**Files:**

- Modify: `src/components/nav.tsx` ITEMS: Home, Events (`/events`, icon `Grid2x2` or existing classroom icon), Announcements, Calendar, Resources (`/library`), Profile; `more`: Settings; exec: Members, Admin. Remove Leaderboard, Tests, Flashcards from nav (routes remain). BottomNav: Home, Events, News, Calendar, Profile.
- Create: `src/app/(app)/events/page.tsx` (my classrooms grouped MC / Practical / Showcase using `getMyClassrooms()` + category; join-with-code box; execs/trainers see "New event classroom")
- Modify: `src/lib/classrooms.ts` to return `category`
- Test: `src/lib/nav-items.test.ts` (or existing nav test) asserting the item list per role.

- [ ] Steps: failing nav test -> implement -> events page -> test/lint/tsc -> commit `feat: simpler nav and events page`.

### Task 5: Font picker

**Files:**

- Modify: `src/lib/appearance.ts` (add `font: 'default' | 'readable' | 'dyslexic'`, stored/validated like the others, applied as `data-font` on `<html>` by `appearanceScript`)
- Modify: `src/app/layout.tsx` (load Atkinson Hyperlegible and Lexend via `next/font/google` with `preload: false`, expose CSS vars)
- Modify: `src/app/globals.css` (`:root[data-font="readable"] { --font-sans: var(--font-atkinson) }`, `dyslexic` -> Lexend; display font follows)
- Modify: settings Look section component (radio: Default, Readable, Dyslexia-friendly, each label rendered in its own font)
- Test: `src/lib/appearance.test.ts` (invalid stored value falls back to default; script sets data-font)

- [ ] Steps: failing test -> implement -> settings UI -> test/lint/tsc/build -> commit `feat: member font choice`.

### Task 6: Exec storage meter

**Files:**

- Modify: `src/app/(app)/admin/page.tsx` (section "Storage": bar of used / 1 GB from `storage_usage()`, per bucket rows, warning text at 80%)
- Create: `src/lib/format-bytes.ts` + test
- [ ] Steps: failing format test -> implement -> admin section -> test/lint/tsc -> commit `feat: storage meter for execs`.

### Task 7: Content pipeline (outside repo)

**Files (all in `D:\hosa-import\tools\`):**

- `build_manifest.py`: walks the main download + the 7 new D: files (deduped by MD5), emits `D:\hosa-import\manifest.json` entries `{src, md5, event, category, section, title, action: upload|placeholder|skip, reason}`. Section = first subfolder under the event (cleaned, e.g. "Round 1 - MC", "Slideshows", "FLC 23-24"); files directly in the event folder get section null. Rules from Global Constraints for names/placeholders/skips.
- `upload.mjs`: reads manifest + `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`) via repo `node_modules/@supabase/supabase-js`; for each `upload` entry uploads to `materials/<classroom uuid>/<uuid>-<slug>.<ext>` and inserts a `materials` row (`title, section, path, file_name, size_bytes, mime, created_by=owner`); `placeholder` entries insert a row with no path/url and `note`. Idempotent by `(classroom_id, title, section)`. Writes `upload_log.json`.
- [ ] Step 1: Build manifest; print a summary per classroom (upload count/MB, placeholders, skips) and every renamed title. Grep titles for capitalised two-word person-name patterns and list them for review.
- [ ] Step 2: Controller reviews the summary before Task 8 runs uploads.

### Task 8: Live data: cleanup, classrooms, files, tests, skills

- [ ] Step 1: Snapshot counts (profiles, classrooms, tests, materials, storage objects).
- [ ] Step 2: Delete the 3 test accounts via the admin API (`auth.admin.deleteUser`) after removing their avatar files; delete the 2 old classrooms through the same cleanup the app uses (storage files first). Move remaining `resources` rows into `materials`.
- [ ] Step 3: Insert the 14 classrooms with category and owner.
- [ ] Step 4: Run `upload.mjs`; verify storage total < 700 MB and every manifest upload has a row.
- [ ] Step 5: MC tests: one subagent per event group converts each importable file listed in `D:\hosa-import\inventory\mc_inventory.json` into `D:\hosa-import\tests\<event>\<slug>.json` `{title, kind, source_file, questions:[{prompt, options[2-5], correct_index, explanation?}]}` reading the extracted text in `D:\hosa-import\work\` (and the key file / bold / colour markers). `validate_tests.py` checks shape, counts vs source, no empty options, key present for every question. `import_tests.mjs` inserts tests (unpublished) + questions + keys with the service role.
- [ ] Step 6: Insert skills from `skills.json` per Global Constraints.
- [ ] Step 7: Verification queries: per classroom counts; a trainee-role SQL check cannot read `question_keys` or unpublished tests; no orphan storage objects.

### Task 9: Verification and handoff

- [ ] `npm test`, `npm run lint`, `npm run build` all pass.
- [ ] Push branch, open PR, get the Vercel preview URL.
- [ ] webapp-testing (Playwright) on preview: login as exec, open every classroom, open a file, open a draft test, skills page, font switch, mobile width 390px; screenshot each.
- [ ] web-design-guidelines audit on changed pages; fix findings.
- [ ] `/adversarial-review` cold review of the full branch diff; fix until clean.
- [ ] Meeting walkthrough script `docs/trainer-exec-walkthrough.md` (30-45 min, every function, trainer and exec views) via pge-writing.
- [ ] Confirm exec login by email works (Kaden's report) and the login error says to use your email.
- [ ] Hand preview link to the user. Merge to `main` only after they say so.

---

## Additions (user, 2026-10-09 late)

Global additions:
- Every function must be usable by a trainer without help. Trainers and execs only manage their own stuff: trainers manage only classrooms they own (announcements, tests, decks, resources, skills, attendance); execs manage chapter-wide items and any classroom. Members manage nothing but their own profile and attempts.
- Never invent questions or answers. Only content from the provided files.
- Copy: no extra text, no filler, no AI-sounding phrases. Labels short.
- Motion must never glitch: no double entrances, no layout jump, respects prefers-reduced-motion.

### Task 10: Permission and security audit
- Enumerate every table, RPC, storage policy, and server action. For each: who can read, who can write. Write `supabase/tests/permissions_matrix.sql` asserting the matrix for roles executive / trainer-owner / trainer-non-owner / member / non-member / banned, covering announcements (chapter + classroom), tests, questions, question_keys, attempts, decks, cards, resources, materials (rows + storage objects), skills, attendance, events, elo tables, profiles, admin_log, notifications.
- Fix every hole found with a new migration. Server actions must re-check auth (direct POST). Run Supabase `get_advisors` security + performance; fix new warnings.
- Check: rate limits on join/passcode, no secrets in client bundles, signed URLs short-lived, input length caps.

### Task 11: Instant question adding
- Find why adding questions is slow (measure: per-question RPC loop? revalidation? large payload over 1 MB server-action limit?). Make paste-import one round trip (single RPC with a jsonb array), optimistic UI, live preview while typing, keyboard-first single question add (Enter to add option, Ctrl+Enter to save).
- Tests: parser edge cases, import of 300 questions in one call under a time budget.

### Task 12: ELO system audit
- Read every ELO path (match_results, elo_bonuses, elo_rolls, leaderboard). Write unit tests for the rating math (expected score, K factor, floors, ties, retakes, deleted tests, concurrent submits) and SQL tests for the RPCs. Fix bugs: no double counting, no farming by retaking practice, atomic updates, members cannot write ratings directly.

### Task 13: Chapter passcode shell
- `private.settings` key `chapter_passcode` (hashed, like the admin passcode). Null = no gate. When set, signup requires it (server-side check, rate limited). Exec can set or clear it in Admin. Signup form shows the field only when a gate is active.

### Task 14: Motion, sound, haptics
- Audit animations (review-animations, improve-animations); fix glitches (double entrances, flicker on navigation, layout shift).
- Add restrained feedback: short sound + haptic (`navigator.vibrate`) on answer reveal correct/incorrect in practice, flashcard flip, test submit. Setting in Look: Sound (off by default), Haptics (on by default, mobile only). Respect reduced motion. Tiny audio files generated in-repo (WebAudio synthesis, no external assets).

### Task 15: Polish pass
- impeccable audit + polish of every page a trainer or member sees, at 390px and desktop. Remove extra text. ai-slop-cleaner on the branch diff.

### Task 16: Trainer usability loop
- Playwright run as a trainer-owner on the preview: create announcement, add a resource file and link, add a section, add a test by paste and by single entry, publish it, take it as a member, view grades, run attendance, edit a skill. Fix every friction found, repeat until a full run has none.

### Task 17: Two guides (pptx in Downloads)
- `C:\Users\Educational PC\Downloads\HOSA Site - Trainer Guide.pptx` and `HOSA Site - Chapter Guide.pptx`, with real screenshots from the site (no names visible: use a clean demo classroom view or blur names), short text per slide.
