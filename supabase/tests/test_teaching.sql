-- Test settings, Ask teacher and grades checks (migration 0031). One transaction, rolled back; raises on the first failure.
begin;

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
end $$;

-- True when the statement raises an error that contains the fragment.
create function pg_temp.fails(stmt text, fragment text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return sqlerrm like '%' || fragment || '%';
end $$;

-- Keeps attempt ids between statements in this transaction (works under the authenticated role too).
create function pg_temp.save(k text, v uuid) returns void language plpgsql as $$
begin
  perform set_config('hosa.test_' || k, v::text, true);
end $$;

create function pg_temp.get(k text) returns uuid language sql as $$
  select current_setting('hosa.test_' || k)::uuid
$$;

-- Fixtures: trainer a1 runs room b1; members a2 and a3.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'teach.trainer@example.com', '{"full_name":"Teach Trainer"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'teach.one@example.com', '{"full_name":"Teach One"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a3', 'teach.two@example.com', '{"full_name":"Teach Two"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'trainer' where id = '00000000-0000-4000-8000-0000000000a1';
insert into public.classrooms (id, name, owner_id) values
  ('00000000-0000-4000-8000-0000000000b1', 'Teach Room', '00000000-0000-4000-8000-0000000000a1');
insert into public.classroom_members (classroom_id, user_id) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a3');
-- c1 timed (defaults), c2 practice only with 1 attempt and answers off, c3 practice off, c4 order off.
insert into public.tests (id, classroom_id, title, time_limit_minutes, is_published) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', 'Timed', 30, true),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b1', 'Practice only', null, true),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000b1', 'Practice off', 20, true),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000b1', 'Free order', null, true);
update public.tests set attempts_allowed = 1, show_answers = false where id = '00000000-0000-4000-8000-0000000000c2';
update public.tests set allow_practice = false where id = '00000000-0000-4000-8000-0000000000c3';
update public.tests set shuffle_questions = false, shuffle_choices = false where id = '00000000-0000-4000-8000-0000000000c4';
insert into public.questions (id, test_id, position, prompt, options) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 1, 'Timed Q1', array['a', 'b', 'c', 'd']),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', 2, 'Timed Q2', array['a', 'b']),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c2', 1, 'Practice Q1', array['x', 'y', 'z']),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000c4', 1, 'Free Q1', array['p', 'q', 'r', 's']),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000c4', 2, 'Free Q2', array['m', 'n']),
  ('00000000-0000-4000-8000-0000000000d6', '00000000-0000-4000-8000-0000000000c3', 1, 'Off Q1', array['1', '2']);
insert into public.question_keys (question_id, correct_index, explanation) values
  ('00000000-0000-4000-8000-0000000000d1', 1, 'B is right'),
  ('00000000-0000-4000-8000-0000000000d2', 0, 'A is right'),
  ('00000000-0000-4000-8000-0000000000d3', 2, 'Z is right'),
  ('00000000-0000-4000-8000-0000000000d4', 3, 'S is right'),
  ('00000000-0000-4000-8000-0000000000d5', 1, 'N is right'),
  ('00000000-0000-4000-8000-0000000000d6', 0, '1 is right');

-- Defaults and the timed-or-practice rule (as the owner of the schema).
select pg_temp.check('existing tests get the default settings',
  (select shuffle_questions and shuffle_choices and allow_practice and show_answers and attempts_allowed is null
     from public.tests where id = '00000000-0000-4000-8000-0000000000c1'));
select pg_temp.check('a test with no time limit must allow practice',
  pg_temp.fails($$update public.tests set time_limit_minutes = null, allow_practice = false
                  where id = '00000000-0000-4000-8000-0000000000c1'$$, 'tests_timed_or_practice'));

-- Member a2 (Teach One): practice, Ask teacher, review.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
select pg_temp.check('practice off blocks practice starts',
  pg_temp.fails($$select public.start_attempt('00000000-0000-4000-8000-0000000000c3', 'practice')$$, 'Practice is off'));

