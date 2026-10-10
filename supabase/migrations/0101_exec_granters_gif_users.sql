-- Who may hand out executive, and who may use a GIF picture, become named accounts instead of "any executive".
-- New accounts still start as trainee (the column default). The account ids live in two private tables filled
-- by hand in the SQL editor (this repo is public, so no ids or emails here):
--   private.exec_granters: the chapter leads. Only they can make someone an executive or take it away.
--   private.gif_users:     accounts allowed an animated (GIF) picture, whatever their role.
-- The admin passcode route (claim_admin) is closed: it would let anyone with the code make themselves an
-- executive without a chapter lead.

create table if not exists private.exec_granters (
  user_id uuid primary key references public.profiles (id) on delete cascade
);
create table if not exists private.gif_users (
  user_id uuid primary key references public.profiles (id) on delete cascade
);
revoke all on private.exec_granters, private.gif_users from public, anon, authenticated;

create or replace function private.can_grant_exec(uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select uid is not null and exists (select 1 from private.exec_granters g where g.user_id = uid)
$$;
revoke all on function private.can_grant_exec(uuid) from public, anon, authenticated;

create or replace function private.gif_ok(uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select uid is not null and exists (select 1 from private.gif_users g where g.user_id = uid)
$$;
revoke all on function private.gif_ok(uuid) from public, anon, authenticated;

-- For storage policies: is the folder (first path segment, the owner's id) a GIF account?
create or replace function private.gif_folder_ok(object_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.gif_users g where g.user_id::text = (storage.foldername(object_name))[1]
  )
$$;
revoke all on function private.gif_folder_ok(text) from public, anon;
grant execute on function private.gif_folder_ok(text) to authenticated;

-- What the signed-in person may do, for the UI (the database enforces it either way).
create or replace function public.my_powers()
returns table (grant_exec boolean, gif boolean)
language sql stable security definer set search_path = ''
as $$
  select private.can_grant_exec((select auth.uid())), private.gif_ok((select auth.uid()))
$$;
revoke all on function public.my_powers() from public, anon;
grant execute on function public.my_powers() to authenticated;

-- Whether one account may have a GIF picture (an executive editing someone else's picture asks this).
create or replace function public.can_use_gif(uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and private.gif_ok(uid)
$$;
revoke all on function public.can_use_gif(uuid) from public, anon;
grant execute on function public.can_use_gif(uuid) to authenticated;

-- Same guard as before, with two changes: giving or removing executive needs a chapter lead (the passcode
-- grant is gone), and a GIF picture needs a GIF account instead of the executive role.
create or replace function private.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  avatar_meta jsonb;
begin
  if (select auth.uid()) is not null then
    if new.role is distinct from old.role and private.is_demo() then
      raise exception 'Demo accounts can''t change roles' using errcode = '42501';
    end if;
    if new.role is distinct from old.role and not private.is_executive() then
      raise exception 'Only executives can change roles' using errcode = '42501';
    end if;
    if new.role is distinct from old.role
       and (new.role = 'executive' or old.role = 'executive')
       and not private.can_grant_exec((select auth.uid())) then
      raise exception 'Only the chapter leads can give or remove executive' using errcode = '42501';
    end if;
    if new.title is distinct from old.title and (private.is_demo() or not private.is_executive()) then
      raise exception 'Only executives can change titles' using errcode = '42501';
    end if;
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at then
      raise exception 'Profile id, email and created_at cannot be changed' using errcode = '42501';
    end if;
    if (new.banned_until is distinct from old.banned_until or new.ban_reason is distinct from old.ban_reason)
       and coalesce(current_setting('hosa.moderation', true), '') <> 'on' then
      raise exception 'Only the moderation tools can change a ban' using errcode = '42501';
    end if;
    if new.avatar_path is distinct from old.avatar_path
       and new.id <> (select auth.uid())
       and private.is_demo() then
      raise exception 'Demo accounts can''t change other people''s pictures' using errcode = '42501';
    end if;
  end if;
  if old.role = 'executive' and new.role <> 'executive' then
    perform pg_advisory_xact_lock(hashtext('hosa.executives'));
    if (select count(*) from public.profiles where role = 'executive') <= 1 then
      raise exception 'There must be at least one executive' using errcode = 'P0001';
    end if;
  end if;
  if new.avatar_path is distinct from old.avatar_path
     and lower(new.avatar_path) like '%.gif'
     and not private.gif_ok(new.id) then
    raise exception 'GIF pictures are limited to a few accounts' using errcode = '42501';
  end if;
  -- Size check on the saved file. A missing object or an unknown size is refused (fails closed).
  if new.avatar_path is distinct from old.avatar_path and new.avatar_path is not null then
    select o.metadata into avatar_meta
      from storage.objects o
      where o.bucket_id = 'avatars' and o.name = new.avatar_path;
    if not found then
      raise exception 'That picture file is missing. Upload it again.' using errcode = '42501';
    end if;
    if (avatar_meta ->> 'size') is null
       or not private.gif_size_ok(new.avatar_path, avatar_meta) then
      raise exception 'That picture is over the size limit.' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

-- Uploading a .gif into someone's avatar folder needs that folder's owner to be a GIF account.
alter policy "avatars: gifs are for executives" on storage.objects
  with check ((bucket_id <> 'avatars') or (lower(name) not like '%.gif') or private.gif_folder_ok(name));

-- The passcode route is closed. Kept as a function so old clients get a clear answer, not a missing RPC.
create or replace function public.claim_admin(code text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if private.is_executive() then
    return true;
  end if;
  raise exception 'Executive access is given by the chapter leads' using errcode = '42501';
end
$$;
