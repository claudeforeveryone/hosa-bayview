-- 0281: members can delete notifications from their own inbox. Rows are still written only by triggers and
-- definer jobs; this only takes your own out of your list. A deleted one is stamped `dismissed_at` (and counts
-- as read, so the bell drops it); the inbox never shows it again. `ids` null clears every one you've already
-- read ("Clear read"), never unread ones. The rows go when the account does.

alter table public.notifications add column if not exists dismissed_at timestamptz;

create or replace function public.dismiss_notifications(ids uuid[] default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  hit integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.notifications n
     set dismissed_at = now(), read_at = coalesce(n.read_at, now())
   where n.user_id = (select auth.uid())
     and n.dismissed_at is null
     and (case when ids is null then n.read_at is not null else n.id = any (ids) end);
  get diagnostics hit = row_count;
  return hit;
end
$$;
revoke all on function public.dismiss_notifications(uuid[]) from public, anon;
grant execute on function public.dismiss_notifications(uuid[]) to authenticated;
