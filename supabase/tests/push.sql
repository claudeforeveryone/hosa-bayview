-- Web Push (migrations 0220-0221). One transaction, rolled back; raises on the first failure.
-- Fixtures are throwaway users with ids 00000000-0000-4000-8a00-*. A test vault secret is created inside the
-- transaction; pg_net only sends once a transaction is saved, so the rollback means no request ever leaves the
-- database.
begin;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8a00-' || lpad(to_hex(n), 12, '0'))::uuid
$$;

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end $$;

create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
end $$;

-- The statement must fail with this SQLSTATE.
create function pg_temp.expect(label text, stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL %: expected %, got success', label, state using errcode = 'XX001';
exception when others then
  if sqlstate <> state then raise exception 'FAIL %: expected %, got % (%)', label, state, sqlstate, sqlerrm; end if;
end $$;

-- How many rows the statement touched.
create function pg_temp.affected(stmt text) returns integer language plpgsql as $$
declare n integer;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

create function pg_temp.pokes() returns bigint language sql as $$
  select count(*) from net.http_request_queue where url like '%/api/push/deliver'
$$;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  (pg_temp.u(1), 'push.one@example.com', '{"full_name":"Push One"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(2), 'push.two@example.com', '{"full_name":"Push Two"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(3), 'push.three@example.com', '{"full_name":"Push Three"}', now(), 'authenticated', 'authenticated');

-- Base64url keys of the right shape (87 and 22 characters).
select set_config('push.k', repeat('B', 87), true);
select set_config('push.a', repeat('A', 22), true);
select set_config('push.e1', 'https://fcm.googleapis.com/fcm/send/test-endpoint-one', true);
select set_config('push.e2', 'https://web.push.apple.com/test-endpoint-two', true);

-- A. Subscribing ------------------------------------------------------------------------------------------------

select pg_temp.as_anon();
select pg_temp.expect('A1 anon cannot subscribe',
  format('select public.push_subscribe(%L, %L, %L)', current_setting('push.e1'), current_setting('push.k'), current_setting('push.a')),
  '42501');

select pg_temp.as_user(pg_temp.u(1));
select pg_temp.expect('A2 unknown push host refused',
  format('select public.push_subscribe(%L, %L, %L)', 'https://evil.example.com/push/abc', current_setting('push.k'), current_setting('push.a')),
  '22023');
select pg_temp.expect('A3 lookalike host refused',
  format('select public.push_subscribe(%L, %L, %L)', 'https://fcm.googleapis.com.evil.example/x', current_setting('push.k'), current_setting('push.a')),
  '22023');
select pg_temp.expect('A4 plain http refused',
  format('select public.push_subscribe(%L, %L, %L)', 'http://fcm.googleapis.com/fcm/send/x', current_setting('push.k'), current_setting('push.a')),
  '22023');
select pg_temp.expect('A5 malformed key refused',
  format('select public.push_subscribe(%L, %L, %L)', current_setting('push.e1'), 'not a key!', current_setting('push.a')),
  '23514');
-- Near misses web-push would refuse at every send: 80 and 88 characters, two pad characters, a key not starting
-- with B, and auth secrets of 21 and 32 characters.
select pg_temp.expect('A5b public key of 80 characters refused',
  format('select public.push_subscribe(%L, %L, %L)', current_setting('push.e1'), repeat('B', 80), current_setting('push.a')),
  '23514');
select pg_temp.expect('A5c public key of 88 characters refused',
  format('select public.push_subscribe(%L, %L, %L)', current_setting('push.e1'), repeat('B', 88), current_setting('push.a')),
  '23514');
select pg_temp.expect('A5d public key with two pad characters refused',
  format('select public.push_subscribe(%L, %L, %L)', current_setting('push.e1'), repeat('B', 87) || '==', current_setting('push.a')),
  '23514');
select pg_temp.expect('A5e public key not starting with B refused',
  format('select public.push_subscribe(%L, %L, %L)', current_setting('push.e1'), 'A' || repeat('B', 86), current_setting('push.a')),
  '23514');
select pg_temp.expect('A5f auth secret of 21 characters refused',
  format('select public.push_subscribe(%L, %L, %L)', current_setting('push.e1'), current_setting('push.k'), repeat('A', 21)),
  '23514');
select pg_temp.expect('A5g auth secret of 32 characters refused',
  format('select public.push_subscribe(%L, %L, %L)', current_setting('push.e1'), current_setting('push.k'), repeat('A', 32)),
  '23514');
-- The next statement saves the same endpoint again with unpadded keys, so the fixtures below are unchanged.
select pg_temp.check('A5h padded keys accepted (one = on the public key, two on the auth secret)',
  public.push_subscribe(current_setting('push.e1'), current_setting('push.k') || '=',
    current_setting('push.a') || '==') is not null);
select public.push_subscribe(current_setting('push.e1'), current_setting('push.k'), current_setting('push.a'));
select pg_temp.check('A6 own row saved',
  (select count(*) = 1 from public.push_subscriptions where endpoint = current_setting('push.e1') and user_id = pg_temp.u(1)));
select pg_temp.expect('A7 keys are not readable',
  'select p256dh from public.push_subscriptions', '42501');
select pg_temp.expect('A8 no direct insert',
  format('insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (%L, %L, %L, %L)',
    pg_temp.u(1), 'https://fcm.googleapis.com/fcm/send/direct', current_setting('push.k'), current_setting('push.a')),
  '42501');
select pg_temp.expect('A9 owner cannot be changed',
  format('update public.push_subscriptions set user_id = %L', pg_temp.u(2)), '42501');
select pg_temp.check('A10 own sound setting',
  pg_temp.affected(format('update public.push_subscriptions set sound = false where endpoint = %L', current_setting('push.e1'))) = 1);

select pg_temp.as_user(pg_temp.u(2));
select pg_temp.check('A11 other members see nothing', (select count(*) = 0 from public.push_subscriptions));
select pg_temp.check('A12 other members cannot delete',
  pg_temp.affected(format('delete from public.push_subscriptions where endpoint = %L', current_setting('push.e1'))) = 0);
select pg_temp.check('A13 other members cannot change sound',
  pg_temp.affected(format('update public.push_subscriptions set sound = true where endpoint = %L', current_setting('push.e1'))) = 0);
-- A shared phone signed in as someone else: the endpoint moves to the new member.
select public.push_subscribe(current_setting('push.e1'), current_setting('push.k'), current_setting('push.a'));
select pg_temp.as_admin();
-- The sound setting belongs to the device (Settings > Sound on that phone), so it stays when nothing new is sent.
select pg_temp.check('A14 endpoint moved to the new member, keeping the device''s sound setting',
  (select user_id = pg_temp.u(2) and not sound from public.push_subscriptions where endpoint = current_setting('push.e1')));
select pg_temp.as_user(pg_temp.u(2));
select set_config('push.id1',
  public.push_subscribe(current_setting('push.e1'), current_setting('push.k'), current_setting('push.a'), true)::text, true);
select pg_temp.as_admin();
select pg_temp.check('A14b a sent sound setting is saved, and the row id comes back',
  (select sound and id::text = current_setting('push.id1') from public.push_subscriptions where endpoint = current_setting('push.e1')));

select pg_temp.as_user(pg_temp.u(3));
do $$
begin
  for i in 1..12 loop
    perform public.push_subscribe('https://fcm.googleapis.com/fcm/send/cap-' || i, current_setting('push.k'), current_setting('push.a'));
  end loop;
end $$;
select pg_temp.expect('A15 thirteenth device refused',
  format('select public.push_subscribe(%L, %L, %L)', 'https://fcm.googleapis.com/fcm/send/cap-13', current_setting('push.k'), current_setting('push.a')),
  '53400');
select pg_temp.as_admin();
-- Clear the cap fixtures so u3 counts as a member with no devices below.
delete from public.push_subscriptions where user_id = pg_temp.u(3);

-- B. Queueing ---------------------------------------------------------------------------------------------------

select pg_temp.as_admin();
select set_config('push.p0', pg_temp.pokes()::text, true);
select private.notify(array[pg_temp.u(2)], 'announcement', 'Push off', '', '/announcements');
select pg_temp.check('B1 nothing queued while the secret is missing',
  (select count(*) = 0 from private.push_outbox) and pg_temp.pokes() = current_setting('push.p0')::bigint);

select vault.create_secret('test-secret-0123456789abcdefghijklmnopqrstuv', 'push_internal_secret');
select private.notify(array[pg_temp.u(3)], 'event', 'No devices', '', '/calendar');
select pg_temp.check('B2 members without devices are not queued',
  (select count(*) = 0 from private.push_outbox) and pg_temp.pokes() = current_setting('push.p0')::bigint);

select private.notify(array[pg_temp.u(2), pg_temp.u(3)], 'test', 'New test: Push', 'Room', '/');
select pg_temp.check('B3 one queued row for the member with a device',
  (select count(*) = 1 from private.push_outbox o join public.notifications n on n.id = o.notification_id
   where n.user_id = pg_temp.u(2) and n.title = 'New test: Push'));
select pg_temp.check('B4 one poke per statement',
  pg_temp.pokes() = current_setting('push.p0')::bigint + 1);
select pg_temp.check('B5 the poke carries the secret',
  (select headers ->> 'x-push-secret' = 'test-secret-0123456789abcdefghijklmnopqrstuv'
   from net.http_request_queue where url = 'https://hosa-bayview.vercel.app/api/push/deliver' order by id desc limit 1));

-- Every existing notification kind reaches the queue (the trigger sits on the table, not on each kind).
select private.notify(array[pg_temp.u(2)], k, 'Kind ' || k, '', '/')
from unnest(array['announcement', 'reply', 'question', 'event', 'competition', 'role']) k;
select pg_temp.check('B6 every kind is queued',
  (select count(distinct n.kind) = 7 from private.push_outbox o join public.notifications n on n.id = o.notification_id));

-- C. Claiming and reporting -------------------------------------------------------------------------------------

select pg_temp.as_admin();
create temp table claimed (
  notification_id uuid, user_id uuid, kind text, title text, body text, link text,
  endpoint text, p256dh text, auth text, sound boolean, failure_count integer, attempts integer
);
grant all on claimed to anon;

select pg_temp.as_user(pg_temp.u(2));
select pg_temp.expect('C1 members cannot claim',
  'select * from public.push_claim(''test-secret-0123456789abcdefghijklmnopqrstuv'')', '42501');
select pg_temp.expect('C2 members cannot read the queue', 'select * from private.push_outbox', '42501');
select pg_temp.expect('C3 members cannot read the secret', 'select private.push_secret()', '42501');

select pg_temp.as_anon();
select pg_temp.expect('C4 wrong secret refused', 'select * from public.push_claim(''wrong'')', '42501');
select pg_temp.expect('C5 missing secret refused', 'select * from public.push_claim(null)', '42501');
select pg_temp.expect('C6 report without the secret refused',
  'select public.push_report(''wrong'', array[]::uuid[])', '42501');
select pg_temp.expect('C7 anon cannot poke', 'select private.push_poke()', '42501');

insert into claimed select * from public.push_claim('test-secret-0123456789abcdefghijklmnopqrstuv', 50);
select pg_temp.check('C8 claim returns each queued notification with its device, on its first try',
  (select count(*) = 7 and bool_and(endpoint = current_setting('push.e1')) and bool_and(user_id = pg_temp.u(2))
     and bool_and(attempts = 1) from claimed));
select pg_temp.check('C9 claimed rows are leased',
  (select count(*) = 0 from public.push_claim('test-secret-0123456789abcdefghijklmnopqrstuv', 50)));

select pg_temp.as_admin();
select pg_temp.check('C10 lease and attempt recorded',
  (select bool_and(attempts = 1 and locked_until > now()) from private.push_outbox));

select pg_temp.as_anon();
select public.push_report('test-secret-0123456789abcdefghijklmnopqrstuv',
  (select array_agg(notification_id) from claimed), array[current_setting('push.e1')], '{}', '{}');
select pg_temp.as_admin();
select pg_temp.check('C11 delivered rows leave the queue', (select count(*) = 0 from private.push_outbox));
select pg_temp.check('C12 success recorded',
  (select last_success_at is not null and failure_count = 0 from public.push_subscriptions where endpoint = current_setting('push.e1')));

-- A read notification is cleared without sending.
select private.notify(array[pg_temp.u(2)], 'event', 'Read already', '', '/calendar');
update public.notifications set read_at = now() where title = 'Read already';
select pg_temp.as_anon();
select pg_temp.check('C13 read notifications come back with no device',
  (select count(*) = 1 and bool_and(endpoint is null) from public.push_claim('test-secret-0123456789abcdefghijklmnopqrstuv', 50)));

-- Failures count up, and the tenth in a row drops the device.
select pg_temp.as_admin();
update public.push_subscriptions set failure_count = 8 where endpoint = current_setting('push.e1');
select pg_temp.as_anon();
select public.push_report('test-secret-0123456789abcdefghijklmnopqrstuv', array[]::uuid[], '{}', array[current_setting('push.e1')], '{}');
select pg_temp.as_admin();
select pg_temp.check('C14 failure counted',
  (select failure_count = 9 from public.push_subscriptions where endpoint = current_setting('push.e1')));
select pg_temp.as_anon();
select public.push_report('test-secret-0123456789abcdefghijklmnopqrstuv', array[]::uuid[], '{}', array[current_setting('push.e1')], '{}');
select pg_temp.as_admin();
select pg_temp.check('C15 tenth failure drops the device',
  (select count(*) = 0 from public.push_subscriptions where endpoint = current_setting('push.e1')));

-- 404/410 drops a device at once.
select pg_temp.as_user(pg_temp.u(1));
select public.push_subscribe(current_setting('push.e2'), current_setting('push.k'), current_setting('push.a'));
select pg_temp.as_anon();
select public.push_report('test-secret-0123456789abcdefghijklmnopqrstuv', array[]::uuid[], '{}', '{}', array[current_setting('push.e2')]);
select pg_temp.as_admin();
select pg_temp.check('C16 gone device dropped',
  (select count(*) = 0 from public.push_subscriptions where endpoint = current_setting('push.e2')));

-- D. Sweeping ---------------------------------------------------------------------------------------------------

select pg_temp.as_admin();
delete from private.push_outbox;
select pg_temp.as_user(pg_temp.u(1));
select public.push_subscribe(current_setting('push.e2'), current_setting('push.k'), current_setting('push.a'));
select pg_temp.as_admin();
select private.notify(array[pg_temp.u(1)], 'role', 'Sweep me', '', '/');
select set_config('push.p1', pg_temp.pokes()::text, true);
select private.push_sweep();
select pg_temp.check('D1 a fresh row is left to the first poke', pg_temp.pokes() = current_setting('push.p1')::bigint);
update private.push_outbox set queued_at = now() - interval '1 minute';
select private.push_sweep();
select pg_temp.check('D2 a waiting row gets another poke', pg_temp.pokes() = current_setting('push.p1')::bigint + 1);
update private.push_outbox set locked_until = now() + interval '1 minute';
select private.push_sweep();
select pg_temp.check('D3 a leased row is left alone', pg_temp.pokes() = current_setting('push.p1')::bigint + 1);
update private.push_outbox set queued_at = now() - interval '3 days';
select private.push_sweep();
select pg_temp.check('D4 stale rows are dropped', (select count(*) = 0 from private.push_outbox));
select pg_temp.check('D5 the sweep is scheduled every minute',
  (select count(*) = 1 from cron.job where jobname = 'hosa-push-sweep' and schedule = '* * * * *'));

-- E. Retrying after a passing push-service failure ----------------------------------------------------------------

select pg_temp.as_admin();
delete from private.push_outbox;
select set_config('push.e3', 'https://fcm.googleapis.com/fcm/send/test-endpoint-three', true);
select pg_temp.as_user(pg_temp.u(1));
select public.push_subscribe(current_setting('push.e3'), current_setting('push.k'), current_setting('push.a'));
select pg_temp.as_admin();
select private.notify(array[pg_temp.u(1)], 'announcement', 'Retry me', '', '/announcements');
delete from claimed;

select pg_temp.as_anon();
insert into claimed select * from public.push_claim('test-secret-0123456789abcdefghijklmnopqrstuv', 50);
select pg_temp.check('E1 both of the member''s devices are claimed',
  (select count(*) = 2 and count(distinct notification_id) = 1 from claimed));
-- e2 took it; e3's push service answered 503, so the route asks for another try for e3 only.
select public.push_report('test-secret-0123456789abcdefghijklmnopqrstuv', array[]::uuid[],
  array[current_setting('push.e2')], '{}', '{}',
  jsonb_build_array(jsonb_build_object('id', (select notification_id from claimed limit 1),
                                       'delivered', jsonb_build_array(current_setting('push.e2')))));
select pg_temp.as_admin();
select pg_temp.check('E2 the notification stays queued, noting the device that has it, and waits a minute',
  (select count(*) = 1 and bool_and(delivered = array[current_setting('push.e2')])
     and bool_and(locked_until = now() + interval '1 minute') from private.push_outbox));
select pg_temp.check('E3 the device that missed out takes no strike',
  (select failure_count = 0 from public.push_subscriptions where endpoint = current_setting('push.e3')));
select pg_temp.as_anon();
select pg_temp.check('E4 not handed out again before the wait is over',
  (select count(*) = 0 from public.push_claim('test-secret-0123456789abcdefghijklmnopqrstuv', 50)));
select pg_temp.as_admin();
update private.push_outbox set locked_until = now() - interval '1 second';
delete from claimed;
select pg_temp.as_anon();
insert into claimed select * from public.push_claim('test-secret-0123456789abcdefghijklmnopqrstuv', 50);
select pg_temp.check('E5 the second try goes only to the device that missed it',
  (select count(*) = 1 and bool_and(endpoint = current_setting('push.e3')) and bool_and(attempts = 2) from claimed));
select public.push_report('test-secret-0123456789abcdefghijklmnopqrstuv',
  (select array_agg(distinct notification_id) from claimed), array[current_setting('push.e3')], '{}', '{}', '[]');
select pg_temp.as_admin();
select pg_temp.check('E6 delivered on the retry, it leaves the queue', (select count(*) = 0 from private.push_outbox));

select private.notify(array[pg_temp.u(1)], 'event', 'Everyone has it', '', '/calendar');
update private.push_outbox set delivered = array[current_setting('push.e2'), current_setting('push.e3')];
select pg_temp.as_anon();
select pg_temp.check('E7 a notification every device already has comes back once with no device',
  (select count(*) = 1 and bool_and(endpoint is null)
   from public.push_claim('test-secret-0123456789abcdefghijklmnopqrstuv', 50)));
select public.push_report('test-secret-0123456789abcdefghijklmnopqrstuv', array[]::uuid[], '{}', '{}', '{}', '{"id": 1}');
select public.push_report('test-secret-0123456789abcdefghijklmnopqrstuv', array[]::uuid[], '{}', '{}', '{}',
  '[{"id": 1, "delivered": "x"}, 5, {"id": "not-a-uuid", "delivered": [1]}]');
select pg_temp.check('E8 a malformed retry list is ignored, not an error', true);

-- The route ran out of time before trying every device: an "untried" hand-back gives the try back.
select pg_temp.as_admin();
delete from private.push_outbox;
select private.notify(array[pg_temp.u(1)], 'announcement', 'Out of time', '', '/announcements');
delete from claimed;
select pg_temp.as_anon();
insert into claimed select * from public.push_claim('test-secret-0123456789abcdefghijklmnopqrstuv', 50);
select public.push_report('test-secret-0123456789abcdefghijklmnopqrstuv', array[]::uuid[],
  array[current_setting('push.e2')], '{}', '{}',
  jsonb_build_array(jsonb_build_object('id', (select notification_id from claimed limit 1),
                                       'delivered', jsonb_build_array(current_setting('push.e2')), 'untried', true)));
select pg_temp.as_admin();
select pg_temp.check('E9 an untried hand-back stays queued, notes the device that has it and gives the try back',
  (select count(*) = 1 and bool_and(attempts = 0) and bool_and(delivered = array[current_setting('push.e2')])
     and bool_and(locked_until = now() + interval '1 minute') from private.push_outbox));
update private.push_outbox set attempts = 4, locked_until = null;
delete from claimed;
select pg_temp.as_anon();
insert into claimed select * from public.push_claim('test-secret-0123456789abcdefghijklmnopqrstuv', 50);
select public.push_report('test-secret-0123456789abcdefghijklmnopqrstuv', array[]::uuid[], '{}', '{}', '{}',
  jsonb_build_array(jsonb_build_object('id', (select notification_id from claimed limit 1),
                                       'delivered', '[]'::jsonb, 'untried', true)));
select pg_temp.as_admin();
update private.push_outbox set locked_until = null;
select pg_temp.as_anon();
select pg_temp.check('E10 cut short on its fifth try, it is still handed out to the device that missed it',
  (select count(*) = 1 and bool_and(endpoint = current_setting('push.e3')) and bool_and(attempts = 5)
   from public.push_claim('test-secret-0123456789abcdefghijklmnopqrstuv', 50)));
select public.push_report('test-secret-0123456789abcdefghijklmnopqrstuv', array[]::uuid[], '{}', '{}', '{}',
  jsonb_build_array(jsonb_build_object('id', (select notification_id from claimed limit 1), 'untried', 'yes')));
select pg_temp.as_admin();
select pg_temp.check('E11 anything but untried: true counts the try',
  (select count(*) = 1 and bool_and(attempts = 5) from private.push_outbox));

select 'push: all checks passed' as result;
rollback;
