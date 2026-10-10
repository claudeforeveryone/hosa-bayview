-- Task 12 follow-up: 0081 replaced member_stats and honor_roll after Task 10's 0075 had added a ban check on the
-- caller (a banned account gets 42501, like the other chapter-wide RPCs). This puts that check back on the new
-- Elo bodies. Later changes to these two functions must start from this file.
-- Check: supabase/tests/elo_audit.sql (case 14).

create or replace function public.member_stats(uid uuid)
returns table (user_id uuid, full_name text, role public.app_role, minutes bigint, reviews bigint, answered bigint,
               correct bigint, accuracy numeric, elo integer, streak integer, sign_in_streak integer, rank integer)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if (select auth.uid()) is null or private.is_banned() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  perform private.finalize_expired_attempts(null);
  return query
  with everyone as (
    select s.user_id, s.full_name, s.minutes, s.reviews, s.answered, s.correct, s.streak,
      (1200 + round(s.total))::integer as elo
    from private.standings('-infinity'::timestamptz, null) s
  ),
  ranked as (
    select e.*, rank() over (order by e.elo desc)::integer as place from everyone e
  )
  select r.user_id, r.full_name, p.role, r.minutes, r.reviews, r.answered, r.correct,
    case when r.answered > 0 then round(r.correct::numeric / r.answered, 4) end,
    r.elo, r.streak, private.sign_in_streak(r.user_id), r.place
  from ranked r
  join public.profiles p on p.id = r.user_id
  where r.user_id = uid;
end $$;

create or replace function public.honor_roll()
returns table (user_id uuid, full_name text, streak integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if (select auth.uid()) is null or private.is_banned() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  return query
  select x.id, x.full_name, x.streak
  from (
    select p.id, p.full_name, private.sign_in_streak(p.id) as streak
    from public.profiles p
    where p.banned_until is null or p.banned_until <= now()
  ) x
  where x.streak >= 3
  order by x.streak desc, x.full_name, x.id;
end $$;
