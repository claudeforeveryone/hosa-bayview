-- First-exec promotion happens only at signup, never when an older unconfirmed row is confirmed later,
-- so a squatter who pre-registers the address can't be promoted by the owner clicking a link.
drop trigger on_auth_user_confirmed on auth.users;
drop function private.handle_user_confirmed();

-- Email sync runs from the auth server (no JWT), where the guard already allows it; the flag is gone.
create or replace function private.handle_user_email_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end
$$;

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

revoke all on function private.handle_user_email_change(), private.guard_profile_update() from public, anon, authenticated;
