-- Demo classroom for showing the site: Medical Terminology, one practice test and one shared deck.
-- Owned by the first executive. Content only: no members, attempts or scores are invented.
-- Safe to re-run: it does nothing if the classroom already exists. Remove with supabase/showcase/medical-terminology-remove.sql.
do $$
declare
  owner uuid := (select id from public.profiles where email = 'josephislockedin@gmail.com');
  room uuid;
  test uuid;
  deck uuid;
  q uuid;
  item jsonb;
  i int := 0;
begin
  if owner is null then
    raise exception 'First executive not found';
  end if;
  if exists (select 1 from public.classrooms where owner_id = owner and name = 'Medical Terminology') then
    raise notice 'Demo classroom already exists';
    return;
  end if;

  insert into public.classrooms (name, event, description, owner_id)
  values ('Medical Terminology', 'Medical Terminology', '', owner)
  returning id into room;

  insert into public.tests (classroom_id, title, description, time_limit_minutes, is_published, created_by,
                            shuffle_questions, shuffle_choices, allow_practice, show_answers)
  values (room, 'Prefixes, suffixes and roots', '', 15, true, owner, true, true, true, true)
  returning id into test;

  for item in select * from jsonb_array_elements($json$[
    ["The prefix brady- means:", ["Fast", "Slow", "Painful", "Difficult"], 1, "Bradycardia is a slow heart rate."],
    ["The suffix -itis means:", ["Inflammation", "Surgical removal", "Study of", "Enlargement"], 0, "Appendicitis is inflammation of the appendix."],
    ["Hepat/o refers to the:", ["Kidney", "Stomach", "Liver", "Heart"], 2, "Hepatitis is inflammation of the liver."],
    ["The suffix -ectomy means:", ["Surgical repair", "Surgical removal", "Incision into", "Visual examination"], 1, "An appendectomy removes the appendix."],
    ["Tachypnea means:", ["Slow breathing", "No breathing", "Rapid breathing", "Painful breathing"], 2, "Tachy- is fast and -pnea is breathing."],
    ["The prefix hyper- means:", ["Below normal", "Above normal or excessive", "Within", "Around"], 1, "Hypertension is blood pressure above normal."],
    ["Nephr/o refers to the:", ["Lung", "Kidney", "Nerve", "Bone"], 1, "Nephrology is the study of the kidneys."],
    ["The suffix -algia means:", ["Pain", "Tumour", "Blood condition", "Softening"], 0, "Arthralgia is joint pain."],
    ["In osteoporosis, oste/o refers to:", ["Muscle", "Joint", "Bone", "Cartilage"], 2, "Osteoporosis is porous, weakened bone."],
    ["Which term means inflammation of the stomach?", ["Gastritis", "Colitis", "Hepatitis", "Arthritis"], 0, "Gastr/o is stomach and -itis is inflammation."],
    ["The prefix dys- means:", ["Without", "Bad, difficult or painful", "Two", "Half"], 1, "Dysphagia is difficulty swallowing."],
    ["The suffix -scopy means:", ["Cutting", "Visual examination", "Recording", "Measuring"], 1, "An endoscopy looks inside the body with a scope."],
    ["Cardiomegaly means:", ["Inflamed heart", "Enlarged heart", "Heart muscle disease", "Slow heart rate"], 1, "Cardi/o is heart and -megaly is enlargement."],
    ["Erythr/o means:", ["White", "Black", "Red", "Yellow"], 2, "Erythrocytes are red blood cells."],
    ["The suffix -tomy means:", ["Incision into", "Creating a new opening", "Removal", "Repair"], 0, "A tracheotomy is an incision into the trachea; -stomy is a new opening."]
  ]$json$::jsonb)
  loop
    i := i + 1;
    insert into public.questions (test_id, position, prompt, options)
    values (test, i, item->>0, array(select jsonb_array_elements_text(item->1)))
    returning id into q;
    insert into public.question_keys (question_id, correct_index, explanation)
    values (q, (item->>2)::smallint, item->>3);
  end loop;

  insert into public.decks (owner_id, classroom_id, title, description, is_shared)
  values (owner, room, 'Prefixes, suffixes and roots', '', true)
  returning id into deck;

  i := 0;
  for item in select * from jsonb_array_elements($json$[
    ["brady-", "Slow"], ["tachy-", "Fast"], ["hyper-", "Above normal, excessive"], ["hypo-", "Below normal, deficient"],
    ["dys-", "Bad, difficult or painful"], ["a-, an-", "Without, absence of"], ["-itis", "Inflammation"],
    ["-ectomy", "Surgical removal"], ["-tomy", "Incision into"], ["-stomy", "Surgical creation of an opening"],
    ["-algia", "Pain"], ["-megaly", "Enlargement"], ["-scopy", "Visual examination"], ["-plasty", "Surgical repair"],
    ["cardi/o", "Heart"], ["hepat/o", "Liver"], ["nephr/o", "Kidney"], ["oste/o", "Bone"], ["gastr/o", "Stomach"],
    ["erythr/o", "Red"], ["leuk/o", "White"], ["pneum/o", "Lung, air"], ["neur/o", "Nerve"], ["derm/o", "Skin"]
  ]$json$::jsonb)
  loop
    i := i + 1;
    insert into public.cards (deck_id, position, term, definition) values (deck, i, item->>0, item->>1);
  end loop;
end
$$;
