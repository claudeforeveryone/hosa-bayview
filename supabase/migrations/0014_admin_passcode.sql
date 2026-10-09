-- Admin passcode: an executive sets a chapter passcode; anyone signed in who enters it becomes an executive.
-- Only a bcrypt hash is stored. Wrong guesses are limited per account (5 per 10 minutes).

create table private.passcode_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index passcode_attempts_idx on private.passcode_attempts (user_id, at);
revoke all on private.passcode_attempts from public, anon, authenticated;

-- Same guard as 0004, plus one door: claim_admin raises a transaction-local flag while it promotes.
create or replace function private.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
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

create function public.set_admin_passcode(code text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.is_executive() then
    raise exception 'Only executives can set the admin passcode' using errcode = '42501';
  end if;
  if code is null or char_length(code) not between 8 and 72 then
    raise exception 'Use 8 to 72 characters' using errcode = '22023';
  end if;
  insert into private.settings (key, value)
  values ('admin_passcode_hash', extensions.crypt(code, extensions.gen_salt('bf', 10)))
  on conflict (key) do update set value = excluded.value;
end
$$;

create function public.admin_passcode_is_set()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_executive() and exists (select 1 from private.settings where key = 'admin_passcode_hash')
$$;

create function public.claim_admin(code text)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  stored text;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if private.is_executive() then
    return true;
  end if;
  perform pg_advisory_xact_lock(hashtext('hosa.passcode:' || uid::text));
  if (select count(*) from private.passcode_attempts a
      where a.user_id = uid and a.at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many wrong passcodes. Try again in 10 minutes.' using errcode = '54000';
  end if;

  select value into stored from private.settings where key = 'admin_passcode_hash';
  if stored is null or code is null or extensions.crypt(code, stored) <> stored then
    insert into private.passcode_attempts (user_id) values (uid);
    return false;
  end if;

  perform set_config('hosa.passcode_grant', 'on', true);
  update public.profiles set role = 'executive' where id = uid;
  perform set_config('hosa.passcode_grant', 'off', true);
  delete from private.passcode_attempts where user_id = uid;
  return true;
end
$$;

revoke all on function public.set_admin_passcode(text), public.admin_passcode_is_set(), public.claim_admin(text) from public, anon;
grant execute on function public.set_admin_passcode(text), public.admin_passcode_is_set(), public.claim_admin(text) to authenticated;
