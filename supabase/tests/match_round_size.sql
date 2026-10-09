-- Standard-round match bests (migration 0038). Runs in one transaction and rolls back; raises on the first failure.
-- A standard round is min(10, deck size) cards. Bests compare only within the same round size.
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

-- e1 trainer runs room b2. e2 owns both decks. e3 is a classmate.
-- dA (d8) starts with 3 cards, so its standard round is 3. dB (d9) has 12 cards, so its standard round is 10.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000000e1', 'rs.trainer@example.com', '{"full_name":"Round Trainer"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e2', 'rs.owner@example.com', '{"full_name":"Round Owner"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e3', 'rs.classmate@example.com', '{"full_name":"Round Two"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'trainer' where id = '00000000-0000-4000-8000-0000000000e1';

insert into public.classrooms (id, name, owner_id) values
  ('00000000-0000-4000-8000-0000000000b2', 'Round Room', '00000000-0000-4000-8000-0000000000e1');
insert into public.classroom_members (classroom_id, user_id) values
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000e2'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000e3');

insert into public.decks (id, owner_id, classroom_id, title, is_shared) values
  ('00000000-0000-4000-8000-0000000000d8', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000b2', 'Small deck', true),
  ('00000000-0000-4000-8000-0000000000d9', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000b2', 'Big deck', true);
insert into public.cards (deck_id, position, term, definition)
  select '00000000-0000-4000-8000-0000000000d8', n, 'Small ' || n, 'Def ' || n from generate_series(1, 3) n;
insert into public.cards (deck_id, position, term, definition)
  select '00000000-0000-4000-8000-0000000000d9', n, 'Big ' || n, 'Def ' || n from generate_series(1, 12) n;

-- Owner on the big deck (round 10): first full round is a new best, a faster one beats it, a slower one does not.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
select pg_temp.check('first standard round on a 12-card deck is a new best',
  (select is_full_deck and is_new_best and previous_best_ms is null
   from public.record_match('00000000-0000-4000-8000-0000000000d9', 10, 5000)));
select pg_temp.check('a faster 10-card round beats the best',
  (select is_full_deck and is_new_best and previous_best_ms = 5000
   from public.record_match('00000000-0000-4000-8000-0000000000d9', 10, 4500)));
select pg_temp.check('a 3-card round on a 12-card deck is not a standard round, not counted, shows the 10-card best',
  (select not is_full_deck and not is_new_best and previous_best_ms = 4500
   from public.record_match('00000000-0000-4000-8000-0000000000d9', 3, 1000)));
select pg_temp.check('12 cards on a 12-card deck is not the standard round either',
  (select not is_full_deck and not is_new_best and previous_best_ms = 4500
   from public.record_match('00000000-0000-4000-8000-0000000000d9', 12, 9000)));
select pg_temp.expect('a 10-card round under 3000 ms is refused',
  $q$select * from public.record_match('00000000-0000-4000-8000-0000000000d9', 10, 2999)$q$, '22023');

-- Small deck (round 3): a full round of 3 cards is a standard round.
select pg_temp.check('a 3-card deck plays its whole deck as the standard round',
  (select is_full_deck and is_new_best and previous_best_ms is null
   from public.record_match('00000000-0000-4000-8000-0000000000d8', 3, 2000)));

-- Grow the small deck to 10 cards: its round is now 10. The 3-card best must not count as the 10-card best.
select pg_temp.as_admin();
insert into public.cards (deck_id, position, term, definition)
  select '00000000-0000-4000-8000-0000000000d8', n, 'Small ' || n, 'Def ' || n from generate_series(4, 10) n;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
select pg_temp.check('bests from a different round size do not carry over when the deck grows',
  (select is_full_deck and is_new_best and previous_best_ms is null
   from public.record_match('00000000-0000-4000-8000-0000000000d8', 10, 6000)));
select pg_temp.check('a 3-card round on the 10-card deck is not counted and shows the 10-card best',
  (select not is_full_deck and not is_new_best and previous_best_ms = 6000
   from public.record_match('00000000-0000-4000-8000-0000000000d8', 3, 1000)));

-- Top five on the big deck uses 10-card rounds only: the classmate's 4000 ms round is the new top time.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
select pg_temp.check('classmate first round on the big deck is their own new best',
  (select is_full_deck and is_new_best and previous_best_ms is null
   from public.record_match('00000000-0000-4000-8000-0000000000d9', 10, 4000)));
select pg_temp.check('top times on the big deck lists 10-card bests only, fastest first',
  (select array_agg(user_name order by ord) = array['Round Two', 'Round Owner']
   from public.deck_top_times('00000000-0000-4000-8000-0000000000d9') with ordinality as t(user_name, is_you, time_ms, achieved_at, ord)));
select pg_temp.check('top times on the big deck leaves out the short and 12-card rounds',
  (select array_agg(time_ms order by ord) = array[4000, 4500]
   from public.deck_top_times('00000000-0000-4000-8000-0000000000d9') with ordinality as t(user_name, is_you, time_ms, achieved_at, ord)));
select pg_temp.check('top times on the grown small deck uses its 10-card round only',
  (select array_agg(time_ms order by ord) = array[6000]
   from public.deck_top_times('00000000-0000-4000-8000-0000000000d8') with ordinality as t(user_name, is_you, time_ms, achieved_at, ord)));

select 'match round size: all checks passed' as result;
rollback;
