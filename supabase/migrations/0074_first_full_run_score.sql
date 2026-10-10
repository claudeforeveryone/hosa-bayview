-- Task 10 review fix (M1): with show_answers off, a taker sees a score only for their first run on the test
-- with every question answered, in either mode. 0067 still showed every full run in the scored mode, so a
-- script could change one answer per run and diff the scores to rebuild the key. Later runs now come back
-- "Submitted" with no score. Managers and tests with answers on are unchanged.

create or replace function private.score_visible(aid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select private.can_manage_test(a.test_id)
      or t.show_answers
      or (a.submitted_at is not null
          and (select count(*) from public.attempt_answers aa where aa.attempt_id = a.id) >= a.total
          and not exists (
            select 1 from public.attempts b
            where b.user_id = a.user_id and b.test_id = a.test_id and b.submitted_at is not null
              and (b.submitted_at, b.id) < (a.submitted_at, a.id)
              and (select count(*) from public.attempt_answers bb where bb.attempt_id = b.id) >= b.total))
    from public.attempts a
    join public.tests t on t.id = a.test_id
    where a.id = aid
  ), false)
$$;
revoke all on function private.score_visible(uuid) from public, anon, authenticated;

-- my_best: with answers hidden the one visible score can come from either mode, so don't filter by mode then.
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
      and (not t.show_answers or a.mode = case when t.time_limit_minutes is null then 'practice' else 'timed' end)
      and private.score_visible(a.id)
    order by a.score::numeric / nullif(a.total, 0) desc nulls last, a.submitted_at desc
    limit 1
  ) b on true
  where t.classroom_id = cid
    and (private.can_manage_classroom(cid)
         or (t.is_published and private.can_view_classroom(cid) and private.room_state(cid) <> 'upcoming'))
  order by t.created_at desc
$$;
