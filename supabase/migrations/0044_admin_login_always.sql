-- The preset admin accounts sign in by name and the admin password at any time, not only while an executive has
-- demo sign-in switched on. Same rate limit and hashed password as before; the toggle is no longer used.
create or replace function public.demo_logins()
returns table (slug text, full_name text)
language sql stable security definer set search_path = ''
as $$
  select d.slug, p.full_name
  from private.demo_accounts d join public.profiles p on p.id = d.user_id
  order by d.position
$$;

create or replace function public.demo_credentials(p_slug text, p_password text)
returns table (email text, secret text)
language plpgsql security definer set search_path = ''
as $$
declare
  stored text;
begin
  perform pg_advisory_xact_lock(hashtext('hosa.demo_password'));
  if (select count(*) from private.demo_attempts a where a.at > now() - interval '10 minutes') >= 30 then
    raise exception 'Too many wrong passwords. Try again in 10 minutes.' using errcode = '54000';
  end if;
  select value into stored from private.settings where key = 'demo_password_hash';
  if stored is null or p_password is null or extensions.crypt(p_password, stored) <> stored then
    insert into private.demo_attempts default values;
    return;
  end if;
  return query select d.email, d.secret from private.demo_accounts d where d.slug = p_slug;
end
$$;
