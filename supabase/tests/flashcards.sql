-- Flashcard checks (migration 0016). Runs in one transaction and rolls back; raises on the first failure.
-- Uses throwaway users and a throwaway classroom only, so it works on an empty database too.
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

-- f1: trainer who runs the room. f2: trainee member (owns a private deck and a shared deck).
-- f3: second trainee member (classmate). f4: outsider, not in the room.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000000f1', 'fc.trainer@example.com', '{"full_name":"Card Trainer"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f2', 'fc.owner@example.com', '{"full_name":"Card Owner"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f3', 'fc.classmate@example.com', '{"full_name":"Card Classmate"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f4', 'fc.outsider@example.com', '{"full_name":"Card Outsider"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'trainer' where id = '00000000-0000-4000-8000-0000000000f1';

insert into public.classrooms (id, name, owner_id) values
  ('00000000-0000-4000-8000-0000000000c1', 'Flashcard Test Room', '00000000-0000-4000-8000-0000000000f1');
insert into public.classroom_members (classroom_id, user_id) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000f2'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000f3');

insert into public.decks (id, owner_id, classroom_id, title, is_shared) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000f2', null, 'Owner private', false),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000c1', 'Owner shared', true),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1', 'Class deck', true);
insert into public.cards (id, deck_id, position, term, definition) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1', 1, 'Private term', 'Private definition'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000d2', 1, 'Shared term', 'Shared definition'),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000d3', 1, 'Class term', 'Class definition');

-- Outsider: sees nothing of the room, and can't attach a deck to it.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f4');
select pg_temp.check('outsider cannot read a private deck', (select count(*) from public.decks where id = '00000000-0000-4000-8000-0000000000d1') = 0);
select pg_temp.check('outsider cannot read a shared deck', (select count(*) from public.decks where id = '00000000-0000-4000-8000-0000000000d2') = 0);
select pg_temp.check('outsider cannot read cards of a class deck', (select count(*) from public.cards where deck_id = '00000000-0000-4000-8000-0000000000d3') = 0);
select pg_temp.expect('outsider cannot add a deck to the room',
  $q$insert into public.decks (classroom_id, title) values ('00000000-0000-4000-8000-0000000000c1', 'Sneaky')$q$, '42501');

-- Classmate: sees the class deck and the shared trainee deck, not the private one.
select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f3');
select pg_temp.check('classmate reads a class deck', (select count(*) from public.decks where id = '00000000-0000-4000-8000-0000000000d3') = 1);
select pg_temp.check('classmate reads a shared trainee deck', (select count(*) from public.decks where id = '00000000-0000-4000-8000-0000000000d2') = 1);
select pg_temp.check('classmate reads cards of the shared deck', (select count(*) from public.cards where deck_id = '00000000-0000-4000-8000-0000000000d2') = 1);
select pg_temp.check('classmate cannot read the private deck', (select count(*) from public.decks where id = '00000000-0000-4000-8000-0000000000d1') = 0);
select pg_temp.check('classmate deck list shows the class deck and shared deck only',
  (select count(*) from public.deck_list('00000000-0000-4000-8000-0000000000c1')) = 2);

-- Non-owner cannot edit: updates match no rows, cards and bulk adds are refused.
update public.decks set title = 'Hacked' where id = '00000000-0000-4000-8000-0000000000d3';
update public.decks set title = 'Hacked' where id = '00000000-0000-4000-8000-0000000000d2';
select pg_temp.expect('classmate cannot add cards to a class deck',
  $q$select public.add_cards('00000000-0000-4000-8000-0000000000d3', '[{"term":"x","definition":"y"}]'::jsonb)$q$, '42501');
update public.cards set term = 'Hacked' where id = '00000000-0000-4000-8000-0000000000e3';
select pg_temp.expect('classmate cannot set owner or number',
  $q$update public.decks set owner_id = '00000000-0000-4000-8000-0000000000f3' where id = '00000000-0000-4000-8000-0000000000d2'$q$, '42501');

-- Reviews: your own only, written against cards you can see.
select pg_temp.expect('classmate cannot review a private card',
  $q$insert into public.card_reviews (card_id, known) values ('00000000-0000-4000-8000-0000000000e1', true)$q$, '42501');
