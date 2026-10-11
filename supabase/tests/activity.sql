-- Activity, Elo, leaderboard, member and career checks (migration 0017; Elo rules since 0080/0081, see elo_audit.sql).
-- Runs in one transaction and rolls back; raises on the first failure. Throwaway users only.
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

-- b1 member of room c1 (trainer b3 runs it). b2 outsider trainee. b4 executive.
-- b5 runs room c2 (b1 is not in it). b6 idle, used for streak and stale presence.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000000b1', 'act.member@example.com', '{"full_name":"Act Member"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'act.outsider@example.com', '{"full_name":"Act Outsider"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b3', 'act.trainer@example.com', '{"full_name":"Act Trainer"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b4', 'act.exec@example.com', '{"full_name":"Act Exec"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b5', 'act.trainer2@example.com', '{"full_name":"Act Trainer Two"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b6', 'act.idle@example.com', '{"full_name":"Act Idle"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b7', 'act.lucky@example.com', '{"full_name":"Act Lucky"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b8', 'act.bonus@example.com', '{"full_name":"Act Bonus"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'trainer' where id in ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000b5');
update public.profiles set role = 'executive' where id = '00000000-0000-4000-8000-0000000000b4';

insert into public.classrooms (id, name, owner_id) values
  ('00000000-0000-4000-8000-0000000000c1', 'Activity room one', '00000000-0000-4000-8000-0000000000b3'),
  ('00000000-0000-4000-8000-0000000000c2', 'Activity room two', '00000000-0000-4000-8000-0000000000b5');
insert into public.classroom_members (classroom_id, user_id) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1');

insert into public.tests (id, classroom_id, title, is_published, created_by) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 'Activity test one', true, '00000000-0000-4000-8000-0000000000b3'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c2', 'Activity test two', true, '00000000-0000-4000-8000-0000000000b5');
insert into public.questions (id, test_id, position, prompt, options) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 1, 'Pick a', array['a', 'b']),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e1', 2, 'Pick b', array['a', 'b']),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000e2', 1, 'Pick x', array['x', 'y']);
insert into public.question_keys (question_id, correct_index, explanation) values
  ('00000000-0000-4000-8000-0000000000f1', 0, 'A is right'),
  ('00000000-0000-4000-8000-0000000000f2', 0, 'A again'),
  ('00000000-0000-4000-8000-0000000000f3', 1, 'Y is right');

-- a1: practice, two graded answers (one right, one wrong) in room one.
-- a2: practice, one right answer in room two.
-- a3: timed and never submitted, answer not yet graded: must not count.
-- counts: what start_attempt stores for a member on a published test (0081).
insert into public.attempts (id, test_id, user_id, mode, total, counts) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', 'practice', 2, true),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000b1', 'practice', 1, true),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', 'timed', 2, true);
insert into public.attempt_answers (attempt_id, question_id, selected_index, is_correct) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000f1', 0, true),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000f2', 1, false),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000f3', 1, true),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000f1', 0, null);

-- Flashcards: d1 belongs to room one, d2 is a private deck.
insert into public.decks (id, owner_id, classroom_id, title) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000c1', 'Room deck'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000b1', null, 'Private deck');
insert into public.cards (id, deck_id, position, term, definition) values
  ('00000000-0000-4000-8000-0000000000ab', '00000000-0000-4000-8000-0000000000d1', 1, 'T1', 'D1'),
  ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000d2', 1, 'T2', 'D2');
insert into public.card_reviews (user_id, card_id, known, reviewed_at) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000ab', true, now()),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000ac', false, now());

-- Farming guard: a repeat review later the same day adds no credit, and a repeat answer earns only the repeat point
-- (0105: 1 when wrong, once per question per day).
insert into public.attempts (id, test_id, user_id, mode, total, counts) values
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', 'practice', 2, true);
insert into public.attempt_answers (attempt_id, question_id, selected_index, is_correct, answered_at) values
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000f1', 1, false, now() + interval '1 second');
insert into public.card_reviews (user_id, card_id, known, reviewed_at) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000ab', false, now() + interval '1 second');

