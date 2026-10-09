-- Elo fairness: stop repeat practice and repeat reviews from farming points.
-- Within a Toronto day, only the first graded answer to each question counts (retrying a question doesn't
-- add to the score), and each flashcard counts once per day. Same signatures as 0017, so the public RPCs
-- and their callers don't change; they just get fairer counts.

-- Flashcards reviewed since a point in time: distinct card per Toronto day. Late-bound: zero until card_reviews exists.
create or replace function private.review_count(uid uuid, since timestamptz, cid uuid)
returns bigint
language plpgsql stable security definer set search_path = ''
as $$
begin
  if to_regclass('public.card_reviews') is null then
    return 0;
  end if;
  return (
    select count(*)
    from (
      select distinct r.card_id, private.local_day(r.reviewed_at) as day
      from public.card_reviews r
      where r.user_id = uid and r.reviewed_at >= since
        and (cid is null or exists (
          select 1 from public.cards c
          join public.decks d on d.id = c.deck_id
          where c.id = r.card_id and d.classroom_id = cid
        ))
    ) x
  );
end
$$;

-- Per-member totals since a point in time. Questions count once per Toronto day (the first graded answer
-- that day decides right or wrong); reviews count once per card per day.
create or replace function private.board(since timestamptz, cid uuid)
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
