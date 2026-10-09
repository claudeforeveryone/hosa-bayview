-- Profile creation never fails a signup, emails stay in sync, first-exec promotion is one-shot.

create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Member'), 60)
  );
  perform private.maybe_promote_first_exec(new.id, new.email, new.email_confirmed_at is not null);
  return new;
end
$$;

-- Promotion fires once: the setting is consumed on success, so the email can't be reused later.
create or replace function private.maybe_promote_first_exec(uid uuid, addr text, confirmed boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  first_exec text;
begin
  if not confirmed or addr is null then return; end if;
  perform pg_advisory_xact_lock(hashtext('hosa.executives'));
  select value into first_exec from private.settings where key = 'first_executive_email';
  if first_exec is null or lower(addr) <> lower(first_exec) then return; end if;
  if exists (select 1 from public.profiles where role = 'executive') then return; end if;
  update public.profiles set role = 'executive' where id = uid;
  delete from private.settings where key = 'first_executive_email';
end
$$;
revoke all on function private.maybe_promote_first_exec(uuid, text, boolean) from public, anon, authenticated;

-- Keep profiles.email in step with auth.users (the guard allows it only via this flag).
create function private.handle_user_email_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    perform set_config('hosa.syncing_email', 'on', true);
    update public.profiles set email = new.email where id = new.id;
    perform set_config('hosa.syncing_email', 'off', true);
  end if;
  return new;
end
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.handle_user_email_change();

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
       or new.created_at is distinct from old.created_at
       or (new.email is distinct from old.email
           and coalesce(current_setting('hosa.syncing_email', true), 'off') <> 'on') then
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

-- Trigger functions are never called directly.
revoke all on function private.handle_new_user(), private.handle_user_confirmed(), private.handle_user_email_change(),
  private.guard_profile_update(), private.guard_profile_delete() from public, anon, authenticated;
