-- Removes the demo classroom made by medical-terminology.sql, with its test, deck and anything hung off them.
-- Only touches a Medical Terminology class that has no members, so a real class of the same name is safe.
-- If members joined the demo, remove them from the class first.
delete from public.classrooms c
where c.name = 'Medical Terminology'
  and c.owner_id = (select id from public.profiles where email = 'josephislockedin@gmail.com')
  and not exists (select 1 from public.classroom_members m where m.classroom_id = c.id);
