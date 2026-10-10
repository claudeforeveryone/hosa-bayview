-- Task 18 review fix: while a question is live in a battle round, the test RPCs don't hand out its key.
-- Battles only draw from tests that show answers (0095), so without this a player could open a practice run of
-- the same test mid-round and read the key from answer_question, the review sheet, the career list, or a score.
-- "Live" = a started, unclosed round of a playing battle the caller can see. Managers (the room's trainer and
-- executives) can read keys anyway and are not affected. Once the round closes, everything is as before.
-- Each function below is the live definition (after 0066-0076 and 0080-0082) with only the guard added:
-- bans, hidden-answer scores (0067/0074) and the Elo ledger (0080-0082, attempts.counts and its triggers) are
-- untouched.

create function private.question_in_live_battle(qid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.battle_rounds r
    join public.battles b on b.id = r.battle_id
    where r.question_id = qid and r.started_at is not null and r.closed_at is null
      and b.status = 'playing' and not private.battle_stale(b)
      and private.can_see_battle(b.id)
  )
$$;

-- Any answered question of this attempt is live in a battle.
create function private.attempt_in_live_battle(aid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.attempt_answers aa
    join public.battle_rounds r on r.question_id = aa.question_id and r.started_at is not null and r.closed_at is null
    join public.battles b on b.id = r.battle_id
    where aa.attempt_id = aid and b.status = 'playing' and not private.battle_stale(b)
      and private.can_see_battle(b.id)
  )
$$;
revoke all on function private.question_in_live_battle(uuid), private.attempt_in_live_battle(uuid)
  from public, anon, authenticated;

-- Practice answers on a live battle question wait until the round closes (no answer row, so no verdict, key,
-- score or Elo can come from it). Timed answers are stored as before; they never show a verdict, and the score
-- stays hidden while the question is live (score_visible below).
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

