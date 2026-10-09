-- Animated GIFs as profile pictures. Additive: the bucket accepts GIFs too, and the avatar path check
-- accepts a .gif name next to .webp and .jpg. Nothing on main writes avatar paths, so nothing else changes.

update storage.buckets
set allowed_mime_types = array['image/webp', 'image/jpeg', 'image/gif']
where id = 'avatars';

alter table public.profiles drop constraint profiles_avatar_path_shape;
alter table public.profiles add constraint profiles_avatar_path_shape check (
  avatar_path is null
  or (avatar_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|gif)$'
      and split_part(avatar_path, '/', 1) = id::text)
);
