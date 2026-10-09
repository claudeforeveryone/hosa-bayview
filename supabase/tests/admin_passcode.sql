-- Admin passcode checks (migrations 0014, 0015). Runs in one transaction and rolls back; raises on the first failure.
-- Uses throwaway users only, so it works on an empty database too.
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

-- a1: member who claims. a2: bystander. a3: trainer. a4: the executive.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'pc.member@example.com', '{"full_name":"Pass Member"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'pc.bystander@example.com', '{"full_name":"Pass Bystander"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a3', 'pc.trainer@example.com', '{"full_name":"Pass Trainer"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a4', 'pc.exec@example.com', '{"full_name":"Pass Exec"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'trainer' where id = '00000000-0000-4000-8000-0000000000a3';
update public.profiles set role = 'executive' where id = '00000000-0000-4000-8000-0000000000a4';
delete from private.settings where key = 'admin_passcode_hash';

-- No passcode set yet: nothing works.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.check('no passcode set returns false', public.claim_admin('anything-at-all') = false);
select pg_temp.check('non-exec cannot see whether it is set', public.admin_passcode_is_set() = false);
select pg_temp.expect('member cannot set passcode', $q$select public.set_admin_passcode('member-try-123456')$q$, '42501');
select pg_temp.expect('member still cannot change own role', $q$update public.profiles set role = 'executive' where id = '00000000-0000-4000-8000-0000000000a1'$q$, '42501');
select pg_temp.expect('member cannot read passcode attempts', $q$select * from private.passcode_attempts$q$, '42501');
select pg_temp.expect('member cannot read settings', $q$select * from private.settings$q$, '42501');

select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
select pg_temp.expect('trainer cannot set passcode', $q$select public.set_admin_passcode('trainer-try-123456')$q$, '42501');

-- The executive sets it.
select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a4');
select pg_temp.expect('under 12 characters', $q$select public.set_admin_passcode('elevenchars')$q$, '22023');
select public.set_admin_passcode('first-passcode-2026');
select pg_temp.check('exec sees it is set', public.admin_passcode_is_set());

select pg_temp.as_admin();
select pg_temp.check('only a bcrypt hash is stored',
  (select value from private.settings where key = 'admin_passcode_hash') like '$2%'
  and (select value from private.settings where key = 'admin_passcode_hash') not like '%first-passcode%');

-- Wrong guesses are counted and capped (the no-passcode try above already counted once).
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.check('wrong passcode returns false', public.claim_admin('wrong-guess-1') = false);
select pg_temp.check('still a trainee', (select role from public.profiles where id = '00000000-0000-4000-8000-0000000000a1') = 'trainee');
select public.claim_admin('wrong-guess-' || g) from generate_series(2, 4) g;
select pg_temp.expect('sixth try is throttled', $q$select public.claim_admin('first-passcode-2026')$q$, '54000');

-- Tries older than 10 minutes stop counting.
select pg_temp.as_admin();
update private.passcode_attempts set at = now() - interval '11 minutes' where user_id = '00000000-0000-4000-8000-0000000000a1';

-- Rotating the passcode kills the old one.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a4');
select public.set_admin_passcode('second-passcode-2026');
select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.check('old passcode no longer works', public.claim_admin('first-passcode-2026') = false);

-- The right passcode promotes the caller and nobody else.
select pg_temp.check('new passcode works', public.claim_admin('second-passcode-2026'));
select pg_temp.check('caller is now an executive', (select role from public.profiles where id = '00000000-0000-4000-8000-0000000000a1') = 'executive');
select pg_temp.check('grant flag is off after the call', coalesce(current_setting('hosa.passcode_grant', true), '') <> 'on');
select pg_temp.as_admin();
select pg_temp.check('bystander unchanged', (select role from public.profiles where id = '00000000-0000-4000-8000-0000000000a2') = 'trainee');
select pg_temp.check('attempts cleared after success', not exists (select 1 from private.passcode_attempts where user_id = '00000000-0000-4000-8000-0000000000a1'));

-- The last-executive rule survives the guard rewrite.
update public.profiles set role = 'trainee' where role = 'executive' and id <> '00000000-0000-4000-8000-0000000000a4';
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a4');
select pg_temp.expect('last executive cannot demote themselves', $q$update public.profiles set role = 'trainee' where id = '00000000-0000-4000-8000-0000000000a4'$q$, 'P0001');

select pg_temp.as_admin();
set local role anon;
select pg_temp.expect('anon cannot claim', $q$select public.claim_admin('second-passcode-2026')$q$, '42501');
reset role;

select 'admin passcode: all checks passed' as result;
rollback;
