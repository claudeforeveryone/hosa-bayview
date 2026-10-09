-- Animated GIF profile pictures are for executives only; everyone else keeps a still picture.
-- Enforced on the upload (storage: a .gif only into an executive's folder, by an executive) and on the profile
-- row (the guard). The app's save action also checks the bytes, since a moving picture can be named .webp;
-- someone writing their own row straight through the API could still slip a renamed one past that.

-- Storage: a .gif can only be uploaded by an executive. Restrictive, so it narrows the existing upload policies.
create policy "avatars: gifs are for executives"
  on storage.objects as restrictive for insert to authenticated
  with check (
    bucket_id <> 'avatars'
    or lower(name) not like '%.gif'
    or (
      private.is_executive()
      and exists (
        select 1 from public.profiles p
        where p.id::text = (storage.foldername(name))[1] and p.role = 'executive'
      )
    )
  );

-- Profile guard, as in 0045, plus: a GIF picture needs an executive owner, and stepping down from
-- executive drops a GIF picture (the member picks a still one again).
create or replace function private.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
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
  return new;
end
$$;
