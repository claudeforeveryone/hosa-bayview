-- Event leads: the people who run an event room, in the order the chapter lists them. A room can have several
-- (most events have two or three). Until now "who runs it" was only classrooms.owner_id, the account that made the
-- room, which for the premade rooms is whoever set the site up.
--
--   classrooms.lead_ids               the leads, in order. Not granted to clients; read through the functions below.
--   private.owns_classroom(cid)       now also true for a lead, so a lead sees the room and, as a trainer or
--                                     executive, manages it (can_view_classroom / can_manage_classroom, 0066).
--   private.lead_names(ids)           "A", "A & B", "A, B & C".
--   my_classrooms / classroom_detail  owner_name is the leads' names when the room has leads, else the maker's;
--                                     is_owner is true for a lead ("You run it"). Same signatures as before.
--   private.flag_recipients           Ask teacher reaches every lead who can teach, plus the maker as before.
--   public.classroom_runners(cid)     who runs it, for the People tab: the leads, or the maker when there are none.
--   public.set_classroom_leads(cid, people)
--                                     executives only. Leads must be trainers or executives and not banned; at most 6.
--                                     Logged as 'leads'.
--   "classrooms: managers delete"     a lead manages the room but can't delete it: only its maker or an executive.
-- Tests: supabase/tests/classroom_leads.sql.

alter table public.classrooms add column if not exists lead_ids uuid[] not null default '{}';

create or replace function private.owns_classroom(cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.classrooms
    where id = cid and (owner_id = (select auth.uid()) or (select auth.uid()) = any (lead_ids))
  )
$$;

create or replace function private.lead_names(ids uuid[])
returns text
language sql stable security definer set search_path = ''
as $$
  with n as (
    select array_agg(p.full_name order by array_position(ids, p.id)) as a
    from public.profiles p
    where p.id = any (ids)
  )
  select case
    when coalesce(cardinality(n.a), 0) = 0 then null
    when cardinality(n.a) = 1 then n.a[1]
    else array_to_string(n.a[1:cardinality(n.a) - 1], ', ') || ' & ' || n.a[cardinality(n.a)]
  end
  from n
$$;
revoke all on function private.lead_names(uuid[]) from public, anon, authenticated;

alter policy "classrooms: managers delete" on public.classrooms
  using (private.can_manage_classroom(id) and (private.is_executive() or owner_id = (select auth.uid())));

