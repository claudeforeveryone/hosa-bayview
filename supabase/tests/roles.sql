-- Role and RLS checks for profiles (migrations 0001-0005).
-- Run as a superuser (Supabase SQL editor or MCP execute_sql). Works on a live project:
-- everything happens in one transaction that rolls back. Raises if any check fails.
begin;

create temp table _r (test text, result text, pass boolean);
grant all on _r to authenticated, anon;

-- expect(label, sql, sqlstate): runs sql as the current role and records whether it failed with that code.
create function pg_temp.expect(label text, stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  insert into _r values (label, 'no error', false);
exception when others then
  insert into _r values (label, sqlstate || ' ' || sqlerrm, sqlstate = state);
end $$;
-- rows(label, sql, n): runs a DML statement and checks how many rows it touched.
create function pg_temp.rows(label text, stmt text, want int) returns void language plpgsql as $$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  insert into _r values (label, n || ' rows', n = want);
end $$;
grant execute on function pg_temp.expect(text, text, text), pg_temp.rows(text, text, int) to authenticated, anon;

-- Start from "no executive yet" with a known first-exec email, whatever the live data is.
alter table public.profiles disable trigger guard_profile_update;
update public.profiles set role = 'trainee' where role = 'executive';
alter table public.profiles enable trigger guard_profile_update;
insert into private.settings values ('first_executive_email', 'first-exec@example.com')
  on conflict (key) do update set value = excluded.value;

-- Q = squatter on the first-exec email (unconfirmed, confirms later). E = owner (two-step signup). C = phone-only user.
-- T = trainee. L = long name. S = second exec candidate. R = trainer.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-0000000000aa', 'authenticated', 'authenticated',
   'first-exec@example.com', '{}', null, now(), now());
insert into _r select 'unconfirmed signup on exec email stays trainee', role::text, role = 'trainee'
  from public.profiles where id = 'aaaaaaaa-0000-0000-0000-0000000000aa';
-- The squatter's row was created in an earlier transaction; the owner clicks a link later.
update public.profiles set created_at = now() - interval '1 hour' where id = 'aaaaaaaa-0000-0000-0000-0000000000aa';
update auth.users set email_confirmed_at = now() where id = 'aaaaaaaa-0000-0000-0000-0000000000aa';
insert into _r select 'confirming a squatted exec email later does not promote', role::text, role = 'trainee'
  from public.profiles where id = 'aaaaaaaa-0000-0000-0000-0000000000aa';
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-0000000000aa';

-- Owner signs up the way the auth server does it with "Confirm email" off: insert unconfirmed,
-- then confirm in the same transaction.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000000e', 'authenticated', 'authenticated',
   'FIRST-EXEC@example.com', '{"full_name":"Test Exec"}', null, now(), now());
update auth.users set email_confirmed_at = now() where id = 'aaaaaaaa-0000-0000-0000-00000000000e';

insert into auth.users (instance_id, id, aud, role, email, phone, raw_user_meta_data, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-0000000000cc', 'authenticated', 'authenticated',
   null, '15550001111', '{"full_name":"   "}', null, now(), now());
insert into _r select 'null email and blank name still get a profile', email || '|' || full_name, email = '' and full_name = 'Member'
  from public.profiles where id = 'aaaaaaaa-0000-0000-0000-0000000000cc';

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-0000000000bb', 'authenticated', 'authenticated',
   'test-trainer@example.com', '{}', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000000f', 'authenticated', 'authenticated',
   'test-trainee@example.com', '{}', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
   'long@example.com', jsonb_build_object('full_name', repeat('n', 70)), now(), now(), now());

insert into _r select 'new users default to trainee', role::text, role = 'trainee'
  from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000f';
insert into _r select 'name falls back to email local part', full_name, full_name = 'test-trainee'
  from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000f';
insert into _r select 'long signup names are truncated to 60', char_length(full_name)::text, char_length(full_name) = 60
  from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000010';
-- 0201 retired the email bootstrap: a confirmed signup on the email no longer promotes, and the setting is left alone.
insert into _r select 'confirmed signup on exec email stays trainee (bootstrap retired, 0201)', role::text, role = 'trainee'
  from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000e';
update public.profiles set role = 'trainer' where id = 'aaaaaaaa-0000-0000-0000-0000000000bb';
insert into _r select 'setting is not consumed by a signup (retired)', count(*)::text, count(*) = 1
  from private.settings where key = 'first_executive_email';
-- The first executive is now granted by uid, by hand (what a chapter lead or the SQL editor does). The executive
-- checks further down use this account.
update public.profiles set role = 'executive' where id = 'aaaaaaaa-0000-0000-0000-00000000000e';

