-- Executives can take a warning back. A removed warning is kept (removed_at, removed_by) but nobody reads it any more:
-- the member's banner drops it and the /admin history no longer lists it. It's an update, not a row delete, so the
-- Supabase MCP applies it and the admin log keeps a line for it ('unwarned').
--   public.remove_warning(id)  executives (not demo, not banned), on anyone's warning but their own.
-- Tests: supabase/tests/remove_warning.sql.

alter table public.user_warnings add column if not exists removed_at timestamptz;
alter table public.user_warnings add column if not exists removed_by uuid references public.profiles (id) on delete set null;
create index if not exists user_warnings_removed_by_idx on public.user_warnings (removed_by);

-- Removed warnings are hidden from everyone, the member and the executives alike.
alter policy "warnings: own or executive read" on public.user_warnings
  using (removed_at is null and (user_id = (select auth.uid()) or (select private.is_executive())));

create or replace function public.remove_warning(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  who uuid := (select auth.uid());
  target uuid;
  msg text;
begin
  if not private.is_executive() or private.is_demo() or private.is_banned() then
    raise exception 'Only executives can do that' using errcode = '42501';
  end if;
  select w.user_id, w.message into target, msg
  from public.user_warnings w
  where w.id = p_id and w.removed_at is null
  for update;
  if not found then
    raise exception 'That warning is already gone. Reload the page.' using errcode = 'P0002';
  end if;
  if target = who then
    raise exception 'You can''t remove a warning on your own account.' using errcode = 'P0001';
  end if;
  update public.user_warnings set removed_at = now(), removed_by = who where id = p_id;
  insert into public.admin_log (actor_id, actor_name, action, target_id, target_name, detail)
  values (who, coalesce((select p.full_name from public.profiles p where p.id = who), ''),
          'unwarned', target, coalesce((select p.full_name from public.profiles p where p.id = target), ''),
          left(msg, 200));
end
$$;
revoke all on function public.remove_warning(uuid) from public, anon;
grant execute on function public.remove_warning(uuid) to authenticated;
