-- Tightens the executive GIF cap (0060) after review.
-- 1. The 1 MB cap now covers every avatar upload, not only names ending in .gif. Without this, an executive could
--    name an animated GIF .webp and skip the check. Pictures are resized to 256 px before upload, so stills are
--    always far under 1 MB and members never hit this.
-- 2. An exempt folder only earns the bigger limit when the uploader is exempt too. Otherwise a capped executive
--    could put a 2 MB GIF into an exempt person's folder.
-- The function keeps its name (policies depend on it). ALTER POLICY and CREATE OR REPLACE only, since the
-- migration tool refuses DROP.

create or replace function private.gif_size_ok(object_name text, object_metadata jsonb)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (object_metadata ->> 'size')::bigint <= 1048576
    or (
      exists (
        select 1 from private.gif_size_exempt x
        where x.user_id::text = (storage.foldername(object_name))[1]
      )
      and exists (
        select 1 from private.gif_size_exempt x
        where x.user_id = (select auth.uid())
      )
    )
$$;

alter policy "avatars: exec gif size cap" on storage.objects
  with check (
    bucket_id <> 'avatars'
    or private.gif_size_ok(name, metadata)
  );
