-- Chapter tools: announcements, in-app notifications, a calendar, a file and link library, and an admin log.
-- Written without DROP or DELETE so it applies cleanly through the Supabase MCP.

-- Helpers ---------------------------------------------------------------------------------------------------
-- A uuid from text, or null (storage folder names are free text).
create or replace function private.try_uuid(v text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return v::uuid;
exception when others then
  return null;
end
$$;

-- Everyone a classroom message reaches: its owner and members, or the whole chapter when cid is null.
-- Banned members are left out.
create or replace function private.audience(cid uuid)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.profiles p
  where (p.banned_until is null or p.banned_until <= now())
    and (cid is null
         or p.id = (select c.owner_id from public.classrooms c where c.id = cid)
         or exists (select 1 from public.classroom_members m where m.classroom_id = cid and m.user_id = p.id))
$$;
revoke all on function private.try_uuid(text), private.audience(uuid) from public, anon, authenticated;

-- Notifications ---------------------------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('announcement', 'test', 'reply', 'event', 'competition', 'role')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 500),
  link text not null default '/' check (link ~ '^/([^/].*)?$'),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
create policy "notifications: own read" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- Written only by triggers and these functions; never by clients directly.
create or replace function private.notify(uids uuid[], p_kind text, p_title text, p_body text, p_link text)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select u, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 500), p_link
  from unnest(uids) u
  where u is distinct from (select auth.uid())
$$;
revoke all on function private.notify(uuid[], text, text, text, text) from public, anon, authenticated;

create or replace function public.mark_notifications_read(ids uuid[] default null)
returns void
language sql security definer set search_path = ''
as $$
  update public.notifications n set read_at = now()
  where n.user_id = (select auth.uid()) and n.read_at is null and (ids is null or n.id = any (ids))
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

create or replace function public.unread_notifications()
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.notifications n
  where n.user_id = (select auth.uid()) and n.read_at is null
$$;
revoke all on function public.unread_notifications() from public, anon;
grant execute on function public.unread_notifications() to authenticated;

