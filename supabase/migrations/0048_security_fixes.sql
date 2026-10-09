-- Security fixes from the October review.
-- 1. career() no longer reveals answer keys: a member sees the right answer and explanation only where the test
--    shows answers and the attempt is submitted (or it's a practice answer they already got feedback on).
--    Trainers of the room and executives still see everything.
-- 2. Practice can't preview a capped timed test: practice opens only after the timed attempts are used up.

-- 1 ---------------------------------------------------------------------------------------------------------
create or replace function public.career(uid uuid, cid uuid)
returns table (answered_at timestamptz, test_title text, prompt text, options text[], selected_index smallint,
               correct_index smallint, is_correct boolean, explanation text)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  return query
  with rows as (
    select aa.answered_at, t.title, q.prompt, q.options, aa.selected_index, k.correct_index, aa.is_correct,
      k.explanation,
      (private.is_executive() or private.can_manage_classroom(t.classroom_id)
        or (t.show_answers and (a.submitted_at is not null or a.mode = 'practice'))) as reveal
    from public.attempt_answers aa
    join public.attempts a on a.id = aa.attempt_id
    join public.tests t on t.id = a.test_id
    join public.questions q on q.id = aa.question_id
    join public.question_keys k on k.question_id = q.id
    where a.user_id = uid
      and (a.submitted_at is not null or a.mode = 'practice')
      and aa.is_correct is not null
      and (cid is null or t.classroom_id = cid)
      and (uid = (select auth.uid())
           or private.is_executive()
           or private.can_manage_classroom(t.classroom_id))
  )
  select r.answered_at, r.title, r.prompt, r.options, r.selected_index,
    case when r.reveal then r.correct_index end,
    case when r.reveal then r.is_correct end,
    case when r.reveal then r.explanation end
  from rows r
  order by r.answered_at desc
  limit 500;
end
$$;

-- 2 ---------------------------------------------------------------------------------------------------------
-- True while a capped timed test still has timed attempts left for this member.
create or replace function private.practice_locked(tid uuid, uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select t.time_limit_minutes is not null and t.attempts_allowed is not null
      and (select count(*) from public.attempts a
           where a.test_id = tid and a.user_id = uid and a.mode = 'timed') < t.attempts_allowed
    from public.tests t where t.id = tid
  ), false)
$$;
revoke all on function private.practice_locked(uuid, uuid) from public, anon, authenticated;

create or replace function public.start_attempt(tid uuid, mode text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  lim integer;
  cap integer;
  allow_pr boolean;
  qcount integer;
  scored text;
  used bigint;
  open_id uuid;
  stale uuid;
  aid uuid;
begin
  if start_attempt.mode is null or start_attempt.mode not in ('timed', 'practice') then
    raise exception 'Unknown mode' using errcode = '22023';
  end if;
  if not private.can_take_test(tid) then
    raise exception 'You can''t take this test' using errcode = '42501';
  end if;
  select t.time_limit_minutes, t.attempts_allowed, t.allow_practice
    into lim, cap, allow_pr
    from public.tests t where t.id = tid;
  select count(*) into qcount from public.questions q where q.test_id = tid;
  if qcount = 0 then
    raise exception 'This test has no questions yet' using errcode = '22023';
  end if;
  if start_attempt.mode = 'timed' and lim is null then
    raise exception 'This test has no time limit; use practice' using errcode = '22023';
  end if;
  if start_attempt.mode = 'practice' and not allow_pr then
    raise exception 'Practice is off for this test' using errcode = '22023';
  end if;
  if start_attempt.mode = 'practice' and private.practice_locked(tid, uid) then
    raise exception 'Practice opens once you''ve used your timed attempts' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('hosa.attempt:' || uid::text || tid::text));

  for stale in
    select a.id from public.attempts a
    where a.user_id = uid and a.test_id = tid and a.submitted_at is null
      and a.deadline < now() - interval '30 seconds'
  loop
    perform private.grade_attempt(stale);
  end loop;

  select a.id into open_id from public.attempts a
    where a.user_id = uid and a.test_id = tid and a.mode = start_attempt.mode and a.submitted_at is null
    order by a.started_at desc limit 1;
  if open_id is not null then
    return open_id;
  end if;

  scored := case when lim is null then 'practice' else 'timed' end;
  if start_attempt.mode = scored and cap is not null then
    select count(*) into used from public.attempts a
      where a.user_id = uid and a.test_id = tid and a.mode = scored;
    if used >= cap then
      raise exception 'You''ve used all your attempts on this test' using errcode = '22023';
    end if;
  end if;

  insert into public.attempts (test_id, user_id, mode, deadline, total)
  values (tid, uid, start_attempt.mode,
          case when start_attempt.mode = 'timed' then now() + make_interval(mins => lim) end,
          qcount)
  returning id into aid;
  return aid;
end
$$;

create or replace function public.answer_question(aid uuid, qid uuid, selected integer)
returns table (selected_index smallint, is_correct boolean, correct_index smallint, explanation text)
language plpgsql security definer set search_path = ''
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
  -- Covers practice runs opened before the cap rule existed.
  if private.practice_locked(a_test, (select auth.uid())) then
    raise exception 'Practice opens once you''ve used your timed attempts' using errcode = '22023';
  end if;

  select k.correct_index, k.explanation into key_index, key_note from public.question_keys k where k.question_id = qid;
  select aa.selected_index into existing from public.attempt_answers aa where aa.attempt_id = aid and aa.question_id = qid;
  if existing is null then
    insert into public.attempt_answers (attempt_id, question_id, selected_index, is_correct)
    values (aid, qid, selected, selected = key_index);
    existing := selected;
  end if;
  return query select existing,
    case when show_ans then existing = key_index end,
    case when show_ans then key_index end,
    case when show_ans then key_note end;
end
$$;

-- attempt_sheet shows an in-progress practice run's key; a locked practice run must not.
create or replace function public.attempt_sheet(aid uuid)
returns table (question_id uuid, pos integer, prompt text, options text[], selected_index smallint,
               is_correct boolean, correct_index smallint, explanation text)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.position, q.prompt, q.options, aa.selected_index,
    case when v.ok and (a.submitted_at is not null or a.mode = 'practice') then aa.is_correct end,
    case when v.ok and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.correct_index end,
    case when v.ok and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.explanation end
  from public.attempts a
  join public.tests t on t.id = a.test_id
  cross join lateral (
    select (private.can_manage_test(a.test_id)
            or (t.show_answers and not (a.mode = 'practice' and private.practice_locked(a.test_id, a.user_id))))
      as ok
  ) v
  join public.questions q on q.test_id = a.test_id
  left join public.attempt_answers aa on aa.attempt_id = a.id and aa.question_id = q.id
  left join public.question_keys k on k.question_id = q.id
  where a.id = aid
    and ((a.user_id = (select auth.uid()) and private.can_take_test(a.test_id))
         or (a.submitted_at is not null and private.can_manage_test(a.test_id)))
  order by q.position, q.id
$$;
