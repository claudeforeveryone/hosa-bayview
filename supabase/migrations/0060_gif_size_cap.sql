-- Executive GIF profile pictures: 1 MB (1048576 bytes) each, except Joseph Leung and Kaden Li, who keep the
-- 2 MB bucket limit. The exempt list is a private table, not hard-coded in the policy. A GIF whose size
-- can't be read is refused (fails closed). Members and trainers can't upload GIFs at all (0046, 0046b).

-- 1. Exempt list -----------------------------------------------------------------------

create table private.gif_size_exempt (
  user_id uuid primary key references public.profiles (id) on delete cascade
);
alter table private.gif_size_exempt enable row level security;
revoke all on private.gif_size_exempt from public, anon, authenticated;

-- Joseph Leung (josephislockedin@gmail.com) and Kaden Li (likaden726@gmail.com, the executive profile;
-- the demo trainee profile with the same name is not exempt).
-- Selected from profiles, so a database without these accounts (a fresh reset) skips them instead of failing.
insert into private.gif_size_exempt (user_id)
select p.id from public.profiles p
where p.id in ('ca22ffa8-ed66-4b0f-8f61-9d3f474cb219', '8d79200c-80f1-43a1-8c4d-b9b3331491dc')
on conflict (user_id) do nothing;

-- 2. Size check ------------------------------------------------------------------------

-- True when a GIF upload is allowed: exempt folder owners any size (the bucket cap still applies),
-- everyone else up to 1 MB. A missing size gives null, which the policy treats as a refusal.
create function private.gif_size_ok(object_name text, object_metadata jsonb)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (object_metadata ->> 'size')::bigint <= 1048576
    or exists (
      select 1 from private.gif_size_exempt x
      where x.user_id::text = (storage.foldername(object_name))[1]
    )
$$;

revoke all on function private.gif_size_ok(text, jsonb) from public, anon;
grant execute on function private.gif_size_ok(text, jsonb) to authenticated;

create policy "avatars: exec gif size cap"
  on storage.objects as restrictive for insert to authenticated
  with check (
    bucket_id <> 'avatars'
    or lower(name) not like '%.gif'
    or private.gif_size_ok(name, metadata)
  );

-- 3. Exempt lookup for the upload form -------------------------------------------------

-- Ids of the executives who keep the 2 MB GIF limit. Signed-in members only; ids are already public
-- through member_details().
create function public.gif_exempt_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select x.user_id from private.gif_size_exempt x where (select auth.uid()) is not null
$$;

revoke all on function public.gif_exempt_ids() from public, anon;
grant execute on function public.gif_exempt_ids() to authenticated;
