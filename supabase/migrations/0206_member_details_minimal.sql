-- Omega security 0206 (review of 0204, audit H2). member_details() gave every signed-in account every member's grade
-- and title in one call. The bulk callers only need pictures (board avatars, attendance roster pictures); grade and
-- title are shown one member at a time on /members/[id], and in the executive-only /members list. So:
--   member_details()   every member's picture for anyone signed in; grade and title only on your own row, or on
--                      every row for an executive.
--   member_detail(uid) one member's picture, grade and title, for their member page.
-- This trims bulk reads to what the UI needs. It is not a wall between members: any member can still open any
-- member's page (name, role, grade, title, stats), and leaderboard('all') lists every member by name, by design.
-- What keeps strangers out is the chapter code (0090) once an executive sets one.

create or replace function public.member_details()
returns table(user_id uuid, avatar_path text, grade smallint, title text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.avatar_path,
    case when me.exec or p.id = me.uid then p.grade end,
    case when me.exec or p.id = me.uid then p.title end
  from public.profiles p
  cross join (select (select auth.uid()) as uid, private.is_executive() as exec) me
  where me.uid is not null and not private.is_banned()
$$;

create or replace function public.member_detail(uid uuid)
returns table(user_id uuid, avatar_path text, grade smallint, title text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.avatar_path, p.grade, p.title
  from public.profiles p
  where p.id = member_detail.uid and (select auth.uid()) is not null and not private.is_banned()
$$;
revoke all on function public.member_detail(uuid) from public, anon;
grant execute on function public.member_detail(uuid) to authenticated;
