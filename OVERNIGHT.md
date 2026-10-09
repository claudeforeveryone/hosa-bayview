# Overnight report, 9 Oct 2026

Everything below is on `main` and live at https://hosa-bayview.vercel.app (Vercel reported success for every push).
I pushed to main through the night because you asked to merge when done; that overrides the overnight
skill's local-only rule.

## For the exec demo

1. Open the site. The banner drops in, the original logo holds, shatters in 3D, "Shatter every limit"
   flips in beside the tiger, a heartbeat pulse runs under it, then it stays. It plays on every fresh load.
2. Sign in. Home shows the banner, your name, and an Elo-only leaderboard.
3. Classroom **Medical Terminology** (join code **GU8FN4**) is ready to show: a 15-question practice test
   with explanations, and a 24-card deck shared to the class. Real content, no fake scores.
4. Take the test: the question fills the screen. Practice shows right or wrong with the explanation as you go.
5. Open the deck: Study (cards turn over), Match, or copy it to your own decks.
6. Settings > Look: Light, Dark or Auto, and four colour themes (Bayview, Maroon, Forest, Graphite).
7. Members page: Instagram, Discord, and tap-to-copy email.

Talking point from research: HOSA's own FAQ says it has no practice tests for any event. This site fills that gap.

## What changed tonight

- **Banner:** in the page, not an overlay. On Home and the sign-in screen. Flat, no roll-up, real 3D depth,
  heartbeat trace from the logo's ECG. Hidden motion under reduced-motion.
- **Look settings:** Light / Dark / Auto (follows the phone, live) and 4 colour themes, each light and dark.
  All text pairs pass WCAG AA (checked by the reviewer; lowest 6.46:1).
- **Elo:** time no longer counts. Lucky bonuses land at random; test and flashcard rolls only pay after
  you actually did that today (0043), and banned members don't roll (0042). Flashcard rolls wait for the round to save.
- **Merged:** test settings, ask teacher, grades; deck copies and match bests; profile pictures (GIFs too),
  grade levels, warn/remove/ban; Members social links.
- **Simpler:** Home board is Elo only (full board keeps every measure); picture upload only in Settings;
  shorter hints; class tabs in order of use; the class header hides while taking a test.
- **Fixes from the bug sweeps:** big phone photos now work as pictures, the answers-off hint is accurate,
  banned members are told why they can't log in, other tabs pick up theme changes, Look radios work with
  arrow keys.

## How it was checked

- `npx tsc --noEmit`, `npm run lint`, `npm test` (262 passing), `npm run build`: all clean after the last change.
- Banner frames stepped in headless Chrome at 1280×800, 390×844 and 320×568.
- Walked the new-member path on a phone-sized screen against the live database with the test account:
  join with the code, open the class, practice test, results with explanations, grades, attendance,
  resources, deck, study, flip, leaderboard, menu, Settings > Look.
- Live sign-in page fetched after deploy: banner and heartbeat markup present.
- Cold reviews after each step; every finding fixed or noted below.

## Not checked

- Admin pages as an executive (no executive session here).
- A real iPhone/Safari: the 3D banner and logo masks were only seen in Chrome.
- Executive username sign-in on the live site (never sign in on production; SQL tests cover it).

## Needs you

- **Clean-up (question on Night Shift):** leftover test data on the live site: classrooms "test" and
  "Epidemology", test "Hi", decks "GGFRICKINGEZ" and "a" on Kaden's account, test accounts
  "Test Trainee" and "Tess Two". Nothing deleted, since it can't be undone. Say which to remove.
- **Demo sign-in:** admins' username sign-in only works while demo sign-in is on. Turning it off after
  the demo means admins sign in with email.
- **Old agent worktrees** in `.claude/worktrees` (all merged) slow the dev server; your safety hook
  blocked deleting them. A reviewer also left a scratch folder at `C:\Users\Public\hv`.
- **Demo classroom:** remove any time with `supabase/showcase/medical-terminology-remove.sql` (it only removes it once nobody is in it; Test Trainee joined it during testing).

## Ideas, not built (kept it simple)

From the research: spaced-repetition review of missed cards (Anki, Knowt), class announcements
(Google Classroom), and a "retry the ones I got wrong" button after a test. HOSA's 2026-27 national theme
is "Redefine the Standard!".
