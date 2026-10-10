-- Task 10: cheap performance-advisor fixes. Index every unindexed foreign key and give the private
-- attempt logs a primary key. Unused-index drops are left alone on purpose.
create index if not exists admin_log_actor_id_idx on public.admin_log (actor_id);
create index if not exists announcements_author_id_idx on public.announcements (author_id);
create index if not exists attempt_answers_question_id_idx on public.attempt_answers (question_id);
create index if not exists attendance_sessions_created_by_idx on public.attendance_sessions (created_by);
create index if not exists attendance_sessions_submitted_by_idx on public.attendance_sessions (submitted_by);
create index if not exists attendance_sessions_updated_by_idx on public.attendance_sessions (updated_by);
create index if not exists events_classroom_id_idx on public.events (classroom_id);
create index if not exists events_created_by_idx on public.events (created_by);
create index if not exists materials_created_by_idx on public.materials (created_by);
create index if not exists presence_classroom_id_idx on public.presence (classroom_id);
create index if not exists question_flags_answered_by_idx on public.question_flags (answered_by);
create index if not exists question_flags_user_id_idx on public.question_flags (user_id);
create index if not exists resources_created_by_idx on public.resources (created_by);
create index if not exists tests_created_by_idx on public.tests (created_by);
create index if not exists user_warnings_issued_by_idx on public.user_warnings (issued_by);

alter table private.passcode_attempts add column if not exists id bigint generated always as identity primary key;
alter table private.join_attempts add column if not exists id bigint generated always as identity primary key;
alter table private.demo_attempts add column if not exists id bigint generated always as identity primary key;
