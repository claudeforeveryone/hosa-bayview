-- The preset exec accounts (Kaden, Jenna, Bernice) get full executive powers: ban, remove, roles, pictures.
-- They keep signing in by name and the exec password (demo_logins / demo_credentials still read this table);
-- full_access only stops is_demo() from treating them as look-around accounts.
alter table private.demo_accounts add column full_access boolean not null default false;

create or replace function private.is_demo()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.demo_accounts d where d.user_id = (select auth.uid()) and not d.full_access)
$$;

update private.demo_accounts set full_access = true where slug in ('kaden-li', 'jenna-bae', 'bernice-au');
