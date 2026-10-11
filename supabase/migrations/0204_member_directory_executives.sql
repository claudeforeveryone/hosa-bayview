-- Omega security 0204 (audit H2, member data). member_directory() gave every signed-in account the name and role
-- of every member in one call. Its only caller is the Members list (/members), which the nav shows to executives
-- only and which now refuses everyone else, so the directory answers executives only. Anyone else gets no rows
-- (not an error), so an older build that still opens /members for a member shows an empty list instead of failing.
-- Names on boards, member pages, class rosters and online lists come from their own RPCs, each with its own check.
create or replace function public.member_directory()
returns table(user_id uuid, full_name text, role public.app_role)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.role
  from public.profiles p
  where private.is_executive() and not private.is_banned()
  order by p.full_name, p.id
$$;