-- Heartbeat: idempotent per minute, classroom kept ---------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select public.heartbeat('00000000-0000-4000-8000-0000000000c1');
select public.heartbeat('00000000-0000-4000-8000-0000000000c1');
select public.heartbeat('00000000-0000-4000-8000-0000000000c1');
select public.heartbeat(null);

select pg_temp.as_admin();
select pg_temp.check('three heartbeats in one minute make one row',
  (select count(*) from public.activity_minutes where user_id = '00000000-0000-4000-8000-0000000000b1') = 1);
select pg_temp.check('the row is truncated to the minute',
  (select minute = date_trunc('minute', minute) from public.activity_minutes where user_id = '00000000-0000-4000-8000-0000000000b1'));
select pg_temp.check('a later heartbeat without a room keeps the room',
  (select classroom_id = '00000000-0000-4000-8000-0000000000c1' from public.activity_minutes where user_id = '00000000-0000-4000-8000-0000000000b1'));
-- Presence follows the latest heartbeat: the last call was from Home, so no room, and it is recent.
select pg_temp.check('presence follows the latest heartbeat and is recent',
  (select classroom_id is null and last_seen > now() - interval '1 minute'
     from public.presence where user_id = '00000000-0000-4000-8000-0000000000b1'));
-- Heartbeats also record today as a sign-in day, once.
select pg_temp.check('three heartbeats record one sign-in day for today',
  (select count(*) = 1 from public.sign_in_days
     where user_id = '00000000-0000-4000-8000-0000000000b1' and day = private.local_day(now())));

-- An outsider's room id is ignored: the minute counts as chapter time only. (b2 studied just now, so the
-- minute counts at all: since 0081 minutes need study in the last 10 minutes.)
insert into private.study_pulse (user_id, last_at) values ('00000000-0000-4000-8000-0000000000b2', now());
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select public.heartbeat('00000000-0000-4000-8000-0000000000c1');
select pg_temp.as_admin();
select pg_temp.check('outsider heartbeat for a room they cannot see stores no room',
  (select classroom_id is null from public.activity_minutes where user_id = '00000000-0000-4000-8000-0000000000b2'));
select pg_temp.check('outsider presence has no room',
  (select classroom_id is null from public.presence where user_id = '00000000-0000-4000-8000-0000000000b2'));

-- Nobody signed in cannot write a heartbeat.
select pg_temp.as_admin();
select pg_temp.expect('heartbeat needs a signed-in user', 'select public.heartbeat(null)', '42501');

-- Stale presence (10 minutes ago) must not count as online.
insert into public.presence (user_id, classroom_id, last_seen) values
  ('00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-0000000000c1', now() - interval '10 minutes');

-- Direct table access is closed; only the RPCs read or write ------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select pg_temp.expect('member cannot read activity_minutes directly', 'select * from public.activity_minutes', '42501');
select pg_temp.expect('member cannot read presence directly', 'select * from public.presence', '42501');
select pg_temp.expect('member cannot write presence directly', 'update public.presence set last_seen = now()', '42501');

-- Scoping: room boards for viewers only, chapter board for everyone signed in -----------
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.expect('outsider cannot read room board', 'select * from public.leaderboard(''week'', ''00000000-0000-4000-8000-0000000000c1'')', '42501');
select pg_temp.expect('outsider cannot see who is online in a room', 'select * from public.members_online(''00000000-0000-4000-8000-0000000000c1'')', '42501');
select pg_temp.expect('unknown period is refused', 'select * from public.leaderboard(''year'', null)', '22023');
select pg_temp.check('outsider can read the chapter board',
  (select count(*) from public.leaderboard('all', null)) > 0);
select pg_temp.check('online list hides stale presence (chapter)',
  not exists (select 1 from public.members_online(null) where user_id = '00000000-0000-4000-8000-0000000000b6'));
