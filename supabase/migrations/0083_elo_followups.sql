-- Task 12 follow-ups (final wave). Built from the live definitions (pg_get_functiondef, 2026-10-10), which match
-- 0080/0081. Signatures and grants are unchanged. No later pending migration (0084-0098) redefines either function.
-- 1. A study day comes only from a review that earns points (a deck you don't own, under the daily cap) or a
--    graded answer. One scripted card a day on your own deck no longer holds the streak multiplier.
-- 2. The read-time sweep leaves banned members' expired timed runs alone, so a ban pays no answer points.
--    The run is graded (points dated at its deadline) by the first board read after the ban lifts.

create or replace function private.elo_on_review()
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
  -- Before the multiplier, like a graded answer: the first counted review of the day is part of the streak.
  -- A repeat of a card already paid today lands here too, but its day is already a study day.
  insert into private.study_days (user_id, day) values (new.user_id, d) on conflict do nothing;
  insert into public.elo_events (user_id, classroom_id, source, ref_id, points, multiplier, earned_at)
  values (new.user_id, room, 'review', new.card_id, 1, private.streak_multiplier(new.user_id, d), new.reviewed_at)
  on conflict do nothing;
  if found then
    insert into private.study_pulse as sp (user_id, last_at) values (new.user_id, new.reviewed_at)
    on conflict (user_id) do update set last_at = greatest(sp.last_at, excluded.last_at);
  end if;
  return null;
end $$;

create or replace function private.finalize_expired_attempts(uid uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  stale uuid;
  n integer := 0;
begin
  for stale in
    select a.id from public.attempts a
    where a.mode = 'timed' and a.submitted_at is null and a.deadline < now() - interval '30 seconds'
      and (uid is null or a.user_id = uid)
      and not exists (select 1 from public.profiles p where p.id = a.user_id and p.banned_until > now())
    order by a.id
    for update skip locked
  loop
    perform private.grade_attempt(stale);
    n := n + 1;
  end loop;
  return n;
end $$;
