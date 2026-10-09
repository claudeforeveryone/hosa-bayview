-- The storage policy (0062) lets an upload through when its size isn't known yet, so the size cap has to be
-- enforced where the picture is saved too. Otherwise a signed-in executive could upload a file to their own
-- folder and point profiles.avatar_path at it through PostgREST, skipping the picture action.
-- This extends private.guard_profile_update (0046, 0060, 0061): when avatar_path changes to a path, the object
-- must exist in the avatars bucket with a known size, and private.gif_size_ok must accept that size (1 MB,
-- or the bucket's 2 MB when the folder owner and the caller are both exempt). Everything before it is unchanged.
-- Written as CREATE OR REPLACE because the migration tool refuses DROP.

create or replace function private.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  avatar_meta jsonb;
begin
  if (select auth.uid()) is not null then
    if new.role is distinct from old.role and private.is_demo() then
      raise exception 'Demo accounts can''t change roles' using errcode = '42501';
    end if;
    if new.role is distinct from old.role and not private.is_executive()
       and coalesce(current_setting('hosa.passcode_grant', true), '') <> 'on' then
      raise exception 'Only executives can change roles' using errcode = '42501';
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
    if lower(new.avatar_path) like '%.gif' then
      new.avatar_path := null;
    end if;
  end if;
  if new.avatar_path is distinct from old.avatar_path
     and lower(new.avatar_path) like '%.gif'
     and new.role <> 'executive' then
    raise exception 'Only executives can use a GIF picture' using errcode = '42501';
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
$function$;