select pg_temp.check('online list shows b1 (chapter)',
  exists (select 1 from public.members_online(null) where user_id = '00000000-0000-4000-8000-0000000000b1'));

-- b1 now opens the room, so the room's online list shows them.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select public.heartbeat('00000000-0000-4000-8000-0000000000c1');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b3');
select pg_temp.check('trainer sees b1 online in room one',
  exists (select 1 from public.members_online('00000000-0000-4000-8000-0000000000c1') where user_id = '00000000-0000-4000-8000-0000000000b1'));
select pg_temp.check('room online list leaves out b2 (online elsewhere)',
  not exists (select 1 from public.members_online('00000000-0000-4000-8000-0000000000c1') where user_id = '00000000-0000-4000-8000-0000000000b2'));

-- Board numbers (trainer b3 runs room one) ----------------------------------------------
select pg_temp.check('room board: b1 answered 2, right 1, accuracy 0.5, 1 review, 1 minute',
  (select answered = 2 and correct = 1 and accuracy = 0.5 and reviews = 1 and minutes = 1
     from public.leaderboard('all', '00000000-0000-4000-8000-0000000000c1') where user_id = '00000000-0000-4000-8000-0000000000b1'));
select pg_temp.check('room board holds only room members',
  not exists (select 1 from public.leaderboard('all', '00000000-0000-4000-8000-0000000000c1') where user_id = '00000000-0000-4000-8000-0000000000b2'));

select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
-- Reviews: only the room deck card counts; d2 is b1's own deck and pays nothing (R5).
select pg_temp.check('chapter board: b1 answered 3 right 2, 1 counted review',
  (select answered = 3 and correct = 2 and reviews = 1 from public.leaderboard('all', null) where user_id = '00000000-0000-4000-8000-0000000000b1'));
select pg_temp.check('streak counts today for b1',
  (select streak = 1 from public.leaderboard('all', null) where user_id = '00000000-0000-4000-8000-0000000000b1'));
-- Study gains: 1 counted review + 3 answered x 2 + 2 right x 3 + 1 wrong repeat (0105) = 14 (minutes do not count);
-- streak 1 gives x1.02 => 14.28. Plus 5 for today's sign-in (x1): 19.28, so Elo 19 (no base since 0105). Everything
-- happened today, so the gain is 19 too.
select pg_temp.check('elo in the board matches the formula (19, gain 19)',
  (select elo = 19 and gain = 19 from public.leaderboard('all', null) where user_id = '00000000-0000-4000-8000-0000000000b1'));

-- Career: own answers; trainers see answers in their rooms; executives see all; trainees never see others'
select pg_temp.check('career keeps every graded answer, repeats included (history, not score)',
  (select count(*) from public.career('00000000-0000-4000-8000-0000000000b1', null)) = 4);

select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.check('trainee gets zero rows for another member',
  (select count(*) from public.career('00000000-0000-4000-8000-0000000000b1', null)) = 0);
select pg_temp.check('trainee career for self is empty',
  (select count(*) from public.career('00000000-0000-4000-8000-0000000000b2', null)) = 0);

select pg_temp.as_user('00000000-0000-4000-8000-0000000000b3');
select pg_temp.check('room trainer sees only answers in their room',
  (select count(*) from public.career('00000000-0000-4000-8000-0000000000b1', null)) = 3);

select pg_temp.as_user('00000000-0000-4000-8000-0000000000b5');
select pg_temp.check('other trainer sees only their own room answers',
  (select count(*) from public.career('00000000-0000-4000-8000-0000000000b1', null)) = 1);

select pg_temp.as_user('00000000-0000-4000-8000-0000000000b4');
select pg_temp.check('executive sees all answers',
  (select count(*) from public.career('00000000-0000-4000-8000-0000000000b1', null)) = 4);

-- Member profile and directory -----------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.check('profile stats visible to another member, with a rank',
  (select count(*) = 1 and bool_and(rank >= 1) from public.member_stats('00000000-0000-4000-8000-0000000000b1')));
