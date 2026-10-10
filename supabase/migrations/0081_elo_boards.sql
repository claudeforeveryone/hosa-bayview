-- Task 12: Elo rebuild. Part 2: the attempt paths that feed the ledger, and the boards that read it.
-- Public signatures are unchanged. leaderboard and member_stats become VOLATILE because they now finish
-- expired timed runs before reading (R8). Check: supabase/tests/elo_audit.sql.

-- R3: start_attempt stores whether the attempt can earn points (not a manager, test published now).
create or replace function public.start_attempt(tid uuid, mode text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  lim integer;
  cap integer;
  allow_pr boolean;
  published boolean;
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
  select t.time_limit_minutes, t.attempts_allowed, t.allow_practice, t.is_published
    into lim, cap, allow_pr, published
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

  insert into public.attempts (test_id, user_id, mode, deadline, total, counts)
  values (tid, uid, start_attempt.mode,
          case when start_attempt.mode = 'timed' then now() + make_interval(mins => lim) end,
          qcount, coalesce(published, false) and not manager)
  returning id into aid;
  return aid;
end $$;

-- R7: a practice double tap keeps the first answer (ON CONFLICT DO NOTHING) and returns it, no 23505.
create or replace function public.answer_question(aid uuid, qid uuid, selected integer)
returns table (selected_index smallint, is_correct boolean, correct_index smallint, explanation text)
language plpgsql security definer set search_path = '' as $$
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
  insert into public.attempt_answers (attempt_id, question_id, selected_index, is_correct)
  values (aid, qid, selected, selected = key_index)
  on conflict (attempt_id, question_id) do nothing;
  select aa.selected_index into existing from public.attempt_answers aa where aa.attempt_id = aid and aa.question_id = qid;
  return query select existing,
    case when show_ans then existing = key_index end,
    case when show_ans then key_index end,
    case when show_ans then key_note end;
end $$;

-- Grading locks the attempt first, so a submit and a read-time sweep can't grade the same run at once.
create or replace function private.grade_attempt(aid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.attempts a where a.id = aid and a.submitted_at is null for update;
  if not found then
    return;
  end if;
  update public.attempt_answers aa
    set is_correct = (aa.selected_index = k.correct_index)
    from public.question_keys k
    where aa.attempt_id = aid and k.question_id = aa.question_id;
  update public.attempts a
    set submitted_at = now(),
        score = (select count(*) from public.attempt_answers aa where aa.attempt_id = aid and aa.is_correct),
        total = (select count(*) from public.questions q where q.test_id = a.test_id)
    where a.id = aid and a.submitted_at is null;
end $$;

-- R8: grade every timed run past its deadline (null uid = everyone). Runs another reader holds are skipped;
-- that reader is grading them.
create function private.finalize_expired_attempts(uid uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  stale uuid;
  n integer := 0;
begin
  for stale in
    select a.id from public.attempts a
    where a.mode = 'timed' and a.submitted_at is null and a.deadline < now() - interval '30 seconds'
      and (uid is null or a.user_id = uid)
    order by a.id
    for update skip locked
  loop
    perform private.grade_attempt(stale);
    n := n + 1;
  end loop;
  return n;
end $$;

-- One pass over elo_events per board. total is all time, the rest are inside the period. Banned members are
-- left out. streak: study days in a row ending today or yesterday (R4).
create function private.standings(since timestamptz, cid uuid)
returns table (user_id uuid, full_name text, minutes bigint, reviews bigint, answered bigint, correct bigint,
               total numeric, gain numeric, streak integer)
language sql stable security definer set search_path = '' as $$
  with members as (
    select p.id, p.full_name
    from public.profiles p
    where (p.banned_until is null or p.banned_until <= now())
      and (cid is null
           or exists (select 1 from public.classroom_members cm where cm.classroom_id = cid and cm.user_id = p.id))
  ),
  ev as (
    select e.user_id as uid,
      sum(e.value) as total,
      sum(e.value) filter (where e.earned_at >= since) as gain,
      count(*) filter (where e.source = 'review' and e.earned_at >= since) as reviews,
      count(*) filter (where e.source = 'answer' and e.earned_at >= since) as answered,
      count(*) filter (where e.source = 'correct' and e.earned_at >= since) as correct
    from public.elo_events e
    where cid is null or e.classroom_id = cid
    group by e.user_id
  ),
  mins as (
    select m.user_id as uid, count(*) as n
    from public.activity_minutes m
    where m.minute >= since and (cid is null or m.classroom_id = cid)
    group by m.user_id
  ),
  runs as (
    select s.user_id as uid, s.day, s.day - (row_number() over (partition by s.user_id order by s.day))::integer as grp
    from private.study_days s
  ),
  streaks as (
    select x.uid, max(x.n)::integer as n
    from (
      select r.uid, count(*) as n from runs r
      group by r.uid, r.grp
      having max(r.day) >= private.local_day(now()) - 1
    ) x
    group by x.uid
  )
  select mem.id, mem.full_name,
    coalesce(mins.n, 0)::bigint,
    coalesce(ev.reviews, 0)::bigint,
    coalesce(ev.answered, 0)::bigint,
    coalesce(ev.correct, 0)::bigint,
    coalesce(ev.total, 0),
    coalesce(ev.gain, 0),
    coalesce(st.n, 0)
  from members mem
  left join ev on ev.uid = mem.id
  left join mins on mins.uid = mem.id
  left join streaks st on st.uid = mem.id
$$;

-- Chapter board: elo = 1200 + all-time points, gain = points in the period. Room board (cid set): elo is the
-- room's all-time points with no base, and only work done in that room counts (no sign-ins or bonuses).
create or replace function public.leaderboard(period text, cid uuid)
returns table (user_id uuid, full_name text, minutes bigint, reviews bigint, answered bigint, correct bigint,
               accuracy numeric, elo integer, gain integer, streak integer)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  since timestamptz := private.period_start(period);
begin
  if not private.can_read_board(cid) then
    raise exception 'You can''t see that board' using errcode = '42501';
  end if;
  perform private.finalize_expired_attempts(null);
  return query
  select s.user_id, s.full_name, s.minutes, s.reviews, s.answered, s.correct,
    case when s.answered > 0 then round(s.correct::numeric / s.answered, 4) end,
    ((case when cid is null then 1200 else 0 end) + round(s.total))::integer,
    round(s.gain)::integer,
    s.streak
  from private.standings(since, cid) s;
end $$;

create or replace function public.member_stats(uid uuid)
returns table (user_id uuid, full_name text, role public.app_role, minutes bigint, reviews bigint, answered bigint,
               correct bigint, accuracy numeric, elo integer, streak integer, sign_in_streak integer, rank integer)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not private.is_banned() then
    perform private.finalize_expired_attempts(null);
  end if;
  return query
  with everyone as (
    select s.user_id, s.full_name, s.minutes, s.reviews, s.answered, s.correct, s.streak,
      (1200 + round(s.total))::integer as elo
    from private.standings('-infinity'::timestamptz, null) s
  ),
  ranked as (
    select e.*, rank() over (order by e.elo desc)::integer as place from everyone e
  )
  select r.user_id, r.full_name, p.role, r.minutes, r.reviews, r.answered, r.correct,
    case when r.answered > 0 then round(r.correct::numeric / r.answered, 4) end,
    r.elo, r.streak, private.sign_in_streak(r.user_id), r.place
  from ranked r
  join public.profiles p on p.id = r.user_id
  where r.user_id = uid;
end $$;

-- R6: banned members are off the honor roll too.
create or replace function public.honor_roll()
returns table (user_id uuid, full_name text, streak integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  return query
  select x.id, x.full_name, x.streak
  from (
    select p.id, p.full_name, private.sign_in_streak(p.id) as streak
    from public.profiles p
    where p.banned_until is null or p.banned_until <= now()
  ) x
  where x.streak >= 3
  order by x.streak desc, x.full_name, x.id;
end $$;

-- M2: a heartbeat minute counts only within 10 minutes of a question answered or a counted card review, one a
-- minute (primary key). Presence and the sign-in day are recorded either way. Banned accounts are refused here,
-- since a heartbeat without study no longer reaches the activity_minutes ban trigger.
create or replace function public.heartbeat(cid uuid)
returns void language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := (select auth.uid());
  this_minute timestamptz := date_trunc('minute', now());
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if private.is_banned() then
    raise exception 'Your account is banned' using errcode = '42501';
  end if;
  if cid is not null and not private.can_view_classroom(cid) then
    cid := null;
  end if;

  if exists (select 1 from private.study_pulse sp where sp.user_id = uid and sp.last_at > now() - interval '10 minutes') then
    insert into public.activity_minutes as am (user_id, minute, classroom_id)
    values (uid, this_minute, cid)
    on conflict (user_id, minute)
      do update set classroom_id = coalesce(excluded.classroom_id, am.classroom_id);
  end if;

  insert into public.presence as pr (user_id, classroom_id, last_seen)
  values (uid, cid, now())
  on conflict (user_id)
    do update set classroom_id = excluded.classroom_id, last_seen = excluded.last_seen;

  insert into public.sign_in_days (user_id, day)
  values (uid, private.local_day(now()))
  on conflict (user_id, day) do nothing;
end $$;

-- Lucky rolls. M2: 'test' needs a submitted attempt today with at least 5 answers that earned points (R2/R3);
-- R5: 'flashcards' needs 10 counted card reviews today. Match times never unlock a roll.
create or replace function public.roll_lucky_bonus(p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  today date := private.local_day(now());
  amount integer;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('visit', 'test', 'flashcards') then
    raise exception 'Reason must be visit, test or flashcards' using errcode = '22023';
  end if;
  if private.is_banned() then
    return 0;
  end if;
  if p_reason = 'test' and not exists (
    select 1 from public.attempts a
    where a.user_id = uid and a.submitted_at is not null and private.local_day(a.submitted_at) = today
      and (select count(*) from public.elo_events e
           where e.attempt_id = a.id and e.user_id = uid and e.source = 'answer') >= 5
  ) then
    return 0;
  end if;
  if p_reason = 'flashcards' and (
    select count(*) from public.elo_events e
    where e.user_id = uid and e.source = 'review' and e.earned_at >= private.period_start('today')
  ) < 10 then
    return 0;
  end if;

  insert into public.elo_rolls (user_id, reason, day)
  values (uid, p_reason, today)
  on conflict do nothing;
  if not found then
    return 0;
  end if;

  amount := private.lucky_amount(random(), random(), random());
  if amount > 0 then
    insert into public.elo_bonuses (user_id, amount, reason) values (uid, amount, p_reason);
  end if;
  return amount;
end $$;

revoke execute on function private.finalize_expired_attempts(uuid), private.standings(timestamptz, uuid)
  from public, anon, authenticated;
