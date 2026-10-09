-- A display title that stands in for the role label (e.g. "Developer" for the member who builds the site while
-- holding executive access). Permissions still follow role; the title is only what people see. Executives set it.
alter table public.profiles
  add column title text check (title is null or char_length(btrim(title)) between 1 and 24);

-- Profile guard, as in 0033, plus: only executives change titles.
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
  end if;
  return new;
end
$$;

-- Picture, grade and now title for every member. The return type changes, so drop and recreate.
drop function public.member_details();
create function public.member_details()
returns table (user_id uuid, avatar_path text, grade smallint, title text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.avatar_path, p.grade, p.title
  from public.profiles p
  where (select auth.uid()) is not null
$$;
revoke all on function public.member_details() from public, anon;
grant execute on function public.member_details() to authenticated;
