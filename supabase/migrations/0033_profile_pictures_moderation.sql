-- Profile pictures, grade level, and executive moderation (warn, ban, remove).
-- Demo executives can't moderate anyone or change other people's pictures.
-- Bans are enforced in the app (requireProfile sends banned users to /banned) and in the database:
-- a banned user's writes to the activity, attempt, flashcard, and classroom tables are refused.

-- 1. Columns ------------------------------------------------------------

alter table public.profiles
  add column avatar_path text,
  add column grade smallint,
  add column banned_until timestamptz,
  add column ban_reason text;

alter table public.profiles
  add constraint profiles_grade_range check (grade between 9 and 12),
  -- Pictures live in the owner's folder: "<user_id>/<random>.webp" (or .jpg).
  add constraint profiles_avatar_path_shape check (
    avatar_path is null
    or (avatar_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
        and split_part(avatar_path, '/', 1) = id::text)
  ),
  add constraint profiles_ban_reason_len check (ban_reason is null or char_length(ban_reason) between 1 and 200);

-- 2. Avatars bucket -----------------------------------------------------
-- Public read (the names are random uuids). Writes are limited by the policies below.

-- True while the signed-in account is under a ban. Used by the storage policies and the write guard.
create function private.is_banned()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.banned_until > now()
  )
$$;
revoke all on function private.is_banned() from public, anon;
grant execute on function private.is_banned() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "avatars: signed-in read"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

create policy "avatars: members upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not private.is_banned()
  );

create policy "avatars: members remove from own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not private.is_banned()
  );

-- Executives (not demo accounts) can replace or remove anyone's picture.
create policy "avatars: executives upload to any folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and private.is_executive()
    and not private.is_demo()
    and not private.is_banned()
  );

create policy "avatars: executives remove from any folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and private.is_executive()
    and not private.is_demo()
    and not private.is_banned()
  );

-- 3. Ban helpers --------------------------------------------------------

-- Writes from a banned account fail with 42501, whether they come through an RPC or a direct insert.
create function private.refuse_when_banned()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.is_banned() then
    raise exception 'Your account is banned' using errcode = '42501';
  end if;
  return new;
end
$$;

revoke all on function private.refuse_when_banned() from public, anon;

create trigger refuse_when_banned before insert or update on public.decks
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert or update on public.cards
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert or update on public.card_reviews
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert or update on public.attempts
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert or update on public.attempt_answers
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert or update on public.activity_minutes
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert or update on public.presence
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert or update on public.classroom_members
  for each row execute function private.refuse_when_banned();

-- 4. Profile guard: moderation fields only through the moderation RPCs; demo can't touch others' pictures.

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

-- 5. Sign-up: grade comes in with the account metadata. A bad value is dropped, never fails the signup.

create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, grade)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Member'), 60),
    case when (new.raw_user_meta_data ->> 'grade') ~ '^(9|10|11|12)$'
      then (new.raw_user_meta_data ->> 'grade')::smallint end
  );
  perform private.maybe_promote_first_exec(new.id, new.email, new.email_confirmed_at is not null);
  return new;
end
$$;

-- 6. Warnings -----------------------------------------------------------

create table public.user_warnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  issued_by uuid references public.profiles (id) on delete set null,
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index user_warnings_user_idx on public.user_warnings (user_id, created_at desc);
alter table public.user_warnings enable row level security;
revoke all on public.user_warnings from public, anon, authenticated;
grant select on public.user_warnings to authenticated;

-- A member reads their own warnings; executives read everyone's history.
create policy "warnings: own or executive read"
  on public.user_warnings for select to authenticated
  using (user_id = (select auth.uid()) or private.is_executive());

-- 7. Moderation RPCs ----------------------------------------------------

-- The gate for warn, ban, unban and remove: a signed-in, non-demo executive acting on a member who
-- isn't an executive and isn't themselves. Demote first.
create function private.moderation_target(p_user uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  target_role public.app_role;
begin
  if not private.is_executive() or private.is_demo() then
    raise exception 'Only executives can do that' using errcode = '42501';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'You can''t moderate your own account' using errcode = 'P0001';
  end if;
  select p.role into target_role from public.profiles p where p.id = p_user;
  if target_role is null then
    raise exception 'That person is gone. Reload the page.' using errcode = 'P0002';
  end if;
  if target_role = 'executive' then
    raise exception 'Demote them first. Executives can''t be warned, banned or removed.' using errcode = 'P0001';
  end if;
end
$$;

create function public.warn_member(p_user uuid, p_message text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  msg text := btrim(coalesce(p_message, ''));
  new_id uuid;
begin
  perform private.moderation_target(p_user);
  if char_length(msg) not between 1 and 500 then
    raise exception 'Write a warning of 1 to 500 characters' using errcode = '22023';
  end if;
  insert into public.user_warnings (user_id, issued_by, message)
  values (p_user, (select auth.uid()), msg)
  returning id into new_id;
  return new_id;
end
$$;

-- p_until: the moment the ban ends (infinity for permanent). Ends every session the member has.
create function public.ban_member(p_user uuid, p_until timestamptz, p_reason text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform private.moderation_target(p_user);
  if p_until is null or p_until <= now() then
    raise exception 'Pick a time after now' using errcode = '22023';
  end if;
  if reason is not null and char_length(reason) > 200 then
    raise exception 'Keep the reason under 200 characters' using errcode = '22023';
  end if;
  perform set_config('hosa.moderation', 'on', true);
  update public.profiles set banned_until = p_until, ban_reason = reason where id = p_user;
  perform set_config('hosa.moderation', 'off', true);
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
end
$$;

create function public.unban_member(p_user uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform private.moderation_target(p_user);
  perform set_config('hosa.moderation', 'on', true);
  update public.profiles set banned_until = null, ban_reason = null where id = p_user;
  perform set_config('hosa.moderation', 'off', true);
end
$$;

-- Deletes the account (the profile and everything keyed to it cascades). Returns the picture path so
-- the app can remove the file from storage; the file itself isn't deleted by SQL.
create function public.remove_member(p_user uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  old_path text;
begin
  perform private.moderation_target(p_user);
  select p.avatar_path into old_path from public.profiles p where p.id = p_user;
  delete from auth.users where id = p_user;
  return old_path;
end
$$;

-- A member marks their own warning as read.
create function public.acknowledge_warning(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  update public.user_warnings
  set seen_at = now()
  where id = p_id and user_id = (select auth.uid()) and seen_at is null;
end
$$;

-- Picture and grade for every member, for the directory, leaderboard and profile pages. No emails.
create function public.member_details()
returns table (user_id uuid, avatar_path text, grade smallint)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.avatar_path, p.grade
  from public.profiles p
  where (select auth.uid()) is not null
$$;

revoke all on function private.moderation_target(uuid) from public, anon, authenticated;
revoke all on function
  public.warn_member(uuid, text), public.ban_member(uuid, timestamptz, text), public.unban_member(uuid),
  public.remove_member(uuid), public.acknowledge_warning(uuid), public.member_details()
  from public, anon;
grant execute on function
  public.warn_member(uuid, text), public.ban_member(uuid, timestamptz, text), public.unban_member(uuid),
  public.remove_member(uuid), public.acknowledge_warning(uuid), public.member_details()
  to authenticated;
