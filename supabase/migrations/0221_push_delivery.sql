-- Omega PWA track: every notification also goes out as a Web Push.
--
-- Every notification is a row in public.notifications, written by triggers through private.notify (announcement,
-- test, reply, question, event, competition, role). One statement-level AFTER INSERT trigger on that table covers
-- every type, including types added later. Delivery is a small outbox:
--
--   1. The trigger queues the new rows in private.push_outbox (only rows whose member has a device with push on) and
--      pokes the site's /api/push/deliver route once per statement with pg_net. pg_net sends once the transaction is
--      saved, so it never blocks or slows the insert.
--   2. The route claims queued rows with push_claim (a 3 minute lease), sends to each device, and reports back with
--      push_report: delivered rows leave the queue, dead devices (404/410, or 10 failures in a row) are dropped.
--      When a push service has a passing problem (429, 5xx, a timeout), the row stays queued with the devices that
--      already have it noted, and is tried again for the rest after a short wait (1, 2, 3, then 4 minutes). A
--      route that crashes before reporting is covered the same way: the lease runs out and the row is claimed again.
--   3. A pg_cron job every minute pokes the route again if anything is still queued and unleased, so a cold start,
--      a deploy or a network blip only delays a push. A row gets 5 tries; anything still queued after 2 days is
--      dropped.
--
-- Both RPCs are refused without the shared secret, so the route needs no service key. The secret is NOT in this
-- file. Set it once, by hand, after applying (same value as PUSH_INTERNAL_SECRET in Vercel):
--   select vault.create_secret('<PUSH_INTERNAL_SECRET>', 'push_internal_secret');
-- Until that row exists nothing is queued or sent: push is simply off. Optional, to point the poke elsewhere:
--   select vault.create_secret('https://<host>/api/push/deliver', 'push_deliver_url');

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table private.push_outbox (
  notification_id uuid primary key references public.notifications (id) on delete cascade,
  queued_at timestamptz not null default now(),
  attempts smallint not null default 0 check (attempts >= 0),
  locked_until timestamptz,
  -- Devices (endpoints) that already have this notification, or will never take it. A retry skips them.
  delivered text[] not null default '{}'
);
create index push_outbox_queued_idx on private.push_outbox (queued_at);
alter table private.push_outbox enable row level security;
revoke all on private.push_outbox from public, anon, authenticated;

-- The shared secret, or null while push is off.
create or replace function private.push_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
  from vault.decrypted_secrets ds
  where ds.name = 'push_internal_secret'
  order by ds.created_at desc
  limit 1
$$;

-- Compares hashes, so how far a wrong guess matched never shows in the timing.
create or replace function private.push_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_secret is not null
      and char_length(x.s) >= 32
      and extensions.digest(p_secret, 'sha256') = extensions.digest(x.s, 'sha256'),
    false)
  from (select private.push_secret() as s) x
$$;

-- Asks the site to drain the queue. Fire and forget: any failure here only delays a push until the next sweep.
create or replace function private.push_poke()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text := private.push_secret();
  v_url text;
begin
  if v_secret is null then
    return;
  end if;
  select ds.decrypted_secret into v_url
  from vault.decrypted_secrets ds
  where ds.name = 'push_deliver_url'
  order by ds.created_at desc
  limit 1;
  perform net.http_post(
    url := coalesce(v_url, 'https://hosa-bayview.vercel.app/api/push/deliver'),
    body := '{}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 10000
  );
exception when others then
  return;
end;
$$;

create or replace function private.push_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued integer;
begin
  if private.push_secret() is null then
    return null;
  end if;
  insert into private.push_outbox (notification_id)
  select a.id
  from added a
  where exists (select 1 from public.push_subscriptions s where s.user_id = a.user_id)
  on conflict (notification_id) do nothing;
  get diagnostics queued = row_count;
  if queued > 0 then
    perform private.push_poke();
  end if;
  return null;
exception when others then
  -- A push that can't be queued must never stop the notification itself. The bell still shows it.
  return null;
end;
$$;

create or replace trigger notifications_push_enqueue
  after insert on public.notifications
  referencing new table as added
  for each statement execute function private.push_enqueue();

