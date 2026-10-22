-- Developers watching event rooms (migration 0293). One transaction, rolled back; raises on the first failure.
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

-- D1 developer (a trainee), T1 trainee who isn't one, R1 trainer who made the room.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000dd1', 'authenticated', 'authenticated', 'dv.dev@example.com', '{"full_name":"Dev Watcher"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000da1', 'authenticated', 'authenticated', 'dv.t1@example.com', '{"full_name":"Plain Trainee"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000db1', 'authenticated', 'authenticated', 'dv.r1@example.com', '{"full_name":"Room Maker"}', now());
update public.profiles set role = 'trainer' where id = '00000000-0000-4000-8000-000000000db1';
insert into private.stats_viewers (user_id) values ('00000000-0000-4000-8000-000000000dd1');
insert into public.classrooms (id, name, event, owner_id)
  values ('00000000-0000-4000-8000-0000000d1a55', 'Watched Room', 'Epidemiology', '00000000-0000-4000-8000-000000000db1');

-- Not a developer, not a member: nothing.
select pg_temp.as_user('00000000-0000-4000-8000-000000000da1');
select pg_temp.check('trainee sees nothing',
  not exists (select 1 from public.classroom_detail('00000000-0000-4000-8000-0000000d1a55'))
  and not exists (select 1 from public.my_classrooms() where id = '00000000-0000-4000-8000-0000000d1a55'));
select pg_temp.as_admin();

-- The developer sees and lists it, read-only: no join code, can't manage, can't edit.
select pg_temp.as_user('00000000-0000-4000-8000-000000000dd1');
select pg_temp.check('developer sees it, read-only',
  (select not can_manage and not is_owner and not is_member and join_code is null
   from public.classroom_detail('00000000-0000-4000-8000-0000000d1a55')));
select pg_temp.check('developer does not list it (0297: lists are rooms you are in)',
  not exists (select 1 from public.my_classrooms() where id = '00000000-0000-4000-8000-0000000d1a55'));
select pg_temp.check('developer reads the row',
  exists (select 1 from public.classrooms where id = '00000000-0000-4000-8000-0000000d1a55'));
update public.classrooms set description = 'Changed' where id = '00000000-0000-4000-8000-0000000d1a55';
select pg_temp.as_admin();
select pg_temp.check('developer edit did nothing',
  (select description = '' from public.classrooms where id = '00000000-0000-4000-8000-0000000d1a55'));

-- A banned developer sees nothing.
update public.profiles set banned_until = 'infinity' where id = '00000000-0000-4000-8000-000000000dd1';
select pg_temp.as_user('00000000-0000-4000-8000-000000000dd1');
select pg_temp.check('banned developer sees nothing',
  not exists (select 1 from public.classroom_detail('00000000-0000-4000-8000-0000000d1a55')));
select pg_temp.as_admin();

rollback;
