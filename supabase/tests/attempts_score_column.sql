-- Migration 0073 (apply after the official-launch deploy): attempts.score is not readable off the table,
-- only through attempt_list, which masks hidden-answer probe scores. Rolled back; raises on failure.
begin;

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  execute 'select score from public.attempts limit 1';
  raise exception 'FAIL attempts.score is still readable by authenticated' using errcode = 'XX001';
exception when insufficient_privilege then
  null;
end $$;
do $$
begin
  perform id, test_id, user_id, mode, started_at, deadline, submitted_at, total from public.attempts limit 1;
end $$;
reset role;

select 'attempts_score_column: all checks passed' as result;
rollback;
