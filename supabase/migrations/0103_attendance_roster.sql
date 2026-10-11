-- Weekly attendance tracker, modelled on the chapter's paper sheet: one page per class (short code like "FS"),
-- a row per person on the class roster, a column per chapter meeting date, a mark when present.
-- Roster rows are names, not accounts: user_id links one to a profile when it is known.
-- Executives read and write everything; a class's managers (private.can_manage_classroom) read and write their
-- own class. Meeting dates are chapter-wide: managers read them, executives write them. Nobody else reads any of it.
-- Names are loaded straight into the database, never committed (the repo is public).

-- 1. Class short codes --------------------------------------------------------------------------------------------
alter table public.classrooms
  add column short_code text,
  add constraint classrooms_short_code_format check (short_code is null or short_code ~ '^[A-Z]{2,4}$');
create unique index classrooms_short_code_key on public.classrooms (short_code) where short_code is not null;
-- Column grants as in 0006/0065; the classrooms RLS policies decide which rows, the trigger below decides who.
grant select (short_code) on public.classrooms to authenticated;
grant update (short_code) on public.classrooms to authenticated;

-- Only executives (not look-around demo accounts) set a class's short code.
create or replace function private.guard_short_code()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and new.short_code is distinct from (case when tg_op = 'UPDATE' then old.short_code end)
     and (not private.is_executive() or private.is_demo()) then
    raise exception 'Only executives can set a class code' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function private.guard_short_code() from public, anon;
create trigger classrooms_guard_short_code before insert or update on public.classrooms
  for each row execute function private.guard_short_code();

-- 2. Tables -------------------------------------------------------------------------------------------------------
create table public.roster_members (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 80),
  grade smallint check (grade between 9 and 12),
  user_id uuid references public.profiles (id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index roster_members_class_name_key on public.roster_members (classroom_id, lower(full_name));
create index roster_members_user_id_idx on public.roster_members (user_id);

create table public.roster_weeks (
  id uuid primary key default gen_random_uuid(),
  meet_on date not null unique,
  created_at timestamptz not null default now()
);

create table public.roster_marks (
  member_id uuid not null references public.roster_members (id) on delete cascade,
  week_id uuid not null references public.roster_weeks (id) on delete cascade,
  present boolean not null default true,
  marked_by uuid default auth.uid() references public.profiles (id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (member_id, week_id)
);
create index roster_marks_week_id_idx on public.roster_marks (week_id);
create index roster_marks_marked_by_idx on public.roster_marks (marked_by);

alter table public.roster_members enable row level security;
alter table public.roster_weeks enable row level security;
alter table public.roster_marks enable row level security;

revoke all on public.roster_members, public.roster_weeks, public.roster_marks from public, anon, authenticated;
-- user_id is never written by clients: the trigger below links it, or an executive does in the SQL editor.
grant select, delete on public.roster_members to authenticated;
grant insert (classroom_id, full_name, grade, position), update (full_name, grade, position)
  on public.roster_members to authenticated;
grant select, delete on public.roster_weeks to authenticated;
grant insert (meet_on), update (meet_on) on public.roster_weeks to authenticated;
-- marked_by and marked_at come from the default and the trigger, never the client.
grant select, delete on public.roster_marks to authenticated;
grant insert (member_id, week_id, present), update (present) on public.roster_marks to authenticated;
-- PostgREST upserts SET every column sent, keys included. The update policy still checks the class.
grant update (member_id, week_id) on public.roster_marks to authenticated;

-- 3. Helpers and triggers -----------------------------------------------------------------------------------------
-- The class a roster row belongs to (marks are checked through it).
create or replace function private.roster_member_classroom(mid uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select classroom_id from public.roster_members where id = mid
$$;
revoke all on function private.roster_member_classroom(uuid) from public, anon;
grant execute on function private.roster_member_classroom(uuid) to authenticated;

-- A new name links to an account when exactly one profile has that name (trimmed, any case).
create or replace function private.roster_link_account()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.full_name := btrim(new.full_name);
  if tg_op = 'INSERT' and new.user_id is null then
    select min(p.id::text)::uuid into new.user_id
    from public.profiles p
    where lower(btrim(p.full_name)) = lower(new.full_name)
    having count(*) = 1;
  end if;
  return new;
end
$$;
revoke all on function private.roster_link_account() from public, anon;
create trigger roster_members_link before insert or update on public.roster_members
  for each row execute function private.roster_link_account();

-- Every change to a mark records who made it and when.
create or replace function private.roster_mark_stamp()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.marked_by := (select auth.uid());
  end if;
  new.marked_at := now();
  return new;
end
$$;
revoke all on function private.roster_mark_stamp() from public, anon;
create trigger roster_marks_stamp before insert or update on public.roster_marks
  for each row execute function private.roster_mark_stamp();

create trigger refuse_when_banned before insert or update on public.roster_members
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert or update on public.roster_weeks
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert or update on public.roster_marks
  for each row execute function private.refuse_when_banned();

-- 4. Policies -----------------------------------------------------------------------------------------------------
-- can_manage_classroom is false for banned accounts and true for executives.
create policy "roster_members: managers read" on public.roster_members
  for select to authenticated using ((select private.can_manage_classroom(classroom_id)));
create policy "roster_members: managers insert" on public.roster_members
  for insert to authenticated with check ((select private.can_manage_classroom(classroom_id)));
create policy "roster_members: managers update" on public.roster_members
  for update to authenticated
  using ((select private.can_manage_classroom(classroom_id)))
  with check ((select private.can_manage_classroom(classroom_id)));
create policy "roster_members: managers delete" on public.roster_members
  for delete to authenticated using ((select private.can_manage_classroom(classroom_id)));

create policy "roster_weeks: teachers read" on public.roster_weeks
  for select to authenticated
  using ((select private.can_teach()) and not (select private.is_banned()));
create policy "roster_weeks: executives insert" on public.roster_weeks
  for insert to authenticated
  with check ((select private.is_executive()) and not (select private.is_demo()) and not (select private.is_banned()));
create policy "roster_weeks: executives update" on public.roster_weeks
  for update to authenticated
  using ((select private.is_executive()) and not (select private.is_demo()) and not (select private.is_banned()))
  with check ((select private.is_executive()) and not (select private.is_demo()) and not (select private.is_banned()));
create policy "roster_weeks: executives delete" on public.roster_weeks
  for delete to authenticated
  using ((select private.is_executive()) and not (select private.is_demo()) and not (select private.is_banned()));

create policy "roster_marks: managers read" on public.roster_marks
  for select to authenticated
  using ((select private.can_manage_classroom(private.roster_member_classroom(member_id))));
create policy "roster_marks: managers insert" on public.roster_marks
  for insert to authenticated
  with check ((select private.can_manage_classroom(private.roster_member_classroom(member_id))));
create policy "roster_marks: managers update" on public.roster_marks
  for update to authenticated
  using ((select private.can_manage_classroom(private.roster_member_classroom(member_id))))
  with check ((select private.can_manage_classroom(private.roster_member_classroom(member_id))));
create policy "roster_marks: managers delete" on public.roster_marks
  for delete to authenticated
  using ((select private.can_manage_classroom(private.roster_member_classroom(member_id))));
