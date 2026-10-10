-- Official launch: classroom categories, library sections, 50 MB files, skills, storage usage. Additive only.

-- Classroom category: multiple choice, practical or showcase. Nullable for older rooms.
alter table public.classrooms
  add column category text check (category in ('mc', 'practical', 'showcase'));
grant select (category) on public.classrooms to authenticated;

-- Library sections (for example "Textbooks", "Videos"), grouped per classroom.
alter table public.materials
  add column section text check (section is null or char_length(section) between 1 and 80);
create index materials_section_idx on public.materials (classroom_id, section);
grant insert (section) on public.materials to authenticated;
grant update (section) on public.materials to authenticated;

-- Files up to 50 MB (the free plan's hard per-file limit).
alter table public.materials drop constraint materials_size_bytes_check;
alter table public.materials
  add constraint materials_size_bytes_check check (size_bytes is null or size_bytes between 0 and 52428800);
update storage.buckets set file_size_limit = 52428800 where id = 'materials';

-- Placeholder rows ("Link coming soon") have neither a url nor a file; a row still never has both.
alter table public.materials drop constraint materials_check;
alter table public.materials
  add constraint materials_source_check check (url is null or path is null);

-- Skills: named practical skills per classroom, with optional scored steps.
-- steps element shape: {"text": string, "points"?: number}
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  position int not null default 0,
  name text not null check (char_length(name) between 1 and 120),
  round text,
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array'),
  note text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz default now()
);
create index skills_room_idx on public.skills (classroom_id, position);
create index skills_created_by_idx on public.skills (created_by);
alter table public.skills enable row level security;
revoke all on public.skills from anon, authenticated;
grant select, delete on public.skills to authenticated;
grant insert (classroom_id, position, name, round, steps, note) on public.skills to authenticated;
grant update (position, name, round, steps, note) on public.skills to authenticated;
create policy "skills: read" on public.skills for select to authenticated
  using (private.can_view_classroom(classroom_id));
create policy "skills: add" on public.skills for insert to authenticated
  with check (private.can_manage_classroom(classroom_id));
create policy "skills: edit" on public.skills for update to authenticated
  using (private.can_manage_classroom(classroom_id)) with check (private.can_manage_classroom(classroom_id));
create policy "skills: remove" on public.skills for delete to authenticated
  using (private.can_manage_classroom(classroom_id));

-- Storage usage per bucket, for the executive dashboard.
create function public.storage_usage()
returns table (bucket text, files bigint, bytes bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_executive() then
    raise exception 'executives only' using errcode = '42501';
  end if;
  return query
    select o.bucket_id::text, count(*)::bigint, coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    from storage.objects o
    group by o.bucket_id
    order by o.bucket_id;
end
$$;
revoke all on function public.storage_usage() from public, anon;
grant execute on function public.storage_usage() to authenticated;
