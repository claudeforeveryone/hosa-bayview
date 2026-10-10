-- Chapter code checks (migration 0090). Runs in one transaction and rolls back; raises on the first failure.
-- Uses throwaway users only. Inserts into auth.users stand in for the auth server: hosa.chapter_code_check = 'on'
-- makes this SQL session go through the same check the auth server's inserts do.
begin;

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
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

-- A sign-up as the auth server would make it, with whatever metadata the client sent.
create function pg_temp.signup(uid uuid, meta jsonb) returns void language plpgsql as $$
begin
  perform set_config('hosa.chapter_code_check', 'on', true);
  insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role)
  values (uid, 'cc.' || left(uid::text, 8) || '.' || right(uid::text, 4) || '@example.com', meta, now(), 'authenticated', 'authenticated');
  perform set_config('hosa.chapter_code_check', 'off', true);
exception when others then
  perform set_config('hosa.chapter_code_check', 'off', true);
  raise;
end $$;

-- c1: the executive. c2: another executive (gets told). c3: a member. c4: a banned executive.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000000c1', 'cc.exec@example.com', '{"full_name":"Code Exec"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c2', 'cc.exec2@example.com', '{"full_name":"Code Exec Two"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'cc.member@example.com', '{"full_name":"Code Member"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c4', 'cc.banned@example.com', '{"full_name":"Code Banned"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'executive'
  where id in ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000c4');
update public.profiles set banned_until = now() + interval '1 day', ban_reason = 'test'
  where id = '00000000-0000-4000-8000-0000000000c4';
-- Live misses would skew the limits: age them out.
update private.chapter_code_attempts set at = now() - interval '11 minutes' where at > now() - interval '10 minutes';

-- Start with no gate, without a DELETE (the MCP holds DELETE for confirmation).
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
select public.clear_chapter_passcode();
select pg_temp.as_admin();

-- No gate: sign-up is open, and a stray code never stays on the account.
select pg_temp.as_anon();
select pg_temp.check('no gate: anon sees it off', public.chapter_gate_active() = false);
select pg_temp.check('no gate: checking a code gives nothing', public.check_chapter_code('anything', '1.2.3.4') is null);
select pg_temp.as_admin();
select pg_temp.signup('00000000-0000-4000-8000-0000000000d1', '{"full_name":"Open Signup","chapter_code":"x","chapter_ticket":"y"}');
select pg_temp.check('no gate: sign-up works and makes a profile',
  exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000000d1' and full_name = 'Open Signup'));
select pg_temp.check('no gate: code and ticket stripped from metadata',
  (select raw_user_meta_data from auth.users where id = '00000000-0000-4000-8000-0000000000d1') = '{"full_name":"Open Signup"}'::jsonb);
select pg_temp.check('no gate: no misses counted', not exists (select 1 from private.chapter_code_attempts where at > now() - interval '10 minutes'));

-- Who can set it.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c3');
select pg_temp.expect('member cannot set', $q$select public.set_chapter_passcode('member-code')$q$, '42501');
select pg_temp.expect('member cannot clear', $q$select public.clear_chapter_passcode()$q$, '42501');
select pg_temp.expect('member cannot read settings', $q$select * from private.settings$q$, '42501');
select pg_temp.expect('member cannot read tickets', $q$select * from private.chapter_code_tickets$q$, '42501');
select pg_temp.expect('member cannot read attempts', $q$select * from private.chapter_code_attempts$q$, '42501');
select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c4');
select pg_temp.expect('banned executive cannot set', $q$select public.set_chapter_passcode('banned-code')$q$, '42501');
select pg_temp.expect('banned executive cannot clear', $q$select public.clear_chapter_passcode()$q$, '42501');
select pg_temp.as_admin();
select pg_temp.as_anon();
select pg_temp.expect('anon cannot set', $q$select public.set_chapter_passcode('anon-code')$q$, '42501');
select pg_temp.expect('anon cannot clear', $q$select public.clear_chapter_passcode()$q$, '42501');
select pg_temp.as_admin();

-- The executive turns it on.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
select pg_temp.expect('under 6 characters', $q$select public.set_chapter_passcode('five5')$q$, '22023');
select pg_temp.expect('over 72 characters', $q$select public.set_chapter_passcode(repeat('x', 73))$q$, '22023');
select public.set_chapter_passcode('bayview-2026');
select pg_temp.as_admin();
select pg_temp.check('only a bcrypt hash is stored',
  (select value from private.settings where key = 'chapter_passcode_hash') like '$2%'
  and (select value from private.settings where key = 'chapter_passcode_hash') not like '%bayview%');
select pg_temp.check('the other executive is told',
  exists (select 1 from public.notifications where user_id = '00000000-0000-4000-8000-0000000000c2'
          and kind = 'role' and title = 'Code Exec turned on the chapter code' and link = '/admin'));
select pg_temp.check('the setter is not notified',
  not exists (select 1 from public.notifications where user_id = '00000000-0000-4000-8000-0000000000c1' and title like '%chapter code%'));
select pg_temp.check('the admin log has it',
  exists (select 1 from public.admin_log where actor_id = '00000000-0000-4000-8000-0000000000c1'
          and action = 'chapter_code' and detail = 'Chapter code turned on'));
select pg_temp.check('the log never holds the code', not exists (select 1 from public.admin_log where detail like '%bayview-2026%'));
select pg_temp.as_anon();
select pg_temp.check('anon sees the gate on', public.chapter_gate_active());
select pg_temp.as_admin();

-- Gate on: no ticket, no account.
select pg_temp.expect('no ticket: sign-up refused',
  $q$select pg_temp.signup('00000000-0000-4000-8000-0000000000d2', '{"full_name":"No Ticket"}')$q$, '28000');
select pg_temp.expect('the raw code instead of a ticket: refused',
  $q$select pg_temp.signup('00000000-0000-4000-8000-0000000000d2', '{"full_name":"Raw Code","chapter_code":"bayview-2026"}')$q$, '28000');
select pg_temp.expect('a made-up ticket: refused',
  $q$select pg_temp.signup('00000000-0000-4000-8000-0000000000d2', '{"full_name":"Fake","chapter_ticket":"deadbeef"}')$q$, '28000');
select pg_temp.check('refused sign-ups leave nothing behind',
  not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000000d2'));
-- Direct SQL (fixtures, the SQL editor) is not the auth server and skips the check.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000000d3', 'cc.fixture@example.com', '{"full_name":"Fixture"}', now(), 'authenticated', 'authenticated');
select pg_temp.check('SQL fixtures still work with a gate on',
  exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000000d3'));

-- A wrong code gives nothing and counts; the right one gives a single-use ticket.
create temp table t (ticket text, old_ticket text) on commit drop;
grant all on t to anon, authenticated;
select pg_temp.as_anon();
select pg_temp.check('wrong code: no ticket', public.check_chapter_code('bayview-2025', '10.0.0.1') is null);
select pg_temp.check('null code: no ticket', public.check_chapter_code(null, '10.0.0.1') is null);
insert into t (ticket) values (public.check_chapter_code('bayview-2026', '10.0.0.1'));
select pg_temp.check('right code: a ticket', (select char_length(ticket) = 48 from t));
select pg_temp.as_admin();
select pg_temp.check('misses are stored per hashed IP, never the IP',
  (select count(*) from private.chapter_code_attempts where at > now() - interval '10 minutes') = 2
  and not exists (select 1 from private.chapter_code_attempts where ip_hash like '%10.0.0.1%'));
select pg_temp.check('the ticket is stored hashed', not exists (select 1 from private.chapter_code_tickets where ticket_hash = (select ticket from t)));

select pg_temp.signup('00000000-0000-4000-8000-0000000000d4',
  jsonb_build_object('full_name', 'With Ticket', 'grade', '10', 'chapter_ticket', (select ticket from t)));
select pg_temp.check('with a ticket: the account and profile are made',
  exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000000d4' and full_name = 'With Ticket' and grade = 10));
select pg_temp.check('with a ticket: the ticket is stripped from metadata',
  (select raw_user_meta_data from auth.users where id = '00000000-0000-4000-8000-0000000000d4') = '{"full_name":"With Ticket","grade":"10"}'::jsonb);
select pg_temp.expect('a used ticket is refused',
  format($q$select pg_temp.signup('00000000-0000-4000-8000-0000000000d5', jsonb_build_object('full_name', 'Reuse', 'chapter_ticket', %L))$q$,
         (select ticket from t)), '28000');

-- Metadata writes later (the auth server confirming, updateUser) are stripped too.
update auth.users set raw_user_meta_data = raw_user_meta_data || '{"chapter_ticket":"abc","chapter_code":"bayview-2026","email_verified":true}'
  where id = '00000000-0000-4000-8000-0000000000d4';
select pg_temp.check('metadata updates are stripped',
  (select raw_user_meta_data from auth.users where id = '00000000-0000-4000-8000-0000000000d4')
    = '{"full_name":"With Ticket","grade":"10","email_verified":true}'::jsonb);

-- An expired ticket is refused.
select pg_temp.as_anon();
update t set ticket = public.check_chapter_code('bayview-2026', '10.0.0.2');
select pg_temp.as_admin();
update private.chapter_code_tickets set expires_at = now() - interval '1 second' where true;
select pg_temp.expect('an expired ticket is refused',
  format($q$select pg_temp.signup('00000000-0000-4000-8000-0000000000d5', jsonb_build_object('full_name', 'Late', 'chapter_ticket', %L))$q$,
         (select ticket from t)), '28000');

-- Per-IP limit: 10 misses in 10 minutes locks that IP out, even with the right code. Other IPs still work.
select pg_temp.as_admin();
update private.chapter_code_attempts set at = now() - interval '11 minutes' where at > now() - interval '10 minutes';
select pg_temp.as_anon();
select public.check_chapter_code('wrong-' || g, '10.0.0.9') from generate_series(1, 10) g;
select pg_temp.expect('11th try from the same IP is throttled',
  $q$select public.check_chapter_code('bayview-2026', '10.0.0.9')$q$, '54000');
select pg_temp.check('another IP still works', public.check_chapter_code('bayview-2026', '10.0.0.10') is not null);
-- Missing IPs share one bucket.
select public.check_chapter_code('wrong-' || g, null) from generate_series(1, 10) g;
select pg_temp.expect('no IP shares one bucket', $q$select public.check_chapter_code('bayview-2026', '')$q$, '54000');
select pg_temp.as_admin();

-- Overall cap: 100 misses in 10 minutes from any mix of IPs locks everyone out.
update private.chapter_code_attempts set at = now() - interval '11 minutes' where at > now() - interval '10 minutes';
select pg_temp.as_anon();
select public.check_chapter_code('wrong', '172.16.0.' || g) from generate_series(1, 100) g;
select pg_temp.expect('the 101st miss locks out a fresh IP',
  $q$select public.check_chapter_code('bayview-2026', '192.168.1.1')$q$, '54000');
select pg_temp.as_admin();
update private.chapter_code_attempts set at = now() - interval '11 minutes' where at > now() - interval '10 minutes';

-- Changing the code kills the old one and any tickets minted for it.
select pg_temp.as_anon();
update t set old_ticket = public.check_chapter_code('bayview-2026', '10.0.1.1');
select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
select public.set_chapter_passcode('tigers-2027');
select pg_temp.as_admin();
select pg_temp.check('change is logged as a change',
  exists (select 1 from public.admin_log where action = 'chapter_code' and detail = 'Chapter code changed'));
select pg_temp.check('the other executive is told of the change',
  exists (select 1 from public.notifications where user_id = '00000000-0000-4000-8000-0000000000c2' and title = 'Code Exec changed the chapter code'));
select pg_temp.expect('a ticket from the old code is refused',
  format($q$select pg_temp.signup('00000000-0000-4000-8000-0000000000d6', jsonb_build_object('full_name', 'Old', 'chapter_ticket', %L))$q$,
         (select old_ticket from t)), '28000');
select pg_temp.as_anon();
select pg_temp.check('the old code is wrong now', public.check_chapter_code('bayview-2026', '10.0.1.2') is null);
select pg_temp.check('the new code works', public.check_chapter_code('tigers-2027', '10.0.1.2') is not null);
select pg_temp.as_admin();

-- Clearing opens sign-up again.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
select public.clear_chapter_passcode();
select pg_temp.as_admin();
select pg_temp.check('cleared: no hash', not exists (select 1 from private.settings where key = 'chapter_passcode_hash'));
select pg_temp.check('cleared: logged', exists (select 1 from public.admin_log where action = 'chapter_code' and detail = 'Chapter code cleared'));
select pg_temp.check('cleared: the other executive is told',
  exists (select 1 from public.notifications where user_id = '00000000-0000-4000-8000-0000000000c2' and title = 'Code Exec turned off the chapter code'));
select pg_temp.check('cleared: tickets gone', not exists (select 1 from private.chapter_code_tickets));
select pg_temp.signup('00000000-0000-4000-8000-0000000000d7', '{"full_name":"Open Again"}');
select pg_temp.check('cleared: sign-up works without a code', exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000000d7'));
-- Clearing twice is a quiet no-op.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
select public.clear_chapter_passcode();
select pg_temp.as_admin();
select pg_temp.check('clearing twice logs once', (select count(*) from public.admin_log where action = 'chapter_code' and detail = 'Chapter code cleared') = 1);
select pg_temp.as_anon();
select pg_temp.check('cleared: anon sees it off', public.chapter_gate_active() = false);
select pg_temp.as_admin();

select 'chapter passcode: all checks passed' as result;
rollback;
