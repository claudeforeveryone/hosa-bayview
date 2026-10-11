-- Developer stats (0105): one row per member, for one account only: the site owner, listed by hand in
-- private.stats_viewers (no ids in the repo, filled in the SQL editor). Chapter leads (0101) don't get it.
--   private.stats_viewers           who may see the stats. Not readable or writable by clients.
--   private.can_view_stats(uid)     the check, security definer.
--   public.can_see_dev_stats()      boolean for the nav link. False for everyone else, signed in or not.
--   public.dev_member_stats(period) one row per member. Anyone else gets 42501.
--   public.activity_clicks          clicks per user per minute, capped at 300 a minute.
--   public.record_clicks(n)         the client flushes its click count with the once-a-30-seconds heartbeat.
--                                   It is a separate call, so heartbeat keeps working on a database without this.
-- Sources follow the boards so the numbers agree with the leaderboard:
--   time        activity_minutes (heartbeat minutes; 0081 counts a minute only near study, so this is active time)
--   clicks      activity_clicks (every click on the site, capped per minute)
--   questions   elo_events 'answer' and 'correct' in the period (the leaderboard's own count)
--   tests       attempts started in the period (finished = submitted)
--   flashcards  card_reviews in the period
--   battles won battle_players.won in battles created in the period
--   elo         1200 + all-time points (the chapter board); elo_gain is the points earned in the period
--   last seen   presence.last_seen; seen_today is Toronto midnight on, seen_week is the last 7 days
-- Banned members are included and flagged, so nobody drops off the list.

-- Who may see the stats. Filled by hand, e.g. insert into private.stats_viewers (user_id) values ('<uuid>');
create table if not exists private.stats_viewers (
  user_id uuid primary key references public.profiles (id) on delete cascade
);
revoke all on private.stats_viewers from public, anon, authenticated;

create or replace function private.can_view_stats(uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select uid is not null and exists (select 1 from private.stats_viewers v where v.user_id = uid)
$$;
revoke all on function private.can_view_stats(uuid) from public, anon, authenticated;

create or replace function public.can_see_dev_stats()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.can_view_stats((select auth.uid()))
$$;
revoke all on function public.can_see_dev_stats() from public, anon;
grant execute on function public.can_see_dev_stats() to authenticated;

-- Clicks, one row per user per minute. Written only by record_clicks(). Each minute is capped at 300.
create table if not exists public.activity_clicks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  minute timestamptz not null,
  clicks integer not null check (clicks between 0 and 300),
  primary key (user_id, minute)
);
alter table public.activity_clicks enable row level security;
-- No policies and no grants: only the definer functions read or write it.
revoke all on public.activity_clicks from public, anon, authenticated;

create or replace function public.record_clicks(n integer)
returns void
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := (select auth.uid());
  this_minute timestamptz := date_trunc('minute', now());
  amount integer := least(greatest(coalesce(record_clicks.n, 0), 0), 300);
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if amount = 0 or private.is_banned() then
    return;
  end if;
  insert into public.activity_clicks as ac (user_id, minute, clicks)
  values (uid, this_minute, amount)
  on conflict (user_id, minute)
    do update set clicks = least(ac.clicks + excluded.clicks, 300);
end
$$;
revoke all on function public.record_clicks(integer) from public, anon;
grant execute on function public.record_clicks(integer) to authenticated;

-- Battle wins per member since a time. Battles (0095) may not be on the database yet: then nobody has any.
-- Dynamic SQL so this function, and dev_member_stats, work either way.
create or replace function private.dev_battle_wins(since_at timestamptz)
returns table (uid uuid, n bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if to_regclass('public.battle_players') is null or to_regclass('public.battles') is null then
    return;
  end if;
  return query execute
    'select bp.user_id, count(*) from public.battle_players bp join public.battles b on b.id = bp.battle_id
     where bp.won and b.created_at >= $1 group by bp.user_id'
  using since_at;
end
$$;
revoke all on function private.dev_battle_wins(timestamptz) from public, anon, authenticated;

create or replace function public.dev_member_stats(period text)
returns table (
  user_id uuid,
  full_name text,
  role public.app_role,
  title text,
  joined_at timestamptz,
  banned boolean,
  last_seen timestamptz,
  seen_today boolean,
  seen_week boolean,
  minutes_all bigint,
  minutes_7d bigint,
  minutes_today bigint,
  minutes_period bigint,
  clicks_all bigint,
  clicks_7d bigint,
  clicks_today bigint,
  clicks_period bigint,
  answered bigint,
  correct bigint,
  attempts bigint,
  finished bigint,
  reviews bigint,
  battle_wins bigint,
  classrooms bigint,
  elo integer,
  elo_gain integer
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  since_at timestamptz;
  today_at timestamptz := private.period_start('today');
  week_at timestamptz := now() - interval '7 days';
begin
  if not private.can_view_stats((select auth.uid())) then
    raise exception 'Only the site owner can see developer stats' using errcode = '42501';
  end if;
  -- Raises 22023 for an unknown period (today, week, month or all).
  since_at := private.period_start(dev_member_stats.period);

  return query
  with mins as (
    select m.user_id as uid,
      count(*) as all_n,
      count(*) filter (where m.minute >= week_at) as n_week,
      count(*) filter (where m.minute >= today_at) as n_today,
      count(*) filter (where m.minute >= since_at) as n_period
    from public.activity_minutes m
    group by m.user_id
  ),
  clk as (
    select c.user_id as uid,
      sum(c.clicks) as all_n,
      sum(c.clicks) filter (where c.minute >= week_at) as n_week,
      sum(c.clicks) filter (where c.minute >= today_at) as n_today,
      sum(c.clicks) filter (where c.minute >= since_at) as n_period
    from public.activity_clicks c
    group by c.user_id
  ),
  ev as (
    select e.user_id as uid,
      sum(e.value) as total,
      sum(e.value) filter (where e.earned_at >= since_at) as gain,
      count(*) filter (where e.source = 'answer' and e.earned_at >= since_at) as answered_n,
      count(*) filter (where e.source = 'correct' and e.earned_at >= since_at) as correct_n
    from public.elo_events e
    group by e.user_id
  ),
  att as (
    select a.user_id as uid,
      count(*) as attempts_n,
      count(*) filter (where a.submitted_at is not null) as finished_n
    from public.attempts a
    where a.started_at >= since_at
    group by a.user_id
  ),
  revs as (
    select r.user_id as uid, count(*) as n
    from public.card_reviews r
    where r.reviewed_at >= since_at
    group by r.user_id
  ),
  wins as (
    select w.uid, w.n from private.dev_battle_wins(since_at) w
  ),
  rooms as (
    select cm.user_id as uid, count(*) as n
    from public.classroom_members cm
    group by cm.user_id
  )
  select p.id,
    p.full_name,
    p.role,
    p.title,
    p.created_at,
    coalesce(p.banned_until > now(), false),
    pr.last_seen,
    coalesce(pr.last_seen >= today_at, false),
    coalesce(pr.last_seen >= week_at, false),
    coalesce(mins.all_n, 0),
    coalesce(mins.n_week, 0),
    coalesce(mins.n_today, 0),
    coalesce(mins.n_period, 0),
    coalesce(clk.all_n, 0)::bigint,
    coalesce(clk.n_week, 0)::bigint,
    coalesce(clk.n_today, 0)::bigint,
    coalesce(clk.n_period, 0)::bigint,
    coalesce(ev.answered_n, 0),
    coalesce(ev.correct_n, 0),
    coalesce(att.attempts_n, 0),
    coalesce(att.finished_n, 0),
    coalesce(revs.n, 0),
    coalesce(wins.n, 0),
    coalesce(rooms.n, 0),
    (1200 + round(coalesce(ev.total, 0)))::integer,
    round(coalesce(ev.gain, 0))::integer
  from public.profiles p
  left join public.presence pr on pr.user_id = p.id
  left join mins on mins.uid = p.id
  left join clk on clk.uid = p.id
  left join ev on ev.uid = p.id
  left join att on att.uid = p.id
  left join revs on revs.uid = p.id
  left join wins on wins.uid = p.id
  left join rooms on rooms.uid = p.id
  order by p.full_name, p.id;
end
$$;
revoke all on function public.dev_member_stats(text) from public, anon;
grant execute on function public.dev_member_stats(text) to authenticated;
