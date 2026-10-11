-- Back to 50 MB per file (the free plan's own cap) so the chapter's staged slide decks and lessons can be uploaded.
-- Reverses 0106's 10 MB bucket limit. The 0064 row check already allows up to 50 MB, so only the bucket changes.
update storage.buckets set file_size_limit = 52428800 where id = 'materials';
