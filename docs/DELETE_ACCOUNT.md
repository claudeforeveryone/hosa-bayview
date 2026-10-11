# Deleting a member's account

The privacy policy (`/privacy`, "Your choices" and "How long we keep it") promises this. Follow it for every request:
a member asking for themselves, a parent or guardian asking for their child, or an account found to belong to someone
under 13. Reply within 30 days.

1. **Check who's asking.** The email comes from the account's own address, or from a parent or guardian of that member.
   Note the account's user id (Supabase > Authentication > Users, search the email).
2. **Things they made, if they asked for those to go too.** While the account still exists, delete them in the app from
   /admin (it lists every classroom, test, deck and file with delete). The app's delete also removes a file's stored
   copy; deleting a `materials` row in SQL leaves the file behind in storage. Otherwise these stay, unnamed.
3. **Delete the auth user.** Supabase > Authentication > Users > the user > Delete user. The database cascades the
   profile, results, battle picks, study time, notifications and warnings.
4. **The picture.** The profile row goes, but the file in the `avatars` bucket (folder = the user id) does not. The daily
   cron (`/api/keepalive`, 09:00 UTC) erases every file whose folder has no account (`orphan_avatar_files()`, 0251),
   so it's gone within a day. To do it now: Supabase > Storage > avatars > the folder named after the user id > delete.
   Next day, check the folder is gone.
5. **Tell them it's done.**

## When the daily sweep stops

The cron answers 500 and logs a line starting `[keepalive] housekeeping failed` (Vercel > the project > Logs) when:

- `avatar sweep: N orphaned files at once (limit 20)`: more pictures look orphaned than a small chapter deletes in a
  day, so nothing was erased. Usually auth users are missing after a restore or a move between projects. Find out why
  before deleting anything by hand.
- `avatar sweep: SUPABASE_SECRET_KEY is not set`: add the secret key to the production environment variables and
  redeploy.
- `orphan_avatar_files` or `purge_attempt_logs` with `PGRST202`: migration 0251 or 0250 isn't applied.
