-- Battles (Task 18, migrations 0095-0098): RLS, key secrecy before a round closes (in battles and in the test
-- RPCs), one answer per round, late answers refused after the grace, the advance race, away players, stale
-- battles, non-members and banned members kept out, no Elo, wins and the farm rule, realtime wiring.
-- Runs in one transaction and rolls back. Every check runs; the last statement raises with the failures (or
-- returns "all passed"). Throwaway users only. Run with the Supabase MCP execute_sql.
-- now() is fixed inside one transaction, so the tests move round clocks by hand (as the admin) instead of waiting.
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

-- Ids: kind 1801 users, 1802 rooms, 1803 tests, 1804 questions.
create function pg_temp.id(kind int, n int) returns uuid language sql immutable as $$
  select format('00000000-0000-4000-8000-%s', lpad(kind::text, 4, '0') || lpad(n::text, 8, '0'))::uuid
$$;
create function pg_temp.u(n int) returns uuid language sql immutable as $$ select pg_temp.id(1801, n) $$;
create function pg_temp.r(n int) returns uuid language sql immutable as $$ select pg_temp.id(1802, n) $$;
create function pg_temp.t(n int) returns uuid language sql immutable as $$ select pg_temp.id(1803, n) $$;
create function pg_temp.q(n int) returns uuid language sql immutable as $$ select pg_temp.id(1804, n) $$;

create function pg_temp.save(k text, v uuid) returns void language sql as $$
  select set_config('bt.' || k, v::text, true)
$$;
create function pg_temp.get(k text) returns uuid language sql as $$
  select nullif(current_setting('bt.' || k, true), '')::uuid
$$;

create function pg_temp.fail(label text, why text) returns void language plpgsql as $$
begin
  perform set_config('bt.fails',
    coalesce(current_setting('bt.fails', true), '') || E'\n  - ' || label || coalesce(' [' || why || ']', ''), true);
end $$;

create function pg_temp.tick() returns void language plpgsql as $$
begin
  perform set_config('bt.n', (coalesce(nullif(current_setting('bt.n', true), ''), '0')::int + 1)::text, true);
end $$;

-- A check: q returns one boolean. Errors count as failures and do not stop the run.
create function pg_temp.ok(label text, q text) returns void language plpgsql as $$
declare r boolean;
begin
  perform pg_temp.tick();
  begin
    execute q into r;
  exception when others then
    perform pg_temp.fail(label, sqlstate || ' ' || sqlerrm);
    return;
  end;
  if not coalesce(r, false) then perform pg_temp.fail(label, null); end if;
end $$;

-- A setup step: must succeed.
create function pg_temp.step(label text, q text) returns void language plpgsql as $$
begin
  perform pg_temp.tick();
  begin
    execute q;
  exception when others then
    perform pg_temp.fail('setup: ' || label, sqlstate || ' ' || sqlerrm);
  end;
end $$;

-- Must fail with the given SQLSTATE.
create function pg_temp.expect(label text, q text, state text) returns void language plpgsql as $$
declare ok boolean := false;
begin
  perform pg_temp.tick();
  begin
    execute q;
  exception when others then
    if sqlstate = state then ok := true;
    else perform pg_temp.fail(label, 'expected ' || state || ', got ' || sqlstate || ' ' || sqlerrm); return;
    end if;
  end;
  if not ok then perform pg_temp.fail(label, 'expected ' || state || ', got success'); end if;
end $$;

create function pg_temp.report() returns text language plpgsql as $$
declare f text := coalesce(current_setting('bt.fails', true), '');
begin
  if f <> '' then
    raise exception 'battles: % of % checks failed:%', array_length(string_to_array(trim(leading E'\n' from f), E'\n'), 1),
      current_setting('bt.n', true), f;
  end if;
  return 'battles: all ' || current_setting('bt.n', true) || ' checks passed';
end $$;

-- The battle's state as the current user.
create function pg_temp.st() returns jsonb language sql as $$ select public.battle_state(pg_temp.get('b1')) $$;

-- Fixtures ------------------------------------------------------------------------------------------------------
-- r1: MC event run by trainer u1; u2-u6 members (u6 banned). u7 outside. u8 an executive. r2: a showcase event.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role)
select pg_temp.u(i), 'battle.test' || i || '@example.com', json_build_object('full_name', 'Battle Test ' || i)::jsonb,
  now(), 'authenticated', 'authenticated'
from generate_series(1, 8) i;
update public.profiles set role = 'trainer' where id = pg_temp.u(1);
update public.profiles set role = 'executive' where id = pg_temp.u(8);
update public.profiles set banned_until = now() + interval '1 day' where id = pg_temp.u(6);

insert into public.classrooms (id, name, owner_id, category) values
  (pg_temp.r(1), 'Battle room', pg_temp.u(1), 'mc'),
  (pg_temp.r(2), 'Showcase room', pg_temp.u(1), 'showcase');
insert into public.classroom_members (classroom_id, user_id)
select pg_temp.r(1), pg_temp.u(i) from generate_series(2, 6) i;
insert into public.classroom_members (classroom_id, user_id) values (pg_temp.r(2), pg_temp.u(2));

