-- Phase 3: multiple-choice tests, attempts, server-side grading.
-- Answer keys live in their own table that only people who run the classroom can read.
-- Trainees reach keys only through RPCs: instantly in practice mode, after submitting in timed mode.

create table public.tests (
  id uuid primary key default gen_random_uuid(),
  num integer generated always as identity unique,
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  time_limit_minutes integer check (time_limit_minutes between 1 and 300),
  is_published boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index tests_classroom_idx on public.tests (classroom_id);
alter table public.tests enable row level security;

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests (id) on delete cascade,
  position integer not null,
  prompt text not null check (char_length(prompt) between 1 and 2000),
  options text[] not null check (
    cardinality(options) between 2 and 5
    and array_position(options, null) is null
    and not ('' = any (options))
  ),
  created_at timestamptz not null default now()
);
create index questions_test_idx on public.questions (test_id, position);
alter table public.questions enable row level security;

create table public.question_keys (
  question_id uuid primary key references public.questions (id) on delete cascade,
  correct_index smallint not null check (correct_index between 0 and 4),
  explanation text not null default '' check (char_length(explanation) <= 2000)
);
alter table public.question_keys enable row level security;

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('timed', 'practice')),
  started_at timestamptz not null default now(),
  deadline timestamptz,
  submitted_at timestamptz,
  score integer,
  total integer not null
);
create index attempts_user_idx on public.attempts (user_id, started_at desc);
create index attempts_test_idx on public.attempts (test_id);
alter table public.attempts enable row level security;

create table public.attempt_answers (
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  selected_index smallint not null check (selected_index between 0 and 4),
  is_correct boolean,
  answered_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);
create index attempt_answers_answered_idx on public.attempt_answers (answered_at);
alter table public.attempt_answers enable row level security;

-- Helpers ---------------------------------------------------------------

