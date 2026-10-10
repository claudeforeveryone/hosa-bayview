-- Elo audit (Task 12, migrations 0080+, follow-ups 0083): rulings R1-R9 from the audit plus the M2 farming fixes.
-- Runs in one transaction and rolls back. Unlike the older files it does not stop at the first failure:
-- every check runs, and the last statement raises with the list of failures (or returns "all passed").
-- Throwaway users only. Run with the Supabase MCP execute_sql.
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

-- Ids: kind 1201 users, 1202 rooms, 1203 tests, 1204 questions, 1205 decks, 1206 cards.
create function pg_temp.id(kind int, n int) returns uuid language sql immutable as $$
  select format('00000000-0000-4000-8000-%s', lpad(kind::text, 4, '0') || lpad(n::text, 8, '0'))::uuid
$$;
create function pg_temp.u(n int) returns uuid language sql immutable as $$ select pg_temp.id(1201, n) $$;
create function pg_temp.r(n int) returns uuid language sql immutable as $$ select pg_temp.id(1202, n) $$;
create function pg_temp.t(n int) returns uuid language sql immutable as $$ select pg_temp.id(1203, n) $$;
create function pg_temp.q(n int) returns uuid language sql immutable as $$ select pg_temp.id(1204, n) $$;
create function pg_temp.k(n int) returns uuid language sql immutable as $$ select pg_temp.id(1205, n) $$;
create function pg_temp.c(n int) returns uuid language sql immutable as $$ select pg_temp.id(1206, n) $$;

create function pg_temp.save(k text, v uuid) returns void language sql as $$
  select set_config('elo.' || k, v::text, true)
$$;
create function pg_temp.get(k text) returns uuid language sql as $$
  select nullif(current_setting('elo.' || k, true), '')::uuid
$$;

create function pg_temp.fail(label text, why text) returns void language plpgsql as $$
begin
  perform set_config('elo.fails',
    coalesce(current_setting('elo.fails', true), '') || E'\n  - ' || label || coalesce(' [' || why || ']', ''), true);
end $$;

create function pg_temp.tick() returns void language plpgsql as $$
begin
  perform set_config('elo.n', (coalesce(nullif(current_setting('elo.n', true), ''), '0')::int + 1)::text, true);
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
declare f text := coalesce(current_setting('elo.fails', true), '');
begin
  if f <> '' then
    raise exception 'elo_audit: % of % checks failed:%', array_length(string_to_array(trim(leading E'\n' from f), E'\n'), 1),
      current_setting('elo.n', true), f;
  end if;
  return 'elo_audit: all ' || current_setting('elo.n', true) || ' checks passed';
end $$;

-- Fixtures ------------------------------------------------------------------------------------------------------
-- u1..u8 trainees in room r1 (u2 is its trainer, u3 an executive). u9 is outside the room.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role)
select pg_temp.u(i), 'elo.audit' || i || '@example.com', json_build_object('full_name', 'Elo Audit ' || i)::jsonb,
  now(), 'authenticated', 'authenticated'
from generate_series(1, 9) i;
update public.profiles set role = 'trainer' where id = pg_temp.u(2);
update public.profiles set role = 'executive' where id = pg_temp.u(3);

insert into public.classrooms (id, name, owner_id) values (pg_temp.r(1), 'Elo audit room', pg_temp.u(2));
insert into public.classroom_members (classroom_id, user_id)
select pg_temp.r(1), pg_temp.u(i) from generate_series(1, 8) i where i not in (2, 3);

-- t1: published practice test, 8 questions (key A). t2: the trainer's unpublished draft. t3: published, timed.
-- t4: published, timed, 2 questions (cases 16-19; t3 is deleted in case 8).
insert into public.tests (id, classroom_id, title, is_published, created_by) values
  (pg_temp.t(1), pg_temp.r(1), 'Elo practice', true, pg_temp.u(2)),
  (pg_temp.t(2), pg_temp.r(1), 'Elo draft', false, pg_temp.u(2));
insert into public.tests (id, classroom_id, title, is_published, created_by, time_limit_minutes) values
  (pg_temp.t(3), pg_temp.r(1), 'Elo timed', true, pg_temp.u(2), 10),
  (pg_temp.t(4), pg_temp.r(1), 'Elo timed 2', true, pg_temp.u(2), 10);
insert into public.questions (id, test_id, position, prompt, options)
select pg_temp.q(i), pg_temp.t(1), i, 'Elo Q' || i, array['a', 'b'] from generate_series(1, 8) i;
insert into public.questions (id, test_id, position, prompt, options) values
  (pg_temp.q(11), pg_temp.t(2), 1, 'Draft Q', array['a', 'b']),
  (pg_temp.q(21), pg_temp.t(3), 1, 'Timed Q1', array['a', 'b']),
  (pg_temp.q(22), pg_temp.t(3), 2, 'Timed Q2', array['a', 'b']),
  (pg_temp.q(41), pg_temp.t(4), 1, 'Timed2 Q1', array['a', 'b']),
  (pg_temp.q(42), pg_temp.t(4), 2, 'Timed2 Q2', array['a', 'b']);
