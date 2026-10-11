-- Locked accounts: their executive role and title can't be changed from the site by anyone, the account itself
-- and the chapter leads included. Only the SQL editor (no signed-in user) can change them.
--   private.locked_accounts  filled by hand in the SQL editor (no ids in the repo).
-- Same guard as 0101 plus the lock check.

create table if not exists private.locked_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade
);
revoke all on private.locked_accounts from public, anon, authenticated;

create or replace function private.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  avatar_meta jsonb;
begin
  if (select auth.uid()) is not null then
    if (new.role is distinct from old.role or new.title is distinct from old.title)
       and exists (select 1 from private.locked_accounts l where l.user_id = old.id) then
      raise exception 'This account''s role and title are locked' using errcode = '42501';
    end if;
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