select pg_temp.save('p1', public.start_attempt('00000000-0000-4000-8000-0000000000c1', 'practice'));
select pg_temp.check('practice answer shows right and the key when answers are on',
  exists (select 1 from public.answer_question(pg_temp.get('p1'), '00000000-0000-4000-8000-0000000000d1', 1) r
          where r.is_correct and r.correct_index = 1 and r.explanation = 'B is right'));
select pg_temp.check('cannot ask about a question you have not answered',
  pg_temp.fails($$select public.flag_question('00000000-0000-4000-8000-0000000000d2', 'help')$$, 'Ask about a question'));
select pg_temp.save('f1', public.flag_question('00000000-0000-4000-8000-0000000000d1', '  why B?  '));
select pg_temp.check('ask teacher works after a practice answer',
  exists (select 1 from public.test_flags('00000000-0000-4000-8000-0000000000c1') f
          where f.id = pg_temp.get('f1') and f.status = 'open' and f.note = 'why B?' and f.full_name = 'Teach One'));
select public.submit_attempt(pg_temp.get('p1'));
select pg_temp.check('submitted review keeps keys and choice order is a permutation',
  exists (select 1 from public.attempt_questions(pg_temp.get('p1')) r where r.question_id = '00000000-0000-4000-8000-0000000000d1' and r.correct_index = 1)
  and not exists (
    select 1 from public.attempt_questions(pg_temp.get('p1')) r
    where (select array_agg(x order by x) from unnest(r.choice_order) x)
          is distinct from (select array_agg(i::smallint order by i) from generate_series(0, cardinality(r.options) - 1) i)));

-- Answers off, one attempt: practice on c2.
select pg_temp.save('p2', public.start_attempt('00000000-0000-4000-8000-0000000000c2', 'practice'));
select pg_temp.check('answers off: practice saves the pick and gives no verdict or key',
  exists (select 1 from public.answer_question(pg_temp.get('p2'), '00000000-0000-4000-8000-0000000000d3', 0) r
          where r.selected_index = 0 and r.is_correct is null and r.correct_index is null and r.explanation is null));
select public.submit_attempt(pg_temp.get('p2'));
select pg_temp.check('answers off: review hides the key and the verdict from the taker',
  exists (select 1 from public.attempt_sheet(pg_temp.get('p2')) r where r.correct_index is null and r.explanation is null and r.is_correct is null)
  and not exists (select 1 from public.attempt_questions(pg_temp.get('p2')) r where r.correct_index is not null or r.is_correct is not null));
select pg_temp.check('rows come back in display order (pos 1..n in sequence)',
  not exists (
    select 1 from (select pos, row_number() over () as rn from public.attempt_questions(pg_temp.get('p1'))) s where s.pos <> s.rn)
  and (select count(*) from public.attempt_questions(pg_temp.get('p1'))) = 2);
select pg_temp.check('attempt cap stops another practice run on c2',
  pg_temp.fails($$select public.start_attempt('00000000-0000-4000-8000-0000000000c2', 'practice')$$, 'used all your attempts'));

-- Member a3 (Teach Two): untouched order on c4, a timed run on c1 that Ask teacher must not work during.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
select pg_temp.save('p4', public.start_attempt('00000000-0000-4000-8000-0000000000c4', 'practice'));
select pg_temp.check('shuffle off keeps position order and choice order',
  exists (select 1 from public.attempt_questions(pg_temp.get('p4')) r
          where r.pos = 1 and r.question_id = '00000000-0000-4000-8000-0000000000d4' and r.choice_order = array[0, 1, 2, 3]::smallint[])
  and exists (select 1 from public.attempt_questions(pg_temp.get('p4')) r where r.pos = 2 and r.question_id = '00000000-0000-4000-8000-0000000000d5'));
select pg_temp.check('shuffle off returns questions in full position order',
  (select array_agg(question_id order by rn) from (select question_id, row_number() over () rn from public.attempt_questions(pg_temp.get('p4'))) s)
    = array['00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000d5']::uuid[]);

select pg_temp.save('t1', public.start_attempt('00000000-0000-4000-8000-0000000000c1', 'timed'));
select public.answer_question(pg_temp.get('t1'), '00000000-0000-4000-8000-0000000000d1', 0);
select pg_temp.check('timed answers never allow ask teacher while open',
  pg_temp.fails($$select public.flag_question('00000000-0000-4000-8000-0000000000d1', 'help')$$, 'Ask about a question'));
