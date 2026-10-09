-- The weekly attendance code is live; nothing reads held_on or calls save_attendance_day any more.
drop function if exists public.save_attendance_day(uuid, date, text, jsonb);
alter table public.attendance_sessions drop column if exists held_on;
