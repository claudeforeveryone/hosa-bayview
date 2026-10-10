-- Task 12: Elo rebuild (audit rulings R1-R8 and security audit M2). Part 1: the ledger and what writes it.
-- Elo used to be recomputed from raw rows on every read, with today's streak multiplier applied to all past
-- work, question points re-earned every day, and removed tests erasing points. Now every point is an append-only
-- row in public.elo_events, written by triggers when it is earned, with the streak multiplier frozen then.
-- Display: chapter Elo = 1200 + round(sum(value)); a room's board shows room points = round(sum(value)).
-- value = points x multiplier (kept unrounded per row so a small multiplier still adds up).
-- Check: supabase/tests/elo_audit.sql.

-- The ledger --------------------------------------------------------------------------------------------------
-- ref_id: question (answer, correct), card (review), bonus row (bonus); null for sign-ins. attempt_id: the
-- attempt an answer was earned in. Neither has a foreign key, so removing a test, question, deck or attempt never
-- takes points away. Removing a classroom only clears classroom_id.
create table public.elo_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  classroom_id uuid references public.classrooms (id) on delete set null,
  source text not null check (source in ('answer', 'correct', 'review', 'signin', 'bonus')),
  ref_id uuid,
  attempt_id uuid,
  points integer not null check (points between 1 and 50),
  multiplier numeric(3, 2) not null default 1 check (multiplier between 1 and 1.6),
  value numeric generated always as (points * multiplier) stored,
  earned_at timestamptz not null default now(),
  toronto_day date generated always as ((earned_at at time zone 'America/Toronto')::date) stored
);

-- R2: a question pays answer/correct once ever per user. R5: a card pays once per day. One sign-in a day.
create unique index elo_events_question_once on public.elo_events (user_id, source, ref_id)
  where source in ('answer', 'correct');
create unique index elo_events_review_daily on public.elo_events (user_id, ref_id, toronto_day)
  where source = 'review';
create unique index elo_events_signin_daily on public.elo_events (user_id, toronto_day)
  where source = 'signin';
create unique index elo_events_bonus_once on public.elo_events (ref_id) where source = 'bonus';
create index elo_events_user_time on public.elo_events (user_id, earned_at);
create index elo_events_room_time on public.elo_events (classroom_id, earned_at);
create index elo_events_attempt on public.elo_events (attempt_id) where attempt_id is not null;

alter table public.elo_events enable row level security;
-- No policies and no grants: only the definer functions below read or write it.
revoke all on public.elo_events from anon, authenticated;

-- R4: study days (a graded answer or a card review that day). Heartbeat minutes and sign-ins are not study.
create table private.study_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
-- M2: when the user last answered a question or made a counted card review. Heartbeat minutes count only
-- within 10 minutes of it.
create table private.study_pulse (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_at timestamptz not null
);
revoke all on private.study_days, private.study_pulse from public, anon, authenticated;

-- R3: whether an attempt can earn points, fixed when it starts: not for anyone who can manage the test's room,
-- and not for a test that was unpublished then. Backfill: executives and room owners manage; drafts don't count.
alter table public.attempts add column counts boolean;
update public.attempts a
set counts = t.is_published and not (p.role = 'executive' or c.owner_id = a.user_id)
from public.tests t, public.classrooms c, public.profiles p
where t.id = a.test_id and c.id = t.classroom_id and p.id = a.user_id;
update public.attempts set counts = false where counts is null;
alter table public.attempts alter column counts set default false, alter column counts set not null;

-- R8: the read-time sweep finds open timed attempts by deadline.
create index attempts_open_timed_idx on public.attempts (deadline) where submitted_at is null and mode = 'timed';

-- Backfill (multiplier 1.0) -----------------------------------------------------------------------------------
insert into private.study_days (user_id, day)
select a.user_id, private.local_day(aa.answered_at)
from public.attempt_answers aa join public.attempts a on a.id = aa.attempt_id
where aa.is_correct is not null
union
select r.user_id, private.local_day(r.reviewed_at) from public.card_reviews r
on conflict do nothing;

