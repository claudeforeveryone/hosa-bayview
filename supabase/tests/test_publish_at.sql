-- Hidden and scheduled tests (migration 0298). One transaction, rolled back; raises on the first failure.
-- Run as a superuser (Supabase SQL editor or MCP execute_sql). On live, the throwaway sequence below keeps the
-- class and test numbers members see from moving (see CLAUDE.md, "Running fixture tests").
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';
create sequence public.omega_dryrun_seq start 900000000;
alter table public.classrooms alter column num drop identity;
alter table public.classrooms alter column num set default nextval('public.omega_dryrun_seq');
alter table public.tests alter column num drop identity;
alter table public.tests alter column num set default nextval('public.omega_dryrun_seq');

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

create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
end $$;

-- R1 trainer runs the room, R2 is a trainer who doesn't, T1 trainee is a member.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000db1', 'authenticated', 'authenticated', 'pa.r1@example.com', '{"full_name":"Pat Trainer"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000db2', 'authenticated', 'authenticated', 'pa.r2@example.com', '{"full_name":"Ola Trainer"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000da1', 'authenticated', 'authenticated', 'pa.t1@example.com', '{"full_name":"Pia Trainee"}', now());
update public.profiles set role = 'trainer'
  where id in ('00000000-0000-4000-8000-000000000db1', '00000000-0000-4000-8000-000000000db2');

insert into public.classrooms (id, name, event, owner_id)
  values ('00000000-0000-4000-8000-0000000d1a55', 'Schedule Room', 'Veterinary Science', '00000000-0000-4000-8000-000000000db1');
insert into public.classroom_members (classroom_id, user_id)
  values ('00000000-0000-4000-8000-0000000d1a55', '00000000-0000-4000-8000-000000000da1');
insert into public.tests (id, classroom_id, title, is_published) values
  ('00000000-0000-4000-8000-0000000d7e51', '00000000-0000-4000-8000-0000000d1a55', 'Due set', false),
  ('00000000-0000-4000-8000-0000000d7e52', '00000000-0000-4000-8000-0000000d1a55', 'Later set', false),
  ('00000000-0000-4000-8000-0000000d7e53', '00000000-0000-4000-8000-0000000d1a55', 'Empty set', false);
insert into public.questions (test_id, position, prompt, options) values
  ('00000000-0000-4000-8000-0000000d7e51', 1, 'Q1?', array['A', 'B']),
  ('00000000-0000-4000-8000-0000000d7e52', 1, 'Q1?', array['A', 'B']);

-- The trainer schedules all three; the member sees none of them, and can't read or write the schedule.
select pg_temp.as_user('00000000-0000-4000-8000-000000000db1');
update public.tests set publish_at = now() - interval '1 minute'
  where id in ('00000000-0000-4000-8000-0000000d7e51', '00000000-0000-4000-8000-0000000d7e53');
update public.tests set publish_at = now() + interval '1 day' where id = '00000000-0000-4000-8000-0000000d7e52';
select pg_temp.check('trainer sees the schedule',
  (select count(*) from public.tests where classroom_id = '00000000-0000-4000-8000-0000000d1a55' and publish_at is not null) = 3);
select pg_temp.as_admin();

select pg_temp.as_user('00000000-0000-4000-8000-000000000da1');
select pg_temp.check('member sees no hidden test',
  not exists (select 1 from public.tests where classroom_id = '00000000-0000-4000-8000-0000000d1a55'));
select pg_temp.check('member gets none from classroom_tests',
  not exists (select 1 from public.classroom_tests('00000000-0000-4000-8000-0000000d1a55')));
select pg_temp.check('member reads no hidden question',
  not exists (select 1 from public.questions where test_id = '00000000-0000-4000-8000-0000000d7e51'));
update public.tests set publish_at = now() where id = '00000000-0000-4000-8000-0000000d7e52';
select pg_temp.as_admin();
select pg_temp.check('member update touched nothing',
  (select publish_at > now() + interval '23 hours' from public.tests where id = '00000000-0000-4000-8000-0000000d7e52'));

-- A trainer who doesn't run the room can't see its hidden tests or move their schedule either.
select pg_temp.as_user('00000000-0000-4000-8000-000000000db2');
select pg_temp.check('other trainer sees no hidden test',
  not exists (select 1 from public.tests where classroom_id = '00000000-0000-4000-8000-0000000d1a55'));
update public.tests set publish_at = now(), is_published = true where id = '00000000-0000-4000-8000-0000000d7e52';
select pg_temp.as_admin();
select pg_temp.check('other trainer update touched nothing',
  (select not is_published and publish_at > now() + interval '23 hours'
   from public.tests where id = '00000000-0000-4000-8000-0000000d7e52'));

-- The job posts the due test with questions, leaves the later one, and unschedules the empty one.
select pg_temp.check('job posts one', private.post_scheduled_tests() = 1);
select pg_temp.check('due set posted, schedule cleared',
  (select is_published and publish_at is null from public.tests where id = '00000000-0000-4000-8000-0000000d7e51'));
select pg_temp.check('later set still hidden and scheduled',
  (select not is_published and publish_at is not null from public.tests where id = '00000000-0000-4000-8000-0000000d7e52'));
select pg_temp.check('empty set hidden, schedule dropped',
  (select not is_published and publish_at is null from public.tests where id = '00000000-0000-4000-8000-0000000d7e53'));
select pg_temp.check('room heard about the posted test',
  exists (select 1 from public.notifications n where n.user_id = '00000000-0000-4000-8000-000000000da1'
          and n.kind = 'test' and n.link = '/c/00000000-0000-4000-8000-0000000d1a55/tests/00000000-0000-4000-8000-0000000d7e51'));

select pg_temp.as_user('00000000-0000-4000-8000-000000000da1');
select pg_temp.check('member now sees the posted test only',
  (select array_agg(title) = array['Due set'] from public.tests where classroom_id = '00000000-0000-4000-8000-0000000d1a55'));
select pg_temp.as_admin();

-- Posting by hand clears a schedule, so hiding it again later doesn't bring the old time back.
select pg_temp.as_user('00000000-0000-4000-8000-000000000db1');
update public.tests set is_published = true where id = '00000000-0000-4000-8000-0000000d7e52';
update public.tests set is_published = false where id = '00000000-0000-4000-8000-0000000d7e52';
select pg_temp.as_admin();
select pg_temp.check('hand post cleared the schedule',
  (select not is_published and publish_at is null from public.tests where id = '00000000-0000-4000-8000-0000000d7e52'));
-- A posted test can't carry a schedule.
update public.tests set publish_at = now() + interval '1 day' where id = '00000000-0000-4000-8000-0000000d7e51';
select pg_temp.check('posted test keeps no schedule',
  (select publish_at is null from public.tests where id = '00000000-0000-4000-8000-0000000d7e51'));
-- Scheduling a posted test, as the app sends it: hidden and timed in one update, and the trigger keeps the time.
select pg_temp.as_user('00000000-0000-4000-8000-000000000db1');
update public.tests set is_published = false, publish_at = now() + interval '2 days'
  where id = '00000000-0000-4000-8000-0000000d7e51';
select pg_temp.as_admin();
select pg_temp.check('scheduling a posted test hides it and keeps the time',
  (select not is_published and publish_at > now() + interval '47 hours'
   from public.tests where id = '00000000-0000-4000-8000-0000000d7e51'));
select pg_temp.check('job scheduled once',
  (select count(*) = 1 from cron.job where jobname = 'hosa-post-scheduled-tests'));

rollback;
