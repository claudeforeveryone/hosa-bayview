-- The attendance roster follows event membership instead of a typed-in list. Joining an event adds you to its
-- roster, leaving archives your row (marks are kept), and renaming yourself or changing grade updates it.
-- Rows that aren't linked to a current member (the names first typed in from the paper tracker) are archived
-- and no longer shown; a member who later joins under the same name reuses their old row.

alter table public.roster_members add column if not exists archived boolean not null default false;
create index if not exists roster_members_live_idx on public.roster_members (classroom_id) where not archived;

-- Join: add or revive the member's roster row. Runs as the definer, so a member joining by code doesn't need
-- roster write access.
create or replace function private.roster_on_join()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p record;
begin
  select pr.full_name, pr.grade into p from public.profiles pr where pr.id = new.user_id;
  if p is null or btrim(coalesce(p.full_name, '')) = '' then
    return new;
  end if;
  -- Their own row from an earlier stay, if any.
  update public.roster_members r
    set archived = false, full_name = btrim(left(p.full_name, 80)), grade = coalesce(p.grade, r.grade)
    where r.classroom_id = new.classroom_id and r.user_id = new.user_id;
  if found then
    return new;
  end if;
  insert into public.roster_members (classroom_id, full_name, grade, user_id, position)
  values (new.classroom_id, btrim(left(p.full_name, 80)), p.grade, new.user_id,
          coalesce((select max(r.position) + 1 from public.roster_members r where r.classroom_id = new.classroom_id), 0))
  on conflict (classroom_id, lower(full_name)) do update
    set user_id = excluded.user_id, archived = false, grade = coalesce(excluded.grade, public.roster_members.grade);
  return new;
end
$$;
revoke all on function private.roster_on_join() from public, anon, authenticated;

create or replace function private.roster_on_leave()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.roster_members r set archived = true
    where r.classroom_id = old.classroom_id and r.user_id = old.user_id;
  return old;
end
$$;
revoke all on function private.roster_on_leave() from public, anon, authenticated;

create or replace trigger classroom_members_roster_join after insert on public.classroom_members
  for each row execute function private.roster_on_join();
create or replace trigger classroom_members_roster_leave after delete on public.classroom_members
  for each row execute function private.roster_on_leave();

-- Name or grade changes follow the member onto their roster rows (a clash with another row's name is skipped).
create or replace function private.roster_on_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.full_name is distinct from old.full_name or new.grade is distinct from old.grade then
    begin
      update public.roster_members r
        set full_name = btrim(left(new.full_name, 80)), grade = new.grade
        where r.user_id = new.id;
    exception when unique_violation then
      update public.roster_members r set grade = new.grade where r.user_id = new.id;
    end;
  end if;
  return new;
end
$$;
revoke all on function private.roster_on_profile() from public, anon, authenticated;
create or replace trigger profiles_roster_sync after update of full_name, grade on public.profiles
  for each row execute function private.roster_on_profile();

-- Archive everything not tied to a current member, then add every current member.
update public.roster_members r set archived = true
  where not exists (
    select 1 from public.classroom_members m where m.classroom_id = r.classroom_id and m.user_id = r.user_id
  );

insert into public.roster_members (classroom_id, full_name, grade, user_id, position)
select m.classroom_id, btrim(left(p.full_name, 80)), p.grade, m.user_id,
       row_number() over (partition by m.classroom_id order by m.joined_at)
from public.classroom_members m
join public.profiles p on p.id = m.user_id
where btrim(coalesce(p.full_name, '')) <> ''
  and not exists (
    select 1 from public.roster_members r where r.classroom_id = m.classroom_id and r.user_id = m.user_id
  )
on conflict (classroom_id, lower(full_name)) do update
  set user_id = excluded.user_id, archived = false;

update public.roster_members r set archived = false
  where exists (
    select 1 from public.classroom_members m where m.classroom_id = r.classroom_id and m.user_id = r.user_id
  );
