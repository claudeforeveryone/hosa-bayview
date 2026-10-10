-- The GIF accounts (0101), for the admin people list: executives only, so the panel can offer GIF uploads to
-- the right people in one call.
create or replace function public.gif_user_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select g.user_id from private.gif_users g where private.is_executive()
$$;
revoke all on function public.gif_user_ids() from public, anon;
grant execute on function public.gif_user_ids() to authenticated;
