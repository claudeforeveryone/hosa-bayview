-- Task 10: my_classrooms returns the event category, so src/lib/classrooms.ts drops its extra lookup.
-- A new output column means a new signature: drop and recreate in one transaction. Banned callers get
-- no rooms, matching can_view_classroom (0066).
drop function if exists public.my_classrooms();
create function public.my_classrooms()
returns table(id uuid, num integer, name text, event text, description text, owner_name text,
              member_count bigint, is_owner boolean, can_manage boolean, join_code text,
              created_at timestamptz, category text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.num, c.name, c.event, c.description,
    o.full_name,
    (select count(*) from public.classroom_members m where m.classroom_id = c.id),
    c.owner_id = (select auth.uid()),
    private.can_manage_classroom(c.id),
    case when private.can_manage_classroom(c.id) then c.join_code end,
    c.created_at,
    c.category
  from public.classrooms c
  left join public.profiles o on o.id = c.owner_id
  where c.kind = 'class'
    and not private.is_banned()
    and (c.owner_id = (select auth.uid()) or private.is_member(c.id) or private.is_executive())
  order by c.created_at desc
$$;
revoke all on function public.my_classrooms() from public, anon;
grant execute on function public.my_classrooms() to authenticated;
