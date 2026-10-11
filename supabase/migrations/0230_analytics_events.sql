-- Owner analytics, part 1 (Omega 0230): privacy-conscious usage events for the owner console (/developer).
--
-- The event names follow one taxonomy across the three Omega sites. Most of them are already recorded by a table this
-- site keeps for its own features, so they are read from there and never written twice:
--
--   event                    where the count comes from
--   account_created          profiles.created_at
--   onboarding_completed     none: this site has no onboarding step (every page is open from day one)
--   event_selected           classroom_members.joined_at (joining an event room)
--   practice_started         attempts, mode 'practice', started_at (career quizzes included: they are attempts too)
--   practice_completed       attempts, mode 'practice', submitted_at
--   exam_completed           attempts, mode 'timed', submitted_at
--   vocab_session_completed  match_results (a finished match game) plus analytics_events code 'deck' or 'career'
--                            (a finished flip round, which no table records)
--   resource_opened          analytics_events code 'file' or 'link' (written by /files/[id])
--   duel_started             battles.created_at, once battles (0095) are on the database
--   duel_completed           battles with status 'done'
--   feedback_submitted       feedback.created_at (0231, one row per message sent) plus analytics_events code
--                            'question': one per report sent from Report this question, written by report_question
--                            (0231). question_flags keeps one thread per member per question, so it can't count sends
--   install_prompt_shown     analytics_events code 'android', 'ios' or 'other' (sent by the phone-app layer)
--   app_installed            analytics_events, same codes
--   push_enabled             analytics_events, same codes (sent without a code, it is stored as 'other')
--
-- So analytics_events stores six names. Each row is the name, the time, the member's id (for distinct-people counts
-- only) and one short code from a fixed list. Never question text, answers, free text, IP, user agent or location.
-- Rows older than 13 months are deleted by private.purge_analytics(), which the daily keep-alive runs.
-- The browser writes the five in analytics_code_ok through public.record_event. feedback_submitted 'question' is
-- written only by report_question (0231), after its own checks, so no client can send one. The owner reads
-- aggregates through the 0232 functions only.

create or replace function private.analytics_code_ok(p_name text, p_code text)
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(case p_name
    when 'vocab_session_completed' then p_code in ('deck', 'career')
    when 'resource_opened' then p_code in ('file', 'link')
    when 'install_prompt_shown' then p_code in ('android', 'ios', 'other')
    when 'app_installed' then p_code in ('android', 'ios', 'other')
    when 'push_enabled' then p_code in ('android', 'ios', 'other')
    else false
  end, false)
$$;
revoke all on function private.analytics_code_ok(text, text) from public, anon, authenticated;

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  name text not null,
  code text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  constraint analytics_events_taxonomy check (
    private.analytics_code_ok(name, code) or (name = 'feedback_submitted' and code = 'question')
  )
);
create index if not exists analytics_events_name_at_idx on public.analytics_events (name, occurred_at);
create index if not exists analytics_events_user_at_idx on public.analytics_events (user_id, occurred_at);
-- The 13-month purge (keepalive, below) deletes by age alone; without this it would scan the whole table each call.
create index if not exists analytics_events_at_idx on public.analytics_events (occurred_at);
alter table public.analytics_events enable row level security;
-- No policies and no grants: only the definer functions below and in 0232 touch it.
revoke all on public.analytics_events from public, anon, authenticated;

-- One call per tracked moment. True when stored. False, and nothing stored, for: no session, a banned member, a name
-- or code outside the browser's list (analytics_code_ok, so never feedback_submitted), or more than 120 of these
-- events from this member in the last hour. Never raises for those, so a client can fire and forget. The three
-- phone-app events may come without a code (platform unknown): 'other'.
create or replace function public.record_event(p_name text, p_code text)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ev_code text := case when p_name in ('install_prompt_shown', 'app_installed', 'push_enabled')
    then coalesce(p_code, 'other') else p_code end;
  recent integer;
begin
  if uid is null or private.is_banned() then
    return false;
  end if;
  if not private.analytics_code_ok(p_name, ev_code) then
    return false;
  end if;
  -- One member's calls queue here, so two at once can't both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended('analytics:' || uid::text, 0));
  select count(*) into recent from public.analytics_events e
  where e.user_id = uid and e.occurred_at > now() - interval '1 hour' and e.name <> 'feedback_submitted';
  if recent >= 120 then
    return false;
  end if;
  insert into public.analytics_events (name, code, user_id) values (p_name, ev_code, uid);
  return true;
end
$$;
revoke all on function public.record_event(text, text) from public, anon;
grant execute on function public.record_event(text, text) to authenticated;

-- Deletes events older than 13 months and returns how many went.
create or replace function private.purge_analytics()
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.analytics_events e where e.occurred_at < now() - interval '13 months';
  get diagnostics removed = row_count;
  return removed;
end
$$;
revoke all on function private.purge_analytics() from public, anon, authenticated;

-- The daily Vercel cron (0084) now also purges old analytics. Same signature and grants: anon may run it, it takes
-- nothing and returns nothing, and the purge only ever removes rows past the 13-month retention.
create or replace function public.keepalive()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.purge_analytics();
  perform 1 from pg_catalog.pg_class limit 1;
end
$$;
revoke all on function public.keepalive() from public, anon, authenticated;
grant execute on function public.keepalive() to anon;
