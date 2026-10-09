-- Resources, topic breakdown and attendance checks (migrations 0018, 0026, 0034).
-- Runs in one transaction and rolls back; raises on the first failure. Throwaway users only.
begin;

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
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

-- b1: trainer of room A. b2: trainer of room B. b3, b4: members of A. b5: executive. b6: member of B.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000000b1', 'ra.trainer.a@example.com', '{"full_name":"Ra Trainer A"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'ra.trainer.b@example.com', '{"full_name":"Ra Trainer B"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b3', 'ra.member.a1@example.com', '{"full_name":"Ra Member A1"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b4', 'ra.member.a2@example.com', '{"full_name":"Ra Member A2"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b5', 'ra.exec@example.com', '{"full_name":"Ra Exec"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b6', 'ra.member.b1@example.com', '{"full_name":"Ra Member B1"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'trainer' where id in ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2');
update public.profiles set role = 'executive' where id = '00000000-0000-4000-8000-0000000000b5';

insert into public.classrooms (id, name, event, join_code, owner_id) values
  ('00000000-0000-4000-8000-0000000000c1', 'Ra Room A', 'Event A', 'RSCAB2', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000c2', 'Ra Room B', 'Event B', 'TQDMK7', '00000000-0000-4000-8000-0000000000b2');
insert into public.classroom_members (classroom_id, user_id) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b3'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b4'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b6');

-- Weeks are Mondays: 2026-01-05, 2026-02-02, 2026-03-02, 2026-03-09 and 2026-03-16 all are.
insert into public.attendance_sessions (id, classroom_id, week_start, submitted_by) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', '2026-01-05', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c2', '2026-01-05', '00000000-0000-4000-8000-0000000000b2');
insert into public.attendance_marks (session_id, user_id, status) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b3', 'present'),
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b4', 'absent'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000b6', 'late');

-- Resources: only managers add or edit.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b3');
select pg_temp.expect('member cannot add a resource',
  $q$insert into public.resources (classroom_id, title, url) values ('00000000-0000-4000-8000-0000000000c1', 'Nope', 'https://example.com')$q$, '42501');
select pg_temp.check('member sees the room link list (empty)', (select count(*) from public.resources) = 0);

select pg_temp.as_user('00000000-0000-4000-8000-0000000000b6');
select pg_temp.expect('other classroom member cannot add a resource to room A',
  $q$insert into public.resources (classroom_id, title, url) values ('00000000-0000-4000-8000-0000000000c1', 'Nope', 'https://example.com')$q$, '42501');

select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.expect('trainer of room B cannot add a resource to room A',
  $q$insert into public.resources (classroom_id, title, url) values ('00000000-0000-4000-8000-0000000000c1', 'Nope', 'https://example.com')$q$, '42501');

select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select pg_temp.expect('javascript: links are rejected',
  $q$insert into public.resources (classroom_id, title, url) values ('00000000-0000-4000-8000-0000000000c1', 'Bad', 'javascript:alert(1)')$q$, '23514');
select pg_temp.expect('links need a host',
  $q$insert into public.resources (classroom_id, title, url) values ('00000000-0000-4000-8000-0000000000c1', 'Bad', 'https://')$q$, '23514');
insert into public.resources (classroom_id, title, url, note) values
  ('00000000-0000-4000-8000-0000000000c1', 'Study guide', 'https://example.com/guide', 'Chapter 3 first');
select pg_temp.check('trainer A adds a link and created_by is set', (select created_by from public.resources where title = 'Study guide') = '00000000-0000-4000-8000-0000000000b1');
update public.resources set title = 'Study guide v2' where title = 'Study guide';
select pg_temp.check('trainer A edits its link', (select count(*) from public.resources where title = 'Study guide v2') = 1);

select pg_temp.as_user('00000000-0000-4000-8000-0000000000b3');
select pg_temp.check('member sees the link but cannot edit it', (select count(*) from public.resources where title = 'Study guide v2') = 1);
update public.resources set title = 'Hacked' where title = 'Study guide v2';
select pg_temp.as_admin();
select pg_temp.check('member edit changed nothing', (select count(*) from public.resources where title = 'Study guide v2') = 1);

-- Topic breakdown: RPC only, managers only.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b3');
select pg_temp.expect('member cannot save the breakdown',
  $q$select public.save_topic_weights('00000000-0000-4000-8000-0000000000c1', '[{"topic":"Anatomy","percent":100}]'::jsonb)$q$, '42501');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.expect('trainer of room B cannot save room A breakdown',
  $q$select public.save_topic_weights('00000000-0000-4000-8000-0000000000c1', '[{"topic":"Anatomy","percent":100}]'::jsonb)$q$, '42501');