-- t1 published, timed (10 min) with practice on and no cap (6 questions, key A). t2 a draft. t3 published with answers hidden. t4 a capped timed test.
-- t5 in the showcase room.
insert into public.tests (id, classroom_id, title, is_published, created_by, time_limit_minutes) values
  (pg_temp.t(1), pg_temp.r(1), 'Battle set', true, pg_temp.u(1), 10);
insert into public.tests (id, classroom_id, title, is_published, created_by) values
  (pg_temp.t(2), pg_temp.r(1), 'Draft set', false, pg_temp.u(1)),
  (pg_temp.t(5), pg_temp.r(2), 'Showcase set', true, pg_temp.u(1));
insert into public.tests (id, classroom_id, title, is_published, created_by, show_answers) values
  (pg_temp.t(3), pg_temp.r(1), 'Hidden set', true, pg_temp.u(1), false);
insert into public.tests (id, classroom_id, title, is_published, created_by, time_limit_minutes, attempts_allowed) values
  (pg_temp.t(4), pg_temp.r(1), 'Capped set', true, pg_temp.u(1), 10, 1);
insert into public.questions (id, test_id, position, prompt, options)
select pg_temp.q(i), pg_temp.t(1), i, 'Battle Q' || i, array['a', 'b', 'c', 'd'] from generate_series(1, 6) i;
insert into public.questions (id, test_id, position, prompt, options) values
  (pg_temp.q(21), pg_temp.t(2), 1, 'Draft Q', array['a', 'b']),
  (pg_temp.q(31), pg_temp.t(3), 1, 'Hidden Q', array['a', 'b']),
  (pg_temp.q(41), pg_temp.t(4), 1, 'Capped Q', array['a', 'b']),
  (pg_temp.q(51), pg_temp.t(5), 1, 'Showcase Q', array['a', 'b']);
insert into public.question_keys (question_id, correct_index)
select q.id, 0 from public.questions q where q.test_id in (pg_temp.t(1), pg_temp.t(2), pg_temp.t(3), pg_temp.t(4), pg_temp.t(5));

-- Schema ---------------------------------------------------------------------------------------------------------
select pg_temp.ok('schema: RLS on all four battle tables', $q$
  select count(*) = 4 and bool_and(relrowsecurity) from pg_class
  where oid in ('public.battles'::regclass, 'public.battle_players'::regclass, 'public.battle_rounds'::regclass,
                'public.battle_answers'::regclass)$q$);
select pg_temp.ok('schema: members cannot write battle tables or read answers straight off the table', $q$
  select not has_table_privilege('authenticated', 'public.battles', 'INSERT')
     and not has_table_privilege('authenticated', 'public.battles', 'UPDATE')
     and not has_table_privilege('authenticated', 'public.battle_players', 'INSERT')
     and not has_table_privilege('authenticated', 'public.battle_rounds', 'UPDATE')
     and not has_table_privilege('authenticated', 'public.battle_answers', 'SELECT')
     and not has_table_privilege('authenticated', 'public.battle_answers', 'INSERT')
     and not has_table_privilege('anon', 'public.battles', 'SELECT')$q$);
select pg_temp.ok('schema: battle_rounds has no key column, and question_id is not granted to members', $q$
  select not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'battle_rounds'
                     and column_name in ('correct_index', 'explanation', 'is_correct'))
     and not has_column_privilege('authenticated', 'public.battle_rounds', 'question_id', 'SELECT')
     and has_column_privilege('authenticated', 'public.battle_rounds', 'ends_at', 'SELECT')$q$);
select pg_temp.ok('realtime: battle_rounds is on the supabase_realtime publication', $q$
  select exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                 and schemaname = 'public' and tablename = 'battle_rounds')$q$);
select pg_temp.ok('realtime: channel read policy exists, no client send policy', $q$
  select exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                 and policyname = 'battle channel: room viewers receive' and cmd = 'SELECT')
     and not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                     and cmd in ('INSERT', 'ALL') and policyname ilike '%battle%')$q$);
select pg_temp.ok('realtime: one poke per action from the RPCs, no per-row sync triggers', $q$
  select to_regprocedure('private.battle_poke(uuid)') is not null
     and not exists (select 1 from pg_trigger where tgname = 'battle_sync')$q$);
select pg_temp.ok('scoring: 100 + linear bonus up to 50 (20 s = 150, 10 s = 125, 0 s = 100, grace and late clamp)', $q$
  select private.battle_points(interval '20 seconds') = 150 and private.battle_points(interval '10 seconds') = 125
     and private.battle_points(interval '0 seconds') = 100 and private.battle_points(interval '-1.5 seconds') = 100
     and private.battle_points(interval '30 seconds') = 150 and private.battle_points(interval '5 seconds') = 113$q$);

