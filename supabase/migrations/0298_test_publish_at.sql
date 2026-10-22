-- Scheduled posting. A room's managers can keep a test hidden until a set time; a job posts it then, which
-- rings the room's bell through the existing tests_notify trigger. Hidden tests stay hidden by the same rule as
-- before (private.can_take_test checks is_published), so nothing a member reads changes until the test posts.
alter table public.tests add column if not exists publish_at timestamptz;

grant insert (publish_at) on public.tests to authenticated;
grant update (publish_at) on public.tests to authenticated;

-- A posted test has no schedule, however it got posted, so a later hide never posts itself again.
create or replace function private.clear_publish_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.is_published then
    new.publish_at := null;
  end if;
  return new;
end
$$;
revoke all on function private.clear_publish_at() from public, anon, authenticated;

create or replace trigger tests_clear_publish_at before insert or update of is_published, publish_at on public.tests
  for each row execute function private.clear_publish_at();

-- Posts every test whose time has come. A test emptied of questions in the meantime stays hidden and loses its
-- schedule, so it never posts empty. Returns how many it posted.
create or replace function private.post_scheduled_tests()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  posted integer;
begin
  update public.tests t set is_published = true
  where t.publish_at <= now() and not t.is_published
    and exists (select 1 from public.questions q where q.test_id = t.id);
  get diagnostics posted = row_count;

  update public.tests t set publish_at = null
  where t.publish_at <= now() and not t.is_published;
  return posted;
end
$$;
revoke all on function private.post_scheduled_tests() from public, anon, authenticated;

create index if not exists tests_publish_at_idx on public.tests (publish_at) where publish_at is not null;

-- Every minute; a re-run of this migration replaces the job instead of adding a second one.
select cron.schedule('hosa-post-scheduled-tests', '* * * * *', $$select private.post_scheduled_tests()$$);
