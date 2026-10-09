-- Phase 1: profiles, roles, first executive, helper functions.

create type public.app_role as enum ('executive', 'trainer', 'trainee');

-- Private schema: helpers and settings, never exposed through the API.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table private.settings (
  key text primary key,
  value text not null
);
revoke all on private.settings from public, anon, authenticated;

insert into private.settings (key, value)
values ('first_executive_email', 'josephislockedin@gmail.com');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.app_role not null default 'trainee',
  created_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
alter table public.profiles enable row level security;

-- Helpers. security definer so policies can call them without recursing into profiles RLS.
create function private.my_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create function private.is_executive()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.my_role() = 'executive', false)
$$;

-- Trainers and executives can create and run classrooms.
create function private.can_teach()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.my_role() in ('trainer', 'executive'), false)
$$;

grant execute on function private.my_role(), private.is_executive(), private.can_teach() to authenticated;

-- New auth user -> profile. First executive is promoted by email.
create function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  first_exec text;
begin
  select value into first_exec from private.settings where key = 'first_executive_email';
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    case when lower(new.email) = lower(first_exec)
      then 'executive'::public.app_role
      else 'trainee'::public.app_role end
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Only executives change roles; id and email are system-managed; never remove the last executive.
create function private.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    if new.role is distinct from old.role and not private.is_executive() then
      raise exception 'Only executives can change roles' using errcode = '42501';
    end if;
    if new.id is distinct from old.id or new.email is distinct from old.email then
      raise exception 'Profile id and email cannot be changed here' using errcode = '42501';
    end if;
  end if;
  if old.role = 'executive' and new.role <> 'executive'
     and (select count(*) from public.profiles where role = 'executive') <= 1 then
    raise exception 'There must be at least one executive' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger guard_profile_update
  before update on public.profiles
  for each row execute function private.guard_profile_update();

-- Policies. Classmate visibility for names goes through security definer RPCs, not this table.
create policy "profiles: read own or exec"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_executive());

create policy "profiles: update own or exec"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or private.is_executive())
  with check (id = (select auth.uid()) or private.is_executive());

create policy "profiles: exec delete"
  on public.profiles for delete to authenticated
  using (private.is_executive());
