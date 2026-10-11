-- A fourth role, Jobless. It has the same permissions as trainee: every policy that grants more checks for
-- trainer or executive by name, so nothing else changes.
alter type public.app_role add value if not exists 'jobless';
