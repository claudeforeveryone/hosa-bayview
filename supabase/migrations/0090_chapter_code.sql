-- Task 13 (audit H1): a chapter code gates sign-up. Executives set or clear it in Admin; while it's set, a new
-- account needs it. Null (no row) means no gate, the old open sign-up.
--
-- How the check can't be skipped:
-- 1. check_chapter_code(code, ip) is the only way to test a code. It's rate limited (10 misses per IP and 100
--    misses overall per 10 minutes) and on a match hands back a random single-use ticket (15 minutes).
-- 2. The sign-up action passes that ticket in user metadata (chapter_ticket). A BEFORE INSERT trigger on
--    auth.users redeems it, so the account insert itself fails without one, whether the request came through
--    the site or straight to the auth API. No dashboard toggle or auth hook needed.
-- 3. The same trigger strips the ticket (and any chapter_code) from user metadata on every insert and update,
--    so nothing about the code stays on the account. Updates matter: with confirmation off, the auth server
--    writes its in-memory metadata back when it confirms the user.
-- Every account the auth server makes goes through this, so while a gate is on the dashboard's "Add user" and
-- "Invite" (and any OAuth or magic-link sign-up) are refused too: clear the code first, or add the user in SQL.
-- Until this migration is applied the site treats the missing RPCs as "no gate" and hides the Admin section.
-- Only a bcrypt hash of the code is stored (private.settings chapter_passcode_hash); IPs are stored hashed.
-- Rows written from a direct SQL session (postgres, supabase_admin: migrations, the SQL editor, the checks in
-- supabase/tests) skip the check, so test fixtures still work while a gate is on. Setting
-- hosa.chapter_code_check = 'on' forces it there, for the tests.

create table if not exists private.chapter_code_attempts (
  ip_hash text not null,
  at timestamptz not null default now()
);
create index if not exists chapter_code_attempts_at_idx on private.chapter_code_attempts (at);
create index if not exists chapter_code_attempts_ip_idx on private.chapter_code_attempts (ip_hash, at);
revoke all on private.chapter_code_attempts from public, anon, authenticated;

create table if not exists private.chapter_code_tickets (
  ticket_hash text primary key,
  expires_at timestamptz not null
);
revoke all on private.chapter_code_tickets from public, anon, authenticated;

-- Public: is a gate on? Boolean only, so the sign-up form knows whether to show the field.
create or replace function public.chapter_gate_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.settings where key = 'chapter_passcode_hash')
$$;
revoke all on function public.chapter_gate_active() from public;
grant execute on function public.chapter_gate_active() to anon, authenticated;

