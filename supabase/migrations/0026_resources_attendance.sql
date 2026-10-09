-- Follow-up to 0018 (already applied). Review fixes:
-- 1. Session notes are trainer-only: members lose column access to attendance_sessions.note and
--    read notes through attendance_session_notes(), which returns nothing for non-managers.
-- 2. Null jsonb inputs are rejected. jsonb_typeof(null) is null, so the old "<> 'object'" check let
--    a SQL null through, and save_attendance(null) then deleted every mark in the session.
-- 3. save_attendance only replaces marks for current members, so a former member keeps their history.
-- 4. save_attendance_day writes the session and its marks in one transaction (no half-saved day).

-- 1. Notes -------------------------------------------------------------------

revoke select on public.attendance_sessions from authenticated;
grant select (id, classroom_id, held_on, created_by, created_at) on public.attendance_sessions to authenticated;

create function public.attendance_session_notes(cid uuid)
returns table (session_id uuid, session_note text)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.note
  from public.attendance_sessions s
  where s.classroom_id = cid and private.can_manage_classroom(cid)
$$;

revoke all on function public.attendance_session_notes(uuid) from public, anon;
grant execute on function public.attendance_session_notes(uuid) to authenticated;

-- 2 and 3. Breakdown and marks: null guards, and former members keep their marks -------

create or replace function public.save_topic_weights(cid uuid, items jsonb)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
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

create or replace function public.save_attendance(sid uuid, statuses jsonb)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  cid uuid := private.session_classroom(sid);
begin
  if cid is null or not private.can_manage_classroom(cid) then
    raise exception 'Only the trainer or an executive can take attendance' using errcode = '42501';
  end if;
  if statuses is null or jsonb_typeof(statuses) is distinct from 'object' then
    raise exception 'Bad attendance list' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_each_text(statuses) e
    where e.value is null or e.value not in ('present', 'late', 'absent', 'excused')
  ) then
    raise exception 'Unknown attendance status' using errcode = '22023';
  end if;

  -- Replace marks for current members only. A former member keeps the marks they earned.
  delete from public.attendance_marks m
  where m.session_id = sid
    and exists (select 1 from public.classroom_members cm where cm.classroom_id = cid and cm.user_id = m.user_id)
    and not exists (select 1 from jsonb_each_text(statuses) e where e.key = m.user_id::text);

  insert into public.attendance_marks (session_id, user_id, status)
  select sid, e.key::uuid, e.value
  from jsonb_each_text(statuses) e
  where exists (
    select 1 from public.classroom_members cm
    where cm.classroom_id = cid and cm.user_id = e.key::uuid
  )
  on conflict (session_id, user_id) do update set status = excluded.status;
end
$$;

-- 4. One atomic save for a date ------------------------------------------------

create function public.save_attendance_day(p_classroom uuid, p_date date, p_note text, p_statuses jsonb)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  sid uuid;
begin
  if not private.can_manage_classroom(p_classroom) then
    raise exception 'Only the trainer or an executive can take attendance' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'Pick a real date' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'Keep the note under 500 characters' using errcode = '22023';
  end if;

  insert into public.attendance_sessions as s (classroom_id, held_on, note)
  values (p_classroom, p_date, coalesce(p_note, ''))
  on conflict (classroom_id, held_on) do update set note = excluded.note
  returning s.id into sid;

  -- Same transaction: if the marks are rejected, the session change rolls back too.
  perform public.save_attendance(sid, p_statuses);
  return sid;
end
$$;

revoke all on function public.save_attendance_day(uuid, date, text, jsonb) from public, anon;
grant execute on function public.save_attendance_day(uuid, date, text, jsonb) to authenticated;