insert into public.question_keys (question_id, correct_index, explanation)
select q.id, 0, 'A' from public.questions q
where q.test_id in (pg_temp.t(1), pg_temp.t(2), pg_temp.t(3), pg_temp.t(4));

-- k1: the trainer's deck, shared to the room, 120 cards. k2: u4's private deck, 12 cards.
insert into public.decks (id, owner_id, classroom_id, title, is_shared) values
  (pg_temp.k(1), pg_temp.u(2), pg_temp.r(1), 'Room deck', true),
  (pg_temp.k(2), pg_temp.u(4), null, 'My deck', false);
insert into public.cards (id, deck_id, position, term, definition)
select pg_temp.c(i), pg_temp.k(1), i, 'T' || i, 'D' || i from generate_series(1, 120) i;
insert into public.cards (id, deck_id, position, term, definition)
select pg_temp.c(200 + i), pg_temp.k(2), i, 'M' || i, 'N' || i from generate_series(1, 12) i;

-- Case 1 (R2): a question pays answer/correct once ever. Repeats in a new practice attempt pay nothing,
-- and a wrong first answer never pays "correct" later.
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.step('u1 first practice', $q$select pg_temp.save('a1', public.start_attempt(pg_temp.t(1), 'practice'))$q$);
select pg_temp.step('u1 answers q1 right', $q$select public.answer_question(pg_temp.get('a1'), pg_temp.q(1), 0)$q$);
select pg_temp.step('u1 answers q2 wrong', $q$select public.answer_question(pg_temp.get('a1'), pg_temp.q(2), 1)$q$);
select pg_temp.step('u1 submits', $q$select public.submit_attempt(pg_temp.get('a1'))$q$);
select pg_temp.step('u1 second practice', $q$select pg_temp.save('a1b', public.start_attempt(pg_temp.t(1), 'practice'))$q$);
select pg_temp.step('u1 repeats q1 right', $q$select public.answer_question(pg_temp.get('a1b'), pg_temp.q(1), 0)$q$);
select pg_temp.step('u1 gets q2 right this time', $q$select public.answer_question(pg_temp.get('a1b'), pg_temp.q(2), 0)$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 1: u1 has one answer event per question (2) and one correct (q1 only)', $q$
  select count(*) filter (where source = 'answer') = 2 and count(*) filter (where source = 'correct') = 1
     and bool_and(ref_id in (pg_temp.q(1), pg_temp.q(2)))
  from public.elo_events where user_id = pg_temp.u(1) and source in ('answer', 'correct')$q$);
select pg_temp.ok('case 1: answer pays 2, correct pays 3, at the frozen x1.02 (1-day streak)', $q$
  select bool_and((source = 'answer' and points = 2) or (source = 'correct' and points = 3)) and bool_and(multiplier = 1.02)
  from public.elo_events where user_id = pg_temp.u(1) and source in ('answer', 'correct')$q$);
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.ok('case 1: room board shows 2 answered, 1 right, 7 points (7 x 1.02 = 7.14)', $q$
  select answered = 2 and correct = 1 and elo = 7 and gain = 7
  from public.leaderboard('all', pg_temp.r(1)) where user_id = pg_temp.u(1)$q$);
select pg_temp.ok('case 1: chapter board shows Elo 1207 (1200 + 7.14), gain today 7', $q$
  select elo = 1207 and gain = 7 from public.leaderboard('today', null) where user_id = pg_temp.u(1)$q$);

-- Case 2 (R7): a double tap on a practice answer keeps the first choice, no error, no extra points.
select pg_temp.ok('case 2: repeat answer returns the stored choice, not an error', $q$
  select selected_index = 0 from public.answer_question(pg_temp.get('a1b'), pg_temp.q(1), 1)$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 2: the stored answer is unchanged', $q$
  select selected_index = 0 from public.attempt_answers where attempt_id = pg_temp.get('a1b') and question_id = pg_temp.q(1)$q$);
select pg_temp.ok('case 2: still 3 answer/correct events for u1', $q$
  select count(*) = 3 from public.elo_events where user_id = pg_temp.u(1) and source in ('answer', 'correct')$q$);

-- Case 3 (R3): managers earn nothing on tests in rooms they manage (trainer on own room, executive anywhere),
-- published or draft.
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.step('trainer practises own published test', $q$select pg_temp.save('a2', public.start_attempt(pg_temp.t(1), 'practice'))$q$);
select pg_temp.step('trainer answers q1', $q$select public.answer_question(pg_temp.get('a2'), pg_temp.q(1), 0)$q$);
select pg_temp.step('trainer practises own draft', $q$select pg_temp.save('a2d', public.start_attempt(pg_temp.t(2), 'practice'))$q$);
select pg_temp.step('trainer answers the draft question', $q$select public.answer_question(pg_temp.get('a2d'), pg_temp.q(11), 0)$q$);
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.step('exec practises t1', $q$select pg_temp.save('a3', public.start_attempt(pg_temp.t(1), 'practice'))$q$);
select pg_temp.step('exec answers q1', $q$select public.answer_question(pg_temp.get('a3'), pg_temp.q(1), 0)$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 3: trainer and exec attempts are stored as not counting', $q$
  select count(*) = 3 and bool_and(not counts) from public.attempts
  where id in (pg_temp.get('a2'), pg_temp.get('a2d'), pg_temp.get('a3'))$q$);
