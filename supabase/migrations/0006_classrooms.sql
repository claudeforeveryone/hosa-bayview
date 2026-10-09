-- Phase 2: classrooms, members, join codes.
-- Clients write only name/event/description; join codes, owners and memberships change through RPCs.

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  event text not null default '' check (char_length(event) <= 80),
  description text not null default '' check (char_length(description) <= 1000),
  join_code text not null unique check (join_code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  -- Nullable so deleting a trainer's account keeps their classroom; executives can still run it.
  owner_id uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index classrooms_owner_idx on public.classrooms (owner_id);
alter table public.classrooms enable row level security;

create table public.classroom_members (
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (classroom_id, user_id)
);
create index classroom_members_user_idx on public.classroom_members (user_id);
alter table public.classroom_members enable row level security;

-- Failed join attempts, for throttling code guessing. Never readable by clients.
create table private.join_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index join_attempts_user_at_idx on private.join_attempts (user_id, at);
revoke all on private.join_attempts from public, anon, authenticated;

-- Helpers ---------------------------------------------------------------

-- 6 chars, no 0/O/1/I/L lookalikes. ~887M codes, so a random pick almost never collides.
create function private.new_join_code()
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
      into code from generate_series(1, 6);
    exit when not exists (select 1 from public.classrooms where join_code = code);
  end loop;
  return code;
end
$$;

alter table public.classrooms alter column join_code set default private.new_join_code();

create function private.owns_classroom(cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.classrooms where id = cid and owner_id = (select auth.uid()))
$$;

create function private.is_member(cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.classroom_members where classroom_id = cid and user_id = (select auth.uid())
  )
$$;

create function private.can_view_classroom(cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_executive() or private.owns_classroom(cid) or private.is_member(cid)
$$;

-- A trainer demoted to trainee keeps seeing their classroom but can no longer run it.
create function private.can_manage_classroom(cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_executive() or (private.can_teach() and private.owns_classroom(cid))
$$;

revoke all on function private.new_join_code(), private.owns_classroom(uuid), private.is_member(uuid),
  private.can_view_classroom(uuid), private.can_manage_classroom(uuid) from public, anon;
grant execute on function private.new_join_code(), private.owns_classroom(uuid), private.is_member(uuid),
  private.can_view_classroom(uuid), private.can_manage_classroom(uuid) to authenticated;

-- Privileges and policies ---------------------------------------------------

revoke all on public.classrooms, public.classroom_members from anon;
revoke insert, update on public.classrooms from authenticated;
grant insert (name, event, description, owner_id) on public.classrooms to authenticated;
grant update (name, event, description) on public.classrooms to authenticated;
revoke insert, update on public.classroom_members from authenticated;

create policy "classrooms: read if viewer"
  on public.classrooms for select to authenticated
  using (private.can_view_classroom(id));

-- Trainers create their own; executives may create one for any trainer or executive.
create policy "classrooms: teachers create"
  on public.classrooms for insert to authenticated
  with check (
    private.can_teach()
    and (
      owner_id = (select auth.uid())
      or (private.is_executive()
          and exists (select 1 from public.profiles p where p.id = owner_id and p.role in ('trainer', 'executive')))
    )
  );

create policy "classrooms: managers update"
  on public.classrooms for update to authenticated
  using (private.can_manage_classroom(id))
  with check (private.can_manage_classroom(id));

create policy "classrooms: managers delete"
  on public.classrooms for delete to authenticated
  using (private.can_manage_classroom(id));

create policy "members: read if viewer"
  on public.classroom_members for select to authenticated
  using (private.can_view_classroom(classroom_id));

-- Managers remove anyone; members can leave.
create policy "members: managers remove or self leave"
  on public.classroom_members for delete to authenticated
  using (private.can_manage_classroom(classroom_id) or user_id = (select auth.uid()));

-- RPCs ------------------------------------------------------------------

-- Join by code. Returns the classroom id, or null when the code doesn't match.
-- Ten misses in ten minutes locks joining for that user until the window clears.
create function public.join_classroom(code text)
returns uuid
language plpgsql volatile security definer set search_path = ''
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
  if (select count(*) from private.join_attempts where user_id = uid and at > now() - interval '10 minutes') >= 10 then
    raise exception 'Too many tries' using errcode = '54000';
  end if;

  select id, owner_id into cid, owner_uid from public.classrooms where join_code = clean;
  if cid is null then
    insert into private.join_attempts (user_id) values (uid);
    delete from private.join_attempts where at < now() - interval '1 day';
    return null;
  end if;

  if owner_uid is distinct from uid then
    insert into public.classroom_members (classroom_id, user_id) values (cid, uid)
    on conflict do nothing;
  end if;
  return cid;
end
$$;

create function public.regenerate_join_code(cid uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  code text;
begin
  if not private.can_manage_classroom(cid) then
    raise exception 'Only the trainer or an executive can change the code' using errcode = '42501';
  end if;
  update public.classrooms set join_code = private.new_join_code() where id = cid returning join_code into code;
  return code;
end
$$;

-- Classrooms on Home: ones you run plus ones you joined, with owner name and head count.
create function public.my_classrooms()
returns table (
  id uuid,
  name text,
  event text,
  description text,
  owner_name text,
  member_count bigint,
  is_owner boolean,
  can_manage boolean,
  join_code text,
  created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, c.event, c.description,
    coalesce(o.full_name, 'No trainer') as owner_name,
    (select count(*) from public.classroom_members m where m.classroom_id = c.id) as member_count,
    c.owner_id = (select auth.uid()) as is_owner,
    private.can_manage_classroom(c.id) as can_manage,
    case when private.can_manage_classroom(c.id) then c.join_code end as join_code,
    c.created_at
  from public.classrooms c
  left join public.profiles o on o.id = c.owner_id
  where c.owner_id = (select auth.uid()) or private.is_member(c.id)
  order by c.created_at desc
$$;

-- One classroom's header. Null row when you can't see it.
create function public.classroom_detail(cid uuid)
returns table (
  id uuid,
  name text,
  event text,
  description text,
  owner_id uuid,
  owner_name text,
  member_count bigint,
  is_owner boolean,
  is_member boolean,
  can_manage boolean,
  join_code text,
  created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, c.event, c.description, c.owner_id,
    coalesce(o.full_name, 'No trainer'),
    (select count(*) from public.classroom_members m where m.classroom_id = c.id),
    c.owner_id = (select auth.uid()),
    private.is_member(c.id),
    private.can_manage_classroom(c.id),
    case when private.can_manage_classroom(c.id) then c.join_code end,
    c.created_at
  from public.classrooms c
  left join public.profiles o on o.id = c.owner_id
  where c.id = cid and private.can_view_classroom(c.id)
$$;

-- Roster: names for everyone in the room, emails only for people who run it.
create function public.classroom_roster(cid uuid)
returns table (user_id uuid, full_name text, email text, role public.app_role, joined_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name,
    case when private.can_manage_classroom(cid) then p.email end,
    p.role, m.joined_at
  from public.classroom_members m
  join public.profiles p on p.id = m.user_id
  where m.classroom_id = cid and private.can_view_classroom(cid)
  order by p.full_name
$$;

revoke all on function public.join_classroom(text), public.regenerate_join_code(uuid), public.my_classrooms(),
  public.classroom_detail(uuid), public.classroom_roster(uuid) from public, anon;
grant execute on function public.join_classroom(text), public.regenerate_join_code(uuid), public.my_classrooms(),
  public.classroom_detail(uuid), public.classroom_roster(uuid) to authenticated;