insert into public.card_reviews (card_id, known) values ('00000000-0000-4000-8000-0000000000e2', true);
select pg_temp.expect('reviews cannot be written for someone else',
  $q$insert into public.card_reviews (user_id, card_id, known) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e2', true)$q$, '42501');

-- Owner: reads and edits their own deck, adds cards that continue the order.
select pg_temp.as_admin();
create temp table made (id uuid);
grant insert, select on made to authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f2');
-- The app creates decks with insert ... returning; the read policy must see the new row (0027).
with d as (insert into public.decks (title) values ('Made here') returning id) insert into made select id from d;
select pg_temp.check('insert returning gives the new deck back', (select count(*) from made) = 1);
select pg_temp.check('owner reads the private deck', (select count(*) from public.decks where id = '00000000-0000-4000-8000-0000000000d1') = 1);
select pg_temp.check('owner adds two cards', public.add_cards('00000000-0000-4000-8000-0000000000d1', '[{"term":"a","definition":"b"},{"term":"c","definition":"d"}]'::jsonb) = 2);
select pg_temp.expect('owner cannot add a blank card',
  $q$select public.add_cards('00000000-0000-4000-8000-0000000000d1', '[{"term":" ","definition":"b"}]'::jsonb)$q$, '22023');
update public.decks set title = 'Owner private renamed' where id = '00000000-0000-4000-8000-0000000000d1';
select pg_temp.as_admin();
select pg_temp.check('owner rename saved', (select title from public.decks where id = '00000000-0000-4000-8000-0000000000d1') = 'Owner private renamed');
select pg_temp.check('added cards continue the order',
  (select array_agg(position order by position) from public.cards where deck_id = '00000000-0000-4000-8000-0000000000d1') = array[1, 2, 3]);
select pg_temp.check('class deck title untouched by classmate', (select title from public.decks where id = '00000000-0000-4000-8000-0000000000d3') = 'Class deck');
select pg_temp.check('class card untouched by classmate', (select term from public.cards where id = '00000000-0000-4000-8000-0000000000e3') = 'Class term');

-- Reviews are private: each user sees only their own rows.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f3');
select pg_temp.check('classmate sees only their own review', (select count(*) from public.card_reviews) = 1);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f2');
select pg_temp.check('owner sees no reviews yet', (select count(*) from public.card_reviews) = 0);

-- Trainer runs the room: can edit any deck in it.
select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
select pg_temp.check('trainer cannot read a private deck outside the room', (select count(*) from public.decks where id = '00000000-0000-4000-8000-0000000000d1') = 0);
select pg_temp.check('trainer reads the class deck', (select count(*) from public.decks where id = '00000000-0000-4000-8000-0000000000d3') = 1);
update public.decks set title = 'Trainer touched' where id = '00000000-0000-4000-8000-0000000000d2';
select pg_temp.as_admin();
select pg_temp.check('trainer edit saved on owner shared deck',
  (select title from public.decks where id = '00000000-0000-4000-8000-0000000000d2') = 'Trainer touched');

-- Migration 0022. A trainee deck in a room is the owner's until it is shared. Seeded here so the checks above stay as they were.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000000f5', 'fc.exec@example.com', '{"full_name":"Card Exec"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'executive' where id = '00000000-0000-4000-8000-0000000000f5';
insert into public.decks (id, owner_id, classroom_id, title, is_shared) values
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000c1', 'Classmate private', false);
insert into public.cards (id, deck_id, position, term, definition) values
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000d4', 1, 'Own term', 'Own definition');

-- A: the trainer runs the room but cannot see or touch an unshared trainee deck.
select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
select pg_temp.check('trainer cannot read an unshared trainee deck in the room', (select count(*) from public.decks where id = '00000000-0000-4000-8000-0000000000d4') = 0);
select pg_temp.check('trainer cannot read cards of an unshared trainee deck', (select count(*) from public.cards where deck_id = '00000000-0000-4000-8000-0000000000d4') = 0);
select pg_temp.check('trainer deck list leaves out the unshared trainee deck', (select count(*) from public.deck_list('00000000-0000-4000-8000-0000000000c1')) = 2);
update public.decks set title = 'Trainer tried' where id = '00000000-0000-4000-8000-0000000000d4';
select pg_temp.expect('trainer cannot add cards to an unshared trainee deck',
  $q$select public.add_cards('00000000-0000-4000-8000-0000000000d4', '[{"term":"x","definition":"y"}]'::jsonb)$q$, '42501');
select pg_temp.as_admin();
select pg_temp.check('trainer update did not change the trainee deck', (select title from public.decks where id = '00000000-0000-4000-8000-0000000000d4') = 'Classmate private');

select pg_temp.as_user('00000000-0000-4000-8000-0000000000f2');
select pg_temp.check('classmate cannot read an unshared trainee deck', (select count(*) from public.decks where id = '00000000-0000-4000-8000-0000000000d4') = 0);

select pg_temp.as_user('00000000-0000-4000-8000-0000000000f3');
select pg_temp.check('owner reads their unshared trainee deck', (select count(*) from public.decks where id = '00000000-0000-4000-8000-0000000000d4') = 1);

select pg_temp.as_user('00000000-0000-4000-8000-0000000000f5');
select pg_temp.check('executive reads an unshared trainee deck', (select count(*) from public.decks where id = '00000000-0000-4000-8000-0000000000d4') = 1);
select pg_temp.check('executive reads a private deck of another owner', (select count(*) from public.decks where id = '00000000-0000-4000-8000-0000000000d1') = 1);

-- B: the owner shares it while still in the room; the classmate and the trainer can then read it.
select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f3');
update public.decks set is_shared = true where id = '00000000-0000-4000-8000-0000000000d4';
select pg_temp.as_admin();
select pg_temp.check('owner shares a trainee deck into the room', (select is_shared from public.decks where id = '00000000-0000-4000-8000-0000000000d4'));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f2');
select pg_temp.check('classmate reads the trainee deck once shared', (select count(*) from public.decks where id = '00000000-0000-4000-8000-0000000000d4') = 1);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
select pg_temp.check('trainer reads the trainee deck once shared', (select count(*) from public.decks where id = '00000000-0000-4000-8000-0000000000d4') = 1);

-- Learning cards: your own latest review per card, one deck at a time. Reviews are written with explicit times
-- because every statement in this transaction shares one now().
select pg_temp.as_admin();
insert into public.card_reviews (user_id, card_id, known, reviewed_at) values
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e1', false, '2026-01-01 10:00+00'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e1', true, '2026-01-01 10:05+00'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e2', false, '2026-01-01 10:00+00');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f2');
select pg_temp.check('still learning lists the card whose latest review is unknown',
  (select coalesce(array_agg(x), '{}'::uuid[]) from public.learning_card_ids('00000000-0000-4000-8000-0000000000d2') x) = array['00000000-0000-4000-8000-0000000000e2'::uuid]);
