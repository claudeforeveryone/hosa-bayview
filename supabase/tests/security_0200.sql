-- Omega security checks: audit H1, H2, M1, M4, M7, the chapter-code gate (0090) and battles (0095-0098), for
-- migrations 0200-0204. Impersonates anon, a trainee and an executive, and plays the auth server for sign-ups while
-- a chapter code is on. One transaction that rolls back; raises if any check fails.
-- Writes only rows the rollback removes (a chapter code, two throwaway sign-ups). It makes no classrooms, tests,
-- decks or admin_log rows, whose number sequences would move on a live project even after a rollback.
-- Accounts: set omega.trainee_id and omega.exec_id first to pick them (ids are never committed); otherwise the
-- newest trainee and the oldest executive are used. Set omega.report_only = 'on' to list results without raising
-- (shows which checks fail before the migrations are applied).
begin;
set local lock_timeout = '3s';

create temp table _s (test text, result text, pass boolean);
create temp table _t (k text primary key, v text);
grant all on _s, _t to anon, authenticated, service_role;

-- expect(label, sql, sqlstate): runs sql as the current role. '' means it must succeed; otherwise it must fail
-- with that sqlstate.
create function pg_temp.expect(label text, stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  insert into _s values (label, 'no error', state = '');
exception when others then
  insert into _s values (label, sqlstate || ' ' || sqlerrm, sqlstate = state);
end $$;

-- ok(label, sql): sql returns one boolean, which must be true. Errors count as failures.
create function pg_temp.ok(label text, q text) returns void language plpgsql as $$
declare r boolean;
begin
  execute q into r;
  insert into _s values (label, coalesce(r::text, 'null'), coalesce(r, false));
exception when others then
  insert into _s values (label, sqlstate || ' ' || sqlerrm, false);
end $$;

-- keep(key, sql): stores sql's one text result in _t for later checks. Errors store null.
create function pg_temp.keep(key text, q text) returns void language plpgsql as $$
declare r text;
begin
  execute q into r;
  insert into _t values (key, r) on conflict (k) do update set v = excluded.v;
exception when others then
  insert into _t values (key, null) on conflict (k) do update set v = excluded.v;
  insert into _s values ('keep ' || key, sqlstate || ' ' || sqlerrm, false);
end $$;
grant execute on function pg_temp.expect(text, text, text), pg_temp.ok(text, text), pg_temp.keep(text, text)
  to anon, authenticated, service_role;

create temp table _who as
select
  coalesce(nullif(current_setting('omega.trainee_id', true), '')::uuid,
    (select p.id from public.profiles p
     where p.role = 'trainee' and (p.banned_until is null or p.banned_until <= now())
     order by p.created_at desc limit 1)) as trainee_id,
  coalesce(nullif(current_setting('omega.exec_id', true), '')::uuid,
    (select p.id from public.profiles p where p.role = 'executive' order by p.created_at limit 1)) as exec_id;
grant select on _who to anon, authenticated, service_role;

select pg_temp.ok('setup: the trainee account is a trainee',
  'select role = ''trainee'' from public.profiles where id = (select trainee_id from _who)');
select pg_temp.ok('setup: the executive account is an executive',
  'select role = ''executive'' from public.profiles where id = (select exec_id from _who)');

-- ---- Catalog ------------------------------------------------------------------------------------------------------
select pg_temp.ok('H1: authenticated has no SELECT on attempts.score',
  $q$select not has_column_privilege('authenticated', 'public.attempts', 'score', 'SELECT')$q$);
select pg_temp.ok('H1: authenticated keeps SELECT on every other attempts column',
  $q$select bool_and(has_column_privilege('authenticated', 'public.attempts', a.attname, 'SELECT'))
     from pg_attribute a where a.attrelid = 'public.attempts'::regclass and a.attnum > 0 and not a.attisdropped
       and a.attname <> 'score'$q$);
select pg_temp.ok('M7: authenticated has no INSERT or DELETE on profiles',
  $q$select not has_table_privilege('authenticated', 'public.profiles', 'INSERT')
       and not has_table_privilege('authenticated', 'public.profiles', 'DELETE')$q$);
select pg_temp.ok('M1: the first-executive bootstrap never reads an email setting',
  $q$select position('first_executive_email' in p.prosrc) = 0 from pg_proc p
     where p.oid = 'private.maybe_promote_first_exec(uuid, text, boolean)'::regprocedure$q$);
select pg_temp.ok('M1: only the database itself can run the bootstrap',
  $q$select not has_function_privilege('authenticated', 'private.maybe_promote_first_exec(uuid, text, boolean)', 'EXECUTE')
       and not has_function_privilege('anon', 'private.maybe_promote_first_exec(uuid, text, boolean)', 'EXECUTE')$q$);
select pg_temp.ok('H2 gate: the chapter-code trigger is on auth.users and enabled',
  $q$select exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
                   and tgname = 'on_auth_user_chapter_code' and tgenabled = 'O')$q$);
