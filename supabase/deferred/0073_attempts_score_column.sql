-- Task 10 (audit M1), APPLY AFTER DEPLOY: run this only once the official-launch build is live.
-- That build reads scores through public.attempt_list (0067), which masks a hidden test's probe scores.
-- The older build on main reads attempts.score straight off the table, so applying this first would
-- break its test pages (0067b put the table SELECT back for that reason).
-- Check after applying: supabase/tests/attempts_score_column.sql.
revoke select on public.attempts from authenticated;
grant select (id, test_id, user_id, mode, started_at, deadline, submitted_at, total) on public.attempts to authenticated;
