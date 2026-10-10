-- Favourite questions and career_items (migration 0100). One transaction, rolled back; raises on the first failure.
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

create function pg_temp.fails(stmt text, fragment text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return sqlerrm like '%' || fragment || '%';
end $$;

-- Fixtures: trainer f1 runs room f8 with published test fc (question fd) and draft test fe (question ff);
-- member f2 is in the room, f3 is not.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000000f1', 'fav.trainer@example.com', '{"full_name":"Fav Trainer"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f2', 'fav.one@example.com', '{"full_name":"Fav One"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f3', 'fav.out@example.com', '{"full_name":"Fav Out"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'trainer' where id = '00000000-0000-4000-8000-0000000000f1';
insert into public.classrooms (id, name, owner_id) values
  ('00000000-0000-4000-8000-0000000000f8', 'Fav Room', '00000000-0000-4000-8000-0000000000f1');
insert into public.classroom_members (classroom_id, user_id) values
  ('00000000-0000-4000-8000-0000000000f8', '00000000-0000-4000-8000-0000000000f2');
insert into public.tests (id, classroom_id, title, time_limit_minutes, is_published) values
  ('00000000-0000-4000-8000-0000000000fc', '00000000-0000-4000-8000-0000000000f8', 'Fav test', null, true),
  ('00000000-0000-4000-8000-0000000000fe', '00000000-0000-4000-8000-0000000000f8', 'Draft', null, false);
insert into public.questions (id, test_id, position, prompt, options) values
  ('00000000-0000-4000-8000-0000000000fd', '00000000-0000-4000-8000-0000000000fc', 1, 'Fav Q1', array['a', 'b']),
  ('00000000-0000-4000-8000-0000000000ff', '00000000-0000-4000-8000-0000000000fe', 1, 'Draft Q1', array['a', 'b']);
insert into public.question_keys (question_id, correct_index, explanation) values
  ('00000000-0000-4000-8000-0000000000fd', 1, 'B'),
  ('00000000-0000-4000-8000-0000000000ff', 0, 'A');

-- Member f2: star a question they can see, not one in a draft.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f2');
insert into public.question_favorites (question_id) values ('00000000-0000-4000-8000-0000000000fd');
select pg_temp.check('a member reads their own star',
  (select count(*) = 1 from public.question_favorites where question_id = '00000000-0000-4000-8000-0000000000fd'));
select pg_temp.check('the star belongs to the caller',
  (select user_id = '00000000-0000-4000-8000-0000000000f2' from public.question_favorites));
select pg_temp.check('cannot star a question in a draft test',
  pg_temp.fails($$insert into public.question_favorites (question_id) values ('00000000-0000-4000-8000-0000000000ff')$$, 'row-level security'));
select pg_temp.check('cannot star for someone else',
  pg_temp.fails($$insert into public.question_favorites (user_id, question_id) values ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000fd')$$, 'permission denied'));

-- career_items carries the question and the star.
select public.answer_question(public.start_attempt('00000000-0000-4000-8000-0000000000fc', 'practice'),
  '00000000-0000-4000-8000-0000000000fd', 1);
select pg_temp.check('career_items lists the answer with its question id and star',
  exists (select 1 from public.career_items('00000000-0000-4000-8000-0000000000f2', null) c
          where c.question_id = '00000000-0000-4000-8000-0000000000fd' and c.favorite and c.is_correct and c.correct_index = 1));
select pg_temp.check('career_items matches career row for row',
  (select count(*) from public.career_items('00000000-0000-4000-8000-0000000000f2', null))
    = (select count(*) from public.career('00000000-0000-4000-8000-0000000000f2', null)));

-- An outsider sees nothing and can't star a room they aren't in.
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f3');
select pg_temp.check('others cannot read a member''s stars',
  (select count(*) = 0 from public.question_favorites));
select pg_temp.check('an outsider cannot star a question in a room they aren''t in',
  pg_temp.fails($$insert into public.question_favorites (question_id) values ('00000000-0000-4000-8000-0000000000fd')$$, 'row-level security'));
select pg_temp.check('an outsider cannot read another member''s career_items',
  (select count(*) = 0 from public.career_items('00000000-0000-4000-8000-0000000000f2', null)));

-- The trainer's career_items reports their own stars, not the member's.
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
select pg_temp.check('a trainer sees the member''s row but not as their own star',
  exists (select 1 from public.career_items('00000000-0000-4000-8000-0000000000f2', null) c where not c.favorite));

-- Unstar.
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f2');
delete from public.question_favorites where question_id = '00000000-0000-4000-8000-0000000000fd';
select pg_temp.check('a member can remove their star',
  (select count(*) = 0 from public.question_favorites));

rollback;
