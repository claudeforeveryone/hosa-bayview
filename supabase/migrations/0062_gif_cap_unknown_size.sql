-- Storage checks upload permission before it knows the file's size, so metadata.size can be null at that point.
-- A null size made the cap check null, which refused every avatar upload. Unknown size now passes here; the
-- picture save action reads the real size from storage and refuses (and removes) anything over the cap.
create or replace function private.gif_size_ok(object_name text, object_metadata jsonb)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (object_metadata ->> 'size') is null
    or (object_metadata ->> 'size')::bigint <= 1048576
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
