-- 0270: personal calendar events and day-of reminders.
--
-- 1. events.owner_id: an event with an owner is personal. Only its owner reads, adds, edits or deletes it, it
--    never belongs to a class (classroom_id stays null), and it never notifies anyone. Chapter and class events
--    (owner_id null) keep their old rules exactly.
-- 2. events.reminded_on: the Toronto day a reminder went out, so each event is reminded once.
-- 3. private.event_reminders(): from 7 am Toronto on the day of an event, its audience (the chapter, the class,
--    or the owner of a personal event) gets a "Today" notification. pg_cron runs it every hour at :07. Events
--    made in the last 12 hours are skipped: their audience was just told about them.

alter table public.events add column if not exists owner_id uuid references public.profiles (id) on delete cascade;
alter table public.events add column if not exists reminded_on date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_personal_has_no_class') then
    alter table public.events
      add constraint events_personal_has_no_class check (owner_id is null or classroom_id is null);
  end if;
end
$$;

-- Clients get columns one by one here. owner_id can be read and set on insert, never updated; reminded_on is
-- the database's alone.
grant select (owner_id), insert (owner_id) on public.events to authenticated;

create index if not exists events_owner_idx on public.events (owner_id) where owner_id is not null;
create index if not exists events_unreminded_idx on public.events (starts_at) where reminded_on is null;

alter policy "events: read" on public.events
  using (
    case
      when owner_id is not null then owner_id = (select auth.uid()) and not (select private.is_banned())
      else (classroom_id is null and not (select private.is_banned())) or private.can_view_classroom(classroom_id)
    end
  );

alter policy "events: add" on public.events
  with check (
    case
      when owner_id is not null then
        owner_id = (select auth.uid()) and classroom_id is null and not private.is_banned()
      else private.can_post(classroom_id)
    end
  );

-- Who an event belongs to can't change: personal stays personal (and yours), shared stays shared.
alter policy "events: edit" on public.events
  using (
    case
      when owner_id is not null then owner_id = (select auth.uid()) and not private.is_banned()
      else private.can_post(classroom_id)
    end
  )
  with check (
    case
      when owner_id is not null then
        owner_id = (select auth.uid()) and classroom_id is null and not private.is_banned()
      else private.can_post(classroom_id)
    end
  );

alter policy "events: remove" on public.events
  using (
    case
      when owner_id is not null then owner_id = (select auth.uid()) and not private.is_banned()
      else private.can_post(classroom_id)
    end
  );

-- An event can't move between personal and shared after it's made. Clients have no update grant on owner_id,
-- so this only guards definer code and future grants.
create or replace function private.guard_event_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'An event can''t change who it belongs to' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function private.guard_event_owner() from public, anon, authenticated;

create or replace trigger events_guard_owner before update on public.events
  for each row execute function private.guard_event_owner();

-- New-event notifications: personal events tell nobody (the owner just made it).
create or replace function private.event_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.owner_id is not null then
    return new;
  end if;
  perform private.notify(
    array(select private.audience(new.classroom_id)), 'event', new.title,
    case when new.all_day then to_char(new.starts_at at time zone 'America/Toronto', 'Dy Mon DD')
         else to_char(new.starts_at at time zone 'America/Toronto', 'Dy Mon DD, HH12:MI AM') end,
    '/calendar');
  return new;
end
$$;

create or replace function private.event_reminders()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  local_now timestamp := now() at time zone 'America/Toronto';
  today date := (now() at time zone 'America/Toronto')::date;
  e record;
  sent integer := 0;
begin
  if local_now::time < time '07:00' then
    return 0;
  end if;
  for e in
    select ev.id, ev.title, ev.classroom_id, ev.owner_id, ev.starts_at, ev.all_day
    from public.events ev
    where ev.reminded_on is null
      and (ev.starts_at at time zone 'America/Toronto')::date = today
      and (ev.all_day or ev.starts_at > now())
      and ev.created_at < now() - interval '12 hours'
    for update skip locked
  loop
    perform private.notify(
      case when e.owner_id is not null then array[e.owner_id]
           else array(select private.audience(e.classroom_id)) end,
      'event',
      'Today: ' || e.title,
      case when e.all_day then 'All day'
           else to_char(e.starts_at at time zone 'America/Toronto', 'HH12:MI AM') end,
      '/calendar');
    update public.events set reminded_on = today where id = e.id;
    sent := sent + 1;
  end loop;
  return sent;
end
$$;
revoke all on function private.event_reminders() from public, anon, authenticated;

-- Hourly; a re-run of this migration replaces the job instead of adding a second one.
select cron.schedule('hosa-event-reminders', '7 * * * *', $$select private.event_reminders()$$);
