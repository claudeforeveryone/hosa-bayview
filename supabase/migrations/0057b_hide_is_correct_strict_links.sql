-- 1. attempt_answers.is_correct was readable straight through the API by the attempt's owner, which leaked right and
--    wrong picks while a competition is open (or on a test with show_answers off). The app only reads answers
--    through security-definer RPCs that apply keys_locked and show_answers, so members lose the column itself.
revoke select on public.attempt_answers from authenticated;
grant select (attempt_id, question_id, selected_index, answered_at) on public.attempt_answers to authenticated;

-- 2. Notification links: browsers drop tabs and newlines inside URLs, so "/<tab>/host" can become "//host". Only
--    printable, non-space characters, one leading slash, no backslash.
alter table public.notifications
  add constraint notifications_link_plain check (link ~ '^/([^/\\[:space:][:cntrl:]][^\\[:space:][:cntrl:]]*)?$');