-- First counted graded answer per user and question.
with firsts as (
  select distinct on (a.user_id, aa.question_id)
    a.user_id, t.classroom_id, aa.question_id, aa.attempt_id, aa.is_correct, aa.answered_at
  from public.attempt_answers aa
  join public.attempts a on a.id = aa.attempt_id
  join public.tests t on t.id = a.test_id
  where aa.is_correct is not null and a.counts
  order by a.user_id, aa.question_id, aa.answered_at
)
insert into public.elo_events (user_id, classroom_id, source, ref_id, attempt_id, points, multiplier, earned_at)
select f.user_id, f.classroom_id, 'answer', f.question_id, f.attempt_id, 2, 1, f.answered_at from firsts f
union all
select f.user_id, f.classroom_id, 'correct', f.question_id, f.attempt_id, 3, 1, f.answered_at from firsts f where f.is_correct;

-- First review of a card per day on decks the reviewer doesn't own, at most 100 a day.
with per_card as (
  select r.user_id, d.classroom_id, r.card_id, r.reviewed_at, private.local_day(r.reviewed_at) as day,
    row_number() over (partition by r.user_id, r.card_id, private.local_day(r.reviewed_at) order by r.reviewed_at, r.id) as nth
  from public.card_reviews r
  join public.cards c on c.id = r.card_id
  join public.decks d on d.id = c.deck_id
  where d.owner_id is distinct from r.user_id
),
daily as (
  select pc.*, row_number() over (partition by pc.user_id, pc.day order by pc.reviewed_at, pc.card_id) as n_today
  from per_card pc where pc.nth = 1
)
insert into public.elo_events (user_id, classroom_id, source, ref_id, points, multiplier, earned_at)
select d.user_id, d.classroom_id, 'review', d.card_id, 1, 1, d.reviewed_at from daily d where d.n_today <= 100;

insert into public.elo_events (user_id, source, points, multiplier, earned_at)
select s.user_id, 'signin', 5, 1, s.day::timestamp at time zone 'America/Toronto' from public.sign_in_days s;

insert into public.elo_events (user_id, source, ref_id, points, multiplier, earned_at)
select b.user_id, 'bonus', b.id, b.amount, 1, b.created_at from public.elo_bonuses b;

-- Streak multiplier ------------------------------------------------------------------------------------------
-- Study days in a row ending on day d, counted up to 30 (the multiplier caps there).
create function private.study_streak_at(uid uuid, d date)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare
  n integer := 0;
begin
  while n < 30 and exists (select 1 from private.study_days s where s.user_id = uid and s.day = d - n) loop
    n := n + 1;
  end loop;
  return n;
end $$;

-- x1.02 per study day in a row, x1.6 at 30 days. Frozen into each event when it is earned (finding 1).
create function private.streak_multiplier(uid uuid, d date)
returns numeric language sql stable security definer set search_path = '' as $$
  select 1 + 0.02 * private.study_streak_at(uid, d)
$$;

-- Writers ----------------------------------------------------------------------------------------------------
-- Answers: any answer write is study activity (a timed answer is graded later, at submit). Once graded, the
-- day is a study day, and if the attempt counts and this is the user's first graded answer to the question,
-- it pays 2, plus 3 when right. Points from a timed run land at its deadline at the latest (R8).
create function private.elo_on_answer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a record;
  earned timestamptz;
  mult numeric;
