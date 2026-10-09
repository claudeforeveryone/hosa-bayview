-- Same rule as 0055 for the two functions that list tests by room: a member sees nothing of an upcoming
-- competition's tests (not their titles in classroom_tests, not how many in competitions()).

create or replace function public.classroom_tests(cid uuid)
returns table (id uuid, num integer, title text, description text, time_limit_minutes integer, is_published boolean,
               question_count bigint, my_attempts bigint, my_best integer, my_best_total integer,
               created_at timestamptz)
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
    and (private.can_manage_classroom(cid)
         or (t.is_published and private.can_view_classroom(cid) and private.room_state(cid) <> 'upcoming'))
  order by t.created_at desc
$$;

create or replace function public.competitions()
returns table (id uuid, name text, event text, description text, opens_at timestamptz, closes_at timestamptz,
               state text, test_count bigint, my_done bigint, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, c.event, c.description, c.opens_at, c.closes_at, private.room_state(c.id),
    (select count(*) from public.tests t
       where t.classroom_id = c.id
         and (private.can_manage_classroom(c.id) or (t.is_published and private.room_state(c.id) <> 'upcoming'))),
    (select count(distinct a.test_id) from public.attempts a join public.tests t on t.id = a.test_id
       where t.classroom_id = c.id and a.user_id = (select auth.uid()) and a.mode = 'timed'
         and a.submitted_at is not null),
    c.created_at
  from public.classrooms c
  where c.kind = 'competition' and (select auth.uid()) is not null
  order by coalesce(c.opens_at, c.created_at) desc
$$;
