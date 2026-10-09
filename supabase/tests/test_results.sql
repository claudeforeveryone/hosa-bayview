-- Test results checks (migration 0029). One transaction, rolled back; raises on the first failure.
begin;

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
end $$;

-- r1 trainer runs the room; r2 only practised the timed test; r3 practised then did it timed; r4 never finished.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'res.trainer@example.com', '{"full_name":"Res Trainer"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'res.practice@example.com', '{"full_name":"Res Practice"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a3', 'res.timed@example.com', '{"full_name":"Res Timed"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a4', 'res.open@example.com', '{"full_name":"Res Open"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'trainer' where id = '00000000-0000-4000-8000-0000000000a1';
insert into public.classrooms (id, name, owner_id) values ('00000000-0000-4000-8000-0000000000b1', 'Results Room', '00000000-0000-4000-8000-0000000000a1');
insert into public.classroom_members (classroom_id, user_id) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a4');
insert into public.tests (id, classroom_id, title, time_limit_minutes, is_published) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', 'Timed test', 30, true);
insert into public.attempts (test_id, user_id, mode, submitted_at, score, total) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a2', 'practice', now(), 3, 4),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a3', 'practice', now(), 4, 4),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a3', 'timed', now(), 2, 4);
insert into public.attempts (test_id, user_id, mode, total) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a4', 'timed', 4);

select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
create temp table res as select * from public.test_results('00000000-0000-4000-8000-0000000000c1');
select pg_temp.check('practice-only finisher is listed', exists (select 1 from res where full_name = 'Res Practice' and practice_only and best = 3));
select pg_temp.check('timed score wins over a better practice run', exists (select 1 from res where full_name = 'Res Timed' and not practice_only and best = 2 and attempts = 2));
select pg_temp.check('unfinished attempts are left out', not exists (select 1 from res where full_name = 'Res Open'));

select pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
select pg_temp.check('members cannot read results', not exists (select 1 from public.test_results('00000000-0000-4000-8000-0000000000c1')));

select 'test_results: all checks passed' as result;
rollback;
