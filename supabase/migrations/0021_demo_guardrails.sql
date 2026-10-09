-- Demo admins can look around as executives but can't change who has power:
-- no role changes, no admin passcode, no demo switch. Enforced here, not just in the UI.

create function private.is_demo()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.demo_accounts d where d.user_id = (select auth.uid()))
$$;
revoke all on function private.is_demo() from public, anon;
grant execute on function private.is_demo() to authenticated;

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
revoke all on function private.guard_profile_update() from public, anon, authenticated;

create or replace function public.set_admin_passcode(code text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.is_executive() or private.is_demo() then
    raise exception 'Only executives can set the admin passcode' using errcode = '42501';
  end if;
  if code is null or char_length(code) not between 12 and 72 then
    raise exception 'Use 12 to 72 characters' using errcode = '22023';
  end if;
  insert into private.settings (key, value)
  values ('admin_passcode_hash', extensions.crypt(code, extensions.gen_salt('bf', 10)))
  on conflict (key) do update set value = excluded.value;
end
$$;

create or replace function public.set_demo_login(enabled boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  d record;
  pw text;
begin
  if not private.is_executive() or private.is_demo() then
    raise exception 'Only executives can change demo sign-in' using errcode = '42501';
  end if;
  update private.settings set value = case when enabled then 'on' else 'off' end where key = 'demo_login';
  if not enabled then
    for d in select * from private.demo_accounts loop
      pw := encode(extensions.gen_random_bytes(24), 'hex');
      update auth.users set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf')) where id = d.user_id;
      update private.demo_accounts set secret = pw where slug = d.slug;
      delete from auth.sessions where user_id = d.user_id;
    end loop;
  end if;
end
$$;

-- So the app can hide emails and controls from demo accounts.
create function public.am_demo()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_demo()
$$;
revoke all on function public.am_demo() from public, anon;
grant execute on function public.am_demo() to authenticated;