select pg_temp.ok('case 3: managers earned no answer points', $q$
  select not exists (select 1 from public.elo_events where user_id in (pg_temp.u(2), pg_temp.u(3)) and source in ('answer', 'correct'))$q$);

-- Case 4 (R3): counts is fixed when the attempt starts. A member attempt on a published test counts; the
-- trainer's draft attempt still does not after the draft is published.
select pg_temp.ok('case 4: member attempt on a published test counts', $q$
  select counts from public.attempts where id = pg_temp.get('a1')$q$);
select pg_temp.step('publish the draft', $q$update public.tests set is_published = true where id = pg_temp.t(2)$q$);
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.step('trainer submits the old draft attempt', $q$select public.submit_attempt(pg_temp.get('a2d'))$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 4: the trainer attempt stays uncounted after publishing', $q$
  select not counts from public.attempts where id = pg_temp.get('a2d')$q$);
select pg_temp.ok('case 4: attempts.counts is not readable or writable by members (column not granted)', $q$
  select not has_column_privilege('authenticated', 'public.attempts', 'counts', 'UPDATE')
     and not has_column_privilege('authenticated', 'public.attempts', 'counts', 'INSERT')$q$);

-- Case 5 (finding 1): the streak multiplier is frozen when points are earned. A 40-day study streak pays x1.6
-- (capped at 30 days); losing the streak later leaves those points alone.
select pg_temp.step('u6 studied the last 40 days', $q$
  insert into private.study_days (user_id, day)
  select pg_temp.u(6), private.local_day(now()) - i from generate_series(1, 40) i$q$);
select pg_temp.as_user(pg_temp.u(6));
select pg_temp.step('u6 practice', $q$select pg_temp.save('a6', public.start_attempt(pg_temp.t(1), 'practice'))$q$);
select pg_temp.step('u6 answers q1 right', $q$select public.answer_question(pg_temp.get('a6'), pg_temp.q(1), 0)$q$);
select pg_temp.ok('case 5: 41-day streak pays x1.6, capped (5 x 1.6 = 8, Elo 1208, streak 41)', $q$
  select elo = 1208 and streak = 41 from public.leaderboard('all', null) where user_id = pg_temp.u(6)$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 5: events store multiplier 1.6', $q$
  select bool_and(multiplier = 1.6) and count(*) = 2 from public.elo_events where user_id = pg_temp.u(6) and source in ('answer', 'correct')$q$);
select pg_temp.step('u6 loses the old streak days', $q$
  delete from private.study_days where user_id = pg_temp.u(6) and day < private.local_day(now()) - 1$q$);
select pg_temp.as_user(pg_temp.u(6));
select pg_temp.ok('case 5: a broken streak keeps earned Elo (still 1208, streak now 2)', $q$
  select elo = 1208 and streak = 2 from public.leaderboard('all', null) where user_id = pg_temp.u(6)$q$);

-- Case 6 (R4, 0083): heartbeat minutes and sign-ins are not study days; only graded answers and card reviews
-- that earn points are.
select pg_temp.as_admin();
select pg_temp.step('u7 was on the site yesterday and the day before, no study', $q$
  insert into public.activity_minutes (user_id, minute) values
    (pg_temp.u(7), date_trunc('minute', now() - interval '1 day')),
    (pg_temp.u(7), date_trunc('minute', now() - interval '2 days'));
  insert into public.sign_in_days (user_id, day) values
    (pg_temp.u(7), private.local_day(now()) - 1), (pg_temp.u(7), private.local_day(now()) - 2)$q$);
select pg_temp.as_user(pg_temp.u(7));
select pg_temp.ok('case 6: time on site alone makes no study streak (u7 streak 0)', $q$
  select streak = 0 from public.leaderboard('all', null) where user_id = pg_temp.u(7)$q$);
select pg_temp.ok('case 6: member_stats agrees (streak 0, sign-in streak 2)', $q$
  select streak = 0 and sign_in_streak = 2 from public.member_stats(pg_temp.u(7))$q$);

-- Case 7 (R8): an unsubmitted timed attempt past its deadline is graded when a board is read, and its points
-- land at the deadline, not later.
select pg_temp.step('u7 timed run', $q$select pg_temp.save('a7', public.start_attempt(pg_temp.t(3), 'timed'))$q$);
select pg_temp.step('u7 answers timed q1 right', $q$select public.answer_question(pg_temp.get('a7'), pg_temp.q(21), 0)$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 7: a timed answer pays nothing before grading', $q$
  select not exists (select 1 from public.elo_events where user_id = pg_temp.u(7) and source in ('answer', 'correct'))$q$);
select pg_temp.step('the run expired 5 minutes ago', $q$
  update public.attempts set started_at = now() - interval '15 minutes', deadline = now() - interval '5 minutes'
  where id = pg_temp.get('a7')$q$);
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.ok('case 7: reading the board shows the expired run graded (u7 answered 1, right 1)', $q$
  select answered = 1 and correct = 1 from public.leaderboard('all', null) where user_id = pg_temp.u(7)$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 7: the attempt is submitted and scored', $q$
  select submitted_at is not null and score = 1 from public.attempts where id = pg_temp.get('a7')$q$);
