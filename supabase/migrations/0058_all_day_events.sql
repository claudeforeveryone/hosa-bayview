-- All-day events (the chapter timeline gives dates, not times). An all-day event starts at Toronto midnight of
-- its first day; ends_at, when set, is Toronto midnight of its last day.
alter table public.events add column all_day boolean not null default false;
grant insert (all_day) on public.events to authenticated;
grant update (all_day) on public.events to authenticated;

-- An all-day notice reads as the date alone.
create or replace function private.event_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.notify(
    array(select private.audience(new.classroom_id)), 'event', new.title,
    case when new.all_day then to_char(new.starts_at at time zone 'America/Toronto', 'Dy Mon DD')
         else to_char(new.starts_at at time zone 'America/Toronto', 'Dy Mon DD, HH12:MI AM') end,
    '/calendar');
  return new;
end
$$;
