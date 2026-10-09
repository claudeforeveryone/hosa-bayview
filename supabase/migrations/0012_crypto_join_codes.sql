-- Join codes come from the crypto RNG instead of random(), whose state is shared across pooled connections.
create or replace function private.new_join_code()
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  code text;
begin
  loop
    bytes := extensions.gen_random_bytes(6);
    code := '';
    for i in 0..5 loop
      code := code || substr(alphabet, 1 + get_byte(bytes, i) % length(alphabet), 1);
    end loop;
    exit when not exists (select 1 from public.classrooms where join_code = code);
  end loop;
  return code;
end
$$;
