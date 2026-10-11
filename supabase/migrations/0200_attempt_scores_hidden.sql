-- Omega security 0200 (audit H1, applies the deferred 0073). A trainee could read attempts.score straight off the
-- table for their own runs, and answer one question, submit, and read 0 or 1 back: an answer-key oracle.
-- Scores now come only through the RPCs that mask hidden-answer probe scores (attempt_list, test_results, 0067/0074).
-- Safe to apply now: origin/main reads attempts with select id only (career/actions.ts, lib/tests.ts countAttempts),
-- and no invoker function or view reads attempts.score. The column list below is the live table minus score.
revoke select on public.attempts from authenticated;
grant select (id, test_id, user_id, mode, started_at, deadline, submitted_at, total, counts) on public.attempts to authenticated;
