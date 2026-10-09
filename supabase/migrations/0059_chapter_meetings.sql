-- Chapter meeting schedule (0059). One row per Thursday meeting for 2026-27. Attendance is still one
-- session per classroom per Monday-start week (0034), so a meeting belongs to the week that holds its
-- Thursday: week_start is generated from meets_on and is unique, one meeting per week.
--
-- kind: 'training', 'social', 'exam' (a meeting where people write exams), or 'none' (a listed week with
-- no training, such as exam week). 'none' rows are shown as no meeting and are never counted as absences.
-- Weeks with no meeting and no row here (Dec 24, Dec 31, Feb 11, Mar 4) simply have no row.
--
-- Everyone signed in reads the schedule. Only executives (not demo accounts) write it.

-- 1. Table -----------------------------------------------------------------------------

create table public.chapter_meetings (
  id uuid primary key default gen_random_uuid(),
  meets_on date not null unique,
  week_start date generated always as (meets_on - (extract(isodow from meets_on)::int - 1)) stored,
  title text not null check (char_length(title) between 1 and 80),
  kind text not null check (kind in ('training', 'social', 'exam', 'none')),
  created_at timestamptz not null default now(),
  constraint chapter_meetings_thursday check (extract(isodow from meets_on) = 4),
  constraint chapter_meetings_one_per_week unique (week_start)
);

alter table public.chapter_meetings enable row level security;
revoke all on public.chapter_meetings from public, anon, authenticated;
grant select on public.chapter_meetings to authenticated;
grant insert (meets_on, title, kind), update (meets_on, title, kind) on public.chapter_meetings to authenticated;
grant delete on public.chapter_meetings to authenticated;

create policy "chapter_meetings: signed-in read"
  on public.chapter_meetings for select to authenticated
  using (true);

create policy "chapter_meetings: executives write"
  on public.chapter_meetings for all to authenticated
  using (private.is_executive() and not private.is_demo())
  with check (private.is_executive() and not private.is_demo());

-- 2. Seed 2026-27 ----------------------------------------------------------------------
-- Dates are tentative. Mar 12, 2027 is a Friday, so the SLC debrief sits on Thu Mar 11.

insert into public.chapter_meetings (meets_on, title, kind) values
  ('2026-10-15', 'First Training', 'training'),
  ('2026-10-22', 'Training 2', 'training'),
  ('2026-10-29', 'Halloween Social', 'social'),
  ('2026-11-05', 'Training 4', 'training'),
  ('2026-11-12', 'Training 5', 'training'),
  ('2026-11-19', 'FLC exams (MC and Practical)', 'exam'),
  ('2026-11-26', 'Training 6 (FLC take-up)', 'training'),
  ('2026-12-03', 'Training 7', 'training'),
  ('2026-12-10', 'Training 8 (Winter Social prep)', 'training'),
  ('2026-12-17', 'Winter Social', 'social'),
  ('2027-01-07', 'Training 9', 'training'),
  ('2027-01-14', 'Training 10', 'training'),
  ('2027-01-21', 'Exam week, no training', 'none'),
  ('2027-01-28', 'Exam week, no training', 'none'),
  ('2027-02-04', 'Training 11 (BLC prep)', 'training'),
  ('2027-02-18', 'Take up BLC', 'training'),
  ('2027-02-25', 'SLC briefing and training', 'training'),
  ('2027-03-11', 'SLC debrief', 'training')
on conflict (meets_on) do nothing;

-- ILC prep: every Thursday from Mar 18 to Jun 17, 2027.
insert into public.chapter_meetings (meets_on, title, kind)
select d::date, 'ILC prep', 'training'
from generate_series('2027-03-18'::date, '2027-06-17'::date, interval '7 days') as d
on conflict (meets_on) do nothing;
