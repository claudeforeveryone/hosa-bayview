-- Task 10 (audit L4, L8): size caps on skills, and no bell floods.

-- L4. Every member downloads a room's skills, so cap them. Limits sit above the app's own form limits
-- (note 500, round 80, 100 steps of 500 characters).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'skills_note_len') then
    alter table public.skills add constraint skills_note_len check (note is null or char_length(note) <= 1000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'skills_round_len') then
    alter table public.skills add constraint skills_round_len check (round is null or char_length(round) <= 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'skills_steps_size') then
    alter table public.skills add constraint skills_steps_size check (
      jsonb_typeof(steps) <> 'array'
      or (jsonb_array_length(steps) <= 100 and octet_length(steps::text) <= 64000));
  end if;
end $$;

-- L8. A test notifies its room the first time it is posted, not on every unpublish and republish.
create index if not exists notifications_test_link_idx on public.notifications (link) where kind = 'test';

create or replace function private.test_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target text := '/c/' || new.classroom_id || '/tests/' || new.id;
begin
  if new.is_published and (tg_op = 'INSERT' or not old.is_published)
     and private.room_state(new.classroom_id) = 'class'
     and not exists (select 1 from public.notifications n where n.kind = 'test' and n.link = target) then
    perform private.notify(
      array(select private.audience(new.classroom_id)), 'test', 'New test: ' || new.title,
      coalesce((select c.name from public.classrooms c where c.id = new.classroom_id), ''),
      target);
  end if;
  return new;
end
$$;

-- L8. Posts always save, but one author rings the bell at most 10 times an hour.
create or replace function private.announce_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.announcements a
      where a.author_id is not distinct from new.author_id and a.created_at > now() - interval '1 hour') <= 10 then
    perform private.notify(
      array(select private.audience(new.classroom_id)), 'announcement', new.title, left(new.body, 160),
      case when new.classroom_id is null then '/announcements' else '/c/' || new.classroom_id end);
  end if;
  return new;
end
$$;