-- Who may host ---------------------------------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(7));
select pg_temp.expect('non-member cannot create a battle', $q$select public.create_battle(pg_temp.r(1), '1v1', null, 5)$q$, '42501');
select pg_temp.as_user(pg_temp.u(6));
select pg_temp.expect('banned member cannot create a battle', $q$select public.create_battle(pg_temp.r(1), '1v1', null, 5)$q$, '42501');
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.expect('no battles in a showcase event', $q$select public.create_battle(pg_temp.r(2), '1v1', null, 5)$q$, '22023');
select pg_temp.expect('a draft test is not a source', $q$select public.create_battle(pg_temp.r(1), '1v1', pg_temp.t(2), 5)$q$, '22023');
select pg_temp.expect('a test with answers hidden is not a source', $q$select public.create_battle(pg_temp.r(1), '1v1', pg_temp.t(3), 5)$q$, '22023');
select pg_temp.expect('a capped timed test is not a source', $q$select public.create_battle(pg_temp.r(1), '1v1', pg_temp.t(4), 5)$q$, '22023');
select pg_temp.expect('question count below 5 refused', $q$select public.create_battle(pg_temp.r(1), '1v1', null, 4)$q$, '22023');
select pg_temp.expect('unknown format refused', $q$select public.create_battle(pg_temp.r(1), '4v4', null, 5)$q$, '22023');
select pg_temp.ok('sources: published tests listed; only the answers-shown, uncapped one is playable', $q$
  select count(*) = 3 and count(*) filter (where playable) = 1
     and bool_and(playable = (test_id = pg_temp.t(1))) and bool_and(test_id <> pg_temp.t(2))
     and bool_and(test_id <> pg_temp.t(1) or questions = 6)
  from public.battle_sources(pg_temp.r(1))$q$);
select pg_temp.step('u2 hosts a 1v1 on t1, 5 questions', $q$select pg_temp.save('b1', public.create_battle(pg_temp.r(1), '1v1', pg_temp.t(1), 5))$q$);
select pg_temp.ok('the battle gets a 4-character code, u2 hosts and plays on team 1', $q$
  select b.code ~ '^[A-HJKMNP-Z2-9]{4}$' and b.host_id = pg_temp.u(2) and b.status = 'lobby'
     and exists (select 1 from public.battle_players p where p.battle_id = b.id and p.user_id = pg_temp.u(2) and p.team = 1)
  from public.battles b where b.id = pg_temp.get('b1')$q$);
select pg_temp.as_admin();
select pg_temp.step('remember the code', $q$select set_config('bt.code', (select code from public.battles where id = pg_temp.get('b1')), true)$q$);

-- Who may see and join ------------------------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(7));
select pg_temp.ok('non-member sees no battle rows', $q$select not exists (select 1 from public.battles where id = pg_temp.get('b1'))$q$);
select pg_temp.ok('non-member sees no players', $q$select not exists (select 1 from public.battle_players where battle_id = pg_temp.get('b1'))$q$);
select pg_temp.expect('non-member cannot read battle_state', $q$select pg_temp.st()$q$, '42501');
select pg_temp.expect('non-member joining by code: no battle with that code', $q$select public.join_battle_code(current_setting('bt.code'))$q$, 'P0002');
select pg_temp.expect('non-member joining by id refused', $q$select public.join_battle(pg_temp.get('b1'))$q$, '42501');
select pg_temp.ok('non-member open_battles is empty', $q$select not exists (select 1 from public.open_battles(null))$q$);
select pg_temp.as_user(pg_temp.u(6));
select pg_temp.expect('banned member cannot join by code', $q$select public.join_battle_code(current_setting('bt.code'))$q$, '42501');
select pg_temp.expect('banned member cannot join by id', $q$select public.join_battle(pg_temp.get('b1'))$q$, '42501');
select pg_temp.expect('banned member cannot read battle_state', $q$select pg_temp.st()$q$, '42501');
select pg_temp.ok('banned member sees no battle rows', $q$select not exists (select 1 from public.battles where id = pg_temp.get('b1'))$q$);
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.ok('member sees the open lobby on the event page', $q$
  select count(*) = 1 and bool_and(id = pg_temp.get('b1') and not joined and players = 1) from public.open_battles(pg_temp.r(1))$q$);
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.ok('u3 joins by code (lower case, spaced)', $q$
  select public.join_battle_code(' ' || lower(current_setting('bt.code')) || ' ') = pg_temp.get('b1')$q$);
select pg_temp.ok('u3 lands on the smaller team, team 2', $q$
  select team = 2 from public.battle_players where battle_id = pg_temp.get('b1') and user_id = pg_temp.u(3)$q$);
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.expect('a third player cannot join a full 1v1', $q$select public.join_battle(pg_temp.get('b1'))$q$, '22023');
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.expect('u3 cannot move to the full team 1', $q$select public.pick_battle_team(pg_temp.get('b1'), 1)$q$, '22023');
select pg_temp.expect('only the host can start', $q$select public.start_battle(pg_temp.get('b1'))$q$, '42501');
select pg_temp.as_user(pg_temp.u(8));
select pg_temp.ok('an executive outside the room can watch', $q$select (pg_temp.st() ->> 'status') = 'lobby'$q$);
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.ok('the room trainer can watch', $q$select (pg_temp.st() ->> 'code') = current_setting('bt.code')$q$);

