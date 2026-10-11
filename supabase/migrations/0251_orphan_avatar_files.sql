-- Deleted accounts' pictures get erased. The privacy policy says a deleted account's picture goes with it, but
-- deleting the auth user only cascades to the profiles row (and its avatar_path): the file stays in the private
-- avatars bucket. Files can't be deleted with SQL (storage.protect_delete refuses; it would also leave the bytes
-- behind), only through the Storage API. So the daily cron route (/api/keepalive) asks this function which files
-- belong to accounts that no longer exist and removes them with the server's secret key.
--
-- Every picture lives in its member's folder, "<user id>/<file>" (storage policies from 0033: members upload to their
-- own folder, executives to anyone's). A file is orphaned when its folder is a user id with no auth.users row. Folders
-- that aren't a user id are never returned, so nothing else that might be kept in this bucket can be swept.
--
-- Only the secret key (service_role) may call it: the names are other people's file paths.

create or replace function public.orphan_avatar_files()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'avatars'
    and (storage.foldername(o.name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and not exists (
      select 1 from auth.users u where u.id::text = (storage.foldername(o.name))[1]
    )
  order by o.name
$$;
revoke all on function public.orphan_avatar_files() from public, anon, authenticated;
grant execute on function public.orphan_avatar_files() to service_role;