select pg_temp.ok('H2 gate: only the server (service_role) may test a code',
  $q$select has_function_privilege('service_role', 'public.check_chapter_code(text, text)', 'EXECUTE')
       and not has_function_privilege('authenticated', 'public.check_chapter_code(text, text)', 'EXECUTE')
       and not has_function_privilege('anon', 'public.check_chapter_code(text, text)', 'EXECUTE')$q$);
select pg_temp.ok('battles: battle_answers has no client grant and battle_rounds.question_id is not granted',
  $q$select not has_table_privilege('authenticated', 'public.battle_answers', 'SELECT')
       and not has_column_privilege('authenticated', 'public.battle_rounds', 'question_id', 'SELECT')$q$);
select pg_temp.ok('every public table has RLS on',
  $q$select count(*) = 0 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity$q$);
select pg_temp.ok('anon holds no table or column privilege in public or private',
  $q$select count(*) = 0 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'private') and c.relkind in ('r', 'v', 'm', 'p')
       and (has_any_column_privilege('anon', c.oid, 'SELECT') or has_any_column_privilege('anon', c.oid, 'INSERT')
            or has_any_column_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'))$q$);
select pg_temp.ok('every security definer function pins an empty search_path',
  $q$select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef
       and not coalesce(p.proconfig @> array['search_path=""'], false)$q$);
select pg_temp.ok('anon can run only keepalive and chapter_gate_active among definer functions',
  $q$select coalesce(array_agg(p.proname::text order by p.proname), '{}') <@ array['chapter_gate_active', 'keepalive']
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')$q$);

-- ---- anon ---------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;
select pg_temp.expect('anon: attempts refused', 'select id from public.attempts limit 1', '42501');
select pg_temp.expect('anon: profiles refused', 'select id from public.profiles limit 1', '42501');
select pg_temp.expect('anon: member_directory refused', 'select * from public.member_directory()', '42501');
select pg_temp.expect('anon: member_details refused', 'select * from public.member_details()', '42501');
select pg_temp.expect('anon: member_stats refused', 'select * from public.member_stats(gen_random_uuid())', '42501');
select pg_temp.expect('anon: leaderboard refused', $q$select * from public.leaderboard('all', null)$q$, '42501');
select pg_temp.expect('anon: gif_exempt_ids refused', 'select * from public.gif_exempt_ids()', '42501');
select pg_temp.expect('anon: check_chapter_code refused', $q$select public.check_chapter_code('x', '203.0.113.1')$q$, '42501');
select pg_temp.expect('anon: set_chapter_passcode refused', $q$select public.set_chapter_passcode('abcdefgh')$q$, '42501');
select pg_temp.expect('anon: chapter_gate_active allowed (the sign-up form asks)', 'select public.chapter_gate_active()', '');
select pg_temp.expect('anon: battle_state refused', 'select public.battle_state(gen_random_uuid())', '42501');
select pg_temp.expect('anon: import_questions_bulk refused',
  $q$select public.import_questions_bulk(gen_random_uuid(), '[]'::jsonb)$q$, '42501');
select pg_temp.expect('anon: private helpers refused', 'select private.is_executive()', '42501');
reset role;

-- ---- trainee ------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', (select trainee_id from _who), 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.expect('H1 trainee: attempts.score refused', 'select score from public.attempts limit 1', '42501');
select pg_temp.expect('H1 trainee: select * from attempts refused', 'select * from public.attempts limit 1', '42501');
select pg_temp.expect('H1 trainee: the other attempts columns still read',
  'select id, test_id, user_id, mode, started_at, deadline, submitted_at, total, counts from public.attempts limit 1', '');
select pg_temp.ok('H1 trainee: attempt_list returns only their own runs',
  'select count(*) filter (where user_id <> (select trainee_id from _who)) = 0 from public.attempt_list(null, null, null)');
select pg_temp.ok('H2 trainee: member_directory returns no rows',
  'select count(*) = 0 from public.member_directory()');
select pg_temp.ok('H2 trainee: profiles shows only their own row',
  'select count(*) filter (where id <> (select trainee_id from _who)) = 0 from public.profiles');
select pg_temp.expect('H2 trainee: member_details still works (board pictures)', 'select * from public.member_details()', '');
select pg_temp.expect('H2 trainee: leaderboard still works', $q$select * from public.leaderboard('all', null)$q$, '');
select pg_temp.expect('H2 trainee: member_stats still works (member pages)',
  'select * from public.member_stats((select exec_id from _who))', '');
select pg_temp.expect('H2 trainee: check_chapter_code refused', $q$select public.check_chapter_code('x', '203.0.113.1')$q$, '42501');
select pg_temp.expect('H2 trainee: set_chapter_passcode refused', $q$select public.set_chapter_passcode('abcdefgh')$q$, '42501');
select pg_temp.expect('H2 trainee: clear_chapter_passcode refused', 'select public.clear_chapter_passcode()', '42501');
select pg_temp.expect('M1 trainee: cannot run the first-exec bootstrap',
  $q$select private.maybe_promote_first_exec(gen_random_uuid(), 'x@example.com', true)$q$, '42501');
select pg_temp.ok('M4 trainee: can_use_gif(executive) is false',
  'select not coalesce(public.can_use_gif((select exec_id from _who)), false)');
select pg_temp.ok('M4 trainee: can_use_gif(self) still answers',
  'select public.can_use_gif((select trainee_id from _who)) is not null');
select pg_temp.ok('M4 trainee: gif_exempt_ids shows no one else',
  'select count(*) filter (where x.uid <> (select trainee_id from _who)) = 0 from public.gif_exempt_ids() as x(uid)');
select pg_temp.ok('M4 trainee: gif_user_ids is empty', 'select count(*) = 0 from public.gif_user_ids()');
select pg_temp.expect('M7 trainee: inserting a profile refused',
  $q$insert into public.profiles (id, full_name) values (gen_random_uuid(), 'x')$q$, '42501');
select pg_temp.expect('M7 trainee: deleting a profile refused', 'delete from public.profiles where false', '42501');
select pg_temp.expect('trainee: storage_usage refused', 'select * from public.storage_usage()', '42501');
select pg_temp.expect('trainee: dev_member_stats refused', $q$select * from public.dev_member_stats('all')$q$, '42501');
select pg_temp.expect('trainee: set_admin_passcode refused', $q$select public.set_admin_passcode('abcdefghijklmnop')$q$, '42501');
select pg_temp.expect('trainee: claim_admin refused', $q$select public.claim_admin('anything')$q$, '42501');
select pg_temp.expect('trainee: ban_member refused',
  $q$select public.ban_member((select exec_id from _who), now() + interval '1 day', 'x')$q$, '42501');
select pg_temp.expect('trainee: private.settings refused', 'select * from private.settings', '42501');
select pg_temp.expect('trainee: import_questions_bulk on a test they do not manage refused',
  $q$select public.import_questions_bulk(gen_random_uuid(), '[{"prompt":"q","options":["a","b"],"correct":0}]'::jsonb)$q$, '42501');
select pg_temp.expect('battles trainee: battle_answers refused', 'select * from public.battle_answers limit 1', '42501');
select pg_temp.expect('battles trainee: battle_rounds.question_id refused',
  'select question_id from public.battle_rounds limit 1', '42501');
select pg_temp.expect('battles trainee: battle_state of a battle they cannot see refused',
  'select public.battle_state(gen_random_uuid())', '42501');
select pg_temp.expect('battles trainee: battle_wins works', 'select public.battle_wins((select trainee_id from _who))', '');
reset role;

-- ---- executive ----------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', (select exec_id from _who), 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.expect('H1 executive: attempts.score refused too (scores come through the RPCs)',
  'select score from public.attempts limit 1', '42501');
select pg_temp.expect('H1 executive: attempt_list works', 'select * from public.attempt_list(null, null, null)', '');
select pg_temp.ok('H2 executive: member_directory lists every member',
  'select (select count(*) from public.member_directory()) = (select count(*) from public.profiles)');
select pg_temp.expect('H2 executive: check_chapter_code is still server only',
  $q$select public.check_chapter_code('x', '203.0.113.1')$q$, '42501');
select pg_temp.expect('M4 executive: gif_exempt_ids works', 'select count(*) from public.gif_exempt_ids()', '');
select pg_temp.ok('M4 executive: can_use_gif(member) answers',
  'select public.can_use_gif((select trainee_id from _who)) is not null');
select pg_temp.expect('executive: storage_usage works', 'select * from public.storage_usage()', '');
reset role;

-- ---- The chapter code gate, end to end ----------------------------------------------------------------------------
-- An executive sets a code (here by hand, to keep admin_log's id sequence where it is).
insert into private.settings (key, value)
values ('chapter_passcode_hash', extensions.crypt('omega-gate-check', extensions.gen_salt('bf', 4)))
on conflict (key) do update set value = excluded.value;
-- A stale first-executive setting must not promote anyone (M1).
insert into private.settings (key, value) values ('first_executive_email', 'omega.gate.e2@example.com')
on conflict (key) do update set value = excluded.value;

set local role anon;
select pg_temp.ok('H2 gate: the sign-up form sees the gate', 'select public.chapter_gate_active()');
reset role;

-- The sign-up action tests the code with the server key and the caller's IP.
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
set local role service_role;
select pg_temp.keep('wrong', $q$select public.check_chapter_code('not-the-code', '203.0.113.7')$q$);
select pg_temp.keep('right', $q$select public.check_chapter_code('omega-gate-check', '203.0.113.7')$q$);
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.ok('H2 gate: a wrong code gets no ticket', $q$select v is null from _t where k = 'wrong'$q$);
select pg_temp.ok('H2 gate: the right code gets a ticket', $q$select char_length(v) = 48 from _t where k = 'right'$q$);

-- The auth server's insert. hosa.chapter_code_check = 'on' makes this SQL session go through the same check.
select set_config('hosa.chapter_code_check', 'on', true);
select pg_temp.expect('H2 gate: a sign-up without a ticket is refused',
  $q$insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role)
     values ('00000000-0000-4000-8000-0000000000e1', 'omega.gate.e1@example.com', '{"full_name":"Gate One"}', now(),
             'authenticated', 'authenticated')$q$, '28000');
select pg_temp.expect('H2 gate: a sign-up with the ticket goes through',
  format($q$insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role)
            values ('00000000-0000-4000-8000-0000000000e2', 'omega.gate.e2@example.com', %L::jsonb, now(),
                    'authenticated', 'authenticated')$q$,
         json_build_object('full_name', 'Gate Two', 'chapter_ticket', (select v from _t where k = 'right'))::text), '');
