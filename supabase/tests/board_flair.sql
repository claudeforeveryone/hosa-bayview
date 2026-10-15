-- Board name colours and flair (migration 0294). One transaction, rolled back; raises on the first failure.
-- Run as a superuser (Supabase SQL editor or MCP execute_sql).
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

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

-- D1 developer who is an executive (developer wins), E1 executive, R1 trainer, M1 and M2 members.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000f1ad1', 'authenticated', 'authenticated', 'flair.dev@example.com', '{"full_name":"Flair Dev"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000f1ae1', 'authenticated', 'authenticated', 'flair.exec@example.com', '{"full_name":"Flair Exec"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000f1ab1', 'authenticated', 'authenticated', 'flair.trainer@example.com', '{"full_name":"Flair Trainer"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000f1aa1', 'authenticated', 'authenticated', 'flair.m1@example.com', '{"full_name":"Flair One"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000f1aa2', 'authenticated', 'authenticated', 'flair.m2@example.com', '{"full_name":"Flair Two"}', now());
update public.profiles set role = 'executive'
  where id in ('00000000-0000-4000-8000-0000000f1ad1', '00000000-0000-4000-8000-0000000f1ae1');
update public.profiles set role = 'trainer' where id = '00000000-0000-4000-8000-0000000f1ab1';
insert into private.stats_viewers (user_id) values ('00000000-0000-4000-8000-0000000f1ad1');

-- Kinds, as any member sees them.
select pg_temp.as_user('00000000-0000-4000-8000-0000000f1aa1');
select pg_temp.check('developer wins over executive',
  (select kind = 'developer' from public.board_tags() where user_id = '00000000-0000-4000-8000-0000000f1ad1'));
select pg_temp.check('executive',
  (select kind = 'executive' from public.board_tags() where user_id = '00000000-0000-4000-8000-0000000f1ae1'));
select pg_temp.check('trainer',
  (select kind = 'trainer' from public.board_tags() where user_id = '00000000-0000-4000-8000-0000000f1ab1'));
select pg_temp.check('member',
  (select kind = 'member' from public.board_tags() where user_id = '00000000-0000-4000-8000-0000000f1aa2'));

-- Your own flair: set, cleared, and the rule.
update public.profiles set flair = 'Med Term #1' where id = '00000000-0000-4000-8000-0000000f1aa1';
select pg_temp.check('own flair shows',
  (select flair = 'Med Term #1' from public.board_tags() where user_id = '00000000-0000-4000-8000-0000000f1aa1'));
select pg_temp.expect('too long',
  $q$update public.profiles set flair = repeat('a', 21) where id = '00000000-0000-4000-8000-0000000f1aa1'$q$, '23514');
select pg_temp.expect('emoji',
  $q$update public.profiles set flair = 'grind 🔥' where id = '00000000-0000-4000-8000-0000000f1aa1'$q$, '23514');
select pg_temp.expect('padded',
  $q$update public.profiles set flair = ' hi' where id = '00000000-0000-4000-8000-0000000f1aa1'$q$, '23514');
select pg_temp.expect('double space',
  $q$update public.profiles set flair = 'a  b' where id = '00000000-0000-4000-8000-0000000f1aa1'$q$, '23514');
select pg_temp.expect('empty',
  $q$update public.profiles set flair = '' where id = '00000000-0000-4000-8000-0000000f1aa1'$q$, '23514');

-- A member can't touch someone else's (RLS: the update matches no row).
update public.profiles set flair = 'hacked' where id = '00000000-0000-4000-8000-0000000f1aa2';
select pg_temp.as_admin();
select pg_temp.check('other member untouched',
  (select flair is null from public.profiles where id = '00000000-0000-4000-8000-0000000f1aa2'));

-- An executive can clear anyone's.
select pg_temp.as_user('00000000-0000-4000-8000-0000000f1ae1');
update public.profiles set flair = null where id = '00000000-0000-4000-8000-0000000f1aa1';
select pg_temp.as_admin();
select pg_temp.check('executive cleared it',
  (select flair is null from public.profiles where id = '00000000-0000-4000-8000-0000000f1aa1'));

-- Signed out: nothing.
select pg_temp.as_admin();
set local role anon;
select pg_temp.expect('anon refused', $q$select * from public.board_tags()$q$, '42501');
reset role;

rollback;
