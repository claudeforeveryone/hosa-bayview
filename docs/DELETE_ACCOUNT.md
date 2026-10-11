# Deleting a member's account

The privacy policy (`/privacy`, "Your choices" and "How long we keep it") promises this. Follow it for every request:
a member asking for themselves, a parent or guardian asking for their child, or an account found to belong to someone
under 13. Reply within 30 days.

1. **Check who's asking.** The email comes from the account's own address, or from a parent or guardian of that member.
   Note the account's user id (Supabase > Authentication > Users, search the email).
2. **Things they made, if they asked for those to go too.** While the account still exists, delete them in the app from
   /admin (it lists every classroom, test, deck and file with delete). The app's delete also removes a file's stored
   copy; deleting a `materials` row in SQL leaves the file behind in storage. Otherwise these stay, unnamed.
3. **Delete the account.** Either way, the database cascades the profile, results, battle picks, study time,
   notifications and warnings.
   - In the app (any executive): /admin > the person > Remove account, then type their name. It deletes the auth user
     (`remove_member()`, 0033) and erases their current picture file straight away. It can't remove an executive:
     demote them first.
   - Or in Supabase: Authentication > Users > the user > Delete user. This leaves the picture file (step 4).
4. **The picture, every time.** The policy says that when we delete an account because they asked, we check the
   picture is gone. Open Supabase > Storage > avatars > the folder named after the user id, and delete anything in it.
   Don't skip this after an in-app removal: the app erases only the picture the profile points at, so an upload that
   never got saved to the profile, or an erase that failed, stays (an in-app removal on 2026-10-09 left one). Once the
   daily sweep is on (`HOUSEKEEPING=on` in Vercel Production, with 0250 and 0251 applied), the cron (`/api/keepalive`,
   scheduled 09:00 UTC; Vercel's Hobby plan runs it at some minute in that hour) also erases every file whose folder
   has no account (`orphan_avatar_files()`, 0251), within about 25 hours, so a folder you missed still goes. Next day,
   check the folder is gone.
5. **Tell them it's done.**

## When the daily sweep stops

Only while `HOUSEKEEPING=on` is set. Without it the cron keeps the database awake and does nothing else (204).

The cron answers 500 and logs a line starting `[keepalive] housekeeping failed` (Vercel > the project > Logs) when:

- `avatar sweep: N of F pictures, from M accounts, look orphaned (limit 3 accounts and a quarter of the pictures)`:
  more pictures look orphaned than members delete in a day, so nothing was erased. Usually auth users are missing after
  a restore or a move between projects. Find out why before deleting anything by hand. If it really is several
  deletions at once, delete those folders by hand (step 4) and the next run passes.
- `avatar sweep: SUPABASE_SECRET_KEY is not set`: add the secret key to the production environment variables and
  redeploy.
- `orphan_avatar_files` or `purge_attempt_logs` with `PGRST202`: migration 0251 or 0250 isn't applied.
- `avatar sweep: orphan_avatar_files answered in an unexpected shape`: an older 0251 is applied. Re-apply the current
  `supabase/migrations/0251_orphan_avatar_files.sql`.
