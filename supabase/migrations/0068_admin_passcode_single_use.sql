-- Task 10 (audit M3): the admin passcode stops being a standing bearer secret.
-- 1. The miss limit is global: 10 wrong tries in 10 minutes, across every account, locks claiming for
--    everyone (free accounts made the old per-account limit easy to spread out).
-- 2. Single use: a successful claim deletes the hash, so an executive sets a new one for the next admin.
-- 3. Every other executive gets a notification, and the claim lands in the admin log.

create index if not exists passcode_attempts_at_idx on private.passcode_attempts (at);

create or replace function public.claim_admin(code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  stored text;
  who text;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if private.is_executive() then
    return true;
  end if;
  -- One lock for everyone, so parallel guesses from many accounts can't race past the limit.
  perform pg_advisory_xact_lock(hashtext('hosa.passcode'));
  if (select count(*) from private.passcode_attempts a where a.at > now() - interval '10 minutes') >= 10 then
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

  -- Used up: the next admin needs a new passcode from an executive. Recent misses go with it.
  delete from private.settings where key = 'admin_passcode_hash';
  delete from private.passcode_attempts where at > now() - interval '10 minutes';

  who := coalesce((select p.full_name from public.profiles p where p.id = uid), 'Someone');
  insert into public.admin_log (actor_id, actor_name, action, target_id, target_name, detail)
  values (uid, who, 'passcode_used', uid, who, 'Admin passcode used, then cleared');
  perform private.notify(
    array(select p.id from public.profiles p where p.role = 'executive' and p.id <> uid),
    'role', who || ' used the admin passcode and is now an executive',
    'The passcode is cleared. Set a new one in Settings for the next admin.', '/admin');
  return true;
end
$$;
revoke all on function public.claim_admin(text) from public, anon;
grant execute on function public.claim_admin(text) to authenticated;
