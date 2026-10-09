-- Phase 5 and 6: activity minutes, presence, Elo, leaderboards, member stats and career.
-- Clients never touch these tables. The heartbeat and every read go through the functions below.

-- One row per user per minute. Written only by heartbeat(), which truncates to the minute and
-- ignores repeats, so time can't be inflated. classroom_id is where that minute was spent, if anywhere.
create table public.activity_minutes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  minute timestamptz not null,
  classroom_id uuid references public.classrooms (id) on delete set null,
  primary key (user_id, minute)
);
create index activity_minutes_classroom_idx on public.activity_minutes (classroom_id, minute);
create index activity_minutes_minute_idx on public.activity_minutes (minute);
alter table public.activity_minutes enable row level security;

-- Last heartbeat per user. Online means seen in the last two minutes.
create table public.presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  classroom_id uuid references public.classrooms (id) on delete set null,
  last_seen timestamptz not null
);
create index presence_last_seen_idx on public.presence (last_seen);
alter table public.presence enable row level security;

revoke all on public.activity_minutes, public.presence from public, anon, authenticated;

-- Helpers ---------------------------------------------------------------

-- Calendar day in Toronto. Streaks count these days.
create function private.local_day(ts timestamptz)
returns date
language sql stable set search_path = ''
as $$
  select (ts at time zone 'America/Toronto')::date
$$;

-- Start of the period in Toronto time: Monday of this week, the 1st of this month, or the beginning of time.
create function private.period_start(period text)
returns timestamptz
language plpgsql stable set search_path = ''
as $$
declare
  local_now timestamp := now() at time zone 'America/Toronto';
begin
  case period
    when 'week' then return date_trunc('week', local_now) at time zone 'America/Toronto';
    when 'month' then return date_trunc('month', local_now) at time zone 'America/Toronto';
    when 'all' then return '-infinity'::timestamptz;
    else raise exception 'Period must be week, month or all' using errcode = '22023';
  end case;
end
$$;

-- Days with any activity: a heartbeat, a flashcard review, or a graded answer.
-- card_reviews is late-bound so this works whether or not the flashcards migration has run.
create function private.activity_days(uid uuid)
returns setof date
language plpgsql stable security definer set search_path = ''
as $$
begin
  return query
    select private.local_day(m.minute) from public.activity_minutes m where m.user_id = uid;
  return query
    select private.local_day(aa.answered_at)
    from public.attempt_answers aa
    join public.attempts a on a.id = aa.attempt_id
    where a.user_id = uid and aa.is_correct is not null;
  if to_regclass('public.card_reviews') is not null then
    return query
      select private.local_day(r.reviewed_at) from public.card_reviews r where r.user_id = uid;
  end if;
end
$$;

-- Current streak in Toronto days. Counts back from today, or from yesterday, so a streak
-- stands until the day is over. Zero when the last active day is older than that.
create function private.streak_of(uid uuid)
returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  today date := private.local_day(now());
  result integer;
