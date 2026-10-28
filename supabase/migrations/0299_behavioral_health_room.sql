-- 0299: an event room for Behavioral Health, a written multiple choice event. Set up like the other official event
-- rooms: a class, category 'mc', owned by the executive who owns Epidemiology, with class code BH. No leads, so the
-- owner runs it until an executive sets them. Content (tests, decks, files) is added in the app.
-- Safe to re-run: it does nothing if a Behavioral Health class already exists, and skips the code if it is taken.
do $$
declare
  owner uuid := (select owner_id from public.classrooms
                 where kind = 'class' and name = 'Epidemiology' and category is not null
                 order by created_at limit 1);
begin
  if owner is null then
    raise exception 'Owner of the official event rooms not found';
  end if;
  if exists (select 1 from public.classrooms where kind = 'class' and name = 'Behavioral Health') then
    raise notice 'Behavioral Health room already exists';
    return;
  end if;

  insert into public.classrooms (name, event, description, owner_id, category, short_code)
  values ('Behavioral Health', 'Behavioral Health', '', owner, 'mc',
          case when exists (select 1 from public.classrooms where short_code = 'BH') then null else 'BH' end);
end
$$;