select public.answer_question(pg_temp.get('t1'), '00000000-0000-4000-8000-0000000000d2', 0);
select public.submit_attempt(pg_temp.get('t1'));
select pg_temp.check('member cannot reply to a flag',
  pg_temp.fails($$select public.answer_flag(pg_temp.get('f1'), 'nope')$$, 'Only the trainer'));
select pg_temp.check('member sees only their own flags',
  not exists (select 1 from public.test_flags('00000000-0000-4000-8000-0000000000c1') f where f.user_id <> '00000000-0000-4000-8000-0000000000a3'));

-- Grades for member a3 only show their own rows.
select pg_temp.check('members see only their own grades',
  (select count(*) from public.classroom_grades('00000000-0000-4000-8000-0000000000b1')) = 4
  and not exists (select 1 from public.classroom_grades('00000000-0000-4000-8000-0000000000b1') g where g.user_id <> '00000000-0000-4000-8000-0000000000a3'));

-- Trainer a1 runs the room: reply, grades for everyone.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.check('trainer sees the open flag with member and note',
  exists (select 1 from public.test_flags('00000000-0000-4000-8000-0000000000c1') f
          where f.id = pg_temp.get('f1') and f.status = 'open' and f.full_name = 'Teach One' and f.note = 'why B?'));
select public.answer_flag(pg_temp.get('f1'), '  Because B is the textbook answer.  ');
select pg_temp.check('trainer reply is stored trimmed and marks the flag answered',
  exists (select 1 from public.test_flags('00000000-0000-4000-8000-0000000000c1') f
          where f.id = pg_temp.get('f1') and f.status = 'answered' and f.reply = 'Because B is the textbook answer.'));
select pg_temp.check('trainer sees the timed attempt keys after submit',
  exists (select 1 from public.attempt_questions(pg_temp.get('t1')) r where r.correct_index = 0));
select pg_temp.check('trainer grid: members times tests, timed beats practice, practice marked',
  (select count(*) from public.classroom_grades('00000000-0000-4000-8000-0000000000b1')) = 8
  and exists (select 1 from public.classroom_grades('00000000-0000-4000-8000-0000000000b1') g
              where g.user_id = '00000000-0000-4000-8000-0000000000a3' and g.test_id = '00000000-0000-4000-8000-0000000000c1'
                and g.mode = 'timed' and g.best_score = 1 and g.best_total = 2 and g.tries = 1)
  and exists (select 1 from public.classroom_grades('00000000-0000-4000-8000-0000000000b1') g
              where g.user_id = '00000000-0000-4000-8000-0000000000a2' and g.test_id = '00000000-0000-4000-8000-0000000000c2'
                and g.mode = 'practice' and g.best_score = 0 and g.best_total = 1));

-- Re-asking reopens the same flag and clears the old reply.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
-- Separate statements: test_flags is stable, so it can't see a write made in the same statement.
select pg_temp.check('asking again keeps the same flag', public.flag_question('00000000-0000-4000-8000-0000000000d1', 'again') = pg_temp.get('f1'));
select pg_temp.check('asking again reopens it and clears the old reply',
  exists (select 1 from public.test_flags('00000000-0000-4000-8000-0000000000c1') f
          where f.id = pg_temp.get('f1') and f.status = 'open' and f.reply = '' and f.note = 'again'));

-- A practice run that was open when the trainer turned practice off can't be answered any more.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
select pg_temp.save('p5', public.start_attempt('00000000-0000-4000-8000-0000000000c1', 'practice'));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
update public.tests set allow_practice = false where id = '00000000-0000-4000-8000-0000000000c1';
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
select pg_temp.check('an open practice run stops taking answers once practice is off',
  pg_temp.fails(format($$select public.answer_question('%s', '00000000-0000-4000-8000-0000000000d1', 0)$$, pg_temp.get('p5')), 'Practice is off'));

select 'tests_teaching: all checks passed' as result;
rollback;
