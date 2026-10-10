-- Task 10 (audit M1): with show_answers off, an attempt's score must not work as an answer-key oracle.
-- The probe was: start a practice run, answer one question, submit, read the score. Now the taker sees a
-- score only for a full run (every question answered) in the test's scored mode (timed when the test has a
-- time limit, practice when it doesn't). Practice on a timed test never shows its score. Managers always
-- see real scores. answer_question already returns no verdict when answers are hidden.

-- Whether the caller may see this attempt's score.
create or replace function private.score_visible(aid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select private.can_manage_test(a.test_id)
      or t.show_answers
      or (a.mode = case when t.time_limit_minutes is null then 'practice' else 'timed' end
          and (select count(*) from public.attempt_answers aa where aa.attempt_id = a.id) >= a.total)
    from public.attempts a
    join public.tests t on t.id = a.test_id
    where a.id = aid
  ), false)
$$;
revoke all on function private.score_visible(uuid) from public, anon, authenticated;

create or replace function public.submit_attempt(aid uuid)
returns table(score integer, total integer)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.attempts a where a.id = aid and a.user_id = (select auth.uid())) then
    raise exception 'That attempt isn''t yours' using errcode = '42501';
  end if;
  perform private.grade_attempt(aid);
  return query
    select case when private.score_visible(a.id) then a.score end, a.total
    from public.attempts a where a.id = aid;
end
$$;

-- Attempts with the score masked for the caller. Same rows the attempts RLS shows: your own, or any on a
-- test you manage. Null filters mean "any".
create or replace function public.attempt_list(p_test uuid default null, p_user uuid default null, p_attempt uuid default null)
returns table(id uuid, test_id uuid, user_id uuid, mode text, started_at timestamptz, deadline timestamptz,
              submitted_at timestamptz, score integer, total integer, score_hidden boolean)
language sql stable security definer set search_path = '' as $$
  select a.id, a.test_id, a.user_id, a.mode, a.started_at, a.deadline, a.submitted_at,
    case when v.shown then a.score end, a.total,
    a.submitted_at is not null and not v.shown
  from public.attempts a
  cross join lateral (select private.score_visible(a.id) as shown) v
  where (a.user_id = (select auth.uid()) or private.can_manage_test(a.test_id))
    and (p_test is null or a.test_id = p_test)
    and (p_user is null or a.user_id = p_user)
    and (p_attempt is null or a.id = p_attempt)
  order by a.started_at desc
$$;
revoke all on function public.attempt_list(uuid, uuid, uuid) from public, anon;
grant execute on function public.attempt_list(uuid, uuid, uuid) to authenticated;

-- The raw score column is no longer readable straight off the table; read it through attempt_list.
revoke select on public.attempts from authenticated;
grant select (id, test_id, user_id, mode, started_at, deadline, submitted_at, total) on public.attempts to authenticated;

create or replace function public.classroom_tests(cid uuid)
returns table(id uuid, num integer, title text, description text, time_limit_minutes integer, is_published boolean,
              question_count bigint, my_attempts bigint, my_best integer, my_best_total integer,
              created_at timestamptz)
language sql stable security definer set search_path = '' as $$
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
      and private.score_visible(a.id)
    order by a.score::numeric / nullif(a.total, 0) desc nulls last, a.submitted_at desc
    limit 1
  ) b on true
  where t.classroom_id = cid
    and (private.can_manage_classroom(cid)
         or (t.is_published and private.can_view_classroom(cid) and private.room_state(cid) <> 'upcoming'))
  order by t.created_at desc
$$;

create or replace function public.classroom_grades(cid uuid)
returns table(user_id uuid, full_name text, test_id uuid, test_num integer, test_title text, mode text,
              best_score integer, best_total integer, tries bigint)
language sql stable security definer set search_path = '' as $$
  with members as (
    select cm.user_id, p.full_name
    from public.classroom_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.classroom_id = classroom_grades.cid
      and private.can_view_classroom(classroom_grades.cid)
      and (private.can_manage_classroom(classroom_grades.cid) or cm.user_id = (select auth.uid()))
  ),
  pub as (
    select t.id, t.num, t.title from public.tests t
    where t.classroom_id = classroom_grades.cid and t.is_published
  ),
  graded as (
    select a.user_id, a.test_id, a.mode, a.total, a.submitted_at,
      case when private.score_visible(a.id) then a.score end as score
    from public.attempts a
    join pub on pub.id = a.test_id
    where a.submitted_at is not null and a.total > 0
      and a.user_id in (select m.user_id from members m)
  ),
  done as (
    select g.user_id, g.test_id, g.mode, g.score, g.total,
      row_number() over (
        partition by g.user_id, g.test_id
        order by (g.mode = 'timed') desc, g.score::numeric / g.total desc nulls last, g.submitted_at desc
      ) as n,
      count(*) over (partition by g.user_id, g.test_id) as tries
    from graded g
  )
  select m.user_id, m.full_name, pub.id, pub.num, pub.title,
    d.mode, d.score, d.total, coalesce(d.tries, 0)
  from members m
  cross join pub
  left join done d on d.user_id = m.user_id and d.test_id = pub.id and d.n = 1
  order by m.full_name, pub.num
$$;
