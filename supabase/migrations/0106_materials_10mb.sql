-- Links first: the free plan's 1 GB is small, so uploaded files are capped at 10 MB (was 50 MB).
-- Only the bucket limit changes here. Existing objects and rows keep their size (the 0064 row check still allows
-- up to 50 MB, so older files can still be edited); the app refuses anything over 10 MB before upload and on save.
update storage.buckets set file_size_limit = 10485760 where id = 'materials';
