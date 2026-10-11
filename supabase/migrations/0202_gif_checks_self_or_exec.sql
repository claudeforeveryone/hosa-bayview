-- Omega security 0202 (audit M4). can_use_gif(uid) told any signed-in account whether any other member may use
-- moving pictures, and gif_exempt_ids() listed every size-exempt account to every signed-in account. Both are now
-- limited to the caller's own answer, or the full answer for an executive (the admin page, and uploads an executive
-- makes for someone else). Callers: picture-actions.ts (own uploads, executive uploads), settings page and profile
-- page (own exemption), admin page (executives).
create or replace function public.can_use_gif(uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (uid = (select auth.uid()) or private.is_executive())
    and private.gif_ok(uid)
$$;

create or replace function public.gif_exempt_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select x.user_id from private.gif_size_exempt x
  where (select auth.uid()) is not null
    and (x.user_id = (select auth.uid()) or private.is_executive())
$$;
