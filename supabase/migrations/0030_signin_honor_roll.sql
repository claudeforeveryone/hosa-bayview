-- Sign-in days, Elo from showing up, honor roll, and Elo gained per period.
-- A sign-in day is a Toronto calendar day on which a signed-in user's app loaded (heartbeat() records it).
-- Each sign-in day adds 5 Elo on top of study gains; it is not multiplied by the study streak.
-- Leaderboards get a `gain` column: the Elo earned inside the period (total minus the base, so the base is never counted).

-- One row per user per Toronto day. Written only by heartbeat(); clients never touch the table.
create table public.sign_in_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
alter table public.sign_in_days enable row level security;
revoke all on public.sign_in_days from public, anon, authenticated;

-- The RPCs that return these change shape, so drop them first (private.board and elo_score change too).
drop function public.leaderboard(text, uuid);
drop function public.member_stats(uuid);
drop function private.board(timestamptz, uuid);
drop function private.elo_score(bigint, bigint, bigint, bigint, integer);

-- Helpers ---------------------------------------------------------------

-- 'today' added: from Toronto midnight.
create or replace function private.period_start(period text)
returns timestamptz
language plpgsql stable set search_path = ''
as $$
declare
  local_now timestamp := now() at time zone 'America/Toronto';
begin
  case period
    when 'today' then return date_trunc('day', local_now) at time zone 'America/Toronto';
    when 'week' then return date_trunc('week', local_now) at time zone 'America/Toronto';
    when 'month' then return date_trunc('month', local_now) at time zone 'America/Toronto';
    when 'all' then return '-infinity'::timestamptz;
    else raise exception 'Period must be today, week, month or all' using errcode = '22023';
  end case;
end
$$;

-- Current run of sign-in days in Toronto days, counted back from today or yesterday (same rule as the study streak).
create function private.sign_in_streak(uid uuid)
returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  today date := private.local_day(now());
  result integer;
begin
  with islands as (
    select count(*) as len, max(d.day) as last_day
    from (
      select s.day, s.day - (row_number() over (order by s.day))::integer as grp
      from public.sign_in_days s
      where s.user_id = uid
    ) d
    group by d.grp
  )
  select i.len into result
  from islands i
  where i.last_day in (today, today - 1)
  order by i.last_day desc
  limit 1;
  return coalesce(result, 0);
end
$$;

-- Elo earned from activity and sign-ins. Activity gains are multiplied by the study streak
-- (up to x1.6 at 30 days); sign-ins are a flat 5 each and are added after the multiplier.
--   0.5 per minute studied
--   + 1 per flashcard reviewed
--   + 2 per question answered
--   + 3 per question right (a right answer is worth 5, a wrong one 2, so accuracy counts)
--   + 5 per sign-in day
create function private.elo_gain(minutes bigint, reviews bigint, answered bigint, correct bigint, streak integer, signins bigint)
returns integer
language sql immutable set search_path = ''
as $$
  select round(
      (minutes * 0.5 + reviews * 1 + answered * 2 + correct * 3)
      * (1 + least(greatest(streak, 0), 30) * 0.02)
    )::integer + (5 * signins)::integer
$$;

-- ELO: everyone starts at 1200. Tune the numbers in private.elo_gain and nowhere else.
create function private.elo_score(minutes bigint, reviews bigint, answered bigint, correct bigint, streak integer, signins bigint)
returns integer
language sql immutable set search_path = ''
as $$
  select 1200 + private.elo_gain(minutes, reviews, answered, correct, streak, signins)
$$;

-- Per-member totals since a point in time, plus sign-in days since that point (all of them when since is -infinity).
-- Questions count once per Toronto day (the first graded answer that day decides right or wrong); reviews count once per card per day.
create function private.board(since timestamptz, cid uuid)
returns table (user_id uuid, full_name text, minutes bigint, reviews bigint, answered bigint, correct bigint, streak integer, signins bigint)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with members as (
    select p.id, p.full_name
    from public.profiles p
    where cid is null
       or exists (select 1 from public.classroom_members cm where cm.classroom_id = cid and cm.user_id = p.id)
  ),
  mins as (
    select m.user_id as uid, count(*) as n
    from public.activity_minutes m
    where m.minute >= since and (cid is null or m.classroom_id = cid)
    group by m.user_id
  ),
  first_answers as (
    select distinct on (a.user_id, aa.question_id, private.local_day(aa.answered_at))
      a.user_id as uid, aa.is_correct as is_right
    from public.attempt_answers aa
    join public.attempts a on a.id = aa.attempt_id
    join public.tests t on t.id = a.test_id
    where aa.is_correct is not null and aa.answered_at >= since
      and (cid is null or t.classroom_id = cid)
    order by a.user_id, aa.question_id, private.local_day(aa.answered_at), aa.answered_at
  ),
  answers as (
    select fa.uid, count(*) as n, count(*) filter (where fa.is_right) as right_count
    from first_answers fa
    group by fa.uid
  ),
  signed_in as (
    select s.user_id as uid, count(*) as n
    from public.sign_in_days s
    where s.day >= private.local_day(since)
    group by s.user_id
  )
  select mem.id, mem.full_name,
    coalesce(mins.n, 0)::bigint,
    private.review_count(mem.id, since, cid),
    coalesce(answers.n, 0)::bigint,
    coalesce(answers.right_count, 0)::bigint,
    private.streak_of(mem.id),
    coalesce(signed_in.n, 0)::bigint
  from members mem
  left join mins on mins.uid = mem.id
  left join answers on answers.uid = mem.id
  left join signed_in on signed_in.uid = mem.id;
