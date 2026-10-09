-- Results said "No one has finished it yet" when the only attempts were practice runs of a timed test.
-- Every submitted attempt now counts. A timed score is preferred over practice when someone has both,
-- and practice_only marks rows whose best is from a practice run (answers were shown as they went).
drop function public.test_results(uuid);
create function public.test_results(tid uuid)
returns table (user_id uuid, full_name text, attempts bigint, best integer, total integer, last_at timestamptz, practice_only boolean)
language sql stable security definer set search_path = ''
as $$
  with ranked as (
    select a.user_id, a.score, a.total, a.mode, a.submitted_at,
      row_number() over (
        partition by a.user_id
        order by (a.mode = 'timed') desc, a.score::numeric / nullif(a.total, 0) desc nulls last, a.submitted_at desc
      ) as n,
      count(*) over (partition by a.user_id) as tries,
      max(a.submitted_at) over (partition by a.user_id) as last_at,
      bool_and(a.mode = 'practice') over (partition by a.user_id) as practice_only
    from public.attempts a
    where a.test_id = tid and a.submitted_at is not null and private.can_manage_test(tid)
  )
  select r.user_id, p.full_name, r.tries, r.score, r.total, r.last_at, r.practice_only
  from ranked r
  join public.profiles p on p.id = r.user_id
  where r.n = 1
  order by r.practice_only, r.score::numeric / nullif(r.total, 0) desc nulls last, p.full_name
$$;
revoke all on function public.test_results(uuid) from public, anon;
grant execute on function public.test_results(uuid) to authenticated;
