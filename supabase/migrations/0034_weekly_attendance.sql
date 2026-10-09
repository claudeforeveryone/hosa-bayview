-- Weekly attendance (0034). A session is now one classroom and one Monday-start week, not one date.
-- The app works in Toronto time, so the week is just the Monday date that the day falls in.
--
-- Existing per-day sessions map to the Monday of their week. The database has no attendance data
-- yet, but if a classroom had several days in one week, the latest day survives: its note is kept
-- with any earlier notes appended (capped at 500 characters), and marks that exist only on an
-- earlier day are copied over (the survivor's own mark always wins). The earlier session rows are
-- then deleted. The held_on column goes away; the week replaces it.
--
-- Submitted and edited: the first save sets submitted_at and submitted_by. Each later save sets
-- updated_at and updated_by. Saving is one RPC (save_attendance_week), so the week, its note and
-- its marks commit together.

-- 1. Columns ---------------------------------------------------------------------

alter table public.attendance_sessions
  add column week_start date,
  add column submitted_at timestamptz,
  add column submitted_by uuid references public.profiles (id) on delete set null,
  add column updated_at timestamptz,
  add column updated_by uuid references public.profiles (id) on delete set null;

update public.attendance_sessions
set week_start = held_on - (extract(isodow from held_on)::int - 1),
    submitted_at = created_at,
    submitted_by = created_by;

-- 2. Merge days that share a week ---------------------------------------------------

do $$
declare
  grp record;
  keep uuid;
begin
  for grp in
    select s.classroom_id, s.week_start
    from public.attendance_sessions s
    group by s.classroom_id, s.week_start
    having count(*) > 1
  loop
    select s.id into keep
    from public.attendance_sessions s
    where s.classroom_id = grp.classroom_id and s.week_start = grp.week_start
    order by s.held_on desc, s.created_at desc, s.id
    limit 1;

    insert into public.attendance_marks (session_id, user_id, status)
    select distinct on (m.user_id) keep, m.user_id, m.status
    from public.attendance_marks m
    join public.attendance_sessions s on s.id = m.session_id
    where s.classroom_id = grp.classroom_id and s.week_start = grp.week_start and s.id <> keep
      and not exists (select 1 from public.attendance_marks k where k.session_id = keep and k.user_id = m.user_id)
    order by m.user_id, s.held_on desc
    on conflict (session_id, user_id) do nothing;

    update public.attendance_sessions s
    set note = left(coalesce((
      select string_agg(x.note, E'\n' order by x.held_on desc)
      from public.attendance_sessions x
      where x.classroom_id = grp.classroom_id and x.week_start = grp.week_start and x.note <> ''
    ), ''), 500)
    where s.id = keep;

    delete from public.attendance_sessions s
    where s.classroom_id = grp.classroom_id and s.week_start = grp.week_start and s.id <> keep;
  end loop;
end
$$;

-- 3. Constraints and defaults ----------------------------------------------------------

alter table public.attendance_sessions
  alter column week_start set not null,
  alter column submitted_at set default now(),
  alter column submitted_by set default auth.uid(),
  add constraint attendance_sessions_week_is_monday check (extract(isodow from week_start) = 1),
  add constraint attendance_sessions_one_per_week unique (classroom_id, week_start);

alter table public.attendance_sessions drop column held_on;

-- 4. Privileges ------------------------------------------------------------------------

-- Sessions are written only through save_attendance_week. Members and everyone else read the
-- columns below; the note column stays off the table grant (see attendance_session_notes).
revoke all on public.attendance_sessions from authenticated;
revoke all (id, classroom_id, week_start, note, created_by, created_at, submitted_at, submitted_by, updated_at, updated_by)
  on public.attendance_sessions from authenticated;
grant select (id, classroom_id, week_start, created_by, created_at, submitted_at, submitted_by, updated_at, updated_by)
  on public.attendance_sessions to authenticated;
grant delete on public.attendance_sessions to authenticated;

-- 5. Functions -------------------------------------------------------------------------

drop function public.save_attendance_day(uuid, date, text, jsonb);

-- Submits or edits one week in one statement. The first call creates the week (submitted_*);
-- later calls update the note and stamp updated_*. Marks are replaced by save_attendance.
create function public.save_attendance_week(p_classroom uuid, p_week date, p_note text, p_statuses jsonb)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  sid uuid;
begin
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

  -- Same transaction: if the marks are rejected, the session change rolls back too.
  perform public.save_attendance(sid, p_statuses);
  return sid;
end
$$;

-- Who submitted and who last edited each week, for everyone who can see the room.
-- Names come from profiles inside the function, so members see trainer names without profile access.
create function public.attendance_weeks(cid uuid)
returns table (
  session_id uuid,
  week_start date,
  submitted_at timestamptz,
  submitted_by_name text,
  updated_at timestamptz,
  updated_by_name text
)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.week_start, s.submitted_at, sb.full_name, s.updated_at, ub.full_name
  from public.attendance_sessions s
  left join public.profiles sb on sb.id = s.submitted_by
  left join public.profiles ub on ub.id = s.updated_by
  where s.classroom_id = cid and private.can_view_classroom(cid)
  order by s.week_start desc
$$;

revoke all on function public.save_attendance_week(uuid, date, text, jsonb), public.attendance_weeks(uuid)
  from public, anon;
grant execute on function public.save_attendance_week(uuid, date, text, jsonb), public.attendance_weeks(uuid)
  to authenticated;
