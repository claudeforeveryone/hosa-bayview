-- Let trainers set a classroom's category on create and in Settings. 0064 only granted select.
-- Column grants mirror name/event/description (0006); the classrooms RLS policies still decide who.
grant insert (category) on public.classrooms to authenticated;
grant update (category) on public.classrooms to authenticated;
