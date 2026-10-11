-- 0280: announcements as an inbox. Each member keeps their own read and deleted state per announcement:
-- "Mark as read" changes how it looks in their list, and "Delete announcement" takes it out of their list only
-- (an executive's delete still removes the announcement for everyone). Nobody can see anyone else's state.

create table if not exists public.announcement_states (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  read_at timestamptz,
  deleted_at timestamptz,
  primary key (user_id, announcement_id)
);
create index if not exists announcement_states_announcement_idx on public.announcement_states (announcement_id);

alter table public.announcement_states enable row level security;
revoke all on public.announcement_states from anon, authenticated;
grant select, insert (announcement_id, read_at, deleted_at), update (read_at, deleted_at)
  on public.announcement_states to authenticated;

-- Your own rows, and only for announcements you can read (the subquery runs under your own RLS).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'announcement_states'
                 and policyname = 'announcement_states: own') then
    create policy "announcement_states: own" on public.announcement_states for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'announcement_states'
                 and policyname = 'announcement_states: add own') then
    create policy "announcement_states: add own" on public.announcement_states for insert to authenticated
      with check (
        user_id = (select auth.uid())
        and exists (select 1 from public.announcements a where a.id = announcement_id)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'announcement_states'
                 and policyname = 'announcement_states: change own') then
    create policy "announcement_states: change own" on public.announcement_states for update to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end
$$;
