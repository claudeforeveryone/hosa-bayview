-- Developers can watch every event room. "Developers" are the accounts in private.stats_viewers (0105), the list that
-- opens /developer. They now see every room the way a member does (Overview, tests, cards, resources, People, who's
-- online) without joining it, and every class room is listed for them. Seeing is all: running a room still needs
-- can_manage_classroom (an executive, or the room's maker or lead who can teach), so answer keys, join codes, grades
-- and edits stay as they were. Banned accounts see nothing, as before.
--   private.can_view_classroom(cid)  0066 plus the developer check.
--   public.my_classrooms()           0291 plus the developer check, same signature.
-- Tests: supabase/tests/developers_view_rooms.sql.

create or replace function private.can_view_classroom(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not private.is_banned() and (
    private.is_executive() or private.owns_classroom(cid) or private.is_member(cid)
    or private.can_view_stats((select auth.uid()))
    or ((select auth.uid()) is not null
        and exists (select 1 from public.classrooms c where c.id = cid and c.kind = 'competition')))
$$;

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
         or private.is_member(c.id) or private.is_executive()
         or private.can_view_stats((select auth.uid())))
  order by c.created_at desc
$$;
