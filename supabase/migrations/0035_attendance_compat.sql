-- Temporary: keeps the per-day attendance code working while the weekly code ships.
-- Drop held_on and save_attendance_day once nothing calls them.
alter table public.attendance_sessions add column if not exists held_on date generated always as (week_start) stored;
grant select (held_on) on public.attendance_sessions to authenticated;

create or replace function public.save_attendance_day(p_classroom uuid, p_date date, p_note text, p_statuses jsonb)
returns uuid
language sql volatile security definer set search_path = ''
as $$
  select public.save_attendance_week(p_classroom, date_trunc('week', p_date)::date, p_note, p_statuses)
$$;
revoke all on function public.save_attendance_day(uuid, date, text, jsonb) from public, anon;
grant execute on function public.save_attendance_day(uuid, date, text, jsonb) to authenticated;
