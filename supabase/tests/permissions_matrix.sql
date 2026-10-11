-- Permission matrix (Task 10). Who can read and write what, for every role, in one table.
-- One transaction, rolled back. Collects every failing cell, then raises once with the full list.
--
-- Columns, in this order:
--   E  executive               TO trainer who owns room 1     TN trainer in room 1 who doesn't own it (owns room 2)
--   M  member of room 1        N  signed-in non-member        B  banned member of room 1
--   BT banned trainer (owns room 3)                           A  anon (no session)
-- Y = the read returns the row / the write succeeds and touches a row / the call runs. N = empty or zero
-- rows, or a permission error (42501, which RLS violations use too). Any other error fails the cell, so a
-- typo or a NOT NULL slip can't pass as "denied".
-- Every cell runs in a subtransaction that is always rolled back, so one cell never changes the next.
begin;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.r(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8100-' || lpad(to_hex(n), 12, '0'))::uuid
$$;

-- Fixtures ---------------------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  (pg_temp.u(1), 'pm.exec@example.com', '{"full_name":"PM Exec"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(2), 'pm.owner@example.com', '{"full_name":"PM Owner"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(3), 'pm.trainer@example.com', '{"full_name":"PM Trainer"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(4), 'pm.member@example.com', '{"full_name":"PM Member"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(5), 'pm.outsider@example.com', '{"full_name":"PM Outsider"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(6), 'pm.banned@example.com', '{"full_name":"PM Banned"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(7), 'pm.bannedtrainer@example.com', '{"full_name":"PM Banned Trainer"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'executive' where id = pg_temp.u(1);
update public.profiles set role = 'trainer' where id in (pg_temp.u(2), pg_temp.u(3), pg_temp.u(7));
insert into public.classrooms (id, name, owner_id) values
  (pg_temp.r(1), 'PM Room', pg_temp.u(2)),
  (pg_temp.r(2), 'PM Other Room', pg_temp.u(3)),
  (pg_temp.r(3), 'PM Banned Room', pg_temp.u(7));
insert into public.classrooms (id, name, owner_id, kind) values (pg_temp.r(4), 'PM Competition', pg_temp.u(2), 'competition');
insert into public.classroom_members (classroom_id, user_id) values
  (pg_temp.r(1), pg_temp.u(3)), (pg_temp.r(1), pg_temp.u(4)), (pg_temp.r(1), pg_temp.u(6));

-- Content, written as the schema owner.
insert into public.announcements (id, classroom_id, author_id, title) values
  (pg_temp.r(10), null, pg_temp.u(1), 'PM chapter news'),
  (pg_temp.r(11), pg_temp.r(1), pg_temp.u(2), 'PM room news');
insert into public.events (id, classroom_id, title, starts_at, created_by) values
  (pg_temp.r(12), null, 'PM chapter event', now() + interval '1 day', pg_temp.u(1)),
  (pg_temp.r(13), pg_temp.r(1), 'PM room event', now() + interval '1 day', pg_temp.u(2));
insert into public.tests (id, classroom_id, title, is_published) values
  (pg_temp.r(20), pg_temp.r(1), 'PM posted', true),
  (pg_temp.r(21), pg_temp.r(1), 'PM draft', false);
insert into public.questions (id, test_id, position, prompt, options) values
  (pg_temp.r(22), pg_temp.r(20), 1, 'PM posted Q', array['a', 'b']),
  (pg_temp.r(23), pg_temp.r(21), 1, 'PM draft Q', array['a', 'b']);
insert into public.question_keys (question_id, correct_index) values (pg_temp.r(22), 1), (pg_temp.r(23), 0);
insert into public.attempts (id, test_id, user_id, mode, submitted_at, score, total) values
  (pg_temp.r(24), pg_temp.r(20), pg_temp.u(4), 'practice', now(), 1, 1);
insert into public.attempt_answers (attempt_id, question_id, selected_index, is_correct) values
  (pg_temp.r(24), pg_temp.r(22), 1, true);
insert into public.decks (id, owner_id, classroom_id, title, is_shared) values
  (pg_temp.r(30), pg_temp.u(2), pg_temp.r(1), 'PM shared deck', true),
  (pg_temp.r(31), pg_temp.u(4), null, 'PM private deck', false);
insert into public.cards (id, deck_id, position, term, definition) values
  (pg_temp.r(32), pg_temp.r(30), 1, 'Shared term', 'Def'),
  (pg_temp.r(33), pg_temp.r(31), 1, 'Private term', 'Def');
insert into public.materials (id, classroom_id, title, url) values
  (pg_temp.r(40), null, 'PM chapter link', 'https://example.com/c'),
  (pg_temp.r(41), pg_temp.r(1), 'PM room link', 'https://example.com/r');
insert into storage.objects (bucket_id, name) values
  ('materials', 'chapter/pm-handbook.pdf'),
  ('materials', pg_temp.r(1)::text || '/pm-notes.pdf'),
  ('avatars', pg_temp.u(4)::text || '/88888888-8888-4888-8888-888888888888.webp');
insert into public.skills (id, classroom_id, name) values (pg_temp.r(50), pg_temp.r(1), 'PM skill');
insert into public.resources (id, classroom_id, title, url) values (pg_temp.r(51), pg_temp.r(1), 'PM resource', 'https://example.com/x');
insert into public.attendance_sessions (id, classroom_id, week_start) values (pg_temp.r(60), pg_temp.r(1), '2026-01-05');
insert into public.attendance_marks (session_id, user_id, status) values (pg_temp.r(60), pg_temp.u(4), 'present');
insert into public.admin_log (actor_name, action, detail) values ('System', 'passcode', 'PM log row');
insert into public.notifications (user_id, kind, title, link) values (pg_temp.u(4), 'announcement', 'PM ping', '/');
insert into public.chapter_meetings (meets_on, title, kind) values ('2031-01-02', 'PM meeting', 'training')
  on conflict (meets_on) do nothing;

-- The member has a grade, so the member_details cells can tell a full row from a picture-only one (0206).
update public.profiles set grade = 11 where id = pg_temp.u(4);

-- Bans last, through the moderation flag, so the fixtures above aren't refused.
select set_config('hosa.moderation', 'on', true);
update public.profiles set banned_until = now() + interval '1 day', ban_reason = 'PM test'
  where id in (pg_temp.u(6), pg_temp.u(7));
select set_config('hosa.moderation', 'off', true);

-- Checks: (label, kind, statement, expected E TO TN M N B BT A). {me} is the caller's id.
create temp table pm_checks (n serial, label text, kind text, stmt text, expected text);
insert into pm_checks (label, kind, stmt, expected) values
-- Classrooms
('classrooms: room 1 row', 'read', 'select 1 from public.classrooms where id = ''{r1}''', 'YYYYNNNN'),
('classroom_members: room 1 roster rows', 'read', 'select 1 from public.classroom_members where classroom_id = ''{r1}''', 'YYYYNNNN'),
-- Announcements
('announcements: chapter row', 'read', 'select 1 from public.announcements where id = ''{r10}''', 'YYYYYNNN'),
('announcements: room row', 'read', 'select 1 from public.announcements where id = ''{r11}''', 'YYYYNNNN'),
('announcements: post chapter', 'write', 'insert into public.announcements (classroom_id, title) values (null, ''x'')', 'YNNNNNNN'),
('announcements: post room 1', 'write', 'insert into public.announcements (classroom_id, title) values (''{r1}'', ''x'')', 'YYNNNNNN'),
('announcements: edit room 1 post', 'write', 'update public.announcements set title = ''y'' where id = ''{r11}''', 'YYNNNNNN'),
('announcements: post room 3', 'write', 'insert into public.announcements (classroom_id, title) values (''{r3}'', ''x'')', 'YNNNNNNN'),
-- Events
('events: chapter row', 'read', 'select 1 from public.events where id = ''{r12}''', 'YYYYYNNN'),
('events: room row', 'read', 'select 1 from public.events where id = ''{r13}''', 'YYYYNNNN'),
('events: add chapter', 'write', 'insert into public.events (classroom_id, title, starts_at) values (null, ''x'', now())', 'YNNNNNNN'),
('events: add room 1', 'write', 'insert into public.events (classroom_id, title, starts_at) values (''{r1}'', ''x'', now())', 'YYNNNNNN'),
-- Tests, questions, keys
('tests: posted test', 'read', 'select 1 from public.tests where id = ''{r20}''', 'YYYYNNNN'),
('tests: draft test', 'read', 'select 1 from public.tests where id = ''{r21}''', 'YYNNNNNN'),
('tests: create in room 1', 'write', 'insert into public.tests (classroom_id, title) values (''{r1}'', ''x'')', 'YYNNNNNN'),
('tests: create in room 2', 'write', 'insert into public.tests (classroom_id, title) values (''{r2}'', ''x'')', 'YNYNNNNN'),
('tests: create in room 3', 'write', 'insert into public.tests (classroom_id, title) values (''{r3}'', ''x'')', 'YNNNNNNN'),
('tests: rename posted test', 'write', 'update public.tests set title = ''y'' where id = ''{r20}''', 'YYNNNNNN'),
('questions: posted question', 'read', 'select 1 from public.questions where id = ''{r22}''', 'YYYYNNNN'),
('questions: draft question', 'read', 'select 1 from public.questions where id = ''{r23}''', 'YYNNNNNN'),
('questions: save_question on posted test', 'write', 'select public.save_question(''{r20}'', null, ''New Q'', array[''a'',''b''], 0, '''')', 'YYNNNNNN'),
('questions: direct insert', 'write', 'insert into public.questions (test_id, position, prompt, options) values (''{r20}'', 9, ''x'', array[''a'',''b''])', 'NNNNNNNN'),
('question_keys: posted key', 'read', 'select 1 from public.question_keys where question_id = ''{r22}''', 'YYNNNNNN'),
('question_keys: direct insert', 'write', 'insert into public.question_keys (question_id, correct_index) values (''{r23}'', 1) on conflict (question_id) do update set correct_index = 1', 'NNNNNNNN'),
-- Attempts
('attempts: member''s attempt', 'read', 'select 1 from public.attempts where id = ''{r24}''', 'YYNYNNNN'),
('attempt_answers: member''s answers', 'read', 'select 1 from public.attempt_answers where attempt_id = ''{r24}''', 'YYNYNNNN'),
('attempts: direct insert', 'write', 'insert into public.attempts (test_id, user_id, mode, total) values (''{r20}'', ''{me}'', ''practice'', 1)', 'NNNNNNNN'),
('attempts: start a practice run', 'write', 'select public.start_attempt(''{r20}'', ''practice'')', 'YYYYNNNN'),
-- Decks and cards
('decks: shared room deck', 'read', 'select 1 from public.decks where id = ''{r30}''', 'YYYYNNNN'),
('decks: member''s private deck', 'read', 'select 1 from public.decks where id = ''{r31}''', 'YNNYNNNN'),
('decks: make your own', 'write', 'insert into public.decks (title) values (''x'')', 'YYYYYNNN'),
('decks: rename shared deck', 'write', 'update public.decks set title = ''y'' where id = ''{r30}''', 'YYNNNNNN'),
('decks: rename member''s private deck', 'write', 'update public.decks set title = ''y'' where id = ''{r31}''', 'YNNYNNNN'),
('cards: shared deck card', 'read', 'select 1 from public.cards where id = ''{r32}''', 'YYYYNNNN'),
('cards: private deck card', 'read', 'select 1 from public.cards where id = ''{r33}''', 'YNNYNNNN'),
('cards: add to shared deck', 'write', 'select public.add_cards(''{r30}'', ''[{"term":"t","definition":"d"}]''::jsonb)', 'YYNNNNNN'),
('cards: add to private deck', 'write', 'select public.add_cards(''{r31}'', ''[{"term":"t","definition":"d"}]''::jsonb)', 'YNNYNNNN'),
('cards: direct insert', 'write', 'insert into public.cards (deck_id, position, term, definition) values (''{r31}'', 9, ''t'', ''d'')', 'NNNNNNNN'),
-- Materials: rows and storage objects
('materials: chapter row', 'read', 'select 1 from public.materials where id = ''{r40}''', 'YYYYYNNN'),
('materials: room row', 'read', 'select 1 from public.materials where id = ''{r41}''', 'YYYYNNNN'),
('materials: add chapter link', 'write', 'insert into public.materials (classroom_id, title, url) values (null, ''x'', ''https://example.com'')', 'YNNNNNNN'),
('materials: add room 1 link', 'write', 'insert into public.materials (classroom_id, title, url) values (''{r1}'', ''x'', ''https://example.com'')', 'YYNNNNNN'),
('storage: chapter file', 'read', 'select 1 from storage.objects where bucket_id = ''materials'' and name = ''chapter/pm-handbook.pdf''', 'YYYYYNNN'),
('storage: room 1 file', 'read', 'select 1 from storage.objects where bucket_id = ''materials'' and name = ''{r1}/pm-notes.pdf''', 'YYYYNNNN'),
('storage: upload chapter file', 'write', 'insert into storage.objects (bucket_id, name) values (''materials'', ''chapter/pm-new.pdf'')', 'YNNNNNNN'),
('storage: upload room 1 file', 'write', 'insert into storage.objects (bucket_id, name) values (''materials'', ''{r1}/pm-new.pdf'')', 'YYNNNNNN'),
('storage: upload room 3 file', 'write', 'insert into storage.objects (bucket_id, name) values (''materials'', ''{r3}/pm-new.pdf'')', 'YNNNNNNN'),
('storage: member''s avatar', 'read', 'select 1 from storage.objects where bucket_id = ''avatars'' and name like ''{u4}/%''', 'YYYYYNNN'),
-- Skills and resources
('skills: room 1 skill', 'read', 'select 1 from public.skills where id = ''{r50}''', 'YYYYNNNN'),
('skills: add to room 1', 'write', 'insert into public.skills (classroom_id, name) values (''{r1}'', ''x'')', 'YYNNNNNN'),
('skills: add to room 3', 'write', 'insert into public.skills (classroom_id, name) values (''{r3}'', ''x'')', 'YNNNNNNN'),
('skills: edit room 1 skill', 'write', 'update public.skills set name = ''y'' where id = ''{r50}''', 'YYNNNNNN'),
('resources: room 1 link', 'read', 'select 1 from public.resources where id = ''{r51}''', 'YYYYNNNN'),
('resources: add to room 1', 'write', 'insert into public.resources (classroom_id, title, url) values (''{r1}'', ''x'', ''https://example.com'')', 'YYNNNNNN'),
-- Attendance
('attendance_sessions: room 1 week', 'read', 'select 1 from public.attendance_sessions where id = ''{r60}''', 'YYYYNNNN'),
('attendance_marks: member''s mark', 'read', 'select 1 from public.attendance_marks where session_id = ''{r60}'' and user_id = ''{u4}''', 'YYNYNNNN'),
('attendance: save a week', 'write', 'select public.save_attendance_week(''{r1}'', date ''2026-03-02'', '''', ''{}''::jsonb)', 'YYNNNNNN'),
('attendance_marks: direct insert', 'write', 'insert into public.attendance_marks (session_id, user_id, status) values (''{r60}'', ''{me}'', ''present'')', 'NNNNNNNN'),
-- Chapter meetings
('chapter_meetings: rows', 'read', 'select 1 from public.chapter_meetings', 'YYYYYNNN'),
('chapter_meetings: rename', 'write', 'update public.chapter_meetings set title = ''y'' where meets_on = ''2031-01-02''', 'YNNNNNNN'),
-- Profiles
('profiles: own row', 'read', 'select 1 from public.profiles where id = ''{me}''', 'YYYYYYYN'),
('profiles: member''s row', 'read', 'select 1 from public.profiles where id = ''{u4}''', 'YNNYNNNN'),
('profiles: rename yourself', 'write', 'update public.profiles set full_name = ''Renamed'' where id = ''{me}''', 'YYYYYNNN'),
('profiles: rename the member', 'write', 'update public.profiles set full_name = ''Renamed'' where id = ''{u4}''', 'YNNYNNNN'),
('profiles: make the member a trainer', 'write', 'update public.profiles set role = ''trainer'' where id = ''{u4}''', 'YNNNNNNN'),
-- Admin log and notifications
('admin_log: rows', 'read', 'select 1 from public.admin_log where detail = ''PM log row''', 'YNNNNNNN'),
('admin_log: direct insert', 'write', 'insert into public.admin_log (actor_name, action) values (''x'', ''role'')', 'NNNNNNNN'),
('notifications: member''s ping', 'read', 'select 1 from public.notifications where user_id = ''{u4}'' and title = ''PM ping''', 'NNNYNNNN'),
('notifications: direct insert', 'write', 'insert into public.notifications (user_id, kind, title, link) values (''{me}'', ''role'', ''x'', ''/'')', 'NNNNNNNN'),
-- Board RPCs read through can_read_board / can_view_classroom
('rpc: classroom_roster(room 1)', 'read', 'select 1 from public.classroom_roster(''{r1}'')', 'YYYYNNNN'),
('rpc: classroom_tests(room 1)', 'read', 'select 1 from public.classroom_tests(''{r1}'')', 'YYYYNNNN'),
-- Chapter-wide directory and board RPCs: every signed-in member, never a banned one or anon. The bulk name and role
-- list is for executives (0204); the bulk details give grade and title only on your own row or to an executive (0206).
('rpc: member_directory()', 'read', 'select 1 from public.member_directory() where user_id = ''{u4}''', 'YNNNNNNN'),
('rpc: member_details()', 'read', 'select 1 from public.member_details() where user_id = ''{u4}''', 'YYYYYNNN'),
('rpc: member_details() grade of the member', 'read', 'select 1 from public.member_details() where user_id = ''{u4}'' and grade is not null', 'YNNYNNNN'),
('rpc: member_detail(member)', 'read', 'select 1 from public.member_detail(''{u4}'') where grade is not null', 'YYYYYNNN'),
('rpc: competitions()', 'read', 'select 1 from public.competitions() where id = ''{r4}''', 'YYYYYNNN'),
('rpc: honor_roll()', 'call', 'select * from public.honor_roll()', 'YYYYYNNN'),
('rpc: member_stats(member)', 'call', 'select * from public.member_stats(''{u4}'')', 'YYYYYNNN'),
('rpc: leaderboard(all, chapter)', 'call', 'select * from public.leaderboard(''all'', null)', 'YYYYYNNN'),
('rpc: leaderboard(week, room 1)', 'call', 'select * from public.leaderboard(''week'', ''{r1}'')', 'YYYYNNNN'),
('rpc: members_online(chapter)', 'call', 'select * from public.members_online(null)', 'YYYYYNNN'),
('rpc: members_online(room 1)', 'call', 'select * from public.members_online(''{r1}'')', 'YYYYNNNN');

-- Runner -----------------------------------------------------------------------------------------
create function pg_temp.pm_run() returns text[] language plpgsql as $$
declare
  roles uuid[] := array[pg_temp.u(1), pg_temp.u(2), pg_temp.u(3), pg_temp.u(4), pg_temp.u(5), pg_temp.u(6), pg_temp.u(7), null];
  names text[] := array['E', 'TO', 'TN', 'M', 'N', 'B', 'BT', 'A'];
  checks pm_checks[];
  c pm_checks;
  i integer;
  sql text;
  got boolean;
  n bigint;
  st text;
  msg text;
  fails text[] := '{}';
begin
  select array_agg(x order by x.n) into checks from pm_checks x;
  for i in 1 .. 8 loop
    execute 'reset role';
    if roles[i] is null then
      perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
      execute 'set local role anon';
    else
      perform set_config('request.jwt.claims', json_build_object('sub', roles[i], 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
    end if;
    foreach c in array checks loop
      sql := replace(replace(replace(replace(replace(replace(replace(replace(c.stmt,
        '{me}', coalesce(roles[i]::text, '00000000-0000-0000-0000-000000000000')),
        '{u4}', pg_temp.u(4)::text), '{r1}', pg_temp.r(1)::text), '{r2}', pg_temp.r(2)::text),
        '{r3}', pg_temp.r(3)::text), '{r10}', pg_temp.r(10)::text), '{r11}', pg_temp.r(11)::text),
        '{r12}', pg_temp.r(12)::text);
      sql := replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(sql,
        '{r13}', pg_temp.r(13)::text), '{r20}', pg_temp.r(20)::text), '{r21}', pg_temp.r(21)::text),
        '{r22}', pg_temp.r(22)::text), '{r23}', pg_temp.r(23)::text), '{r24}', pg_temp.r(24)::text),
        '{r30}', pg_temp.r(30)::text), '{r31}', pg_temp.r(31)::text), '{r32}', pg_temp.r(32)::text),
        '{r33}', pg_temp.r(33)::text), '{r40}', pg_temp.r(40)::text), '{r41}', pg_temp.r(41)::text);
      sql := replace(replace(replace(replace(sql,
        '{r50}', pg_temp.r(50)::text), '{r51}', pg_temp.r(51)::text), '{r60}', pg_temp.r(60)::text),
        '{r61}', pg_temp.r(61)::text);
      sql := replace(sql, '{r4}', pg_temp.r(4)::text);
      st := null;
      begin
        if c.kind = 'read' then
          execute 'select exists (' || sql || ')' into got;
          -- Reads never change anything, but roll back anyway so every cell starts clean.
          raise exception using errcode = 'P0099', message = case when got then '1' else '0' end;
        elsif c.kind = 'call' then
          execute 'select count(*) from (' || sql || ') x' into n;
          raise exception using errcode = 'P0099', message = '1';
        else
          execute sql;
          get diagnostics n = row_count;
          raise exception using errcode = 'P0099', message = n::text;
        end if;
      exception
        when sqlstate 'P0099' then got := sqlerrm::bigint > 0;
        when others then got := false; st := sqlstate; msg := sqlerrm;
      end;
      if st is not null and st <> '42501' then
        fails := fails || format('%s [%s] expected %s, got error %s (%s): only a permission error counts as denied',
          c.label, names[i], substr(c.expected, i, 1), st, msg);
      elsif got <> (substr(c.expected, i, 1) = 'Y') then
        fails := fails || format('%s [%s] expected %s, got %s', c.label, names[i],
          substr(c.expected, i, 1), case when got then 'Y' else 'N' end);
      end if;
    end loop;
  end loop;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return fails;
