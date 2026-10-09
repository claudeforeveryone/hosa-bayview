-- Deck copies and match records (migration 0032). Runs in one transaction and rolls back; raises on the first failure.
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

-- a1 trainer runs room b1. a2 owns decks in the room. a3 is a classmate. a4 is an outsider.
-- a6, a7, a8 are classmates used for the top-five ranking.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'rk.trainer@example.com', '{"full_name":"Rank Trainer"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'rk.owner@example.com', '{"full_name":"Rank Owner"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a3', 'rk.copier@example.com', '{"full_name":"Rank Copier"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a4', 'rk.outsider@example.com', '{"full_name":"Rank Outsider"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a6', 'rk.six@example.com', '{"full_name":"Rank Six"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a7', 'rk.seven@example.com', '{"full_name":"Rank Seven"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a8', 'rk.eight@example.com', '{"full_name":"Rank Eight"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'trainer' where id = '00000000-0000-4000-8000-0000000000a1';

insert into public.classrooms (id, name, owner_id) values
  ('00000000-0000-4000-8000-0000000000b1', 'Copy And Match Room', '00000000-0000-4000-8000-0000000000a1');
insert into public.classroom_members (classroom_id, user_id) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a6'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a7'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a8');

-- d1: class deck by the trainer, shared. d2: trainee's private deck in the room. d3: trainee's deck shared to the room.
-- d4: trainee's private deck outside any room, with a 120-character title. d7: class deck for the ranking checks.
insert into public.decks (id, owner_id, classroom_id, title, description, is_shared) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'Class deck', 'From the trainer', true),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b1', 'Owner private', '', false),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b1', 'Owner shared', 'Shared by a trainee', true),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000a2', null, repeat('x', 120), '', false),
  ('00000000-0000-4000-8000-0000000000d7', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'Rank deck', '', true);
insert into public.cards (id, deck_id, position, term, definition) values
  ('00000000-0000-4000-8000-000000000f11', '00000000-0000-4000-8000-0000000000d1', 1, 'Class term 1', 'Class def 1'),
  ('00000000-0000-4000-8000-000000000f12', '00000000-0000-4000-8000-0000000000d1', 2, 'Class term 2', 'Class def 2'),
  ('00000000-0000-4000-8000-000000000f13', '00000000-0000-4000-8000-0000000000d1', 3, 'Class term 3', 'Class def 3'),
  ('00000000-0000-4000-8000-000000000f21', '00000000-0000-4000-8000-0000000000d2', 1, 'Private term 1', 'Private def 1'),
  ('00000000-0000-4000-8000-000000000f22', '00000000-0000-4000-8000-0000000000d2', 2, 'Private term 2', 'Private def 2'),
  ('00000000-0000-4000-8000-000000000f23', '00000000-0000-4000-8000-0000000000d2', 3, 'Private term 3', 'Private def 3'),
  ('00000000-0000-4000-8000-000000000f31', '00000000-0000-4000-8000-0000000000d3', 1, 'Shared term 1', 'Shared def 1'),
  ('00000000-0000-4000-8000-000000000f32', '00000000-0000-4000-8000-0000000000d3', 2, 'Shared term 2', 'Shared def 2'),
  ('00000000-0000-4000-8000-000000000f33', '00000000-0000-4000-8000-0000000000d3', 3, 'Shared term 3', 'Shared def 3'),
  ('00000000-0000-4000-8000-000000000f41', '00000000-0000-4000-8000-0000000000d4', 1, 'Long term', 'Long def'),
  ('00000000-0000-4000-8000-000000000f71', '00000000-0000-4000-8000-0000000000d7', 1, 'Rank term 1', 'Rank def 1'),
  ('00000000-0000-4000-8000-000000000f72', '00000000-0000-4000-8000-0000000000d7', 2, 'Rank term 2', 'Rank def 2'),
  ('00000000-0000-4000-8000-000000000f73', '00000000-0000-4000-8000-0000000000d7', 3, 'Rank term 3', 'Rank def 3');

-- Copies: the id of each copy is kept by label so later checks can find it.
create temp table made (label text, id uuid);
grant insert, select on made to authenticated;

-- Copy: a classmate can copy a trainee's shared deck. The copy is theirs, private, in the same room, all cards kept.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
with c as (select public.copy_deck('00000000-0000-4000-8000-0000000000d3') as id) insert into made select 'shared', id from c;
select pg_temp.check('copy is owned by the copier, private, in the same room, titled Copy of',
  (select owner_id = '00000000-0000-4000-8000-0000000000a3' and title = 'Copy of Owner shared'
      and classroom_id = '00000000-0000-4000-8000-0000000000b1' and is_shared = false and description = 'Shared by a trainee'
   from public.decks where id = (select id from made where label = 'shared')));
select pg_temp.check('copy has every card in order',
  (select array_agg(term order by position) = array['Shared term 1', 'Shared term 2', 'Shared term 3']
   from public.cards where deck_id = (select id from made where label = 'shared')));
select pg_temp.check('the source deck is unchanged after a copy',
  (select count(*) = 3 from public.cards where deck_id = '00000000-0000-4000-8000-0000000000d3'));

-- Copy: you can copy a trainer's class deck (you are in the room), and the copy keeps the room.
select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
with c as (select public.copy_deck('00000000-0000-4000-8000-0000000000d1') as id) insert into made select 'class', id from c;
select pg_temp.check('copy of a class deck belongs to the copier',
  (select owner_id = '00000000-0000-4000-8000-0000000000a2' and title = 'Copy of Class deck' and is_shared = false
   from public.decks where id = (select id from made where label = 'class')));

-- Copy: a 120-character title still fits the 120-character limit once the prefix is added.
with c as (select public.copy_deck('00000000-0000-4000-8000-0000000000d4') as id) insert into made select 'long', id from c;
select pg_temp.check('copy title is cut to 120 characters',
  (select char_length(title) = 120 and left(title, 9) = 'Copy of x' from public.decks where id = (select id from made where label = 'long')));

-- Copy refused: a private trainee deck, and any deck you can't view.
select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
select pg_temp.expect('classmate cannot copy a private trainee deck',
  $q$select public.copy_deck('00000000-0000-4000-8000-0000000000d2')$q$, '42501');
select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a4');
select pg_temp.expect('outsider cannot copy a shared trainee deck',
  $q$select public.copy_deck('00000000-0000-4000-8000-0000000000d3')$q$, '42501');
select pg_temp.check('outsider sees no decks of the room', (select count(*) from public.decks) = 0);
select pg_temp.as_admin();

-- Non-owner edits are refused server-side: updates match no rows, cards can't be added, edited or deleted.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
update public.decks set title = 'Hacked' where id = '00000000-0000-4000-8000-0000000000d1';
update public.decks set title = 'Hacked' where id = '00000000-0000-4000-8000-0000000000d3';
delete from public.decks where id = '00000000-0000-4000-8000-0000000000d3';
update public.cards set term = 'Hacked' where id = '00000000-0000-4000-8000-000000000f31';
delete from public.cards where id = '00000000-0000-4000-8000-000000000f11';
select pg_temp.expect('classmate cannot add cards to a class deck',
  $q$select public.add_cards('00000000-0000-4000-8000-0000000000d1', '[{"term":"x","definition":"y"}]'::jsonb)$q$, '42501');
select pg_temp.expect('classmate cannot add cards to a trainee deck',
  $q$select public.add_cards('00000000-0000-4000-8000-0000000000d3', '[{"term":"x","definition":"y"}]'::jsonb)$q$, '42501');
select pg_temp.expect('classmate cannot move a deck to another owner',
  $q$update public.decks set owner_id = '00000000-0000-4000-8000-0000000000a3' where id = '00000000-0000-4000-8000-0000000000d3'$q$, '42501');
select pg_temp.as_admin();
select pg_temp.check('class deck title untouched by a classmate',
  (select title = 'Class deck' from public.decks where id = '00000000-0000-4000-8000-0000000000d1'));
select pg_temp.check('trainee deck survives a classmate delete',
  (select title = 'Owner shared' from public.decks where id = '00000000-0000-4000-8000-0000000000d3'));
select pg_temp.check('class card survives a classmate delete',
  (select count(*) = 3 from public.cards where deck_id = '00000000-0000-4000-8000-0000000000d1'));
select pg_temp.check('trainee card term untouched by a classmate',
  (select term = 'Shared term 1' from public.cards where id = '00000000-0000-4000-8000-000000000f31'));

-- The copier owns the copy: rename it, add to it. Copy is not shared, so the classmate's rules stop at the copy.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
update public.decks set title = 'My copy' where id = (select id from made where label = 'shared');
select pg_temp.check('copier renames their own copy',
  (select count(*) = 1 from public.decks where id = (select id from made where label = 'shared') and title = 'My copy'));
select pg_temp.check('copier adds cards to their own copy',
  public.add_cards((select id from made where label = 'shared'), '[{"term":"New","definition":"Card"}]'::jsonb) = 1);

-- Match records. The classmate plays the shared trainee deck (3 cards, so 300 ms a pair means 900 ms minimum).
select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
select pg_temp.expect('a 3-pair match under 900 ms is refused',
  $q$select * from public.record_match('00000000-0000-4000-8000-0000000000d3', 3, 899)$q$, '22023');
select pg_temp.check('first full match is a new best with no previous best',
  (select is_full_deck and is_new_best and previous_best_ms is null
   from public.record_match('00000000-0000-4000-8000-0000000000d3', 3, 6000)));
select pg_temp.check('faster full match is a new best over the previous one',
  (select is_full_deck and is_new_best and previous_best_ms = 6000
   from public.record_match('00000000-0000-4000-8000-0000000000d3', 3, 5000)));
select pg_temp.check('a tie with the best is not a new best',
  (select is_full_deck and not is_new_best and previous_best_ms = 5000
   from public.record_match('00000000-0000-4000-8000-0000000000d3', 3, 5000)));
select pg_temp.check('exactly 300 ms a pair is accepted',
  (select is_full_deck and is_new_best and previous_best_ms = 5000
   from public.record_match('00000000-0000-4000-8000-0000000000d3', 3, 900)));
select pg_temp.check('a slower full match keeps the best',
  (select is_full_deck and not is_new_best and previous_best_ms = 900
   from public.record_match('00000000-0000-4000-8000-0000000000d3', 3, 6000)));
select pg_temp.check('a partial round is recorded, not counted, and shows the best',
  (select not is_full_deck and not is_new_best and previous_best_ms = 900
   from public.record_match('00000000-0000-4000-8000-0000000000d3', 2, 1000)));
select pg_temp.expect('a partial round under 600 ms is refused',
  $q$select * from public.record_match('00000000-0000-4000-8000-0000000000d3', 2, 500)$q$, '22023');
select pg_temp.expect('more pairs than cards is refused',
  $q$select * from public.record_match('00000000-0000-4000-8000-0000000000d3', 4, 9000)$q$, '22023');
select pg_temp.expect('zero pairs is refused',
  $q$select * from public.record_match('00000000-0000-4000-8000-0000000000d3', 0, 9000)$q$, '22023');
select pg_temp.expect('a deck you cannot view cannot be played',
  $q$select * from public.record_match('00000000-0000-4000-8000-0000000000d2', 3, 9000)$q$, '42501');
select pg_temp.check('six matches recorded for the classmate, five of them full-deck',
  (select count(*) = 6 and count(*) filter (where full_deck) = 5 from public.match_results
   where deck_id = '00000000-0000-4000-8000-0000000000d3'));
select pg_temp.check('the deck page best is the fastest full-deck time',
  (select min(time_ms) = 900 from public.match_results
   where deck_id = '00000000-0000-4000-8000-0000000000d3' and full_deck));

-- Match rows are written only by record_match: no direct insert or update.
select pg_temp.expect('no direct insert into match records',
  $q$insert into public.match_results (deck_id, card_count, time_ms, full_deck) values ('00000000-0000-4000-8000-0000000000d3', 3, 900, true)$q$, '42501');
select pg_temp.expect('no direct update of match records',
  $q$update public.match_results set time_ms = 900$q$, '42501');

-- Personal rows only: the classmate sees their own matches, not another person's.
select pg_temp.check('a match record is visible only to its player',
  (select count(*) = 0 from public.match_results where user_id = '00000000-0000-4000-8000-0000000000a2'));

-- Top five for a classroom deck: seeded directly (explicit times and dates, because now() is fixed in a transaction).
select pg_temp.as_admin();
insert into public.match_results (user_id, deck_id, card_count, time_ms, full_deck, created_at) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d7', 3, 3000, true, '2026-01-04 10:00+00'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000d7', 3, 3500, true, '2026-01-03 10:00+00'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000d7', 1, 400, false, '2026-01-01 10:00+00'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000d7', 3, 4000, true, '2026-01-02 10:00+00'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000d7', 3, 3500, true, '2026-01-05 10:00+00'),
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000d7', 3, 1000, true, '2026-01-01 10:00+00'),
  ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-0000000000d7', 3, 4500, true, '2026-01-06 10:00+00'),
  ('00000000-0000-4000-8000-0000000000a7', '00000000-0000-4000-8000-0000000000d7', 3, 5000, true, '2026-01-07 10:00+00'),
  ('00000000-0000-4000-8000-0000000000a8', '00000000-0000-4000-8000-0000000000d7', 3, 6000, true, '2026-01-08 10:00+00');

select pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
select pg_temp.check('top times lists five people',
  (select count(*) from public.deck_top_times('00000000-0000-4000-8000-0000000000d7')) = 5);
select pg_temp.check('top times ranks by time, ties to the earlier date, one row per person, outsider and partial rounds left out',
  (select array_agg(user_name order by ord) = array['Rank Trainer', 'Rank Owner', 'Rank Copier', 'Rank Six', 'Rank Seven']
   from public.deck_top_times('00000000-0000-4000-8000-0000000000d7') with ordinality as t(user_name, is_you, time_ms, achieved_at, ord)));
select pg_temp.check('top times marks only your own row',
  (select user_name = 'Rank Copier' from public.deck_top_times('00000000-0000-4000-8000-0000000000d7') where is_you));
select pg_temp.check('top times shows each best time and when it was set',
  (select array_agg(time_ms order by ord) = array[3000, 3500, 3500, 4500, 5000]
   from public.deck_top_times('00000000-0000-4000-8000-0000000000d7') with ordinality as t(user_name, is_you, time_ms, achieved_at, ord)));
select pg_temp.check('owner name for a shared deck',
  public.deck_owner_name('00000000-0000-4000-8000-0000000000d3') = 'Rank Owner');

select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a4');
select pg_temp.expect('outsider cannot read top times of a room deck',
  $q$select * from public.deck_top_times('00000000-0000-4000-8000-0000000000d7')$q$, '42501');
select pg_temp.expect('outsider cannot read the owner of a room deck',
  $q$select public.deck_owner_name('00000000-0000-4000-8000-0000000000d3')$q$, '42501');

-- A removed member drops out of the top times.
select pg_temp.as_admin();
delete from public.classroom_members
where classroom_id = '00000000-0000-4000-8000-0000000000b1' and user_id = '00000000-0000-4000-8000-0000000000a6';
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
select pg_temp.check('a removed member is left out of the top times, and the next person moves up',
  (select array_agg(user_name order by ord) = array['Rank Trainer', 'Rank Owner', 'Rank Copier', 'Rank Seven', 'Rank Eight']
   from public.deck_top_times('00000000-0000-4000-8000-0000000000d7') with ordinality as t(user_name, is_you, time_ms, achieved_at, ord)));

-- Copy after leaving the room: you still own your private deck, but the copy drops the room you can no longer see.
select pg_temp.as_admin();
delete from public.classroom_members
where classroom_id = '00000000-0000-4000-8000-0000000000b1' and user_id = '00000000-0000-4000-8000-0000000000a2';
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
with c as (select public.copy_deck('00000000-0000-4000-8000-0000000000d2') as id) insert into made select 'left', id from c;
select pg_temp.as_admin();
select pg_temp.check('a copy made after leaving the room is private with no room',
  (select owner_id = '00000000-0000-4000-8000-0000000000a2' and classroom_id is null and is_shared = false
   from public.decks where id = (select id from made where label = 'left')));

select 'deck copies and match records: all checks passed' as result;
rollback;
