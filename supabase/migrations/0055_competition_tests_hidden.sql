-- An upcoming mock competition is listed but its tests are hidden (0053). The tests row (title, description, time
-- limit) still reached every signed-in user through the room-view rule, so hide the row too until the room opens.
-- Managers still see their own tests, and questions were already gated by can_take_test.
alter policy "tests: read if can take" on public.tests
  using (
    private.can_manage_classroom(classroom_id)
    or (is_published and private.can_view_classroom(classroom_id) and private.room_state(classroom_id) <> 'upcoming')
  );