begin
  select att.user_id, att.counts, att.deadline, t.classroom_id into a
  from public.attempts att join public.tests t on t.id = att.test_id
  where att.id = new.attempt_id;
  if a.user_id is null then
    return null;
  end if;
  if tg_op = 'INSERT' or new.answered_at is distinct from old.answered_at then
    insert into private.study_pulse as sp (user_id, last_at) values (a.user_id, new.answered_at)
    on conflict (user_id) do update set last_at = greatest(sp.last_at, excluded.last_at);
  end if;
  if new.is_correct is null or (tg_op = 'UPDATE' and old.is_correct is not null) then
    return null;
  end if;
  earned := least(now(), coalesce(a.deadline, now()));
  insert into private.study_days (user_id, day) values (a.user_id, private.local_day(earned))
  on conflict do nothing;
  if not a.counts then
    return null;
  end if;
  mult := private.streak_multiplier(a.user_id, private.local_day(earned));
  insert into public.elo_events (user_id, classroom_id, source, ref_id, attempt_id, points, multiplier, earned_at)
  values (a.user_id, a.classroom_id, 'answer', new.question_id, new.attempt_id, 2, mult, earned)
  on conflict do nothing;
  if found and new.is_correct then
    insert into public.elo_events (user_id, classroom_id, source, ref_id, attempt_id, points, multiplier, earned_at)
    values (a.user_id, a.classroom_id, 'correct', new.question_id, new.attempt_id, 3, mult, earned)
    on conflict do nothing;
  end if;
  return null;
end $$;

create trigger elo_on_answer after insert or update on public.attempt_answers
  for each row execute function private.elo_on_answer();

-- Card reviews (R5): every review makes a study day; points only on decks you don't own, the first review of
-- a card each day, at most 100 a day. Only counted reviews keep heartbeat minutes counting.
create function private.elo_on_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  deck_owner uuid;
  room uuid;
  d date := private.local_day(new.reviewed_at);
  day_start timestamptz := d::timestamp at time zone 'America/Toronto';
begin
  select dk.owner_id, dk.classroom_id into deck_owner, room
  from public.cards c join public.decks dk on dk.id = c.deck_id
  where c.id = new.card_id;
  insert into private.study_days (user_id, day) values (new.user_id, d) on conflict do nothing;
  if deck_owner is not distinct from new.user_id then
    return null;
  end if;
  -- One reviewer at a time, so two tabs can't both take the 100th slot.
  perform pg_advisory_xact_lock(hashtext('hosa.review:' || new.user_id::text));
  if (select count(*) from public.elo_events e
      where e.user_id = new.user_id and e.source = 'review'
        and e.earned_at >= day_start and e.earned_at < (d + 1)::timestamp at time zone 'America/Toronto') >= 100 then
    return null;
  end if;
  insert into public.elo_events (user_id, classroom_id, source, ref_id, points, multiplier, earned_at)
  values (new.user_id, room, 'review', new.card_id, 1, private.streak_multiplier(new.user_id, d), new.reviewed_at)
  on conflict do nothing;
  if found then
    insert into private.study_pulse as sp (user_id, last_at) values (new.user_id, new.reviewed_at)
    on conflict (user_id) do update set last_at = greatest(sp.last_at, excluded.last_at);
  end if;
  return null;
end $$;

create trigger elo_on_review after insert on public.card_reviews
  for each row execute function private.elo_on_review();

-- Sign-in days pay 5, chapter only, not multiplied.
create function private.elo_on_sign_in()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.elo_events (user_id, source, points, multiplier, earned_at)
  values (new.user_id, 'signin', 5, 1, new.day::timestamp at time zone 'America/Toronto')
  on conflict do nothing;
  return null;
end $$;

create trigger elo_on_sign_in after insert on public.sign_in_days
  for each row execute function private.elo_on_sign_in();

-- Lucky bonuses pay their amount, chapter only, not multiplied.
create function private.elo_on_bonus()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.elo_events (user_id, source, ref_id, points, multiplier, earned_at)
  values (new.user_id, 'bonus', new.id, new.amount, 1, new.created_at)
  on conflict do nothing;
  return null;
end $$;

create trigger elo_on_bonus after insert on public.elo_bonuses
  for each row execute function private.elo_on_bonus();

revoke execute on function private.study_streak_at(uuid, date), private.streak_multiplier(uuid, date),
  private.elo_on_answer(), private.elo_on_review(), private.elo_on_sign_in(), private.elo_on_bonus()
  from public, anon, authenticated;

-- R6: nobody but the owner truncates (0069 did this; repeated so this file stands alone).
revoke truncate on all tables in schema public from anon, authenticated;