select pg_temp.ok('case 7: points are dated at the deadline', $q$
  select count(*) = 2 and bool_and(e.earned_at = a.deadline)
  from public.elo_events e join public.attempts a on a.id = pg_temp.get('a7')
  where e.user_id = pg_temp.u(7) and e.source in ('answer', 'correct')$q$);
select pg_temp.ok('case 7: open timed attempts are indexed for the read-time sweep', $q$
  select exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'attempts' and indexdef ilike '%submitted_at IS NULL%')$q$);

-- Case 8 (finding 4): deleting a test or question keeps everyone's points.
select pg_temp.step('delete the timed test', $q$delete from public.tests where id = pg_temp.t(3)$q$);
select pg_temp.ok('case 8: u7 keeps both events after the test is gone', $q$
  select count(*) = 2 from public.elo_events where user_id = pg_temp.u(7) and source in ('answer', 'correct')$q$);
select pg_temp.ok('case 8: elo_events has no foreign key to tests or questions; classroom is set null', $q$
  select not exists (
      select 1 from pg_constraint c where c.conrelid = 'public.elo_events'::regclass and c.contype = 'f'
        and c.confrelid in ('public.tests'::regclass, 'public.questions'::regclass, 'public.attempts'::regclass,
                            'public.cards'::regclass, 'public.decks'::regclass))
    and exists (
      select 1 from pg_constraint c where c.conrelid = 'public.elo_events'::regclass and c.contype = 'f'
        and c.confrelid = 'public.classrooms'::regclass and c.confdeltype = 'n')$q$);

-- Case 9 (R5): card reviews pay only on decks you don't own, once per card per day, up to 100 a day.
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.step('u4 reviews all 12 cards of their own deck', $q$
  insert into public.card_reviews (card_id, known) select pg_temp.c(200 + i), true from generate_series(1, 12) i$q$);
select pg_temp.step('u4 heartbeat after own-deck reviews', $q$select public.heartbeat(pg_temp.r(1))$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 9: own-deck reviews pay nothing', $q$
  select not exists (select 1 from public.elo_events where user_id = pg_temp.u(4) and source = 'review')$q$);
select pg_temp.ok('case 13: own-deck reviews do not make a heartbeat minute count', $q$
  select not exists (select 1 from public.activity_minutes where user_id = pg_temp.u(4))$q$);
select pg_temp.ok('case 6: own-deck reviews make no study day (0083)', $q$
  select not exists (select 1 from private.study_days where user_id = pg_temp.u(4) and day = private.local_day(now()))$q$);
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.step('u4 reviews 5 room cards twice', $q$
  insert into public.card_reviews (card_id, known) select pg_temp.c(i), true from generate_series(1, 5) i;
  insert into public.card_reviews (card_id, known) select pg_temp.c(i), false from generate_series(1, 5) i$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 9: repeats the same day pay once (5 events)', $q$
  select count(*) = 5 from public.elo_events where user_id = pg_temp.u(4) and source = 'review'$q$);
select pg_temp.ok('case 6: a counted review makes today a study day, at x1.02 from its first point', $q$
  select exists (select 1 from private.study_days where user_id = pg_temp.u(4) and day = private.local_day(now()))
     and (select bool_and(multiplier = 1.02) from public.elo_events where user_id = pg_temp.u(4) and source = 'review')$q$);
select pg_temp.ok('case 18: a counted review holds the per-user advisory lock (two tabs queue for the 100th slot)', $q$
  select exists (select 1 from pg_locks l
                 where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.granted and l.objsubid = 1
                   and l.objid = (hashtext('hosa.review:' || pg_temp.u(4)::text)::bigint & 4294967295)::oid)$q$);
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.step('u4 reviews 110 more room cards', $q$
  insert into public.card_reviews (card_id, known) select pg_temp.c(i), true from generate_series(6, 115) i$q$);
select pg_temp.ok('case 9: at most 100 a day (board shows 100 reviews)', $q$
  select reviews = 100 from public.leaderboard('today', null) where user_id = pg_temp.u(4)$q$);
select pg_temp.ok('case 9: room reviews land on the room board', $q$
  select reviews = 100 and elo = 102 from public.leaderboard('all', pg_temp.r(1)) where user_id = pg_temp.u(4)$q$);

-- Case 13 (M2): heartbeat minutes count only after recent study, at most one a minute; sign-in and presence always.
select pg_temp.step('u4 heartbeats three times after counted reviews', $q$
  select public.heartbeat(pg_temp.r(1)); select public.heartbeat(pg_temp.r(1)); select public.heartbeat(null)$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 13: counted reviews make the minute count, once', $q$
  select count(*) = 1 from public.activity_minutes where user_id = pg_temp.u(4)$q$);
select pg_temp.as_user(pg_temp.u(9));
select pg_temp.step('u9 (no study) heartbeats', $q$select public.heartbeat(null)$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 13: no study, no minute', $q$
  select not exists (select 1 from public.activity_minutes where user_id = pg_temp.u(9))$q$);
