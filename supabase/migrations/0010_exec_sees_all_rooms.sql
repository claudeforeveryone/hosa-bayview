-- Executives run every classroom, including ones whose trainer's account was deleted,
-- so they see all of them on Home.
create or replace function public.my_classrooms()
returns table (
  id uuid,
  num integer,
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
  select c.id, c.num, c.name, c.event, c.description,
    coalesce(o.full_name, 'No trainer'),
    (select count(*) from public.classroom_members m where m.classroom_id = c.id),
    c.owner_id = (select auth.uid()),
    private.can_manage_classroom(c.id),
    case when private.can_manage_classroom(c.id) then c.join_code end,
    c.created_at
  from public.classrooms c
  left join public.profiles o on o.id = c.owner_id
  where c.owner_id = (select auth.uid()) or private.is_member(c.id) or private.is_executive()
  order by c.created_at desc
$$;

-- The per-miss cleanup filters on time alone.
create index join_attempts_at_idx on private.join_attempts (at);