-- Test a code. Returns a single-use ticket on a match, null on a miss (or when no gate is set).
-- Raises 54000 when the IP or the whole site has too many recent misses. ip comes from the sign-up action;
-- a caller can lie about it, which is why the overall cap exists.
create or replace function public.check_chapter_code(code text, ip text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  stored text;
  ip_key text := encode(extensions.digest(coalesce(nullif(left(trim(ip), 100), ''), 'unknown'), 'sha256'), 'hex');
  ticket text;
begin
  select value into stored from private.settings where key = 'chapter_passcode_hash';
  if stored is null then
    return null;
  end if;
  -- One lock for everyone, so parallel guesses can't race past the counts.
  perform pg_advisory_xact_lock(hashtext('hosa.chapter_code'));
  if (select count(*) from private.chapter_code_attempts a where a.at > now() - interval '10 minutes') >= 100
     or (select count(*) from private.chapter_code_attempts a
         where a.ip_hash = ip_key and a.at > now() - interval '10 minutes') >= 10 then
    raise exception 'Too many wrong chapter codes. Try again in 10 minutes.' using errcode = '54000';
  end if;

  if code is null or char_length(code) > 72 or extensions.crypt(code, stored) <> stored then
    insert into private.chapter_code_attempts (ip_hash) values (ip_key);
    delete from private.chapter_code_attempts where at < now() - interval '1 day';
    return null;
  end if;

  ticket := encode(extensions.gen_random_bytes(24), 'hex');
  delete from private.chapter_code_tickets where expires_at < now();
  insert into private.chapter_code_tickets (ticket_hash, expires_at)
  values (encode(extensions.digest(ticket, 'sha256'), 'hex'), now() + interval '15 minutes');
  return ticket;
end
$$;
revoke all on function public.check_chapter_code(text, text) from public;
grant execute on function public.check_chapter_code(text, text) to anon, authenticated;

-- Uses up a ticket. True if it was live.
create or replace function private.redeem_chapter_ticket(ticket text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if ticket is null or ticket = '' then
    return false;
  end if;
  delete from private.chapter_code_tickets
  where ticket_hash = encode(extensions.digest(ticket, 'sha256'), 'hex') and expires_at > now();
  return found;
end
$$;
revoke all on function private.redeem_chapter_ticket(text) from public, anon, authenticated;

create or replace function private.guard_chapter_code()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ticket text := case when jsonb_typeof(new.raw_user_meta_data) = 'object'
                      then new.raw_user_meta_data ->> 'chapter_ticket' end;
begin
  if jsonb_typeof(new.raw_user_meta_data) = 'object' then
    new.raw_user_meta_data := new.raw_user_meta_data - 'chapter_ticket' - 'chapter_code';
  end if;
  if tg_op = 'INSERT'
     and exists (select 1 from private.settings where key = 'chapter_passcode_hash')
     and (session_user not in ('postgres', 'supabase_admin')
          or coalesce(current_setting('hosa.chapter_code_check', true), '') = 'on')
     and not private.redeem_chapter_ticket(ticket) then
    raise exception 'Wrong chapter code' using errcode = '28000';
  end if;
  return new;
end
$$;
revoke all on function private.guard_chapter_code() from public, anon, authenticated;

create or replace trigger on_auth_user_chapter_code
  before insert or update of raw_user_meta_data on auth.users
  for each row execute function private.guard_chapter_code();

-- Executives: set (or change) the code. 6 to 72 characters. Old tickets stop working.
create or replace function public.set_chapter_passcode(code text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  who text;
  was_set boolean;
begin
  if not private.is_executive() or private.is_banned() or private.is_demo() then
    raise exception 'Only executives can set the chapter code' using errcode = '42501';
  end if;
  if code is null or char_length(code) not between 6 and 72 then
    raise exception 'Use 6 to 72 characters' using errcode = '22023';
  end if;
  was_set := exists (select 1 from private.settings where key = 'chapter_passcode_hash');
  insert into private.settings (key, value)
  values ('chapter_passcode_hash', extensions.crypt(code, extensions.gen_salt('bf', 10)))
  on conflict (key) do update set value = excluded.value;
  delete from private.chapter_code_tickets where true;

  who := coalesce((select p.full_name from public.profiles p where p.id = uid), 'An executive');
  insert into public.admin_log (actor_id, actor_name, action, detail)
  values (uid, who, 'chapter_code', case when was_set then 'Chapter code changed' else 'Chapter code turned on' end);
  perform private.notify(
    array(select p.id from public.profiles p where p.role = 'executive' and p.id <> uid),
    'role',
    who || case when was_set then ' changed the chapter code' else ' turned on the chapter code' end,
    'New members need it to sign up. Change or clear it in Admin.', '/admin');
end
$$;
revoke all on function public.set_chapter_passcode(text) from public, anon;
grant execute on function public.set_chapter_passcode(text) to authenticated;

-- Executives: clear the code, so sign-up is open again. Does nothing if none is set.
create or replace function public.clear_chapter_passcode()
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  who text;
begin
  if not private.is_executive() or private.is_banned() or private.is_demo() then
    raise exception 'Only executives can clear the chapter code' using errcode = '42501';
  end if;
  delete from private.settings where key = 'chapter_passcode_hash';
  if not found then
    return;
  end if;
  delete from private.chapter_code_tickets where true;

  who := coalesce((select p.full_name from public.profiles p where p.id = uid), 'An executive');
  insert into public.admin_log (actor_id, actor_name, action, detail)
  values (uid, who, 'chapter_code', 'Chapter code cleared');
  perform private.notify(
    array(select p.id from public.profiles p where p.role = 'executive' and p.id <> uid),
    'role', who || ' turned off the chapter code',
    'Anyone with the link can sign up until a new code is set.', '/admin');
end
$$;
revoke all on function public.clear_chapter_passcode() from public, anon;
grant execute on function public.clear_chapter_passcode() to authenticated;
