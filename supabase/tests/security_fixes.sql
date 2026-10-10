-- Security fixes (Task 10, migrations 0066+): hidden-answer scores, admin passcode, skills caps, demo
-- leftovers, notification spam, my_classrooms category. One transaction, rolled back; raises on the first failure.
begin;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.r(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8100-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
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
create function pg_temp.expect(label text, stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL %: expected %, got success', label, state using errcode = 'XX001';
exception when others then
  if sqlstate <> state then raise exception 'FAIL %: expected %, got % (%)', label, state, sqlstate, sqlerrm; end if;
end $$;
-- Keeps attempt ids between statements (works under the authenticated role too).
create function pg_temp.save(k text, v uuid) returns void language plpgsql as $$
begin
  perform set_config('hosa.sf_' || k, v::text, true);
end $$;
create function pg_temp.get(k text) returns uuid language sql as $$
  select current_setting('hosa.sf_' || k)::uuid
$$;
-- The whole file is one transaction, so now() is the same for every submit. Real submits happen in separate
-- transactions; settle() gives each submitted attempt its own earlier time so "first full run" is well defined.
create temp sequence sf_seq;
create function pg_temp.settle(k text) returns void language plpgsql as $$
declare claims text := current_setting('request.jwt.claims', true);
begin
  execute 'reset role';
  update public.attempts set submitted_at = now() - make_interval(secs => 1000 - nextval('sf_seq'))
    where id = pg_temp.get(k) and submitted_at is not null;
  perform set_config('request.jwt.claims', claims, true);
  execute 'set local role authenticated';
end $$;

-- Fixtures: 1 executive, 2 trainer owning room 1, 4 member, 5 outsider, 9-14 more signed-in accounts.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role)
select pg_temp.u(n), 'sf.user' || n || '@example.com', json_build_object('full_name', 'SF User ' || n)::jsonb,
       now(), 'authenticated', 'authenticated'
from unnest(array[1, 2, 4, 5, 9, 10, 11, 12, 13, 14, 15]) n;
update public.profiles set role = 'executive' where id = pg_temp.u(1);
update public.profiles set role = 'trainer' where id = pg_temp.u(2);
insert into public.classrooms (id, name, owner_id, category) values (pg_temp.r(1), 'SF Room', pg_temp.u(2), 'practical');
insert into public.classroom_members (classroom_id, user_id) values (pg_temp.r(1), pg_temp.u(4));

-- M1: hidden answers. r70 timed, r75 untimed, r81 timed, all show_answers off; r78 untimed with answers on.
-- With answers hidden a taker sees a score only for their first run with every question answered, in either
-- mode. Any later score would let them change one answer per run and diff the scores to rebuild the key.
insert into public.tests (id, classroom_id, title, time_limit_minutes, is_published) values
  (pg_temp.r(70), pg_temp.r(1), 'SF hidden timed', 30, true),
  (pg_temp.r(75), pg_temp.r(1), 'SF hidden untimed', null, true),
  (pg_temp.r(78), pg_temp.r(1), 'SF open untimed', null, true),
  (pg_temp.r(81), pg_temp.r(1), 'SF hidden timed, practice first', 30, true);
update public.tests set show_answers = false where id in (pg_temp.r(70), pg_temp.r(75), pg_temp.r(81));
insert into public.questions (id, test_id, position, prompt, options) values
  (pg_temp.r(71), pg_temp.r(70), 1, 'H1', array['a', 'b']),
  (pg_temp.r(72), pg_temp.r(70), 2, 'H2', array['a', 'b']),
  (pg_temp.r(76), pg_temp.r(75), 1, 'U1', array['a', 'b']),
  (pg_temp.r(77), pg_temp.r(75), 2, 'U2', array['a', 'b']),
  (pg_temp.r(79), pg_temp.r(78), 1, 'O1', array['a', 'b']),
  (pg_temp.r(80), pg_temp.r(78), 2, 'O2', array['a', 'b']),
  (pg_temp.r(82), pg_temp.r(81), 1, 'P1', array['a', 'b']);
insert into public.question_keys (question_id, correct_index) values
  (pg_temp.r(71), 1), (pg_temp.r(72), 1), (pg_temp.r(76), 0), (pg_temp.r(77), 0), (pg_temp.r(79), 0), (pg_temp.r(80), 0), (pg_temp.r(82), 0);

select pg_temp.as_user(pg_temp.u(4));
-- A one-question practice probe is the key oracle: it must reveal nothing.
select pg_temp.save('p1', public.start_attempt(pg_temp.r(70), 'practice'));
select pg_temp.check('hidden: practice answer gives no verdict',
  exists (select 1 from public.answer_question(pg_temp.get('p1'), pg_temp.r(71), 1) r
          where r.is_correct is null and r.correct_index is null));
select pg_temp.check('hidden: practice probe submit returns no score',
  (select s.score is null and s.total = 2 from public.submit_attempt(pg_temp.get('p1')) s));
select pg_temp.settle('p1');
-- The raw attempts.score column itself is closed by supabase/deferred/0073 (after deploy): attempts_score_column.sql.
select pg_temp.check('hidden: attempt_list hides the practice score',
  exists (select 1 from public.attempt_list(pg_temp.r(70), null, null) a
          where a.id = pg_temp.get('p1') and a.score is null and a.score_hidden));
-- A timed run that skips a question is also a probe; only a full run can show its score.
select pg_temp.save('t1', public.start_attempt(pg_temp.r(70), 'timed'));
select public.answer_question(pg_temp.get('t1'), pg_temp.r(71), 1);
select pg_temp.check('hidden: partial timed submit returns no score',
  (select s.score is null from public.submit_attempt(pg_temp.get('t1')) s));
select pg_temp.settle('t1');
select pg_temp.check('hidden: classroom_tests has no best from probes',
  (select t.my_best is null from public.classroom_tests(pg_temp.r(1)) t where t.id = pg_temp.r(70)));
select pg_temp.save('t2', public.start_attempt(pg_temp.r(70), 'timed'));
select public.answer_question(pg_temp.get('t2'), pg_temp.r(71), 1);
select public.answer_question(pg_temp.get('t2'), pg_temp.r(72), 0);
select pg_temp.check('hidden: first full timed submit shows the score',
  (select s.score = 1 and s.total = 2 from public.submit_attempt(pg_temp.get('t2')) s));
select pg_temp.settle('t2');
select pg_temp.check('hidden: attempt_list shows the first full run',
  exists (select 1 from public.attempt_list(null, null, pg_temp.get('t2')) a where a.score = 1 and not a.score_hidden));
-- A second full run (better this time) must not show a score, in either mode.
select pg_temp.save('t3', public.start_attempt(pg_temp.r(70), 'timed'));
select public.answer_question(pg_temp.get('t3'), pg_temp.r(71), 1);
select public.answer_question(pg_temp.get('t3'), pg_temp.r(72), 1);
select pg_temp.check('hidden: second full timed run returns no score',
  (select s.score is null and s.total = 2 from public.submit_attempt(pg_temp.get('t3')) s));
select pg_temp.settle('t3');
select pg_temp.check('hidden: attempt_list hides the second full run',
  exists (select 1 from public.attempt_list(null, null, pg_temp.get('t3')) a where a.score is null and a.score_hidden));
select pg_temp.save('p2', public.start_attempt(pg_temp.r(70), 'practice'));
select public.answer_question(pg_temp.get('p2'), pg_temp.r(71), 0);
select public.answer_question(pg_temp.get('p2'), pg_temp.r(72), 0);
select pg_temp.check('hidden: a later full practice run returns no score',
  (select s.score is null from public.submit_attempt(pg_temp.get('p2')) s));
select pg_temp.settle('p2');
select pg_temp.check('hidden: classroom_tests best stays the first full run',
  (select t.my_best = 1 and t.my_best_total = 2 from public.classroom_tests(pg_temp.r(1)) t where t.id = pg_temp.r(70)));
select pg_temp.check('hidden: grades show only the first full run',
  exists (select 1 from public.classroom_grades(pg_temp.r(1)) g
          where g.test_id = pg_temp.r(70) and g.best_score = 1 and g.best_total = 2 and g.tries = 5));
-- Any mode counts: a full practice run first on a timed test shows its score, and the timed run after it doesn't.
select pg_temp.save('q1', public.start_attempt(pg_temp.r(81), 'practice'));
select public.answer_question(pg_temp.get('q1'), pg_temp.r(82), 0);
select pg_temp.check('hidden: first full run in practice shows the score',
  (select s.score = 1 from public.submit_attempt(pg_temp.get('q1')) s));
select pg_temp.settle('q1');
select pg_temp.save('q2', public.start_attempt(pg_temp.r(81), 'timed'));
select public.answer_question(pg_temp.get('q2'), pg_temp.r(82), 0);
select pg_temp.check('hidden: the timed run after it returns no score',
  (select s.score is null from public.submit_attempt(pg_temp.get('q2')) s));
select pg_temp.settle('q2');
select pg_temp.check('hidden: classroom_tests best is that first practice run',
  (select t.my_best = 1 and t.my_best_total = 1 from public.classroom_tests(pg_temp.r(1)) t where t.id = pg_temp.r(81)));
-- Untimed: a partial run hides the score, the first full run shows it, a second full run hides it again.
select pg_temp.save('u1', public.start_attempt(pg_temp.r(75), 'practice'));
select public.answer_question(pg_temp.get('u1'), pg_temp.r(76), 0);
select pg_temp.check('hidden untimed: partial practice hides the score',
  (select s.score is null from public.submit_attempt(pg_temp.get('u1')) s));
select pg_temp.settle('u1');
select pg_temp.save('u2', public.start_attempt(pg_temp.r(75), 'practice'));
select public.answer_question(pg_temp.get('u2'), pg_temp.r(76), 0);
select public.answer_question(pg_temp.get('u2'), pg_temp.r(77), 1);
select pg_temp.check('hidden untimed: first full practice shows the score',
  (select s.score = 1 from public.submit_attempt(pg_temp.get('u2')) s));
select pg_temp.settle('u2');
select pg_temp.save('u3', public.start_attempt(pg_temp.r(75), 'practice'));
select public.answer_question(pg_temp.get('u3'), pg_temp.r(76), 0);
select public.answer_question(pg_temp.get('u3'), pg_temp.r(77), 0);
select pg_temp.check('hidden untimed: second full practice returns no score',
  (select s.score is null from public.submit_attempt(pg_temp.get('u3')) s));
select pg_temp.settle('u3');
-- Answers on: nothing changes.
select pg_temp.save('o1', public.start_attempt(pg_temp.r(78), 'practice'));
select public.answer_question(pg_temp.get('o1'), pg_temp.r(79), 0);
select pg_temp.check('answers on: partial practice still shows the score',
  (select s.score = 1 from public.submit_attempt(pg_temp.get('o1')) s));
select pg_temp.settle('o1');
select pg_temp.check('attempt_list never shows someone else''s attempts to a member',
  not exists (select 1 from public.attempt_list(null, pg_temp.u(2), null)));

select pg_temp.as_user(pg_temp.u(2));
select pg_temp.check('trainer sees every real score, probes included',
  exists (select 1 from public.attempt_list(pg_temp.r(70), pg_temp.u(4), null) a
          where a.id = pg_temp.get('p1') and a.score = 1 and not a.score_hidden)
  and exists (select 1 from public.attempt_list(pg_temp.r(70), pg_temp.u(4), null) a
              where a.id = pg_temp.get('t3') and a.score = 2 and not a.score_hidden)
  and (select count(*) from public.attempt_list(pg_temp.r(70), pg_temp.u(4), null)) = 5);
select pg_temp.check('trainer results keep the best real score',
  exists (select 1 from public.test_results(pg_temp.r(70)) r where r.user_id = pg_temp.u(4) and r.best = 2));

-- M3: the admin passcode is single use, announced to every executive, and globally rate limited.
select pg_temp.as_user(pg_temp.u(1));
select public.set_admin_passcode('sf-admin-passcode-2026');
select pg_temp.as_admin();
-- Age out any live misses so the count starts at zero (no DELETE: the MCP refuses it).
update private.passcode_attempts set at = now() - interval '11 minutes' where at > now() - interval '10 minutes';
select pg_temp.as_user(pg_temp.u(5));
select pg_temp.check('right passcode promotes', public.claim_admin('sf-admin-passcode-2026'));
select pg_temp.as_admin();
select pg_temp.check('claimer is an executive', (select role from public.profiles where id = pg_temp.u(5)) = 'executive');
select pg_temp.check('passcode hash is cleared after a claim',
  not exists (select 1 from private.settings where key = 'admin_passcode_hash'));
select pg_temp.check('every other executive is notified of the claim',
  exists (select 1 from public.notifications n where n.user_id = pg_temp.u(1) and n.kind = 'role'
          and n.title like '%SF User 5%'));
select pg_temp.check('the claim is in the admin log',
  exists (select 1 from public.admin_log l where l.action = 'passcode_used' and l.actor_id = pg_temp.u(5)));
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.check('executive sees the passcode is no longer set', not public.admin_passcode_is_set());
select pg_temp.as_user(pg_temp.u(9));
select pg_temp.check('a used passcode no longer works', public.claim_admin('sf-admin-passcode-2026') = false);

-- A banned account can't claim, even with the right passcode, and doesn't use it up.
select pg_temp.as_admin();
select set_config('hosa.moderation', 'on', true);
update public.profiles set banned_until = now() + interval '1 day', ban_reason = 'SF test' where id = pg_temp.u(15);
select set_config('hosa.moderation', 'off', true);
select pg_temp.as_user(pg_temp.u(1));
select public.set_admin_passcode('sf-banned-passcode-2026');
select pg_temp.as_user(pg_temp.u(15));
select pg_temp.expect('a banned account cannot claim admin',
  $q$select public.claim_admin('sf-banned-passcode-2026')$q$, '42501');
select pg_temp.expect('a banned account is turned away before guessing',
  $q$select public.claim_admin('sf-wrong-guess')$q$, '42501');
select pg_temp.as_admin();
select pg_temp.check('a banned guess does not count toward the global lockout',
  not exists (select 1 from private.passcode_attempts where user_id = pg_temp.u(15)));
select pg_temp.check('the banned account is still not an executive',
  (select role from public.profiles where id = pg_temp.u(15)) <> 'executive');
select pg_temp.check('the passcode survives the banned try',
  exists (select 1 from private.settings where key = 'admin_passcode_hash'));

-- Ten misses across many accounts lock everyone out for 10 minutes.
select pg_temp.as_user(pg_temp.u(1));
select public.set_admin_passcode('sf-second-passcode-2026');
select pg_temp.as_admin();
-- Age out any live misses so the count starts at zero (no DELETE: the MCP refuses it).
update private.passcode_attempts set at = now() - interval '11 minutes' where at > now() - interval '10 minutes';
do $$
declare k integer;
begin
  for k in 0 .. 9 loop
    perform pg_temp.as_user(pg_temp.u(9 + (k % 5)));
    perform pg_temp.check('miss ' || k || ' returns false', public.claim_admin('wrong-guess-' || k) = false);
  end loop;
end $$;
select pg_temp.as_user(pg_temp.u(14));
select pg_temp.expect('a fresh account is throttled after ten misses anywhere',
  $q$select public.claim_admin('sf-second-passcode-2026')$q$, '54000');

-- L4: skills length caps.
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.expect('skill note over 1000 characters rejected',
  format($$insert into public.skills (classroom_id, name, note) values (%L, 'N', %L)$$, pg_temp.r(1), repeat('x', 1001)), '23514');
select pg_temp.expect('skill round over 80 characters rejected',
  format($$insert into public.skills (classroom_id, name, round) values (%L, 'R', %L)$$, pg_temp.r(1), repeat('x', 81)), '23514');
select pg_temp.expect('more than 100 steps rejected',
  format($$insert into public.skills (classroom_id, name, steps) values (%L, 'S', %L)$$, pg_temp.r(1),
    (select jsonb_agg(jsonb_build_object('text', 'step')) from generate_series(1, 101))), '23514');
insert into public.skills (classroom_id, name, round, note, steps) values
  (pg_temp.r(1), 'Fits', repeat('r', 80), repeat('n', 1000),
   (select jsonb_agg(jsonb_build_object('text', repeat('s', 500), 'points', 2)) from generate_series(1, 100)));
select pg_temp.check('a skill at every cap still saves', exists (select 1 from public.skills where name = 'Fits'));

-- L7: demo leftovers are gone.
select pg_temp.as_admin();
select pg_temp.check('demo settings are cleared',
  not exists (select 1 from private.settings where key in ('demo_login', 'demo_password_hash')));
select pg_temp.check('demo login RPCs are not callable by signed-in users',
  not has_function_privilege('authenticated', 'public.set_demo_login(boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.demo_login_enabled()', 'execute'));

-- L8: unpublish and republish notifies members once.
select pg_temp.as_user(pg_temp.u(2));
do $$
declare tid uuid;
begin
  insert into public.tests (classroom_id, title, is_published) values (pg_temp.r(1), 'SF toggle', true) returning id into tid;
  perform pg_temp.save('t90', tid);
end $$;
update public.tests set is_published = false where id = pg_temp.get('t90');
update public.tests set is_published = true where id = pg_temp.get('t90');
update public.tests set is_published = false where id = pg_temp.get('t90');
update public.tests set is_published = true where id = pg_temp.get('t90');
select pg_temp.as_admin();
select pg_temp.check('publish toggling sends one test notification',
  (select count(*) from public.notifications n where n.user_id = pg_temp.u(4) and n.kind = 'test'
     and n.link = '/c/' || pg_temp.r(1) || '/tests/' || pg_temp.get('t90')) = 1);

-- L8: a burst of announcements stops ringing the bell after ten in an hour.
select pg_temp.as_user(pg_temp.u(2));
-- One statement per post, the way the app posts them.
do $$
begin
  for g in 1 .. 12 loop
    insert into public.announcements (classroom_id, title) values (pg_temp.r(1), 'Burst ' || g);
  end loop;
end $$;
select pg_temp.as_admin();
select pg_temp.check('all twelve posts are saved', (select count(*) from public.announcements where title like 'Burst %') = 12);
select pg_temp.check('members get at most ten bells from one author per hour',
  (select count(*) from public.notifications n where n.user_id = pg_temp.u(4) and n.kind = 'announcement'
     and n.title like 'Burst %') = 10);

-- my_classrooms carries the event category.
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.check('my_classrooms returns category',
  (select category from public.my_classrooms() where id = pg_temp.r(1)) = 'practical');

select pg_temp.as_admin();
select 'security_fixes: all checks passed' as result;
rollback;
