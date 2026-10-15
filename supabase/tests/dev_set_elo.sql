-- Developers setting Elo (migration 0292). One transaction, rolled back; raises on the first failure.
-- Run as a superuser (Supabase SQL editor or MCP execute_sql).
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.expect(label text, stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL %: expected %, got success', label, state using errcode = 'XX001';
exception when others then
  if sqlstate <> state then raise exception 'FAIL %: expected %, got % (%)', label, state, sqlstate, sqlerrm; end if;
end $$;

create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
end $$;

-- D1 developer (a trainee, to show role doesn't matter), E1 executive who isn't a developer, T1 the member.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000ad1', 'authenticated', 'authenticated', 'elo.dev@example.com', '{"full_name":"Elo Dev"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000ae1', 'authenticated', 'authenticated', 'elo.exec@example.com', '{"full_name":"Elo Exec"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000aa1', 'authenticated', 'authenticated', 'elo.member@example.com', '{"full_name":"Elo Member"}', now());
update public.profiles set role = 'executive' where id = '00000000-0000-4000-8000-000000000ae1';
insert into private.stats_viewers (user_id) values ('00000000-0000-4000-8000-000000000ad1');
insert into public.elo_events (user_id, source, points, multiplier) values
  ('00000000-0000-4000-8000-000000000aa1', 'bonus', 7, 1);

-- Nobody but a developer.
select pg_temp.as_user('00000000-0000-4000-8000-000000000ae1');
select pg_temp.expect('executive refused',
  $q$select public.dev_set_elo('00000000-0000-4000-8000-000000000aa1', 500)$q$, '42501');
select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-000000000aa1');
select pg_temp.expect('member refused',
  $q$select public.dev_set_elo('00000000-0000-4000-8000-000000000aa1', 500)$q$, '42501');
select pg_temp.as_admin();

select pg_temp.as_user('00000000-0000-4000-8000-000000000ad1');
select pg_temp.expect('negative refused',
  $q$select public.dev_set_elo('00000000-0000-4000-8000-000000000aa1', -1)$q$, '22023');
select pg_temp.expect('missing person',
  $q$select public.dev_set_elo(gen_random_uuid(), 10)$q$, 'P0002');
select pg_temp.check('up to 500', public.dev_set_elo('00000000-0000-4000-8000-000000000aa1', 500) = 500);
select pg_temp.check('board shows 500',
  (select elo = 500 from public.leaderboard('all', null) where user_id = '00000000-0000-4000-8000-000000000aa1'));
select pg_temp.check('down to 3', public.dev_set_elo('00000000-0000-4000-8000-000000000aa1', 3) = 3);
select pg_temp.check('member stats show 3',
  (select elo = 3 from public.member_stats('00000000-0000-4000-8000-000000000aa1')));
select pg_temp.check('same value adds nothing', public.dev_set_elo('00000000-0000-4000-8000-000000000aa1', 3) = 3);
select pg_temp.as_admin();

select pg_temp.check('two adjust rows', (select count(*) = 2 from public.elo_events
  where user_id = '00000000-0000-4000-8000-000000000aa1' and source = 'adjust'
    and ref_id = '00000000-0000-4000-8000-000000000ad1'));
select pg_temp.check('logged twice', (select count(*) = 2 from public.admin_log
  where action = 'elo' and target_id = '00000000-0000-4000-8000-000000000aa1'));
select pg_temp.expect('other sources keep 1 to 50',
  $q$insert into public.elo_events (user_id, source, points) values ('00000000-0000-4000-8000-000000000aa1', 'signin', 51)$q$,
  '23514');
select pg_temp.expect('adjust of 0 refused',
  $q$insert into public.elo_events (user_id, source, points) values ('00000000-0000-4000-8000-000000000aa1', 'adjust', 0)$q$,
  '23514');

rollback;
