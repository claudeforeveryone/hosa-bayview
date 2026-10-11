-- Omega security 0203 (audit M7, least privilege). No client path inserts or deletes a profile: signup inserts from
-- the auth trigger (security definer), and deletes go through the auth admin API. RLS already refused both; the
-- table grant is removed as well. Updates stay (guarded by private.guard_profile_update).
revoke insert, delete on public.profiles from authenticated;
