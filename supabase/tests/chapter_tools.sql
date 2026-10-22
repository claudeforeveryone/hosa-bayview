-- Chapter tools and mock competitions (migrations 0050-0057). One transaction, rolled back; raises on the first failure.
-- Fixtures are throwaway users with ids 00000000-0000-4000-8000-*. The board checks assume the run is more than
-- two minutes after Toronto midnight.
begin;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.r(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8100-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.t(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8200-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.q(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8300-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.a(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8400-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.k(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8500-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.cd(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8600-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
-- The mock competition room, id set with set_config in section F.
create function pg_temp.comp() returns uuid language sql stable as $$
  select current_setting('chap.comp')::uuid
$$;

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

create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
end $$;

-- The statement must fail with this SQLSTATE.
create function pg_temp.expect(label text, stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL %: expected %, got success', label, state using errcode = 'XX001';
exception when others then
  if sqlstate <> state then raise exception 'FAIL %: expected %, got % (%)', label, state, sqlstate, sqlerrm; end if;
end $$;

create function pg_temp.save(k text, v uuid) returns void language plpgsql as $$
begin
  perform set_config('chap.test_' || k, v::text, true);
end $$;

create function pg_temp.get(k text) returns uuid language sql as $$
  select current_setting('chap.test_' || k)::uuid
$$;

-- A. Fixtures ---------------------------------------------------------------------------------------------------
-- Users: 1 executive; 2 and 6 trainers with rooms 1 and 2; 3, 4, 9 members of room 1; 7 member of room 2;
-- 5 outsider; 8 flashcards; 9 is banned in section I; 10 gets a role change in section H.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  (pg_temp.u(1), 'chap.exec@example.com', '{"full_name":"Chap Exec"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(2), 'chap.trainer1@example.com', '{"full_name":"Chap Trainer One"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(3), 'chap.m1@example.com', '{"full_name":"Chap Member One"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(4), 'chap.m2@example.com', '{"full_name":"Chap Member Two"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(5), 'chap.outsider@example.com', '{"full_name":"Chap Outsider"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(6), 'chap.trainer2@example.com', '{"full_name":"Chap Trainer Two"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(7), 'chap.m3@example.com', '{"full_name":"Chap Member Three"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(8), 'chap.flash@example.com', '{"full_name":"Chap Flash"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(9), 'chap.banned@example.com', '{"full_name":"Chap Banned"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(10), 'chap.promote@example.com', '{"full_name":"Chap Promote"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'executive' where id = pg_temp.u(1);
update public.profiles set role = 'trainer' where id in (pg_temp.u(2), pg_temp.u(6));
insert into public.classrooms (id, name, owner_id) values
  (pg_temp.r(1), 'Chap Room One', pg_temp.u(2)),
  (pg_temp.r(2), 'Chap Room Two', pg_temp.u(6));
insert into public.classroom_members (classroom_id, user_id) values
  (pg_temp.r(1), pg_temp.u(3)), (pg_temp.r(1), pg_temp.u(4)), (pg_temp.r(1), pg_temp.u(9)),
  (pg_temp.r(2), pg_temp.u(7));

-- Room one has a class test with four questions (keys all 0). Publishing it notifies the room.
insert into public.tests (id, classroom_id, title, is_published, created_by) values
  (pg_temp.t(1), pg_temp.r(1), 'Chap class test', true, pg_temp.u(2));
insert into public.questions (id, test_id, position, prompt, options) values
  (pg_temp.q(1), pg_temp.t(1), 1, 'Class Q1', array['a', 'b']),
  (pg_temp.q(2), pg_temp.t(1), 2, 'Class Q2', array['a', 'b']),
  (pg_temp.q(3), pg_temp.t(1), 3, 'Class Q3', array['a', 'b']),
  (pg_temp.q(4), pg_temp.t(1), 4, 'Class Q4', array['a', 'b']);
insert into public.question_keys (question_id, correct_index, explanation) values
  (pg_temp.q(1), 0, 'A'), (pg_temp.q(2), 0, 'A'), (pg_temp.q(3), 0, 'A'), (pg_temp.q(4), 0, 'A');

-- Member 3: two minutes in room one and one chapter-only minute, a sign-in today, a 20 lucky bonus,
-- and four graded answers in room one (three right).
insert into public.activity_minutes (user_id, minute, classroom_id) values
  (pg_temp.u(3), date_trunc('minute', now()), pg_temp.r(1)),
  (pg_temp.u(3), date_trunc('minute', now() - interval '1 minute'), pg_temp.r(1)),
  (pg_temp.u(3), date_trunc('minute', now() - interval '2 minutes'), null);
insert into public.sign_in_days (user_id, day) values (pg_temp.u(3), private.local_day(now()));
insert into public.elo_bonuses (user_id, amount, reason, created_at) values (pg_temp.u(3), 20, 'visit', now());
insert into public.attempts (id, test_id, user_id, mode, total, counts) values
  (pg_temp.a(1), pg_temp.t(1), pg_temp.u(3), 'practice', 4, true);
insert into public.attempt_answers (attempt_id, question_id, selected_index, is_correct) values
  (pg_temp.a(1), pg_temp.q(1), 0, true), (pg_temp.a(1), pg_temp.q(2), 0, true),
  (pg_temp.a(1), pg_temp.q(3), 0, true), (pg_temp.a(1), pg_temp.q(4), 1, false);

-- B. Announcements and notifications ----------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.expect('trainer cannot post to the whole chapter',
  $$insert into public.announcements (classroom_id, title) values (null, 'Sneaky chapter')$$, '42501');
insert into public.announcements (classroom_id, title, body) values (pg_temp.r(1), 'Room news', 'Quiz moved to Friday');

select pg_temp.as_user(pg_temp.u(3));
select pg_temp.expect('member cannot post to their room',
  $$insert into public.announcements (classroom_id, title) values (pg_temp.r(1), 'Member news')$$, '42501');
select pg_temp.check('member reads their room and the chapter announcements',
  exists (select 1 from public.announcements where title = 'Room news'));

select pg_temp.as_user(pg_temp.u(6));
select pg_temp.expect('another trainer cannot post to room one',
  $$insert into public.announcements (classroom_id, title) values (pg_temp.r(1), 'Other news')$$, '42501');
select pg_temp.check('another trainer cannot read room one announcements',
  not exists (select 1 from public.announcements where classroom_id = pg_temp.r(1)));

select pg_temp.as_user(pg_temp.u(7));
select pg_temp.check('other room member cannot read room one announcements',
  not exists (select 1 from public.announcements where title = 'Room news'));

select pg_temp.as_user(pg_temp.u(1));
insert into public.announcements (classroom_id, title, body) values (null, 'Chapter news', 'Welcome');

select pg_temp.as_user(pg_temp.u(5));
select pg_temp.check('outsider reads chapter announcements',
  exists (select 1 from public.announcements where title = 'Chapter news'));

select pg_temp.as_admin();
select pg_temp.check('room notice reaches each member, not the author or outsiders',
  (select count(*) = 2 from public.notifications
     where title = 'Room news' and kind = 'announcement' and user_id in (pg_temp.u(3), pg_temp.u(4)))
  and not exists (select 1 from public.notifications
     where title = 'Room news' and user_id in (pg_temp.u(2), pg_temp.u(5), pg_temp.u(7))));
select pg_temp.check('chapter notice reaches an outsider, not its author',
  exists (select 1 from public.notifications where title = 'Chapter news' and user_id = pg_temp.u(5))
  and not exists (select 1 from public.notifications where title = 'Chapter news' and user_id = pg_temp.u(1)));
select pg_temp.check('a new room test notifies its members',
  exists (select 1 from public.notifications
          where kind = 'test' and user_id = pg_temp.u(3) and title = 'New test: Chap class test'));

-- Unread counts and marking read touch only the signed-in member's own rows.
select set_config('chap.ids3', (select string_agg(id::text, ',') from public.notifications
                                where user_id = pg_temp.u(3)), true);
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.check('unread count sees own notices', public.unread_notifications() >= 3);
select pg_temp.as_user(pg_temp.u(4));
select public.mark_notifications_read(string_to_array(current_setting('chap.ids3'), ',')::uuid[]);
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.check('marking another member''s ids leaves yours unread', public.unread_notifications() >= 3);
select public.mark_notifications_read(null);
select pg_temp.check('mark all read clears your own unread count', public.unread_notifications() = 0);
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.check('the other member''s unread count is untouched', public.unread_notifications() >= 2);
select pg_temp.check('members see only their own notices',
  exists (select 1 from public.notifications where user_id = pg_temp.u(4))
  and not exists (select 1 from public.notifications where user_id = pg_temp.u(3)));
select pg_temp.expect('notices cannot be written directly',
  $$insert into public.notifications (user_id, kind, title) values (pg_temp.u(4), 'announcement', 'Fake')$$, '42501');

-- C. Events -----------------------------------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(2));
insert into public.events (classroom_id, title, starts_at, location)
  values (pg_temp.r(1), 'Room event', now() + interval '2 days', 'Room 4');
select pg_temp.expect('trainer cannot post a chapter event',
  $$insert into public.events (classroom_id, title, starts_at) values (null, 'Sneaky event', now())$$, '42501');
select pg_temp.as_user(pg_temp.u(6));
insert into public.events (classroom_id, title, starts_at) values (pg_temp.r(2), 'Room two event', now() + interval '3 days');
select pg_temp.expect('another trainer cannot add to room one',
  $$insert into public.events (classroom_id, title, starts_at) values (pg_temp.r(1), 'Other event', now())$$, '42501');
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.expect('member cannot add an event',
  $$insert into public.events (classroom_id, title, starts_at) values (pg_temp.r(1), 'Member event', now())$$, '42501');
select pg_temp.check('member sees own room events only',
  exists (select 1 from public.events where title = 'Room event')
  and not exists (select 1 from public.events where title = 'Room two event'));
select pg_temp.as_user(pg_temp.u(7));
select pg_temp.check('other room member sees room two events only',
  exists (select 1 from public.events where title = 'Room two event')
  and not exists (select 1 from public.events where title = 'Room event'));
select pg_temp.as_user(pg_temp.u(1));
insert into public.events (classroom_id, title, starts_at) values (null, 'Chapter event', now() + interval '4 days');
select pg_temp.as_user(pg_temp.u(5));
select pg_temp.check('outsider sees chapter events but no room events',
  exists (select 1 from public.events where title = 'Chapter event')
  and not exists (select 1 from public.events where title in ('Room event', 'Room two event')));

-- D. Materials, storage folders -----------------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(2));
insert into public.materials (classroom_id, title, url) values (pg_temp.r(1), 'Notes link', 'https://example.com/notes');
insert into public.materials (classroom_id, title, path, file_name, size_bytes, mime)
  values (pg_temp.r(1), 'Notes file', pg_temp.r(1)::text || '/notes.pdf', 'notes.pdf', 1000, 'application/pdf');
select pg_temp.expect('a file path must sit in its room folder',
  $$insert into public.materials (classroom_id, title, path) values (pg_temp.r(1), 'Wrong folder', pg_temp.r(2)::text || '/x.pdf')$$, '23514');
select pg_temp.expect('trainer cannot add to the chapter library',
  $$insert into public.materials (classroom_id, title, url) values (null, 'Chapter link', 'https://example.com/c')$$, '42501');
insert into storage.objects (bucket_id, name) values ('materials', pg_temp.r(1)::text || '/notes.pdf');

select pg_temp.as_user(pg_temp.u(3));
select pg_temp.expect('member cannot add materials',
  $$insert into public.materials (classroom_id, title, url) values (pg_temp.r(1), 'Member link', 'https://example.com/m')$$, '42501');
select pg_temp.check('member sees room materials, other rooms not',
  exists (select 1 from public.materials where title = 'Notes link')
  and exists (select 1 from public.materials where title = 'Notes file'));
select pg_temp.check('member can read the room file',
  exists (select 1 from storage.objects where bucket_id = 'materials' and name = pg_temp.r(1)::text || '/notes.pdf'));
select pg_temp.expect('member cannot upload into the room folder',
  $$insert into storage.objects (bucket_id, name) values ('materials', pg_temp.r(1)::text || '/evil.pdf')$$, '42501');
select pg_temp.check('folder check refuses a folder that is not a room id',
  not private.material_folder_ok('nope', false));

select pg_temp.as_user(pg_temp.u(7));
select pg_temp.check('other room cannot read the file or the link',
  not exists (select 1 from storage.objects where bucket_id = 'materials' and name = pg_temp.r(1)::text || '/notes.pdf')
  and not exists (select 1 from public.materials where title = 'Notes link'));

select pg_temp.as_user(pg_temp.u(1));
insert into public.materials (classroom_id, title, url) values (null, 'Handbook', 'https://example.com/handbook');
insert into storage.objects (bucket_id, name) values ('materials', 'chapter/handbook.pdf');
select pg_temp.as_user(pg_temp.u(5));
select pg_temp.check('chapter library is readable by everyone',
  exists (select 1 from storage.objects where bucket_id = 'materials' and name = 'chapter/handbook.pdf')
  and exists (select 1 from public.materials where title = 'Handbook'));
select pg_temp.expect('outsider cannot upload to the chapter folder',
  $$insert into storage.objects (bucket_id, name) values ('materials', 'chapter/x.pdf')$$, '42501');

-- E. Deck move into a classroom (0051) ----------------------------------------------------------------------------
select pg_temp.as_admin();
insert into public.decks (id, owner_id, classroom_id, title) values (pg_temp.k(1), pg_temp.u(3), null, 'Member deck');
select pg_temp.as_user(pg_temp.u(3));
update public.decks set classroom_id = pg_temp.r(1) where id = pg_temp.k(1);
update public.decks set is_shared = true where id = pg_temp.k(1);
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.check('room member sees the shared deck', exists (select 1 from public.decks where id = pg_temp.k(1)));
select pg_temp.as_user(pg_temp.u(7));
select pg_temp.check('other room does not see the shared deck', not exists (select 1 from public.decks where id = pg_temp.k(1)));
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.expect('a shared deck cannot leave its room without unsharing',
  $$update public.decks set classroom_id = null where id = pg_temp.k(1)$$, '42501');
select pg_temp.expect('a deck cannot move into a room its owner cannot see',
  $$update public.decks set classroom_id = pg_temp.r(2) where id = pg_temp.k(1)$$, '42501');
-- The exec can see both rooms, so moving the shared deck room one to room two must unshare it.
select pg_temp.as_user(pg_temp.u(1));
update public.decks set classroom_id = pg_temp.r(2) where id = pg_temp.k(1);
select pg_temp.check('moving a deck into another room unshares it',
  exists (select 1 from public.decks where id = pg_temp.k(1) and classroom_id = pg_temp.r(2) and is_shared = false));

-- F1. Mock competitions: creation, upcoming -----------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.expect('trainer cannot run a mock competition',
  $$insert into public.classrooms (name, owner_id, kind) values ('Sneaky mock', pg_temp.u(2), 'competition')$$, '42501');
select pg_temp.as_user(pg_temp.u(1));
with ins as (
  insert into public.classrooms (name, owner_id, kind, opens_at, closes_at)
  values ('Chap Mock', pg_temp.u(1), 'competition', now() + interval '1 day', now() + interval '2 days')
  returning id)
select set_config('chap.comp', id::text, true) from ins;
select pg_temp.check('exec created the competition room', exists (
  select 1 from public.classrooms where id = pg_temp.comp() and kind = 'competition' and opens_at > now()));

select pg_temp.as_admin();
insert into public.tests (id, classroom_id, title, is_published) values (pg_temp.t(2), pg_temp.comp(), 'Mock one', true);
insert into public.questions (id, test_id, position, prompt, options) values
  (pg_temp.q(5), pg_temp.t(2), 1, 'Mock Q1', array['a', 'b', 'c']);
insert into public.question_keys (question_id, correct_index, explanation) values (pg_temp.q(5), 2, 'C is right');
select pg_temp.check('competition tests get one timed run with a 60 minute limit by default', exists (
  select 1 from public.tests where id = pg_temp.t(2) and attempts_allowed = 1 and time_limit_minutes = 60));
-- Member 4 has already answered in the competition (not submitted). That must stay off class boards.
insert into public.attempts (id, test_id, user_id, mode, deadline, total, counts) values
  (pg_temp.a(2), pg_temp.t(2), pg_temp.u(4), 'timed', now() + interval '1 hour', 1, true);
insert into public.attempt_answers (attempt_id, question_id, selected_index, is_correct) values
  (pg_temp.a(2), pg_temp.q(5), 2, true);
select pg_temp.expect('competitions refuse join codes (membership rows)',
  'insert into public.classroom_members (classroom_id, user_id) values (''' || pg_temp.comp() || ''', ''' || pg_temp.u(3) || ''')',
  '22023');

select pg_temp.as_user(pg_temp.u(2));
select pg_temp.expect('trainer cannot add a test to the competition',
  'insert into public.tests (classroom_id, title) values (''' || pg_temp.comp() || ''', ''Sneaky test'')', '42501');
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.expect('upcoming: members cannot start a timed run',
  'select public.start_attempt(''' || pg_temp.t(2) || ''', ''timed'')', '42501');
select pg_temp.expect('upcoming: members cannot start practice',
  'select public.start_attempt(''' || pg_temp.t(2) || ''', ''practice'')', '42501');
select pg_temp.check('upcoming: members cannot see the mock test', not exists (select 1 from public.tests where id = pg_temp.t(2)));
select pg_temp.check('member list hides competitions', not exists (
  select 1 from public.my_classrooms() where id = pg_temp.comp()));
select pg_temp.as_user(pg_temp.u(5));
select pg_temp.check('outsider sees the competition and that it is upcoming, with no test count yet', exists (
  select 1 from public.competitions() c where c.id = pg_temp.comp() and c.state = 'upcoming' and c.test_count = 0));
select pg_temp.check('upcoming: classroom_tests lists nothing for a member',
  not exists (select 1 from public.classroom_tests(pg_temp.comp())));
select pg_temp.check('outsider can see the competition room row', exists (select 1 from public.classrooms where id = pg_temp.comp()));
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.check('exec lists only rooms they are in (0297), never the competition', not exists (
  select 1 from public.my_classrooms() where id = pg_temp.r(1))
  and not exists (select 1 from public.my_classrooms() where id = pg_temp.comp())
  and exists (select 1 from public.classroom_detail(pg_temp.r(1))));

-- G. Boards and the daily flashcard cap ----------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(3));
-- Since 0081 a class board shows room points with no 1200 base: (4 x 2 + 3 x 3) x 1.02 = 17.34.
select pg_temp.check('class board: room minutes (2), answers (4), right (3), 17 points with no sign-in or bonus',
  (select minutes = 2 and answered = 4 and correct = 3 and elo = 17 and gain = 17
     from public.leaderboard('all', pg_temp.r(1)) where user_id = pg_temp.u(3)));
select pg_temp.check('chapter board: all minutes (3), sign-in and bonus (elo 1242)',
  (select minutes = 3 and elo = 1242 and gain = 42 from public.leaderboard('all', null) where user_id = pg_temp.u(3)));
select pg_temp.check('class board ignores competition answers, chapter board counts them',
  (select answered = 0 and minutes = 0 and elo = 0 from public.leaderboard('all', pg_temp.r(1)) where user_id = pg_temp.u(4))
  and (select answered = 1 from public.leaderboard('all', null) where user_id = pg_temp.u(4)));
select pg_temp.check('class board holds only room members',
  not exists (select 1 from public.leaderboard('all', pg_temp.r(1)) where user_id = pg_temp.u(5)));

select pg_temp.as_admin();
-- The deck is the trainer's: reviews on your own deck pay nothing since 0080 (R5).
insert into public.decks (id, owner_id, classroom_id, title) values (pg_temp.k(2), pg_temp.u(2), null, 'Flash deck');
insert into public.cards (id, deck_id, position, term, definition)
  select pg_temp.cd(i), pg_temp.k(2), i, 'T' || i, 'D' || i from generate_series(1, 150) i;
-- 30 cards yesterday, then 120 cards today (plus repeats of card 1, which must not add).
insert into public.card_reviews (user_id, card_id, known, reviewed_at)
  select pg_temp.u(8), pg_temp.cd(i), true, now() - interval '1 day' from generate_series(121, 150) i;
insert into public.card_reviews (user_id, card_id, known, reviewed_at)
  select pg_temp.u(8), pg_temp.cd(i), true, now() from generate_series(1, 120) i;
insert into public.card_reviews (user_id, card_id, known, reviewed_at)
  select pg_temp.u(8), pg_temp.cd(1), false, now() - make_interval(secs => i) from generate_series(1, 5) i;

select pg_temp.as_user(pg_temp.u(8));
-- Elo is all-time, and each day's multiplier is frozen then (0080). Yesterday's 30 cards earned x1.02 (1-day
-- streak); today makes a 2-day streak, so today's 100 counted cards earn x1.04 = 104.
-- Week: 30.6 + 104 = 134.6, shown 135; all-time elo 1335. On a Monday yesterday is last week, so the week is
-- today alone (100 cards, 104).
select pg_temp.check('flashcards: today counts at most 100 cards (gain 104)',
  (select reviews = 100 and gain = 104 from public.leaderboard('today', null) where user_id = pg_temp.u(8)));
select pg_temp.check('flashcards: the cap is per day (week counts 100 + 30 = 130 unless yesterday was last week, elo 1335)',
  (select case when (now() - interval '1 day') at time zone 'America/Toronto'
                    >= date_trunc('week', now() at time zone 'America/Toronto')
               then reviews = 130 and gain = 135 else reviews = 100 and gain = 104 end
          and elo = 1335
     from public.leaderboard('week', null) where user_id = pg_temp.u(8)));

-- F2. Mock competitions: open, then closed -----------------------------------------------------------------------
select pg_temp.as_admin();
update public.classrooms set opens_at = now() - interval '1 hour', closes_at = now() + interval '1 hour' where id = pg_temp.comp();

select pg_temp.as_user(pg_temp.u(3));
select pg_temp.expect('open: practice is refused',
  'select public.start_attempt(''' || pg_temp.t(2) || ''', ''practice'')', '22023');
select pg_temp.save('comp1', public.start_attempt(pg_temp.t(2), 'timed'));
select pg_temp.check('open: a timed run answer gives no verdict or key', exists (
  select 1 from public.answer_question(pg_temp.get('comp1'), pg_temp.q(5), 2) r
  where r.selected_index = 2 and r.is_correct is null and r.correct_index is null and r.explanation is null));
select public.submit_attempt(pg_temp.get('comp1'));
select pg_temp.check('open: after submit the review shows the answer but no keys', exists (
  select 1 from public.attempt_sheet(pg_temp.get('comp1')) r where r.selected_index = 2)
  and not exists (select 1 from public.attempt_sheet(pg_temp.get('comp1')) r
                  where r.correct_index is not null or r.is_correct is not null or r.explanation is not null));
select pg_temp.check('open: attempt questions show no keys either', not exists (
  select 1 from public.attempt_questions(pg_temp.get('comp1')) r
  where r.correct_index is not null or r.is_correct is not null or r.explanation is not null));
select pg_temp.expect('open: the one timed run is used up',
  'select public.start_attempt(''' || pg_temp.t(2) || ''', ''timed'')', '22023');
select pg_temp.check('open: members see no results yet',
  (select count(*) from public.competition_results(pg_temp.comp())) = 0);
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.check('open: exec sees the results board early', (select count(*) from public.competition_results(pg_temp.comp())) = 1);

select pg_temp.as_admin();
update public.classrooms set opens_at = now() - interval '2 hours', closes_at = now() - interval '1 hour' where id = pg_temp.comp();
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.check('closed: results board opens to members',
  (select count(*) from public.competition_results(pg_temp.comp())) = 1);
select pg_temp.check('closed: the review now shows the key and explanation', exists (
  select 1 from public.attempt_sheet(pg_temp.get('comp1')) r where r.correct_index = 2 and r.explanation = 'C is right'));
select pg_temp.expect('closed: no new timed run',
  'select public.start_attempt(''' || pg_temp.t(2) || ''', ''timed'')', '22023');
select pg_temp.check('closed: practice opens for anyone who wants another go',
  public.start_attempt(pg_temp.t(2), 'practice') is not null);
select pg_temp.check('closed: competitions() shows the state and your timed runs', exists (
  select 1 from public.competitions() c where c.id = pg_temp.comp() and c.state = 'closed' and c.my_done = 1));

-- H. Admin log ---------------------------------------------------------------------------------------------------
select pg_temp.as_admin();
update public.profiles set role = 'trainer' where id = pg_temp.u(10);
select pg_temp.check('role change is in the admin log', exists (
  select 1 from public.admin_log where action = 'role' and target_id = pg_temp.u(10) and detail like '%trainer'));
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.check('trainer cannot read the admin log', (select count(*) from public.admin_log) = 0);
select pg_temp.expect('trainer cannot write to the admin log',
  $$insert into public.admin_log (action, detail) values ('role', 'forged')$$, '42501');
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.check('member cannot read the admin log', (select count(*) from public.admin_log) = 0);
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.check('exec reads the admin log', (select count(*) from public.admin_log) >= 1);

-- I. Bans come off the boards and the notice list --------------------------------------------------------------------
select pg_temp.as_admin();
update public.profiles set banned_until = now() + interval '1 day', ban_reason = 'Chap test' where id = pg_temp.u(9);
select pg_temp.check('ban is in the admin log', exists (
  select 1 from public.admin_log where action = 'banned' and target_id = pg_temp.u(9)));
select pg_temp.as_user(pg_temp.u(1));
insert into public.announcements (classroom_id, title, body) values (null, 'After ban', 'Still here');
select pg_temp.as_admin();
select pg_temp.check('banned member gets no later notice', not exists (
  select 1 from public.notifications where title = 'After ban' and user_id = pg_temp.u(9))
  and exists (select 1 from public.notifications where title = 'After ban' and user_id = pg_temp.u(5)));
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.check('banned member is off the chapter and room boards', not exists (
  select 1 from public.leaderboard('all', null) where user_id = pg_temp.u(9))
  and not exists (select 1 from public.leaderboard('all', pg_temp.r(1)) where user_id = pg_temp.u(9)));

select 'chapter_tools: all checks passed' as result;
rollback;
