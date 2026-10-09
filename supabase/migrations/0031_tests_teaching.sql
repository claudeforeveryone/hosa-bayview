-- Tests and teaching (phase 3b). Additive and backward compatible with main:
-- * tests get settings with defaults that match today's behaviour (shuffle on, practice on, keys shown,
--   unlimited attempts). Nothing existing is dropped or renamed.
-- * start_attempt, answer_question and attempt_sheet keep their signatures and return types; their
--   bodies now enforce the settings (practice off, attempt cap, hidden answer keys).
-- * attempt_questions is new: the question order and choice order for a taker, computed on the server.
-- * question_flags + flag_question / answer_flag / test_flags: "Ask teacher" with a trainer reply.
-- * classroom_grades: best score per member per published test, for the Grades tab.

-- 1. Settings ------------------------------------------------------------------

alter table public.tests
  add column shuffle_questions boolean not null default true,
  add column shuffle_choices boolean not null default true,
  add column allow_practice boolean not null default true,
  add column show_answers boolean not null default true,
  add column attempts_allowed integer check (attempts_allowed between 1 and 100);

-- A timed-only test must still be startable: no time limit means practice has to be on.
alter table public.tests
  add constraint tests_timed_or_practice check (time_limit_minutes is not null or allow_practice);

grant update (shuffle_questions, shuffle_choices, allow_practice, show_answers, attempts_allowed)
  on public.tests to authenticated;

-- 2. Starting an attempt: practice switch and attempt cap --------------------------

create or replace function public.start_attempt(tid uuid, mode text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  lim integer;
  cap integer;
  allow_pr boolean;
  qcount integer;
  scored text;
  used bigint;
  open_id uuid;
  stale uuid;
  aid uuid;
begin
  if start_attempt.mode is null or start_attempt.mode not in ('timed', 'practice') then
    raise exception 'Unknown mode' using errcode = '22023';
  end if;
  if not private.can_take_test(tid) then
    raise exception 'You can''t take this test' using errcode = '42501';
  end if;
  select t.time_limit_minutes, t.attempts_allowed, t.allow_practice
    into lim, cap, allow_pr
    from public.tests t where t.id = tid;
  select count(*) into qcount from public.questions q where q.test_id = tid;
  if qcount = 0 then
    raise exception 'This test has no questions yet' using errcode = '22023';
  end if;
  if start_attempt.mode = 'timed' and lim is null then
    raise exception 'This test has no time limit; use practice' using errcode = '22023';
  end if;
  if start_attempt.mode = 'practice' and not allow_pr then
    raise exception 'Practice is off for this test' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('hosa.attempt:' || uid::text || tid::text));

  for stale in
    select a.id from public.attempts a
    where a.user_id = uid and a.test_id = tid and a.submitted_at is null
      and a.deadline < now() - interval '30 seconds'
  loop
    perform private.grade_attempt(stale);
  end loop;

  select a.id into open_id from public.attempts a
    where a.user_id = uid and a.test_id = tid and a.mode = start_attempt.mode and a.submitted_at is null
    order by a.started_at desc limit 1;
  if open_id is not null then
    return open_id;
  end if;

  -- Scored attempts are the test's real mode (timed when it has a time limit, practice otherwise).
  -- Practice runs of a timed test don't use up the attempt cap.
  scored := case when lim is null then 'practice' else 'timed' end;
  if start_attempt.mode = scored and cap is not null then
    select count(*) into used from public.attempts a
      where a.user_id = uid and a.test_id = tid and a.mode = scored;
    if used >= cap then
      raise exception 'You''ve used all your attempts on this test' using errcode = '22023';
    end if;
  end if;

  insert into public.attempts (test_id, user_id, mode, deadline, total)
  values (tid, uid, start_attempt.mode,
          case when start_attempt.mode = 'timed' then now() + make_interval(mins => lim) end,
          qcount)
  returning id into aid;
  return aid;
end
$$;

-- 3. Answering: hide the key from takers when the trainer turned answers off -------

