-- The live app (main) still reads attempts.score straight off the table. Put the table-level SELECT back
-- until the official-launch build (which reads scores through attempt_list) is deployed; 0072 then
-- takes the score column away again.
grant select on public.attempts to authenticated;
