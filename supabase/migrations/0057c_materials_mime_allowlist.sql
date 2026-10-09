-- The materials bucket only stores types a browser won't run as a page or script. Anything else is uploaded as
-- application/octet-stream by the app (src/lib/materials.ts uploadType). Keep this list in sync with SAFE_TYPES.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  'text/plain', 'text/csv', 'text/markdown',
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/zip', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'video/mp4', 'video/quicktime', 'video/webm',
  'application/octet-stream'
]
where id = 'materials';