select pg_temp.ok('case 13: the heartbeat still records presence and the sign-in day', $q$
  select exists (select 1 from public.presence where user_id = pg_temp.u(9))
     and exists (select 1 from public.sign_in_days where user_id = pg_temp.u(9) and day = private.local_day(now()))$q$);
select pg_temp.step('u1 last studied 11 minutes ago', $q$
  update private.study_pulse set last_at = now() - interval '11 minutes' where user_id = pg_temp.u(1)$q$);
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.step('u1 heartbeats', $q$select public.heartbeat(null)$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 13: study older than 10 minutes does not count the minute', $q$
  select not exists (select 1 from public.activity_minutes where user_id = pg_temp.u(1))$q$);
select pg_temp.as_user(pg_temp.u(7));
select pg_temp.step('u7 heartbeats (graded answers a few minutes ago)', $q$select public.heartbeat(null)$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 13: a recent answer counts the minute', $q$
  select count(*) = 1 from public.activity_minutes where user_id = pg_temp.u(7) and minute = date_trunc('minute', now())$q$);

-- Case 10 (R5 + M2): the flashcard lucky roll needs 10 counted reviews today. Match times and own-deck
-- reviews never unlock it, and record_match pays nothing.
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.step('u1 posts a match time', $q$select public.record_match(pg_temp.k(1), 10, 30000)$q$);
select pg_temp.step('u1 rolls flashcards after only a match', $q$select public.roll_lucky_bonus('flashcards')$q$);
select pg_temp.expect('case 10: record_match keeps the time floor', $q$select public.record_match(pg_temp.k(1), 10, 2999)$q$, '22023');
select pg_temp.as_user(pg_temp.u(8));
select pg_temp.step('u8 reviews 9 room cards', $q$
  insert into public.card_reviews (card_id, known) select pg_temp.c(i), true from generate_series(1, 9) i$q$);
select pg_temp.step('u8 rolls flashcards after 9', $q$select public.roll_lucky_bonus('flashcards')$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 10: 9 counted reviews do not unlock it', $q$
  select not exists (select 1 from public.elo_rolls where user_id = pg_temp.u(8) and reason = 'flashcards')$q$);
select pg_temp.as_user(pg_temp.u(8));
select pg_temp.step('u8 reviews a 10th room card', $q$insert into public.card_reviews (card_id, known) values (pg_temp.c(10), true)$q$);
select pg_temp.step('u8 rolls', $q$select public.roll_lucky_bonus('flashcards')$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 10: no roll rows for u1; u8 rolled flashcards after 10', $q$
  select not exists (select 1 from public.elo_rolls where user_id = pg_temp.u(1) and reason = 'flashcards')
     and exists (select 1 from public.elo_rolls where user_id = pg_temp.u(8) and reason = 'flashcards')$q$);
select pg_temp.ok('case 10: record_match created no review or bonus events', $q$
  select not exists (select 1 from public.elo_events where user_id = pg_temp.u(1) and source in ('review', 'bonus'))$q$);

-- Case 11 (M2): the test lucky roll needs a submitted attempt with at least 5 answers that earned points.
select pg_temp.as_user(pg_temp.u(8));
select pg_temp.step('u8 submits an empty practice', $q$
  select pg_temp.save('a8a', public.start_attempt(pg_temp.t(1), 'practice')); select public.submit_attempt(pg_temp.get('a8a'))$q$);
select pg_temp.step('u8 rolls test after an empty attempt', $q$select public.roll_lucky_bonus('test')$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 11: empty attempt does not unlock the test roll', $q$
  select not exists (select 1 from public.elo_rolls where user_id = pg_temp.u(8) and reason = 'test')$q$);
select pg_temp.as_user(pg_temp.u(8));
select pg_temp.step('u8 answers q1-q4 and submits', $q$
  select pg_temp.save('a8b', public.start_attempt(pg_temp.t(1), 'practice'));
  select public.answer_question(pg_temp.get('a8b'), pg_temp.q(i), 0) from generate_series(1, 4) i;
  select public.submit_attempt(pg_temp.get('a8b'))$q$);
select pg_temp.step('u8 rolls test after 4 earning answers', $q$select public.roll_lucky_bonus('test')$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 11: 4 earning answers do not unlock it', $q$
  select not exists (select 1 from public.elo_rolls where user_id = pg_temp.u(8) and reason = 'test')$q$);
select pg_temp.as_user(pg_temp.u(8));
select pg_temp.step('u8 answers all 8 (4 repeats, 4 new) and submits', $q$
  select pg_temp.save('a8c', public.start_attempt(pg_temp.t(1), 'practice'));
  select public.answer_question(pg_temp.get('a8c'), pg_temp.q(i), 0) from generate_series(1, 8) i;
  select public.submit_attempt(pg_temp.get('a8c'))$q$);
select pg_temp.step('u8 rolls test after 4 repeats and 4 new', $q$select public.roll_lucky_bonus('test')$q$);
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.step('u4 answers q1-q5 for the first time and submits', $q$
  select pg_temp.save('a4', public.start_attempt(pg_temp.t(1), 'practice'));
  select public.answer_question(pg_temp.get('a4'), pg_temp.q(i), 0) from generate_series(1, 5) i;
  select public.submit_attempt(pg_temp.get('a4'))$q$);