create or replace function public.answer_question(aid uuid, qid uuid, selected integer)
returns table (selected_index smallint, is_correct boolean, correct_index smallint, explanation text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a_mode text;
  a_test uuid;
  a_deadline timestamptz;
  a_done timestamptz;
  key_index smallint;
  key_note text;
  existing smallint;
  show_ans boolean;
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

  if a_mode = 'timed' then
    if now() > a_deadline + interval '30 seconds' then
      raise exception 'Time is up' using errcode = '22023';
    end if;
    insert into public.attempt_answers as aa (attempt_id, question_id, selected_index)
    values (aid, qid, selected)
    on conflict (attempt_id, question_id) do update set selected_index = excluded.selected_index, answered_at = now();
    return query select selected::smallint, null::boolean, null::smallint, null::text;
    return;
  end if;

  select t.show_answers into show_ans from public.tests t where t.id = a_test;
  select k.correct_index, k.explanation into key_index, key_note from public.question_keys k where k.question_id = qid;
  select aa.selected_index into existing from public.attempt_answers aa where aa.attempt_id = aid and aa.question_id = qid;
  if existing is null then
    insert into public.attempt_answers (attempt_id, question_id, selected_index, is_correct)
    values (aid, qid, selected, selected = key_index);
    existing := selected;
  end if;
  -- Right or not is always shown in practice; which option was right only when answers are shown.
  return query select existing, existing = key_index,
    case when show_ans then key_index end,
    case when show_ans then key_note end;
end
$$;

-- 4. Review: keys hidden from takers when answers are off; managers always see them ----------

create or replace function public.attempt_sheet(aid uuid)
returns table (question_id uuid, pos integer, prompt text, options text[], selected_index smallint,
               is_correct boolean, correct_index smallint, explanation text)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.position, q.prompt, q.options, aa.selected_index,
    case when a.submitted_at is not null or a.mode = 'practice' then aa.is_correct end,
    case when (t.show_answers or private.can_manage_test(a.test_id))
          and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.correct_index end,
    case when (t.show_answers or private.can_manage_test(a.test_id))
          and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.explanation end
  from public.attempts a
  join public.tests t on t.id = a.test_id
  join public.questions q on q.test_id = a.test_id
  left join public.attempt_answers aa on aa.attempt_id = a.id and aa.question_id = q.id
  left join public.question_keys k on k.question_id = q.id
  where a.id = aid
    and ((a.user_id = (select auth.uid()) and private.can_take_test(a.test_id))
         or (a.submitted_at is not null and private.can_manage_test(a.test_id)))
  order by q.position, q.id
$$;

-- 5. Attempt questions in the order the server decided ------------------------------------
-- Question order and choice order are seeded by the attempt id, so they stay put on reload and
-- differ between attempts. choice_order[i] is the original option index shown at position i.
-- Keys follow the same rules as attempt_sheet.

create function public.attempt_questions(aid uuid)
returns table (question_id uuid, pos integer, prompt text, options text[], choice_order smallint[],
               selected_index smallint, is_correct boolean, correct_index smallint, explanation text)
language sql stable security definer set search_path = ''
as $$
  select q.id, row_number() over (order by case when t.shuffle_questions then md5(a.id::text || q.id::text) end, q.position, q.id)::integer,
    q.prompt, q.options,
    case when t.shuffle_choices then
      array(select g.i::smallint from generate_series(0, cardinality(q.options) - 1) as g(i)
            order by md5(a.id::text || q.id::text || g.i::text))
    else
      array(select g.i::smallint from generate_series(0, cardinality(q.options) - 1) as g(i) order by g.i)
    end,
    aa.selected_index,
    case when a.submitted_at is not null or a.mode = 'practice' then aa.is_correct end,
    case when (t.show_answers or private.can_manage_test(a.test_id))
          and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.correct_index end,
    case when (t.show_answers or private.can_manage_test(a.test_id))
          and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.explanation end
  from public.attempts a
  join public.tests t on t.id = a.test_id
  join public.questions q on q.test_id = a.test_id
  left join public.attempt_answers aa on aa.attempt_id = a.id and aa.question_id = q.id
  left join public.question_keys k on k.question_id = q.id
  where a.id = attempt_questions.aid
    and ((a.user_id = (select auth.uid()) and private.can_take_test(a.test_id))
         or (a.submitted_at is not null and private.can_manage_test(a.test_id)))
$$;

-- 6. Ask teacher ----------------------------------------------------------------------

create table public.question_flags (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'answered')),
  reply text not null default '' check (char_length(reply) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_by uuid references public.profiles (id) on delete set null,
  unique (question_id, user_id)
);
create index question_flags_test_idx on public.question_flags (test_id, status);
alter table public.question_flags enable row level security;

revoke all on public.question_flags from anon, authenticated;
grant select on public.question_flags to authenticated;

create policy "flags: own or managers read"
  on public.question_flags for select to authenticated
  using (user_id = (select auth.uid()) or private.can_manage_test(test_id));