end
$$;

-- Writes -----------------------------------------------------------------

-- Called on every app load and about every 30 seconds while the tab is visible and the user is active.
-- Repeat calls in the same minute change nothing. cid is recorded only if the caller can see that room.
-- The first call of the Toronto day also records a sign-in day.
create or replace function public.heartbeat(cid uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := (select auth.uid());
  this_minute timestamptz := date_trunc('minute', now());
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if cid is not null and not private.can_view_classroom(cid) then
    cid := null;
  end if;

  insert into public.activity_minutes as am (user_id, minute, classroom_id)
  values (uid, this_minute, cid)
  on conflict (user_id, minute)
    do update set classroom_id = coalesce(excluded.classroom_id, am.classroom_id);

  insert into public.presence as pr (user_id, classroom_id, last_seen)
  values (uid, cid, now())
  on conflict (user_id)
    do update set classroom_id = excluded.classroom_id, last_seen = excluded.last_seen;

  insert into public.sign_in_days (user_id, day)
  values (uid, private.local_day(now()))
  on conflict (user_id, day) do nothing;
end
$$;

-- Reads ------------------------------------------------------------------

-- A board for a period ('today', 'week', 'month' or 'all') and a classroom (null = whole chapter).
-- elo is the all-time Elo (1200 plus everything so far). gain is the Elo earned inside the period.
-- Only members with some activity in the period are worth showing; the client filters and sorts.
create function public.leaderboard(period text, cid uuid)
returns table (user_id uuid, full_name text, minutes bigint, reviews bigint, answered bigint, correct bigint,
               accuracy numeric, elo integer, gain integer, streak integer)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  since timestamptz := private.period_start(period);
begin
  if not private.can_read_board(cid) then
    raise exception 'You can''t see that board' using errcode = '42501';
  end if;
  return query
  select p.user_id, p.full_name, p.minutes, p.reviews, p.answered, p.correct,
    case when p.answered > 0 then round(p.correct::numeric / p.answered, 4) end,
    private.elo_score(t.minutes, t.reviews, t.answered, t.correct, t.streak, t.signins),
    private.elo_gain(p.minutes, p.reviews, p.answered, p.correct, p.streak, p.signins),
    p.streak
  from private.board(since, cid) p
  join private.board('-infinity'::timestamptz, cid) t on t.user_id = p.user_id;
end
$$;

-- One member's all-time stats and chapter rank. Empty when there is no such member.
create function public.member_stats(uid uuid)
returns table (user_id uuid, full_name text, role public.app_role, minutes bigint, reviews bigint, answered bigint,
               correct bigint, accuracy numeric, elo integer, streak integer, sign_in_streak integer, rank integer)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  return query
  with everyone as (
    select b.user_id, b.full_name, b.minutes, b.reviews, b.answered, b.correct, b.streak,
      private.elo_score(b.minutes, b.reviews, b.answered, b.correct, b.streak, b.signins) as elo
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

-- Honor roll: everyone with a sign-in streak of 3 days or more, longest first. Any signed-in member can read it.
create function public.honor_roll()
returns table (user_id uuid, full_name text, streak integer)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if (select auth.uid()) is null then
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

-- Grants -------------------------------------------------------------------

revoke all on function
  private.period_start(text), private.sign_in_streak(uuid), private.elo_gain(bigint, bigint, bigint, bigint, integer, bigint),
  private.elo_score(bigint, bigint, bigint, bigint, integer, bigint), private.board(timestamptz, uuid)
  from public, anon, authenticated;

revoke all on function
  public.leaderboard(text, uuid), public.member_stats(uuid), public.honor_roll()
  from public, anon;
grant execute on function
  public.leaderboard(text, uuid), public.member_stats(uuid), public.honor_roll()
  to authenticated;
