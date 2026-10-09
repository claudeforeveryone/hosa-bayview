-- Notification links are in-app paths. Browsers read "/\host" as another site, so no backslashes either.
alter table public.notifications
  add constraint notifications_link_no_backslash check (position(chr(92) in link) = 0);
