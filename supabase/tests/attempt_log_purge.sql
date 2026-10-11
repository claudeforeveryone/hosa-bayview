-- Wrong-code log purge (migration 0250). Runs in one transaction and rolls back; raises on the first failure.
-- Uses one throwaway user only. The cron route (/api/keepalive) calls public.purge_attempt_logs() with the publishable
-- key right after keepalive(); src/app/api/keepalive/route.test.ts checks that side.
begin;

create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
end $$;

create function pg_temp.expect(label text, stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL %: expected %, got success', label, state using errcode = 'XX001';
exception when others then
  if sqlstate <> state then raise exception 'FAIL %: expected %, got % (%)', label, state, sqlstate, sqlerrm; end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000025a1', 'purge.member@example.com', '{"full_name":"Purge Member"}', now(),
   'authenticated', 'authenticated');

insert into private.join_attempts (user_id, at) values
  ('00000000-0000-4000-8000-0000000025a1', now() - interval '25 hours'),
  ('00000000-0000-4000-8000-0000000025a1', now() - interval '2 hours');
insert into private.passcode_attempts (user_id, at) values
  ('00000000-0000-4000-8000-0000000025a1', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000025a1', now() - interval '1 minute');
do $$ begin
  if to_regclass('private.chapter_code_attempts') is not null then
    insert into private.chapter_code_attempts (ip_hash, at) values
      ('purge-test', now() - interval '2 days'), ('purge-test', now() - interval '5 minutes');
    insert into private.chapter_code_tickets (ticket_hash, expires_at) values
      ('purge-test-old', now() - interval '1 minute'), ('purge-test-live', now() + interval '10 minutes');
  end if;
end $$;

-- The cron's path: the publishable (anon) key runs the purge.
set local role anon;
select public.purge_attempt_logs();
reset role;

select pg_temp.check('join: day-old try gone',
  not exists (select 1 from private.join_attempts
              where user_id = '00000000-0000-4000-8000-0000000025a1' and at < now() - interval '1 day'));
select pg_temp.check('join: recent try kept (the 10-minute limit still sees it)',
  exists (select 1 from private.join_attempts
          where user_id = '00000000-0000-4000-8000-0000000025a1' and at > now() - interval '3 hours'));
select pg_temp.check('passcode: old try gone',
  not exists (select 1 from private.passcode_attempts
              where user_id = '00000000-0000-4000-8000-0000000025a1' and at < now() - interval '1 day'));
select pg_temp.check('passcode: recent try kept',
  exists (select 1 from private.passcode_attempts
          where user_id = '00000000-0000-4000-8000-0000000025a1' and at > now() - interval '1 hour'));
select pg_temp.check('no log anywhere older than a day',
  not exists (select 1 from private.join_attempts where at < now() - interval '1 day')
  and not exists (select 1 from private.passcode_attempts where at < now() - interval '1 day'));

do $$ begin
  if to_regclass('private.chapter_code_attempts') is not null then
    perform pg_temp.check('chapter code: old miss gone',
      not exists (select 1 from private.chapter_code_attempts where at < now() - interval '1 day'));
    perform pg_temp.check('chapter code: recent miss kept',
      exists (select 1 from private.chapter_code_attempts where ip_hash = 'purge-test'));
    perform pg_temp.check('chapter code: expired ticket gone, live one kept',
      not exists (select 1 from private.chapter_code_tickets where ticket_hash = 'purge-test-old')
      and exists (select 1 from private.chapter_code_tickets where ticket_hash = 'purge-test-live'));
  end if;
end $$;

-- Same grants as keepalive(): the anon key may run it, signed-in accounts may not.
select pg_temp.check('anon may run the purge', has_function_privilege('anon', 'public.purge_attempt_logs()', 'execute'));
set local role authenticated;
select pg_temp.expect('members cannot call the purge', 'select public.purge_attempt_logs()', '42501');
reset role;

rollback;
