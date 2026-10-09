-- Review fixes for 0031 (0031 is already applied live, so this replaces bodies only).
-- Same signatures and return types as before; existing callers keep working.
-- * answer_question: no is_correct while answers are off (no verdict to learn the key from);
--   an open practice run can't be answered once the trainer turns practice off.
-- * attempt_sheet and attempt_questions: is_correct only when answers are shown (managers always).
-- * attempt_questions: rows come back in display order from the SQL itself.

create or replace function public.answer_question(aid uuid, qid uuid, selected integer)
returns table (selected_index smallint, is_correct boolean, correct_index smallint, explanation text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a_mode text;
  a_test uuid;
  a_deadline timestamptz;
  a_done timestamptz;
  key_index smallint;
  key_note text;
  existing smallint;
  show_ans boolean;
  allow_pr boolean;
begin
  select a.mode, a.test_id, a.deadline, a.submitted_at into a_mode, a_test, a_deadline, a_done
    from public.attempts a where a.id = aid and a.user_id = (select auth.uid());
  if a_test is null then
    raise exception 'That attempt isn''t yours' using errcode = '42501';
  end if;
  if not private.can_take_test(a_test) then
    raise exception 'This test isn''t open to you right now' using errcode = '42501';
  end if;
  if a_done is not null then
    raise exception 'This attempt is already submitted' using errcode = '22023';
  end if;
  if not exists (select 1 from public.questions q where q.id = qid and q.test_id = a_test) then
    raise exception 'That question isn''t in this test' using errcode = 'P0002';
  end if;
  if selected is null or selected < 0
     or selected >= (select cardinality(q.options) from public.questions q where q.id = qid) then
    raise exception 'Pick one of the options' using errcode = '22023';
  end if;

  select t.show_answers, t.allow_practice into show_ans, allow_pr from public.tests t where t.id = a_test;

  if a_mode = 'timed' then
    if now() > a_deadline + interval '30 seconds' then
      raise exception 'Time is up' using errcode = '22023';
    end if;
    insert into public.attempt_answers as aa (attempt_id, question_id, selected_index)
    values (aid, qid, selected)
    on conflict (attempt_id, question_id) do update set selected_index = excluded.selected_index, answered_at = now();
    return query select selected::smallint, null::boolean, null::smallint, null::text;
    return;
  end if;

  if not allow_pr then
    raise exception 'Practice is off for this test' using errcode = '22023';
  end if;

  select k.correct_index, k.explanation into key_index, key_note from public.question_keys k where k.question_id = qid;
  select aa.selected_index into existing from public.attempt_answers aa where aa.attempt_id = aid and aa.question_id = qid;
  if existing is null then
    insert into public.attempt_answers (attempt_id, question_id, selected_index, is_correct)
    values (aid, qid, selected, selected = key_index);
    existing := selected;
  end if;
  -- Right or not, and which option was right, only when answers are shown.
  return query select existing,
    case when show_ans then existing = key_index end,
    case when show_ans then key_index end,
    case when show_ans then key_note end;
end
$$;

create or replace function public.attempt_sheet(aid uuid)
returns table (question_id uuid, pos integer, prompt text, options text[], selected_index smallint,
               is_correct boolean, correct_index smallint, explanation text)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.position, q.prompt, q.options, aa.selected_index,
    case when (t.show_answers or private.can_manage_test(a.test_id))
          and (a.submitted_at is not null or a.mode = 'practice') then aa.is_correct end,
    case when (t.show_answers or private.can_manage_test(a.test_id))
          and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.correct_index end,
    case when (t.show_answers or private.can_manage_test(a.test_id))
          and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.explanation end
  from public.attempts a
  join public.tests t on t.id = a.test_id
  join public.questions q on q.test_id = a.test_id
  left join public.attempt_answers aa on aa.attempt_id = a.id and aa.question_id = q.id
  left join public.question_keys k on k.question_id = q.id
  where a.id = aid
    and ((a.user_id = (select auth.uid()) and private.can_take_test(a.test_id))
         or (a.submitted_at is not null and private.can_manage_test(a.test_id)))
  order by q.position, q.id
$$;

create or replace function public.attempt_questions(aid uuid)
returns table (question_id uuid, pos integer, prompt text, options text[], choice_order smallint[],
               selected_index smallint, is_correct boolean, correct_index smallint, explanation text)
language sql stable security definer set search_path = ''
as $$
  select q.id, row_number() over (order by case when t.shuffle_questions then md5(a.id::text || q.id::text) end, q.position, q.id)::integer,
    q.prompt, q.options,
    case when t.shuffle_choices then
      array(select g.i::smallint from generate_series(0, cardinality(q.options) - 1) as g(i)
            order by md5(a.id::text || q.id::text || g.i::text))
    else
      array(select g.i::smallint from generate_series(0, cardinality(q.options) - 1) as g(i) order by g.i)
    end,
    aa.selected_index,
    case when (t.show_answers or private.can_manage_test(a.test_id))
          and (a.submitted_at is not null or a.mode = 'practice') then aa.is_correct end,
    case when (t.show_answers or private.can_manage_test(a.test_id))
          and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.correct_index end,
    case when (t.show_answers or private.can_manage_test(a.test_id))
          and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.explanation end
  from public.attempts a
  join public.tests t on t.id = a.test_id
  join public.questions q on q.test_id = a.test_id
  left join public.attempt_answers aa on aa.attempt_id = a.id and aa.question_id = q.id
  left join public.question_keys k on k.question_id = q.id
  where a.id = attempt_questions.aid
    and ((a.user_id = (select auth.uid()) and private.can_take_test(a.test_id))
         or (a.submitted_at is not null and private.can_manage_test(a.test_id)))
  order by case when t.shuffle_questions then md5(a.id::text || q.id::text) end, q.position, q.id
$$;

revoke all on function
  public.answer_question(uuid, uuid, integer), public.attempt_sheet(uuid), public.attempt_questions(uuid)
  from public, anon;
grant execute on function
  public.answer_question(uuid, uuid, integer), public.attempt_sheet(uuid), public.attempt_questions(uuid)
  to authenticated;
