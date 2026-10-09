-- Demo sign-in checks (migrations 0020, 0021, 0025). One transaction, rolled back; raises on the first failure.
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

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000000d1', 'demo.real.exec@example.com', '{"full_name":"Real Exec"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d2', 'demo.member@example.com', '{"full_name":"Some Member"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'executive' where id = '00000000-0000-4000-8000-0000000000d1';
update private.settings set value = 'on' where key = 'demo_login';
-- Throwaway exec password for this run only (rolled back with everything else).
insert into private.settings (key, value) values ('demo_password_hash', extensions.crypt('test-only-pass', extensions.gen_salt('bf', 4)))
on conflict (key) do update set value = excluded.value;

-- Signed out: the login page sees the three demo admins and can fetch credentials.
set local role anon;
select pg_temp.check('three demo admins listed', (select count(*) from public.demo_logins()) = 3);
select pg_temp.check('credentials need the exec password', not exists (select 1 from public.demo_credentials('kaden-li', 'wrong')));
select pg_temp.check('credentials with the right password', exists (select 1 from public.demo_credentials('kaden-li', 'test-only-pass')));
select pg_temp.expect('anon cannot read demo table', $q$select * from private.demo_accounts$q$, '42501');
reset role;

-- A demo admin is an executive but can't change power.
select pg_temp.as_user((select user_id from private.demo_accounts where slug = 'jenna-bae'));
select pg_temp.check('demo admin is an executive', private.is_executive());
select pg_temp.expect('demo cannot change roles', $q$update public.profiles set role = 'executive' where id = '00000000-0000-4000-8000-0000000000d2'$q$, '42501');
select pg_temp.expect('demo cannot set passcode', $q$select public.set_admin_passcode('demo-try-12345678')$q$, '42501');
select pg_temp.expect('demo cannot switch demo off', $q$select public.set_demo_login(false)$q$, '42501');
select pg_temp.check('demo knows it is demo', public.am_demo());

-- A real executive turns it off: list empties, credentials vanish, old secret stops matching.
select pg_temp.as_admin();
create temp table old_secret as select secret, user_id from private.demo_accounts where slug = 'kaden-li';
grant select on old_secret to authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d1');
select pg_temp.check('real exec is not demo', not public.am_demo());
select public.set_demo_login(false);
select pg_temp.as_admin();
set local role anon;
select pg_temp.check('list empty when off', not exists (select 1 from public.demo_logins()));
select pg_temp.check('no credentials when off', not exists (select 1 from public.demo_credentials('kaden-li', 'test-only-pass')));
reset role;
select pg_temp.check('password rotated',
  (select u.encrypted_password from auth.users u join old_secret o on o.user_id = u.id)
    <> extensions.crypt((select secret from old_secret), (select u.encrypted_password from auth.users u join old_secret o on o.user_id = u.id)));

select 'demo: all checks passed' as result;
rollback;
