-- Who may hand out GIF pictures (0101) from /admin, instead of only by hand in the SQL editor.
--   private.gif_granters      named accounts, filled by hand in the SQL editor (no ids in the repo).
--   public.can_grant_gif()    for the UI: may the viewer turn GIF pictures on or off for people?
--   public.set_gif_user(u, b) adds or removes someone in private.gif_users. Granters only, and they must still be
--                             executives. Logged to admin_log. A GIF picture someone already has stays until they
--                             change it; the 0101 trigger and storage policy stop new ones.

create table if not exists private.gif_granters (
  user_id uuid primary key references public.profiles (id) on delete cascade
);
revoke all on private.gif_granters from public, anon, authenticated;

create or replace function private.can_grant_gif(uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select uid is not null
    and exists (select 1 from private.gif_granters g where g.user_id = uid)
    and exists (select 1 from public.profiles p where p.id = uid and p.role = 'executive')
$$;
revoke all on function private.can_grant_gif(uuid) from public, anon, authenticated;

create or replace function public.can_grant_gif()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.can_grant_gif((select auth.uid()))
$$;
revoke all on function public.can_grant_gif() from public, anon;
grant execute on function public.can_grant_gif() to authenticated;

create or replace function public.set_gif_user(target uuid, allowed boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  who uuid := (select auth.uid());
  who_name text;
  target_name text;
begin
  if not private.can_grant_gif(who) or private.is_demo() or private.is_banned() then
    raise exception 'Only some executives can give GIF pictures' using errcode = '42501';
  end if;
  select p.full_name into target_name from public.profiles p where p.id = target;
  if not found then
    raise exception 'That person is gone. Reload the page.' using errcode = 'P0002';
  end if;
  if allowed then
    insert into private.gif_users (user_id) values (target) on conflict do nothing;
  else
    delete from private.gif_users where user_id = target;
  end if;
  if found then
    select p.full_name into who_name from public.profiles p where p.id = who;
    insert into public.admin_log (actor_id, actor_name, action, target_id, target_name, detail)
    values (who, who_name, 'gif', target, target_name, case when allowed then 'on' else 'off' end);
  end if;
end
$$;
revoke all on function public.set_gif_user(uuid, boolean) from public, anon;
grant execute on function public.set_gif_user(uuid, boolean) to authenticated;
