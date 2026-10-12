-- 0281: deleting notifications from your own inbox. Run inside begin ... rollback (raises on failure, ends by
-- raising PASS so nothing it made is kept). Picks two members who aren't banned.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';
create temp table r (k text, v text) on commit drop;
grant all on r to authenticated;
create temp table who on commit drop as
  select (array_agg(id order by created_at))[1] as a, (array_agg(id order by created_at))[2] as b
  from public.profiles where banned_until is null;
grant select on who to authenticated;
create temp table n (id uuid, k text) on commit drop;
grant select on n to authenticated;

with x as (
  insert into public.notifications (user_id, kind, title, body, link, read_at)
  values ((select a from who), 'announcement', 'dismiss test unread', '', '/', null),
         ((select a from who), 'announcement', 'dismiss test read', '', '/', now()),
         ((select a from who), 'announcement', 'dismiss test read 2', '', '/', now()),
         ((select b from who), 'announcement', 'dismiss test other', '', '/', now())
  returning id, title)
insert into n select id, title from x;

select set_config('request.jwt.claims', json_build_object('sub', (select a from who), 'role', 'authenticated')::text, true);
set local role authenticated;
-- Someone else's id does nothing.
insert into r select 'others', public.dismiss_notifications(array[(select id from n where k = 'dismiss test other')])::text;
insert into r select 'one', public.dismiss_notifications(array[(select id from n where k = 'dismiss test unread')])::text;
insert into r select 'clear read', public.dismiss_notifications(null)::text;
insert into r select 'unread left', public.unread_notifications()::text;
reset role;
insert into r select 'kept for b', count(*)::text from public.notifications
  where id = (select id from n where k = 'dismiss test other') and dismissed_at is null;
insert into r select 'dismissed a', count(*)::text from public.notifications
  where user_id = (select a from who) and title like 'dismiss test%' and dismissed_at is not null and read_at is not null;

do $$
declare got text;
begin
  select string_agg(k || '=' || v, ', ' order by k) into got from r;
  -- "clear read" also takes the member's own older read notifications, so it is at least the two made here.
  if (select v from r where k = 'others') <> '0'
     or (select v from r where k = 'one') <> '1'
     or (select v::int from r where k = 'clear read') < 2
     or (select v from r where k = 'kept for b') <> '1'
     or (select v from r where k = 'dismissed a') <> '3'
  then raise exception 'FAIL: %', got; end if;
  raise exception 'PASS: %', got;
end $$;
rollback;