-- The review sheet hides the verdict and key of a live battle question (an empty practice run submitted mid-round
-- would otherwise list every key).
create or replace function public.attempt_sheet(aid uuid)
 returns table(question_id uuid, pos integer, prompt text, options text[], selected_index smallint, is_correct boolean, correct_index smallint, explanation text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select q.id, q.position, q.prompt, q.options, aa.selected_index,
    case when v.ok and not h.live and (a.submitted_at is not null or a.mode = 'practice') then aa.is_correct end,
    case when v.ok and not h.live and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.correct_index end,
    case when v.ok and not h.live and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.explanation end
  from public.attempts a
  join public.tests t on t.id = a.test_id
  cross join lateral (
    select (private.can_manage_test(a.test_id)
            or (t.show_answers and not private.keys_locked(a.test_id)
                and not (a.mode = 'practice' and private.test_state(a.test_id) <> 'closed'
                         and private.practice_locked(a.test_id, a.user_id))))
      as ok
  ) v
  join public.questions q on q.test_id = a.test_id
  left join public.attempt_answers aa on aa.attempt_id = a.id and aa.question_id = q.id
  left join public.question_keys k on k.question_id = q.id
  cross join lateral (
    select not private.can_manage_test(a.test_id) and private.question_in_live_battle(q.id) as live
  ) h
  where a.id = aid
    and ((a.user_id = (select auth.uid()) and private.can_take_test(a.test_id))
         or (a.submitted_at is not null and private.can_manage_test(a.test_id)))
  order by q.position, q.id
$function$;

-- Same guard on the taking screen's question list.
create or replace function public.attempt_questions(aid uuid)
 returns table(question_id uuid, pos integer, prompt text, options text[], choice_order smallint[], selected_index smallint, is_correct boolean, correct_index smallint, explanation text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select q.id,
    row_number() over (order by case when t.shuffle_questions then md5(a.id::text || q.id::text) end, q.position, q.id)::integer,
    q.prompt, q.options,
    case when t.shuffle_choices then
      array(select g.i::smallint from generate_series(0, cardinality(q.options) - 1) as g(i)
            order by md5(a.id::text || q.id::text || g.i::text))
    else
      array(select g.i::smallint from generate_series(0, cardinality(q.options) - 1) as g(i) order by g.i)
    end,
    aa.selected_index,
    case when v.ok and not h.live and (a.submitted_at is not null or a.mode = 'practice') then aa.is_correct end,
    case when v.ok and not h.live and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.correct_index end,
    case when v.ok and not h.live and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.explanation end
  from public.attempts a
  join public.tests t on t.id = a.test_id
  cross join lateral (
    select (private.can_manage_test(a.test_id) or (t.show_answers and not private.keys_locked(a.test_id))) as ok
  ) v
  join public.questions q on q.test_id = a.test_id
  left join public.attempt_answers aa on aa.attempt_id = a.id and aa.question_id = q.id
  left join public.question_keys k on k.question_id = q.id
  cross join lateral (
    select not private.can_manage_test(a.test_id) and private.question_in_live_battle(q.id) as live
  ) h
  where a.id = attempt_questions.aid
    and ((a.user_id = (select auth.uid()) and private.can_take_test(a.test_id))
         or (a.submitted_at is not null and private.can_manage_test(a.test_id)))
  order by case when t.shuffle_questions then md5(a.id::text || q.id::text) end, q.position, q.id
$function$;

-- The career list (every answer you've given) hides a live battle question's key.
create or replace function public.career(uid uuid, cid uuid)
 returns table(answered_at timestamp with time zone, test_title text, prompt text, options text[], selected_index smallint, correct_index smallint, is_correct boolean, explanation text)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
#variable_conflict use_column
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  return query
  with rows as (
    select aa.answered_at, t.title, q.prompt, q.options, aa.selected_index, k.correct_index, aa.is_correct,
      k.explanation,
      (private.is_executive() or private.can_manage_classroom(t.classroom_id)
        or (t.show_answers and not private.keys_locked(t.id)
            and (a.submitted_at is not null or a.mode = 'practice')
            and not private.question_in_live_battle(q.id))) as reveal
    from public.attempt_answers aa
    join public.attempts a on a.id = aa.attempt_id
    join public.tests t on t.id = a.test_id
    join public.questions q on q.id = aa.question_id
    join public.question_keys k on k.question_id = q.id
    where a.user_id = uid
      and (a.submitted_at is not null or a.mode = 'practice')
      and aa.is_correct is not null
      and (cid is null or t.classroom_id = cid)
      and (uid = (select auth.uid())
           or private.is_executive()
           or private.can_manage_classroom(t.classroom_id))
  )
  select r.answered_at, r.title, r.prompt, r.options, r.selected_index,
    case when r.reveal then r.correct_index end,
    case when r.reveal then r.is_correct end,
    case when r.reveal then r.explanation end
  from rows r
  order by r.answered_at desc
  limit 500;
end
$function$;

-- A score is a key oracle too (answer one question, submit, read 0 or 1): hidden while any answered question of
-- the attempt is live in a battle. Everything else is the 0074 rule.
create or replace function private.score_visible(aid uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce((
    select (private.can_manage_test(a.test_id)
      or t.show_answers
      or (a.submitted_at is not null
          and (select count(*) from public.attempt_answers aa where aa.attempt_id = a.id) >= a.total
          and not exists (
            select 1 from public.attempts b
            where b.user_id = a.user_id and b.test_id = a.test_id and b.submitted_at is not null
              and (b.submitted_at, b.id) < (a.submitted_at, a.id)
              and (select count(*) from public.attempt_answers bb where bb.attempt_id = b.id) >= b.total)))
      and (private.can_manage_test(a.test_id) or not private.attempt_in_live_battle(a.id))
    from public.attempts a
    join public.tests t on t.id = a.test_id
    where a.id = aid
  ), false)
$function$;
