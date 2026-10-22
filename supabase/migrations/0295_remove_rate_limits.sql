-- 0295: no more "too many tries". The owner's call (2026-10-22): during a school presentation a whole meeting
-- signed up and joined from one network at once, and members must never be locked out for typing a code wrong.
--   join_classroom      no 10-misses-per-10-minutes cap; misses are no longer logged.
--   check_chapter_code  no 30-per-IP or 300-overall cap; misses are no longer logged. The ip argument stays so
--                       the sign-up action's call keeps working.
-- private.join_attempts and private.chapter_code_attempts stay (the MCP can't drop them); nothing writes to them.

create or replace function public.join_classroom(code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean text := upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
  cid uuid;
  owner_uid uuid;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select id, owner_id into cid, owner_uid from public.classrooms where join_code = clean;
  if cid is null then
    return null;
  end if;

  if owner_uid is distinct from uid then
    insert into public.classroom_members (classroom_id, user_id) values (cid, uid)
    on conflict do nothing;
  end if;
  return cid;
end
$$;

create or replace function public.check_chapter_code(code text, ip text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  stored text;
  ticket text;
begin
  select value into stored from private.settings where key = 'chapter_passcode_hash';
  if stored is null then
    return null;
  end if;

  if code is null or char_length(code) > 72 or extensions.crypt(code, stored) <> stored then
    return null;
  end if;

  ticket := encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.chapter_code_tickets (ticket_hash, expires_at)
  values (encode(extensions.digest(ticket, 'sha256'), 'hex'), now() + interval '15 minutes');
  return ticket;
end
$$;
revoke all on function public.check_chapter_code(text, text) from public, anon, authenticated;
grant execute on function public.check_chapter_code(text, text) to service_role;
