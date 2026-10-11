-- Deleted accounts' picture files (migration 0251). Runs in one transaction and rolls back; raises on the first
-- failure. Adds storage rows with SQL only (inserting is allowed; deleting goes through the Storage API), so no file
-- is uploaded or erased. The cron route's side (removal, limits) is in src/app/api/keepalive/route.test.ts.
begin;

create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
end $$;

create function pg_temp.expect(label text, stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL %: expected %, got success', label, state using errcode = 'XX001';
exception when others then
  if sqlstate <> state then raise exception 'FAIL %: expected %, got % (%)', label, state, sqlstate, sqlerrm; end if;
end $$;

-- A member who stays, and one who will be deleted.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000025b1', 'sweep.stays@example.com', '{"full_name":"Sweep Stays"}', now(),
   'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000025b2', 'sweep.leaves@example.com', '{"full_name":"Sweep Leaves"}', now(),
   'authenticated', 'authenticated');

insert into storage.objects (bucket_id, name) values
  ('avatars', '00000000-0000-4000-8000-0000000025b1/11111111-1111-4111-8111-111111111111.webp'),
  ('avatars', '00000000-0000-4000-8000-0000000025b2/22222222-2222-4222-8222-222222222222.gif'),
  -- A folder no account ever had (an executive uploading for a mistyped id, say).
  ('avatars', '00000000-0000-4000-8000-0000000025b9/33333333-3333-4333-8333-333333333333.jpg'),
  -- Not a member's folder: never swept.
  ('avatars', 'sweep-test/banner.png'),
  ('avatars', '00000000-0000-4000-8000-0000000025B9/upper-case.jpg'),
  -- Another bucket: never swept.
  ('materials', '00000000-0000-4000-8000-0000000025b9/sweep-test.pdf');

create temp table swept as
  select f as name from public.orphan_avatar_files() f where f like '%-0000000025%' or f like 'sweep-test/%';

select pg_temp.check('only the folder with no account is listed while both members exist',
  (select array_agg(name order by name) from swept)
  = array['00000000-0000-4000-8000-0000000025b9/33333333-3333-4333-8333-333333333333.jpg']);

-- Deleting the account (what the Supabase dashboard does) leaves the file; now it's listed.
delete from auth.users where id = '00000000-0000-4000-8000-0000000025b2';
select pg_temp.check('the deleted account''s picture is still in storage',
  exists (select 1 from storage.objects
          where bucket_id = 'avatars' and name like '00000000-0000-4000-8000-0000000025b2/%'));
select pg_temp.check('and now it is listed, next to the folder with no account',
  (select array_agg(f order by f) from public.orphan_avatar_files() f where f like '%-0000000025%')
  = array['00000000-0000-4000-8000-0000000025b2/22222222-2222-4222-8222-222222222222.gif',
          '00000000-0000-4000-8000-0000000025b9/33333333-3333-4333-8333-333333333333.jpg']);

-- On the real data: everything listed sits in a user-id folder with no account, and nothing a member still has.
select pg_temp.check('nothing listed belongs to an existing account',
  not exists (select 1 from public.orphan_avatar_files() f
              join auth.users u on u.id::text = split_part(f, '/', 1)));
select pg_temp.check('every listed name is in the avatars bucket',
  not exists (select 1 from public.orphan_avatar_files() f
              where not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = f)));

-- Only the secret key may ask: the names are other people's file paths.
select pg_temp.check('service_role may call it',
  has_function_privilege('service_role', 'public.orphan_avatar_files()', 'execute'));
set local role anon;
select pg_temp.expect('anon cannot list orphaned files', 'select public.orphan_avatar_files()', '42501');
reset role;
set local role authenticated;
select pg_temp.expect('members cannot list orphaned files', 'select public.orphan_avatar_files()', '42501');
reset role;

rollback;
