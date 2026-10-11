# Moving HOSA Bayview's Supabase to the other account

## Outcome (2026-10-10): done by project transfer

- `vxlaswushshckxoblkyb` was moved with the dashboard's Transfer project from org "chess" to "claudemaxforeveryone-hue's Org" (Free). Same ref, URL and keys, so Vercel env vars were not touched and the copy plan below was not needed.
- To fit the Free plan's 2-active-project limit, the empty spare project `obhdrhdywsogglzyguah` was paused. It is unused and can be deleted.
- Checked after: 6 auth users, all with password hashes; profiles 6, questions 55, activity_minutes 196, events 33, avatars 3 objects, 2 buckets, 83 migrations; auth health 200; /login 200.
- Still to do: reset the database password (it was shared in a chat once). The app uses API keys, not this password.

The plan below is kept for reference.

Started 2026-10-10. The site keeps running on the old project the whole time; the switch is one env var change plus a redeploy at the end.

## Source (read-only audit, 2026-10-10)

- Project `vxlaswushshckxoblkyb`, org "chess", ca-central-1, Postgres 17.
- Schemas to move: `public` and `private` (admin passcode hash, `first_executive_email` setting), plus `auth` users and identities.
- `public`: 31 tables (all RLS on, 7 with no policies), 62 functions (57 SECURITY DEFINER), 70 policies, 37 triggers, enum `app_role`, no views.
- Extensions: plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault. No pg_cron, no edge functions.
- Realtime publication: empty (battles' 0097 not applied yet).
- Auth: 6 users, email provider only, "Confirm email" off.
- Storage: `avatars` (private, 2 MB limit, 3 objects) and `materials` (private, 10 MB limit from 0106, type allowlist from 0057c, empty).
- Migrations: 82 applied. Local files not applied at audit time: 0049, 0057c, 0083, 0085, 0090, 0095-0098 (battles). 0073 is deferred on purpose. 0084 (keepalive) was applied 2026-10-10 after the audit. 0085 rewrites `save_question` from its 0013 base, so diff it against the live definition before applying. Re-check with `list_migrations` before relying on this list; other sessions apply migrations too.

## Deploy side

- Vercel project `hosa-bayview` on josephislockedin@gmail.com (Hobby), https://hosa-bayview.vercel.app, daily cron `/api/keepalive` 09:00 UTC.
- Env vars that change: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. Unchanged: `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`.

## Steps (each ends when its check passes)

1. **Target.** Joseph names the account/org and logs that session in (Supabase CLI `supabase login`, or the Supabase MCP on that account). Check: you can list projects in the target org.
2. **Project.** Create it in ca-central-1, Postgres 17. Check: ACTIVE_HEALTHY.
3. **Schema.** `pg_dump --schema-only -n public -n private` from the source (session pooler URL, password from Joseph), restore into the target. Then agree with Joseph which unapplied migrations to apply. Check: table, function, policy and trigger counts match the source (plus agreed extras).
4. **Data.** `pg_dump --data-only` for `public` and `private`, and `auth.users` + `auth.identities` so password hashes survive. Restore auth first (profiles reference it), with triggers disabled during the load so sign-up triggers don't double-insert. Check: row counts match table by table; the 6 users can log in with their existing passwords.
5. **Storage.** Recreate both buckets with the same limits and MIME allowlist, copy the `avatars` objects (same paths). Check: object counts match.
6. **Auth settings.** Site URL https://hosa-bayview.vercel.app, redirect `https://hosa-bayview.vercel.app/**`, Confirm email off, leaked-password protection on. Check: password reset email links back to the site.
7. **Tests.** Run every `supabase/tests/*.sql` against the target with `execute_sql`. Check: all pass.
8. **Switch.** Show Joseph the exact env var changes; on his OK, update them for all environments in Vercel and redeploy. Check: live site logs in, data shows, `/api/keepalive` returns 200.
9. **Leave the old project alone** until Joseph says to pause it.

## Rules

- Read and dump the source freely. Ask Joseph before anything that writes to the source project, deletes anything, or changes Vercel.
- Never print keys, passwords or connection strings; write `<REDACTED>`.
- This repo is public: nothing from a dump (emails, hashes, keys) gets committed.
