-- Taking a warning back (migration 0290). One transaction, rolled back; raises on the first failure.
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

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000009e1', 'authenticated', 'authenticated', 'rw.exec@example.com', '{"full_name":"Rw Exec"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000009a1', 'authenticated', 'authenticated', 'rw.trainee@example.com', '{"full_name":"Rw Trainee"}', now());
update public.profiles set role = 'executive' where id = '00000000-0000-4000-8000-0000000009e1';

select pg_temp.as_user('00000000-0000-4000-8000-0000000009e1');
select public.warn_member('00000000-0000-4000-8000-0000000009a1', 'First');
select public.warn_member('00000000-0000-4000-8000-0000000009a1', 'Second');
select pg_temp.as_admin();

-- The trainee can't take a warning back.
select pg_temp.as_user('00000000-0000-4000-8000-0000000009a1');
select pg_temp.check('trainee sees both', (select count(*) from public.user_warnings) = 2);
select pg_temp.expect('trainee cannot remove',
  $q$select public.remove_warning((select id from public.user_warnings where message = 'First'))$q$, '42501');
select pg_temp.as_admin();

-- The executive removes one: it's gone for both of them, kept in the table, and logged.
select pg_temp.as_user('00000000-0000-4000-8000-0000000009e1');
select public.remove_warning((select id from public.user_warnings where message = 'First'
  and user_id = '00000000-0000-4000-8000-0000000009a1'));
select pg_temp.check('exec no longer lists it',
  (select count(*) from public.user_warnings where user_id = '00000000-0000-4000-8000-0000000009a1') = 1);
select pg_temp.as_admin();
select pg_temp.check('row kept with who and when', (select removed_by = '00000000-0000-4000-8000-0000000009e1'
  and removed_at is not null from public.user_warnings
  where user_id = '00000000-0000-4000-8000-0000000009a1' and message = 'First'));
select pg_temp.check('logged', exists (select 1 from public.admin_log where action = 'unwarned'
  and target_id = '00000000-0000-4000-8000-0000000009a1' and detail = 'First'));
-- A warning on your own account (from before you were an executive) stays yours to clear, not to remove.
insert into public.user_warnings (id, user_id, message)
  values ('00000000-0000-4000-8000-0000000009f1', '00000000-0000-4000-8000-0000000009e1', 'Own');
select pg_temp.as_user('00000000-0000-4000-8000-0000000009e1');
select pg_temp.expect('removing twice says gone',
  $q$select public.remove_warning((select w.id from public.user_warnings w where w.message = 'First'
    and w.user_id = '00000000-0000-4000-8000-0000000009a1' and w.removed_at is not null))$q$, 'P0002');
select pg_temp.expect('a missing id says gone', $q$select public.remove_warning(gen_random_uuid())$q$, 'P0002');
select pg_temp.expect('own warning refused',
  $q$select public.remove_warning('00000000-0000-4000-8000-0000000009f1')$q$, 'P0001');
select pg_temp.as_admin();

select pg_temp.as_user('00000000-0000-4000-8000-0000000009a1');
select pg_temp.check('trainee banner no longer has it', (select count(*) from public.user_warnings) = 1);
select pg_temp.as_admin();

rollback;
