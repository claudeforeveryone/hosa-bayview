-- Elo starts at 0 and every answer moves it up.
-- 1. The 1200 base is gone from every place that adds it (elo_score, member_stats, leaderboard,
--    dev_member_stats): Elo is now just the sum of points earned.
-- 2. Answers on published tests count for everyone, executives and room owners included (before, managers
--    never earned from answering, and every premade room has a manager).
-- 3. A question you've answered before still earns: 1 point, or 2 if right, once per question per day
--    (source 'repeat'). The first answer to a question keeps its 2 points, plus 3 if right.
-- Existing attempts on published tests are counted and their missing points awarded once.

-- 1. Base 0. Each of these functions adds the base in exactly one place.
do $$
declare
  f regprocedure;
  def text;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (('private', 'elo_score'), ('public', 'member_stats'),
                                     ('public', 'leaderboard'), ('public', 'dev_member_stats'))
  loop
    def := pg_get_functiondef(f);
    if def like '%1200%' then
      execute replace(def, '1200', '0');
    end if;
  end loop;
end
$$;

-- 2. Managers' attempts count too (drafts still don't).
do $$
declare
  def text := pg_get_functiondef('public.start_attempt(uuid, text)'::regprocedure);
begin
  if position('coalesce(published, false) and not manager)' in def) = 0 then
    raise exception 'start_attempt changed; update 0105';
  end if;
  execute replace(def, 'coalesce(published, false) and not manager)', 'coalesce(published, false))');
end
$$;

-- 3. Repeat answers.
alter table public.elo_events drop constraint elo_events_source_check;
alter table public.elo_events add constraint elo_events_source_check
  check (source = any (array['answer', 'correct', 'repeat', 'review', 'signin', 'bonus']));
create unique index if not exists elo_events_repeat_daily
  on public.elo_events (user_id, ref_id, toronto_day) where source = 'repeat';

create or replace function private.elo_on_answer()
returns trigger
language plpgsql security definer set search_path = ''
as $$
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
  -- First time on this question: 2, plus 3 if right.
  insert into public.elo_events (user_id, classroom_id, source, ref_id, attempt_id, points, multiplier, earned_at)
  values (a.user_id, a.classroom_id, 'answer', new.question_id, new.attempt_id, 2, mult, earned)
  on conflict do nothing;
  if found then
    if new.is_correct then
      insert into public.elo_events (user_id, classroom_id, source, ref_id, attempt_id, points, multiplier, earned_at)
      values (a.user_id, a.classroom_id, 'correct', new.question_id, new.attempt_id, 3, mult, earned)
      on conflict do nothing;
    end if;
  else
    -- Seen it before: 1, or 2 if right, once per question per day so it can't be farmed.
    insert into public.elo_events (user_id, classroom_id, source, ref_id, attempt_id, points, multiplier, earned_at)
    values (a.user_id, a.classroom_id, 'repeat', new.question_id, new.attempt_id,
            case when new.is_correct then 2 else 1 end, mult, earned)
    on conflict do nothing;
  end if;
  return null;
end $$;

-- Backfill: count past attempts on published tests, then award first-answer points they missed.
update public.attempts a set counts = true
from public.tests t
where t.id = a.test_id and t.is_published and not a.counts;

insert into public.elo_events (user_id, classroom_id, source, ref_id, attempt_id, points, multiplier, earned_at)
select distinct on (att.user_id, aa.question_id)
  att.user_id, t.classroom_id, 'answer', aa.question_id, att.id, 2, 1, coalesce(aa.answered_at, att.started_at)
from public.attempt_answers aa
join public.attempts att on att.id = aa.attempt_id
join public.tests t on t.id = att.test_id
where aa.is_correct is not null and att.counts
order by att.user_id, aa.question_id, coalesce(aa.answered_at, att.started_at)
on conflict do nothing;

insert into public.elo_events (user_id, classroom_id, source, ref_id, attempt_id, points, multiplier, earned_at)
select first.user_id, first.classroom_id, 'correct', first.question_id, first.attempt_id, 3, 1, first.at
from (
  select distinct on (att.user_id, aa.question_id)
    att.user_id, t.classroom_id, aa.question_id, att.id as attempt_id, aa.is_correct,
    coalesce(aa.answered_at, att.started_at) as at
  from public.attempt_answers aa
  join public.attempts att on att.id = aa.attempt_id
  join public.tests t on t.id = att.test_id
  where aa.is_correct is not null and att.counts
  order by att.user_id, aa.question_id, coalesce(aa.answered_at, att.started_at)
) first
where first.is_correct
on conflict do nothing;