begin
  with days as (
    select distinct x.dd from private.activity_days(uid) as x(dd)
  ),
  islands as (
    select count(*) as len, max(d.dd) as last_day
    from (select dd, dd - (row_number() over (order by dd))::integer as grp from days) d
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

-- ELO: the one score. Tune it here and nowhere else.
--   100 base
--   + 0.5 per minute studied
--   + 1 per flashcard reviewed
--   + 2 per question answered
--   + 3 per question right (a right answer is worth 5, a wrong one 2, so accuracy counts)
--   gains x (1 + 0.02 * min(streak, 30)): the streak multiplies the gains, up to x1.6 at 30 days
-- Leaderboards score the chosen period (base included in each period). Profiles show all time.
create function private.elo_score(minutes bigint, reviews bigint, answered bigint, correct bigint, streak integer)
returns integer
language sql immutable set search_path = ''
as $$
  select round(
    100 + (minutes * 0.5 + reviews * 1 + answered * 2 + correct * 3)
          * (1 + least(greatest(streak, 0), 30) * 0.02)
  )::integer
$$;

-- Per-member totals since a point in time. cid null = everyone with a profile; otherwise the classroom's members.
-- Answers count once graded (practice at once, timed on submit). Reviews count only in classrooms
-- through the deck they belong to. Streak is always the member's overall streak.
create function private.board(since timestamptz, cid uuid)
returns table (user_id uuid, full_name text, minutes bigint, reviews bigint, answered bigint, correct bigint, streak integer)
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
  answers as (
    select a.user_id as uid, count(*) as n, count(*) filter (where aa.is_correct) as right_count
    from public.attempt_answers aa
    join public.attempts a on a.id = aa.attempt_id
    join public.tests t on t.id = a.test_id
    where aa.is_correct is not null and aa.answered_at >= since
      and (cid is null or t.classroom_id = cid)
    group by a.user_id
  )
  select mem.id, mem.full_name,
    coalesce(mins.n, 0)::bigint,
    private.review_count(mem.id, since, cid),
    coalesce(answers.n, 0)::bigint,
    coalesce(answers.right_count, 0)::bigint,
    private.streak_of(mem.id)
  from members mem
  left join mins on mins.uid = mem.id
  left join answers on answers.uid = mem.id;
end
$$;

-- Flashcards reviewed since a point in time. Late-bound: zero until card_reviews exists.
create function private.review_count(uid uuid, since timestamptz, cid uuid)
returns bigint
language plpgsql stable security definer set search_path = ''
as $$
begin
  if to_regclass('public.card_reviews') is null then
    return 0;
  end if;
  return (
    select count(*)
    from public.card_reviews r
    where r.user_id = uid and r.reviewed_at >= since
      and (cid is null or exists (
        select 1 from public.cards c
        join public.decks d on d.id = c.deck_id
        where c.id = r.card_id and d.classroom_id = cid
      ))
  );
end
$$;

-- Who may read a board: any signed-in member for chapter-wide, the classroom's viewers for a room.
create function private.can_read_board(cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (cid is null or private.can_view_classroom(cid))
$$;

-- Writes -----------------------------------------------------------------

-- Called about once a minute while the tab is visible and the user has been active.
-- Repeat calls in the same minute change nothing. cid is recorded only if the caller can see that room.
create function public.heartbeat(cid uuid)
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
end
$$;

-- Reads ------------------------------------------------------------------

-- A board for a period ('week', 'month' or 'all') and a classroom (null = whole chapter).
-- Only members with some activity in the period are worth showing; the client filters and sorts.
create function public.leaderboard(period text, cid uuid)
returns table (user_id uuid, full_name text, minutes bigint, reviews bigint, answered bigint, correct bigint,
               accuracy numeric, elo integer, streak integer)
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
  select b.user_id, b.full_name, b.minutes, b.reviews, b.answered, b.correct,
    case when b.answered > 0 then round(b.correct::numeric / b.answered, 4) end,
    private.elo_score(b.minutes, b.reviews, b.answered, b.correct, b.streak),
    b.streak
  from private.board(since, cid) b;
end
$$;

-- Who's online: seen in the last two minutes. cid null = anywhere in the chapter.
create function public.members_online(cid uuid)
returns table (user_id uuid, full_name text, last_seen timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.can_read_board(cid) then
    raise exception 'You can''t see that classroom' using errcode = '42501';
  end if;
  return query
  select pr.user_id, p.full_name, pr.last_seen
  from public.presence pr
  join public.profiles p on p.id = pr.user_id
  where pr.last_seen > now() - interval '2 minutes'
    and (cid is null or pr.classroom_id = cid)
  order by p.full_name, pr.user_id;
end
$$;

-- Everyone with a profile, for the members directory. No emails.
create function public.member_directory()
returns table (user_id uuid, full_name text, role public.app_role)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name, p.role
  from public.profiles p
  where (select auth.uid()) is not null
  order by p.full_name, p.id
$$;

-- One member's all-time stats and chapter rank. Empty when there is no such member.
create function public.member_stats(uid uuid)
returns table (user_id uuid, full_name text, role public.app_role, minutes bigint, reviews bigint, answered bigint,
               correct bigint, accuracy numeric, elo integer, streak integer, rank integer)
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
      private.elo_score(b.minutes, b.reviews, b.answered, b.correct, b.streak) as elo
    from private.board('-infinity'::timestamptz, null) b
  ),
  ranked as (
    select e.*, rank() over (order by e.elo desc)::integer as place from everyone e
  )
  select r.user_id, r.full_name, p.role, r.minutes, r.reviews, r.answered, r.correct,
    case when r.answered > 0 then round(r.correct::numeric / r.answered, 4) end,
    r.elo, r.streak, r.place
  from ranked r
  join public.profiles p on p.id = r.user_id
  where r.user_id = uid;
end
$$;

-- Answered questions with the answer given and the right one. Your own; executives see all;
-- a trainer sees answers to tests in classrooms they run. Trainees never see someone else's.
create function public.career(uid uuid, cid uuid)
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
  select aa.answered_at, t.title, q.prompt, q.options, aa.selected_index,
    k.correct_index, aa.is_correct, k.explanation
  from public.attempt_answers aa
  join public.attempts a on a.id = aa.attempt_id
  join public.tests t on t.id = a.test_id
  join public.questions q on q.id = aa.question_id
  join public.question_keys k on k.question_id = q.id
  where a.user_id = uid
    and aa.is_correct is not null
    and (cid is null or t.classroom_id = cid)
    and (uid = (select auth.uid())
         or private.is_executive()
         or private.can_manage_classroom(t.classroom_id))
  order by aa.answered_at desc
  limit 500;
end
$$;

-- Grants -------------------------------------------------------------------

revoke all on function
  private.local_day(timestamptz), private.period_start(text), private.activity_days(uuid), private.streak_of(uuid),
  private.elo_score(bigint, bigint, bigint, bigint, integer), private.board(timestamptz, uuid),
  private.review_count(uuid, timestamptz, uuid), private.can_read_board(uuid)
  from public, anon, authenticated;

revoke all on function
  public.heartbeat(uuid), public.leaderboard(text, uuid), public.members_online(uuid),
  public.member_directory(), public.member_stats(uuid), public.career(uuid, uuid)
  from public, anon;
grant execute on function
  public.heartbeat(uuid), public.leaderboard(text, uuid), public.members_online(uuid),
  public.member_directory(), public.member_stats(uuid), public.career(uuid, uuid)
  to authenticated;