select pg_temp.step('u4 rolls test', $q$select public.roll_lucky_bonus('test')$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 11: u8 never rolled test; u4 did after 5 earning answers', $q$
  select not exists (select 1 from public.elo_rolls where user_id = pg_temp.u(8) and reason = 'test')
     and exists (select 1 from public.elo_rolls where user_id = pg_temp.u(4) and reason = 'test')$q$);
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.ok('case 11: room points for u4 are (100 reviews + 5 x 5) x 1.02 = 127.5, shown 128', $q$
  select elo = 128 and answered = 5 and correct = 5 from public.leaderboard('all', pg_temp.r(1)) where user_id = pg_temp.u(4)$q$);

-- Case 12 (R1): sign-ins (+5) and bonuses go through elo_events, chapter board only; the room board is points.
select pg_temp.as_user(pg_temp.u(5));
select pg_temp.step('u5 heartbeats (sign-in today)', $q$select public.heartbeat(null)$q$);
select pg_temp.step('u5 answers q1 right', $q$
  select pg_temp.save('a5', public.start_attempt(pg_temp.t(1), 'practice'));
  select public.answer_question(pg_temp.get('a5'), pg_temp.q(1), 0)$q$);
select pg_temp.as_admin();
select pg_temp.step('u5 gets a 20 bonus', $q$insert into public.elo_bonuses (user_id, amount, reason) values (pg_temp.u(5), 20, 'visit')$q$);
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.ok('case 12: chapter Elo = 1200 + 5 sign-in + 20 bonus + 5.1 study = 1230', $q$
  select elo = 1230 and gain = 30 from public.leaderboard('today', null) where user_id = pg_temp.u(5)$q$);
select pg_temp.ok('case 12: room board counts only room work (5 points, no base, no sign-in or bonus)', $q$
  select elo = 5 and gain = 5 from public.leaderboard('week', pg_temp.r(1)) where user_id = pg_temp.u(5)$q$);
select pg_temp.ok('case 12: member_stats Elo matches the board', $q$
  select elo = 1230 from public.member_stats(pg_temp.u(5))$q$);
select pg_temp.ok('case 12: equal Elo shares a rank (trainer and exec both 1200)', $q$
  select (select rank from public.member_stats(pg_temp.u(2))) = (select rank from public.member_stats(pg_temp.u(3)))$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 12: one signin event per sign-in day, one bonus event per bonus', $q$
  select (select count(*) from public.elo_events where user_id = pg_temp.u(5) and source = 'signin') = 1
     and (select count(*) from public.elo_events where user_id = pg_temp.u(5) and source = 'bonus' and points = 20) = 1$q$);

-- Case 14 (R6): honor roll leaves out banned members; members can't write or read ratings directly;
-- nobody but the owner can TRUNCATE.
select pg_temp.step('u5 signed in the 3 days before today', $q$
  insert into public.sign_in_days (user_id, day) select pg_temp.u(5), private.local_day(now()) - i from generate_series(1, 3) i$q$);
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.ok('case 14: u5 is on the honor roll (4 days)', $q$
  select exists (select 1 from public.honor_roll() where user_id = pg_temp.u(5) and streak = 4)$q$);
select pg_temp.as_admin();
select pg_temp.step('ban u5', $q$update public.profiles set banned_until = now() + interval '1 day', ban_reason = 'Elo audit' where id = pg_temp.u(5)$q$);
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.ok('case 14: banned u5 is off the honor roll', $q$
  select not exists (select 1 from public.honor_roll() where user_id = pg_temp.u(5))$q$);
select pg_temp.ok('case 14: banned u5 is off the chapter and room boards', $q$
  select not exists (select 1 from public.leaderboard('all', null) where user_id = pg_temp.u(5))
     and not exists (select 1 from public.leaderboard('all', pg_temp.r(1)) where user_id = pg_temp.u(5))$q$);
select pg_temp.as_user(pg_temp.u(5));
select pg_temp.expect('case 14: a banned caller gets no member stats (0075 check kept)', $q$select * from public.member_stats(pg_temp.u(1))$q$, '42501');
select pg_temp.expect('case 14: a banned caller gets no honor roll (0075 check kept)', $q$select * from public.honor_roll()$q$, '42501');
select pg_temp.expect('case 14: a banned caller gets no board', $q$select * from public.leaderboard('all', null)$q$, '42501');
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.expect('case 14: member cannot read elo_events', $q$select * from public.elo_events$q$, '42501');
select pg_temp.expect('case 14: member cannot write elo_events', $q$
  insert into public.elo_events (user_id, source, points, multiplier, earned_at) values (pg_temp.u(1), 'bonus', 50, 1, now())$q$, '42501');
select pg_temp.expect('case 14: member cannot write elo_bonuses', $q$
  insert into public.elo_bonuses (user_id, amount, reason) values (pg_temp.u(1), 50, 'visit')$q$, '42501');
select pg_temp.expect('case 14: member cannot write study days', $q$
  insert into private.study_days (user_id, day) values (pg_temp.u(1), current_date)$q$, '42501');
