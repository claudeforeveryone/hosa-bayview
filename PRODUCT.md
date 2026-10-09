# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 (App Router, TypeScript), Tailwind CSS v4, Supabase (auth, Postgres with RLS, storage), deployed on Vercel. Chosen by the user in the original spec.

## Users

- **Trainees:** high school members of HOSA Bayview (Bayview Secondary School) preparing for HOSA competitive events. Use it on their phones in spare moments (between classes, on the bus) for quick flashcard and question bursts, and in longer home study sessions for full practice tests, often on a laptop.
- **Trainers:** senior students (executive members and experienced competitors) who coach younger members. They set up a classroom per event, paste in past competition tests, build decks, and watch who is putting in the work.
- **Executives:** the chapter's student leadership. Oversee every classroom and member, assign roles, and track chapter-wide effort.

## Product Purpose

A chapter-run training platform, similar to Google Classroom, built around HOSA events. Members join event classrooms with a code, study flashcards, take timed or practice multiple-choice tests, and climb leaderboards. Success means members study more often and longer before competition, and trainers can see who is preparing.

## Positioning

Built for one chapter by its own members: classrooms map to HOSA events, tests come straight from pasted past competition papers, and effort (time, questions answered, accuracy) is visible chapter-wide to drive friendly competition.

## Operating Context

- Trainers copy-paste past competition tests in the common numbered format (`1. Question`, `A.`–`D.`, `Answer: B`) and fix parse errors in a preview.
- Leaderboards default to all time (Elo); today, week and month are one tap away in the period menu.
- Time on site is tracked by a heartbeat only while the tab is visible and the user is active.
- Planned later: weekly email reminders.

## Capabilities and Constraints

- Roles: Executive (full access), Trainer (own classrooms only), Trainee (joined classrooms). Enforced in Postgres RLS.
- Multiple choice only. Answer keys are never readable by trainees before submitting.
- Trainee flashcard decks are private by default, optionally shared to a classroom.
- Resources: links and uploaded files per classroom.
- Email confirmation is off at launch (Supabase default mailer is rate-limited).

## Brand Commitments

- Name: HOSA Bayview. Logo: tiger head inside a triangle with an ECG line, "HOSA BAYVIEW" wordmark, in a navy-on-ice and ice-on-navy version. Logo sits top left, fairly large.
- Two colour modes matching the logo versions.
- Voice: club-casual and competitive. Short, direct, some team energy ("You're #3 this week"), never cringe or corporate.
- Square corners, minimal, nothing that reads as a generic AI-built template.
- A tiny, low-contrast "made by J ♥" credit somewhere unobtrusive.

## Evidence on Hand

- Logo artwork provided by the user in chat; image files still to be added to `public/`.
- No real member data, tests, or stats yet. Demo seed data must be clearly fake and never presented as real chapter results.

## Product Principles

1. Effort is visible: every answered question and studied minute shows up somewhere the member can see it.
2. Fast on a phone: open, study, done in under a minute.
3. Trainers' time is precious: paste, fix, publish.
4. Fair numbers: stats can't be gamed by leaving a tab open or resubmitting.
5. Students run it: the tone is peer to peer, not teacher to student.

## Accessibility & Inclusion

High school users on a mix of phones and school laptops. Meet WCAG 2.1 AA contrast in both colour modes, full keyboard support for test-taking and flashcards, and respect reduced-motion.
