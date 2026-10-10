-- Task 10 (audit L1): a ban takes effect on the next request, for reads too.
-- The helpers read profiles.banned_until (via private.is_banned), not the JWT, so a banned member's
-- unexpired access token no longer reads classrooms, chapter content or files. Own rows (profile,
-- notifications, own attempts and decks) stay readable so the app can show the banned page.

create or replace function private.can_view_classroom(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not private.is_banned() and (
    private.is_executive() or private.owns_classroom(cid) or private.is_member(cid)
    or ((select auth.uid()) is not null
        and exists (select 1 from public.classrooms c where c.id = cid and c.kind = 'competition')))
$$;

-- A banned trainer can't manage their room (skills, resources, attendance, tests) either.
create or replace function private.can_manage_classroom(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not private.is_banned()
    and (private.is_executive() or (private.can_teach() and private.owns_classroom(cid)))
$$;

create or replace function private.can_read_board(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and not private.is_banned()
    and (cid is null or private.can_view_classroom(cid))
$$;

-- Storage folders: the chapter shelf is readable by any signed-in account that isn't banned.
create or replace function private.material_folder_ok(folder text, write boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when folder = 'chapter' then case when write then private.can_post(null) else not private.is_banned() end
    when private.try_uuid(folder) is null then false
    when write then private.can_post(private.try_uuid(folder))
    else private.can_view_classroom(private.try_uuid(folder))
  end
$$;

-- Chapter-wide rows (classroom_id is null) skip can_view_classroom, so they need their own ban check.
alter policy "announcements: read" on public.announcements
  using ((classroom_id is null and not (select private.is_banned())) or private.can_view_classroom(classroom_id));
alter policy "events: read" on public.events
  using ((classroom_id is null and not (select private.is_banned())) or private.can_view_classroom(classroom_id));
alter policy "materials: read" on public.materials
  using ((classroom_id is null and not (select private.is_banned())) or private.can_view_classroom(classroom_id));
alter policy "classrooms: read if viewer" on public.classrooms
  using (not (select private.is_banned())
         and (owner_id = (select auth.uid()) or private.can_view_classroom(id)));
alter policy "avatars: signed-in read" on storage.objects
  using (bucket_id = 'avatars' and not (select private.is_banned()));

-- Chapter meetings: one SELECT policy (the advisor flagged two permissive ones) and a ban check.
-- The old FOR ALL policy also covered SELECT; split it into insert/update/delete.
drop policy if exists "chapter_meetings: executives write" on public.chapter_meetings;
drop policy if exists "chapter_meetings: executives insert" on public.chapter_meetings;
drop policy if exists "chapter_meetings: executives update" on public.chapter_meetings;
drop policy if exists "chapter_meetings: executives delete" on public.chapter_meetings;
create policy "chapter_meetings: executives insert" on public.chapter_meetings
  for insert to authenticated
  with check ((select private.is_executive()) and not (select private.is_demo()));
create policy "chapter_meetings: executives update" on public.chapter_meetings
  for update to authenticated
  using ((select private.is_executive()) and not (select private.is_demo()))
  with check ((select private.is_executive()) and not (select private.is_demo()));
create policy "chapter_meetings: executives delete" on public.chapter_meetings
  for delete to authenticated
  using ((select private.is_executive()) and not (select private.is_demo()));
alter policy "chapter_meetings: signed-in read" on public.chapter_meetings
  using (not (select private.is_banned()));

-- Same write guard every other content table has.
create or replace trigger refuse_when_banned
  before insert or update on public.skills
  for each row execute function private.refuse_when_banned();
create or replace trigger refuse_when_banned
  before insert or update on public.chapter_meetings
  for each row execute function private.refuse_when_banned();
