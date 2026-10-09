-- Tests hardening after review:
-- * answer_question / attempt_sheet re-check that the test can still be taken (hidden test, removed member).
-- * answer_question returns the stored pick, so a stale second tab shows the truth.
-- * close_expired_attempts grades abandoned timed attempts so results and "Keep going" stay honest.
-- * Best scores count the test's real mode only: timed when it has a time limit, practice otherwise.

create or replace function public.close_expired_attempts(tid uuid)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  stale uuid;
  n integer := 0;
begin
  if not (private.can_take_test(tid) or private.can_manage_test(tid)) then
    return 0;
  end if;
  for stale in
    select a.id from public.attempts a
    where a.test_id = tid and a.mode = 'timed' and a.submitted_at is null
      and a.deadline < now() - interval '30 seconds'
  loop
    perform private.grade_attempt(stale);
    n := n + 1;
  end loop;
  return n;
end
$$;

drop function public.answer_question(uuid, uuid, integer);
create function public.answer_question(aid uuid, qid uuid, selected integer)
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

  select k.correct_index, k.explanation into key_index, key_note from public.question_keys k where k.question_id = qid;
  select aa.selected_index into existing from public.attempt_answers aa where aa.attempt_id = aid and aa.question_id = qid;
  if existing is null then
    insert into public.attempt_answers (attempt_id, question_id, selected_index, is_correct)
    values (aid, qid, selected, selected = key_index);
    existing := selected;
  end if;
  return query select existing, existing = key_index, key_index, key_note;
end
$$;

create or replace function public.attempt_sheet(aid uuid)
returns table (question_id uuid, pos integer, prompt text, options text[], selected_index smallint,
               is_correct boolean, correct_index smallint, explanation text)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.position, q.prompt, q.options, aa.selected_index,
    case when a.submitted_at is not null or a.mode = 'practice' then aa.is_correct end,
    case when a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null) then k.correct_index end,
    case when a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null) then k.explanation end
  from public.attempts a
  join public.questions q on q.test_id = a.test_id
  left join public.attempt_answers aa on aa.attempt_id = a.id and aa.question_id = q.id
  left join public.question_keys k on k.question_id = q.id
  where a.id = aid
    and ((a.user_id = (select auth.uid()) and private.can_take_test(a.test_id))
         or (a.submitted_at is not null and private.can_manage_test(a.test_id)))
  order by q.position, q.id
$$;

create or replace function public.classroom_tests(cid uuid)
returns table (id uuid, num integer, title text, description text, time_limit_minutes integer, is_published boolean,
               question_count bigint, my_attempts bigint, my_best integer, my_best_total integer, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.num, t.title, t.description, t.time_limit_minutes, t.is_published,
    (select count(*) from public.questions q where q.test_id = t.id),
    (select count(*) from public.attempts a
       where a.test_id = t.id and a.user_id = (select auth.uid()) and a.submitted_at is not null),
    b.score, b.total,
    t.created_at
  from public.tests t
  left join lateral (
    select a.score, a.total from public.attempts a
    where a.test_id = t.id and a.user_id = (select auth.uid()) and a.submitted_at is not null
      and a.mode = case when t.time_limit_minutes is null then 'practice' else 'timed' end
    order by a.score::numeric / nullif(a.total, 0) desc nulls last, a.submitted_at desc
    limit 1
  ) b on true
  where t.classroom_id = cid
    and (private.can_manage_classroom(cid) or (t.is_published and private.can_view_classroom(cid)))
  order by t.created_at desc
$$;

create or replace function public.test_results(tid uuid)
returns table (user_id uuid, full_name text, attempts bigint, best integer, total integer, last_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name,
    count(*),
    (array_agg(a.score order by a.score::numeric / nullif(a.total, 0) desc nulls last))[1],
    (array_agg(a.total order by a.score::numeric / nullif(a.total, 0) desc nulls last))[1],
    max(a.submitted_at)
  from public.attempts a
  join public.tests t on t.id = a.test_id
  join public.profiles p on p.id = a.user_id
  where a.test_id = tid and a.submitted_at is not null and private.can_manage_test(tid)
    and a.mode = case when t.time_limit_minutes is null then 'practice' else 'timed' end
  group by p.id, p.full_name
  order by max(a.score::numeric / nullif(a.total, 0)) desc nulls last, p.full_name
$$;

revoke all on function public.close_expired_attempts(uuid), public.answer_question(uuid, uuid, integer) from public, anon;
grant execute on function public.close_expired_attempts(uuid), public.answer_question(uuid, uuid, integer) to authenticated;