select pg_temp.expect('H2 gate: the same ticket does not work twice',
  format($q$insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role)
            values ('00000000-0000-4000-8000-0000000000e3', 'omega.gate.e3@example.com', %L::jsonb, now(),
                    'authenticated', 'authenticated')$q$,
         json_build_object('full_name', 'Gate Three', 'chapter_ticket', (select v from _t where k = 'right'))::text), '28000');
select set_config('hosa.chapter_code_check', 'off', true);
select pg_temp.ok('H2 gate: the ticket is not kept on the account',
  $q$select not (raw_user_meta_data ? 'chapter_ticket') from auth.users where id = '00000000-0000-4000-8000-0000000000e2'$q$);
select pg_temp.ok('M1: signing up with the stale first-executive email gives a trainee',
  $q$select role = 'trainee' from public.profiles where id = '00000000-0000-4000-8000-0000000000e2'$q$);

do $$
declare bad text;
begin
  select string_agg(test || ' [' || result || ']', ' | ' order by test) into bad from _s where not pass;
  if bad is not null and coalesce(current_setting('omega.report_only', true), '') <> 'on' then
    raise exception 'security_0200 FAILED: %', bad;
  end if;
end $$;

select count(*) as checks, count(*) filter (where pass) as passed,
  coalesce(json_agg(json_build_object('test', test, 'result', result) order by test) filter (where not pass), '[]') as failures
from _s;

rollback;
