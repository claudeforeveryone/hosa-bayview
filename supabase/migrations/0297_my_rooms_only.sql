-- 0297: "Your events" means yours. my_classrooms() fed every room to executives and developers (0293), so their
-- sidebar, Events, Questions and announcement channels listed every room in the chapter, and the maker of a room
-- kept it after leads were set. The owner's call (2026-10-22): everyone, executives included, lists only the rooms
-- they run (a lead, or the maker of a room with no leads) or belong to.
-- Access is unchanged: executives still open and manage any room (can_view_classroom, can_manage_classroom) and
-- developers still watch any room read-only, reached from /admin's room list or a link.

create or replace function public.my_classrooms()
returns table(id uuid, num integer, name text, event text, description text, owner_name text, member_count bigint,
              is_owner boolean, can_manage boolean, join_code text, created_at timestamp with time zone, category text)
language sql stable security definer set search_path = ''
as $$
  with mine as (
    select c.*,
      case when coalesce(cardinality(c.lead_ids), 0) > 0 then (select auth.uid()) = any (c.lead_ids)
           else c.owner_id = (select auth.uid()) end as runs
    from public.classrooms c
    where c.kind = 'class'
  )
  select c.id, c.num, c.name, c.event, c.description,
    coalesce(private.lead_names(c.lead_ids), o.full_name),
    (select count(*) from public.classroom_members m where m.classroom_id = c.id),
    c.runs,
    private.can_manage_classroom(c.id),
    case when private.can_manage_classroom(c.id) then c.join_code end,
    c.created_at,
    c.category
  from mine c
  left join public.profiles o on o.id = c.owner_id
  where not private.is_banned()
    and (c.runs or private.is_member(c.id))
  order by c.created_at desc
$$;
