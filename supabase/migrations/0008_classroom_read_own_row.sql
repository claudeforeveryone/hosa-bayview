-- insert ... returning checks the read policy against the new row, but the helper looks the row up by id
-- and can't see it inside the same statement. Checking owner_id on the row itself fixes create-and-open.
drop policy "classrooms: read if viewer" on public.classrooms;
create policy "classrooms: read if viewer"
  on public.classrooms for select to authenticated
  using (owner_id = (select auth.uid()) or private.can_view_classroom(id));
