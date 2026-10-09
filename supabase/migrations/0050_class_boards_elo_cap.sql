-- Class boards measure class work; flashcard Elo can't be farmed; banned members leave the boards.
-- 1. A classroom board counts only that room's minutes, cards and questions. Sign-in days and lucky bonuses are
--    chapter-wide, so they only count on the chapter board.
-- 2. Flashcards count at most 100 different cards a day (one review per card per day was already the rule).
-- 3. Banned members don't appear on any board.

create or replace function private.review_count(uid uuid, since timestamptz, cid uuid)
returns bigint
language plpgsql stable security definer set search_path = ''
as $$
begin
  if to_regclass('public.card_reviews') is null then
    return 0;
  end if;
  return coalesce((
    select sum(least(per_day.n, 100))
    from (
      select private.local_day(r.reviewed_at) as day, count(distinct r.card_id) as n
      from public.card_reviews r
      where r.user_id = uid and r.reviewed_at >= since
        and (cid is null or exists (
          select 1 from public.cards c
          join public.decks d on d.id = c.deck_id
          where c.id = r.card_id and d.classroom_id = cid
        ))
      group by 1
    ) per_day
  ), 0)::bigint;
end
$$;

create or replace function private.board(since timestamptz, cid uuid)
returns table (user_id uuid, full_name text, minutes bigint, reviews bigint, answered bigint, correct bigint,
               streak integer, signins bigint, bonus bigint)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with members as (
    select p.id, p.full_name
    from public.profiles p
    where (p.banned_until is null or p.banned_until <= now())
      and (cid is null
           or exists (select 1 from public.classroom_members cm where cm.classroom_id = cid and cm.user_id = p.id))
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
    where cid is null and s.day >= private.local_day(since)
    group by s.user_id
  ),
  lucky as (
    select b.user_id as uid, sum(b.amount) as n
    from public.elo_bonuses b
    where cid is null and b.created_at >= since
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