select pg_temp.expect('direct write to topic_weights is denied',
  $q$insert into public.topic_weights (classroom_id, topic, percent) values ('00000000-0000-4000-8000-0000000000c1', 'X', 5)$q$, '42501');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select public.save_topic_weights('00000000-0000-4000-8000-0000000000c1',
  '[{"topic":"Anatomy","percent":60},{"topic":"Physiology","percent":40}]'::jsonb);
select pg_temp.check('breakdown saved in order', (select string_agg(topic || ':' || percent, ',' order by position) from public.topic_weights where classroom_id = '00000000-0000-4000-8000-0000000000c1') = 'Anatomy:60,Physiology:40');
select pg_temp.expect('breakdown percent out of range',
  $q$select public.save_topic_weights('00000000-0000-4000-8000-0000000000c1', '[{"topic":"Anatomy","percent":140}]'::jsonb)$q$, '23514');

-- Attendance reads: members see only their own marks.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b3');
select pg_temp.check('member A1 sees exactly one mark, their own', (select count(*) from public.attendance_marks) = 1);
select pg_temp.check('member A1 sees their own mark row', (select count(*) from public.attendance_marks where user_id = '00000000-0000-4000-8000-0000000000b3') = 1);
select pg_temp.check('member A1 cannot see classmate A2 mark', (select count(*) from public.attendance_marks where user_id = '00000000-0000-4000-8000-0000000000b4') = 0);
select pg_temp.check('member A1 cannot see room B marks', (select count(*) from public.attendance_marks where session_id = '00000000-0000-4000-8000-0000000000d2') = 0);
select pg_temp.expect('member cannot mark attendance directly',
  $q$insert into public.attendance_marks (session_id, user_id, status) values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b3', 'late')$q$, '42501');
select pg_temp.expect('member cannot create a session',
  $q$insert into public.attendance_sessions (classroom_id, week_start) values ('00000000-0000-4000-8000-0000000000c1', '2026-02-09')$q$, '42501');
select pg_temp.expect('member cannot edit a session',
  $q$update public.attendance_sessions set updated_at = now() where id = '00000000-0000-4000-8000-0000000000d1'$q$, '42501');
select pg_temp.expect('member cannot take attendance through the RPC',
  $q$select public.save_attendance('00000000-0000-4000-8000-0000000000d1', '{"00000000-0000-4000-8000-0000000000b3":"late"}'::jsonb)$q$, '42501');

-- Trainers: their own room only.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.check('trainer B cannot read room A marks', (select count(*) from public.attendance_marks where session_id = '00000000-0000-4000-8000-0000000000d1') = 0);
select pg_temp.check('trainer B reads room B marks', (select count(*) from public.attendance_marks where session_id = '00000000-0000-4000-8000-0000000000d2') = 1);
select pg_temp.expect('trainer B cannot take attendance for room A',
  $q$select public.save_attendance('00000000-0000-4000-8000-0000000000d1', '{"00000000-0000-4000-8000-0000000000b3":"late"}'::jsonb)$q$, '42501');

select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select pg_temp.check('trainer A reads all of room A marks', (select count(*) from public.attendance_marks where session_id = '00000000-0000-4000-8000-0000000000d1') = 2);
select pg_temp.check('trainer A cannot read room B marks', (select count(*) from public.attendance_marks where session_id = '00000000-0000-4000-8000-0000000000d2') = 0);
select public.save_attendance('00000000-0000-4000-8000-0000000000d1', jsonb_build_object(
  '00000000-0000-4000-8000-0000000000b3', 'late',
  '00000000-0000-4000-8000-0000000000b6', 'present'));
select pg_temp.check('save_attendance marks the member and skips the outsider',
  (select string_agg(user_id::text || '=' || status, ',' order by user_id::text) from public.attendance_marks where session_id = '00000000-0000-4000-8000-0000000000d1')
  = '00000000-0000-4000-8000-0000000000b3=late');
select pg_temp.expect('unknown status is rejected',
  $q$select public.save_attendance('00000000-0000-4000-8000-0000000000d1', '{"00000000-0000-4000-8000-0000000000b3":"tardy"}'::jsonb)$q$, '22023');
-- Constraint checks run as the owner: authenticated has no direct insert on sessions (RPC only).
select pg_temp.as_admin();
insert into public.attendance_sessions (classroom_id, week_start) values ('00000000-0000-4000-8000-0000000000c1', '2026-02-02');
select pg_temp.expect('one session per week per classroom',
  $q$insert into public.attendance_sessions (classroom_id, week_start) values ('00000000-0000-4000-8000-0000000000c1', '2026-02-02')$q$, '23505');
select pg_temp.expect('a session must start on a Monday',
  $q$insert into public.attendance_sessions (classroom_id, week_start) values ('00000000-0000-4000-8000-0000000000c1', '2026-02-03')$q$, '23514');

-- Executive reads everything.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b5');
select pg_temp.check('exec reads every mark across classrooms', (select count(*) from public.attendance_marks) = 2);
select pg_temp.check('exec reads room B marks', (select count(*) from public.attendance_marks where session_id = '00000000-0000-4000-8000-0000000000d2') = 1);

-- Review fixes (migration 0026). ---------------------------------------------

-- A former member keeps the marks they earned when the trainer saves again.
select pg_temp.as_admin();
insert into public.attendance_marks (session_id, user_id, status) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b4', 'absent');
delete from public.classroom_members
  where classroom_id = '00000000-0000-4000-8000-0000000000c1' and user_id = '00000000-0000-4000-8000-0000000000b4';
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select public.save_attendance('00000000-0000-4000-8000-0000000000d1', '{"00000000-0000-4000-8000-0000000000b3":"excused"}'::jsonb);
select pg_temp.as_admin();
select pg_temp.check('former member keeps their mark',
  (select status from public.attendance_marks where session_id = '00000000-0000-4000-8000-0000000000d1' and user_id = '00000000-0000-4000-8000-0000000000b4') = 'absent');
select pg_temp.check('current member mark is replaced',
  (select status from public.attendance_marks where session_id = '00000000-0000-4000-8000-0000000000d1' and user_id = '00000000-0000-4000-8000-0000000000b3') = 'excused');

-- Null inputs are refused and change nothing.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select pg_temp.expect('null attendance list refused',
  $q$select public.save_attendance('00000000-0000-4000-8000-0000000000d1', null::jsonb)$q$, '22023');
select pg_temp.expect('null breakdown refused',
  $q$select public.save_topic_weights('00000000-0000-4000-8000-0000000000c1', null::jsonb)$q$, '22023');
select pg_temp.as_admin();
select pg_temp.check('marks untouched by null save',
  (select count(*) from public.attendance_marks where session_id = '00000000-0000-4000-8000-0000000000d1') = 2);
select pg_temp.check('breakdown untouched by null save',
  (select count(*) from public.topic_weights where classroom_id = '00000000-0000-4000-8000-0000000000c1') = 2);

-- Session notes are trainer-only.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b3');
select pg_temp.expect('member cannot read the note column',
  $q$select note from public.attendance_sessions$q$, '42501');
select pg_temp.check('member can still list session weeks',
  (select count(*) from public.attendance_sessions where classroom_id = '00000000-0000-4000-8000-0000000000c1') = 2);
select pg_temp.check('member gets no notes from the RPC',
  (select count(*) from public.attendance_session_notes('00000000-0000-4000-8000-0000000000c1')) = 0);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.check('trainer B gets no notes for room A',
  (select count(*) from public.attendance_session_notes('00000000-0000-4000-8000-0000000000c1')) = 0);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select pg_temp.check('trainer A gets notes for room A',
  (select count(*) from public.attendance_session_notes('00000000-0000-4000-8000-0000000000c1')) = 2);

-- save_attendance_week: submit and edit one week in one call. ----------------------

select pg_temp.as_user('00000000-0000-4000-8000-0000000000b3');
select pg_temp.expect('member cannot submit a week',
  $q$select public.save_attendance_week('00000000-0000-4000-8000-0000000000c1', date '2026-03-02', 'Nope', '{}'::jsonb)$q$, '42501');
select pg_temp.check('member sees the room''s weeks, with trainer names',
  (select count(*) from public.attendance_weeks('00000000-0000-4000-8000-0000000000c1')) = 2);
select pg_temp.check('member sees who submitted a week',
  (select submitted_by_name from public.attendance_weeks('00000000-0000-4000-8000-0000000000c1') where week_start = date '2026-01-05') = 'Ra Trainer A');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.expect('trainer B cannot submit a week in room A',
  $q$select public.save_attendance_week('00000000-0000-4000-8000-0000000000c1', date '2026-03-02', 'Nope', '{}'::jsonb)$q$, '42501');
select pg_temp.check('trainer B sees no weeks for room A',
  (select count(*) from public.attendance_weeks('00000000-0000-4000-8000-0000000000c1')) = 0);
select pg_temp.as_admin();
select pg_temp.check('refused submits create no week',
  (select count(*) from public.attendance_sessions where week_start = date '2026-03-02') = 0);

select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select pg_temp.expect('a week must start on a Monday',
  $q$select public.save_attendance_week('00000000-0000-4000-8000-0000000000c1', date '2026-03-03', 'x', '{}'::jsonb)$q$, '22023');
select public.save_attendance_week('00000000-0000-4000-8000-0000000000c1', date '2026-03-02', 'Lab day',
  '{"00000000-0000-4000-8000-0000000000b3":"present","00000000-0000-4000-8000-0000000000b4":"late"}'::jsonb);
select pg_temp.as_admin();
select pg_temp.check('submit creates one week with its note, submitter and no edit stamp',
  (select note || '|' || submitted_by::text || '|' || coalesce(updated_at::text, 'none')
     from public.attendance_sessions where classroom_id = '00000000-0000-4000-8000-0000000000c1' and week_start = date '2026-03-02')
  = 'Lab day|00000000-0000-4000-8000-0000000000b1|none');
select pg_temp.check('former member is skipped on a new week',
  (select count(*) from public.attendance_marks m join public.attendance_sessions s on s.id = m.session_id
    where s.week_start = date '2026-03-02') = 1);

select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select public.save_attendance_week('00000000-0000-4000-8000-0000000000c1', date '2026-03-02', 'Lab day, edited',
  '{"00000000-0000-4000-8000-0000000000b3":"excused"}'::jsonb);
select pg_temp.as_admin();
select pg_temp.check('edit keeps one week and replaces the note',
  (select count(*) || '|' || max(note) from public.attendance_sessions where classroom_id = '00000000-0000-4000-8000-0000000000c1' and week_start = date '2026-03-02')
  = '1|Lab day, edited');
select pg_temp.check('edit stamps updated_at and updated_by, submitter unchanged',
  (select (updated_at is not null) and (updated_by = '00000000-0000-4000-8000-0000000000b1') and (submitted_by = '00000000-0000-4000-8000-0000000000b1')
     from public.attendance_sessions where classroom_id = '00000000-0000-4000-8000-0000000000c1' and week_start = date '2026-03-02'));
select pg_temp.check('edit replaces the marks',
  (select string_agg(user_id::text || '=' || status, ',') from public.attendance_marks m join public.attendance_sessions s on s.id = m.session_id
    where s.week_start = date '2026-03-02') = '00000000-0000-4000-8000-0000000000b3=excused');

-- An executive can edit any room's week; the edit is stamped with their id.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b5');
select public.save_attendance_week('00000000-0000-4000-8000-0000000000c1', date '2026-03-02', 'Exec fix',
  '{"00000000-0000-4000-8000-0000000000b3":"late"}'::jsonb);