select pg_temp.check('profile shows sign-in streak (1, today) and all-time elo 19',
  (select sign_in_streak = 1 and elo = 19 from public.member_stats('00000000-0000-4000-8000-0000000000b1')));
select pg_temp.check('profile for a missing member is empty',
  (select count(*) from public.member_stats('00000000-0000-4000-8000-0000000000ff')) = 0);
-- The full directory is an executive tool (0204): another member gets no rows, an executive gets everyone.
select pg_temp.check('directory lists no one for a member',
  (select count(*) from public.member_directory()) = 0);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b4');
select pg_temp.check('directory lists members by name for an executive',
  (select count(*) from public.member_directory() where user_id in ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b3')) = 2);

-- Streaks, all in Toronto days -----------------------------------------------------------
select pg_temp.as_admin();
insert into public.activity_minutes (user_id, minute, classroom_id) values
  ('00000000-0000-4000-8000-0000000000b4', date_trunc('minute', now() - interval '1 day'), null),
  ('00000000-0000-4000-8000-0000000000b4', date_trunc('minute', now() - interval '2 days'), null),
  ('00000000-0000-4000-8000-0000000000b6', date_trunc('minute', now() - interval '3 days'), null);
-- Since 0080 the streak is study days only (R4): minutes on the site alone make none.
select pg_temp.check('streak: minutes alone make no study streak (exec b4)',
  (select streak = 0 from private.standings('-infinity', null) where user_id = '00000000-0000-4000-8000-0000000000b4'));
insert into private.study_days (user_id, day) values
  ('00000000-0000-4000-8000-0000000000b4', private.local_day(now() - interval '1 day')),
  ('00000000-0000-4000-8000-0000000000b4', private.local_day(now() - interval '2 days')),
  ('00000000-0000-4000-8000-0000000000b6', private.local_day(now() - interval '3 days'));
select pg_temp.check('streak: study yesterday and the day before still count (exec)',
  (select streak = 2 from private.standings('-infinity', null) where user_id = '00000000-0000-4000-8000-0000000000b4'));
select pg_temp.check('streak: a single old study day has ended',
  (select streak = 0 from private.standings('-infinity', null) where user_id = '00000000-0000-4000-8000-0000000000b6'));

-- Sign-in days: b4 signed in yesterday and the day before, b6 for the last three days, b1 today (from heartbeat).
insert into public.sign_in_days (user_id, day) values
  ('00000000-0000-4000-8000-0000000000b4', private.local_day(now() - interval '1 day')),
  ('00000000-0000-4000-8000-0000000000b4', private.local_day(now() - interval '2 days')),
  ('00000000-0000-4000-8000-0000000000b6', private.local_day(now() - interval '1 day')),
  ('00000000-0000-4000-8000-0000000000b6', private.local_day(now() - interval '2 days')),
  ('00000000-0000-4000-8000-0000000000b6', private.local_day(now() - interval '3 days'));
select pg_temp.check('sign-in streak: yesterday and the day before count (b4)',
  private.sign_in_streak('00000000-0000-4000-8000-0000000000b4') = 2);
select pg_temp.check('sign-in streak: three days running (b6)',
  private.sign_in_streak('00000000-0000-4000-8000-0000000000b6') = 3);
select pg_temp.check('sign-in streak: none for a member who never signed in (b5)',
  private.sign_in_streak('00000000-0000-4000-8000-0000000000b5') = 0);

-- Elo gained by period: b4 has minutes and sign-ins only on past days, so today's gain is zero.
-- All time: 2 sign-ins x 5 = 10. The two minutes rows add nothing: time no longer counts. Total elo is all-time in every
-- period, with no base (0105).
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.check('gain today leaves out past days (b4 gains 0 today, elo 10)',
  (select gain = 0 and elo = 10 from public.leaderboard('today', null) where user_id = '00000000-0000-4000-8000-0000000000b4'));
select pg_temp.check('gain all time counts every day, minutes excluded (b4 gains 10)',
  (select gain = 10 and elo = 10 from public.leaderboard('all', null) where user_id = '00000000-0000-4000-8000-0000000000b4'));
select pg_temp.check('gain today for b1 is today activity plus today sign-in (19, elo 19)',
  (select gain = 19 and elo = 19 from public.leaderboard('today', null) where user_id = '00000000-0000-4000-8000-0000000000b1'));
select pg_temp.check('week and month gains for b1 are 19 (all of it is this week)',
  (select bool_and(gain = 19) from public.leaderboard('week', null) where user_id = '00000000-0000-4000-8000-0000000000b1')
  and (select bool_and(gain = 19) from public.leaderboard('month', null) where user_id = '00000000-0000-4000-8000-0000000000b1'));
select pg_temp.check('hours stat still reported on the board (b1 has 1 minute)',
  (select minutes = 1 from public.leaderboard('all', null) where user_id = '00000000-0000-4000-8000-0000000000b1'));

-- Honor roll: 3+ day sign-in streaks. b6 qualifies, b4 (2 days) and b1 (today only) do not.
select pg_temp.check('honor roll lists a 3-day streak (b6)',
  exists (select 1 from public.honor_roll() where user_id = '00000000-0000-4000-8000-0000000000b6' and streak = 3));
select pg_temp.check('honor roll leaves out streaks under 3 days (b4, b1)',
  not exists (select 1 from public.honor_roll() where user_id in ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000b1')));
select pg_temp.check('honor roll lists only 3+ day streaks',
  not exists (select 1 from public.honor_roll() where streak < 3));
select pg_temp.as_admin();
select pg_temp.expect('honor roll needs a signed-in user', 'select * from public.honor_roll()', '42501');
select pg_temp.check('today starts at Toronto midnight, within the last day',
  private.period_start('today') between now() - interval '1 day' and now());

-- Lucky bonuses for b8 (manual rows, so the sums are exact). Newest first: 25 now, 10 / 10 / 10 a few seconds
-- back, 50 two days ago, 5 three days ago. Total 110; today 55; the old two are outside today.
insert into public.elo_bonuses (user_id, amount, reason, created_at) values
  ('00000000-0000-4000-8000-0000000000b8', 25, 'visit', now()),
  ('00000000-0000-4000-8000-0000000000b8', 10, 'test', now() - interval '1 second'),
  ('00000000-0000-4000-8000-0000000000b8', 10, 'flashcards', now() - interval '2 seconds'),
  ('00000000-0000-4000-8000-0000000000b8', 10, 'visit', now() - interval '3 seconds'),
  ('00000000-0000-4000-8000-0000000000b8', 50, 'test', now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000000b8', 5, 'flashcards', now() - interval '3 days');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.check('bonuses count toward all-time elo (b8: 110)',
  (select elo = 110 and gain = 110 from public.leaderboard('all', null) where user_id = '00000000-0000-4000-8000-0000000000b8'));
select pg_temp.check('bonuses count toward today gain, old ones leave out (b8: 55)',
  (select gain = 55 and elo = 110 from public.leaderboard('today', null) where user_id = '00000000-0000-4000-8000-0000000000b8'));
select pg_temp.check('member profile elo includes bonuses (b8 110)',
  (select elo = 110 from public.member_stats('00000000-0000-4000-8000-0000000000b8')));
select pg_temp.check('recent bonuses: five rows, newest first (b8)',
  (select count(*) = 5 from public.recent_bonuses('00000000-0000-4000-8000-0000000000b8'))
  and (select amount = 25 from public.recent_bonuses('00000000-0000-4000-8000-0000000000b8') limit 1)
  and not exists (select 1 from public.recent_bonuses('00000000-0000-4000-8000-0000000000b8') where amount = 5));
select pg_temp.check('recent bonuses are empty for a member with none (b5)',
  (select count(*) = 0 from public.recent_bonuses('00000000-0000-4000-8000-0000000000b5')));

-- Roll rules: a real roll for b7 (random, so only the rules are checked). Each reason rolls once a day.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b7');
select set_config('act.visit1', public.roll_lucky_bonus('visit')::text, true);
select set_config('act.visit2', public.roll_lucky_bonus('visit')::text, true);
select set_config('act.visit3', public.roll_lucky_bonus('visit')::text, true);
select set_config('act.test1', public.roll_lucky_bonus('test')::text, true);
select set_config('act.test2', public.roll_lucky_bonus('test')::text, true);
select set_config('act.flash1', public.roll_lucky_bonus('flashcards')::text, true);
select pg_temp.expect('roll refuses an unknown reason', 'select public.roll_lucky_bonus(''year'')', '22023');
select pg_temp.as_admin();
select pg_temp.expect('roll needs a signed-in user', 'select public.roll_lucky_bonus(''visit'')', '42501');
select pg_temp.check('first visit roll pays 0, 5 to 25, or the 50 jackpot',
  (select v = 0 or v = 50 or (v between 5 and 25) from (select current_setting('act.visit1')::int as v) x));
select pg_temp.check('repeat rolls the same day pay nothing (visit x2, test x1)',
  current_setting('act.visit2')::int = 0 and current_setting('act.visit3')::int = 0 and current_setting('act.test2')::int = 0);
-- Since 0043 test and flashcard rolls only count after that work was done today, so b7 (no work today) keeps
-- just the visit roll.
select pg_temp.check('one roll row per reason per day, and only rolls that were earned (b7: visit only)',
  (select array_agg(reason order by reason) = array['visit'] from public.elo_rolls
   where user_id = '00000000-0000-4000-8000-0000000000b7' and day = private.local_day(now())));
select pg_temp.check('bonus rows match the paid rolls (b7)',
  (select count(*) = ((current_setting('act.visit1')::int > 0)::int + (current_setting('act.test1')::int > 0)::int + (current_setting('act.flash1')::int > 0)::int)
     from public.elo_bonuses where user_id = '00000000-0000-4000-8000-0000000000b7'));
select pg_temp.check('bonus rows for b7 stay in range (5 to 25, or 50)',
  not exists (select 1 from public.elo_bonuses where user_id = '00000000-0000-4000-8000-0000000000b7' and amount not in (50) and amount not between 5 and 25));
select pg_temp.expect('bonus amounts are checked at the table', $$insert into public.elo_bonuses (user_id, amount, reason) values ('00000000-0000-4000-8000-0000000000b7', 51, 'visit')$$, '23514');
select pg_temp.expect('bonus reason is checked at the table', $$insert into public.elo_bonuses (user_id, amount, reason) values ('00000000-0000-4000-8000-0000000000b7', 5, 'bogus')$$, '23514');

-- The odds and amounts come from one pure function, so they test without randomness.
select pg_temp.check('lucky: no win (roll 0.5) pays nothing', private.lucky_amount(0.5, 0, 0) = 0);
select pg_temp.check('lucky: 0.2 is the first losing roll', private.lucky_amount(0.2, 0, 0) = 0);
select pg_temp.check('lucky: smallest win is 5', private.lucky_amount(0.199, 0.5, 0) = 5);
select pg_temp.check('lucky: largest win is 25', private.lucky_amount(0.1, 0.5, 0.999999) = 25);
select pg_temp.check('lucky: middle win is 15', private.lucky_amount(0.1, 0.5, 0.5) = 15);
select pg_temp.check('lucky: jackpot pays 50 (1 in 50 of wins)', private.lucky_amount(0.1, 0.0199, 0) = 50);
select pg_temp.check('lucky: 0.02 is not the jackpot', private.lucky_amount(0.1, 0.02, 0) = 5);

-- The Elo formula now lives in public.elo_events (0080): points are written when earned, with the streak
-- multiplier frozen then. supabase/tests/elo_audit.sql checks it.

-- Leftover rollback
rollback;
