-- Only signed-in executives use these; Supabase's default grants also gave them to anon.
-- demo_logins / demo_credentials stay open to anon on purpose: the log-in page needs them, and they return nothing while demo sign-in is off.
revoke execute on function public.set_demo_login(boolean), public.demo_login_enabled() from anon;
