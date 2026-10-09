-- Mock competitions (BLC practice runs). A competition is a classroom of kind 'competition' that every member can
-- see without a join code. Executives run them: one test per event, a start and an end time.
--   upcoming: listed, tests hidden.  open: timed runs only, answers hidden.  closed: no new runs; answers,
--   review and the results board open up, and practice opens for anyone who wants another go.

alter table public.classrooms
  add column kind text not null default 'class' check (kind in ('class', 'competition')),
  add column opens_at timestamptz,
  add column closes_at timestamptz,
  add constraint classrooms_window check (opens_at is null or closes_at is null or closes_at > opens_at);
grant select (kind, opens_at, closes_at) on public.classrooms to authenticated;
grant insert (kind, opens_at, closes_at) on public.classrooms to authenticated;
grant update (opens_at, closes_at) on public.classrooms to authenticated;

-- Only executives make competitions.
create or replace function private.guard_competition()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.kind = 'competition' and not private.is_executive() then
    raise exception 'Only executives can run mock competitions' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind then
    raise exception 'A classroom can''t change kind' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger classrooms_guard_competition before insert or update on public.classrooms
  for each row execute function private.guard_competition();

-- 'class', 'upcoming', 'open' or 'closed'.
create or replace function private.room_state(cid uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when c.kind <> 'competition' then 'class'
    when c.opens_at is not null and now() < c.opens_at then 'upcoming'
    when c.closes_at is not null and now() >= c.closes_at then 'closed'
    else 'open'
  end
  from public.classrooms c where c.id = cid
$$;

create or replace function private.test_state(tid uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select private.room_state(t.classroom_id) from public.tests t where t.id = tid
$$;
grant execute on function private.room_state(uuid), private.test_state(uuid) to authenticated;

-- Everyone can see a competition room.
create or replace function private.can_view_classroom(cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_executive() or private.owns_classroom(cid) or private.is_member(cid)
    or ((select auth.uid()) is not null
        and exists (select 1 from public.classrooms c where c.id = cid and c.kind = 'competition'))
$$;

-- Competition tests stay hidden from members until the competition opens.
create or replace function private.can_take_test(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tests t
    where t.id = tid
      and (private.can_manage_classroom(t.classroom_id)
           or (t.is_published and private.can_view_classroom(t.classroom_id)
               and private.room_state(t.classroom_id) <> 'upcoming'))
  )
$$;

-- Keys stay hidden from members while a competition is upcoming or open.
create or replace function private.keys_locked(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.test_state(tid) in ('upcoming', 'open') and not private.can_manage_test(tid)
$$;
grant execute on function private.keys_locked(uuid) to authenticated;

-- The whole chapter hears about competitions and their tests.
create or replace function private.audience(cid uuid)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.profiles p
  where (p.banned_until is null or p.banned_until <= now())
    and (cid is null
         or exists (select 1 from public.classrooms c where c.id = cid and c.kind = 'competition')
         or p.id = (select c.owner_id from public.classrooms c where c.id = cid)
         or exists (select 1 from public.classroom_members m where m.classroom_id = cid and m.user_id = p.id))
$$;

create or replace function private.competition_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind = 'competition' then
    perform private.notify(array(select private.audience(null)), 'competition', 'Mock competition: ' || new.name,
      case when new.opens_at is null then 'Open now'
           else 'Opens ' || to_char(new.opens_at at time zone 'America/Toronto', 'Dy Mon DD, HH12:MI AM') end,
      '/blc/' || new.id);
  end if;
  return new;
end
$$;
create trigger classrooms_competition_notify after insert on public.classrooms
  for each row execute function private.competition_notify();

-- New competition tests: one timed run each, shuffled.
create or replace function private.competition_test_defaults()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.room_state(new.classroom_id) <> 'class' then
    new.attempts_allowed := coalesce(new.attempts_allowed, 1);
    new.time_limit_minutes := coalesce(new.time_limit_minutes, 60);
  end if;
  return new;
end
$$;
create trigger tests_competition_defaults before insert on public.tests
  for each row execute function private.competition_test_defaults();

-- Sidebar and Home list classes only; competitions have their own page.
create or replace function public.my_classrooms()
returns table (id uuid, num integer, name text, event text, description text, owner_name text, member_count bigint,
               is_owner boolean, can_manage boolean, join_code text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.num, c.name, c.event, c.description,
    o.full_name,
    (select count(*) from public.classroom_members m where m.classroom_id = c.id),
    c.owner_id = (select auth.uid()),
    private.can_manage_classroom(c.id),
    case when private.can_manage_classroom(c.id) then c.join_code end,
    c.created_at
  from public.classrooms c
  left join public.profiles o on o.id = c.owner_id
  where c.kind = 'class'
    and (c.owner_id = (select auth.uid()) or private.is_member(c.id) or private.is_executive())
  order by c.created_at desc
$$;

-- Joining is for classes; competitions are open to everyone already.
create or replace function private.refuse_competition_join()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.classrooms c where c.id = new.classroom_id and c.kind = 'competition') then
    raise exception 'Competitions don''t need a join code' using errcode = '22023';
  end if;
  return new;
end
$$;
create trigger classroom_members_no_competition before insert on public.classroom_members
  for each row execute function private.refuse_competition_join();

-- Every competition, newest first, with your progress.
create or replace function public.competitions()
returns table (id uuid, name text, event text, description text, opens_at timestamptz, closes_at timestamptz,
               state text, test_count bigint, my_done bigint, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, c.event, c.description, c.opens_at, c.closes_at, private.room_state(c.id),
    (select count(*) from public.tests t
       where t.classroom_id = c.id and (t.is_published or private.can_manage_classroom(c.id))),
    (select count(distinct a.test_id) from public.attempts a join public.tests t on t.id = a.test_id
       where t.classroom_id = c.id and a.user_id = (select auth.uid()) and a.mode = 'timed'
         and a.submitted_at is not null),
    c.created_at
  from public.classrooms c
  where c.kind = 'competition' and (select auth.uid()) is not null
  order by coalesce(c.opens_at, c.created_at) desc
$$;
revoke all on function public.competitions() from public, anon;
grant execute on function public.competitions() to authenticated;

-- Results once a competition closes (executives any time): each competitor's first timed run per test.
create or replace function public.competition_results(cid uuid)
returns table (test_id uuid, test_title text, user_id uuid, full_name text, score integer, total integer,
               place bigint, submitted_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with firsts as (
    select distinct on (a.test_id, a.user_id) a.test_id, a.user_id, a.score, a.total, a.submitted_at
    from public.attempts a join public.tests t on t.id = a.test_id
    where t.classroom_id = cid and a.mode = 'timed' and a.submitted_at is not null
    order by a.test_id, a.user_id, a.started_at
  )
  select f.test_id, t.title, f.user_id, p.full_name, f.score, f.total,
    rank() over (partition by f.test_id order by f.score::numeric / nullif(f.total, 0) desc nulls last),
    f.submitted_at
  from firsts f
  join public.tests t on t.id = f.test_id
  join public.profiles p on p.id = f.user_id
  where (private.room_state(cid) = 'closed' or private.can_manage_classroom(cid))
    and exists (select 1 from public.classrooms c where c.id = cid and c.kind = 'competition')
  order by t.title, 7, p.full_name
$$;
revoke all on function public.competition_results(uuid) from public, anon;
grant execute on function public.competition_results(uuid) to authenticated;

-- Attempts: no practice while open, nothing new once closed (practice reopens after close).
create or replace function public.start_attempt(tid uuid, mode text)
returns uuid
language plpgsql security definer set search_path = ''
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
  st text;
  manager boolean;
begin
  if start_attempt.mode is null or start_attempt.mode not in ('timed', 'practice') then
    raise exception 'Unknown mode' using errcode = '22023';
  end if;
  if not private.can_take_test(tid) then
    raise exception 'You can''t take this test' using errcode = '42501';
  end if;
  st := private.test_state(tid);
  manager := private.can_manage_test(tid);
  if not manager and st = 'closed' and start_attempt.mode = 'timed' then
    raise exception 'This competition has closed' using errcode = '22023';
  end if;
  if not manager and st = 'open' and start_attempt.mode = 'practice' then
    raise exception 'Practice opens after the competition closes' using errcode = '22023';
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
  if start_attempt.mode = 'practice' and not allow_pr and st <> 'closed' then
    raise exception 'Practice is off for this test' using errcode = '22023';
  end if;
  if start_attempt.mode = 'practice' and st <> 'closed' and private.practice_locked(tid, uid) then
    raise exception 'Practice opens once you''ve used your timed attempts' using errcode = '22023';
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

  scored := case when lim is null then 'practice' else 'timed' end;
  if start_attempt.mode = scored and cap is not null and st <> 'closed' then
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

create or replace function public.answer_question(aid uuid, qid uuid, selected integer)
returns table (selected_index smallint, is_correct boolean, correct_index smallint, explanation text)
language plpgsql security definer set search_path = ''
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

  select k.correct_index, k.explanation into key_index, key_note from public.question_keys k where k.question_id = qid;
  select aa.selected_index into existing from public.attempt_answers aa where aa.attempt_id = aid and aa.question_id = qid;
  if existing is null then
    insert into public.attempt_answers (attempt_id, question_id, selected_index, is_correct)
    values (aid, qid, selected, selected = key_index);
    existing := selected;
  end if;
  return query select existing,
    case when show_ans then existing = key_index end,
    case when show_ans then key_index end,
    case when show_ans then key_note end;
end
$$;

-- Review: keys follow show_answers, the capped-practice rule, and stay hidden while a competition runs.
create or replace function public.attempt_sheet(aid uuid)
returns table (question_id uuid, pos integer, prompt text, options text[], selected_index smallint,
               is_correct boolean, correct_index smallint, explanation text)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.position, q.prompt, q.options, aa.selected_index,
    case when v.ok and (a.submitted_at is not null or a.mode = 'practice') then aa.is_correct end,
    case when v.ok and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.correct_index end,
    case when v.ok and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
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
  where a.id = aid
    and ((a.user_id = (select auth.uid()) and private.can_take_test(a.test_id))
         or (a.submitted_at is not null and private.can_manage_test(a.test_id)))
  order by q.position, q.id
$$;

create or replace function public.attempt_questions(aid uuid)
returns table (question_id uuid, pos integer, prompt text, options text[], choice_order smallint[],
               selected_index smallint, is_correct boolean, correct_index smallint, explanation text)
language sql stable security definer set search_path = ''
as $$
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
    case when v.ok and (a.submitted_at is not null or a.mode = 'practice') then aa.is_correct end,
    case when v.ok and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.correct_index end,
    case when v.ok and (a.submitted_at is not null or (a.mode = 'practice' and aa.selected_index is not null))
         then k.explanation end
  from public.attempts a
  join public.tests t on t.id = a.test_id
  cross join lateral (
    select (private.can_manage_test(a.test_id) or (t.show_answers and not private.keys_locked(a.test_id))) as ok
  ) v
  join public.questions q on q.test_id = a.test_id
  left join public.attempt_answers aa on aa.attempt_id = a.id and aa.question_id = q.id
  left join public.question_keys k on k.question_id = q.id
  where a.id = attempt_questions.aid
    and ((a.user_id = (select auth.uid()) and private.can_take_test(a.test_id))
         or (a.submitted_at is not null and private.can_manage_test(a.test_id)))
  order by case when t.shuffle_questions then md5(a.id::text || q.id::text) end, q.position, q.id
$$;

create or replace function public.career(uid uuid, cid uuid)
returns table (answered_at timestamptz, test_title text, prompt text, options text[], selected_index smallint,
               correct_index smallint, is_correct boolean, explanation text)
language plpgsql stable security definer set search_path = ''
as $$
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
            and (a.submitted_at is not null or a.mode = 'practice'))) as reveal
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
$$;

-- Competition tests don't each ping the chapter; the competition's own notice covers them.
create or replace function private.test_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.is_published and (tg_op = 'INSERT' or not old.is_published)
     and private.room_state(new.classroom_id) = 'class' then
    perform private.notify(
      array(select private.audience(new.classroom_id)), 'test', 'New test: ' || new.title,
      coalesce((select c.name from public.classrooms c where c.id = new.classroom_id), ''),
      '/c/' || new.classroom_id || '/tests/' || new.id);
  end if;
  return new;
end
$$;
