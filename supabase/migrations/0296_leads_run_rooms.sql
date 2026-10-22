-- 0296: "You run it" follows the leads. Since 0291 a room's leads are the people who run it, but is_owner still
-- also said yes to whoever made the room, so the executive who made most rooms saw "You run it" on nearly every one
-- and had them all under their own. Now, when a room has leads, only a lead is its runner; a room with no leads
-- keeps the maker. Only the flag changes: who can see or manage a room (owns_classroom, can_manage_classroom) is
-- untouched.

create or replace function public.my_classrooms()
returns table(id uuid, num integer, name text, event text, description text, owner_name text, member_count bigint,
              is_owner boolean, can_manage boolean, join_code text, created_at timestamp with time zone, category text)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.num, c.name, c.event, c.description,
    coalesce(private.lead_names(c.lead_ids), o.full_name),
    (select count(*) from public.classroom_members m where m.classroom_id = c.id),
    case when coalesce(cardinality(c.lead_ids), 0) > 0 then (select auth.uid()) = any (c.lead_ids)
         else c.owner_id = (select auth.uid()) end,
    private.can_manage_classroom(c.id),
    case when private.can_manage_classroom(c.id) then c.join_code end,
    c.created_at,
    c.category
  from public.classrooms c
  left join public.profiles o on o.id = c.owner_id
  where c.kind = 'class'
    and not private.is_banned()
    and (c.owner_id = (select auth.uid()) or (select auth.uid()) = any (c.lead_ids)
         or private.is_member(c.id) or private.is_executive()
         or private.can_view_stats((select auth.uid())))
  order by c.created_at desc
$$;

create or replace function public.classroom_detail(cid uuid)
returns table(id uuid, num integer, name text, event text, description text, owner_id uuid, owner_name text,
              member_count bigint, is_owner boolean, is_member boolean, can_manage boolean, join_code text,
              created_at timestamp with time zone)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.num, c.name, c.event, c.description, c.owner_id,
    coalesce(private.lead_names(c.lead_ids), o.full_name),
    (select count(*) from public.classroom_members m where m.classroom_id = c.id),
    case when coalesce(cardinality(c.lead_ids), 0) > 0 then (select auth.uid()) = any (c.lead_ids)
         else c.owner_id = (select auth.uid()) end,
    private.is_member(c.id),
    private.can_manage_classroom(c.id),
    case when private.can_manage_classroom(c.id) then c.join_code end,
    c.created_at
  from public.classrooms c
  left join public.profiles o on o.id = c.owner_id
  where c.id = cid and private.can_view_classroom(c.id)
$$;
