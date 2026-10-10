-- Bulk paste import (migration 0085). One transaction, rolled back; raises on the first failure.
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

-- n questions: question i has 4 options, the right one is (i - 1) % 4, explanation "why i".
create function pg_temp.batch(n integer) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object(
    'prompt', '  Bulk question ' || i || '?  ',
    'options', jsonb_build_array(' a' || i, 'b' || i, 'c' || i, 'd' || i),
    'correct', (i - 1) % 4,
    'explanation', 'why ' || i) order by i)
  from generate_series(1, n) i
$$;

-- Fixtures: trainer f1 runs room f4 with test f6 (already has one question); member f2; trainer f3 owns nothing here.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000000f1', 'bulk.trainer@example.com', '{"full_name":"Bulk Trainer"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f2', 'bulk.member@example.com', '{"full_name":"Bulk Member"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f3', 'bulk.other@example.com', '{"full_name":"Bulk Other"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'trainer'
  where id in ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f3');
insert into public.classrooms (id, name, owner_id) values
  ('00000000-0000-4000-8000-0000000000f4', 'Bulk Room', '00000000-0000-4000-8000-0000000000f1');
insert into public.classroom_members (classroom_id, user_id) values
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000f2');
insert into public.tests (id, classroom_id, title, is_published) values
  ('00000000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-0000000000f4', 'Bulk', false);
insert into public.questions (id, test_id, position, prompt, options) values
  ('00000000-0000-4000-8000-0000000000f7', '00000000-0000-4000-8000-0000000000f6', 1, 'Already here', array['x', 'y']);
insert into public.question_keys (question_id, correct_index) values ('00000000-0000-4000-8000-0000000000f7', 1);

-- Both writers take the per-test positions lock. True when this session holds the lock for that test.
create function pg_temp.holds_positions_lock(tid uuid) returns boolean language sql as $$
  select exists (
    select 1 from pg_locks l, (select hashtextextended('test_positions:' || tid::text, 0) as k) h
    where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.granted and l.objsubid = 1
      and l.classid = oid((h.k >> 32) & 4294967295) and l.objid = oid(h.k & 4294967295))
$$;
insert into public.tests (id, classroom_id, title, is_published) values
  ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000000f4', 'Bulk lock', false);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
select pg_temp.check('the positions lock is not held before the save',
  not pg_temp.holds_positions_lock('00000000-0000-4000-8000-0000000000f9'));
select public.save_question('00000000-0000-4000-8000-0000000000f9', null, 'Locked?', array['a', 'b'], 0, '');
select pg_temp.check('save_question takes the positions lock for a new question',
  pg_temp.holds_positions_lock('00000000-0000-4000-8000-0000000000f9'));
select pg_temp.check('the bulk test is not locked yet',
  not pg_temp.holds_positions_lock('00000000-0000-4000-8000-0000000000f6'));
reset role;
select pg_temp.check('import_questions_bulk takes the same lock',
  pg_get_functiondef('public.import_questions_bulk(uuid, jsonb)'::regprocedure) like '%private.lock_test_positions(tid)%');
select pg_temp.check('clients cannot call the lock helper',
  not has_function_privilege('authenticated', 'private.lock_test_positions(uuid)', 'execute'));

-- Gate: only the room's trainer or an executive.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f2');
select pg_temp.check('a member cannot bulk import',
  pg_temp.fails($$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', pg_temp.batch(2))$$, 'Only the trainer'));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f3');
select pg_temp.check('another trainer cannot bulk import',
  pg_temp.fails($$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', pg_temp.batch(2))$$, 'Only the trainer'));

-- Validation, as the owner: the batch is rejected whole and names the first broken item.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
select pg_temp.check('empty batch', pg_temp.fails($$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', '[]')$$, 'Nothing to import'));
select pg_temp.check('not an array', pg_temp.fails($$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', '{}')$$, 'Nothing to import'));
select pg_temp.check('over 500', pg_temp.fails($$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', pg_temp.batch(501))$$, 'at most 500'));
select pg_temp.check('empty option named by number', pg_temp.fails(
  $$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6',
    pg_temp.batch(6) || '[{"prompt":"Q7","options":["a","  "],"correct":0}]')$$, 'Question 7 has an empty option'));
select pg_temp.check('one option', pg_temp.fails(
  $$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', '[{"prompt":"Q","options":["a"],"correct":0}]')$$, 'Question 1 needs 2 to 5 options'));
select pg_temp.check('six options', pg_temp.fails(
  $$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', '[{"prompt":"Q","options":["a","b","c","d","e","f"],"correct":0}]')$$, '2 to 5 options'));
select pg_temp.check('options not an array', pg_temp.fails(
  $$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', '[{"prompt":"Q","options":"a,b","correct":0}]')$$, '2 to 5 options'));
select pg_temp.check('non-text option', pg_temp.fails(
  $$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', '[{"prompt":"Q","options":["a",2],"correct":0}]')$$, 'not text'));
select pg_temp.check('blank prompt', pg_temp.fails(
  $$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', '[{"prompt":"   ","options":["a","b"],"correct":0}]')$$, 'no question text'));
select pg_temp.check('long prompt', pg_temp.fails(
  format($$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', %L)$$,
    jsonb_build_array(jsonb_build_object('prompt', repeat('x', 2001), 'options', jsonb_build_array('a', 'b'), 'correct', 0))), 'over 2000'));
select pg_temp.check('long option', pg_temp.fails(
  format($$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', %L)$$,
    jsonb_build_array(jsonb_build_object('prompt', 'Q', 'options', jsonb_build_array(repeat('x', 501), 'b'), 'correct', 0))), 'option over 500'));
select pg_temp.check('long explanation', pg_temp.fails(
  format($$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', %L)$$,
    jsonb_build_array(jsonb_build_object('prompt', 'Q', 'options', jsonb_build_array('a', 'b'), 'correct', 0, 'explanation', repeat('x', 2001)))), 'explanation over 2000'));
select pg_temp.check('correct out of range', pg_temp.fails(
  $$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', '[{"prompt":"Q","options":["a","b"],"correct":2}]')$$, 'right option'));
select pg_temp.check('negative correct', pg_temp.fails(
  $$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', '[{"prompt":"Q","options":["a","b"],"correct":-1}]')$$, 'right option'));
select pg_temp.check('fractional correct', pg_temp.fails(
  $$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', '[{"prompt":"Q","options":["a","b"],"correct":0.5}]')$$, 'right option'));
select pg_temp.check('correct as a string', pg_temp.fails(
  $$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', '[{"prompt":"Q","options":["a","b"],"correct":"1"}]')$$, 'right option'));
select pg_temp.check('missing correct', pg_temp.fails(
  $$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', '[{"prompt":"Q","options":["a","b"]}]')$$, 'right option'));
select pg_temp.check('two options the same (case and spaces ignored)', pg_temp.fails(
  $$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', '[{"prompt":"Q","options":["Femur"," femur ","Tibia"],"correct":0}]')$$, 'Question 1 has two options that are the same'));
select pg_temp.check('a rejected batch adds nothing',
  (select count(*) from public.questions where test_id = '00000000-0000-4000-8000-0000000000f6') = 1);

-- 300 questions in one call, under a time budget.
do $$
declare t0 timestamptz := clock_timestamp(); n integer;
begin
  n := public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', pg_temp.batch(300));
  perform set_config('hosa.bulk_ms', extract(milliseconds from clock_timestamp() - t0)::text, true);
  if n <> 300 then raise exception 'FAIL returned % not 300', n; end if;
end $$;
select pg_temp.check('300 questions import in under 1500 ms (took ' || current_setting('hosa.bulk_ms') || ' ms)',
  current_setting('hosa.bulk_ms')::numeric < 1500);
select pg_temp.check('import_questions_bulk takes the positions lock for its test',
  pg_temp.holds_positions_lock('00000000-0000-4000-8000-0000000000f6'));

reset role;
select pg_temp.check('301 questions now, positions 1 to 301 with no gaps',
  (select count(*) = 301 and min(position) = 1 and max(position) = 301 and count(distinct position) = 301
     from public.questions where test_id = '00000000-0000-4000-8000-0000000000f6'));
select pg_temp.check('every new question has its own key',
  (select count(*) from public.questions q join public.question_keys k on k.question_id = q.id
     where q.test_id = '00000000-0000-4000-8000-0000000000f6') = 301);
select pg_temp.check('order, trimming, keys and explanations match the batch',
  not exists (select 1 from public.questions q join public.question_keys k on k.question_id = q.id
    where q.test_id = '00000000-0000-4000-8000-0000000000f6' and q.position > 1
      and (q.prompt <> 'Bulk question ' || (q.position - 1) || '?'
        or q.options <> array['a' || (q.position - 1), 'b' || (q.position - 1), 'c' || (q.position - 1), 'd' || (q.position - 1)]
        or k.correct_index <> (q.position - 2) % 4
        or k.explanation <> 'why ' || (q.position - 1))));
select pg_temp.check('the question already there is untouched',
  (select q.position = 1 and k.correct_index = 1 from public.questions q join public.question_keys k on k.question_id = q.id
    where q.id = '00000000-0000-4000-8000-0000000000f7'));

-- Explanation may be missing or null; the key stores ''.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
select pg_temp.check('missing and null explanations are fine',
  public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6',
    '[{"prompt":"No why","options":["a","b"],"correct":1},{"prompt":"Null why","options":["a","b"],"correct":0,"explanation":null}]') = 2);
reset role;
select pg_temp.check('they land after the batch with empty explanations',
  (select array_agg(q.position order by q.position) = array[302, 303] and bool_and(k.explanation = '')
     from public.questions q join public.question_keys k on k.question_id = q.id
     where q.test_id = '00000000-0000-4000-8000-0000000000f6' and q.prompt in ('No why', 'Null why')));

-- For comparison only (no check): the old per-question loop on a fresh test, same 300 items.
insert into public.tests (id, classroom_id, title, is_published) values
  ('00000000-0000-4000-8000-0000000000f8', '00000000-0000-4000-8000-0000000000f4', 'Bulk old path', false);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
do $$
declare t0 timestamptz := clock_timestamp();
begin
  perform public.import_questions('00000000-0000-4000-8000-0000000000f8', pg_temp.batch(300));
  perform set_config('hosa.old_ms', extract(milliseconds from clock_timestamp() - t0)::text, true);
end $$;
reset role;

-- A banned trainer can't import.
select set_config('request.jwt.claims', '', true);
update public.profiles set banned_until = now() + interval '1 day', ban_reason = 'Bulk test' where id = '00000000-0000-4000-8000-0000000000f1';
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
select pg_temp.check('a banned trainer cannot bulk import',
  pg_temp.fails($$select public.import_questions_bulk('00000000-0000-4000-8000-0000000000f6', pg_temp.batch(1))$$, 'Only the trainer'));
reset role;

-- Anonymous callers have no execute grant.
select pg_temp.check('anon has no execute', not has_function_privilege('anon', 'public.import_questions_bulk(uuid, jsonb)', 'execute'));
select pg_temp.check('authenticated has execute', has_function_privilege('authenticated', 'public.import_questions_bulk(uuid, jsonb)', 'execute'));

select 'import_bulk: all checks passed. 300 questions: bulk ' || current_setting('hosa.bulk_ms') || ' ms, old loop ' || current_setting('hosa.old_ms') || ' ms' as result;
rollback;
