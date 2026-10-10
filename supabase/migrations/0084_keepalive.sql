-- Daily keep-alive: a real (empty) query for the Vercel cron, so the free project is not paused for inactivity.
-- Returns nothing and reads nothing a caller can see; anon may run it, nobody else needs to.
create or replace function public.keepalive()
returns void
language sql
security definer
set search_path = ''
as $$
  select 1 from pg_catalog.pg_class limit 1;
$$;

revoke all on function public.keepalive() from public, anon, authenticated;
grant execute on function public.keepalive() to anon;
