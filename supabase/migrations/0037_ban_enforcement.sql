-- Ban enforcement, part two (additive; main's code keeps working).
-- 1. A ban also sets auth.users.banned_until, so GoTrue refuses sign-in and token refresh.
-- 2. A banned account's writes are refused in every classroom table, not only the activity and flashcard ones.
-- 3. Profile pictures move to a private bucket; the app serves them through short-lived signed URLs.

-- 1. Sign-in ---------------------------------------------------------------

-- Permanent bans store a far-future date: the auth server parses a plain timestamp, not 'infinity'.
create or replace function public.ban_member(p_user uuid, p_until timestamptz, p_reason text)
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
  update auth.users set banned_until = least(p_until, '9999-12-31 23:59:59+00'::timestamptz) where id = p_user;
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
end
$$;

create or replace function public.unban_member(p_user uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform private.moderation_target(p_user);
  perform set_config('hosa.moderation', 'on', true);
  update public.profiles set banned_until = null, ban_reason = null where id = p_user;
  perform set_config('hosa.moderation', 'off', true);
  update auth.users set banned_until = null where id = p_user;
end
$$;

-- 2. Writes ----------------------------------------------------------------

-- Profiles: a banned account can't edit its own row. Executives' moderation writes set hosa.moderation.
create function private.refuse_when_banned_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.is_banned() and coalesce(current_setting('hosa.moderation', true), '') <> 'on' then
    raise exception 'Your account is banned' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function private.refuse_when_banned_profile() from public, anon;

create trigger refuse_when_banned before insert or update on public.profiles
  for each row execute function private.refuse_when_banned_profile();

create trigger refuse_when_banned before insert or update on public.classrooms
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert or update on public.tests
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert or update on public.questions
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert or update on public.resources
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert or update on public.attendance_sessions
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert or update on public.attendance_marks
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert or update on public.topic_weights
  for each row execute function private.refuse_when_banned();

-- The two RPCs that write attendance and the breakdown check the ban first, so the refusal is the first thing seen.
create or replace function public.save_topic_weights(cid uuid, items jsonb)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if private.is_banned() then
    raise exception 'Your account is banned' using errcode = '42501';
  end if;
  if not private.can_manage_classroom(cid) then
    raise exception 'Only the trainer or an executive can edit the breakdown' using errcode = '42501';
  end if;
  if items is null or jsonb_typeof(items) is distinct from 'array' then
    raise exception 'Bad breakdown list' using errcode = '22023';
  end if;
  if jsonb_array_length(items) > 30 then
    raise exception 'Use up to 30 topics' using errcode = '22023';
  end if;
  delete from public.topic_weights where classroom_id = cid;
  insert into public.topic_weights (classroom_id, topic, percent, position)
  select cid, trim(t.item->>'topic'), (t.item->>'percent')::integer, t.ord::integer - 1
  from jsonb_array_elements(items) with ordinality as t(item, ord);
end
$$;

create or replace function public.save_attendance_week(p_classroom uuid, p_week date, p_note text, p_statuses jsonb)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  sid uuid;
begin
  if private.is_banned() then
    raise exception 'Your account is banned' using errcode = '42501';
  end if;
  if not private.can_manage_classroom(p_classroom) then
    raise exception 'Only the trainer or an executive can take attendance' using errcode = '42501';
  end if;
  if p_week is null or extract(isodow from p_week) <> 1 then
    raise exception 'Pick a week that starts on a Monday' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'Keep the note under 500 characters' using errcode = '22023';
  end if;

  insert into public.attendance_sessions as s (classroom_id, week_start, note)
  values (p_classroom, p_week, coalesce(p_note, ''))
  on conflict (classroom_id, week_start) do update
    set note = excluded.note,
        updated_at = now(),
        updated_by = (select auth.uid())
  returning s.id into sid;

  perform public.save_attendance(sid, p_statuses);
  return sid;
end
$$;

-- 3. Pictures -----------------------------------------------------------
-- Private bucket: the read policy from 0033 (signed-in members only) still applies, and the app hands out
-- signed URLs that expire in an hour. Nothing is reachable without a session.
update storage.buckets set public = false where id = 'avatars';
