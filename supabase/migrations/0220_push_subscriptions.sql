-- Omega PWA track: Web Push subscriptions.
--
-- One row per browser subscription. The endpoint is the push service's address for that browser, so it is unique:
-- if a shared phone is later signed in as another member, push_subscribe moves the row to that member. Members can
-- read, delete and change the sound setting of their own rows only; rows are written through push_subscribe. No user
-- agent, IP or location is stored (Omega plan, analytics rules).

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique
    check (char_length(endpoint) between 20 and 2048 and endpoint like 'https://%'),
  -- The browser's P-256 public key (65 bytes) and auth secret (16 bytes), base64url as PushSubscription.toJSON() gives them.
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}={0,2}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}={0,2}$'),
  -- Mirrors the device's "Notification sound" setting (Settings > Sound). Off sends the push silent.
  sound boolean not null default true,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0)
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select (id, user_id, endpoint, sound, created_at, last_success_at) on public.push_subscriptions to authenticated;
grant update (sound) on public.push_subscriptions to authenticated;
grant delete on public.push_subscriptions to authenticated;

create policy "push_subscriptions: own read" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "push_subscriptions: own sound" on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "push_subscriptions: own delete" on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Save this browser's subscription for the signed-in member. Only the push services browsers actually use are
-- accepted (the regex is the allowlist; src/lib/push/endpoints.ts checks the same list first). The write runs as the
-- owner so an endpoint that belonged to another member on this device moves over.
create or replace function public.push_subscribe(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_sound boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  other_devices integer;
begin
  if uid is null then
    raise exception 'Sign in to turn on notifications' using errcode = '42501';
  end if;
  if p_endpoint is null
     or char_length(p_endpoint) > 2048
     or p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com)(:443)?/' then
    raise exception 'That push service is not allowed' using errcode = '22023';
  end if;
  select count(*) into other_devices
  from public.push_subscriptions s
  where s.user_id = uid and s.endpoint <> p_endpoint;
  if other_devices >= 12 then
    raise exception 'This account already has 12 devices with notifications on' using errcode = '53400';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, sound)
  values (uid, p_endpoint, p_p256dh, p_auth, coalesce(p_sound, true))
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    sound = excluded.sound,
    failure_count = 0,
    created_at = case
      when public.push_subscriptions.user_id = excluded.user_id then public.push_subscriptions.created_at
      else now()
    end;
end;
$$;

revoke all on function public.push_subscribe(text, text, text, boolean) from public, anon;
grant execute on function public.push_subscribe(text, text, text, boolean) to authenticated;
