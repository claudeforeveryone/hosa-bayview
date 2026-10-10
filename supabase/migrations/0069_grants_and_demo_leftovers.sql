-- Task 10 (audit L3, L7): tighten grants and clear the dead demo-login surface.

-- L3. anon never reads or writes app tables (RLS already refused it; now the grant is gone too).
revoke all on table public.profiles from anon;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
-- Nobody but the owner truncates, adds triggers or references app tables.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- New tables, sequences and functions in public stop being granted to anon by default, and new tables
-- stop giving authenticated TRUNCATE/TRIGGER/REFERENCES. (Functions still get EXECUTE through PUBLIC,
-- Postgres' built-in default; keep revoking it per function, as every migration here already does.)
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from authenticated;

-- L7. Demo login is retired (0 demo accounts): drop its settings and close its RPCs.
delete from private.settings where key in ('demo_login', 'demo_password_hash');
revoke execute on function public.set_demo_login(boolean) from public, anon, authenticated;
revoke execute on function public.demo_login_enabled() from public, anon, authenticated;
