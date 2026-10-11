-- 0270: personal events and day-of reminders. Run inside begin ... rollback (it raises on failure, and ends by
-- raising PASS so nothing it made is kept). Picks two members who aren't banned.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';
create temp table r (k text, v text) on commit drop;
grant all on r to authenticated;
create temp table who as
  select (array_agg(id order by created_at))[1] as a, (array_agg(id order by created_at))[2] as b
  from public.profiles where banned_until is null;
grant select on who to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', (select a from who), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.events (title, starts_at, owner_id)
  values ('personal_events test', ((now() at time zone 'America/Toronto')::date + time '23:30') at time zone 'America/Toronto', (select a from who));
insert into r select 'owner sees it', count(*)::text from public.events where title = 'personal_events test';
do $$ begin
  begin
    insert into public.events (title, starts_at, owner_id) values ('x', now(), (select b from who));
    insert into r values ('add for someone else', 'ALLOWED');
  exception when others then insert into r values ('add for someone else', 'refused'); end;
  begin
    update public.events set owner_id = null where title = 'personal_events test';
    insert into r values ('make it shared', 'ALLOWED');
  exception when others then insert into r values ('make it shared', 'refused'); end;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', (select b from who), 'role', 'authenticated')::text, true);
insert into r select 'others see it', count(*)::text from public.events where title = 'personal_events test';
with x as (update public.events set title = 'changed' where title = 'personal_events test' returning 1)
  insert into r select 'others edit it', count(*)::text from x;
reset role;

insert into r select 'notified on add', count(*)::text from public.notifications where title = 'personal_events test';
update public.events set created_at = now() - interval '1 day' where title = 'personal_events test';
select private.event_reminders();
insert into r select 'reminded', string_agg(user_id::text, ',') from public.notifications where title = 'Today: personal_events test';
select private.event_reminders();
insert into r select 'reminded twice', count(*)::text from public.notifications where title = 'Today: personal_events test';

do $$
declare
  want constant jsonb := jsonb_build_object(
    'owner sees it', '1', 'add for someone else', 'refused', 'make it shared', 'refused',
    'others see it', '0', 'others edit it', '0', 'notified on add', '0');
  k text;
  got text;
begin
  for k in select jsonb_object_keys(want) loop
    select v into got from r where r.k = k;
    if got is distinct from want ->> k then
      raise exception 'personal_events: % is %, want %', k, got, want ->> k;
    end if;
  end loop;
  -- Reminders run from 7 am Toronto; before that the owner check is skipped.
  if (now() at time zone 'America/Toronto')::time >= time '07:00'
     and ((select v from r where r.k = 'reminded') is distinct from (select a::text from who)
          or (select v from r where r.k = 'reminded twice') <> '1') then
    raise exception 'personal_events: reminder went to %, % time(s); want the owner, once',
      (select v from r where r.k = 'reminded'), (select v from r where r.k = 'reminded twice');
  end if;
  raise exception 'PASS personal_events';
end $$;