select pg_temp.check('a card whose latest review is known is not still learning',
  (select count(*) from public.learning_card_ids('00000000-0000-4000-8000-0000000000d1')) = 0);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f3');
select pg_temp.check('classmate learning list ignores other reviewers', (select count(*) from public.learning_card_ids('00000000-0000-4000-8000-0000000000d2')) = 0);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f5');
select pg_temp.check('executive sees other reviews but the learning list is only their own',
  (select count(*) from public.card_reviews where card_id = '00000000-0000-4000-8000-0000000000e2') = 2
  and (select count(*) from public.learning_card_ids('00000000-0000-4000-8000-0000000000d2')) = 0);

-- C: the owner unshares, then leaves the room. A removed member cannot share into it again.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f3');
update public.decks set is_shared = false where id = '00000000-0000-4000-8000-0000000000d4';
select pg_temp.as_admin();
select pg_temp.check('owner unshares a trainee deck', (select is_shared from public.decks where id = '00000000-0000-4000-8000-0000000000d4') = false);
delete from public.classroom_members where classroom_id = '00000000-0000-4000-8000-0000000000c1' and user_id = '00000000-0000-4000-8000-0000000000f3';
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f3');
select pg_temp.expect('removed member cannot share a deck into the room they left',
  $q$update public.decks set is_shared = true where id = '00000000-0000-4000-8000-0000000000d4'$q$, '42501');
update public.decks set title = 'Renamed while unshared' where id = '00000000-0000-4000-8000-0000000000d4';
select pg_temp.as_admin();
select pg_temp.check('removed member can still rename an unshared deck', (select title from public.decks where id = '00000000-0000-4000-8000-0000000000d4') = 'Renamed while unshared');

select 'flashcards: all checks passed' as result;
rollback;
