-- Phase 4: flashcards. A deck belongs to its owner. A deck with a classroom and is_shared is visible
-- to everyone who can view that classroom; managers of the classroom can run (edit, delete, see) any
-- deck in it. Cards are written through RPCs or RLS; reviews are private to the reviewer.

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  num integer generated always as identity unique,
  owner_id uuid references public.profiles (id) on delete set null default auth.uid(),
  classroom_id uuid references public.classrooms (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  check (not is_shared or classroom_id is not null)
);
create index decks_classroom_idx on public.decks (classroom_id);
create index decks_owner_idx on public.decks (owner_id);
alter table public.decks enable row level security;

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete cascade,
  position integer not null,
  term text not null check (char_length(term) between 1 and 500),
  definition text not null check (char_length(definition) between 1 and 2000),
  created_at timestamptz not null default now()
);
create unique index cards_deck_position_idx on public.cards (deck_id, position);
alter table public.cards enable row level security;

create table public.card_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  known boolean not null,
  reviewed_at timestamptz not null default now()
);
create index card_reviews_user_idx on public.card_reviews (user_id, reviewed_at);
create index card_reviews_card_idx on public.card_reviews (card_id);
alter table public.card_reviews enable row level security;

-- Helpers ---------------------------------------------------------------

create function private.can_view_deck(did uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.decks d
    where d.id = did and (
      d.owner_id = (select auth.uid())
      or private.is_executive()
      or (d.classroom_id is not null and private.can_manage_classroom(d.classroom_id))
      or (d.classroom_id is not null and d.is_shared and private.can_view_classroom(d.classroom_id))
    )
  )
$$;

create function private.can_edit_deck(did uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.decks d
    where d.id = did and (
      d.owner_id = (select auth.uid())
      or private.is_executive()
      or (d.classroom_id is not null and private.can_manage_classroom(d.classroom_id))
    )
  )
$$;

create function private.card_deck(cid uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select deck_id from public.cards where id = cid
$$;

revoke all on function private.can_view_deck(uuid), private.can_edit_deck(uuid), private.card_deck(uuid) from public, anon;
grant execute on function private.can_view_deck(uuid), private.can_edit_deck(uuid), private.card_deck(uuid) to authenticated;

-- Privileges and policies ---------------------------------------------------

revoke all on public.decks, public.cards, public.card_reviews from anon;
revoke insert, update, delete on public.decks, public.cards, public.card_reviews from authenticated;
-- Owner and class ids never come from the client; the trigger-free default covers owner_id.
grant insert (classroom_id, title, description, is_shared) on public.decks to authenticated;
grant update (title, description, is_shared) on public.decks to authenticated;
grant delete on public.decks to authenticated;
grant update (position, term, definition) on public.cards to authenticated;
grant delete on public.cards to authenticated;
grant insert (card_id, known) on public.card_reviews to authenticated;
grant select on public.decks, public.cards, public.card_reviews to authenticated;

create policy "decks: read if can view"
  on public.decks for select to authenticated
  using (private.can_view_deck(id));

create policy "decks: create your own"
  on public.decks for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (classroom_id is null or private.can_view_classroom(classroom_id))
  );

create policy "decks: editors update"
  on public.decks for update to authenticated
  using (private.can_edit_deck(id))
  with check (private.can_edit_deck(id) and (classroom_id is not null or not is_shared));

create policy "decks: editors delete"
  on public.decks for delete to authenticated
  using (private.can_edit_deck(id));

create policy "cards: read if deck visible"
  on public.cards for select to authenticated
  using (private.can_view_deck(deck_id));

create policy "cards: editors update"
  on public.cards for update to authenticated
  using (private.can_edit_deck(deck_id))
  with check (private.can_edit_deck(deck_id));

create policy "cards: editors delete"
  on public.cards for delete to authenticated
  using (private.can_edit_deck(deck_id));

-- Reviews are private: you read and write your own; executives can read all.
create policy "reviews: own or executive read"
  on public.card_reviews for select to authenticated
  using (user_id = (select auth.uid()) or private.is_executive());

create policy "reviews: own insert on visible cards"
  on public.card_reviews for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_view_deck(private.card_deck(card_id))
  );

-- RPCs ------------------------------------------------------------------

-- Visible decks with card counts, optionally for one classroom. Newest first.
create function public.deck_list(cid uuid default null)
returns table (
  id uuid,
  num integer,
  owner_id uuid,
  owner_name text,
  classroom_id uuid,
  classroom_name text,
  title text,
  description text,
  is_shared boolean,
  card_count bigint,
  created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select d.id, d.num, d.owner_id, coalesce(p.full_name, 'Former member'), d.classroom_id, c.name,
    d.title, d.description, d.is_shared,
    (select count(*) from public.cards k where k.deck_id = d.id),
    d.created_at
  from public.decks d
  left join public.profiles p on p.id = d.owner_id
  left join public.classrooms c on c.id = d.classroom_id
  where private.can_view_deck(d.id)
    and (deck_list.cid is null or d.classroom_id = deck_list.cid)
  order by d.created_at desc
$$;

-- Appends cards in order. items: [{term, definition}], all or nothing.
create function public.add_cards(did uuid, items jsonb)
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

revoke all on function public.deck_list(uuid), public.add_cards(uuid, jsonb) from public, anon;
grant execute on function public.deck_list(uuid), public.add_cards(uuid, jsonb) to authenticated;
