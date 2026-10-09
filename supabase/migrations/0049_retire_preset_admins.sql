-- The preset exec accounts (one shared password, username sign-in, no audit trail) are retired.
-- Admins sign up with their own email and are promoted from /admin or with the admin passcode.
-- The accounts owned no classrooms, tests or decks. They are locked rather than deleted (deleting can be done later
-- from the Supabase dashboard): no way to sign in, banned, and no longer executives.
revoke execute on function public.demo_credentials(text, text) from anon, authenticated, public;
revoke execute on function public.demo_logins() from anon, authenticated, public;

-- auth.users gets a finite date: GoTrue can't scan 'infinity' and 500s on every token request for the user.
update auth.users
  set banned_until = '9999-12-31 23:59:59+00',
      encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf'))
  where id in (select user_id from private.demo_accounts);

select set_config('hosa.moderation', 'on', true);
update public.profiles
  set role = 'trainee', banned_until = 'infinity',
      ban_reason = 'Retired shared admin account. Sign up with your own email.'
  where id in (select user_id from private.demo_accounts);
