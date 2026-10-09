-- Chapter meetings and executive GIF limits (migrations 0059-0060). One transaction, rolled back; raises on the first failure.
-- Fixtures are throwaway users with ids 00000000-0000-4000-8000-*. The schedule rows are the committed 2026-27 seed.
begin;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.r(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8100-' || lpad(to_hex(n), 12, '0'))::uuid
$$;

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

-- The statement must fail with this SQLSTATE.
create function pg_temp.expect(label text, stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL %: expected %, got success', label, state using errcode = 'XX001';
exception when others then
  if sqlstate <> state then raise exception 'FAIL %: expected %, got % (%)', label, state, sqlstate, sqlerrm; end if;
end $$;

-- A. Fixtures ---------------------------------------------------------------------------------------------------
-- 1 executive; 2 trainer of room 1; 3 and 4 members of room 1; 8 executive (GIF cap applies, not exempt).
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  (pg_temp.u(1), 'meet.exec@example.com', '{"full_name":"Meet Exec"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(2), 'meet.trainer@example.com', '{"full_name":"Meet Trainer"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(3), 'meet.m1@example.com', '{"full_name":"Meet Member One"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(4), 'meet.m2@example.com', '{"full_name":"Meet Member Two"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(8), 'meet.exec2@example.com', '{"full_name":"Meet Exec Two"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'executive' where id in (pg_temp.u(1), pg_temp.u(8));
update public.profiles set role = 'trainer' where id = pg_temp.u(2);
insert into public.classrooms (id, name, owner_id) values (pg_temp.r(1), 'Meet Room One', pg_temp.u(2));
insert into public.classroom_members (classroom_id, user_id) values
  (pg_temp.r(1), pg_temp.u(3)), (pg_temp.r(1), pg_temp.u(4));

-- B. Schedule seed ----------------------------------------------------------------------------------------------
select pg_temp.check('seed has 32 meetings', (select count(*) from public.chapter_meetings) = 32);
select pg_temp.check('two exam-week rows marked none', (
  select count(*) from public.chapter_meetings where kind = 'none' and meets_on in ('2027-01-21', '2027-01-28')) = 2);
select pg_temp.check('SLC debrief is Thu Mar 11 2027', exists (
  select 1 from public.chapter_meetings where meets_on = date '2027-03-11' and title = 'SLC debrief'));
select pg_temp.check('ILC prep runs Mar 18 to Jun 17 2027 weekly', (
  select count(*) = 14 and min(meets_on) = date '2027-03-18' and max(meets_on) = date '2027-06-17'
  from public.chapter_meetings where title = 'ILC prep'));
select pg_temp.check('no meeting rows for unlisted Thursdays', not exists (
  select 1 from public.chapter_meetings where meets_on in ('2026-12-24', '2026-12-31', '2027-02-11', '2027-03-04')));

-- Re-running the seed adds nothing.
insert into public.chapter_meetings (meets_on, title, kind) values ('2026-10-15', 'Duplicate', 'training')
  on conflict (meets_on) do nothing;
select pg_temp.check('seed re-run keeps 32 rows', (select count(*) from public.chapter_meetings) = 32);

-- Each meeting maps to the Monday of its week, so attendance weeks line up with the schedule.
select pg_temp.check('week_start is the Monday of the meeting week', exists (
  select 1 from public.chapter_meetings where meets_on = date '2026-10-15' and week_start = date '2026-10-12'));

-- Thursdays only, and one meeting per week.
select pg_temp.expect('a Tuesday is refused',
  $$insert into public.chapter_meetings (meets_on, title, kind) values ('2026-10-13', 'Tue', 'training')$$, '23514');
select pg_temp.expect('a second meeting on the same day is refused',
  $$insert into public.chapter_meetings (meets_on, title, kind) values ('2026-10-15', 'Again', 'training')$$, '23505');

-- C. Who can read and write -------------------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.check('member reads the schedule', (select count(*) from public.chapter_meetings) = 32);
select pg_temp.expect('member cannot add a meeting',
  $$insert into public.chapter_meetings (meets_on, title, kind) values ('2026-10-22', 'Sneaky', 'social')$$, '42501');

select pg_temp.as_user(pg_temp.u(2));
select pg_temp.expect('trainer cannot add a meeting',
  $$insert into public.chapter_meetings (meets_on, title, kind) values ('2026-10-22', 'Sneaky', 'social')$$, '42501');
select pg_temp.check('trainer still reads the schedule', (select count(*) from public.chapter_meetings) = 32);

select pg_temp.as_user(pg_temp.u(1));
insert into public.chapter_meetings (meets_on, title, kind) values ('2027-06-24', 'Extra meeting', 'training');
select pg_temp.check('executive adds a meeting', exists (
  select 1 from public.chapter_meetings where meets_on = date '2027-06-24'));
update public.chapter_meetings set title = 'Extra meeting renamed' where meets_on = date '2027-06-24';
select pg_temp.check('executive renames a meeting', exists (
  select 1 from public.chapter_meetings where meets_on = date '2027-06-24' and title = 'Extra meeting renamed'));

-- D. GIF size cap: the policy function ---------------------------------------------------------------------------
select pg_temp.as_admin();
select pg_temp.check('non-exempt exec: 1 MB GIF allowed', private.gif_size_ok(
  pg_temp.u(8)::text || '/a.gif', '{"size": 1048576}'::jsonb));
select pg_temp.check('non-exempt exec: 1 MB + 1 byte refused', not coalesce(private.gif_size_ok(
  pg_temp.u(8)::text || '/a.gif', '{"size": 1048577}'::jsonb), false));
select pg_temp.check('unknown size is refused', not coalesce(private.gif_size_ok(
  pg_temp.u(8)::text || '/a.gif', '{}'::jsonb), false));
-- Exempt means exempt uploader AND exempt folder, so the checks run as the exempt accounts themselves.
select pg_temp.as_user('ca22ffa8-ed66-4b0f-8f61-9d3f474cb219'::uuid);
select pg_temp.check('Joseph keeps the bucket limit in his own folder', private.gif_size_ok(
  'ca22ffa8-ed66-4b0f-8f61-9d3f474cb219/a.gif', '{"size": 2000000}'::jsonb));
select pg_temp.as_user('8d79200c-80f1-43a1-8c4d-b9b3331491dc'::uuid);
select pg_temp.check('Kaden (executive profile) keeps the bucket limit in his own folder', private.gif_size_ok(
  '8d79200c-80f1-43a1-8c4d-b9b3331491dc/a.gif', '{"size": 2000000}'::jsonb));
select pg_temp.as_user(pg_temp.u(8));
select pg_temp.check('capped exec cannot send a 2 MB GIF into an exempt folder', not coalesce(private.gif_size_ok(
  'ca22ffa8-ed66-4b0f-8f61-9d3f474cb219/a.gif', '{"size": 2000000}'::jsonb), false));
select pg_temp.check('capped exec: a 2 MB file named .webp is refused', not coalesce(private.gif_size_ok(
  pg_temp.u(8)::text || '/a.webp', '{"size": 2000000}'::jsonb), false));
select pg_temp.as_admin();

-- E. GIF size cap: storage policy as the executive ---------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(8));
select pg_temp.expect('exec GIF over 1 MB is refused by storage',
  $$insert into storage.objects (bucket_id, name, metadata) values ('avatars', '00000000-0000-4000-8000-000000000008/' || gen_random_uuid() || '.gif', '{"size": 2000000}')$$,
  '42501');
insert into storage.objects (bucket_id, name, metadata) values
  ('avatars', '00000000-0000-4000-8000-000000000008/' || gen_random_uuid() || '.gif', '{"size": 900000}');
select pg_temp.check('exec GIF under 1 MB is allowed', exists (
  select 1 from storage.objects where bucket_id = 'avatars' and metadata->>'size' = '900000'));
select pg_temp.expect('exec GIF with no size is refused',
  $$insert into storage.objects (bucket_id, name, metadata) values ('avatars', '00000000-0000-4000-8000-000000000008/' || gen_random_uuid() || '.gif', '{}')$$,
  '42501');

-- F. Members and trainers cannot upload GIFs at all ------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.expect('member GIF refused even when small',
  $$insert into storage.objects (bucket_id, name, metadata) values ('avatars', '00000000-0000-4000-8000-000000000003/' || gen_random_uuid() || '.gif', '{"size": 1000}')$$,
  '42501');
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.expect('trainer GIF refused even when small',
  $$insert into storage.objects (bucket_id, name, metadata) values ('avatars', '00000000-0000-4000-8000-000000000002/' || gen_random_uuid() || '.gif', '{"size": 1000}')$$,
  '42501');

-- G. Exempt list for the upload form ------------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(8));
select pg_temp.check('signed-in members see the two exempt ids', (select count(*) from public.gif_exempt_ids()) = 2);
select pg_temp.as_admin();
select pg_temp.check('exempt list is not writable by members', not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'private' and c.relname = 'gif_size_exempt' and has_table_privilege('authenticated', c.oid, 'insert')));

select 'attendance_meetings: all checks passed' as result;
rollback;
