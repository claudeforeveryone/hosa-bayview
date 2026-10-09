-- Match bests follow the standard round: min(10, deck size) cards. The game plays 10 cards, or the whole deck
-- when it has fewer. Bests are compared only among full-round results with the same round size, card_count.
-- Additive and compatible: same signatures and return types as 0032, replaced with create or replace (grants kept).

create or replace function public.record_match(p_deck uuid, p_card_count integer, p_time_ms integer)
returns table (match_id uuid, is_full_deck boolean, is_new_best boolean, previous_best_ms integer)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_total integer;
  v_round integer;
  v_full boolean;
  v_prev integer;
  v_id uuid;
begin
  if v_me is null or not private.can_view_deck(p_deck) then
    raise exception 'You can''t play this deck' using errcode = '42501';
  end if;
  select count(*)::integer into v_total from public.cards c where c.deck_id = p_deck;
  if v_total = 0 then
    raise exception 'This deck has no cards' using errcode = '22023';
  end if;
  if p_card_count is null or p_card_count < 1 or p_card_count > v_total then
    raise exception 'A match uses between 1 and % cards', v_total using errcode = '22023';
  end if;
  if p_time_ms is null or p_time_ms < 300 * p_card_count then
    raise exception 'That time is too fast to count' using errcode = '22023';
  end if;

  -- The standard round: 10 cards, or the whole deck when it is smaller.
  v_round := least(10, v_total);
  v_full := p_card_count = v_round;
  select min(m.time_ms) into v_prev
  from public.match_results m
  where m.user_id = v_me and m.deck_id = p_deck and m.full_deck and m.card_count = v_round;

  insert into public.match_results (user_id, deck_id, card_count, time_ms, full_deck)
  values (v_me, p_deck, p_card_count, p_time_ms, v_full)
  returning id into v_id;

  return query select v_id, v_full, (v_full and (v_prev is null or p_time_ms < v_prev)), v_prev;
end
$$;

create or replace function public.deck_top_times(p_deck uuid)
returns table (user_name text, is_you boolean, time_ms integer, achieved_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_round integer;
begin
  if not private.can_view_deck(p_deck) then
    raise exception 'You can''t see this deck' using errcode = '42501';
  end if;
  select least(10, count(*))::integer into v_round from public.cards c where c.deck_id = p_deck;
  return query
    with bests as (
      select distinct on (m.user_id) m.user_id, m.time_ms as best_ms, m.created_at as done_at
      from public.match_results m
      where m.deck_id = p_deck
        and m.full_deck
        and m.card_count = v_round
        and private.user_can_view_deck(m.user_id, p_deck)
      order by m.user_id, m.time_ms, m.created_at, m.id
    )
    select coalesce(p.full_name, 'Former member'), b.user_id = (select auth.uid()), b.best_ms, b.done_at
    from bests b
    left join public.profiles p on p.id = b.user_id
    order by b.best_ms, b.done_at, b.user_id
    limit 5;
end
$$;
