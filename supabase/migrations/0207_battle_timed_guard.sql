-- Omega security 0207 (review of 0098 and 0205). 0098 holds back practice answers on a question that is live in a
-- battle, but its timed branch still stored the answer. A timed answer shows no verdict, yet submitting grades it and
-- private.elo_on_answer pays a right one at once ('correct' +3 on a first answer, 2 instead of 1 on a repeat), and
-- member_stats(self).correct shows that inside the 20 second round. Battle tests always show their answers and may be
-- timed with no cap (0095 battle_test_ok), so a player could start a timed run mid-round, answer the live question,
-- submit and read their own stats. score_visible hid the score, not the Elo.
-- Now a timed answer on a live battle question is refused with the practice branch's 22023 (the taking screen shows
-- the message and keeps the earlier pick). Managers are not affected, and once the round closes it saves as before.
-- An answer saved before the round started can still be submitted during it: that pick was made without seeing the
-- question in play, and battle tests show their keys anyway, so it tells a player nothing practice couldn't.
-- This is 0098's answer_question with only that guard added; apply after 0098.

create or replace function public.answer_question(aid uuid, qid uuid, selected integer)
 returns table(selected_index smallint, is_correct boolean, correct_index smallint, explanation text)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  a_mode text;
  a_test uuid;
  a_deadline timestamptz;
  a_done timestamptz;
  key_index smallint;
  key_note text;
  existing smallint;
  show_ans boolean;
  allow_pr boolean;
  st text;
begin
  select a.mode, a.test_id, a.deadline, a.submitted_at into a_mode, a_test, a_deadline, a_done
    from public.attempts a where a.id = aid and a.user_id = (select auth.uid());
  if a_test is null then
    raise exception 'That attempt isn''t yours' using errcode = '42501';
  end if;
  if not private.can_take_test(a_test) then
    raise exception 'This test isn''t open to you right now' using errcode = '42501';
  end if;
  if a_done is not null then
    raise exception 'This attempt is already submitted' using errcode = '22023';
  end if;
  if not exists (select 1 from public.questions q where q.id = qid and q.test_id = a_test) then
    raise exception 'That question isn''t in this test' using errcode = 'P0002';
  end if;
  if selected is null or selected < 0
     or selected >= (select cardinality(q.options) from public.questions q where q.id = qid) then
    raise exception 'Pick one of the options' using errcode = '22023';
  end if;

  select t.show_answers, t.allow_practice into show_ans, allow_pr from public.tests t where t.id = a_test;
  st := private.test_state(a_test);

  if a_mode = 'timed' then
    if now() > a_deadline + interval '30 seconds' then
      raise exception 'Time is up' using errcode = '22023';
    end if;
    if st = 'closed' and not private.can_manage_test(a_test)
       and now() > (select c.closes_at from public.tests t join public.classrooms c on c.id = t.classroom_id
                    where t.id = a_test) + interval '30 seconds' then
      raise exception 'This competition has closed' using errcode = '22023';
    end if;
    -- Not stored while the question is live in a battle the caller can see: submitting grades it, and Elo would
    -- pay a right answer at once (0207). Same rule and message as practice below.
    if not private.can_manage_test(a_test) and private.question_in_live_battle(qid) then
      raise exception 'This question is in a live battle. Try it again in a few seconds' using errcode = '22023';
    end if;
    insert into public.attempt_answers as aa (attempt_id, question_id, selected_index)
    values (aid, qid, selected)
    on conflict (attempt_id, question_id) do update set selected_index = excluded.selected_index, answered_at = now();
    return query select selected::smallint, null::boolean, null::smallint, null::text;
    return;
  end if;

  if not allow_pr and st <> 'closed' then
    raise exception 'Practice is off for this test' using errcode = '22023';
  end if;
  if st <> 'closed' and private.practice_locked(a_test, (select auth.uid())) then
    raise exception 'Practice opens once you''ve used your timed attempts' using errcode = '22023';
  end if;
  if private.keys_locked(a_test) then
    raise exception 'Practice opens after the competition closes' using errcode = '22023';
  end if;
  if not private.can_manage_test(a_test) and private.question_in_live_battle(qid) then
    raise exception 'This question is in a live battle. Try it again in a few seconds' using errcode = '22023';
  end if;

  select k.correct_index, k.explanation into key_index, key_note from public.question_keys k where k.question_id = qid;
  insert into public.attempt_answers (attempt_id, question_id, selected_index, is_correct)
  values (aid, qid, selected, selected = key_index)
  on conflict (attempt_id, question_id) do nothing;
  select aa.selected_index into existing from public.attempt_answers aa where aa.attempt_id = aid and aa.question_id = qid;
  return query select existing,
    case when show_ans then existing = key_index end,
    case when show_ans then key_index end,
    case when show_ans then key_note end;
end $function$;
