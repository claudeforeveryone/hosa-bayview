-- Wrong-code logs go after a day, every day. The privacy policy says wrong event join codes and wrong sign-up codes
-- are kept for up to two days. Until now each log was trimmed only by the next wrong try (join_classroom 0006,
-- check_chapter_code 0090), so a quiet spell kept the rows indefinitely, and the retired executive passcode log
-- (0014/0068; claim_admin no longer writes it) was never trimmed at all. The rate limits that read these logs look
-- back 10 minutes, so nothing older than a day is needed.
--
-- private.purge_attempt_logs() deletes rows older than a day from all three; the daily keep-alive cron (0084,
-- /api/keepalive) now calls it. Expired chapter-code tickets go too (they're hashes, but nothing reads them).
-- The chapter-code tables come from 0090, which may not be applied yet, so they're looked up by name.

create or replace function private.purge_attempt_logs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.join_attempts where at < now() - interval '1 day';
  delete from private.passcode_attempts where at < now() - interval '1 day';
  if to_regclass('private.chapter_code_attempts') is not null then
    execute 'delete from private.chapter_code_attempts where at < now() - interval ''1 day''';
  end if;
  if to_regclass('private.chapter_code_tickets') is not null then
    execute 'delete from private.chapter_code_tickets where expires_at < now()';
  end if;
end
$$;
revoke all on function private.purge_attempt_logs() from public, anon, authenticated;

-- Same signature and grants as 0084: anon may run it, it takes nothing and returns nothing, and the purges only ever
-- remove rows past their retention. The owner console's 0230 also redefines keepalive (to purge analytics); this
-- version keeps that purge when it exists, so apply 0230 first (number order). Any later redefinition of keepalive
-- must keep calling private.purge_attempt_logs().
create or replace function public.keepalive()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.purge_attempt_logs();
  if to_regprocedure('private.purge_analytics()') is not null then
    execute 'select private.purge_analytics()';
  end if;
  perform 1 from pg_catalog.pg_class limit 1;
end
$$;
revoke all on function public.keepalive() from public, anon, authenticated;
grant execute on function public.keepalive() to anon;
