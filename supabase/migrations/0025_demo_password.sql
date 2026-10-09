-- Demo admins now need the executive password before signing in.
-- Only a bcrypt hash is stored (private.settings.demo_password_hash); it is set outside this file.
-- Wrong guesses are capped chapter-wide (30 per 10 minutes) because signed-out callers have no account to limit.

create table private.demo_attempts (at timestamptz not null default now());
create index demo_attempts_at_idx on private.demo_attempts (at);
revoke all on private.demo_attempts from public, anon, authenticated;

drop function public.demo_credentials(text);

create function public.demo_credentials(p_slug text, p_password text)
returns table (email text, secret text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  stored text;
begin
  if not private.demo_on() then
    return;
  end if;
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

revoke all on function public.demo_credentials(text, text) from public;
grant execute on function public.demo_credentials(text, text) to anon, authenticated;
