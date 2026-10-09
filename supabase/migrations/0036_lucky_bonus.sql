-- Elo without time, and lucky bonuses.
-- Elo now counts flashcards (1), questions answered (2), questions right (+3), times the study-streak
-- multiplier, plus 5 per sign-in day, plus lucky bonuses (flat, never multiplied). Minutes no longer count;
-- the Hours stat is still tracked and shown on its own.
-- Public RPC signatures are unchanged (leaderboard, member_stats), so the current app keeps working.

-- Lucky bonuses ------------------------------------------------------------

-- One row per bonus paid. Written only by roll_lucky_bonus(); clients read it through recent_bonuses().
create table public.elo_bonuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null check (amount between 1 and 50),
  reason text not null check (reason in ('visit', 'test', 'flashcards')),
  created_at timestamptz not null default now()
);
create index elo_bonuses_user_idx on public.elo_bonuses (user_id, created_at desc);
alter table public.elo_bonuses enable row level security;
revoke all on public.elo_bonuses from public, anon, authenticated;

-- One roll per member, per reason, per Toronto day. The primary key makes a repeat (or a race) a no-op,
-- whether or not the roll paid out.
create table public.elo_rolls (
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('visit', 'test', 'flashcards')),
  day date not null,
  primary key (user_id, reason, day)
);
alter table public.elo_rolls enable row level security;
revoke all on public.elo_rolls from public, anon, authenticated;

-- Drop what changes shape or internals, then rebuild it below.
drop function public.leaderboard(text, uuid);
drop function public.member_stats(uuid);
drop function private.board(timestamptz, uuid);
drop function private.elo_score(bigint, bigint, bigint, bigint, integer, bigint);
drop function private.elo_gain(bigint, bigint, bigint, bigint, integer, bigint);

-- Helpers ---------------------------------------------------------------

-- Elo gained from study and sign-ins, plus lucky bonuses. The streak multiplies study gains only (up to x1.6 at 30 days).
--   + 1 per flashcard reviewed
--   + 2 per question answered
--   + 3 per question right (a right answer is worth 5, a wrong one 2, so accuracy counts)
--   + 5 per sign-in day, added after the multiplier
--   + lucky bonuses, added flat
create function private.elo_gain(reviews bigint, answered bigint, correct bigint, streak integer, signins bigint, bonus bigint)
returns integer
language sql immutable set search_path = ''
as $$
  select round(
      (reviews * 1 + answered * 2 + correct * 3)
      * (1 + least(greatest(streak, 0), 30) * 0.02)
    )::integer + (5 * signins)::integer + bonus::integer
$$;

-- ELO: everyone starts at 1200. Tune the numbers in private.elo_gain and nowhere else.
create function private.elo_score(reviews bigint, answered bigint, correct bigint, streak integer, signins bigint, bonus bigint)
returns integer
language sql immutable set search_path = ''
as $$
  select 1200 + private.elo_gain(reviews, answered, correct, streak, signins, bonus)
$$;

-- Outcome of one roll, from three uniform numbers in [0, 1). win < 0.2 pays (about 1 in 5);
-- of the wins, 1 in 50 is the jackpot (50), the rest are 5 to 25 evenly.
create function private.lucky_amount(win double precision, jackpot double precision, size double precision)
returns integer
language sql immutable set search_path = ''
as $$
  select case
    when win >= 0.2 then 0
    when jackpot < 0.02 then 50
    else 5 + least(floor(size * 21), 20)::integer
  end
$$;

-- Per-member totals since a point in time, plus sign-in days and lucky bonuses since that point
-- (all of them when since is -infinity). Minutes are kept for the Hours stat; Elo ignores them.
-- Questions count once per Toronto day (the first graded answer that day decides right or wrong); reviews count once per card per day.
create function private.board(since timestamptz, cid uuid)
returns table (user_id uuid, full_name text, minutes bigint, reviews bigint, answered bigint, correct bigint, streak integer, signins bigint, bonus bigint)
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
  ),
  lucky as (
    select b.user_id as uid, sum(b.amount) as n
    from public.elo_bonuses b
    where b.created_at >= since
    group by b.user_id
  )
  select mem.id, mem.full_name,
    coalesce(mins.n, 0)::bigint,
    private.review_count(mem.id, since, cid),
    coalesce(answers.n, 0)::bigint,
    coalesce(answers.right_count, 0)::bigint,
    private.streak_of(mem.id),
    coalesce(signed_in.n, 0)::bigint,
    coalesce(lucky.n, 0)::bigint
  from members mem
  left join mins on mins.uid = mem.id
  left join answers on answers.uid = mem.id
  left join signed_in on signed_in.uid = mem.id
  left join lucky on lucky.uid = mem.id;
end
$$;

-- Writes -----------------------------------------------------------------

-- Lucky bonus roll for the signed-in member. reason is 'visit' (first app load of the day), 'test' (test submitted)
-- or 'flashcards' (study round or match finished). Each reason rolls once per Toronto day; repeats return 0.
-- Returns the Elo paid (0 for no bonus). Randomness is server-side only.
create function public.roll_lucky_bonus(p_reason text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  amount integer;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('visit', 'test', 'flashcards') then
    raise exception 'Reason must be visit, test or flashcards' using errcode = '22023';
  end if;

  insert into public.elo_rolls (user_id, reason, day)
  values (uid, p_reason, private.local_day(now()))
  on conflict do nothing;
  if not found then
    return 0;
  end if;

  amount := private.lucky_amount(random(), random(), random());
  if amount > 0 then
    insert into public.elo_bonuses (user_id, amount, reason) values (uid, amount, p_reason);
  end if;
  return amount;
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
    private.elo_score(t.reviews, t.answered, t.correct, t.streak, t.signins, t.bonus),
    private.elo_gain(p.reviews, p.answered, p.correct, p.streak, p.signins, p.bonus),
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

-- The five most recent lucky bonuses for one member, newest first. Any signed-in member can read them,
-- like the profile stats they sit beside.
create function public.recent_bonuses(uid uuid)
returns table (amount integer, reason text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select b.amount, b.reason, b.created_at
  from public.elo_bonuses b
  where b.user_id = uid and (select auth.uid()) is not null
  order by b.created_at desc, b.id
  limit 5
$$;

-- Grants -------------------------------------------------------------------

revoke all on function
  private.elo_gain(bigint, bigint, bigint, integer, bigint, bigint),
  private.elo_score(bigint, bigint, bigint, integer, bigint, bigint),
  private.lucky_amount(double precision, double precision, double precision),
  private.board(timestamptz, uuid)
  from public, anon, authenticated;

revoke all on function
  public.leaderboard(text, uuid), public.member_stats(uuid), public.roll_lucky_bonus(text), public.recent_bonuses(uuid)
  from public, anon;
grant execute on function
  public.leaderboard(text, uuid), public.member_stats(uuid), public.roll_lucky_bonus(text), public.recent_bonuses(uuid)
  to authenticated;