select pg_temp.expect('case 14: member cannot flip attempts.counts', $q$
  update public.attempts set counts = true where id = pg_temp.get('a1')$q$, '42501');
select pg_temp.as_admin();
select pg_temp.ok('case 14: no TRUNCATE for anon or authenticated on any public table', $q$
  select not exists (select 1 from information_schema.role_table_grants
                     where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type = 'TRUNCATE')$q$);
select pg_temp.ok('case 14: no grants at all on elo_events for anon or authenticated', $q$
  select not exists (select 1 from information_schema.role_table_grants
                     where table_schema = 'public' and table_name = 'elo_events' and grantee in ('anon', 'authenticated'))$q$);

-- Case 16: resubmitting pays nothing more. A second submit (double tap, second tab) returns the same score, and
-- a late grade of a submitted run is a no-op.
select pg_temp.as_user(pg_temp.u(6));
select pg_temp.step('u6 timed run on t4: q41 right, q42 wrong', $q$
  select pg_temp.save('a6t', public.start_attempt(pg_temp.t(4), 'timed'));
  select public.answer_question(pg_temp.get('a6t'), pg_temp.q(41), 0);
  select public.answer_question(pg_temp.get('a6t'), pg_temp.q(42), 1)$q$);
select pg_temp.ok('case 16: first submit scores 1 of 2', $q$
  select score = 1 and total = 2 from public.submit_attempt(pg_temp.get('a6t'))$q$);
select pg_temp.ok('case 16: a resubmit returns the same score, no error', $q$
  select score = 1 and total = 2 from public.submit_attempt(pg_temp.get('a6t'))$q$);
select pg_temp.as_admin();
select pg_temp.step('a late grade of the submitted run', $q$select private.grade_attempt(pg_temp.get('a6t'))$q$);
select pg_temp.ok('case 16: one answer event per question and one correct, submitted once', $q$
  select (select count(*) filter (where source = 'answer') = 2 and count(*) filter (where source = 'correct') = 1
          from public.elo_events where user_id = pg_temp.u(6) and attempt_id = pg_temp.get('a6t'))
     and (select score = 1 from public.attempts where id = pg_temp.get('a6t'))$q$);

-- Case 17: a regrade (a manager flips is_correct after the key changes) never adds or removes points. The
-- ledger is append-only: a wrong first answer that becomes right pays no "correct", and a right one that becomes
-- wrong keeps its points.
select pg_temp.step('regrade u6: q42 becomes right, q41 becomes wrong', $q$
  update public.attempt_answers set is_correct = (question_id = pg_temp.q(42))
  where attempt_id = pg_temp.get('a6t')$q$);
select pg_temp.ok('case 17: still 2 answer events and the one correct event, on q41', $q$
  select count(*) filter (where source = 'answer') = 2
     and count(*) filter (where source = 'correct') = 1
     and bool_and(source <> 'correct' or ref_id = pg_temp.q(41))
  from public.elo_events where user_id = pg_temp.u(6) and attempt_id = pg_temp.get('a6t')$q$);
select pg_temp.ok('case 17: grading a submitted run again does nothing (grade_attempt returns early)', $q$
  select (select submitted_at is not null from public.attempts where id = pg_temp.get('a6t'))
     and pg_get_functiondef('private.grade_attempt(uuid)'::regprocedure) ~* 'submitted_at is null for update'$q$);

-- Case 18: concurrent submits. Two sessions can't be opened in one transaction, so the race is played in both
-- orders, one after the other, and the locks that serialise it are checked: grade_attempt row-locks the attempt
-- first, the sweep skips rows another session holds, and reviews take a per-user advisory lock (checked in case 9).
select pg_temp.ok('case 18: grade_attempt locks the attempt row; the sweep uses skip locked', $q$
  select pg_get_functiondef('private.grade_attempt(uuid)'::regprocedure) ~* 'for update'
     and pg_get_functiondef('private.finalize_expired_attempts(uuid)'::regprocedure) ~* 'for update skip locked'$q$);
select pg_temp.as_user(pg_temp.u(7));
select pg_temp.step('u7 timed run on t4, both right', $q$
  select pg_temp.save('a7t', public.start_attempt(pg_temp.t(4), 'timed'));
  select public.answer_question(pg_temp.get('a7t'), pg_temp.q(41), 0);
  select public.answer_question(pg_temp.get('a7t'), pg_temp.q(42), 0)$q$);
select pg_temp.as_admin();
select pg_temp.step('the run expired 5 minutes ago', $q$
  update public.attempts set started_at = now() - interval '15 minutes', deadline = now() - interval '5 minutes'
  where id = pg_temp.get('a7t')$q$);
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.step('session A: u1 reads the board (the sweep grades the u7 run)', $q$select count(*) from public.leaderboard('all', null)$q$);
select pg_temp.as_user(pg_temp.u(7));
select pg_temp.ok('session B: the u7 submit lands after the sweep and gets the same 2 of 2', $q$
  select score = 2 and total = 2 from public.submit_attempt(pg_temp.get('a7t'))$q$);
select pg_temp.as_user(pg_temp.u(8));
select pg_temp.step('u8 timed run on t4, q41 right', $q$
  select pg_temp.save('a8t', public.start_attempt(pg_temp.t(4), 'timed'));
  select public.answer_question(pg_temp.get('a8t'), pg_temp.q(41), 0)$q$);