create function private.test_classroom(tid uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select classroom_id from public.tests where id = tid
$$;

-- Members see published tests; people who run the room see drafts too.
create function private.can_take_test(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tests t
    where t.id = tid
      and (private.can_manage_classroom(t.classroom_id)
           or (t.is_published and private.can_view_classroom(t.classroom_id)))
  )
$$;

create function private.can_manage_test(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.can_manage_classroom(private.test_classroom(tid)), false)
$$;

revoke all on function private.test_classroom(uuid), private.can_take_test(uuid), private.can_manage_test(uuid) from public, anon;
grant execute on function private.test_classroom(uuid), private.can_take_test(uuid), private.can_manage_test(uuid) to authenticated;

-- Privileges and policies ---------------------------------------------------

revoke all on public.tests, public.questions, public.question_keys, public.attempts, public.attempt_answers from anon;
revoke insert, update on public.tests from authenticated;
grant insert (classroom_id, title, description, time_limit_minutes, is_published) on public.tests to authenticated;
grant update (title, description, time_limit_minutes, is_published) on public.tests to authenticated;
-- Questions, keys, attempts and answers are written only through the RPCs below.
revoke insert, update, delete on public.questions, public.question_keys, public.attempts, public.attempt_answers from authenticated;

create policy "tests: read if can take"
  on public.tests for select to authenticated
  using (private.can_manage_classroom(classroom_id) or (is_published and private.can_view_classroom(classroom_id)));

create policy "tests: managers create"
  on public.tests for insert to authenticated
  with check (private.can_manage_classroom(classroom_id));

create policy "tests: managers update"
  on public.tests for update to authenticated
  using (private.can_manage_classroom(classroom_id))
  with check (private.can_manage_classroom(classroom_id));

create policy "tests: managers delete"
  on public.tests for delete to authenticated
  using (private.can_manage_classroom(classroom_id));

create policy "questions: read if can take"
  on public.questions for select to authenticated
  using (private.can_take_test(test_id));

create policy "keys: managers read"
  on public.question_keys for select to authenticated
  using (private.can_manage_test((select q.test_id from public.questions q where q.id = question_id)));

-- Your own attempts; people who run the room see everyone's in it.
create policy "attempts: own or managers read"
  on public.attempts for select to authenticated
  using (user_id = (select auth.uid()) or private.can_manage_test(test_id));

create policy "answers: own or managers read"
  on public.attempt_answers for select to authenticated
  using (exists (
    select 1 from public.attempts a
    where a.id = attempt_id and (a.user_id = (select auth.uid()) or private.can_manage_test(a.test_id))
  ));

-- Question editing (managers) ------------------------------------------------

create function private.check_question(prompt text, options text[], correct integer, explanation text)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if coalesce(char_length(trim(prompt)), 0) = 0 then
    raise exception 'Question text is empty' using errcode = '22023';
  end if;
  if char_length(trim(prompt)) > 2000 then
    raise exception 'Question text is too long' using errcode = '22023';
  end if;
  if options is null or cardinality(options) not between 2 and 5
     or exists (select 1 from unnest(options) o where coalesce(trim(o), '') = '') then
    raise exception 'Needs 2 to 5 options, none empty' using errcode = '22023';
  end if;
  if correct is null or correct < 0 or correct >= cardinality(options) then
    raise exception 'Pick the right option' using errcode = '22023';
  end if;
  if char_length(coalesce(explanation, '')) > 2000 then
    raise exception 'Explanation is too long' using errcode = '22023';
  end if;
end
$$;

-- Add (qid null) or edit one question with its key.
create function public.save_question(tid uuid, qid uuid, prompt text, options text[], correct integer, explanation text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  saved uuid;
  clean text[] := (select array_agg(trim(o) order by n) from unnest(options) with ordinality as t(o, n));
begin
  if not private.can_manage_test(tid) then
    raise exception 'Only the trainer or an executive can edit this test' using errcode = '42501';
  end if;
  perform private.check_question(prompt, options, correct, explanation);
  if qid is null then
    insert into public.questions (test_id, position, prompt, options)
    values (tid, coalesce((select max(q.position) + 1 from public.questions q where q.test_id = tid), 1), trim(prompt), clean)
    returning id into saved;
  else
    update public.questions q
      set prompt = trim(save_question.prompt), options = clean
      where q.id = qid and q.test_id = tid
      returning q.id into saved;
    if saved is null then
      raise exception 'That question is not in this test' using errcode = 'P0002';
    end if;
  end if;
  insert into public.question_keys (question_id, correct_index, explanation)
  values (saved, correct, coalesce(trim(save_question.explanation), ''))
  on conflict (question_id) do update set correct_index = excluded.correct_index, explanation = excluded.explanation;
  return saved;
end
$$;

-- Paste import: [{prompt, options[], correct, explanation}], all or nothing, appended in order.
create function public.import_questions(tid uuid, items jsonb)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  item jsonb;
  n integer := 0;
begin
  if not private.can_manage_test(tid) then
    raise exception 'Only the trainer or an executive can edit this test' using errcode = '42501';
  end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Nothing to import' using errcode = '22023';
  end if;
  if jsonb_array_length(items) > 300 then
    raise exception 'Import at most 300 questions at a time' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item -> 'options') is distinct from 'array' then
      raise exception 'Question % has no options', n + 1 using errcode = '22023';
    end if;
    perform public.save_question(
      tid, null, item ->> 'prompt',
      array(select jsonb_array_elements_text(item -> 'options')),
      (item ->> 'correct')::integer, item ->> 'explanation'
    );
    n := n + 1;
  end loop;
  return n;
end
$$;

create function public.delete_question(qid uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not coalesce(private.can_manage_test((select q.test_id from public.questions q where q.id = qid)), false) then
    raise exception 'Only the trainer or an executive can edit this test' using errcode = '42501';
  end if;
  delete from public.questions q where q.id = qid;
end
$$;

-- Taking a test ---------------------------------------------------------------

-- Grades every answer against the key and closes the attempt. Safe to call twice.
create function private.grade_attempt(aid uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update public.attempt_answers aa
    set is_correct = (aa.selected_index = k.correct_index)
    from public.question_keys k
    where aa.attempt_id = aid and k.question_id = aa.question_id
      and exists (select 1 from public.attempts a where a.id = aid and a.submitted_at is null);
  update public.attempts a
    set submitted_at = now(),
        score = (select count(*) from public.attempt_answers aa where aa.attempt_id = aid and aa.is_correct),
        total = (select count(*) from public.questions q where q.test_id = a.test_id)
    where a.id = aid and a.submitted_at is null;
end
$$;
revoke all on function private.grade_attempt(uuid) from public, anon, authenticated;

-- Starts (or resumes) an attempt. Timed attempts that ran out are closed first.
create function public.start_attempt(tid uuid, mode text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  lim integer;
  qcount integer;
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
  select t.time_limit_minutes into lim from public.tests t where t.id = tid;
  select count(*) into qcount from public.questions q where q.test_id = tid;
  if qcount = 0 then
    raise exception 'This test has no questions yet' using errcode = '22023';
  end if;
  if start_attempt.mode = 'timed' and lim is null then
    raise exception 'This test has no time limit; use practice' using errcode = '22023';
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

  insert into public.attempts (test_id, user_id, mode, deadline, total)
  values (tid, uid, start_attempt.mode,
          case when start_attempt.mode = 'timed' then now() + make_interval(mins => lim) end,
          qcount)
  returning id into aid;
  return aid;
end
$$;

-- Records one answer. Practice: locks it in and returns the key straight away.
-- Timed: can be changed until the deadline (plus 30 s grace); nothing about correctness comes back.
create function public.answer_question(aid uuid, qid uuid, selected integer)
returns table (is_correct boolean, correct_index smallint, explanation text)
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
begin
  select a.mode, a.test_id, a.deadline, a.submitted_at into a_mode, a_test, a_deadline, a_done
    from public.attempts a where a.id = aid and a.user_id = (select auth.uid());
  if a_test is null then
    raise exception 'That attempt isn''t yours' using errcode = '42501';
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
    return query select null::boolean, null::smallint, null::text;
    return;
  end if;

  select k.correct_index, k.explanation into key_index, key_note from public.question_keys k where k.question_id = qid;
  select aa.selected_index into existing from public.attempt_answers aa where aa.attempt_id = aid and aa.question_id = qid;
  if existing is null then
    insert into public.attempt_answers (attempt_id, question_id, selected_index, is_correct)
    values (aid, qid, selected, selected = key_index);
    existing := selected;
  end if;
  return query select existing = key_index, key_index, key_note;
end
$$;

create function public.submit_attempt(aid uuid)
returns table (score integer, total integer)
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.attempts a where a.id = aid and a.user_id = (select auth.uid())) then
    raise exception 'That attempt isn''t yours' using errcode = '42501';
  end if;
  perform private.grade_attempt(aid);
  return query select a.score, a.total from public.attempts a where a.id = aid;
end
$$;

-- An attempt's questions in order with your answers. Keys only where they're allowed:
-- answered practice questions, or anything once the attempt is submitted.
create function public.attempt_sheet(aid uuid)
returns table (question_id uuid, pos integer, prompt text, options text[], selected_index smallint,
               is_correct boolean, correct_index smallint, explanation text)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.position, q.prompt, q.options, aa.selected_index,
    case when a.submitted_at is not null or a.mode = 'practice' then aa.is_correct end,
    case when a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null) then k.correct_index end,
    case when a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null) then k.explanation end
  from public.attempts a
  join public.questions q on q.test_id = a.test_id
  left join public.attempt_answers aa on aa.attempt_id = a.id and aa.question_id = q.id
  left join public.question_keys k on k.question_id = q.id
  where a.id = aid
    and (a.user_id = (select auth.uid()) or (a.submitted_at is not null and private.can_manage_test(a.test_id)))
  order by q.position, q.id
$$;

-- Tests tab: everything you can take here, with your best score.
create function public.classroom_tests(cid uuid)
returns table (id uuid, num integer, title text, description text, time_limit_minutes integer, is_published boolean,
               question_count bigint, my_attempts bigint, my_best integer, my_best_total integer, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.num, t.title, t.description, t.time_limit_minutes, t.is_published,
    (select count(*) from public.questions q where q.test_id = t.id),
    (select count(*) from public.attempts a
       where a.test_id = t.id and a.user_id = (select auth.uid()) and a.submitted_at is not null),
    b.score, b.total,
    t.created_at
  from public.tests t
  left join lateral (
    select a.score, a.total from public.attempts a
    where a.test_id = t.id and a.user_id = (select auth.uid()) and a.submitted_at is not null
    order by a.score::numeric / nullif(a.total, 0) desc nulls last, a.submitted_at desc
    limit 1
  ) b on true
  where t.classroom_id = cid
    and (private.can_manage_classroom(cid) or (t.is_published and private.can_view_classroom(cid)))
  order by t.created_at desc
$$;

-- Results for people who run the room: each member's best attempt.
create function public.test_results(tid uuid)
returns table (user_id uuid, full_name text, attempts bigint, best integer, total integer, last_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name,
    count(*),
    (array_agg(a.score order by a.score::numeric / nullif(a.total, 0) desc nulls last))[1],
    (array_agg(a.total order by a.score::numeric / nullif(a.total, 0) desc nulls last))[1],
    max(a.submitted_at)
  from public.attempts a
  join public.profiles p on p.id = a.user_id
  where a.test_id = tid and a.submitted_at is not null and private.can_manage_test(tid)
  group by p.id, p.full_name
  order by max(a.score::numeric / nullif(a.total, 0)) desc nulls last, p.full_name
$$;

revoke all on function private.check_question(text, text[], integer, text) from public, anon;
grant execute on function private.check_question(text, text[], integer, text) to authenticated;
revoke all on function
  public.save_question(uuid, uuid, text, text[], integer, text), public.import_questions(uuid, jsonb),
  public.delete_question(uuid), public.start_attempt(uuid, text), public.answer_question(uuid, uuid, integer),
  public.submit_attempt(uuid), public.attempt_sheet(uuid), public.classroom_tests(uuid), public.test_results(uuid)
  from public, anon;
grant execute on function
  public.save_question(uuid, uuid, text, text[], integer, text), public.import_questions(uuid, jsonb),
  public.delete_question(uuid), public.start_attempt(uuid, text), public.answer_question(uuid, uuid, integer),
  public.submit_attempt(uuid), public.attempt_sheet(uuid), public.classroom_tests(uuid), public.test_results(uuid)
  to authenticated;
