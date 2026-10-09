-- Removes the demo classroom made by medical-terminology.sql, with its test, deck and anything hung off them.
delete from public.classrooms
where name = 'Medical Terminology'
  and owner_id = (select id from public.profiles where email = 'josephislockedin@gmail.com');