-- Start ---------------------------------------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.step('host starts', $q$select public.start_battle(pg_temp.get('b1'))$q$);
select pg_temp.as_admin();
select pg_temp.ok('5 rounds drawn from t1, no repeats; round 1 running for 20 s', $q$
  select count(*) = 5 and count(distinct question_id) = 5
     and bool_and(question_id in (select id from public.questions where test_id = pg_temp.t(1)))
     and count(*) filter (where started_at is not null) = 1
     and bool_and(round_no <> 1 or ends_at = started_at + interval '20 seconds')
  from public.battle_rounds where battle_id = pg_temp.get('b1')$q$);
select pg_temp.step('remember the round questions', $q$
  select set_config('bt.q1', (select question_id::text from public.battle_rounds where battle_id = pg_temp.get('b1') and round_no = 1), true),
         set_config('bt.q5', (select question_id::text from public.battle_rounds where battle_id = pg_temp.get('b1') and round_no = 5), true),
         set_config('bt.free', (select q.id::text from public.questions q where q.test_id = pg_temp.t(1)
           and q.id not in (select question_id from public.battle_rounds where battle_id = pg_temp.get('b1'))), true)$q$);
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.expect('a new player cannot join once it started', $q$select public.join_battle(pg_temp.get('b1'))$q$, '22023');
select pg_temp.expect('a watcher cannot answer', $q$select public.answer_battle(pg_temp.get('b1'), 1, 0)$q$, '42501');

-- Round 1: key secret until it closes, one answer each, points by server time ------------------------------------
select pg_temp.as_admin();
select pg_temp.step('round 1 has 10 s left', $q$
  update public.battle_rounds set started_at = now() - interval '10 seconds', ends_at = now() + interval '10 seconds'
  where battle_id = pg_temp.get('b1') and round_no = 1$q$);
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.ok('players see only the started round', $q$
  select count(*) = 1 and bool_and(round_no = 1) from public.battle_rounds where battle_id = pg_temp.get('b1')$q$);
select pg_temp.expect('players cannot read which question a round is', $q$
  select question_id from public.battle_rounds where battle_id = pg_temp.get('b1')$q$, '42501');
select pg_temp.ok('open round: prompt and options shown, no key, no results, no question id', $q$
  select (s -> 'current' ->> 'prompt') like 'Battle Q%' and jsonb_array_length(s -> 'current' -> 'options') = 4
     and (s -> 'current' -> 'correct_index') = 'null'::jsonb and (s -> 'current' -> 'results') = 'null'::jsonb
     and position(current_setting('bt.q1') in s::text) = 0
  from pg_temp.st() s$q$);
select pg_temp.ok('members cannot read the key table', $q$
  select not exists (select 1 from public.question_keys where question_id in (select id from public.questions where test_id = pg_temp.t(1)))$q$);
select pg_temp.expect('members cannot read battle_answers', $q$select count(*) from public.battle_answers$q$, '42501');
select pg_temp.expect('answer out of range refused', $q$select public.answer_battle(pg_temp.get('b1'), 1, 4)$q$, '22023');
select pg_temp.expect('answer for a round that is not current refused', $q$select public.answer_battle(pg_temp.get('b1'), 2, 0)$q$, '22023');
select pg_temp.step('u3 answers A (right)', $q$select public.answer_battle(pg_temp.get('b1'), 1, 0)$q$);
select pg_temp.ok('after answering: own pick shown, key still hidden, no points yet', $q$
  select (s -> 'current' ->> 'my_choice')::int = 0 and (s -> 'current' -> 'correct_index') = 'null'::jsonb
     and (s -> 'current' ->> 'answered')::int = 1 and (s -> 'teams') = '[0, 0]'::jsonb
     and (select bool_and((p ->> 'points')::int = 0) from jsonb_array_elements(s -> 'players') p)
  from pg_temp.st() s$q$);
select pg_temp.expect('a second answer for the same round is refused', $q$select public.answer_battle(pg_temp.get('b1'), 1, 1)$q$, '23505');
select pg_temp.expect('advance needs a known step', $q$select public.advance_battle(pg_temp.get('b1'), 1, 'skip')$q$, '22023');
select pg_temp.step('u3 calls advance early', $q$select public.advance_battle(pg_temp.get('b1'), 1, 'question')$q$);
select pg_temp.step('u3 calls reveal early', $q$select public.advance_battle(pg_temp.get('b1'), 1, 'reveal')$q$);
select pg_temp.as_admin();
select pg_temp.ok('early advance leaves the round open; the stored pick is unchanged and ungraded', $q$
  select r.closed_at is null and b.current_round = 1 and a.choice = 0 and a.is_correct is null and a.points = 0
  from public.battle_rounds r join public.battle_answers a on a.battle_id = r.battle_id and a.round_no = r.round_no
  join public.battles b on b.id = r.battle_id
  where r.battle_id = pg_temp.get('b1') and r.round_no = 1 and a.user_id = pg_temp.u(3)$q$);
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.step('u2 answers B (wrong); everyone has answered', $q$select public.answer_battle(pg_temp.get('b1'), 1, 1)$q$);
select pg_temp.ok('closed round: key revealed, u3 +125 (10 s left), u2 0, team 2 leads', $q$
  select (s -> 'current' ->> 'closed_at') is not null and (s -> 'current' ->> 'correct_index')::int = 0
     and (s -> 'teams') = '[0, 125]'::jsonb
     and (select (r ->> 'points')::int = 125 and (r ->> 'is_correct')::boolean from jsonb_array_elements(s -> 'current' -> 'results') r
          where (r ->> 'user_id')::uuid = pg_temp.u(3))
     and (select (r ->> 'points')::int = 0 from jsonb_array_elements(s -> 'current' -> 'results') r
          where (r ->> 'user_id')::uuid = pg_temp.u(2))
  from pg_temp.st() s$q$);
