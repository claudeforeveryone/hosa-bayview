-- Decks made outside a classroom (the "New deck" button) can be moved into one later, then shared.
-- The deck's editor may set classroom_id to a room they can see, or clear it. Moving always unshares, so a deck
-- never lands shared in a room nobody chose to share it to.
grant update (classroom_id) on public.decks to authenticated;

alter policy "decks: editors update" on public.decks
  using (private.can_edit_deck(id))
  with check (
    private.can_edit_deck(id)
    and (classroom_id is null or private.can_view_classroom(classroom_id))
    and (classroom_id is not null or not is_shared)
    and (not is_shared or private.can_view_classroom(classroom_id))
  );
