-- Task 10 review fix (L1): banned accounts see nothing chapter-wide. These directory RPCs only checked for a
-- session, so a banned user with a live token still read every member's name, role, grade and avatar path.
-- Same helper as 0066 (private.is_banned). members_online and leaderboard already go through can_read_board,
-- which checks the ban. Bodies are otherwise unchanged; create or replace keeps the existing grants.

create or replace function public.member_directory()
returns table(user_id uuid, full_name text, role public.app_role)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.role
  from public.profiles p
  where (select auth.uid()) is not null and not private.is_banned()
  order by p.full_name, p.id
$$;

create or replace function public.member_details()
returns table(user_id uuid, avatar_path text, grade smallint, title text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.avatar_path, p.grade, p.title
  from public.profiles p
  where (select auth.uid()) is not null and not private.is_banned()
$$;

create or replace function public.competitions()
returns table(id uuid, name text, event text, description text, opens_at timestamptz, closes_at timestamptz,
              state text, test_count bigint, my_done bigint, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.event, c.description, c.opens_at, c.closes_at, private.room_state(c.id),
    (select count(*) from public.tests t
       where t.classroom_id = c.id
         and (private.can_manage_classroom(c.id) or (t.is_published and private.room_state(c.id) <> 'upcoming'))),
    (select count(distinct a.test_id) from public.attempts a join public.tests t on t.id = a.test_id
       where t.classroom_id = c.id and a.user_id = (select auth.uid()) and a.mode = 'timed'
         and a.submitted_at is not null),
    c.created_at
  from public.classrooms c
  where c.kind = 'competition' and (select auth.uid()) is not null and not private.is_banned()
  order by coalesce(c.opens_at, c.created_at) desc
$$;

create or replace function public.honor_roll()
returns table(user_id uuid, full_name text, streak integer)
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
  ) x
  where x.streak >= 3
  order by x.streak desc, x.full_name, x.id;
end
$$;

create or replace function public.member_stats(uid uuid)
returns table(user_id uuid, full_name text, role public.app_role, minutes bigint, reviews bigint, answered bigint,
              correct bigint, accuracy numeric, elo integer, streak integer, sign_in_streak integer, rank integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if (select auth.uid()) is null or private.is_banned() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  return query
  with everyone as (
    select b.user_id, b.full_name, b.minutes, b.reviews, b.answered, b.correct, b.streak,
      private.elo_score(b.reviews, b.answered, b.correct, b.streak, b.signins, b.bonus) as elo
    from private.board('-infinity'::timestamptz, null) b
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
end
$$;
