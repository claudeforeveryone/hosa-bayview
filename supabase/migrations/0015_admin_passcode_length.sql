-- Executive is the top role: require a longer passcode (12+ characters).
create or replace function public.set_admin_passcode(code text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.is_executive() then
    raise exception 'Only executives can set the admin passcode' using errcode = '42501';
  end if;
  if code is null or char_length(code) not between 12 and 72 then
    raise exception 'Use 12 to 72 characters' using errcode = '22023';
  end if;
  insert into private.settings (key, value)
  values ('admin_passcode_hash', extensions.crypt(code, extensions.gen_salt('bf', 10)))
  on conflict (key) do update set value = excluded.value;
end
$$;
