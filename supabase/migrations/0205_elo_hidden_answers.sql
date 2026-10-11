-- Omega security 0205 (review of 0200, audit H1). 0200 closed attempts.score, but Elo was a second answer-key oracle
-- on tests that hide their answers (show_answers off). elo_on_answer paid a 'correct' bonus (+3) for a right first
-- answer and 2 instead of 1 for a right repeat, and private.standings sums those into member_stats(self) and
-- leaderboard (elo, gain, correct, accuracy). So a trainee could practise one question and read whether it was right,
-- and a timed run's correct count gave away a hidden score. elo_events itself has no client grant.
-- Now, while a test hides its answers, an answer earns the same points right or wrong: 2 the first time, 1 for a repeat,
-- and no 'correct' row. When the test shows its answers again (show_answers turned back on, when anyone can read the
-- key anyway), the bonus it held back is paid with the multiplier and date it was earned on: 'correct' for each right
-- first answer, and the extra repeat point for each right repeat. Paying is idempotent, so flipping again pays nothing.
-- Until then, hidden-test answers count as answered but not as correct on the boards. Nothing to backfill: no test
-- hides its answers on live today.

create or replace function private.elo_on_answer()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  a record;
  earned timestamptz;
  mult numeric;
  shown boolean;
begin
  select att.user_id, att.counts, att.deadline, t.classroom_id, t.show_answers into a
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
  -- Hidden answers pay as if wrong; private.elo_pay_revealed adds the rest once the test shows them.
  shown := a.show_answers and new.is_correct;
  mult := private.streak_multiplier(a.user_id, private.local_day(earned));
  -- First time on this question: 2, plus 3 if right.
  insert into public.elo_events (user_id, classroom_id, source, ref_id, attempt_id, points, multiplier, earned_at)
  values (a.user_id, a.classroom_id, 'answer', new.question_id, new.attempt_id, 2, mult, earned)
  on conflict do nothing;
  if found then
    if shown then
      insert into public.elo_events (user_id, classroom_id, source, ref_id, attempt_id, points, multiplier, earned_at)
      values (a.user_id, a.classroom_id, 'correct', new.question_id, new.attempt_id, 3, mult, earned)
      on conflict do nothing;
    end if;
  else
    -- Seen it before: 1, or 2 if right, once per question per day so it can't be farmed.
    insert into public.elo_events (user_id, classroom_id, source, ref_id, attempt_id, points, multiplier, earned_at)
    values (a.user_id, a.classroom_id, 'repeat', new.question_id, new.attempt_id,
            case when shown then 2 else 1 end, mult, earned)
    on conflict do nothing;
  end if;
  return null;
end $$;

-- The bonus held back on one test's answers. Each answer event points at the attempt and question it was earned on.
create or replace function private.elo_pay_revealed(tid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.elo_events (user_id, classroom_id, source, ref_id, attempt_id, points, multiplier, earned_at)
  select e.user_id, e.classroom_id, 'correct', e.ref_id, e.attempt_id, 3, e.multiplier, e.earned_at
  from public.elo_events e
  join public.attempts att on att.id = e.attempt_id
  join public.attempt_answers aa on aa.attempt_id = e.attempt_id and aa.question_id = e.ref_id
  where e.source = 'answer' and att.test_id = tid and att.counts and aa.is_correct
  on conflict do nothing;
  update public.elo_events e
  set points = 2
  from public.attempts att, public.attempt_answers aa
  where e.source = 'repeat' and e.points = 1
    and att.id = e.attempt_id and att.test_id = tid and att.counts
    and aa.attempt_id = e.attempt_id and aa.question_id = e.ref_id and aa.is_correct;
end $$;
revoke all on function private.elo_pay_revealed(uuid) from public, anon, authenticated;

create or replace function private.elo_on_reveal()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.elo_pay_revealed(new.id);
  return null;
end $$;
revoke all on function private.elo_on_reveal() from public, anon, authenticated;

create or replace trigger tests_elo_reveal
  after update of show_answers on public.tests
  for each row when (new.show_answers and not old.show_answers)
  execute function private.elo_on_reveal();
