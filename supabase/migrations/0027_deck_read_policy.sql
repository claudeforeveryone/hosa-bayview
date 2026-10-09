-- Creating a deck failed for everyone: insert ... returning runs the SELECT policy, and
-- private.can_view_deck(id) looks the deck up by id, which can't see the row being inserted.
-- Check the row's own columns instead (same rule as can_view_deck).
drop policy "decks: read if can view" on public.decks;
create policy "decks: read if can view" on public.decks for select to authenticated using (
  owner_id = (select auth.uid())
  or (select private.is_executive())
  or (classroom_id is not null and is_shared and private.can_view_classroom(classroom_id))
);