select pg_temp.step('host presses Next', $q$select public.advance_battle(pg_temp.get('b1'), 1, 'reveal')$q$);
select pg_temp.ok('the host''s Next skips the reveal wait: round 2 is running', $q$
  select (s ->> 'round')::int = 2 and (s -> 'current' ->> 'closed_at') is null from pg_temp.st() s$q$);
select pg_temp.step('a late nudge for round 1 changes nothing', $q$select public.advance_battle(pg_temp.get('b1'), 1, 'reveal')$q$);
select pg_temp.ok('still round 2, still open', $q$
  select (s ->> 'round')::int = 2 and (s -> 'current' ->> 'closed_at') is null from pg_temp.st() s$q$);

-- Round 2: the 1.5 s grace, late answers, and the race (a non-host closes, the host's late call must not skip) -----
select pg_temp.as_admin();
select pg_temp.step('round 2 ended a second ago (inside the grace)', $q$
  update public.battle_rounds set started_at = now() - interval '21 seconds', ends_at = now() - interval '1 second'
  where battle_id = pg_temp.get('b1') and round_no = 2$q$);
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.step('u3 answers A in the grace', $q$select public.answer_battle(pg_temp.get('b1'), 2, 0)$q$);
select pg_temp.step('u3 calls advance inside the grace', $q$select public.advance_battle(pg_temp.get('b1'), 2, 'question')$q$);
select pg_temp.ok('the round stays open through the grace', $q$select (s -> 'current' ->> 'closed_at') is null from pg_temp.st() s$q$);
select pg_temp.as_admin();
select pg_temp.step('round 2 ended 2 s ago (past the grace)', $q$
  update public.battle_rounds set ends_at = now() - interval '2 seconds' where battle_id = pg_temp.get('b1') and round_no = 2$q$);
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.expect('an answer after the window and the grace is refused', $q$select public.answer_battle(pg_temp.get('b1'), 2, 0)$q$, '22023');
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.step('u3 (not host) closes round 2 on time', $q$select public.advance_battle(pg_temp.get('b1'), 2, 'question')$q$);
select pg_temp.ok('closed: a grace answer scores 100 with no speed bonus', $q$
  select (s -> 'current' ->> 'closed_at') is not null and (s -> 'teams') = '[0, 225]'::jsonb
     and (select (r ->> 'points')::int = 100 from jsonb_array_elements(s -> 'current' -> 'results') r
          where (r ->> 'user_id')::uuid = pg_temp.u(3))
  from pg_temp.st() s$q$);
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.step('the host''s close call lands late', $q$select public.advance_battle(pg_temp.get('b1'), 2, 'question')$q$);
select pg_temp.ok('race: the host''s late close call does not skip the reveal (still round 2, closed)', $q$
  select (s ->> 'round')::int = 2 and (s -> 'current' ->> 'closed_at') is not null from pg_temp.st() s$q$);
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.step('u3 calls reveal during the reveal', $q$select public.advance_battle(pg_temp.get('b1'), 2, 'reveal')$q$);
select pg_temp.ok('a non-host cannot skip the 5 s reveal', $q$select (s ->> 'round')::int = 2 from pg_temp.st() s$q$);
select pg_temp.as_admin();
select pg_temp.step('the reveal has been up 6 s', $q$
  update public.battle_rounds set closed_at = now() - interval '6 seconds' where battle_id = pg_temp.get('b1') and round_no = 2$q$);
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.step('u3 calls reveal after 5 s', $q$select public.advance_battle(pg_temp.get('b1'), 2, 'reveal')$q$);
select pg_temp.ok('any player moves it on after the reveal: round 3', $q$select (s ->> 'round')::int = 3 from pg_temp.st() s$q$);

-- Round 3: a player leaves (the round doesn't wait for them) and rejoins with their points -------------------------
select pg_temp.step('u3 leaves', $q$select public.leave_battle(pg_temp.get('b1'))$q$);
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.ok('u3 shows as left, still on team 2', $q$
  select (select (p ->> 'active')::boolean = false and (p ->> 'team')::int = 2 from jsonb_array_elements(s -> 'players') p
          where (p ->> 'user_id')::uuid = pg_temp.u(3))
  from pg_temp.st() s$q$);
select pg_temp.step('u2 answers B (wrong)', $q$select public.answer_battle(pg_temp.get('b1'), 3, 1)$q$);
select pg_temp.ok('with u3 gone, u2 answering closes round 3', $q$select (s -> 'current' ->> 'closed_at') is not null from pg_temp.st() s$q$);
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.ok('u3 rejoins mid-game on team 2', $q$select public.join_battle(pg_temp.get('b1')) = 2$q$);
select pg_temp.ok('u3 is back with their 225 points', $q$
  select (select (p ->> 'active')::boolean and (p ->> 'points')::int = 225 from jsonb_array_elements(s -> 'players') p
          where (p ->> 'user_id')::uuid = pg_temp.u(3))
  from pg_temp.st() s$q$);

-- Round 4: a player whose screen went quiet for 15 s doesn't hold the round up -------------------------------------
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.step('host presses Next', $q$select public.advance_battle(pg_temp.get('b1'), 3, 'reveal')$q$);
select pg_temp.as_admin();
select pg_temp.step('u2 last pinged 20 s ago', $q$
  update public.battle_players set last_seen_at = now() - interval '20 seconds'
  where battle_id = pg_temp.get('b1') and user_id = pg_temp.u(2)$q$);
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.ok('the state marks u2 away', $q$
  select (select not (p ->> 'seen')::boolean from jsonb_array_elements(s -> 'players') p
          where (p ->> 'user_id')::uuid = pg_temp.u(2))
  from pg_temp.st() s$q$);
select pg_temp.step('u3 answers A at once (20 s left)', $q$select public.answer_battle(pg_temp.get('b1'), 4, 0)$q$);
select pg_temp.ok('away u2 did not block: round 4 closed, a fast right answer pays 150 (team 2 now 375)', $q$
  select (s -> 'current' ->> 'closed_at') is not null and (s -> 'teams') = '[0, 375]'::jsonb from pg_temp.st() s$q$);
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.step('u2 pings again', $q$select public.battle_ping(pg_temp.get('b1'))$q$);
select pg_temp.step('host presses Next', $q$select public.advance_battle(pg_temp.get('b1'), 4, 'reveal')$q$);

-- Round 5: while it's open, the test RPCs keep its key back -------------------------------------------------------
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.step('u4 (in the room, not playing) starts a practice run of t1', $q$select pg_temp.save('p1', public.start_attempt(pg_temp.t(1), 'practice'))$q$);
select pg_temp.expect('practice answer on the live question is refused (no verdict, no key)', $q$
  select public.answer_question(pg_temp.get('p1'), pg_temp.get('q5'), 0)$q$, '22023');
select pg_temp.ok('practice answer on a question not in play still shows its key', $q$
  select correct_index = 0 and is_correct from public.answer_question(pg_temp.get('p1'), pg_temp.get('free'), 0)$q$);
select pg_temp.ok('practice answer on an already-closed round''s question shows its key', $q$
  select correct_index = 0 from public.answer_question(pg_temp.get('p1'), pg_temp.get('q1'), 1)$q$);
select pg_temp.step('u4 submits the practice run', $q$select public.submit_attempt(pg_temp.get('p1'))$q$);
select pg_temp.ok('review sheet: the live question''s key is hidden, the rest show', $q$
  select bool_and((question_id = pg_temp.get('q5')) = (correct_index is null)) and count(*) = 6
  from public.attempt_sheet(pg_temp.get('p1'))$q$);
select pg_temp.ok('taking list: the live question''s key is hidden', $q$
  select bool_and((question_id = pg_temp.get('q5')) = (correct_index is null))
  from public.attempt_questions(pg_temp.get('p1'))$q$);
select pg_temp.step('u4 starts a timed run of t1', $q$select pg_temp.save('t1run', public.start_attempt(pg_temp.t(1), 'timed'))$q$);
select pg_temp.step('u4 answers the live question in the timed run (stored, no verdict)', $q$
  select public.answer_question(pg_temp.get('t1run'), pg_temp.get('q5'), 0)$q$);
select pg_temp.ok('submitting it hides the score while the question is live', $q$
  select score is null from public.submit_attempt(pg_temp.get('t1run'))$q$);
select pg_temp.ok('attempt list hides that score too', $q$
  select score is null and score_hidden from public.attempt_list(p_attempt => pg_temp.get('t1run'))$q$);
select pg_temp.ok('career hides the live question''s key', $q$
  select count(*) filter (where prompt = (select prompt from public.questions where id = pg_temp.get('q5'))) = 1
     and bool_and(prompt <> (select prompt from public.questions where id = pg_temp.get('q5')) or correct_index is null)
  from public.career(pg_temp.u(4), null)$q$);
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.ok('the room trainer still sees every key and score', $q$
  select (select score is not null from public.attempt_list(p_attempt => pg_temp.get('t1run')))
     and (select bool_and(correct_index is not null) from public.attempt_sheet(pg_temp.get('p1')))$q$);
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.step('u2 answers B (wrong)', $q$select public.answer_battle(pg_temp.get('b1'), 5, 1)$q$);
select pg_temp.as_admin();
select pg_temp.step('round 5 times out', $q$
  update public.battle_rounds set ends_at = now() - interval '2 seconds' where battle_id = pg_temp.get('b1') and round_no = 5$q$);
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.step('host closes round 5', $q$select public.advance_battle(pg_temp.get('b1'), 5, 'question')$q$);
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.ok('after the close: the key and the score are back', $q$
  select (select bool_and(correct_index is not null) from public.attempt_sheet(pg_temp.get('p1')))
     and (select score is not null from public.attempt_list(p_attempt => pg_temp.get('t1run')))$q$);
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.step('host ends it', $q$select public.advance_battle(pg_temp.get('b1'), 5, 'reveal')$q$);
select pg_temp.ok('done: team 2 wins 375 to 0; u3 3 right of 3 answered', $q$
  select (s ->> 'status') = 'done' and (s ->> 'winner')::int = 2 and (s -> 'teams') = '[0, 375]'::jsonb
     and (select (p ->> 'correct')::int = 3 and (p ->> 'answered')::int = 3 from jsonb_array_elements(s -> 'players') p
          where (p ->> 'user_id')::uuid = pg_temp.u(3))
  from pg_temp.st() s$q$);
select pg_temp.ok('wins: everyone answered at least half the rounds, so u3 has 1 and u2 has 0', $q$
  select public.battle_wins(pg_temp.u(3)) = 1 and public.battle_wins(pg_temp.u(2)) = 0$q$);
select pg_temp.as_user(pg_temp.u(6));
select pg_temp.ok('wins: a banned account reads nothing', $q$select public.battle_wins(pg_temp.u(3)) = 0$q$);
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.ok('a finished battle drops off open_battles', $q$select not exists (select 1 from public.open_battles(pg_temp.r(1)))$q$);
select pg_temp.expect('no answers after the end', $q$select public.answer_battle(pg_temp.get('b1'), 5, 0)$q$, '22023');

select pg_temp.as_admin();
select pg_temp.ok('no Elo: battles wrote no elo_events and no attempts for the players', $q$
  select not exists (select 1 from public.elo_events where user_id in (pg_temp.u(2), pg_temp.u(3)))
     and not exists (select 1 from public.attempts where user_id in (pg_temp.u(2), pg_temp.u(3)))$q$);

-- Play again, and the farm rule: a win where one side barely played doesn't count -----------------------------------
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.step('u3 asks for a rematch', $q$select pg_temp.save('b2', public.rematch_battle(pg_temp.get('b1')))$q$);
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.ok('u2 asking too joins the same new lobby', $q$select public.rematch_battle(pg_temp.get('b1')) = pg_temp.get('b2')$q$);
select pg_temp.ok('rematch: same format and source, u3 hosts, two players', $q$
  select (s ->> 'status') = 'lobby' and (s ->> 'format') = '1v1' and (s ->> 'host_id')::uuid = pg_temp.u(3)
     and jsonb_array_length(s -> 'players') = 2 and (s ->> 'source_title') = 'Battle set'
  from public.battle_state(pg_temp.get('b2')) s$q$);
select pg_temp.as_user(pg_temp.u(7));
select pg_temp.expect('a non-member cannot rematch', $q$select public.rematch_battle(pg_temp.get('b1'))$q$, '42501');
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.step('u3 starts the rematch', $q$select public.start_battle(pg_temp.get('b2'))$q$);
select pg_temp.as_admin();
select pg_temp.step('u2 never plays (away)', $q$
  update public.battle_players set last_seen_at = now() - interval '1 minute'
  where battle_id = pg_temp.get('b2') and user_id = pg_temp.u(2)$q$);
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.step('rematch round 1: u3 answers', $q$select public.answer_battle(pg_temp.get('b2'), 1, 0)$q$);
select pg_temp.step('rematch round 1: host goes on', $q$select public.advance_battle(pg_temp.get('b2'), 1, 'reveal')$q$);
select pg_temp.step('rematch round 2: u3 answers', $q$select public.answer_battle(pg_temp.get('b2'), 2, 0)$q$);
select pg_temp.step('rematch round 2: host goes on', $q$select public.advance_battle(pg_temp.get('b2'), 2, 'reveal')$q$);
select pg_temp.step('rematch round 3: u3 answers', $q$select public.answer_battle(pg_temp.get('b2'), 3, 0)$q$);
select pg_temp.step('rematch round 3: host goes on', $q$select public.advance_battle(pg_temp.get('b2'), 3, 'reveal')$q$);
select pg_temp.step('rematch round 4: u3 answers', $q$select public.answer_battle(pg_temp.get('b2'), 4, 0)$q$);
select pg_temp.step('rematch round 4: host goes on', $q$select public.advance_battle(pg_temp.get('b2'), 4, 'reveal')$q$);
select pg_temp.step('rematch round 5: u3 answers', $q$select public.answer_battle(pg_temp.get('b2'), 5, 0)$q$);
select pg_temp.step('rematch round 5: host goes on', $q$select public.advance_battle(pg_temp.get('b2'), 5, 'reveal')$q$);
select pg_temp.ok('u3 wins the rematch on the board', $q$
  select (s ->> 'status') = 'done' and (s ->> 'winner')::int = (select team from public.battle_players
    where battle_id = pg_temp.get('b2') and user_id = pg_temp.u(3))
  from public.battle_state(pg_temp.get('b2')) s$q$);
select pg_temp.ok('farm rule: u2 answered under half the rounds, so the win does not count (still 1)', $q$
  select public.battle_wins(pg_temp.u(3)) = 1$q$);

-- Leaving the lobby passes the host on; an empty lobby ends ----------------------------------------------------------
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.step('u4 hosts a 2v2 lobby', $q$select pg_temp.save('b3', public.create_battle(pg_temp.r(1), '2v2', null, 5))$q$);
select pg_temp.as_user(pg_temp.u(5));
select pg_temp.step('u5 joins', $q$select public.join_battle(pg_temp.get('b3'))$q$);
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.expect('a 2v2 cannot start with 1 a side', $q$select public.start_battle(pg_temp.get('b3'))$q$, '22023');
select pg_temp.step('host u4 leaves the lobby', $q$select public.leave_battle(pg_temp.get('b3'))$q$);
select pg_temp.as_user(pg_temp.u(5));
select pg_temp.ok('u5 now hosts; u4 is off the lobby list', $q$
  select (s ->> 'host_id')::uuid = pg_temp.u(5) and jsonb_array_length(s -> 'players') = 1
  from public.battle_state(pg_temp.get('b3')) s$q$);
select pg_temp.step('u5 leaves too', $q$select public.leave_battle(pg_temp.get('b3'))$q$);
select pg_temp.ok('the empty lobby is over', $q$select (s ->> 'status') = 'done' from public.battle_state(pg_temp.get('b3')) s$q$);

-- Stale battles: 30 minutes untouched reads as ended everywhere --------------------------------------------------
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.step('u4 hosts another lobby', $q$select pg_temp.save('b4', public.create_battle(pg_temp.r(1), '1v1', null, 5))$q$);
select pg_temp.as_admin();
select pg_temp.step('nobody touched it for 31 minutes', $q$
  update public.battles set touched_at = now() - interval '31 minutes' where id = pg_temp.get('b4')$q$);
select pg_temp.as_user(pg_temp.u(5));
select pg_temp.ok('stale: the state says so (the lobby tab shows "This battle ended")', $q$
  select (s ->> 'stale')::boolean from public.battle_state(pg_temp.get('b4')) s$q$);
select pg_temp.expect('stale: joining is refused', $q$select public.join_battle(pg_temp.get('b4'))$q$, '22023');
select pg_temp.ok('stale: it is off the open list', $q$
  select not exists (select 1 from public.open_battles(pg_temp.r(1)) where id = pg_temp.get('b4'))$q$);
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.expect('stale: the host cannot start it', $q$select public.start_battle(pg_temp.get('b4'))$q$, '22023');
select pg_temp.as_user(pg_temp.u(5));
select pg_temp.step('the next create sweeps it', $q$select pg_temp.save('b5', public.create_battle(pg_temp.r(1), '1v1', null, 5))$q$);
select pg_temp.as_admin();
select pg_temp.ok('swept: marked done', $q$select status = 'done' from public.battles where id = pg_temp.get('b4')$q$);

-- Realtime channel ----------------------------------------------------------------------------------------------
-- realtime.send writes to realtime.messages, a table partitioned by day that the Realtime service creates once
-- clients connect. With no partition for today the send is a warning (by design), so delivery is checked only
-- when one exists; the channel policy is checked either way.
select pg_temp.step('note whether today has a messages partition', $q$
  select set_config('bt.part', (exists (select 1 from pg_inherits i join pg_class c on c.oid = i.inhrelid
    where i.inhparent = 'realtime.messages'::regclass
      and c.relname = 'messages_' || to_char(now(), 'YYYY_MM_DD')))::text, true)$q$);
select pg_temp.ok('the RPCs broadcast sync messages on the battle topic (when a partition exists)', $q$
  select current_setting('bt.part') = 'false'
      or (select count(*) > 0 from realtime.messages where topic = 'battle:' || pg_temp.get('b1') and event = 'sync')$q$);
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.ok('a player may join the channel (topic check passes)', $q$select private.battle_topic_ok('battle:' || pg_temp.get('b1'))$q$);
select pg_temp.as_user(pg_temp.u(7));
select pg_temp.ok('a non-member may not join the channel', $q$select not private.battle_topic_ok('battle:' || pg_temp.get('b1'))$q$);
select pg_temp.as_user(pg_temp.u(6));
select pg_temp.ok('a banned member may not join the channel', $q$select not private.battle_topic_ok('battle:' || pg_temp.get('b1'))$q$);
select pg_temp.ok('a junk topic is refused, not an error', $q$select not private.battle_topic_ok('battle:not-a-uuid') and not private.battle_topic_ok('room:x')$q$);
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.step('u3 opens the channel topic', $q$select set_config('realtime.topic', 'battle:' || pg_temp.get('b1'), true)$q$);
select pg_temp.ok('u3 can read the sync messages through the policy (when a partition exists)', $q$
  select current_setting('bt.part') = 'false'
      or (select count(*) > 0 from realtime.messages where topic = 'battle:' || pg_temp.get('b1'))$q$);
select pg_temp.as_user(pg_temp.u(7));
select pg_temp.ok('a non-member reads none of them', $q$
  select count(*) = 0 from realtime.messages where topic = 'battle:' || pg_temp.get('b1')$q$);

select pg_temp.as_admin();
select pg_temp.report();
rollback;