end $$;

do $$
declare
  fails text[] := pg_temp.pm_run();
begin
  -- Grants: anon can't touch tables at all; nobody but the owner can truncate.
  if has_table_privilege('anon', 'public.profiles', 'select') then
    fails := fails || 'grants: anon still has SELECT on public.profiles'::text;
  end if;
  if exists (select 1 from information_schema.role_table_grants
             where table_schema = 'public' and grantee in ('anon', 'authenticated')
               and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')) then
    fails := fails || 'grants: anon/authenticated still hold TRUNCATE, TRIGGER or REFERENCES on public tables'::text;
  end if;
  if exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
             where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace
               and a.grantee = 'anon'::regrole) then
    fails := fails || 'grants: new public objects are still granted to anon by default'::text;
  end if;
  -- Functions: anon may execute only keepalive() (0084, the Vercel cron's database touch), chapter_gate_active()
  -- (0090, the sign-up form asks whether a chapter code is needed) and purge_attempt_logs() (0250 on the
  -- omega/hosa-trust branch: the same cron deletes wrong-code logs past retention; listed so this holds whichever
  -- branch merges first).
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
               and p.proname not in ('keepalive', 'chapter_gate_active', 'purge_attempt_logs')
               and has_function_privilege('anon', p.oid, 'execute')) then
    fails := fails || 'grants: anon can execute a public function other than keepalive(), chapter_gate_active() and purge_attempt_logs()'::text;
  end if;
  if cardinality(fails) > 0 then
    raise exception E'FAIL permissions matrix, % cell(s):\n%', cardinality(fails), array_to_string(fails, E'\n');
  end if;
end $$;

select 'permissions_matrix: all checks passed' as result;
rollback;
