-- Owner console checks (migrations 0230-0232): analytics_events + record_event, feedback + send_feedback, question
-- reports on question_flags (report_question), and the owner_* functions behind /developer.
-- Only accounts in private.stats_viewers get the owner functions; everyone else gets 42501, including executives.
-- The audit log (admin_log) goes only to viewers who are also executives, as its own policy says (0052).
-- Runs in one transaction and rolls back; raises on the first failure. Throwaway users only, plus a read-only check
-- that every real stats viewer is let in and real trainees are not (picked from the data, no ids in this file).
-- Section 9 expects the live database: it fails when no real stats viewer exists.
begin;

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;

create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.expect(label text, stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL %: expected %, got success', label, state using errcode = 'XX001';
exception when others then
  if sqlstate <> state then raise exception 'FAIL %: expected %, got % (%)', label, state, sqlstate, sqlerrm; end if;
end $$;

create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
end $$;

-- A count the owner may see: hidden (null), zero, or 5 and up. Never 1 to 4.
create function pg_temp.small_ok(v jsonb) returns boolean language sql as $$
  select v is null or jsonb_typeof(v) = 'null' or (v)::text::bigint = 0 or (v)::text::bigint >= 5
$$;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid
$$;

-- u1 a stats viewer (a trainee by role), u2 an executive who runs the room (a stats viewer too from section 7),
-- u3 a trainee member, u4 a banned trainee member.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  (pg_temp.u(1), 'oc.owner@example.com', '{"full_name":"Console Owner"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(2), 'oc.exec@example.com', '{"full_name":"Console Exec"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(3), 'oc.member@example.com', '{"full_name":"Console Member"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(4), 'oc.banned@example.com', '{"full_name":"Console Banned"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'executive' where id = pg_temp.u(2);
insert into private.stats_viewers (user_id) values (pg_temp.u(1));

insert into public.classrooms (id, name, owner_id) values
  ('00000000-0000-4000-8000-0000000002c1', 'Console room', pg_temp.u(2));
insert into public.classroom_members (classroom_id, user_id) values
  ('00000000-0000-4000-8000-0000000002c1', pg_temp.u(3)),
  ('00000000-0000-4000-8000-0000000002c1', pg_temp.u(4));
insert into public.tests (id, classroom_id, title, is_published, created_by) values
  ('00000000-0000-4000-8000-0000000002e1', '00000000-0000-4000-8000-0000000002c1', 'Console test', true, pg_temp.u(2)),
  ('00000000-0000-4000-8000-0000000002e2', '00000000-0000-4000-8000-0000000002c1', 'Console test two', true, pg_temp.u(2));
-- q1 and q3 share a stem once case, spacing and the question mark are ignored. q2 has no explanation.
insert into public.questions (id, test_id, position, prompt, options) values
  ('00000000-0000-4000-8000-0000000002f1', '00000000-0000-4000-8000-0000000002e1', 1, 'Console stem: which bone is longest?', array['Femur', 'Ulna']),
  ('00000000-0000-4000-8000-0000000002f2', '00000000-0000-4000-8000-0000000002e1', 2, 'Console second question', array['Yes', 'No']),
  ('00000000-0000-4000-8000-0000000002f3', '00000000-0000-4000-8000-0000000002e2', 1, '  console STEM:   which bone is longest  ', array['Femur', 'Tibia']);
insert into public.question_keys (question_id, correct_index, explanation) values
  ('00000000-0000-4000-8000-0000000002f1', 0, 'The femur.'),
  ('00000000-0000-4000-8000-0000000002f2', 0, ''),
  ('00000000-0000-4000-8000-0000000002f3', 0, 'The femur.');
-- u3 answered q1 in practice (not q2), so q1 can be reported and q2 can't.
insert into public.attempts (id, test_id, user_id, mode, total, counts, started_at, submitted_at) values
  ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000002e1', pg_temp.u(3), 'practice', 2, true, now(), null);
insert into public.attempt_answers (attempt_id, question_id, selected_index, is_correct) values
  ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000002f1', 1, false);
-- Four more practice runs by u3, so the room has the 5 runs Busiest events needs (one person, so people is hidden).
insert into public.attempts (test_id, user_id, mode, total, counts, started_at, submitted_at)
  select '00000000-0000-4000-8000-0000000002e1', pg_temp.u(3), 'practice', 2, true, now(), null from generate_series(1, 4);
update public.profiles set banned_until = now() + interval '1 day', ban_reason = 'Console test' where id = pg_temp.u(4);

-- 1. Helpers ----------------------------------------------------------------------------------------------------
select pg_temp.check('small_cell keeps 0', private.small_cell(0) = 0);
select pg_temp.check('small_cell hides 1', private.small_cell(1) is null);
select pg_temp.check('small_cell hides 4', private.small_cell(4) is null);
select pg_temp.check('small_cell shows 5', private.small_cell(5) = 5);
select pg_temp.check('small_pair hides both when one is small', private.small_pair(3, 10) = array[null, null]::bigint[]);
select pg_temp.check('small_pair hides both when the other is small', private.small_pair(10, 2) = array[null, null]::bigint[]);
select pg_temp.check('small_pair keeps zero', private.small_pair(0, 7) = array[0, 7]::bigint[]);
select pg_temp.check('small_pair shows big halves', private.small_pair(5, 9) = array[5, 9]::bigint[]);
select pg_temp.check('taxonomy accepts a known code', private.analytics_code_ok('resource_opened', 'file'));
select pg_temp.check('taxonomy refuses a stray code', not private.analytics_code_ok('resource_opened', 'video'));
select pg_temp.check('taxonomy refuses a table-sourced name', not private.analytics_code_ok('practice_started', 'deck'));
select pg_temp.check('taxonomy refuses null', not private.analytics_code_ok('push_enabled', null));

-- 2. Nobody but the owner gets the owner functions ----------------------------------------------------------------
select pg_temp.as_anon();
select pg_temp.expect('anon overview', $q$select public.owner_overview()$q$, '42501');
select pg_temp.expect('anon content', $q$select public.owner_content()$q$, '42501');
select pg_temp.expect('anon system', $q$select public.owner_system()$q$, '42501');
select pg_temp.expect('anon record_event', $q$select public.record_event('resource_opened', 'file')$q$, '42501');
select pg_temp.expect('anon send_feedback', $q$select public.send_feedback('idea', 'hi')$q$, '42501');
select pg_temp.expect('anon report_question',
  $q$select public.report_question('00000000-0000-4000-8000-0000000002f1', 'typo', '')$q$, '42501');

select pg_temp.expect('anon feedback_enabled', $q$select public.feedback_enabled()$q$, '42501');

select pg_temp.as_user(pg_temp.u(3));
select pg_temp.check('members see feedback is on', public.feedback_enabled());
select pg_temp.expect('trainee overview', $q$select public.owner_overview()$q$, '42501');
select pg_temp.expect('trainee growth', $q$select public.owner_growth('7d')$q$, '42501');
select pg_temp.expect('trainee engagement', $q$select public.owner_engagement('7d')$q$, '42501');
select pg_temp.expect('trainee content', $q$select public.owner_content()$q$, '42501');
select pg_temp.expect('trainee feedback', $q$select public.owner_feedback('open')$q$, '42501');
select pg_temp.expect('trainee triage',
  $q$select public.owner_triage_feedback(gen_random_uuid(), 'done', 'low', '')$q$, '42501');
select pg_temp.expect('trainee audit', $q$select public.owner_audit('')$q$, '42501');
select pg_temp.expect('trainee system', $q$select public.owner_system()$q$, '42501');
select pg_temp.expect('trainee reads analytics table', $q$select count(*) from public.analytics_events$q$, '42501');
select pg_temp.expect('trainee writes analytics table',
  $q$insert into public.analytics_events (name, code, user_id) values ('resource_opened', 'file', auth.uid())$q$, '42501');
select pg_temp.expect('trainee reads feedback table', $q$select count(*) from public.feedback$q$, '42501');

select pg_temp.as_user(pg_temp.u(2));
select pg_temp.expect('executive overview', $q$select public.owner_overview()$q$, '42501');
select pg_temp.expect('executive triage',
  $q$select public.owner_triage_feedback(gen_random_uuid(), 'done', 'low', '')$q$, '42501');
select pg_temp.expect('executive audit', $q$select public.owner_audit('')$q$, '42501');

-- 3. record_event: taxonomy, bans, rate limit -----------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.check('valid event stored', public.record_event('resource_opened', 'file'));
select pg_temp.check('vocab round stored', public.record_event('vocab_session_completed', 'deck'));
select pg_temp.check('unknown name refused', not public.record_event('page_view', 'file'));
select pg_temp.check('table-sourced name refused', not public.record_event('practice_started', 'deck'));
select pg_temp.check('unknown code refused', not public.record_event('resource_opened', 'pdf'));
select pg_temp.check('missing code refused', not public.record_event('resource_opened', null));
select pg_temp.check('a code from another list refused', not public.record_event('app_installed', 'desktop'));
-- Question reports are recorded by report_question itself; the browser can't send one.
select pg_temp.check('a client can''t send a question report event', not public.record_event('feedback_submitted', 'question'));
-- A phone-app event without a code is stored as 'other'. Checked inside a block that is undone, so the event counts
-- and the "never recorded" checks further down are unchanged.
do $$
begin
  begin
    perform pg_temp.check('platform event without a code accepted', public.record_event('push_enabled', null));
    perform pg_temp.as_admin();
    raise exception using errcode = 'XX002', message = coalesce((select string_agg(e.code, ',') from public.analytics_events e
      where e.user_id = pg_temp.u(3) and e.name = 'push_enabled'), '<none>');
  exception when sqlstate 'XX002' then
    perform pg_temp.check('stored as other, got ' || sqlerrm, sqlerrm = 'other');
  end;
end $$;
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.check('banned member refused', not public.record_event('resource_opened', 'file'));
select pg_temp.as_admin();
select pg_temp.check('two events stored for u3',
  (select count(*) from public.analytics_events e where e.user_id = pg_temp.u(3)) = 2);
select pg_temp.check('nothing stored for u4',
  (select count(*) from public.analytics_events e where e.user_id = pg_temp.u(4)) = 0);
insert into public.analytics_events (name, code, user_id)
  select 'resource_opened', 'link', pg_temp.u(3) from generate_series(1, 118);
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.check('121st event in an hour refused', not public.record_event('resource_opened', 'file'));
select pg_temp.as_admin();
select pg_temp.check('still 120 for u3',
  (select count(*) from public.analytics_events e where e.user_id = pg_temp.u(3)) = 120);
select pg_temp.expect('table refuses a stray code as admin too',
  $q$insert into public.analytics_events (name, code, user_id) values ('resource_opened', 'video', '00000000-0000-4000-8000-000000000203')$q$,
  '23514');
select pg_temp.expect('table refuses feedback_submitted with another code',
  $q$insert into public.analytics_events (name, code, user_id) values ('feedback_submitted', 'idea', '00000000-0000-4000-8000-000000000203')$q$,
  '23514');
-- Report events don't use up the browser's hourly allowance: with 119 browser events and 10 reports in the hour,
-- the 120th browser event still goes in. Undone at the end of the block.
do $$
begin
  begin
    perform pg_temp.as_admin();
    insert into public.analytics_events (name, code, user_id)
      select 'resource_opened', 'link', pg_temp.u(2) from generate_series(1, 119);
    insert into public.analytics_events (name, code, user_id)
      select 'feedback_submitted', 'question', pg_temp.u(2) from generate_series(1, 10);
    perform pg_temp.as_user(pg_temp.u(2));
    raise exception using errcode = 'XX006', message = public.record_event('resource_opened', 'file')::text;
  exception when sqlstate 'XX006' then
    perform pg_temp.check('reports leave the hourly cap to browser events, got ' || sqlerrm, sqlerrm = 'true');
  end;
end $$;
-- A day's ceiling as well: 300 browser events in 24 hours, however they are spread over the hours. Events from more
-- than a day ago don't count. Undone at the end of the block.
do $$
declare
  r text[] := '{}';
begin
  begin
    perform pg_temp.as_admin();
    insert into public.analytics_events (name, code, user_id, occurred_at)
      select 'resource_opened', 'link', pg_temp.u(2), now() - interval '25 hours' - make_interval(mins => g)
      from generate_series(1, 400) g;
    insert into public.analytics_events (name, code, user_id, occurred_at)
      select 'resource_opened', 'link', pg_temp.u(2), now() - interval '2 hours' - make_interval(mins => g)
      from generate_series(1, 298) g;
    perform pg_temp.as_user(pg_temp.u(2));
    r := r || public.record_event('resource_opened', 'file')::text;
    r := r || public.record_event('vocab_session_completed', 'deck')::text;
    r := r || public.record_event('resource_opened', 'file')::text;
    raise exception using errcode = 'XX007', message = array_to_string(r, ',');
  exception when sqlstate 'XX007' then
    perform pg_temp.check('the 299th and 300th events of a day go in, the 301st doesn''t, got ' || sqlerrm,
      sqlerrm = 'true,true,false');
  end;
end $$;
-- The three phone-app events count once a day per member, whatever the code; other events still go in. One from
-- more than a day ago doesn't stop today's. Undone at the end of the block.
do $$
declare
  r text[] := '{}';
begin
  begin
    perform pg_temp.as_admin();
    insert into public.analytics_events (name, code, user_id, occurred_at)
      values ('push_enabled', 'other', pg_temp.u(2), now() - interval '25 hours');
    perform pg_temp.as_user(pg_temp.u(2));
    r := r || public.record_event('push_enabled', null)::text;
    r := r || public.record_event('push_enabled', null)::text;
    r := r || public.record_event('install_prompt_shown', 'ios')::text;
    r := r || public.record_event('install_prompt_shown', 'android')::text;
    r := r || public.record_event('app_installed', 'ios')::text;
    r := r || public.record_event('app_installed', 'ios')::text;
    r := r || public.record_event('resource_opened', 'file')::text;
    raise exception using errcode = 'XX008', message = array_to_string(r, ',');
  exception when sqlstate 'XX008' then
    perform pg_temp.check('phone-app events once a day each, got ' || sqlerrm,
      sqlerrm = 'true,false,true,false,true,false,true');
  end;
end $$;
select pg_temp.as_admin();

-- 4. send_feedback ------------------------------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.expect('empty feedback', $q$select public.send_feedback('idea', '   ')$q$, '22023');
select pg_temp.expect('only line breaks and tabs', $q$select public.send_feedback('idea', E'\n\t\r\n')$q$, '22023');
select pg_temp.expect('only no-break spaces', $q$select public.send_feedback('idea', E'\u00a0 \u00a0')$q$, '22023');
select pg_temp.expect('bad category', $q$select public.send_feedback('rant', 'hello')$q$, '22023');
select pg_temp.expect('too long', $q$select public.send_feedback('idea', repeat('a', 1001))$q$, '22023');
select public.send_feedback('bug', E'\n  The timer froze on question 4.\t\n', 'ABCDEF1');
select public.send_feedback('idea', 'Dark mode for the calendar', 'not-a-commit');
select pg_temp.as_admin();
select pg_temp.check('feedback trimmed, build lowered',
  exists (select 1 from public.feedback f where f.user_id = pg_temp.u(3)
          and f.body = 'The timer froze on question 4.' and f.build = 'abcdef1' and f.status = 'new' and f.priority = 'normal'));
select pg_temp.check('a junk build is dropped, not refused',
  exists (select 1 from public.feedback f where f.user_id = pg_temp.u(3) and f.body = 'Dark mode for the calendar' and f.build is null));
select pg_temp.expect('the table refuses a whitespace-only body too',
  $q$insert into public.feedback (user_id, category, body) values ('00000000-0000-4000-8000-000000000203', 'idea', E'\n\t')$q$,
  '23514');
insert into public.feedback (user_id, category, body) select pg_temp.u(3), 'other', 'filler ' || g from generate_series(1, 8) g;
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.expect('eleventh in a day', $q$select public.send_feedback('idea', 'one more')$q$, '53400');
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.expect('banned feedback', $q$select public.send_feedback('idea', 'hello')$q$, '42501');

-- 5. report_question (Ask teacher with a reason) --------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.expect('report an unanswered question',
  $q$select public.report_question('00000000-0000-4000-8000-0000000002f2', 'typo', '')$q$, '22023');
select pg_temp.expect('report with a bad reason',
  $q$select public.report_question('00000000-0000-4000-8000-0000000002f1', 'boring', '')$q$, '22023');
select public.report_question('00000000-0000-4000-8000-0000000002f1', 'wrong_answer', 'Key says Ulna');
select pg_temp.as_admin();
select pg_temp.check('report stored with its reason',
  exists (select 1 from public.question_flags f where f.user_id = pg_temp.u(3)
          and f.question_id = '00000000-0000-4000-8000-0000000002f1' and f.reason = 'wrong_answer' and f.status = 'open'));
select pg_temp.check('room owner told it is a report',
  exists (select 1 from public.notifications n where n.user_id = pg_temp.u(2)
          and n.title = 'Console Member reported a question in Console test' and n.body = 'Wrong answer key: Key says Ulna'));
select pg_temp.as_user(pg_temp.u(3));
select public.report_question('00000000-0000-4000-8000-0000000002f1', 'typo', 'Key says Ulna');
select pg_temp.as_admin();
select pg_temp.check('one thread per question, reason updated',
  (select count(*) from public.question_flags f where f.user_id = pg_temp.u(3)) = 1
  and exists (select 1 from public.question_flags f where f.user_id = pg_temp.u(3) and f.reason = 'typo'));
select pg_temp.check('a reason change alone notifies again',
  exists (select 1 from public.notifications n where n.user_id = pg_temp.u(2) and n.body = 'Typo: Key says Ulna'));
-- Ask teacher on an open report adds the note and keeps the report; the trainer hears it as a report.
select pg_temp.as_user(pg_temp.u(3));
select public.flag_question('00000000-0000-4000-8000-0000000002f1', E'Still think it is wrong\n\t');
select pg_temp.expect('ask about an unanswered question',
  $q$select public.flag_question('00000000-0000-4000-8000-0000000002f2', '')$q$, '22023');
select pg_temp.as_admin();
select pg_temp.check('an ask keeps the open report and its note is trimmed',
  exists (select 1 from public.question_flags f where f.user_id = pg_temp.u(3) and f.reason = 'typo'
          and f.note = 'Still think it is wrong' and f.status = 'open'));
select pg_temp.check('room owner told it is still a report',
  exists (select 1 from public.notifications n where n.user_id = pg_temp.u(2)
          and n.title = 'Console Member reported a question in Console test' and n.body = 'Typo: Still think it is wrong'));
-- Once the trainer has answered, asking again is a plain question. The reply doesn't count toward the member's cap.
do $$
declare
  fid uuid;
  before_sends integer;
begin
  perform pg_temp.as_admin();
  select f.id into fid from public.question_flags f where f.user_id = pg_temp.u(3);
  select s.sends into before_sends from private.flag_sends s where s.user_id = pg_temp.u(3);
  perform pg_temp.as_user(pg_temp.u(2));
  perform public.answer_flag(fid, 'Fixed the key');
  perform pg_temp.as_admin();
  perform pg_temp.check('a trainer reply leaves the member''s send count alone',
    (select s.sends from private.flag_sends s where s.user_id = pg_temp.u(3)) = before_sends);
  perform pg_temp.as_user(pg_temp.u(3));
  perform public.flag_question('00000000-0000-4000-8000-0000000002f1', 'Why is it the femur?');
  perform pg_temp.as_admin();
  perform pg_temp.check('an ask on an answered report is a question',
    exists (select 1 from public.question_flags f where f.id = fid and f.reason = 'ask' and f.status = 'open'));
  perform pg_temp.check('reopening keeps the trainer''s last reply and clears the answered stamp',
    exists (select 1 from public.question_flags f where f.id = fid and f.reply = 'Fixed the key'
            and f.answered_at is null and f.answered_by is null));
  perform pg_temp.check('room owner told it is a question',
    exists (select 1 from public.notifications n where n.user_id = pg_temp.u(2)
            and n.title = 'Console Member asked about Console test' and n.body = 'Why is it the femur?'));
end $$;
-- And a report again, which the content checks below look for.
select pg_temp.as_user(pg_temp.u(3));
select public.report_question('00000000-0000-4000-8000-0000000002f1', 'typo', 'Key says Ulna');
select pg_temp.as_admin();
select pg_temp.check('back to a report',
  exists (select 1 from public.question_flags f where f.user_id = pg_temp.u(3) and f.reason = 'typo' and f.status = 'open'));
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.expect('banned report',
  $q$select public.report_question('00000000-0000-4000-8000-0000000002f1', 'typo', '')$q$, '42501');
-- Every report sent is one feedback_submitted event, asks are not: report, report, ask, ask, report = 3. The banned
-- member's refused report left none.
select pg_temp.as_admin();
select pg_temp.check('one usage event per report sent, none per ask',
  (select count(*) from public.analytics_events e
   where e.user_id = pg_temp.u(3) and e.name = 'feedback_submitted' and e.code = 'question') = 3);
select pg_temp.check('a refused report records nothing',
  not exists (select 1 from public.analytics_events e where e.user_id = pg_temp.u(4) and e.name = 'feedback_submitted'));

-- The daily cap counts sends, not threads. Each block below is undone at its end, so later checks see the state above.
-- (a) Threads a trainer touched today (answer_flag sets updated_at) don't count: a member with 45 of them can send.
do $$
begin
  begin
    perform pg_temp.as_admin();
    insert into public.questions (id, test_id, position, prompt, options)
      select ('00000000-0000-4000-8000-0000000003' || lpad(g::text, 2, '0'))::uuid,
             '00000000-0000-4000-8000-0000000002e2', 10 + g, 'Cap filler ' || g, array['A', 'B']
      from generate_series(1, 45) g;
    insert into public.question_flags (test_id, question_id, user_id, note, status, reply, answered_at, answered_by, updated_at)
      select '00000000-0000-4000-8000-0000000002e2', ('00000000-0000-4000-8000-0000000003' || lpad(g::text, 2, '0'))::uuid,
             pg_temp.u(3), 'old', 'answered', 'replied today', now(), pg_temp.u(2), now()
      from generate_series(1, 45) g;
    perform pg_temp.as_user(pg_temp.u(3));
    perform public.flag_question('00000000-0000-4000-8000-0000000002f1', 'Asked after 45 replies today');
    raise exception using errcode = 'XX003', message = 'sent';
  exception when sqlstate 'XX003' then
    perform pg_temp.check('45 trainer replies today don''t block a send', sqlerrm = 'sent');
  end;
end $$;
-- (b) Sending again and again on one thread stops at 40 sends for the day, and the 41st sends nothing to the trainer.
do $$
declare
  ok integer := 0;
  told_before integer;
  told_after integer;
  refusal text := '';
  ask_refusal text := '';
begin
  begin
    perform pg_temp.as_admin();
    select count(*) into told_before from public.notifications n where n.user_id = pg_temp.u(2);
    perform pg_temp.as_user(pg_temp.u(3));
    for i in 1..60 loop
      begin
        perform public.report_question('00000000-0000-4000-8000-0000000002f1',
          case when i % 2 = 0 then 'typo' else 'unclear' end, 'Flood ' || i);
        ok := ok + 1;
      exception when sqlstate '53400' then
        refusal := sqlerrm;
        exit;
      end;
    end loop;
    begin
      perform public.flag_question('00000000-0000-4000-8000-0000000002f1', 'One more');
    exception when sqlstate '53400' then
      ask_refusal := sqlerrm;
    end;
    perform pg_temp.as_admin();
    select count(*) into told_after from public.notifications n where n.user_id = pg_temp.u(2);
    raise exception using errcode = 'XX004', message = concat_ws('|', ok,
      (select s.sends from private.flag_sends s where s.user_id = pg_temp.u(3)), told_after - told_before, refusal, ask_refusal);
  exception when sqlstate 'XX004' then
    -- Sends before this block: report, report, ask, ask, report = 5 today, so 35 more go through.
    perform pg_temp.check('one thread is capped at 40 sends a day, got ' || sqlerrm,
      split_part(sqlerrm, '|', 1) = '35' and split_part(sqlerrm, '|', 2) = '40');
    perform pg_temp.check('the trainer got one notification per accepted send, got ' || sqlerrm,
      split_part(sqlerrm, '|', 3) = '35');
    perform pg_temp.check('a refused report says reports', split_part(sqlerrm, '|', 4) like 'That''s a lot of reports%');
    perform pg_temp.check('a refused ask says questions', split_part(sqlerrm, '|', 5) like 'That''s a lot of questions%');
  end;
end $$;

-- 6. The owner's reads ----------------------------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.check('owner can see stats', public.can_see_dev_stats());
do $$
declare
  o jsonb := public.owner_overview();
  k text;
begin
  foreach k in array array['members', 'new_7d', 'new_30d', 'dau', 'wau', 'wau_prev', 'mau', 'returning_7d', 'first_week_7d'] loop
    perform pg_temp.check('overview has ' || k, o ? k);
    perform pg_temp.check('overview suppresses ' || k, pg_temp.small_ok(o -> k));
  end loop;
  perform pg_temp.check('returning and first-week hide together',
    (jsonb_typeof(o -> 'returning_7d') = 'null') = (jsonb_typeof(o -> 'first_week_7d') = 'null'));
  perform pg_temp.check('members counted', (o ->> 'members')::bigint >= 5);
end $$;

do $$
declare
  g jsonb;
  b jsonb;
begin
  g := public.owner_growth('7d');
  perform pg_temp.check('7d has 7 day buckets', jsonb_array_length(g -> 'buckets') = 7 and g ->> 'step' = 'day');
  g := public.owner_growth('30d');
  perform pg_temp.check('30d has 30 day buckets', jsonb_array_length(g -> 'buckets') = 30);
  for b in select * from jsonb_array_elements(g -> 'buckets') loop
    perform pg_temp.check('growth bucket suppressed', pg_temp.small_ok(b -> 'new') and pg_temp.small_ok(b -> 'active'));
    perform pg_temp.check('no running total per bucket', not (b ? 'members'));
  end loop;
  perform pg_temp.check('growth totals suppressed', pg_temp.small_ok(g -> 'new_total') and pg_temp.small_ok(g -> 'active_total'));
  g := public.owner_growth('90d');
  perform pg_temp.check('90d is weekly', g ->> 'step' = 'week' and jsonb_array_length(g -> 'buckets') between 13 and 14);
  g := public.owner_growth('all');
  perform pg_temp.check('all is weekly', g ->> 'step' = 'week' and jsonb_array_length(g -> 'buckets') >= 1);
end $$;
-- Each bucket is labelled with exactly the days it counts: the first starts on the range's first day (not the Monday
-- before it), the last ends today, and they follow on without gaps or overlaps.
do $$
declare
  r text;
  g jsonb;
begin
  foreach r in array array['7d', '30d', '90d', 'all'] loop
    g := public.owner_growth(r);
    perform pg_temp.check('growth ' || r || ' first bucket starts on the first day',
      g -> 'buckets' -> 0 ->> 'start' = g ->> 'from');
    perform pg_temp.check('growth ' || r || ' last bucket ends today',
      g -> 'buckets' -> (jsonb_array_length(g -> 'buckets') - 1) ->> 'end' = g ->> 'to');
    perform pg_temp.check('growth ' || r || ' buckets follow on',
      not exists (
        select 1 from jsonb_array_elements(g -> 'buckets') with ordinality a(x, n)
        join jsonb_array_elements(g -> 'buckets') with ordinality b(y, m) on m = n + 1
        where (y ->> 'start')::date <> (x ->> 'end')::date + 1));
  end loop;
end $$;
-- New members per bucket add up to new_total: either every bucket is 0 or 5 and up and they sum to the total, or the
-- whole series is withheld. Never one hidden bucket next to shown ones.
do $$
declare
  r text;
  g jsonb;
begin
  foreach r in array array['7d', '30d', '90d', 'all'] loop
    g := public.owner_growth(r);
    if (g ->> 'new_by_bucket')::boolean then
      perform pg_temp.check('growth ' || r || ' shown buckets are 0 or 5 and up',
        (select bool_and((x ->> 'new')::int = 0 or (x ->> 'new')::int >= 5) from jsonb_array_elements(g -> 'buckets') x));
      perform pg_temp.check('growth ' || r || ' buckets add up to the total',
        (select sum((x ->> 'new')::int) from jsonb_array_elements(g -> 'buckets') x) = (g ->> 'new_total')::int);
    else
      perform pg_temp.check('growth ' || r || ' withholds the whole new series',
        (select bool_and(jsonb_typeof(x -> 'new') = 'null') from jsonb_array_elements(g -> 'buckets') x));
    end if;
  end loop;
end $$;
select pg_temp.expect('bad range', $q$select public.owner_growth('1y')$q$, '22023');

do $$
declare
  e jsonb := public.owner_engagement('30d');
  f jsonb;
  ids text[];
begin
  select array_agg(x ->> 'id' order by ord) into ids from jsonb_array_elements(e -> 'features') with ordinality t(x, ord);
  perform pg_temp.check('engagement lists every taxonomy row', ids = array[
    'account_created', 'event_selected', 'practice_started', 'practice_completed', 'exam_completed', 'vocab_round',
    'vocab_match', 'card_reviews', 'resource_opened', 'feedback_submitted', 'question_reported',
    'install_prompt_shown', 'app_installed', 'push_enabled']);
  for f in select * from jsonb_array_elements(e -> 'features') loop
    perform pg_temp.check('feature count suppressed ' || (f ->> 'id'), pg_temp.small_ok(f -> 'count') and pg_temp.small_ok(f -> 'people'));
  end loop;
  perform pg_temp.check('tracked rows say since when',
    (select bool_and(x ->> 'tracked_since' is not null) from jsonb_array_elements(e -> 'features') x
     where x ->> 'id' in ('resource_opened', 'vocab_round')));
  perform pg_temp.check('never-recorded rows say so',
    (select bool_and(jsonb_typeof(x -> 'tracked_since') = 'null') from jsonb_array_elements(e -> 'features') x
     where x ->> 'id' in ('install_prompt_shown', 'app_installed', 'push_enabled')));
  -- u3 stored 120 events: one vocab round and 119 resource opens.
  perform pg_temp.check('resource opens counted (119, well over 5)',
    (select (x ->> 'count')::bigint from jsonb_array_elements(e -> 'features') x where x ->> 'id' = 'resource_opened') >= 119);
  perform pg_temp.check('one person behind them is hidden',
    (select jsonb_typeof(x -> 'people') from jsonb_array_elements(e -> 'features') x where x ->> 'id' = 'resource_opened') = 'null'
    or (select (x ->> 'people')::bigint from jsonb_array_elements(e -> 'features') x where x ->> 'id' = 'resource_opened') >= 5);
  perform pg_temp.check('duels say whether they exist', e -> 'duels' ? 'available');
  perform pg_temp.check('finished battles carry their own people figure',
    not (e -> 'duels' ->> 'available')::boolean or e -> 'duels' ? 'completed_people');
  -- u3's three reports, counted from their events: under 5, so hidden, but recorded (a date, not "never").
  perform pg_temp.check('question reports come from their events',
    (select x ->> 'source' = 'tracked' and x ->> 'tracked_since' is not null and pg_temp.small_ok(x -> 'count')
     from jsonb_array_elements(e -> 'features') x where x ->> 'id' = 'question_reported'));
  perform pg_temp.check('busiest events are a ranking without run counts',
    not exists (select 1 from jsonb_array_elements(e -> 'events') x where x ? 'runs'));
  perform pg_temp.check('busiest events people suppressed',
    (select coalesce(bool_and(pg_temp.small_ok(x -> 'people')), true) from jsonb_array_elements(e -> 'events') x));
  perform pg_temp.check('busiest events carry the room id (rooms can share a name and event)',
    not exists (select 1 from jsonb_array_elements(e -> 'events') x where not (x ? 'id')));
  perform pg_temp.check('the test room with 5 runs is ranked, its one person hidden',
    exists (select 1 from jsonb_array_elements(e -> 'events') x
            where x ->> 'id' = '00000000-0000-4000-8000-0000000002c1' and jsonb_typeof(x -> 'people') = 'null')
    or jsonb_array_length(e -> 'events') = 10);
  perform pg_temp.check('practice funnel suppressed',
    pg_temp.small_ok(e -> 'practice' -> 'started') and pg_temp.small_ok(e -> 'practice' -> 'completed'));
end $$;

-- u1 is a stats viewer with the trainee role: counts and links, never question wording.
do $$
declare
  c jsonb := public.owner_content();
  r jsonb;
  ev jsonb;
begin
  select x into r from jsonb_array_elements(c -> 'reported') x where x ->> 'question_id' = '00000000-0000-4000-8000-0000000002f1';
  perform pg_temp.check('reported question listed', r is not null);
  perform pg_temp.check('reported question reasons', r -> 'reasons' = '["typo"]'::jsonb and (r ->> 'reports')::int = 1);
  perform pg_temp.check('reported question links to its room',
    r ->> 'classroom_id' = '00000000-0000-4000-8000-0000000002c1' and r ->> 'test_id' = '00000000-0000-4000-8000-0000000002e1');
  perform pg_temp.check('a trainee-role viewer gets no wording for reported questions',
    not exists (select 1 from jsonb_array_elements(c -> 'reported') x
                where coalesce(jsonb_typeof(x -> 'prompt'), 'missing') <> 'null'));
  perform pg_temp.check('a trainee-role viewer gets no wording for repeated questions',
    not exists (select 1 from jsonb_array_elements(c -> 'duplicates') x
                where coalesce(jsonb_typeof(x -> 'example'), 'missing') <> 'null'
                   or coalesce(jsonb_typeof(x -> 'stem'), 'missing') <> 'null'));
  -- The top list holds the 20 stems with the most copies, so a two-copy test stem may not make it on a busy database.
  perform pg_temp.check('top duplicates are real duplicates, each with a link',
    jsonb_array_length(c -> 'duplicates') <= 20
    and not exists (select 1 from jsonb_array_elements(c -> 'duplicates') x
                    where (x ->> 'copies')::int < 2 or x ->> 'test_id' is null or x ->> 'classroom_id' is null));
  perform pg_temp.check('duplicate groups counted', (c ->> 'duplicate_groups')::int >= 1);
  select x into ev from jsonb_array_elements(c -> 'per_event') x where x ->> 'id' = '00000000-0000-4000-8000-0000000002c1';
  perform pg_temp.check('per-event content',
    (ev ->> 'questions')::int = 3 and (ev ->> 'tests')::int = 2 and (ev ->> 'missing_explanations')::int = 1
    and (ev ->> 'repeated')::int = 1 and (ev ->> 'open_reports')::int = 1);
  perform pg_temp.check('content totals present', (c ->> 'questions')::int >= 3 and (c ->> 'open_reports')::int >= 1);
end $$;

-- A draft test with 30 copies of one stem (so it tops the repeated list on any database): a trainee-role viewer sees
-- that it exists and where, never its words; an executive viewer (u2, made a viewer here) sees the wording, the same
-- copy it links to. Undone at the end of the block.
do $$
declare
  c jsonb;
  d jsonb;
  r jsonb;
begin
  begin
    perform pg_temp.as_admin();
    insert into private.stats_viewers (user_id) values (pg_temp.u(2));
    insert into public.tests (id, classroom_id, title, is_published, created_by) values
      ('00000000-0000-4000-8000-0000000002e3', '00000000-0000-4000-8000-0000000002c1', 'Console draft', false, pg_temp.u(2));
    insert into public.questions (id, test_id, position, prompt, options)
      select ('00000000-0000-4000-8000-0000000004' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-4000-8000-0000000002e3',
             g, 'Console draft wording: unseen until the draft opens?', array['A', 'B']
      from generate_series(1, 30) g;

    perform pg_temp.as_user(pg_temp.u(1));
    c := public.owner_content();
    select x into d from jsonb_array_elements(c -> 'duplicates') x where x ->> 'test_id' = '00000000-0000-4000-8000-0000000002e3';
    perform pg_temp.check('the draft''s repeated question is listed with its link', (d ->> 'copies')::int = 30);
    perform pg_temp.check('a trainee-role viewer never reads the draft''s wording',
      jsonb_typeof(d -> 'example') = 'null' and jsonb_typeof(d -> 'stem') = 'null'
      and strpos(c::text, 'unseen until the draft opens') = 0);

    perform pg_temp.as_user(pg_temp.u(2));
    c := public.owner_content();
    select x into d from jsonb_array_elements(c -> 'duplicates') x where x ->> 'test_id' = '00000000-0000-4000-8000-0000000002e3';
    perform pg_temp.check('an executive viewer reads the wording',
      d ->> 'example' = 'Console draft wording: unseen until the draft opens?'
      and d ->> 'stem' = 'console draft wording: unseen until the draft opens');
    select x into r from jsonb_array_elements(c -> 'reported') x where x ->> 'question_id' = '00000000-0000-4000-8000-0000000002f1';
    perform pg_temp.check('an executive viewer reads a reported question''s wording',
      r ->> 'prompt' = 'Console stem: which bone is longest?');
    perform pg_temp.check('the test stem shows its first copy as written',
      not exists (select 1 from jsonb_array_elements(c -> 'duplicates') x where x ->> 'stem' = 'console stem: which bone is longest')
      or exists (select 1 from jsonb_array_elements(c -> 'duplicates') x
                 where x ->> 'stem' = 'console stem: which bone is longest'
                   and x ->> 'example' = 'Console stem: which bone is longest?'
                   and x ->> 'test_id' = '00000000-0000-4000-8000-0000000002e1'));
    -- Compared with the questions as the admin: a viewer role can't read every room's questions directly.
    perform pg_temp.as_admin();
    perform pg_temp.check('each duplicate shows one real copy and links to its test',
      not exists (select 1 from jsonb_array_elements(c -> 'duplicates') x
                  where x ->> 'example' is null or x ->> 'test_id' is null or x ->> 'classroom_id' is null
                     or not exists (select 1 from public.questions qu join public.tests t on t.id = qu.test_id
                                    where qu.test_id = (x ->> 'test_id')::uuid and t.classroom_id = (x ->> 'classroom_id')::uuid
                                      and left(qu.prompt, 240) = x ->> 'example')));
    raise exception using errcode = 'XX005', message = 'checked';
  exception when sqlstate 'XX005' then
    perform pg_temp.check('wording block ran to the end', sqlerrm = 'checked');
  end;
end $$;
select pg_temp.as_user(pg_temp.u(1));

-- 7. Feedback triage and the audit row --------------------------------------------------------------------------------
-- The audit log is admin_log (0052), which only executives may read. A stats viewer who isn't an executive (u1) is
-- refused it, whatever the search; the setup's ban of u4 is in the log with its reason, and only an executive viewer
-- sees it. From here u2, an executive, is a stats viewer too and does the audit searches.
select pg_temp.as_admin();
insert into private.stats_viewers (user_id) values (pg_temp.u(2));
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.expect('a viewer who isn''t an executive can''t read the audit log',
  $q$select public.owner_audit('')$q$, '42501');
select pg_temp.expect('nor search it', $q$select public.owner_audit('banned')$q$, '42501');
select pg_temp.expect('nor page through it', $q$select public.owner_audit('', 50, 50)$q$, '42501');
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.check('an executive viewer reads the ban and its reason',
  exists (select 1 from jsonb_array_elements(public.owner_audit('Console Banned')) x
          where x ->> 'action' = 'banned' and x ->> 'detail' = 'Console test'));
select pg_temp.as_user(pg_temp.u(1));
do $$
declare
  q jsonb := public.owner_feedback('open');
  row jsonb;
  fid uuid;
  logs integer;
begin
  select x into row from jsonb_array_elements(q -> 'rows') x where x ->> 'body' = 'The timer froze on question 4.';
  perform pg_temp.check('open queue has the feedback', row is not null and row ->> 'sent_by' = 'Console Member');
  perform pg_temp.check('status counts', (q -> 'counts' ->> 'new')::int >= 10);
  fid := (row ->> 'id')::uuid;

  perform public.owner_triage_feedback(fid, 'planned', 'high', 'Fixing the timer next week');
  perform pg_temp.as_admin();
  perform pg_temp.check('triage saved',
    exists (select 1 from public.feedback f where f.id = fid and f.status = 'planned' and f.priority = 'high'
            and f.resolution = 'Fixing the timer next week' and f.triaged_by = pg_temp.u(1)));
  perform pg_temp.check('triage audited without the feedback text',
    exists (select 1 from public.admin_log l where l.actor_id = pg_temp.u(1) and l.action = 'feedback'
            and l.target_name = 'feedback #' || left(fid::text, 8)
            and l.detail = 'status New to Planned, priority Normal to High, note edited'
            and l.detail not like '%timer%'));
  select count(*) into logs from public.admin_log l where l.actor_id = pg_temp.u(1);
  perform pg_temp.as_user(pg_temp.u(1));
  perform public.owner_triage_feedback(fid, 'planned', 'high', 'Fixing the timer next week');
  perform pg_temp.as_admin();
  perform pg_temp.check('a no-change save writes no log row',
    (select count(*) from public.admin_log l where l.actor_id = pg_temp.u(1)) = logs);
  perform pg_temp.as_user(pg_temp.u(1));
  perform pg_temp.check('planned still counts as open',
    exists (select 1 from jsonb_array_elements(public.owner_feedback('open') -> 'rows') x where (x ->> 'id')::uuid = fid));
  perform pg_temp.check('done filter excludes it',
    not exists (select 1 from jsonb_array_elements(public.owner_feedback('done') -> 'rows') x where (x ->> 'id')::uuid = fid));
  -- A status reads as the chips say it: "Won't fix", never the code wont_fix, so a search for the words finds it.
  perform public.owner_triage_feedback(fid, 'wont_fix', 'high', 'Fixing the timer next week');
  perform pg_temp.as_user(pg_temp.u(2));
  perform pg_temp.check('the log says Won''t fix, not wont_fix',
    exists (select 1 from jsonb_array_elements(public.owner_audit('won''t fix')) x
            where x ->> 'target_name' = 'feedback #' || left(fid::text, 8) and x ->> 'detail' = 'status Planned to Won''t fix'));
  perform pg_temp.as_user(pg_temp.u(1));
  perform public.owner_triage_feedback(fid, 'planned', 'high', 'Fixing the timer next week');
  perform pg_temp.as_user(pg_temp.u(2));
  perform pg_temp.check('audit search finds it',
    exists (select 1 from jsonb_array_elements(public.owner_audit('feedback #' || left(fid::text, 8))) x));
  -- The log reads "<name> triaged feedback #...": the word on screen finds the line, not only the action code.
  perform pg_temp.check('audit search finds the verb on screen',
    exists (select 1 from jsonb_array_elements(public.owner_audit('Triaged')) x
            where x ->> 'target_name' = 'feedback #' || left(fid::text, 8)));
end $$;
select pg_temp.expect('bad triage status',
  $q$select public.owner_triage_feedback((select gen_random_uuid()), 'closed', 'low', '')$q$, '22023');
select pg_temp.expect('triage a missing row',
  $q$select public.owner_triage_feedback(gen_random_uuid(), 'done', 'low', '')$q$, 'P0002');
select pg_temp.expect('bad feedback filter', $q$select public.owner_feedback('closed')$q$, '22023');
do $$
declare
  expected integer;
begin
  perform pg_temp.as_admin();
  select least(count(*), 50) into expected from public.admin_log l
  where strpos(l.action || l.actor_name || l.target_name || l.detail, '%') > 0;
  perform pg_temp.as_user(pg_temp.u(2));
  perform pg_temp.check('a search for a literal percent sign is not a wildcard',
    (select count(*) from jsonb_array_elements(public.owner_audit('%'))) = expected);
end $$;
do $$
declare
  roles integer;
begin
  perform pg_temp.as_admin();
  select count(*) into roles from public.admin_log l where l.action = 'role';
  perform pg_temp.as_user(pg_temp.u(2));
  -- Role lines read "changed the role of"; the stored action is just 'role'.
  perform pg_temp.check('a search for the words on a role line finds role changes',
    roles = 0 or exists (select 1 from jsonb_array_elements(public.owner_audit('changed the role')) x
                         where x ->> 'action' = 'role'));
end $$;

do $$
declare
  s jsonb := public.owner_system();
begin
  perform pg_temp.check('system clock', s ->> 'db_time' is not null);
  perform pg_temp.check('system features', (s -> 'features' ->> 'analytics')::boolean and (s -> 'features' ->> 'feedback')::boolean);
  perform pg_temp.check('analytics stored, without a row count',
    (s -> 'analytics' ->> 'stored')::boolean and s -> 'analytics' ->> 'oldest' is not null and not (s -> 'analytics' ? 'rows'));
end $$;

-- 8. Retention: the daily keep-alive (anon) purges events older than 13 months and nothing newer --------------------
select pg_temp.as_admin();
insert into public.analytics_events (name, code, user_id, occurred_at) values
  ('resource_opened', 'file', pg_temp.u(2), now() - interval '14 months'),
  ('resource_opened', 'file', pg_temp.u(2), now() - interval '12 months');
select pg_temp.as_anon();
select public.keepalive();
select pg_temp.as_admin();
select pg_temp.check('old event purged',
  not exists (select 1 from public.analytics_events e where e.user_id = pg_temp.u(2) and e.occurred_at < now() - interval '13 months'));
select pg_temp.check('12-month event kept',
  exists (select 1 from public.analytics_events e where e.user_id = pg_temp.u(2) and e.occurred_at < now() - interval '11 months'));

-- 9. Real accounts, read-only: every real stats viewer is let in to every owner function (the guard passes; a made-up
-- feedback id is then "gone", P0002, so nothing is written), except the audit log for a viewer who isn't an
-- executive, and real trainees who aren't viewers are refused by every one: the QA trainee (found by its display name
-- while it exists) and the three oldest trainees. Picked from the data, so no ids live in this file. The live database
-- must have at least one of each.
do $$
declare
  who uuid;
  exec boolean;
  stmt text;
  viewers integer := 0;
  refused integer := 0;
  reads text[] := array[
    $q$select public.owner_overview()$q$,
    $q$select public.owner_growth('30d')$q$,
    $q$select public.owner_growth('all')$q$,
    $q$select public.owner_engagement('30d')$q$,
    $q$select public.owner_content()$q$,
    $q$select public.owner_feedback('all')$q$,
    $q$select public.owner_audit('')$q$,
    $q$select public.owner_system()$q$];
begin
  for who in
    select v.user_id from private.stats_viewers v
    where v.user_id::text not like '00000000-0000-4000-8000-%' order by v.user_id
  loop
    select p.role = 'executive' into exec from public.profiles p where p.id = who;
    perform pg_temp.as_user(who);
    perform pg_temp.check('a real viewer can see the stats', public.can_see_dev_stats());
    perform pg_temp.check('a real viewer''s overview has members', public.owner_overview() ? 'members');
    foreach stmt in array reads loop
      if stmt like '%owner_audit%' and not coalesce(exec, false) then
        perform pg_temp.expect('a real viewer who isn''t an executive is refused the audit log', stmt, '42501');
      else
        execute stmt;
      end if;
    end loop;
    perform pg_temp.expect('a real viewer passes the triage guard',
      $q$select public.owner_triage_feedback(gen_random_uuid(), 'done', 'low', '')$q$, 'P0002');
    perform pg_temp.as_admin();
    viewers := viewers + 1;
  end loop;
  perform pg_temp.check('the live database has a real stats viewer', viewers >= 1);

  for who in
    select t.id from (
      (select p.id from public.profiles p where p.full_name = 'Omega QA (test account)')
      union
      (select p.id from public.profiles p
       where p.role = 'trainee' and p.id::text not like '00000000-0000-4000-8000-%'
         and not exists (select 1 from private.stats_viewers v where v.user_id = p.id)
       order by p.created_at limit 3)
    ) t
    where t.id::text not like '00000000-0000-4000-8000-%'
      and not exists (select 1 from private.stats_viewers v where v.user_id = t.id)
  loop
    perform pg_temp.as_user(who);
    perform pg_temp.check('a real trainee can''t see the stats', not public.can_see_dev_stats());
    foreach stmt in array reads loop
      perform pg_temp.expect('a real trainee refused: ' || stmt, stmt, '42501');
    end loop;
    perform pg_temp.expect('a real trainee refused triage',
      $q$select public.owner_triage_feedback(gen_random_uuid(), 'done', 'low', '')$q$, '42501');
    perform pg_temp.as_admin();
    refused := refused + 1;
  end loop;
  perform pg_temp.check('real trainees were checked', refused >= 1);
  perform set_config('owner_console.real', viewers || ' real viewer(s) let in, ' || refused || ' real trainee(s) refused', true);
end $$;

select 'owner_console: all checks passed; ' || current_setting('owner_console.real') as result;
rollback;
