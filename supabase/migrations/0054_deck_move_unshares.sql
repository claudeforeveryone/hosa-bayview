-- Moving a deck into a room always unshares it, so a deck never lands shared in a room nobody chose to share it to.
-- 0051 said so, but its policy only stops a shared deck from being cleared; a move from one room to another kept
-- is_shared, which exposed the deck to the new room's members. Runs before the row check, so the update then passes.
create or replace function private.deck_move_unshares()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.classroom_id is not null and new.classroom_id is distinct from old.classroom_id then
    new.is_shared := false;
  end if;
  return new;
end
$$;

create trigger decks_move_unshares before update of classroom_id on public.decks
  for each row execute function private.deck_move_unshares();
