-- Paste import in one statement. import_questions (0013) calls save_question once per item, which re-checks
-- the trainer, re-reads max(position) and runs two inserts per question. This checks the trainer once, validates
-- every item in one pass (same rules as check_question, plus the 500-character option cap and the no-duplicate-
-- options rule the app enforces),
-- then inserts all questions and their keys together. All or nothing: one bad item rejects the batch and names it.
-- import_questions stays as the fallback the app uses until this is applied.
--
-- New positions are max(position) + 1, and questions has no unique (test_id, position), so two writers adding to
-- one test at once could take the same number. Both writers (this and save_question, which import_questions also
-- goes through) now take the same per-test transaction lock before reading max(position).

create or replace function private.lock_test_positions(tid uuid)
returns void language sql volatile set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('test_positions:' || tid::text, 0))
$$;
revoke all on function private.lock_test_positions(uuid) from public, anon, authenticated;

-- Live definition (0013) plus the lock for new questions; nothing else changes.
create or replace function public.save_question(tid uuid, qid uuid, prompt text, options text[], correct integer, explanation text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  saved uuid;
  clean text[] := (select array_agg(trim(o) order by n) from unnest(options) with ordinality as t(o, n));
begin
  if not private.can_manage_test(tid) then
    raise exception 'Only the trainer or an executive can edit this test' using errcode = '42501';
  end if;
  perform private.check_question(prompt, options, correct, explanation);
  if qid is null then
    perform private.lock_test_positions(tid);
    insert into public.questions (test_id, position, prompt, options)
    values (tid, coalesce((select max(q.position) + 1 from public.questions q where q.test_id = tid), 1), trim(prompt), clean)
    returning id into saved;
  else
    update public.questions q
      set prompt = trim(save_question.prompt), options = clean
      where q.id = qid and q.test_id = tid
      returning q.id into saved;
    if saved is null then
      raise exception 'That question is not in this test' using errcode = 'P0002';
    end if;
  end if;
  insert into public.question_keys (question_id, correct_index, explanation)
  values (saved, correct, coalesce(trim(save_question.explanation), ''))
  on conflict (question_id) do update set correct_index = excluded.correct_index, explanation = excluded.explanation;
  return saved;
end
$$;

create or replace function public.import_questions_bulk(tid uuid, items jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  bad record;
  base integer;
  n integer;
begin
  if not private.can_manage_test(tid) then
    raise exception 'Only the trainer or an executive can edit this test' using errcode = '42501';
  end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Nothing to import' using errcode = '22023';
  end if;
  if jsonb_array_length(items) > 500 then
    raise exception 'Import at most 500 questions at a time' using errcode = '22023';
  end if;

  -- First broken item, with the reason. CASE checks in order, so each test only runs once the ones before it
  -- passed (no array length on a non-array, no number cast on a string).
  select v.ord, v.reason into bad
  from (
    select e.ord, case
        when jsonb_typeof(e.item) is distinct from 'object' then 'is not a question'
        when jsonb_typeof(e.item -> 'prompt') is distinct from 'string' then 'has no question text'
        when char_length(trim(e.item ->> 'prompt')) = 0 then 'has no question text'
        when char_length(trim(e.item ->> 'prompt')) > 2000 then 'has question text over 2000 characters'
        when jsonb_typeof(e.item -> 'options') is distinct from 'array' then 'needs 2 to 5 options'
        when jsonb_array_length(e.item -> 'options') not between 2 and 5 then 'needs 2 to 5 options'
        when exists (select 1 from jsonb_array_elements(e.item -> 'options') o
                     where jsonb_typeof(o) is distinct from 'string') then 'has an option that is not text'
        when exists (select 1 from jsonb_array_elements_text(e.item -> 'options') o
                     where char_length(trim(o)) = 0) then 'has an empty option'
        when exists (select 1 from jsonb_array_elements_text(e.item -> 'options') o
                     where char_length(trim(o)) > 500) then 'has an option over 500 characters'
        when (select count(distinct lower(trim(o))) from jsonb_array_elements_text(e.item -> 'options') o)
             <> jsonb_array_length(e.item -> 'options') then 'has two options that are the same'
        when jsonb_typeof(e.item -> 'correct') is distinct from 'number' then 'needs the right option picked'
        when (e.item ->> 'correct') !~ '^\d+$' then 'needs the right option picked'
        when (e.item ->> 'correct')::numeric >= jsonb_array_length(e.item -> 'options') then 'needs the right option picked'
        when jsonb_typeof(e.item -> 'explanation') not in ('string', 'null') then 'has an explanation that is not text'
        when char_length(coalesce(e.item ->> 'explanation', '')) > 2000 then 'has an explanation over 2000 characters'
      end as reason
    from jsonb_array_elements(items) with ordinality as e(item, ord)
  ) v
  where v.reason is not null
  order by v.ord
  limit 1;
  if found then
    raise exception 'Question % %', bad.ord, bad.reason using errcode = '22023';
  end if;

  -- Same per-test lock as save_question, so no other writer takes these positions.
  perform private.lock_test_positions(tid);
  select coalesce(max(q.position), 0) into base from public.questions q where q.test_id = tid;

  with src as (
    select base + e.ord::integer as position,
           trim(e.item ->> 'prompt') as prompt,
           array(select trim(o) from jsonb_array_elements_text(e.item -> 'options') with ordinality as x(o, k) order by k) as options,
           (e.item ->> 'correct')::smallint as correct,
           trim(coalesce(e.item ->> 'explanation', '')) as explanation
    from jsonb_array_elements(items) with ordinality as e(item, ord)
  ), added as (
    insert into public.questions (test_id, position, prompt, options)
    select tid, s.position, s.prompt, s.options from src s order by s.position
    returning id, position
  ), keyed as (
    insert into public.question_keys (question_id, correct_index, explanation)
    select a.id, s.correct, s.explanation from added a join src s on s.position = a.position
    returning 1
  )
  select count(*) into n from keyed;
  return n;
end
$$;

revoke all on function public.import_questions_bulk(uuid, jsonb) from public, anon;
grant execute on function public.import_questions_bulk(uuid, jsonb) to authenticated;