-- The route's half. Leases up to p_limit queued notifications for 3 minutes and returns one row per (notification,
-- device). A notification with nothing to send (read already, older than a day, or the member turned every device
-- off) comes back once with a null endpoint so the route can clear it.
create or replace function public.push_claim(p_secret text, p_limit integer default 50)
returns table (
  notification_id uuid,
  user_id uuid,
  kind text,
  title text,
  body text,
  link text,
  endpoint text,
  p256dh text,
  auth text,
  sound boolean,
  failure_count integer,
  attempts integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.push_secret_ok(p_secret) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  with picked as (
    select o.notification_id
    from private.push_outbox o
    where o.attempts < 5 and (o.locked_until is null or o.locked_until < now())
    order by o.queued_at
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    for update skip locked
  ), claimed as (
    update private.push_outbox o
    set attempts = o.attempts + 1, locked_until = now() + interval '3 minutes'
    from picked p
    where o.notification_id = p.notification_id
    returning o.notification_id, o.attempts, o.delivered
  )
  select n.id, n.user_id, n.kind, n.title, n.body, n.link, s.endpoint, s.p256dh, s.auth, s.sound, s.failure_count,
         c.attempts::integer
  from claimed c
  join public.notifications n on n.id = c.notification_id
  left join public.push_subscriptions s
    on s.user_id = n.user_id
   and n.read_at is null
   and n.created_at > now() - interval '1 day'
   and s.endpoint <> all (c.delivered)
  order by n.created_at, s.endpoint;
end;
$$;

-- What happened. p_done leaves the queue; p_retry ([{"id": <notification>, "delivered": [<endpoint>, ...]}]) stays
-- queued, notes the devices that already have it, and waits a minute per try so far before the next one; p_ok
-- resets a device's failure count; p_failed counts one more failure and drops a device at 10 in a row; p_gone
-- (404/410 from the push service) drops the device at once.
create or replace function public.push_report(
  p_secret text,
  p_done uuid[],
  p_ok text[] default '{}',
  p_failed text[] default '{}',
  p_gone text[] default '{}',
  p_retry jsonb default '[]'
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.push_secret_ok(p_secret) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.push_subscriptions s
  set last_success_at = now(), failure_count = 0
  where s.endpoint = any (coalesce(p_ok, '{}'));
  update public.push_subscriptions s
  set failure_count = s.failure_count + 1
  where s.endpoint = any (coalesce(p_failed, '{}'));
  delete from public.push_subscriptions s
  where s.endpoint = any (coalesce(p_gone, '{}'))
     or (s.endpoint = any (coalesce(p_failed, '{}')) and s.failure_count >= 10);
  delete from private.push_outbox o
  where o.notification_id = any (coalesce(p_done, '{}'));
  update private.push_outbox o
  set delivered = array(
        select distinct e
        from unnest(o.delivered || array(
          select jsonb_array_elements_text(
            case when jsonb_typeof(r.value -> 'delivered') = 'array' then r.value -> 'delivered' else '[]'::jsonb end))) e
      ),
      locked_until = now() + make_interval(mins => o.attempts)
  from jsonb_array_elements(
    case when jsonb_typeof(p_retry) = 'array' then p_retry else '[]'::jsonb end) r
  where o.notification_id::text = r.value ->> 'id';
end;
$$;

-- Every minute: drop stale rows, then poke if something is waiting that no route call is holding.
create or replace function private.push_sweep()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.push_outbox o where o.queued_at < now() - interval '2 days';
  if exists (
    select 1 from private.push_outbox o
    where o.attempts < 5
      and (o.locked_until is null or o.locked_until < now())
      and o.queued_at < now() - interval '20 seconds'
  ) then
    perform private.push_poke();
  end if;
end;
$$;

revoke all on function private.push_secret() from public, anon, authenticated;
revoke all on function private.push_secret_ok(text) from public, anon, authenticated;
revoke all on function private.push_poke() from public, anon, authenticated;
revoke all on function private.push_enqueue() from public, anon, authenticated;
revoke all on function private.push_sweep() from public, anon, authenticated;
-- The route calls these with the publishable key and no session (role anon); the secret is the gate.
revoke all on function public.push_claim(text, integer) from public, anon, authenticated;
revoke all on function public.push_report(text, uuid[], text[], text[], text[], jsonb) from public, anon, authenticated;
grant execute on function public.push_claim(text, integer) to anon, service_role;
grant execute on function public.push_report(text, uuid[], text[], text[], text[], jsonb) to anon, service_role;

-- Scheduling by name replaces an existing job of the same name, so re-running this is safe.
select cron.schedule('hosa-push-sweep', '* * * * *', 'select private.push_sweep()');
select cron.schedule(
  'hosa-push-history',
  '17 3 * * *',
  $job$delete from cron.job_run_details where jobid in (select jobid from cron.job where jobname like 'hosa-push-%') and end_time < now() - interval '7 days'$job$
);