select pg_temp.as_admin();
select pg_temp.check('exec edit is stamped with the exec',
  (select updated_by from public.attendance_sessions where classroom_id = '00000000-0000-4000-8000-0000000000c1' and week_start = date '2026-03-02')
  = '00000000-0000-4000-8000-0000000000b5');

-- A trainer cannot stamp the audit columns directly.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select pg_temp.expect('trainer cannot write updated_by directly',
  $q$update public.attendance_sessions set updated_by = '00000000-0000-4000-8000-0000000000b1' where week_start = date '2026-03-02'$q$, '42501');
select pg_temp.expect('trainer cannot write marks directly',
  $q$update public.attendance_marks set status = 'present'$q$, '42501');

-- Clearing the marks for a week is allowed; the week itself stays submitted.
select public.save_attendance_week('00000000-0000-4000-8000-0000000000c1', date '2026-03-02', 'Lab day, cleared', '{}'::jsonb);
select pg_temp.as_admin();
select pg_temp.check('empty map clears the current members marks for that week',
  (select count(*) from public.attendance_marks m join public.attendance_sessions s on s.id = m.session_id
    where s.week_start = date '2026-03-02') = 0);

select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select pg_temp.expect('note over 500 characters refused',
  $q$select public.save_attendance_week('00000000-0000-4000-8000-0000000000c1', date '2026-03-09', repeat('x', 501), '{}'::jsonb)$q$, '22023');
select pg_temp.expect('bad status refused and the week insert rolls back',
  $q$select public.save_attendance_week('00000000-0000-4000-8000-0000000000c1', date '2026-03-16', 'x', '{"00000000-0000-4000-8000-0000000000b3":"tardy"}'::jsonb)$q$, '22023');
select pg_temp.as_admin();
select pg_temp.check('refused weeks leave no session behind',
  (select count(*) from public.attendance_sessions where week_start in (date '2026-03-09', date '2026-03-16')) = 0);

-- Executives see every room's weeks.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b5');
select pg_temp.check('exec sees room B weeks', (select count(*) from public.attendance_weeks('00000000-0000-4000-8000-0000000000c2')) = 1);

select 'resources and attendance: all checks passed' as result;
rollback;
