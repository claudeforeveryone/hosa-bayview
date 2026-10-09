-- Hardening after review of 0001.

-- Backfill: any auth user created before the trigger existed gets a profile.
insert into public.profiles (id, email, full_name)
select u.id, u.email,
  left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(split_part(u.email, '@', 1), ''), 'Member'), 60)
from auth.users u
where u.email is not null
on conflict (id) do nothing;

-- Bring rows from 0001 into range before the constraint validates them.
update public.profiles set full_name = 'Member' where trim(full_name) = '';
update public.profiles set full_name = left(full_name, 60) where char_length(full_name) > 60;

alter table public.profiles
  add constraint profiles_full_name_len check (char_length(full_name) between 1 and 60);

-- Profiles are removed only by deleting the auth user (admin API), which cascades.
drop policy "profiles: exec delete" on public.profiles;

-- First executive: only a confirmed email, and only while no executive exists.
create or replace function private.maybe_promote_first_exec(uid uuid, addr text, confirmed boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  first_exec text;
begin
  if not confirmed then return; end if;
  select value into first_exec from private.settings where key = 'first_executive_email';
  if first_exec is null or lower(addr) <> lower(first_exec) then return; end if;
  perform pg_advisory_xact_lock(hashtext('hosa.executives'));
  if exists (select 1 from public.profiles where role = 'executive') then return; end if;
  update public.profiles set role = 'executive' where id = uid;
end
$$;
revoke all on function private.maybe_promote_first_exec(uuid, text, boolean) from public, authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)), 60)
  );
  perform private.maybe_promote_first_exec(new.id, new.email, new.email_confirmed_at is not null);
  return new;
end
$$;

create function private.handle_user_confirmed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform private.maybe_promote_first_exec(new.id, new.email, true);
  end if;
  return new;
end
$$;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function private.handle_user_confirmed();

-- Guard: roles only by executives; id, email, created_at fixed; never zero executives.
create or replace function private.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    if new.role is distinct from old.role and not private.is_executive() then
      raise exception 'Only executives can change roles' using errcode = '42501';
    end if;
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at then
      raise exception 'Profile id, email and created_at cannot be changed' using errcode = '42501';
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

create function private.guard_profile_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'executive' then
    perform pg_advisory_xact_lock(hashtext('hosa.executives'));
    if (select count(*) from public.profiles where role = 'executive') <= 1 then
      raise exception 'There must be at least one executive' using errcode = 'P0001';
    end if;
  end if;
  return old;
end
$$;

create trigger guard_profile_delete
  before delete on public.profiles
  for each row execute function private.guard_profile_delete();

-- Helpers are for signed-in policy checks only.
revoke execute on function private.my_role(), private.is_executive(), private.can_teach() from public, anon;
grant execute on function private.my_role(), private.is_executive(), private.can_teach() to authenticated;
