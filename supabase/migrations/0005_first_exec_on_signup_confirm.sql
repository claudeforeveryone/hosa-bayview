-- The auth server inserts a new user unconfirmed and confirms it in a second statement of the same
-- signup transaction (when "Confirm email" is off). Promote on that confirmation, but only when the
-- profile row was created in this same transaction, i.e. this is the signup itself. A squatter's
-- account confirmed later (by the owner clicking a link) is in a different transaction and never matches.
create function private.handle_user_confirmed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null
     and exists (select 1 from public.profiles where id = new.id and created_at = now()) then
    perform private.maybe_promote_first_exec(new.id, new.email, true);
  end if;
  return new;
end
$$;
revoke all on function private.handle_user_confirmed() from public, anon, authenticated;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function private.handle_user_confirmed();
