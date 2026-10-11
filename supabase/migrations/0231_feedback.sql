-- Feedback and question reports (Omega 0231). Two student entry points, built on what already exists:
--
--   Send feedback        Settings > Account (also linked from More). A bug, an idea or something else, in a few words.
--                        New table public.feedback, read and triaged only by the site owner through the 0232
--                        functions (status, priority, a resolution note). Members can't read the table back.
--   Report this question  Practice feedback and test review. Not a new table: it extends Ask teacher (question_flags,
--                        0031/0099). A flag now has a reason: 'ask' (the old Ask teacher, the default for every
--                        existing row), or 'wrong_answer', 'unclear', 'typo', 'other'. The event's trainer gets the
--                        same notification and replies in the same list, so a wrong key gets fixed by the person who
--                        can fix it; the owner sees the open reports under Content health.
--
-- Both write paths are definer functions with their own checks and per-member limits. Banned members are refused.

-- 1. General feedback ---------------------------------------------------------------------------------------------

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('bug', 'idea', 'other')),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  -- The deployed commit the member was on (from the server, not the browser), so a bug report names its build.
  build text check (build is null or build ~ '^[0-9a-f]{7,40}$'),
  status text not null default 'new' check (status in ('new', 'planned', 'done', 'wont_fix')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  resolution text not null default '' check (char_length(resolution) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  triaged_at timestamptz,
  triaged_by uuid references public.profiles (id) on delete set null
);
create index if not exists feedback_status_created_idx on public.feedback (status, created_at desc);
create index if not exists feedback_user_created_idx on public.feedback (user_id, created_at desc);
create index if not exists feedback_triaged_by_idx on public.feedback (triaged_by);
alter table public.feedback enable row level security;
-- No policies and no grants: send_feedback writes it, the owner functions in 0232 read and triage it.
revoke all on public.feedback from public, anon, authenticated;

-- Ten a day per member is plenty for honest use and stops a stuck button from flooding the queue.
create or replace function public.send_feedback(p_category text, p_body text, p_build text default null)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean text := btrim(coalesce(p_body, ''));
  b text := nullif(lower(btrim(coalesce(p_build, ''))), '');
  sent integer;
  fid uuid;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if private.is_banned() then
    raise exception 'Your account can''t send feedback right now' using errcode = '42501';
  end if;
  if p_category is null or p_category not in ('bug', 'idea', 'other') then
    raise exception 'Pick bug, idea or something else' using errcode = '22023';
  end if;
  if clean = '' then
    raise exception 'Write a few words first' using errcode = '22023';
  end if;
  if char_length(clean) > 1000 then
    raise exception 'Keep it under 1000 characters' using errcode = '22023';
  end if;
  if b is not null and b !~ '^[0-9a-f]{7,40}$' then
    b := null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('feedback:' || uid::text, 0));
  select count(*) into sent from public.feedback f
  where f.user_id = uid and f.created_at > now() - interval '1 day';
  if sent >= 10 then
    raise exception 'That''s plenty for today. Try again tomorrow' using errcode = '53400';
  end if;
  insert into public.feedback (user_id, category, body, build)
  values (uid, p_category, clean, b)
  returning id into fid;
  return fid;
end
$$;
revoke all on function public.send_feedback(text, text, text) from public, anon;
grant execute on function public.send_feedback(text, text, text) to authenticated;

-- 2. Question reports: a reason on Ask teacher ----------------------------------------------------------------------

alter table public.question_flags
  add column if not exists reason text not null default 'ask'
    check (reason in ('ask', 'wrong_answer', 'unclear', 'typo', 'other'));
create index if not exists question_flags_open_reason_idx on public.question_flags (reason) where status = 'open';

-- What the trainer's notification calls each reason.
create or replace function private.flag_reason_label(reason text)
returns text
language sql immutable set search_path = ''
as $$
  select case reason
    when 'wrong_answer' then 'Wrong answer key'
    when 'unclear' then 'Unclear wording'
    when 'typo' then 'Typo'
    when 'other' then 'Something else'
    else 'Question'
  end
$$;
revoke all on function private.flag_reason_label(text) from public, anon, authenticated;

-- Ask teacher with a reason. Same rules as flag_question (0031): only a question the member answered in practice or
-- in a submitted attempt, one thread per member per question (sending again reopens it with the new reason and note).
-- flag_question keeps working for older pages and leaves the reason as it was.
create or replace function public.report_question(qid uuid, reason text, note text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  tid uuid;
  clean text := btrim(coalesce(report_question.note, ''));
  why text := report_question.reason;
  sent integer;
  fid uuid;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if private.is_banned() then
    raise exception 'Your account can''t send reports right now' using errcode = '42501';
  end if;
  if why is null or why not in ('ask', 'wrong_answer', 'unclear', 'typo', 'other') then
    raise exception 'Pick what is wrong with the question' using errcode = '22023';
  end if;
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
    raise exception 'Report a question once you have answered it in practice or after you submit' using errcode = '22023';
  end if;
  -- Each send notifies the trainer, so cap how many threads one member can open or reopen in a day.
  perform pg_advisory_xact_lock(hashtextextended('flags:' || uid::text, 0));
  select count(*) into sent from public.question_flags f
  where f.user_id = uid and f.updated_at > now() - interval '1 day';
  if sent >= 40 then
    raise exception 'That''s a lot of reports for one day. Try again tomorrow' using errcode = '53400';
  end if;
  insert into public.question_flags (test_id, question_id, user_id, note, reason)
  values (tid, qid, uid, clean, why)
  on conflict (question_id, user_id) do update
    set note = excluded.note, reason = excluded.reason, status = 'open', reply = '',
        answered_at = null, answered_by = null, updated_at = now()
  returning id into fid;
  return fid;
end
$$;
revoke all on function public.report_question(uuid, text, text) from public, anon;
grant execute on function public.report_question(uuid, text, text) to authenticated;

-- The trainer's notification (0099) now says which it is: a question for the teacher, or a report with its reason.
-- It also fires when only the reason changes on an open thread.
create or replace function private.flag_ask_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  cid uuid;
  who text;
  what text;
  qtext text;
begin
  -- New thread, or sent again (note or reason changed, or reopened after a reply).
  if tg_op = 'UPDATE' and not (
    new.status = 'open' and (
      old.status = 'answered' or old.note is distinct from new.note or old.reason is distinct from new.reason
    )
  ) then
    return new;
  end if;
  select t.classroom_id, t.title into cid, what from public.tests t where t.id = new.test_id;
  select coalesce(nullif(p.full_name, ''), 'A member') into who from public.profiles p where p.id = new.user_id;
  select 'Q' || q.position || ': ' || left(q.prompt, 140) into qtext from public.questions q where q.id = new.question_id;
  if new.reason = 'ask' then
    perform private.notify(
      private.flag_recipients(new.test_id, new.user_id), 'question',
      who || ' asked about ' || coalesce(what, 'a test'),
      coalesce(nullif(new.note, ''), qtext),
      '/c/' || cid || '/tests/' || new.test_id);
  else
    perform private.notify(
      private.flag_recipients(new.test_id, new.user_id), 'question',
      who || ' reported a question in ' || coalesce(what, 'a test'),
      private.flag_reason_label(new.reason) || ': ' || coalesce(nullif(new.note, ''), qtext),
      '/c/' || cid || '/tests/' || new.test_id);
  end if;
  return new;
end
$$;
revoke all on function private.flag_ask_notify() from public, anon, authenticated;
