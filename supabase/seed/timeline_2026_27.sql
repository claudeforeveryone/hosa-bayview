-- Bayview HOSA 2026-2027 timeline (all tentative), loaded into the chapter calendar as all-day events.
-- Run once with execute_sql. The per-event notice is paused while loading; one summary notice goes out instead.
-- "Thursday, Sep 31" in the source timeline is read as Thursday, Oct 1. "Online training" has no date yet
-- (trainers pick it) and is left out.
begin;
alter table public.events disable trigger events_notify;

with t(starts, ends, title, details) as (values
  ('2026-09-08', null, 'Start of school', ''),
  ('2026-09-14', null, 'HOSA kickoff', ''),
  ('2026-09-24', null, 'Member recruitment MC exam', ''),
  ('2026-09-28', null, 'Member interviews', ''),
  ('2026-09-30', null, 'Member interviews', ''),
  ('2026-10-01', null, 'Results released', 'Listed as "Thursday, Sep 31" on the timeline.'),
  ('2026-10-08', null, 'Category fair', ''),
  ('2026-10-11', null, 'Category decision forms due', ''),
  ('2026-10-12', null, 'Category decisions released', ''),
  ('2026-10-15', null, 'First training', ''),
  ('2026-10-22', null, 'Training 2', ''),
  ('2026-10-29', null, 'Halloween social', ''),
  ('2026-11-05', null, 'Training 4', ''),
  ('2026-11-12', null, 'Training 5', ''),
  ('2026-11-19', null, 'FLC exam day', 'FLC runs Nov 15 to 22. MC and practical events write their exams today.'),
  ('2026-11-26', null, 'Training 6 (FLC take-up)', ''),
  ('2026-12-03', null, 'Training 7', ''),
  ('2026-12-10', null, 'Training 8', 'Start preparing materials for the Winter Social.'),
  ('2026-12-17', null, 'Winter social', ''),
  ('2027-01-07', null, 'Training 9', ''),
  ('2027-01-14', null, 'Training 10', ''),
  ('2027-01-21', null, 'Exam week, no training', ''),
  ('2027-01-28', null, 'Exam week, no training', ''),
  ('2027-02-04', null, 'Training 11 (BLC prep)', ''),
  ('2027-02-09', null, 'BLC round 1 (MC)', ''),
  ('2027-02-12', null, 'BLC round 2 (practicals and presentations)', ''),
  ('2027-02-18', null, 'Take up BLC', ''),
  ('2027-02-25', null, 'SLC briefing + training', ''),
  ('2027-03-01', '2027-03-03', 'SLC', ''),
  ('2027-03-01', '2027-03-07', 'Virtual SLC (NGL/ATC events)', ''),
  ('2027-03-11', null, 'SLC debrief', 'Listed as "Thursday, March 12" on the timeline; the Thursday is Mar 11.'),
  ('2027-03-12', '2027-06-21', 'ILC prep', ''),
  ('2027-06-22', '2027-06-25', 'ILC', '')
)
insert into public.events (classroom_id, title, starts_at, ends_at, location, details, all_day, created_by)
select null, t.title,
  (t.starts::date)::timestamp at time zone 'America/Toronto',
  case when t.ends is null then null else (t.ends::date)::timestamp at time zone 'America/Toronto' end,
  '', trim(both ' ' from 'Tentative. ' || t.details), true,
  (select p.id from public.profiles p where p.email = 'josephislockedin@gmail.com')
from t
where not exists (
  select 1 from public.events e
  where e.classroom_id is null and e.title = t.title
    and e.starts_at = (t.starts::date)::timestamp at time zone 'America/Toronto');

alter table public.events enable trigger events_notify;

select private.notify(array(select private.audience(null)), 'event', 'The 2026-27 chapter calendar is up',
  'Trainings, socials, FLC, BLC, SLC and ILC dates. All tentative.', '/calendar');
commit;
