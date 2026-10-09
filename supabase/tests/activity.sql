-- Activity, Elo, leaderboard, member and career checks (migration 0017).
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
  ('00000000-0000-4000-8000-0000000000b6', 'act.idle@example.com', '{"full_name":"Act Idle"}', now(), 'authenticated', 'authenticated');
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
insert into public.attempts (id, test_id, user_id, mode, total) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', 'practice', 2),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000b1', 'practice', 1),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', 'timed', 2);
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

-- Farming guard: a repeat practice attempt and a repeat review later the same day must not add credit.
insert into public.attempts (id, test_id, user_id, mode, total) values
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', 'practice', 2);
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

-- An outsider's room id is ignored: the minute counts as chapter time only.
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
select pg_temp.check('chapter board: b1 answered 3 right 2, 2 reviews',
  (select answered = 3 and correct = 2 and reviews = 2 from public.leaderboard('all', null) where user_id = '00000000-0000-4000-8000-0000000000b1'));
select pg_temp.check('streak counts today for b1',
  (select streak = 1 from public.leaderboard('all', null) where user_id = '00000000-0000-4000-8000-0000000000b1'));
-- Chapter gains: 1 min x 0.5 + 2 reviews + 3 answered x 2 + 2 right x 3 = 14.5; streak 1 gives x1.02 => 1214.79, rounds to 1215.
select pg_temp.check('elo in the board matches the formula (1215)',
  (select elo = 1215 from public.leaderboard('all', null) where user_id = '00000000-0000-4000-8000-0000000000b1'));

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
select pg_temp.check('profile for a missing member is empty',
  (select count(*) from public.member_stats('00000000-0000-4000-8000-0000000000ff')) = 0);
select pg_temp.check('directory lists members by name',
  (select count(*) from public.member_directory() where user_id in ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b3')) = 2);

-- Streaks, all in Toronto days -----------------------------------------------------------
select pg_temp.as_admin();
insert into public.activity_minutes (user_id, minute, classroom_id) values
  ('00000000-0000-4000-8000-0000000000b4', date_trunc('minute', now() - interval '1 day'), null),
  ('00000000-0000-4000-8000-0000000000b4', date_trunc('minute', now() - interval '2 days'), null),
  ('00000000-0000-4000-8000-0000000000b6', date_trunc('minute', now() - interval '3 days'), null);
select pg_temp.check('streak: yesterday and the day before still count (exec)',
  private.streak_of('00000000-0000-4000-8000-0000000000b4') = 2);
select pg_temp.check('streak: a single old day has ended',
  private.streak_of('00000000-0000-4000-8000-0000000000b6') = 0);

-- Elo formula ---------------------------------------------------------------------------
select pg_temp.check('elo: base is 1200', private.elo_score(0, 0, 0, 0, 0) = 1200);
select pg_temp.check('elo: 60 minutes is +30', private.elo_score(60, 0, 0, 0, 0) = 1230);
select pg_temp.check('elo: 10 reviews is +10', private.elo_score(0, 10, 0, 0, 0) = 1210);
select pg_temp.check('elo: 10 answered with 5 right is +35', private.elo_score(0, 0, 10, 5, 0) = 1235);
select pg_temp.check('elo: streak multiplies gains, not the base', private.elo_score(0, 0, 0, 0, 30) = 1200);
select pg_temp.check('elo: 30-day streak is x1.6 on gains', private.elo_score(100, 0, 0, 0, 30) = 1280);
select pg_temp.check('elo: streak above 30 is capped', private.elo_score(100, 0, 0, 0, 90) = 1280);

-- Leftover rollback
rollback;