-- Announcements ---------------------------------------------------------------------------------------------
-- classroom_id null = the whole chapter (executives); otherwise that room (its trainer or an executive).
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid references public.classrooms (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null default '' check (char_length(body) <= 5000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index announcements_room_idx on public.announcements (classroom_id, created_at desc);
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;
grant insert (classroom_id, title, body, pinned) on public.announcements to authenticated;
grant update (title, body, pinned) on public.announcements to authenticated;
grant delete on public.announcements to authenticated;

create or replace function private.can_post(cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not private.is_banned()
    and case when cid is null then private.is_executive() else private.can_manage_classroom(cid) end
$$;
-- Policies call it as the signed-in user, so authenticated keeps execute.
revoke all on function private.can_post(uuid) from public, anon;
grant execute on function private.can_post(uuid) to authenticated;

create policy "announcements: read" on public.announcements for select to authenticated
  using (classroom_id is null or private.can_view_classroom(classroom_id));
create policy "announcements: post" on public.announcements for insert to authenticated
  with check (private.can_post(classroom_id) and author_id = (select auth.uid()));
create policy "announcements: edit" on public.announcements for update to authenticated
  using (private.can_post(classroom_id)) with check (private.can_post(classroom_id));
create policy "announcements: remove" on public.announcements for delete to authenticated
  using (private.can_post(classroom_id));

create or replace function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
create trigger announcements_touch before update on public.announcements
  for each row execute function private.touch_updated_at();

create or replace function private.announce_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.notify(
    array(select private.audience(new.classroom_id)), 'announcement', new.title, left(new.body, 160),
    case when new.classroom_id is null then '/announcements' else '/c/' || new.classroom_id end);
  return new;
end
$$;
create trigger announcements_notify after insert on public.announcements
  for each row execute function private.announce_notify();

-- Calendar --------------------------------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid references public.classrooms (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null default '' check (char_length(location) <= 200),
  details text not null default '' check (char_length(details) <= 2000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index events_start_idx on public.events (starts_at);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant select, delete on public.events to authenticated;
grant insert (classroom_id, title, starts_at, ends_at, location, details) on public.events to authenticated;
grant update (title, starts_at, ends_at, location, details) on public.events to authenticated;
create policy "events: read" on public.events for select to authenticated
  using (classroom_id is null or private.can_view_classroom(classroom_id));
create policy "events: add" on public.events for insert to authenticated
  with check (private.can_post(classroom_id));
create policy "events: edit" on public.events for update to authenticated
  using (private.can_post(classroom_id)) with check (private.can_post(classroom_id));
create policy "events: remove" on public.events for delete to authenticated
  using (private.can_post(classroom_id));

create or replace function private.event_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.notify(
    array(select private.audience(new.classroom_id)), 'event', new.title,
    to_char(new.starts_at at time zone 'America/Toronto', 'Dy Mon DD, HH12:MI AM'), '/calendar');
  return new;
end
$$;
create trigger events_notify after insert on public.events
  for each row execute function private.event_notify();

-- Library: files and links, for a classroom or the whole chapter ---------------------------------------------
-- Files live in the private 'materials' bucket under <classroom id>/ or chapter/.
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid references public.classrooms (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  note text not null default '' check (char_length(note) <= 500),
  url text check (url is null or (char_length(url) <= 2048 and url ~* '^https?://[^[:space:]/?#]+[^[:space:]]*$')),
  path text unique,
  file_name text check (file_name is null or char_length(file_name) <= 200),
  size_bytes bigint check (size_bytes is null or size_bytes between 0 and 26214400),
  mime text check (mime is null or char_length(mime) <= 120),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check ((url is null) <> (path is null)),
  check (path is null or split_part(path, '/', 1) = coalesce(classroom_id::text, 'chapter'))
);
create index materials_room_idx on public.materials (classroom_id, created_at desc);
alter table public.materials enable row level security;
revoke all on public.materials from anon, authenticated;
grant select, delete on public.materials to authenticated;
grant insert (classroom_id, title, note, url, path, file_name, size_bytes, mime) on public.materials to authenticated;
grant update (title, note) on public.materials to authenticated;
create policy "materials: read" on public.materials for select to authenticated
  using (classroom_id is null or private.can_view_classroom(classroom_id));
create policy "materials: add" on public.materials for insert to authenticated
  with check (private.can_post(classroom_id));
create policy "materials: edit" on public.materials for update to authenticated
  using (private.can_post(classroom_id)) with check (private.can_post(classroom_id));
create policy "materials: remove" on public.materials for delete to authenticated
  using (private.can_post(classroom_id));

insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', false, 26214400)
on conflict (id) do nothing;

create or replace function private.material_folder_ok(folder text, write boolean)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when folder = 'chapter' then (not write) or private.can_post(null)
    when private.try_uuid(folder) is null then false
    when write then private.can_post(private.try_uuid(folder))
    else private.can_view_classroom(private.try_uuid(folder))
  end
$$;
revoke all on function private.material_folder_ok(text, boolean) from public, anon;
grant execute on function private.material_folder_ok(text, boolean) to authenticated;

create policy "materials: read files" on storage.objects for select to authenticated
  using (bucket_id = 'materials' and private.material_folder_ok((storage.foldername(name))[1], false));
create policy "materials: upload files" on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and private.material_folder_ok((storage.foldername(name))[1], true));
create policy "materials: remove files" on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and private.material_folder_ok((storage.foldername(name))[1], true));

-- Notify on new tests and on trainer replies ----------------------------------------------------------------
create or replace function private.test_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.is_published and (tg_op = 'INSERT' or not old.is_published) then
    perform private.notify(
      array(select private.audience(new.classroom_id)), 'test', 'New test: ' || new.title,
      coalesce((select c.name from public.classrooms c where c.id = new.classroom_id), ''),
      '/c/' || new.classroom_id || '/tests/' || new.id);
  end if;
  return new;
end
$$;
create trigger tests_notify after insert or update of is_published on public.tests
  for each row execute function private.test_notify();

create or replace function private.flag_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'answered' and old.status is distinct from 'answered' then
    perform private.notify(
      array[new.user_id], 'reply', 'Your trainer replied', left(new.reply, 160),
      '/c/' || (select t.classroom_id from public.tests t where t.id = new.test_id) || '/tests/' || new.test_id);
  end if;
  return new;
end
$$;
create trigger question_flags_notify after update of status on public.question_flags
  for each row execute function private.flag_notify();

-- Admin log -------------------------------------------------------------------------------------------------
-- Who changed a role, a ban or a title, and who removed whom. Executives read it; nobody edits it.
create table public.admin_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text not null default '',
  action text not null,
  target_id uuid,
  target_name text not null default '',
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index admin_log_at_idx on public.admin_log (created_at desc);
alter table public.admin_log enable row level security;
revoke all on public.admin_log from anon, authenticated;
grant select on public.admin_log to authenticated;
create policy "admin log: executives read" on public.admin_log for select to authenticated
  using (private.is_executive());

create or replace function private.log_profile_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  who uuid := (select auth.uid());
  who_name text := coalesce((select p.full_name from public.profiles p where p.id = who), 'System');
begin
  if tg_op = 'DELETE' then
    insert into public.admin_log (actor_id, actor_name, action, target_id, target_name, detail)
    values (who, who_name, 'removed', old.id, old.full_name, old.role::text);
    return old;
  end if;
  if new.role is distinct from old.role then
    insert into public.admin_log (actor_id, actor_name, action, target_id, target_name, detail)
    values (who, who_name, 'role', new.id, new.full_name, old.role || ' → ' || new.role);
    perform private.notify(array[new.id], 'role', 'You''re now ' ||
      case new.role when 'executive' then 'an executive' when 'trainer' then 'a trainer' else 'a member' end, '', '/');
  end if;
  if new.banned_until is distinct from old.banned_until then
    insert into public.admin_log (actor_id, actor_name, action, target_id, target_name, detail)
    values (who, who_name, case when new.banned_until > now() then 'banned' else 'unbanned' end,
            new.id, new.full_name, coalesce(new.ban_reason, ''));
  end if;
  if new.title is distinct from old.title then
    insert into public.admin_log (actor_id, actor_name, action, target_id, target_name, detail)
    values (who, who_name, 'title', new.id, new.full_name, coalesce(new.title, 'none'));
  end if;
  return new;
end
$$;
create trigger profiles_log_change after update of role, banned_until, title on public.profiles
  for each row execute function private.log_profile_change();
create trigger profiles_log_delete after delete on public.profiles
  for each row execute function private.log_profile_change();

create or replace function private.log_warning()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.admin_log (actor_id, actor_name, action, target_id, target_name, detail)
  values (new.issued_by, coalesce((select p.full_name from public.profiles p where p.id = new.issued_by), 'System'),
          'warned', new.user_id, coalesce((select p.full_name from public.profiles p where p.id = new.user_id), ''),
          left(new.message, 200));
  return new;
end
$$;
create trigger user_warnings_log after insert on public.user_warnings
  for each row execute function private.log_warning();

create or replace function private.log_passcode()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.key = 'admin_passcode_hash' then
    insert into public.admin_log (actor_id, actor_name, action, detail)
    values ((select auth.uid()),
            coalesce((select p.full_name from public.profiles p where p.id = (select auth.uid())), 'System'),
            'passcode', 'Admin passcode changed');
  end if;
  return new;
end
$$;
create trigger settings_log_passcode after insert or update on private.settings
  for each row execute function private.log_passcode();