-- Asks about a question you answered in practice, or in a submitted attempt. One open flag per question.
create function public.flag_question(qid uuid, note text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  tid uuid;
  clean text := btrim(coalesce(flag_question.note, ''));
  fid uuid;
begin
  if char_length(clean) > 500 then
    raise exception 'Keep the note under 500 characters' using errcode = '22023';
  end if;
  select q.test_id into tid from public.questions q where q.id = qid;
  if tid is null then
    raise exception 'That question doesn''t exist' using errcode = 'P0002';
  end if;
  if not private.can_take_test(tid) then
    raise exception 'You can''t take this test' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.attempt_answers aa
    join public.attempts a on a.id = aa.attempt_id
    where a.user_id = uid and aa.question_id = qid and (a.mode = 'practice' or a.submitted_at is not null)
  ) then
    raise exception 'Ask about a question once you have answered it in practice or after you submit' using errcode = '22023';
  end if;
  insert into public.question_flags (test_id, question_id, user_id, note)
  values (tid, qid, uid, clean)
  on conflict (question_id, user_id) do update
    set note = excluded.note, status = 'open', reply = '', answered_at = null, answered_by = null, updated_at = now()
  returning id into fid;
  return fid;
end
$$;

-- Trainers and executives mark a flag answered, with an optional reply the member sees.
create function public.answer_flag(fid uuid, reply text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  tid uuid;
  clean text := btrim(coalesce(answer_flag.reply, ''));
begin
  if char_length(clean) > 1000 then
    raise exception 'Keep the reply under 1000 characters' using errcode = '22023';
  end if;
  select f.test_id into tid from public.question_flags f where f.id = answer_flag.fid;
  if tid is null then
    raise exception 'That question flag doesn''t exist' using errcode = 'P0002';
  end if;
  if not private.can_manage_test(tid) then
    raise exception 'Only the trainer or an executive can reply' using errcode = '42501';
  end if;
  update public.question_flags f
    set status = 'answered', reply = clean, answered_at = now(), answered_by = (select auth.uid()), updated_at = now()
    where f.id = answer_flag.fid;
end
$$;

-- Flags on a test: everything for the people who run it; your own for everyone else.
create function public.test_flags(tid uuid)
returns table (id uuid, question_id uuid, user_id uuid, full_name text, pos integer, prompt text,
               note text, status text, reply text, created_at timestamptz, answered_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select f.id, f.question_id, f.user_id, p.full_name, q.position, q.prompt,
    f.note, f.status, f.reply, f.created_at, f.answered_at
  from public.question_flags f
  join public.questions q on q.id = f.question_id
  join public.profiles p on p.id = f.user_id
  where f.test_id = test_flags.tid
    and (private.can_manage_test(test_flags.tid) or f.user_id = (select auth.uid()))
  order by (f.status = 'answered'), f.created_at
$$;

-- 7. Grades ------------------------------------------------------------------------
-- One row per member per published test. Best attempt: a timed score if there is one, else practice.
-- Members see only their own rows. Members with no finished attempt get a row with no score.

create function public.classroom_grades(cid uuid)
returns table (user_id uuid, full_name text, test_id uuid, test_num integer, test_title text,
               mode text, best_score integer, best_total integer, tries bigint)
language sql stable security definer set search_path = ''
as $$
  with members as (
    select cm.user_id, p.full_name
    from public.classroom_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.classroom_id = classroom_grades.cid
      and private.can_view_classroom(classroom_grades.cid)
      and (private.can_manage_classroom(classroom_grades.cid) or cm.user_id = (select auth.uid()))
  ),
  pub as (
    select t.id, t.num, t.title from public.tests t
    where t.classroom_id = classroom_grades.cid and t.is_published
  ),
  done as (
    select a.user_id, a.test_id, a.mode, a.score, a.total,
      row_number() over (
        partition by a.user_id, a.test_id
        order by (a.mode = 'timed') desc, a.score::numeric / a.total desc, a.submitted_at desc
      ) as n,
      count(*) over (partition by a.user_id, a.test_id) as tries
    from public.attempts a
    join pub on pub.id = a.test_id
    where a.submitted_at is not null and a.total > 0
      and a.user_id in (select m.user_id from members m)
  )
  select m.user_id, m.full_name, pub.id, pub.num, pub.title,
    d.mode, d.score, d.total, coalesce(d.tries, 0)
  from members m
  cross join pub
  left join done d on d.user_id = m.user_id and d.test_id = pub.id and d.n = 1
  order by m.full_name, pub.num
$$;

-- Privileges -----------------------------------------------------------------------

revoke all on function
  public.start_attempt(uuid, text), public.answer_question(uuid, uuid, integer), public.attempt_sheet(uuid),
  public.attempt_questions(uuid), public.flag_question(uuid, text), public.answer_flag(uuid, text),
  public.test_flags(uuid), public.classroom_grades(uuid)
  from public, anon;
grant execute on function
  public.start_attempt(uuid, text), public.answer_question(uuid, uuid, integer), public.attempt_sheet(uuid),
  public.attempt_questions(uuid), public.flag_question(uuid, text), public.answer_flag(uuid, text),
  public.test_flags(uuid), public.classroom_grades(uuid)
  to authenticated;
