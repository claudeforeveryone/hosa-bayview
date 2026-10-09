-- Moderation, bans, grades and avatar storage (migration 0033). One transaction, rolled back; raises on the first failure.
-- Run as a superuser (Supabase SQL editor or MCP execute_sql).
begin;

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

-- Fixed test accounts: E1 real exec, E2 second exec, R1 trainer, T1 trainee, T2 the trainee we moderate.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000e1', 'authenticated', 'authenticated', 'mod.exec@example.com', '{"full_name":"Mod Exec"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000e2', 'authenticated', 'authenticated', 'mod.exec2@example.com', '{"full_name":"Second Exec"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'mod.trainer@example.com', '{"full_name":"Ray Trainer"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'mod.trainee@example.com', '{"full_name":"Tia Trainee","grade":"10"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'mod.target@example.com', '{"full_name":"Tom Target","grade":"eleven"}', now());
update public.profiles set role = 'executive' where id in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2');
update public.profiles set role = 'trainer' where id = '00000000-0000-4000-8000-0000000000b1';

-- Signup grade: a valid grade is kept, a bad one is dropped and the signup still works.
select pg_temp.check('grade from signup metadata', (select grade from public.profiles where id = '00000000-0000-4000-8000-0000000000a1') = 10);
select pg_temp.check('bad signup grade dropped', (select grade from public.profiles where id = '00000000-0000-4000-8000-0000000000a2') is null);
select pg_temp.expect('grade must be 9 to 12', $q$update public.profiles set grade = 13 where id = '00000000-0000-4000-8000-0000000000a2'$q$, '23514');

-- A session that the ban should end.
insert into auth.sessions (id, user_id) values ('00000000-0000-4000-8000-00000000005e', '00000000-0000-4000-8000-0000000000a2');

-- Signed out: no moderation, no directory.
set local role anon;
select pg_temp.expect('anon cannot warn', $q$select public.warn_member('00000000-0000-4000-8000-0000000000a1', 'hi')$q$, '42501');
select pg_temp.expect('anon cannot read member details', $q$select * from public.member_details()$q$, '42501');
reset role;

-- Trainee: can't moderate anyone, and can't see anyone else's warnings.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.expect('trainee cannot warn', $q$select public.warn_member('00000000-0000-4000-8000-0000000000a2', 'hi')$q$, '42501');
select pg_temp.expect('trainee cannot ban', $q$select public.ban_member('00000000-0000-4000-8000-0000000000a2', 'infinity', null)$q$, '42501');
select pg_temp.expect('trainee cannot unban', $q$select public.unban_member('00000000-0000-4000-8000-0000000000a2')$q$, '42501');
select pg_temp.expect('trainee cannot remove', $q$select public.remove_member('00000000-0000-4000-8000-0000000000a2')$q$, '42501');
select pg_temp.expect('trainee cannot change own ban fields', $q$update public.profiles set banned_until = now() + interval '1 day' where id = '00000000-0000-4000-8000-0000000000a1'$q$, '42501');
select pg_temp.check('trainee sees member details', (select count(*) from public.member_details()) >= 2);
select pg_temp.as_admin();

-- Executive: warns, with validation and the trainer as a valid target.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
select pg_temp.expect('warning needs a message', $q$select public.warn_member('00000000-0000-4000-8000-0000000000a2', '   ')$q$, '22023');
select pg_temp.expect('warning message under 500', $q$select public.warn_member('00000000-0000-4000-8000-0000000000a2', repeat('x', 501))$q$, '22023');
select public.warn_member('00000000-0000-4000-8000-0000000000a2', 'Please keep the group chat civil.');
select public.warn_member('00000000-0000-4000-8000-0000000000b1', 'Heads up on the flashcards.');
select pg_temp.check('exec sees the warning history', (select count(*) from public.user_warnings where user_id = '00000000-0000-4000-8000-0000000000a2') = 1);
select pg_temp.expect('exec cannot warn a missing user', $q$select public.warn_member(gen_random_uuid(), 'hi')$q$, 'P0002');
select pg_temp.as_admin();

-- The warned trainee sees it and clears it.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
select pg_temp.check('warned trainee sees own unseen warning', (select count(*) from public.user_warnings where seen_at is null) = 1);
select public.acknowledge_warning((select id from public.user_warnings where user_id = '00000000-0000-4000-8000-0000000000a2' limit 1));
select pg_temp.check('acknowledged warning is seen', (select count(*) from public.user_warnings where seen_at is null) = 0);
select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.check('other trainees do not see it', (select count(*) from public.user_warnings where user_id = '00000000-0000-4000-8000-0000000000a2') = 0);
select pg_temp.as_admin();

-- Executive: exec targets are refused, and so is yourself.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
select pg_temp.expect('no warning an executive', $q$select public.warn_member('00000000-0000-4000-8000-0000000000e2', 'hi')$q$, 'P0001');
select pg_temp.expect('no ban an executive', $q$select public.ban_member('00000000-0000-4000-8000-0000000000e2', 'infinity', null)$q$, 'P0001');
select pg_temp.expect('no unban an executive', $q$select public.unban_member('00000000-0000-4000-8000-0000000000e2')$q$, 'P0001');
select pg_temp.expect('no removing an executive', $q$select public.remove_member('00000000-0000-4000-8000-0000000000e2')$q$, 'P0001');
select pg_temp.expect('no warning yourself', $q$select public.warn_member('00000000-0000-4000-8000-0000000000e1', 'hi')$q$, 'P0001');
select pg_temp.expect('no ban yourself', $q$select public.ban_member('00000000-0000-4000-8000-0000000000e1', 'infinity', null)$q$, 'P0001');
select pg_temp.expect('ban time must be in the future', $q$select public.ban_member('00000000-0000-4000-8000-0000000000a2', now() - interval '1 day', 'late')$q$, '22023');
select pg_temp.expect('ban reason under 200', $q$select public.ban_member('00000000-0000-4000-8000-0000000000a2', now() + interval '1 day', repeat('r', 201))$q$, '22023');

-- Ban for a day: ends the sessions, sets the time and reason.
select public.ban_member('00000000-0000-4000-8000-0000000000a2', now() + interval '1 day', 'Group chat');
select pg_temp.check('one-day ban is set', (select banned_until > now() + interval '23 hours' and banned_until < now() + interval '25 hours' and ban_reason = 'Group chat' from public.profiles where id = '00000000-0000-4000-8000-0000000000a2'));
select pg_temp.as_admin();
select pg_temp.check('ban ends their sessions', not exists (select 1 from auth.sessions where user_id = '00000000-0000-4000-8000-0000000000a2'));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');

-- Unban clears the ban and lets them back in.
select public.unban_member('00000000-0000-4000-8000-0000000000a2');
select pg_temp.check('unban clears the ban', (select banned_until is null and ban_reason is null from public.profiles where id = '00000000-0000-4000-8000-0000000000a2'));
select pg_temp.as_admin();
select pg_temp.check('unban clears the sign-in ban too', (select banned_until is null from auth.users where id = '00000000-0000-4000-8000-0000000000a2'));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
select public.heartbeat(null);
select pg_temp.as_admin();

-- Permanent ban: the banned trainee's writes are refused, RPC or direct.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
select public.ban_member('00000000-0000-4000-8000-0000000000a2', 'infinity', null);
select pg_temp.as_admin();
select pg_temp.check('permanent ban reads as banned', (select banned_until = 'infinity'::timestamptz from public.profiles where id = '00000000-0000-4000-8000-0000000000a2'));
select pg_temp.check('permanent ban also stops sign-in (auth.users)', (select banned_until >= '9999-01-01'::timestamptz from auth.users where id = '00000000-0000-4000-8000-0000000000a2'));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
select pg_temp.check('is_banned is true for the banned trainee', private.is_banned());
select pg_temp.expect('banned trainee cannot heartbeat', $q$select public.heartbeat(null)$q$, '42501');
select pg_temp.expect('banned trainee cannot write activity directly', $q$insert into public.activity_minutes (user_id, minute) values ('00000000-0000-4000-8000-0000000000a2', now())$q$, '42501');
select pg_temp.expect('banned trainee cannot write presence', $q$insert into public.presence (user_id, last_seen) values ('00000000-0000-4000-8000-0000000000a2', now())$q$, '42501');
select pg_temp.expect('banned trainee cannot lift own ban', $q$update public.profiles set banned_until = null where id = '00000000-0000-4000-8000-0000000000a2'$q$, '42501');
select pg_temp.expect('banned trainee cannot upload a picture', $q$insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-8000-0000000000a2/33333333-3333-4333-8333-333333333333.webp')$q$, '42501');
select pg_temp.expect('banned trainee cannot edit own name', $q$update public.profiles set full_name = 'Renamed' where id = '00000000-0000-4000-8000-0000000000a2'$q$, '42501');
select pg_temp.expect('banned trainee cannot save the breakdown', $q$select public.save_topic_weights(gen_random_uuid(), '[]'::jsonb)$q$, '42501');
select pg_temp.expect('banned trainee cannot take attendance', $q$select public.save_attendance_week(gen_random_uuid(), date '2026-10-05', '', '[]'::jsonb)$q$, '42501');
select pg_temp.as_admin();

-- Look-around demo executives (full_access off): can't moderate anyone or change others' pictures.
update private.demo_accounts set full_access = false where slug = 'kaden-li';
select pg_temp.as_user((select user_id from private.demo_accounts where slug = 'kaden-li'));
select pg_temp.check('demo is an executive', private.is_executive() and private.is_demo());
select pg_temp.expect('demo cannot warn', $q$select public.warn_member('00000000-0000-4000-8000-0000000000a1', 'hi')$q$, '42501');
select pg_temp.expect('demo cannot ban', $q$select public.ban_member('00000000-0000-4000-8000-0000000000a1', 'infinity', null)$q$, '42501');
select pg_temp.expect('demo cannot unban', $q$select public.unban_member('00000000-0000-4000-8000-0000000000a2')$q$, '42501');
select pg_temp.expect('demo cannot remove', $q$select public.remove_member('00000000-0000-4000-8000-0000000000a1')$q$, '42501');
select pg_temp.expect('demo cannot change another picture', $q$update public.profiles set avatar_path = '00000000-0000-4000-8000-0000000000a1/44444444-4444-4444-8444-444444444444.webp' where id = '00000000-0000-4000-8000-0000000000a1'$q$, '42501');
select pg_temp.expect('demo cannot upload another folder', $q$insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-8000-0000000000a1/55555555-5555-4555-8555-555555555555.webp')$q$, '42501');
select pg_temp.as_admin();
-- With full access (0047) the same account is a plain executive and can moderate.
update private.demo_accounts set full_access = true where slug = 'kaden-li';
select pg_temp.as_user((select user_id from private.demo_accounts where slug = 'kaden-li'));
select pg_temp.check('full-access preset is not demo', private.is_executive() and not private.is_demo() and not public.am_demo());
select public.warn_member('00000000-0000-4000-8000-0000000000a1', 'full access check');
update public.profiles set role = 'trainer' where id = '00000000-0000-4000-8000-0000000000a1';
select pg_temp.check('full-access preset changed a role', (select role from public.profiles where id = '00000000-0000-4000-8000-0000000000a1') = 'trainer');
update public.profiles set role = 'trainee' where id = '00000000-0000-4000-8000-0000000000a1';
select pg_temp.as_admin();

-- Avatar storage: own folder for everyone, any folder for real execs.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-8000-0000000000a1/66666666-6666-4666-8666-666666666666.webp');
select pg_temp.expect('trainee cannot upload to another folder', $q$insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-8000-0000000000a2/77777777-7777-4777-8777-777777777777.webp')$q$, '42501');
select pg_temp.check('trainee sees the avatar bucket', (select count(*) from storage.objects where bucket_id = 'avatars') >= 1);
select pg_temp.as_admin();

select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-8000-0000000000a2/22222222-2222-4222-8222-222222222222.webp');
select pg_temp.as_admin();

-- Storage deletes go through RLS; allow the direct delete here so the policy is what's tested.
select set_config('storage.allow_delete_query', 'true', true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
delete from storage.objects where bucket_id = 'avatars' and name like '00000000-0000-4000-8000-0000000000a2/%';
select pg_temp.as_admin();
select pg_temp.check('trainee cannot remove another picture', exists (select 1 from storage.objects where name = '00000000-0000-4000-8000-0000000000a2/22222222-2222-4222-8222-222222222222.webp'));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
delete from storage.objects where bucket_id = 'avatars' and name = '00000000-0000-4000-8000-0000000000a2/22222222-2222-4222-8222-222222222222.webp';
select pg_temp.as_admin();
select pg_temp.check('exec removed the picture', not exists (select 1 from storage.objects where name = '00000000-0000-4000-8000-0000000000a2/22222222-2222-4222-8222-222222222222.webp'));

-- Executives can replace a member's picture: profile path follows the owner's folder.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
update public.profiles set avatar_path = '00000000-0000-4000-8000-0000000000a2/22222222-2222-4222-8222-222222222222.webp' where id = '00000000-0000-4000-8000-0000000000a2';
select pg_temp.expect('avatar path must sit in the owner folder', $q$update public.profiles set avatar_path = '00000000-0000-4000-8000-0000000000a1/22222222-2222-4222-8222-222222222222.webp' where id = '00000000-0000-4000-8000-0000000000a2'$q$, '23514');
select pg_temp.check('exec set the picture', (select avatar_path from public.profiles where id = '00000000-0000-4000-8000-0000000000a2') = '00000000-0000-4000-8000-0000000000a2/22222222-2222-4222-8222-222222222222.webp');

-- Removing the account returns the picture path, so the app can delete the file too.
select pg_temp.check('remove returns the picture path',
  (select public.remove_member('00000000-0000-4000-8000-0000000000a2')) = '00000000-0000-4000-8000-0000000000a2/22222222-2222-4222-8222-222222222222.webp');
select pg_temp.as_admin();
select pg_temp.check('removed account is gone', not exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000a2'));
select pg_temp.check('removed profile is gone', not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000000a2'));
select pg_temp.check('removed member warnings are gone', not exists (select 1 from public.user_warnings where user_id = '00000000-0000-4000-8000-0000000000a2'));

select 'moderation: all checks passed' as result;
rollback;
