-- Flashcard fixes after review. Replaces rules from 0016 (already applied, not edited).
--
-- 1. A trainee's deck is seen and edited by its owner and executives. A classroom trainer sees and
--    edits a trainee's deck only once it is shared to that room. Trainer decks are unchanged.
-- 2. A deck can only be shared into a classroom its owner can still view.
-- 3. learning_card_ids(deck): your own latest review per card, for one deck. No other reviewers' rows.
-- 4. add_cards takes a per-deck lock before reading max(position), so two pastes can't collide.

create or replace function private.can_view_deck(did uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.decks d
    where d.id = did and (
      d.owner_id = (select auth.uid())
      or private.is_executive()
      or (d.classroom_id is not null and d.is_shared and private.can_view_classroom(d.classroom_id))
    )
  )
$$;

create or replace function private.can_edit_deck(did uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.decks d
    where d.id = did and (
      d.owner_id = (select auth.uid())
      or private.is_executive()
      or (d.classroom_id is not null and d.is_shared and private.can_manage_classroom(d.classroom_id))
    )
  )
$$;

drop policy "decks: editors update" on public.decks;
create policy "decks: editors update"
  on public.decks for update to authenticated
  using (private.can_edit_deck(id))
  with check (
    private.can_edit_deck(id)
    and (classroom_id is not null or not is_shared)
    and (not is_shared or private.can_view_classroom(classroom_id))
  );

-- Cards you have marked still learning: your latest review of each card is "still learning".
-- Runs as the caller, so RLS keeps it to your own reviews.
create function public.learning_card_ids(did uuid)
returns setof uuid
language sql stable security invoker set search_path = ''
as $$
  select latest.card_id
  from (
    select distinct on (r.card_id) r.card_id, r.known
    from public.card_reviews r
    join public.cards c on c.id = r.card_id
    where c.deck_id = learning_card_ids.did
      and r.user_id = (select auth.uid())
    order by r.card_id, r.reviewed_at desc, r.id desc
  ) latest
  where not latest.known
$$;

revoke all on function public.learning_card_ids(uuid) from public, anon;
grant execute on function public.learning_card_ids(uuid) to authenticated;

-- Appends cards in order. items: [{term, definition}], all or nothing.
create or replace function public.add_cards(did uuid, items jsonb)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  item jsonb;
  t text;
  def text;
  n integer := 0;
  start_at integer;
begin
  if not private.can_edit_deck(did) then
    raise exception 'Only the owner or the classroom trainer can edit this deck' using errcode = '42501';
  end if;
  -- Two pastes into one deck must not both read the same max(position).
  perform pg_advisory_xact_lock(hashtextextended('hosa.add_cards:' || did::text, 0));
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Nothing to add' using errcode = '22023';
  end if;
  if jsonb_array_length(items) > 300 then
    raise exception 'Add at most 300 cards at a time' using errcode = '22023';
  end if;
  select coalesce(max(c.position), 0) into start_at from public.cards c where c.deck_id = did;
  for item in select value from jsonb_array_elements(items) loop
    t := btrim(coalesce(item ->> 'term', ''));
    def := btrim(coalesce(item ->> 'definition', ''));
    if t = '' or def = '' then
      raise exception 'Card % needs a term and a definition', n + 1 using errcode = '22023';
    end if;
    if char_length(t) > 500 or char_length(def) > 2000 then
      raise exception 'Card % is too long', n + 1 using errcode = '22023';
    end if;
    n := n + 1;
    insert into public.cards (deck_id, position, term, definition)
    values (did, start_at + n, t, def);
  end loop;
  return n;
end
$$;

revoke all on function public.add_cards(uuid, jsonb) from public, anon;
grant execute on function public.add_cards(uuid, jsonb) to authenticated;
