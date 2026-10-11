-- Wrong-code logs go after a day, every day. The privacy policy says wrong event join codes and wrong sign-up codes
-- are kept for up to two days. Until now each log was trimmed only by the next wrong try (join_classroom 0006,
-- check_chapter_code 0090), so a quiet spell kept the rows indefinitely, and the retired executive passcode log
-- (0014/0068; claim_admin no longer writes it) was never trimmed at all. The rate limits that read these logs look
-- back 10 minutes, so nothing older than a day is needed.
--
-- public.purge_attempt_logs() deletes rows older than a day from all three, plus expired chapter-code tickets (they're
-- hashes, but nothing reads them). The daily cron route (/api/keepalive) calls it as its own RPC right after
-- keepalive(), so this migration doesn't redefine keepalive() and can't be undone by another migration that does.
-- The chapter-code tables come from 0090, which may not be applied yet, so they're looked up by name.
--
-- Same grants as keepalive() (0084): anon may run it, because the cron route uses the publishable key. It takes
-- nothing, returns nothing, and only ever removes rows that are past their retention.

create or replace function public.purge_attempt_logs()
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
revoke all on function public.purge_attempt_logs() from public, anon, authenticated;
grant execute on function public.purge_attempt_logs() to anon;