-- The setting is still there (not consumed), so this replaces it.
insert into private.settings values ('first_executive_email', 'second-exec@example.com')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000011', 'authenticated', 'authenticated',
   'second-exec@example.com', '{}', now(), now(), now());
insert into _r select 'second email signup stays trainee too', role::text, role = 'trainee'
  from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000011';

update auth.users set email = 'renamed@example.com' where id = 'aaaaaaaa-0000-0000-0000-00000000000f';
insert into _r select 'auth email changes sync to profile', email, email = 'renamed@example.com'
  from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000f';

-- As trainee
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000f","role":"authenticated"}', true);
set local role authenticated;
insert into _r select 'trainee sees only own profile', count(*)::text, count(*) = 1
  from public.profiles where id::text like 'aaaaaaaa-%';
select pg_temp.expect('trainee cannot self-promote',
  $q$update public.profiles set role = 'executive' where id = 'aaaaaaaa-0000-0000-0000-00000000000f'$q$, '42501');
select pg_temp.expect('trainee cannot backdate created_at',
  $q$update public.profiles set created_at = '2000-01-01' where id = 'aaaaaaaa-0000-0000-0000-00000000000f'$q$, '42501');
select pg_temp.expect('trainee cannot change email',
  $q$update public.profiles set email = 'x@example.com' where id = 'aaaaaaaa-0000-0000-0000-00000000000f'$q$, '42501');
select pg_temp.expect('name length capped at 60',
  $q$update public.profiles set full_name = repeat('x', 61) where id = 'aaaaaaaa-0000-0000-0000-00000000000f'$q$, '23514');
select pg_temp.rows('trainee cannot edit others',
  $q$update public.profiles set full_name = 'x' where id = 'aaaaaaaa-0000-0000-0000-00000000000e'$q$, 0);
select pg_temp.rows('trainee can rename self',
  $q$update public.profiles set full_name = 'Renamed' where id = 'aaaaaaaa-0000-0000-0000-00000000000f'$q$, 1);
select pg_temp.expect('trainee cannot read private.settings', 'select * from private.settings', '42501');
select pg_temp.expect('trainee cannot call promotion directly',
  $q$select private.maybe_promote_first_exec('aaaaaaaa-0000-0000-0000-00000000000f', 'x', true)$q$, '42501');
reset role;

-- As trainer
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.expect('trainer cannot change own role',
  $q$update public.profiles set role = 'executive' where id = 'aaaaaaaa-0000-0000-0000-0000000000bb'$q$, '42501');
select pg_temp.rows('trainer cannot change others',
  $q$update public.profiles set role = 'trainer' where id = 'aaaaaaaa-0000-0000-0000-00000000000f'$q$, 0);
reset role;

-- As anon
select set_config('request.jwt.claims', '', true);
set local role anon;
insert into _r select 'anon reads no profiles', count(*)::text, count(*) = 0 from public.profiles;
select pg_temp.expect('anon cannot call helpers', 'select private.is_executive()', '42501');
reset role;

-- As executive
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000e","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.rows('exec can change roles',
  $q$update public.profiles set role = 'trainer' where id = 'aaaaaaaa-0000-0000-0000-00000000000f'$q$, 1);
select pg_temp.rows('exec can rename others',
  $q$update public.profiles set full_name = 'Fixed Name' where id = 'aaaaaaaa-0000-0000-0000-00000000000f'$q$, 1);
select pg_temp.expect('last exec cannot demote self',
  $q$update public.profiles set role = 'trainee' where id = 'aaaaaaaa-0000-0000-0000-00000000000e'$q$, 'P0001');
select pg_temp.rows('profiles cannot be deleted through the API',
  $q$delete from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000f'$q$, 0);
select pg_temp.expect('exec cannot change emails directly',
  $q$update public.profiles set email = 'y@example.com' where id = 'aaaaaaaa-0000-0000-0000-00000000000f'$q$, '42501');
reset role;

select pg_temp.expect('deleting last exec account is blocked',
  $q$delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-00000000000e'$q$, 'P0001');
update public.profiles set role = 'executive' where id = 'aaaaaaaa-0000-0000-0000-0000000000bb';
select pg_temp.rows('deleting an exec is fine when another remains',
  $q$delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-00000000000e'$q$, 1);

do $$ declare failed text; begin
  select string_agg(test || ' [' || result || ']', '; ') into failed from _r where not pass;
  if failed is not null then raise exception 'FAILED: %', failed; end if;
end $$;

select * from _r;
rollback;
