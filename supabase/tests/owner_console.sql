-- Owner console checks (migrations 0230-0232): analytics_events + record_event, feedback + send_feedback, question
-- reports on question_flags (report_question), and the owner_* functions behind /developer.
-- Only accounts in private.stats_viewers get the owner functions; everyone else gets 42501, including executives.
-- Runs in one transaction and rolls back; raises on the first failure. Throwaway users only, plus a read-only check
-- that a real stats viewer is let in and a real trainee is not (picked from the data, no ids in this file).
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

-- u1 the site owner (stats viewer, a trainee by role), u2 an executive who runs the room, u3 a trainee member,
-- u4 a banned trainee member.
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

select pg_temp.as_user(pg_temp.u(3));
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
select pg_temp.check('missing code refused', not public.record_event('push_enabled', null));
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

-- 4. send_feedback ------------------------------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.expect('empty feedback', $q$select public.send_feedback('idea', '   ')$q$, '22023');
select pg_temp.expect('bad category', $q$select public.send_feedback('rant', 'hello')$q$, '22023');
select pg_temp.expect('too long', $q$select public.send_feedback('idea', repeat('a', 1001))$q$, '22023');
select public.send_feedback('bug', '  The timer froze on question 4.  ', 'ABCDEF1');
select public.send_feedback('idea', 'Dark mode for the calendar', 'not-a-commit');
select pg_temp.as_admin();
select pg_temp.check('feedback trimmed, build lowered',
  exists (select 1 from public.feedback f where f.user_id = pg_temp.u(3)
          and f.body = 'The timer froze on question 4.' and f.build = 'abcdef1' and f.status = 'new' and f.priority = 'normal'));
select pg_temp.check('a junk build is dropped, not refused',
  exists (select 1 from public.feedback f where f.user_id = pg_temp.u(3) and f.body = 'Dark mode for the calendar' and f.build is null));
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
-- The old Ask teacher call still works and leaves the reason alone.
select pg_temp.as_user(pg_temp.u(3));
select public.flag_question('00000000-0000-4000-8000-0000000002f1', 'Still think it is wrong');
select pg_temp.as_admin();
select pg_temp.check('flag_question keeps the reason',
  exists (select 1 from public.question_flags f where f.user_id = pg_temp.u(3) and f.reason = 'typo'
          and f.note = 'Still think it is wrong'));
select pg_temp.as_user(pg_temp.u(4));
select pg_temp.expect('banned report',
  $q$select public.report_question('00000000-0000-4000-8000-0000000002f1', 'typo', '')$q$, '42501');

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
  perform pg_temp.check('practice funnel suppressed',
    pg_temp.small_ok(e -> 'practice' -> 'started') and pg_temp.small_ok(e -> 'practice' -> 'completed'));
end $$;

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
  -- The top list holds the 20 stems with the most copies, so a two-copy test stem may not make it on a busy database.
  perform pg_temp.check('top duplicates are real duplicates',
    jsonb_array_length(c -> 'duplicates') <= 20
    and not exists (select 1 from jsonb_array_elements(c -> 'duplicates') x where (x ->> 'copies')::int < 2));
  perform pg_temp.check('duplicate groups counted', (c ->> 'duplicate_groups')::int >= 1);
  select x into ev from jsonb_array_elements(c -> 'per_event') x where x ->> 'id' = '00000000-0000-4000-8000-0000000002c1';
  perform pg_temp.check('per-event content',
    (ev ->> 'questions')::int = 3 and (ev ->> 'tests')::int = 2 and (ev ->> 'missing_explanations')::int = 1
    and (ev ->> 'repeated')::int = 1 and (ev ->> 'open_reports')::int = 1);
  perform pg_temp.check('content totals present', (c ->> 'questions')::int >= 3 and (c ->> 'open_reports')::int >= 1);
end $$;

-- 7. Feedback triage and the audit row --------------------------------------------------------------------------------
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
            and l.detail = 'status new to planned, priority normal to high, note edited'
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
  perform pg_temp.check('audit search finds it',
    exists (select 1 from jsonb_array_elements(public.owner_audit('feedback #' || left(fid::text, 8))) x));
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
  perform pg_temp.as_user(pg_temp.u(1));
  perform pg_temp.check('a search for a literal percent sign is not a wildcard',
    (select count(*) from jsonb_array_elements(public.owner_audit('%'))) = expected);
end $$;

do $$
declare
  s jsonb := public.owner_system();
begin
  perform pg_temp.check('system clock', s ->> 'db_time' is not null);
  perform pg_temp.check('system features', (s -> 'features' ->> 'analytics')::boolean and (s -> 'features' ->> 'feedback')::boolean);
  perform pg_temp.check('analytics retention figures', (s -> 'analytics' ->> 'rows')::int >= 120);
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

-- 9. Real accounts, read-only: a real stats viewer is let in, a real trainee is not ----------------------------------
do $$
declare
  viewer uuid;
  trainee uuid;
begin
  select v.user_id into viewer from private.stats_viewers v
  where v.user_id::text not like '00000000-0000-4000-8000-%' order by v.user_id limit 1;
  select p.id into trainee from public.profiles p
  where p.role = 'trainee' and p.id::text not like '00000000-0000-4000-8000-%'
    and not exists (select 1 from private.stats_viewers v where v.user_id = p.id)
  order by p.created_at limit 1;
  if viewer is not null then
    perform pg_temp.as_user(viewer);
    perform public.owner_overview();
    perform public.owner_system();
    perform pg_temp.as_admin();
  end if;
  if trainee is not null then
    perform pg_temp.as_user(trainee);
    perform pg_temp.expect('real trainee refused', $q$select public.owner_overview()$q$, '42501');
    perform pg_temp.expect('real trainee refused triage',
      $q$select public.owner_triage_feedback(gen_random_uuid(), 'done', 'low', '')$q$, '42501');
    perform pg_temp.as_admin();
  end if;
end $$;

select 'owner_console: all checks passed' as result;
rollback;
