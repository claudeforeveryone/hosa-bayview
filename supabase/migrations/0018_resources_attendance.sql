-- Phase 6.5: classroom resources (links), event topic weights, attendance.
-- Anyone who can view a classroom reads its links and breakdown. Trainers who run it write.
-- Attendance: managers read their classroom's marks, members read only their own, executives read all.
-- Breakdown and attendance marks are written through RPCs so each save is one atomic statement.

-- Resources ---------------------------------------------------------------

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  url text not null check (
    char_length(url) <= 2048
    and url ~* '^https?://[^[:space:]/?#]+[^[:space:]]*$'
  ),
  note text not null default '' check (char_length(note) <= 500),
  position integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index resources_classroom_idx on public.resources (classroom_id, position);
alter table public.resources enable row level security;

-- Event breakdown: what share of the exam each topic is. The UI shows whether it adds to 100.
create table public.topic_weights (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  topic text not null check (char_length(topic) between 1 and 80),
  percent integer not null check (percent between 0 and 100),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index topic_weights_classroom_idx on public.topic_weights (classroom_id, position);
alter table public.topic_weights enable row level security;

-- Attendance -------------------------------------------------------------

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  held_on date not null,
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (classroom_id, held_on)
);
alter table public.attendance_sessions enable row level security;

create table public.attendance_marks (
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('present', 'late', 'absent', 'excused')),
  primary key (session_id, user_id)
);
create index attendance_marks_user_idx on public.attendance_marks (user_id);
alter table public.attendance_marks enable row level security;

-- Helpers ------------------------------------------------------------------

create function private.session_classroom(sid uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select classroom_id from public.attendance_sessions where id = sid
$$;

revoke all on function private.session_classroom(uuid) from public, anon;
grant execute on function private.session_classroom(uuid) to authenticated;

-- Privileges -----------------------------------------------------------------

revoke all on public.resources, public.topic_weights, public.attendance_sessions, public.attendance_marks from anon;

-- Links: trainers add, edit and delete through RLS; the column grant keeps created_by server-set.
revoke insert, update on public.resources from authenticated;
grant insert (classroom_id, title, url, note, position) on public.resources to authenticated;
grant update (title, url, note, position) on public.resources to authenticated;
grant delete on public.resources to authenticated;

-- Breakdown and marks: written only through the RPCs below.
revoke insert, update, delete on public.topic_weights, public.attendance_marks from authenticated;

-- Sessions: trainers create and edit their own; one session per date per classroom.
revoke insert, update, delete on public.attendance_sessions from authenticated;
grant insert (classroom_id, held_on, note) on public.attendance_sessions to authenticated;
grant update (held_on, note) on public.attendance_sessions to authenticated;
grant delete on public.attendance_sessions to authenticated;

-- Policies -------------------------------------------------------------------

create policy "resources: viewers read"
  on public.resources for select to authenticated
  using (private.can_view_classroom(classroom_id));

create policy "resources: managers create"
  on public.resources for insert to authenticated
  with check (private.can_manage_classroom(classroom_id));

create policy "resources: managers update"
  on public.resources for update to authenticated
  using (private.can_manage_classroom(classroom_id))
  with check (private.can_manage_classroom(classroom_id));

create policy "resources: managers delete"
  on public.resources for delete to authenticated
  using (private.can_manage_classroom(classroom_id));

create policy "topic_weights: viewers read"
  on public.topic_weights for select to authenticated
  using (private.can_view_classroom(classroom_id));

create policy "attendance_sessions: viewers read"
  on public.attendance_sessions for select to authenticated
  using (private.can_view_classroom(classroom_id));

create policy "attendance_sessions: managers create"
  on public.attendance_sessions for insert to authenticated
  with check (private.can_manage_classroom(classroom_id));

create policy "attendance_sessions: managers update"
  on public.attendance_sessions for update to authenticated
  using (private.can_manage_classroom(classroom_id))
  with check (private.can_manage_classroom(classroom_id));

create policy "attendance_sessions: managers delete"
  on public.attendance_sessions for delete to authenticated
  using (private.can_manage_classroom(classroom_id));

-- Managers (and executives) see the whole room; a member sees only their own marks.
create policy "attendance_marks: managers read or own marks"
  on public.attendance_marks for select to authenticated
  using (
    private.can_manage_classroom(private.session_classroom(session_id))
    or (
      user_id = (select auth.uid())
      and private.can_view_classroom(private.session_classroom(session_id))
    )
  );

-- RPCs -------------------------------------------------------------------------

-- Replaces the whole breakdown in one statement. items: [{"topic": "...", "percent": 40}, ...]
create function public.save_topic_weights(cid uuid, items jsonb)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.can_manage_classroom(cid) then
    raise exception 'Only the trainer or an executive can edit the breakdown' using errcode = '42501';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 30 then
    raise exception 'Use up to 30 topics' using errcode = '22023';
  end if;
  delete from public.topic_weights where classroom_id = cid;
  insert into public.topic_weights (classroom_id, topic, percent, position)
  select cid, trim(t.item->>'topic'), (t.item->>'percent')::integer, t.ord::integer - 1
  from jsonb_array_elements(items) with ordinality as t(item, ord);
end
$$;

-- Replaces the marks for one session. statuses: {"<user uuid>": "present", ...}.
-- Users left out become unmarked. Only members of the classroom can be marked.
create function public.save_attendance(sid uuid, statuses jsonb)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  cid uuid := private.session_classroom(sid);
begin
  if cid is null or not private.can_manage_classroom(cid) then
    raise exception 'Only the trainer or an executive can take attendance' using errcode = '42501';
  end if;
  if jsonb_typeof(statuses) <> 'object' then
    raise exception 'Bad attendance list' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_each_text(statuses) e
    where e.value is null or e.value not in ('present', 'late', 'absent', 'excused')
  ) then
    raise exception 'Unknown attendance status' using errcode = '22023';
  end if;

  delete from public.attendance_marks m
  where m.session_id = sid
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

revoke all on function public.save_topic_weights(uuid, jsonb), public.save_attendance(uuid, jsonb) from public, anon;
grant execute on function public.save_topic_weights(uuid, jsonb), public.save_attendance(uuid, jsonb) to authenticated;
