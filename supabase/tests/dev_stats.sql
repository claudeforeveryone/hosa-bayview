-- Developer stats checks (migration 0105): can_see_dev_stats(), dev_member_stats(period) and record_clicks(n).
-- Only the account listed in private.stats_viewers may read the stats. Chapter leads (exec_granters) don't get it.
-- Runs in one transaction and rolls back; raises on the first failure. Throwaway users only.
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

-- ds1 is a chapter lead (exec_granters only). ds2 is the stats viewer (the site owner) and has activity.
-- ds3 is an executive who is neither.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000000d1', 'ds.lead@example.com', '{"full_name":"Stats Lead"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d2', 'ds.owner@example.com', '{"full_name":"Stats Owner"}', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d3', 'ds.exec@example.com', '{"full_name":"Stats Exec"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'executive' where id in ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d3');
insert into private.exec_granters (user_id) values ('00000000-0000-4000-8000-0000000000d1');
insert into private.stats_viewers (user_id) values ('00000000-0000-4000-8000-0000000000d2');

insert into public.classrooms (id, name, owner_id) values
  ('00000000-0000-4000-8000-0000000000c9', 'Stats room', '00000000-0000-4000-8000-0000000000d1');
insert into public.classroom_members (classroom_id, user_id) values
  ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000d2');
insert into public.tests (id, classroom_id, title, is_published, created_by) values
  ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-0000000000c9', 'Stats test', true, '00000000-0000-4000-8000-0000000000d1');
insert into public.questions (id, test_id, position, prompt, options) values
  ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000000e9', 1, 'Pick one', array['a', 'b']);
insert into public.question_keys (question_id, correct_index, explanation) values
  ('00000000-0000-4000-8000-0000000000f9', 0, 'A');

-- ds2 has three minutes: now (today, this week), three days ago (this week), thirty days ago (all time only).
insert into public.activity_minutes (user_id, minute, classroom_id) values
  ('00000000-0000-4000-8000-0000000000d2', date_trunc('minute', now()), null),
  ('00000000-0000-4000-8000-0000000000d2', date_trunc('minute', now() - interval '3 days'), null),
  ('00000000-0000-4000-8000-0000000000d2', date_trunc('minute', now() - interval '30 days'), null);
insert into public.presence (user_id, classroom_id, last_seen) values
  ('00000000-0000-4000-8000-0000000000d2', null, now());

-- Old clicks written directly: 10 three days ago, 5 thirty days ago. Today's come through record_clicks below.
insert into public.activity_clicks (user_id, minute, clicks) values
  ('00000000-0000-4000-8000-0000000000d2', date_trunc('minute', now() - interval '3 days'), 10),
  ('00000000-0000-4000-8000-0000000000d2', date_trunc('minute', now() - interval '30 days'), 5);

-- One attempt, submitted: counts as attempted and finished.
insert into public.attempts (id, test_id, user_id, mode, total, counts, started_at, submitted_at) values
  ('00000000-0000-4000-8000-0000000000a9', '00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-0000000000d2',
   'practice', 1, true, now(), now());

-- Elo: one answer (2 points) and one correct (3 points), both now. Elo starts at 0 (0105_elo_from_zero), so 5.
insert into public.elo_events (user_id, classroom_id, source, ref_id, points, multiplier, earned_at) values
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c9', 'answer', '00000000-0000-4000-8000-0000000000f9', 2, 1, now()),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c9', 'correct', '00000000-0000-4000-8000-0000000000f9', 3, 1, now());

-- Who may look: only the listed viewer. A chapter lead and an executive are both refused.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d1');
select pg_temp.check('lead cannot see stats', not public.can_see_dev_stats());
select pg_temp.expect('lead refused', $q$select * from public.dev_member_stats('all')$q$, '42501');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d3');
select pg_temp.check('exec cannot see stats', not public.can_see_dev_stats());
select pg_temp.expect('exec refused', $q$select * from public.dev_member_stats('all')$q$, '42501');
select pg_temp.as_anon();
select pg_temp.expect('anon cannot call can_see_dev_stats', $q$select public.can_see_dev_stats()$q$, '42501');
select pg_temp.expect('anon refused', $q$select * from public.dev_member_stats('all')$q$, '42501');
select pg_temp.expect('anon cannot record clicks', $q$select public.record_clicks(1)$q$, '42501');

-- The viewer: the check is true, an unknown period is refused with 22023, and clicks are capped.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d2');
select pg_temp.check('viewer can see stats', public.can_see_dev_stats());
select pg_temp.expect('bad period', $q$select * from public.dev_member_stats('year')$q$, '22023');
select public.record_clicks(400);   -- capped at 300 for this minute
select public.record_clicks(50);    -- the minute is already at the cap, so it stays 300
select public.record_clicks(-5);    -- nothing
select public.record_clicks(null);  -- nothing

do $$
declare
  r record;
  n integer;
begin
  select count(*) into n from public.dev_member_stats('all');
  perform pg_temp.check('viewer sees every member', n >= 3);

  select * into r from public.dev_member_stats('all') where user_id = '00000000-0000-4000-8000-0000000000d2';
  perform pg_temp.check('member row found', r.user_id is not null);
  perform pg_temp.check('minutes all time', r.minutes_all = 3);
  perform pg_temp.check('minutes last 7 days', r.minutes_7d = 2);
  perform pg_temp.check('minutes today', r.minutes_today = 1);
  perform pg_temp.check('minutes in period (all)', r.minutes_period = 3);
  perform pg_temp.check('clicks all time', r.clicks_all = 315);
  perform pg_temp.check('clicks last 7 days', r.clicks_7d = 310);
  perform pg_temp.check('clicks today capped', r.clicks_today = 300);
  perform pg_temp.check('clicks in period (all)', r.clicks_period = 315);
  perform pg_temp.check('answered', r.answered = 1);
  perform pg_temp.check('correct', r.correct = 1);
  perform pg_temp.check('elo is the sum of points', r.elo = 5);
  perform pg_temp.check('elo gain', r.elo_gain = 5);
  perform pg_temp.check('attempts', r.attempts = 1);
  perform pg_temp.check('finished', r.finished = 1);
  perform pg_temp.check('reviews none', r.reviews = 0);
  perform pg_temp.check('battle wins none', r.battle_wins = 0);
  perform pg_temp.check('one classroom', r.classrooms = 1);
  perform pg_temp.check('seen today and this week', r.seen_today and r.seen_week);
  perform pg_temp.check('not banned', r.banned = false);

  -- Today period: only today's minute and clicks count.
  select * into r from public.dev_member_stats('today') where user_id = '00000000-0000-4000-8000-0000000000d2';
  perform pg_temp.check('today period minutes', r.minutes_period = 1);
  perform pg_temp.check('today period clicks', r.clicks_period = 300);
  perform pg_temp.check('today period answered', r.answered = 1);

  -- An executive with no activity still gets a row, with zeros and Elo 0.
  select * into r from public.dev_member_stats('all') where user_id = '00000000-0000-4000-8000-0000000000d3';
  perform pg_temp.check('idle row present', r.user_id is not null);
  perform pg_temp.check('idle minutes zero', r.minutes_all = 0);
  perform pg_temp.check('idle clicks zero', r.clicks_all = 0);
  perform pg_temp.check('idle elo zero', r.elo = 0);
  perform pg_temp.check('idle never seen', r.last_seen is null and r.seen_today = false);
end $$;

select pg_temp.as_admin();
rollback;
