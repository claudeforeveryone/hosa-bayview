-- Demo sign-in: one-click executive accounts for showing the site to trainers.
-- The demo accounts are separate from anyone's real account. Their passwords are random, made here,
-- and only ever handed to the server action while demo sign-in is on. Turning it off (Settings, execs)
-- rotates every demo password and ends their sessions, so nothing obtained earlier keeps working.

create table private.demo_accounts (
  slug text primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null,
  secret text not null,
  position integer not null
);
revoke all on private.demo_accounts from public, anon, authenticated;

insert into private.settings (key, value) values ('demo_login', 'on')
on conflict (key) do update set value = 'on';

create function private.make_demo(p_slug text, p_name text, p_email text, p_position integer)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := gen_random_uuid();
  pw text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
    extensions.crypt(pw, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', p_name), now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (uid, uid::text, 'email',
          jsonb_build_object('sub', uid::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
          now(), now(), now());
  update public.profiles set role = 'executive', full_name = p_name where id = uid;
  insert into private.demo_accounts (slug, user_id, email, secret, position) values (p_slug, uid, p_email, pw, p_position);
end
$$;
revoke all on function private.make_demo(text, text, text, integer) from public, anon, authenticated;

select private.make_demo('kaden-li', 'Kaden Li', 'demo.kaden.li@example.com', 1);
select private.make_demo('jenna-bae', 'Jenna Bae', 'demo.jenna.bae@example.com', 2);
select private.make_demo('bernice-au', 'Bernice Au', 'demo.bernice.au@example.com', 3);

create function private.demo_on()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select value = 'on' from private.settings where key = 'demo_login'), false)
$$;

-- Login page: who to show. Empty when demo sign-in is off.
create function public.demo_logins()
returns table (slug text, full_name text)
language sql stable security definer set search_path = ''
as $$
  select d.slug, p.full_name
  from private.demo_accounts d join public.profiles p on p.id = d.user_id
  where private.demo_on()
  order by d.position
$$;

-- The server action signs in with these. Nothing comes back when demo sign-in is off.
create function public.demo_credentials(p_slug text)
returns table (email text, secret text)
language sql stable security definer set search_path = ''
as $$
  select d.email, d.secret from private.demo_accounts d where d.slug = p_slug and private.demo_on()
$$;

create function public.demo_login_enabled()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_executive() and private.demo_on()
$$;

create function public.set_demo_login(enabled boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  d record;
  pw text;
begin
  if not private.is_executive() then
    raise exception 'Only executives can change demo sign-in' using errcode = '42501';
  end if;
  update private.settings set value = case when enabled then 'on' else 'off' end where key = 'demo_login';
  if not enabled then
    for d in select * from private.demo_accounts loop
      pw := encode(extensions.gen_random_bytes(24), 'hex');
      update auth.users set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf')) where id = d.user_id;
      update private.demo_accounts set secret = pw where slug = d.slug;
      delete from auth.sessions where user_id = d.user_id;
    end loop;
  end if;
end
$$;

revoke all on function private.demo_on() from public, anon, authenticated;
revoke all on function public.demo_logins(), public.demo_credentials(text), public.demo_login_enabled(), public.set_demo_login(boolean) from public;
grant execute on function public.demo_logins(), public.demo_credentials(text) to anon, authenticated;
grant execute on function public.demo_login_enabled(), public.set_demo_login(boolean) to authenticated;
