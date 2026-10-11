-- Omega security checks for migrations 0200-0203 (audit H1, M1, M4, M7). Runs as postgres, impersonates anon, a
-- trainee (the QA account, not an owner) and an executive (Joseph's account, looked up by uid prefix, read only).
-- Everything happens in one transaction that rolls back. Raises if any check fails.
begin;

create temp table _s (test text, result text, pass boolean);
grant all on _s to anon, authenticated;

-- expect(label, sql, sqlstate): runs sql as the current role and records whether it failed with that code.
-- An empty sqlstate means the statement must succeed.
create function pg_temp.expect(label text, stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  insert into _s values (label, 'no error', state = '');
exception when others then
  insert into _s values (label, sqlstate || ' ' || sqlerrm, sqlstate = state);
end $$;
grant execute on function pg_temp.expect(text, text, text) to anon, authenticated;

-- Resolve the executive by uid prefix (read only). Fails the run if the account is not an executive.
create temp table _who as
  select p.id as exec_id from public.profiles p where p.role = 'executive' and p.id::text like 'ca22ffa8%';
insert into _s select 'executive account is an executive', count(*)::text, count(*) = 1 from _who;
grant select on _who to anon, authenticated;

-- ---- anon -------------------------------------------------------------------------------------------------------
set local role anon;
select pg_temp.expect('anon cannot read attempts', 'select id from public.attempts limit 1', '42501');
select pg_temp.expect('anon cannot read attempts.score', 'select score from public.attempts limit 1', '42501');
select pg_temp.expect('anon cannot call member_directory', 'select * from public.member_directory()', '42501');
select pg_temp.expect('anon cannot call gif_exempt_ids', 'select * from public.gif_exempt_ids()', '42501');
reset role;

-- ---- trainee (QA account) ----------------------------------------------------------------------------------------
insert into _s select 'QA account is a trainee', role::text, role = 'trainee'
  from public.profiles where id = '0e14252b-0c85-4665-a430-2ca95023be6f';
select set_config('request.jwt.claims', json_build_object('sub', '0e14252b-0c85-4665-a430-2ca95023be6f', 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.expect('trainee cannot read attempts.score (H1)', 'select score from public.attempts limit 1', '42501');
select pg_temp.expect('trainee cannot select * from attempts (H1)', 'select * from public.attempts limit 1', '42501');
select pg_temp.expect('trainee can read the non-score attempt columns', 'select id, test_id, user_id, mode, started_at, deadline, submitted_at, total, counts from public.attempts limit 1', '');
select pg_temp.expect('trainee cannot insert a profile (M7)', 'insert into public.profiles (id, full_name) values (gen_random_uuid(), ''x'')', '42501');
select pg_temp.expect('trainee cannot delete a profile (M7)', 'delete from public.profiles where false', '42501');
select pg_temp.expect('trainee cannot run the email first-exec bootstrap (M1)', 'select private.maybe_promote_first_exec(gen_random_uuid(), ''x@example.com'', true)', '42501');
insert into _s select 'trainee gets false for can_use_gif(executive) (M4)', coalesce(public.can_use_gif((select exec_id from _who)), false)::text,
  not coalesce(public.can_use_gif((select exec_id from _who)), false);
insert into _s select 'gif_exempt_ids shows a trainee only their own id (M4)', count(*)::text,
  count(*) filter (where g.uid <> '0e14252b-0c85-4665-a430-2ca95023be6f'::uuid) = 0
  from public.gif_exempt_ids() as g(uid);
reset role;

-- ---- executive ---------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select exec_id from _who), 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.expect('executive cannot read attempts.score directly either (H1, scores come from RPCs)', 'select score from public.attempts limit 1', '42501');
select pg_temp.expect('executive can call gif_exempt_ids (full list)', 'select count(*) from public.gif_exempt_ids()', '');
select pg_temp.expect('executive can check can_use_gif for a member', 'select public.can_use_gif(gen_random_uuid())', '');
reset role;

do $$
declare bad text;
begin
  select string_agg(test, ' | ') into bad from _s where not pass;
  if bad is not null then
    raise exception 'security_0200 FAILED: %', bad;
  end if;
end $$;

select test, result, pass from _s order by test;

rollback;