select pg_temp.ok('session A: u8 submits first', $q$select score = 1 from public.submit_attempt(pg_temp.get('a8t'))$q$);
select pg_temp.as_admin();
select pg_temp.step('the deadline passes', $q$
  update public.attempts set deadline = now() - interval '5 minutes' where id = pg_temp.get('a8t')$q$);
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.step('session B: the sweep runs after the submit', $q$select count(*) from public.leaderboard('all', null)$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 18: each run paid once (u7 2 answer + 2 correct, u8 1 + 1), each submitted once', $q$
  select (select count(*) = 4 from public.elo_events where attempt_id = pg_temp.get('a7t'))
     and (select count(*) = 2 from public.elo_events where attempt_id = pg_temp.get('a8t'))
     and (select count(*) = 2 and bool_and(submitted_at is not null) from public.attempts
          where id in (pg_temp.get('a7t'), pg_temp.get('a8t')))$q$);
select pg_temp.ok('case 18: the run graded by the sweep pays at its deadline', $q$
  select bool_and(e.earned_at = a.deadline) from public.elo_events e join public.attempts a on a.id = e.attempt_id
  where e.attempt_id = pg_temp.get('a7t')$q$);

-- Case 19 (0083): the read-time sweep leaves a banned member's expired run alone, then grades it once the ban
-- lifts, with points dated at the deadline. u5 is banned since case 14.
select pg_temp.step('u5 left a counted timed run on t4 open before the ban; it expired 5 minutes ago', $q$
  insert into public.attempts (id, test_id, user_id, mode, started_at, deadline, total, counts)
  values (pg_temp.id(1207, 1), pg_temp.t(4), pg_temp.u(5), 'timed', now() - interval '15 minutes',
          now() - interval '5 minutes', 2, true);
  insert into public.attempt_answers (attempt_id, question_id, selected_index, answered_at)
  values (pg_temp.id(1207, 1), pg_temp.q(41), 0, now() - interval '10 minutes')$q$);
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.step('u1 reads the board', $q$select count(*) from public.leaderboard('all', null)$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 19: the banned u5 run is still open and paid nothing', $q$
  select (select submitted_at is null from public.attempts where id = pg_temp.id(1207, 1))
     and not exists (select 1 from public.elo_events where attempt_id = pg_temp.id(1207, 1))$q$);
select pg_temp.step('the ban lifts', $q$update public.profiles set banned_until = null where id = pg_temp.u(5)$q$);
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.step('u1 reads the board again', $q$select count(*) from public.leaderboard('all', null)$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 19: after the ban the run is graded, paid once at its deadline', $q$
  select (select submitted_at is not null and score = 1 from public.attempts where id = pg_temp.id(1207, 1))
     and (select count(*) = 2 and bool_and(e.earned_at = a.deadline)
          from public.elo_events e join public.attempts a on a.id = e.attempt_id
          where e.attempt_id = pg_temp.id(1207, 1))$q$);

-- Case 15 (R1 backfill + deleting a classroom): every sign-in day, bonus and first counted graded answer in the
-- database has its event, and deleting a room keeps the points (classroom set null).
select pg_temp.ok('case 15: every sign-in day has a signin event', $q$
  select not exists (select 1 from public.sign_in_days s where not exists (
    select 1 from public.elo_events e where e.user_id = s.user_id and e.source = 'signin' and e.toronto_day = s.day))$q$);
select pg_temp.ok('case 15: every bonus has a bonus event with its amount', $q$
  select not exists (select 1 from public.elo_bonuses b where not exists (
    select 1 from public.elo_events e where e.source = 'bonus' and e.ref_id = b.id and e.points = b.amount and e.user_id = b.user_id))$q$);
select pg_temp.ok('case 15: every question with a counted graded answer has one answer event', $q$
  select not exists (
    select 1 from public.attempt_answers aa join public.attempts a on a.id = aa.attempt_id
    where aa.is_correct is not null and a.counts and not exists (
      select 1 from public.elo_events e where e.user_id = a.user_id and e.source = 'answer' and e.ref_id = aa.question_id))$q$);
select pg_temp.ok('case 15: no user has two answer events for one question', $q$
  select not exists (select 1 from public.elo_events where source = 'answer' group by user_id, ref_id having count(*) > 1)$q$);
select pg_temp.step('delete the room', $q$delete from public.classrooms where id = pg_temp.r(1)$q$);
select pg_temp.as_user(pg_temp.u(1));
-- u1: 7.14 from case 1 plus 5 for the sign-in from the case 13 heartbeat.
select pg_temp.ok('case 15: u1 keeps Elo 1212 after the room is deleted', $q$
  select elo = 1212 from public.leaderboard('all', null) where user_id = pg_temp.u(1)$q$);
select pg_temp.as_admin();
select pg_temp.ok('case 15: the answer events lost only their classroom', $q$
  select count(*) = 3 and bool_and(classroom_id is null) from public.elo_events
  where user_id = pg_temp.u(1) and source in ('answer', 'correct')$q$);

select pg_temp.as_admin();
select pg_temp.report();
rollback;
