-- Omega security 0201 (audit M1). The first-executive bootstrap keyed on an email address and only checked that the
-- signup was confirmed. With "Confirm email" off, anyone who re-created private.settings.first_executive_email could
-- take the first executive seat by signing up with that address. Executives are now granted by uid only
-- (private.exec_granters, set by hand in the SQL editor), so this function does nothing. The trigger on
-- auth.users still calls it, so the signature stays.
create or replace function private.maybe_promote_first_exec(uid uuid, addr text, confirmed boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  -- Retired (0201). Never promotes by email.
  return;
end
$$;
revoke all on function private.maybe_promote_first_exec(uuid, text, boolean) from public, anon, authenticated;
