-- Classroom, membership and join-code checks (migrations 0006-0011).
-- Run as a superuser (Supabase SQL editor or MCP execute_sql). One transaction, rolled back. Raises if any check fails.
begin;

create temp table _r (test text, result text, pass boolean);
create temp table _c (k text primary key, v text);
grant all on _r, _c to authenticated, anon;

create function pg_temp.expect(label text, stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  insert into _r values (label, 'no error', false);
exception when others then
  insert into _r values (label, sqlstate || ' ' || sqlerrm, sqlstate = state);
end $$;
create function pg_temp.rows(label text, stmt text, want int) returns void language plpgsql as $$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  insert into _r values (label, n || ' rows', n = want);
end $$;
grant execute on function pg_temp.expect(text, text, text), pg_temp.rows(text, text, int) to authenticated, anon;

-- X exec, R1 R2 trainers, T1 T2 trainees.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email, jsonb_build_object('full_name', name), now(), now(), now()
from (values
  ('bbbbbbbb-0000-0000-0000-0000000000e1', 'c-exec@example.com', 'Exec'),
  ('bbbbbbbb-0000-0000-0000-0000000000a1', 'c-r1@example.com', 'Riley One'),
  ('bbbbbbbb-0000-0000-0000-0000000000a2', 'c-r2@example.com', 'Riley Two'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'c-t1@example.com', 'Tess One'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'c-t2@example.com', 'Tess Two')
) as u(id, email, name);
update public.profiles set role = 'executive' where id = 'bbbbbbbb-0000-0000-0000-0000000000e1';
update public.profiles set role = 'trainer' where id in ('bbbbbbbb-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-0000000000a2');

-- R1 creates a classroom.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.rows('trainer creates a classroom',
  $q$insert into public.classrooms (name, event) values ('Med Term', 'Medical Terminology')$q$, 1);
insert into _c select 'cid', id::text from public.classrooms where name = 'Med Term';
insert into _c select 'code', join_code from public.my_classrooms() where name = 'Med Term';
insert into _r select 'owner defaults to creator and code is well formed', owner_id || ' ' || join_code,
  owner_id = 'bbbbbbbb-0000-0000-0000-0000000000a1' and join_code ~ '^[A-HJKMNP-Z2-9]{6}$'
  from public.classroom_detail((select v from _c where k = 'cid')::uuid);
select pg_temp.expect('even the owner reads the code only through the RPCs',
  'select join_code from public.classrooms', '42501');
with ins as (insert into public.classrooms (name) values ('Returned') returning id)
insert into _r select 'create returns the new row (what the app does)', count(*)::text, count(*) = 1 from ins;
delete from public.classrooms where name = 'Returned';
select pg_temp.expect('trainer cannot create one owned by someone else',
  $q$insert into public.classrooms (name, owner_id) values ('X', 'bbbbbbbb-0000-0000-0000-0000000000a2')$q$, '42501');
select pg_temp.expect('trainer cannot pick the join code',
  $q$insert into public.classrooms (name, join_code) values ('X', 'AAAAAA')$q$, '42501');
select pg_temp.expect('trainer cannot hand the classroom to someone else',
  $q$update public.classrooms set owner_id = 'bbbbbbbb-0000-0000-0000-0000000000a2'$q$, '42501');
select pg_temp.rows('trainer edits own classroom',
  $q$update public.classrooms set description = 'Weekly drills' where name = 'Med Term'$q$, 1);
select pg_temp.expect('name length capped',
  $q$update public.classrooms set name = repeat('x', 81) where name = 'Med Term'$q$, '23514');
insert into _r select 'owner joining own code adds no membership',
  coalesce(public.join_classroom((select v from _c where k = 'code'))::text, 'null') || ' / ' ||
    (select count(*) from public.classroom_members)::text,
  (select count(*) from public.classroom_members where user_id = 'bbbbbbbb-0000-0000-0000-0000000000a1') = 0;
reset role;

-- T1, a trainee.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.expect('trainee cannot create classrooms',
  $q$insert into public.classrooms (name) values ('Nope')$q$, '42501');
insert into _r select 'trainee cannot see a classroom before joining', count(*)::text, count(*) = 0
  from public.classrooms where id = (select v from _c where k = 'cid')::uuid;
insert into _r select 'join accepts lowercase and dashes',
  coalesce(public.join_classroom(lower(substr(v, 1, 3) || '-' || substr(v, 4)))::text, 'null'),
  public.join_classroom(lower(substr(v, 1, 3) || '-' || substr(v, 4))) = (select v from _c where k = 'cid')::uuid
  from _c where k = 'code';
insert into _r select 'joining twice keeps one membership', count(*)::text, count(*) = 1
  from public.classroom_members where user_id = 'bbbbbbbb-0000-0000-0000-0000000000b1';
insert into _r select 'trainee sees the classroom after joining', count(*)::text, count(*) = 1
  from public.my_classrooms();
insert into _r select 'trainee never sees the join code', coalesce(join_code, 'null') || ' / ' || coalesce((select join_code from public.classroom_detail((select v from _c where k = 'cid')::uuid)), 'null'),
  join_code is null and (select join_code from public.classroom_detail((select v from _c where k = 'cid')::uuid)) is null
  from public.my_classrooms();
insert into _r select 'wrong code returns null', coalesce(public.join_classroom('ZZZZZZ')::text, 'null'),
  public.join_classroom('ZZZZZZ') is null;
select pg_temp.expect('member cannot read the join code off the table',
  'select join_code from public.classrooms', '42501');
select pg_temp.expect('member cannot select * either', 'select * from public.classrooms', '42501');
insert into _r select 'member can still read the safe columns', count(*)::text, count(*) = 1
  from (select id, name, event from public.classrooms) s;
select pg_temp.rows('trainee cannot rename the classroom',
  $q$update public.classrooms set name = 'Mine'$q$, 0);
select pg_temp.expect('trainee cannot change the code directly',
  $q$update public.classrooms set join_code = 'AAAAAA'$q$, '42501');
select pg_temp.expect('trainee cannot regenerate the code',
  $q$select public.regenerate_join_code((select v from _c where k = 'cid')::uuid)$q$, '42501');
select pg_temp.expect('trainee cannot add members directly',
  $q$insert into public.classroom_members (classroom_id, user_id) select v::uuid, 'bbbbbbbb-0000-0000-0000-0000000000b2' from _c where k = 'cid'$q$, '42501');
select pg_temp.rows('trainee cannot delete the classroom',
  $q$delete from public.classrooms$q$, 0);
select pg_temp.expect('trainee cannot read join attempts', 'select * from private.join_attempts', '42501');
reset role;

-- T2 joins, sees roster without emails, then hits the guess limit.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select public.join_classroom(v) from _c where k = 'code';
insert into _r select 'members see names but not emails', count(*) || ' rows, ' || count(email) || ' emails',
  count(*) = 2 and count(email) = 0
  from public.classroom_roster((select v from _c where k = 'cid')::uuid);
select pg_temp.rows('member cannot remove another member',
  $q$delete from public.classroom_members where user_id = 'bbbbbbbb-0000-0000-0000-0000000000b1'$q$, 0);
select public.join_classroom('AAAAA' || g) from generate_series(2, 9) g;
select public.join_classroom('BBBBBB'), public.join_classroom('CCCCCC');
insert into _r select 'misses never lock joining (0295)', 'ok',
  public.join_classroom((select v from _c where k = 'code')) is not null;
reset role;

-- R2, another trainer, can't touch R1's room.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
insert into _r select 'other trainer cannot see the classroom', count(*)::text, count(*) = 0 from public.classrooms;
select pg_temp.rows('other trainer cannot edit it', $q$update public.classrooms set name = 'Taken'$q$, 0);
select pg_temp.rows('other trainer cannot delete it', $q$delete from public.classrooms$q$, 0);
select pg_temp.rows('other trainer cannot remove members', $q$delete from public.classroom_members$q$, 0);
select pg_temp.expect('other trainer cannot regenerate the code',
  $q$select public.regenerate_join_code((select v from _c where k = 'cid')::uuid)$q$, '42501');
insert into _r select 'other trainer gets an empty roster', count(*)::text, count(*) = 0
  from public.classroom_roster((select v from _c where k = 'cid')::uuid);
insert into _r select 'other trainer gets nothing from my_classrooms', count(*)::text, count(*) = 0 from public.my_classrooms();
insert into _r select 'other trainer gets no classroom_detail row', count(*)::text, count(*) = 0
  from public.classroom_detail((select v from _c where k = 'cid')::uuid);
reset role;

-- R1 manages: roster with emails, regenerate, remove a member.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into _r select 'trainer sees member emails', count(email)::text, count(email) = 2
  from public.classroom_roster((select v from _c where k = 'cid')::uuid);
insert into _r select 'regenerating changes the code', code, code <> (select v from _c where k = 'code') and code ~ '^[A-HJKMNP-Z2-9]{6}$'
  from (select public.regenerate_join_code((select v from _c where k = 'cid')::uuid) as code) s;
select pg_temp.rows('trainer removes a member',
  $q$delete from public.classroom_members where user_id = 'bbbbbbbb-0000-0000-0000-0000000000b2'$q$, 1);
reset role;

-- T1: old code is dead, leaving works.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
insert into _r select 'old code stops working', coalesce(public.join_classroom(v)::text, 'null'), public.join_classroom(v) is null
  from _c where k = 'code';
select pg_temp.rows('member can leave',
  $q$delete from public.classroom_members where user_id = 'bbbbbbbb-0000-0000-0000-0000000000b1'$q$, 1);
reset role;

-- Anon gets nothing.
select set_config('request.jwt.claims', '', true);
set local role anon;
select pg_temp.expect('anon cannot join', $q$select public.join_classroom('AAAAAA')$q$, '42501');
select pg_temp.expect('anon cannot read classrooms', 'select * from public.classrooms', '42501');
reset role;

-- A trainer demoted to trainee stops managing.
update public.profiles set role = 'trainee' where id = 'bbbbbbbb-0000-0000-0000-0000000000a1';
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.rows('demoted trainer cannot edit', $q$update public.classrooms set name = 'Still mine'$q$, 0);
insert into _r select 'demoted trainer still sees the room', count(*)::text, count(*) = 1 from public.my_classrooms();
insert into _r select 'demoted trainer loses the join code', coalesce(join_code, 'null'), join_code is null and not can_manage
  from public.my_classrooms();
select pg_temp.expect('demoted trainer cannot regenerate the code',
  $q$select public.regenerate_join_code((select v from _c where k = 'cid')::uuid)$q$, '42501');
reset role;

-- Exec sees and runs everything.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.rows('exec creates a classroom for a trainer',
  $q$insert into public.classrooms (name, owner_id) values ('HSKB', 'bbbbbbbb-0000-0000-0000-0000000000a2')$q$, 1);
select pg_temp.expect('exec cannot make a trainee the owner',
  $q$insert into public.classrooms (name, owner_id) values ('Bad', 'bbbbbbbb-0000-0000-0000-0000000000b1')$q$, '42501');
select pg_temp.rows('exec edits any classroom',
  $q$update public.classrooms set name = 'Med Term 2' where name = 'Med Term'$q$, 1);
select pg_temp.rows('exec deletes any classroom', $q$delete from public.classrooms where name = 'Med Term 2'$q$, 1);
reset role;

select pg_temp.rows('deleting an owner keeps the classroom',
  $q$delete from auth.users where id = 'bbbbbbbb-0000-0000-0000-0000000000a2'$q$, 1);
insert into _r select 'orphaned classroom has no owner', coalesce(owner_id::text, 'null'), owner_id is null
  from public.classrooms where name = 'HSKB';
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
insert into _r select 'exec still finds the orphaned classroom on Home', coalesce(owner_name, 'null'), owner_name is null and can_manage
  from public.my_classrooms() where name = 'HSKB';
insert into _r select 'exec can regenerate an orphaned room''s code', code, code ~ '^[A-HJKMNP-Z2-9]{6}$'
  from (select public.regenerate_join_code((select id from public.classrooms where name = 'HSKB')) as code) s;
reset role;

do $$ declare failed text; begin
  select string_agg(test || ' [' || result || ']', '; ') into failed from _r where not pass;
  if failed is not null then raise exception 'FAILED: %', failed; end if;
end $$;

select * from _r;
rollback;
