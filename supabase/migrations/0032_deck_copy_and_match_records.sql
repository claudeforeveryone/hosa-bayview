-- Deck copies and match records. Additive only: no existing table, function or policy changes.
--
-- 1. copy_deck(did): a viewer copies a deck they can view into their own deck (title "Copy of ...", all cards).
--    A copy stays in the source's classroom when the viewer can still see it, but is never shared.
-- 2. match_results: one row per finished match. Only full-deck matches (every card in the deck) count toward
--    best times. Clients never write the table; record_match does, after checks.
-- 3. deck_top_times(did): the five fastest full-deck matches among people who can view the deck, one per person.
-- 4. deck_owner_name(did): who shared a deck, for "Shared by NAME" on decks you can't edit.

-- Who can view a deck, for an explicit user. Mirrors private.can_view_deck, which only knows auth.uid().
create function private.user_can_view_deck(uid uuid, did uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.decks d
    where d.id = did and (
      d.owner_id = uid
      or exists (select 1 from public.profiles p where p.id = uid and p.role = 'executive')
      or (d.classroom_id is not null and d.is_shared and (
        exists (select 1 from public.classrooms c where c.id = d.classroom_id and c.owner_id = uid)
        or exists (select 1 from public.classroom_members m where m.classroom_id = d.classroom_id and m.user_id = uid)
      ))
    )
  )
$$;

revoke all on function private.user_can_view_deck(uuid, uuid) from public, anon, authenticated;

-- Match records -------------------------------------------------------------

create table public.match_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  deck_id uuid not null references public.decks (id) on delete cascade,
  card_count integer not null check (card_count >= 1),
  -- 300 ms per pair is the fastest a person can tap a term and its definition. Faster is not a real match.
  time_ms integer not null check (time_ms >= 300 * card_count),
  full_deck boolean not null,
  created_at timestamptz not null default now()
);
create index match_results_best_idx on public.match_results (deck_id, full_deck, time_ms, created_at);
create index match_results_user_deck_idx on public.match_results (user_id, deck_id, full_deck, time_ms);
alter table public.match_results enable row level security;

revoke all on public.match_results from public, anon, authenticated;
grant select on public.match_results to authenticated;

create policy "match_results: read own"
  on public.match_results for select to authenticated
  using (user_id = (select auth.uid()));

-- RPCs ------------------------------------------------------------------

-- Records one finished match and says whether it is a new personal best. Full-deck matches only count.
-- Returns previous_best_ms as the best full-deck time before this match (null if none).
create function public.record_match(p_deck uuid, p_card_count integer, p_time_ms integer)
returns table (match_id uuid, is_full_deck boolean, is_new_best boolean, previous_best_ms integer)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_total integer;
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

  v_full := p_card_count = v_total;
  select min(m.time_ms) into v_prev
  from public.match_results m
  where m.user_id = v_me and m.deck_id = p_deck and m.full_deck;

  insert into public.match_results (user_id, deck_id, card_count, time_ms, full_deck)
  values (v_me, p_deck, p_card_count, p_time_ms, v_full)
  returning id into v_id;

  return query select v_id, v_full, (v_full and (v_prev is null or p_time_ms < v_prev)), v_prev;
end
$$;

-- Top five full-deck times among people who can view the deck: one row per person (their best),
-- fastest first, ties broken by the earlier date.
create function public.deck_top_times(p_deck uuid)
returns table (user_name text, is_you boolean, time_ms integer, achieved_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.can_view_deck(p_deck) then
    raise exception 'You can''t see this deck' using errcode = '42501';
  end if;
  return query
    with bests as (
      select distinct on (m.user_id) m.user_id, m.time_ms as best_ms, m.created_at as done_at
      from public.match_results m
      where m.deck_id = p_deck
        and m.full_deck
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

create function public.deck_owner_name(p_deck uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.can_view_deck(p_deck) then
    raise exception 'You can''t see this deck' using errcode = '42501';
  end if;
  return (
    select coalesce(p.full_name, 'Former member')
    from public.decks d
    left join public.profiles p on p.id = d.owner_id
    where d.id = p_deck
  );
end
$$;

-- Your own copy: private to you, title "Copy of ...", every card in the same order.
create function public.copy_deck(p_deck uuid)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_src public.decks%rowtype;
  v_new uuid;
begin
  if v_me is null or not private.can_view_deck(p_deck) then
    raise exception 'You can''t copy this deck' using errcode = '42501';
  end if;
  select * into v_src from public.decks d where d.id = p_deck;

  insert into public.decks (owner_id, classroom_id, title, description, is_shared)
  values (
    v_me,
    case when v_src.classroom_id is not null and private.can_view_classroom(v_src.classroom_id)
      then v_src.classroom_id end,
    left('Copy of ' || v_src.title, 120),
    v_src.description,
    false
  )
  returning id into v_new;

  insert into public.cards (deck_id, position, term, definition)
  select v_new, c.position, c.term, c.definition
  from public.cards c
  where c.deck_id = p_deck
  order by c.position;

  return v_new;
end
$$;

revoke all on function public.record_match(uuid, integer, integer), public.deck_top_times(uuid),
  public.deck_owner_name(uuid), public.copy_deck(uuid) from public, anon;
grant execute on function public.record_match(uuid, integer, integer), public.deck_top_times(uuid),
  public.deck_owner_name(uuid), public.copy_deck(uuid) to authenticated;