-- 0072's my_classrooms with the leads folded in.
create or replace function public.my_classrooms()
returns table(id uuid, num integer, name text, event text, description text, owner_name text,
              member_count bigint, is_owner boolean, can_manage boolean, join_code text,
              created_at timestamptz, category text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.num, c.name, c.event, c.description,
    coalesce(private.lead_names(c.lead_ids), o.full_name),
    (select count(*) from public.classroom_members m where m.classroom_id = c.id),
    c.owner_id = (select auth.uid()) or (select auth.uid()) = any (c.lead_ids),
    private.can_manage_classroom(c.id),
    case when private.can_manage_classroom(c.id) then c.join_code end,
    c.created_at,
    c.category
  from public.classrooms c
  left join public.profiles o on o.id = c.owner_id
  where c.kind = 'class'
    and not private.is_banned()
    and (c.owner_id = (select auth.uid()) or (select auth.uid()) = any (c.lead_ids)
         or private.is_member(c.id) or private.is_executive())
  order by c.created_at desc
$$;

-- 0011's classroom_detail with the leads folded in.
create or replace function public.classroom_detail(cid uuid)
returns table (
  id uuid,
  num integer,
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
  select c.id, c.num, c.name, c.event, c.description, c.owner_id,
    coalesce(private.lead_names(c.lead_ids), o.full_name),
    (select count(*) from public.classroom_members m where m.classroom_id = c.id),
    c.owner_id = (select auth.uid()) or (select auth.uid()) = any (c.lead_ids),
    private.is_member(c.id),
    private.can_manage_classroom(c.id),
    case when private.can_manage_classroom(c.id) then c.join_code end,
    c.created_at
  from public.classrooms c
  left join public.profiles o on o.id = c.owner_id
  where c.id = cid and private.can_view_classroom(c.id)
$$;

-- 0099's flag_recipients: the room's leads and maker, if they can still teach it, else the executives.
create or replace function private.flag_recipients(tid uuid, asker uuid)
returns uuid[]
language sql stable security definer set search_path = ''
as $$
  with room as (
    select c.owner_id, c.lead_ids from public.tests t join public.classrooms c on c.id = t.classroom_id where t.id = tid
  ), runners as (
    select p.id from public.profiles p, room
    where (p.id = room.owner_id or p.id = any (room.lead_ids)) and p.id <> asker
      and p.role in ('trainer', 'executive')
      and (p.banned_until is null or p.banned_until <= now())
  )
  select coalesce(
    (select array_agg(id) from runners),
    (select array_agg(p.id) from public.profiles p
      where p.role = 'executive' and p.id <> asker
        and (p.banned_until is null or p.banned_until <= now())),
    '{}'::uuid[])
$$;
revoke all on function private.flag_recipients(uuid, uuid) from public, anon, authenticated;

-- Who runs the room, for anyone who can see it. lead is false for the maker shown in place of missing leads.
create or replace function public.classroom_runners(cid uuid)
returns table (user_id uuid, full_name text, lead boolean)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name, cardinality(c.lead_ids) > 0
  from public.classrooms c
  join public.profiles p
    on p.id = any (case when cardinality(c.lead_ids) > 0 then c.lead_ids else array[c.owner_id] end)
  where c.id = cid and private.can_view_classroom(c.id)
  order by array_position(case when cardinality(c.lead_ids) > 0 then c.lead_ids else array[c.owner_id] end, p.id)
$$;
revoke all on function public.classroom_runners(uuid) from public, anon;
grant execute on function public.classroom_runners(uuid) to authenticated;

create or replace function public.set_classroom_leads(cid uuid, people uuid[])
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  who uuid := (select auth.uid());
  room text;
  clean uuid[];
  bad text;
begin
  if not private.is_executive() or private.is_demo() or private.is_banned() then
    raise exception 'Only executives can change who runs an event' using errcode = '42501';
  end if;
  select c.name into room from public.classrooms c where c.id = cid for update;
  if not found then
    raise exception 'That event is gone. Reload the page.' using errcode = 'P0002';
  end if;
  -- First appearance wins, so the order stays the one picked.
  select coalesce(array_agg(x.u order by x.i), '{}') into clean
  from (
    select t.u, min(t.i) as i from unnest(coalesce(people, '{}')) with ordinality t(u, i)
    where t.u is not null group by t.u
  ) x;
  if cardinality(clean) > 6 then
    raise exception 'Pick at most 6 people' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(clean) u where not exists (select 1 from public.profiles p where p.id = u)) then
    raise exception 'Someone you picked is gone. Reload the page.' using errcode = 'P0002';
  end if;
  select p.full_name into bad from public.profiles p
  where p.id = any (clean) and p.role not in ('trainer', 'executive')
  order by array_position(clean, p.id) limit 1;
  if bad is not null then
    raise exception '% is a trainee. Make them a trainer first.', bad using errcode = 'P0001';
  end if;
  select p.full_name into bad from public.profiles p
  where p.id = any (clean) and p.banned_until > now()
  order by array_position(clean, p.id) limit 1;
  if bad is not null then
    raise exception '% is banned. Lift the ban first.', bad using errcode = 'P0001';
  end if;
  update public.classrooms set lead_ids = clean where id = cid;
  insert into public.admin_log (actor_id, actor_name, action, target_id, target_name, detail)
  values (who, coalesce((select p.full_name from public.profiles p where p.id = who), ''),
          'leads', null, room, coalesce(private.lead_names(clean), 'nobody'));
end
$$;
revoke all on function public.set_classroom_leads(uuid, uuid[]) from public, anon;
grant execute on function public.set_classroom_leads(uuid, uuid[]) to authenticated;
