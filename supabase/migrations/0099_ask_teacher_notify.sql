-- Ask teacher reaches the trainer. Until now a member's question was saved but nobody was told: the only
-- notification fired when the trainer replied. Now asking (or asking again) notifies the classroom's owner,
-- or every executive when the room has no owner or the owner is the one asking. The classroom page lists
-- open questions across all its tests through classroom_flags().

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['announcement', 'test', 'reply', 'event', 'competition', 'role', 'question']));

-- Who hears about a question on this test: the room's owner if they can still teach it, else the executives.
create or replace function private.flag_recipients(tid uuid, asker uuid)
returns uuid[]
language sql stable security definer set search_path = ''
as $$
  with room as (
    select c.owner_id from public.tests t join public.classrooms c on c.id = t.classroom_id where t.id = tid
  ), owner as (
    select p.id from public.profiles p, room
    where p.id = room.owner_id and p.id <> asker
      and p.role in ('trainer', 'executive')
      and (p.banned_until is null or p.banned_until <= now())
  )
  select coalesce(
    (select array_agg(id) from owner),
    (select array_agg(p.id) from public.profiles p
      where p.role = 'executive' and p.id <> asker
        and (p.banned_until is null or p.banned_until <= now())),
    '{}'::uuid[])
$$;
revoke all on function private.flag_recipients(uuid, uuid) from public, anon, authenticated;

create or replace function private.flag_ask_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  cid uuid;
  who text;
  what text;
begin
  -- New question, or "Ask again" (note changed, or reopened after a reply).
  if tg_op = 'UPDATE' and not (
    new.status = 'open' and (old.status = 'answered' or old.note is distinct from new.note)
  ) then
    return new;
  end if;
  select t.classroom_id, t.title into cid, what from public.tests t where t.id = new.test_id;
  select coalesce(nullif(p.full_name, ''), 'A member') into who from public.profiles p where p.id = new.user_id;
  perform private.notify(
    private.flag_recipients(new.test_id, new.user_id), 'question',
    who || ' asked about ' || coalesce(what, 'a test'),
    coalesce(nullif(new.note, ''), (select 'Q' || q.position || ': ' || left(q.prompt, 140) from public.questions q where q.id = new.question_id)),
    '/c/' || cid || '/tests/' || new.test_id);
  return new;
end
$$;
revoke all on function private.flag_ask_notify() from public, anon, authenticated;

create or replace trigger question_flags_ask_notify after insert or update of note, status on public.question_flags
  for each row execute function private.flag_ask_notify();

-- Open questions across every test in a classroom, newest first. Managers only.
create or replace function public.classroom_flags(cid uuid)
returns table (id uuid, test_id uuid, test_title text, question_id uuid, full_name text, pos integer,
               prompt text, note text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select f.id, f.test_id, t.title, f.question_id, p.full_name, q.position, q.prompt, f.note, f.updated_at
  from public.question_flags f
  join public.tests t on t.id = f.test_id
  join public.questions q on q.id = f.question_id
  join public.profiles p on p.id = f.user_id
  where t.classroom_id = classroom_flags.cid
    and f.status = 'open'
    and private.can_manage_classroom(classroom_flags.cid)
  order by f.updated_at desc
  limit 50
$$;
revoke all on function public.classroom_flags(uuid) from public, anon;
grant execute on function public.classroom_flags(uuid) to authenticated;

-- Questions already waiting when this shipped: tell their trainers now.
do $$
declare
  f record;
begin
  for f in select qf.* from public.question_flags qf where qf.status = 'open' loop
    perform private.notify(
      private.flag_recipients(f.test_id, f.user_id), 'question',
      coalesce((select nullif(p.full_name, '') from public.profiles p where p.id = f.user_id), 'A member')
        || ' asked about ' || coalesce((select t.title from public.tests t where t.id = f.test_id), 'a test'),
      coalesce(nullif(f.note, ''), (select 'Q' || q.position || ': ' || left(q.prompt, 140) from public.questions q where q.id = f.question_id)),
      '/c/' || (select t.classroom_id from public.tests t where t.id = f.test_id) || '/tests/' || f.test_id);
  end loop;
end
$$;
