-- Owner console (Omega 0232): everything /developer reads or writes, besides the per-member table (0105).
-- Every function starts with private.require_stats_viewer(): only accounts in private.stats_viewers (the site owner,
-- 0105, granted by uid in the SQL editor) get an answer; everyone else gets 42501. The page hides its link from
-- everyone else, but this check is the guard.
--
-- Small counts: an aggregate about people (members, active members, runs, sessions, people per event) of 1 to 4
-- comes back null, and the page says "Under 5". Zero stays zero. Where two figures add up to a third the page also
-- shows, both halves hide together, so a hidden one can't be worked out by subtraction. Content counts (questions,
-- tests, reports per question) are about the material, not about people, and come back exact. Feedback and the audit
-- log are individual records for triage and are not suppressed.
--
-- Ranges: 7d, 30d, 90d or all, in Toronto days (today counts as day one).

create or replace function private.require_stats_viewer()
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.can_view_stats((select auth.uid())) then
    raise exception 'Only the site owner can see this' using errcode = '42501';
  end if;
end
$$;
revoke all on function private.require_stats_viewer() from public, anon, authenticated;

-- The one place the threshold lives.
create or replace function private.small_cell(n bigint)
returns bigint
language sql immutable set search_path = ''
as $$
  select case when n between 1 and 4 then null else n end
$$;
revoke all on function private.small_cell(bigint) from public, anon, authenticated;

-- Both parts of a whole hide together when either is small.
create or replace function private.small_pair(a bigint, b bigint)
returns bigint[]
language sql immutable set search_path = ''
as $$
  select case when a between 1 and 4 or b between 1 and 4 then array[null, null]::bigint[] else array[a, b] end
$$;
revoke all on function private.small_pair(bigint, bigint) from public, anon, authenticated;

-- First Toronto day a range covers.
create or replace function private.owner_first_day(p_range text)
returns date
language plpgsql stable set search_path = ''
as $$
declare
  today date := private.local_day(now());
begin
  case p_range
    when '7d' then return today - 6;
    when '30d' then return today - 29;
    when '90d' then return today - 89;
    when 'all' then
      return coalesce((select min(private.local_day(p.created_at)) from public.profiles p), today);
    else raise exception 'Range must be 7d, 30d, 90d or all' using errcode = '22023';
  end case;
end
$$;
revoke all on function private.owner_first_day(text) from public, anon, authenticated;

-- The instant a Toronto day starts.
create or replace function private.toronto_start(d date)
returns timestamptz
language sql stable set search_path = ''
as $$
  select d::timestamp at time zone 'America/Toronto'
$$;
revoke all on function private.toronto_start(date) from public, anon, authenticated;

-- Overview --------------------------------------------------------------------------------------------------------
-- Members and new members (profiles), active members today, over 7 and over 30 days (sign_in_days: one row per member
-- per Toronto day they had the site open, written by the heartbeat), the 7 days before for comparison, and how this
-- week's active members split into returning (active on an earlier day) and first-week.
create or replace function public.owner_overview()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  today date := private.local_day(now());
  ret bigint;
  fresh bigint;
  pair bigint[];
begin
  perform private.require_stats_viewer();
  select count(*) filter (where f.first_day < today - 6), count(*) filter (where f.first_day >= today - 6)
    into ret, fresh
  from (
    select s.user_id, min(s.day) as first_day
    from public.sign_in_days s
    group by s.user_id
    having max(s.day) >= today - 6
  ) f;
  pair := private.small_pair(ret, fresh);
  return jsonb_build_object(
    'today', today,
    'members', (select private.small_cell(count(*)) from public.profiles),
    'new_7d', (select private.small_cell(count(*)) from public.profiles p
      where private.local_day(p.created_at) >= today - 6),
    'new_30d', (select private.small_cell(count(*)) from public.profiles p
      where private.local_day(p.created_at) >= today - 29),
    'dau', (select private.small_cell(count(*)) from public.sign_in_days s where s.day = today),
    'wau', (select private.small_cell(count(distinct s.user_id)) from public.sign_in_days s where s.day >= today - 6),
    'wau_prev', (select private.small_cell(count(distinct s.user_id)) from public.sign_in_days s
      where s.day between today - 13 and today - 7),
    'mau', (select private.small_cell(count(distinct s.user_id)) from public.sign_in_days s where s.day >= today - 29),
    'returning_7d', pair[1],
    'first_week_7d', pair[2]
  );
end
$$;
revoke all on function public.owner_overview() from public, anon;
grant execute on function public.owner_overview() to authenticated;

-- Growth ----------------------------------------------------------------------------------------------------------
-- One bucket per day (7d, 30d) or per Monday-to-Sunday week (90d, all; the last one stops today): new members and
-- active members. No running total per bucket: two running totals side by side would give away a hidden new count.
-- New members per bucket add up to new_total (and to the overview's 7 and 30 day figures), so hiding one small
-- bucket alone would leave it as a subtraction. If any bucket has 1 to 4, the whole new series is withheld for that
-- range (new_by_bucket false, every 'new' null); the totals stay. Active members per bucket don't add up to anything
-- shown (people are active on many days), so those are hidden one by one.
create or replace function public.owner_growth(p_range text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  today date := private.local_day(now());
  first_day date;
  start_day date;
  step integer;
  out jsonb;
begin
  perform private.require_stats_viewer();
  first_day := private.owner_first_day(p_range);
  if p_range in ('7d', '30d') then
    start_day := first_day;
    step := 1;
  else
    start_day := date_trunc('week', first_day::timestamp)::date;
    step := 7;
  end if;

  select jsonb_build_object(
    'step', case step when 1 then 'day' else 'week' end,
    'from', first_day,
    'to', today,
    'new_total', (select private.small_cell(count(*)) from public.profiles p
      where private.local_day(p.created_at) between first_day and today),
    'active_total', (select private.small_cell(count(distinct s.user_id)) from public.sign_in_days s
      where s.day between first_day and today),
    'new_by_bucket', not coalesce(bool_or(b.signups between 1 and 4), false),
    'buckets', coalesce(jsonb_agg(jsonb_build_object(
        'start', b.b_start,
        'end', b.b_end,
        'new', case when b.any_small then null else b.signups end,
        'active', private.small_cell(b.active)
      ) order by b.b_start), '[]'::jsonb)
  ) into out
  from (
    select s.*, bool_or(s.signups between 1 and 4) over () as any_small
    from (
    select g.b_start, g.b_end,
      (select count(*) from public.profiles p
        where private.local_day(p.created_at) between greatest(g.b_start, first_day) and g.b_end) as signups,
      (select count(distinct s.user_id) from public.sign_in_days s
        where s.day between greatest(g.b_start, first_day) and g.b_end) as active
    from (
      select d::date as b_start, least(d::date + (step - 1), today) as b_end
      from generate_series(start_day::timestamp, today::timestamp, make_interval(days => step)) d
    ) g
    ) s
  ) b;
  return out;
end
$$;
revoke all on function public.owner_growth(text) from public, anon;
grant execute on function public.owner_growth(text) to authenticated;

-- Engagement ------------------------------------------------------------------------------------------------------
-- Battles (0095) may not be on a database yet. Then the duel rows say unavailable instead of showing a zero.
create or replace function private.owner_duels(since_at timestamptz)
returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  started bigint;
  done bigint;
  people bigint;
begin
  if to_regclass('public.battles') is null or to_regclass('public.battle_players') is null then
    return jsonb_build_object('available', false);
  end if;
  execute 'select count(*), count(*) filter (where b.status = ''done'') from public.battles b where b.created_at >= $1'
    into started, done using since_at;
  execute 'select count(distinct bp.user_id) from public.battle_players bp join public.battles b on b.id = bp.battle_id
           where b.created_at >= $1'
    into people using since_at;
  return jsonb_build_object(
    'available', true,
    'started', private.small_cell(started),
    'completed', private.small_cell(done),
    'people', private.small_cell(people)
  );
end
$$;
revoke all on function private.owner_duels(timestamptz) from public, anon, authenticated;

-- One row per taxonomy event (0230), counted from its source, plus flashcard reviews. 'tracked_since' is set only for
-- rows that come from analytics_events: null there means the site has never recorded one, so the page says "not
-- tracked yet" instead of a zero. Then practice and exam funnels, and the busiest events by runs started.
create or replace function public.owner_engagement(p_range text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  since_at timestamptz;
  duels jsonb;
  out jsonb;
begin
  perform private.require_stats_viewer();
  since_at := private.toronto_start(private.owner_first_day(p_range));
  duels := private.owner_duels(since_at);

  with tracked as (
    select e.name, e.code, e.user_id, e.occurred_at from public.analytics_events e where e.occurred_at >= since_at
  ),
  firsts as (
    select e.name, min(e.occurred_at) as since from public.analytics_events e group by e.name
  ),
  practice as (
    select count(*) as started, count(*) filter (where a.submitted_at is not null) as completed,
      count(distinct a.user_id) as people,
      count(distinct a.user_id) filter (where a.submitted_at is not null) as completed_people
    from public.attempts a where a.mode = 'practice' and a.started_at >= since_at
  ),
  exams as (
    select count(*) as started, count(*) filter (where a.submitted_at is not null) as completed,
      count(distinct a.user_id) as people,
      count(distinct a.user_id) filter (where a.submitted_at is not null) as completed_people
    from public.attempts a where a.mode = 'timed' and a.started_at >= since_at
  ),
  feat as (
    select 'account_created' as id, 'account_created' as event, 'table' as source,
      (select count(*) from public.profiles p where p.created_at >= since_at) as n,
      (select count(*) from public.profiles p where p.created_at >= since_at) as people,
      null::timestamptz as since, 1 as ord
    union all
    select 'event_selected', 'event_selected', 'table',
      (select count(*) from public.classroom_members cm join public.classrooms c on c.id = cm.classroom_id
        where c.kind = 'class' and cm.joined_at >= since_at),
      (select count(distinct cm.user_id) from public.classroom_members cm join public.classrooms c on c.id = cm.classroom_id
        where c.kind = 'class' and cm.joined_at >= since_at),
      null, 2
    union all
    select 'practice_started', 'practice_started', 'table', (select started from practice), (select people from practice), null, 3
    union all
    select 'practice_completed', 'practice_completed', 'table',
      (select completed from practice), (select completed_people from practice), null, 4
    union all
    select 'exam_completed', 'exam_completed', 'table',
      (select completed from exams), (select completed_people from exams), null, 5
    union all
    select 'vocab_round', 'vocab_session_completed', 'tracked',
      (select count(*) from tracked t where t.name = 'vocab_session_completed'),
      (select count(distinct t.user_id) from tracked t where t.name = 'vocab_session_completed'),
      (select f.since from firsts f where f.name = 'vocab_session_completed'), 6
    union all
    select 'vocab_match', 'vocab_session_completed', 'table',
      (select count(*) from public.match_results m where m.created_at >= since_at),
      (select count(distinct m.user_id) from public.match_results m where m.created_at >= since_at),
      null, 7
    union all
    select 'card_reviews', null, 'table',
      (select count(*) from public.card_reviews r where r.reviewed_at >= since_at),
      (select count(distinct r.user_id) from public.card_reviews r where r.reviewed_at >= since_at),
      null, 8
    union all
    select 'resource_opened', 'resource_opened', 'tracked',
      (select count(*) from tracked t where t.name = 'resource_opened'),
      (select count(distinct t.user_id) from tracked t where t.name = 'resource_opened'),
      (select f.since from firsts f where f.name = 'resource_opened'), 9
    union all
    select 'feedback_submitted', 'feedback_submitted', 'table',
      (select count(*) from public.feedback fb where fb.created_at >= since_at),
      (select count(distinct fb.user_id) from public.feedback fb where fb.created_at >= since_at),
      null, 10
    union all
    select 'question_reported', 'feedback_submitted', 'table',
      (select count(*) from public.question_flags qf where qf.reason <> 'ask' and qf.created_at >= since_at),
      (select count(distinct qf.user_id) from public.question_flags qf where qf.reason <> 'ask' and qf.created_at >= since_at),
      null, 11
    union all
    select 'install_prompt_shown', 'install_prompt_shown', 'tracked',
      (select count(*) from tracked t where t.name = 'install_prompt_shown'),
      (select count(distinct t.user_id) from tracked t where t.name = 'install_prompt_shown'),
      (select f.since from firsts f where f.name = 'install_prompt_shown'), 12
    union all
    select 'app_installed', 'app_installed', 'tracked',
      (select count(*) from tracked t where t.name = 'app_installed'),
      (select count(distinct t.user_id) from tracked t where t.name = 'app_installed'),
      (select f.since from firsts f where f.name = 'app_installed'), 13
    union all
    select 'push_enabled', 'push_enabled', 'tracked',
      (select count(*) from tracked t where t.name = 'push_enabled'),
      (select count(distinct t.user_id) from tracked t where t.name = 'push_enabled'),
      (select f.since from firsts f where f.name = 'push_enabled'), 14
  )
  select jsonb_build_object(
    'from', private.owner_first_day(p_range),
    'practice', (select jsonb_build_object(
        'started', private.small_cell(p.started), 'completed', private.small_cell(p.completed),
        'people', private.small_cell(p.people)) from practice p),
    'exams', (select jsonb_build_object(
        'started', private.small_cell(x.started), 'completed', private.small_cell(x.completed),
        'people', private.small_cell(x.people)) from exams x),
    'duels', duels,
    'features', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'event', r.event, 'source', r.source,
        'count', private.small_cell(r.n), 'people', private.small_cell(r.people),
        'tracked_since', r.since
      ) order by r.ord), '[]'::jsonb) from feat r),
    'events', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', e.name, 'event', e.event,
        'runs', private.small_cell(e.runs), 'people', private.small_cell(e.people)
      ) order by e.runs desc, e.name), '[]'::jsonb)
      from (
        select c.name, c.event, count(a.id) as runs, count(distinct a.user_id) as people
        from public.attempts a
        join public.tests t on t.id = a.test_id
        join public.classrooms c on c.id = t.classroom_id
        where a.started_at >= since_at and c.kind = 'class'
        group by c.id, c.name, c.event
        order by count(a.id) desc, c.name
        limit 10
      ) e)
  ) into out;
  return out;
end
$$;
revoke all on function public.owner_engagement(text) from public, anon;
grant execute on function public.owner_engagement(text) to authenticated;

-- Content health --------------------------------------------------------------------------------------------------
-- Totals, then per event room: tests, questions, questions with no explanation, extra copies of a stem already in
-- that room (the same question pasted into more than one test), open reports. The open reports themselves
-- (question_flags with a reason other than 'ask', grouped by question, with a link target), and the stems with the
-- most copies (case, spacing and end punctuation ignored).
create or replace function public.owner_content()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  out jsonb;
begin
  perform private.require_stats_viewer();
  with q as (
    select qu.id, qu.test_id, t.classroom_id, t.is_published,
      coalesce(btrim(k.explanation), '') = '' as no_expl,
      lower(regexp_replace(regexp_replace(btrim(qu.prompt), '\s+', ' ', 'g'), '[[:space:][:punct:]]+$', '')) as stem
    from public.questions qu
    join public.tests t on t.id = qu.test_id
    left join public.question_keys k on k.question_id = qu.id
  ),
  reports as (
    select f.* from public.question_flags f where f.status = 'open' and f.reason <> 'ask'
  )
  select jsonb_build_object(
    'questions', (select count(*) from q),
    'tests', (select count(*) from public.tests),
    'published_tests', (select count(*) from public.tests t where t.is_published),
    'missing_explanations', (select count(*) from q where q.no_expl),
    'open_reports', (select count(*) from reports),
    'open_asks', (select count(*) from public.question_flags f where f.status = 'open' and f.reason = 'ask'),
    'per_event', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'name', x.name, 'event', x.event, 'kind', x.kind,
        'tests', x.tests, 'questions', x.questions, 'missing_explanations', x.missing, 'repeated', x.repeated,
        'open_reports', x.reports
      ) order by x.questions desc, x.name), '[]'::jsonb)
      from (
        select c.id, c.name, c.event, c.kind,
          (select count(*) from public.tests t where t.classroom_id = c.id) as tests,
          (select count(*) from q where q.classroom_id = c.id) as questions,
          (select count(*) from q where q.classroom_id = c.id and q.no_expl) as missing,
          (select count(*) - count(distinct q.stem) from q where q.classroom_id = c.id and q.stem <> '') as repeated,
          (select count(*) from reports r join public.tests t on t.id = r.test_id where t.classroom_id = c.id) as reports
        from public.classrooms c
      ) x),
    'reported', (select coalesce(jsonb_agg(jsonb_build_object(
        'question_id', r.question_id, 'test_id', r.test_id, 'classroom_id', r.classroom_id,
        'test_title', r.test_title, 'room', r.room, 'pos', r.pos, 'prompt', r.prompt,
        'reasons', r.reasons, 'reports', r.reports, 'last_at', r.last_at
      ) order by r.reports desc, r.last_at desc), '[]'::jsonb)
      from (
        select f.question_id, f.test_id, t.classroom_id, t.title as test_title, c.name as room, qu.position as pos,
          left(qu.prompt, 240) as prompt,
          array_agg(distinct f.reason order by f.reason) as reasons,
          count(*) as reports, max(f.updated_at) as last_at
        from reports f
        join public.questions qu on qu.id = f.question_id
        join public.tests t on t.id = f.test_id
        join public.classrooms c on c.id = t.classroom_id
        group by f.question_id, f.test_id, t.classroom_id, t.title, c.name, qu.position, qu.prompt
        order by count(*) desc, max(f.updated_at) desc
        limit 25
      ) r),
    'duplicates', (select coalesce(jsonb_agg(jsonb_build_object(
        'stem', d.stem, 'copies', d.copies, 'tests', d.tests, 'rooms', d.rooms
      ) order by d.copies desc, d.stem), '[]'::jsonb)
      from (
        select left(g.stem, 240) as stem, g.copies, g.tests,
          (select coalesce(array_agg(c.name order by c.name), '{}') from public.classrooms c
            where c.id = any (g.room_ids)) as rooms
        from (
          select q.stem, count(*) as copies, count(distinct q.test_id) as tests,
            array_agg(distinct q.classroom_id) as room_ids
          from q
          where q.stem <> ''
          group by q.stem
          having count(*) > 1
          order by count(*) desc, q.stem
          limit 20
        ) g
      ) d),
    'duplicate_groups', (select count(*) from (select 1 from q where q.stem <> '' group by q.stem having count(*) > 1) g)
  ) into out;
  return out;
end
$$;
revoke all on function public.owner_content() from public, anon;
grant execute on function public.owner_content() to authenticated;

-- Feedback queue --------------------------------------------------------------------------------------------------
-- p_status: open (new or planned), all, or one status. Newest first. Also the count per status for the filter row.
create or replace function public.owner_feedback(p_status text, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  out jsonb;
begin
  perform private.require_stats_viewer();
  if p_status is null or p_status not in ('open', 'all', 'new', 'planned', 'done', 'wont_fix') then
    raise exception 'Unknown status filter' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'counts', (select jsonb_build_object(
        'new', count(*) filter (where f.status = 'new'),
        'planned', count(*) filter (where f.status = 'planned'),
        'done', count(*) filter (where f.status = 'done'),
        'wont_fix', count(*) filter (where f.status = 'wont_fix'))
      from public.feedback f),
    'rows', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
      from (
        select f.id, f.category, f.body, f.build, f.status, f.priority, f.resolution,
          f.created_at, f.updated_at, f.triaged_at,
          coalesce(nullif(p.full_name, ''), 'A member') as sent_by
        from public.feedback f
        left join public.profiles p on p.id = f.user_id
        where p_status = 'all'
          or (p_status = 'open' and f.status in ('new', 'planned'))
          or f.status = p_status
        order by f.created_at desc
        limit least(greatest(coalesce(p_limit, 50), 1), 100)
        offset greatest(coalesce(p_offset, 0), 0)
      ) x)
  ) into out;
  return out;
end
$$;
revoke all on function public.owner_feedback(text, integer, integer) from public, anon;
grant execute on function public.owner_feedback(text, integer, integer) to authenticated;

-- Triage: status, priority and a resolution note (owner only; the member never sees it). Writes one admin_log row
-- with the change and no feedback text.
create or replace function public.owner_triage_feedback(p_id uuid, p_status text, p_priority text, p_resolution text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  who text;
  clean text := btrim(coalesce(p_resolution, ''));
  before_row public.feedback%rowtype;
  changes text[] := '{}';
begin
  perform private.require_stats_viewer();
  if p_status is null or p_status not in ('new', 'planned', 'done', 'wont_fix') then
    raise exception 'Pick a status from the list' using errcode = '22023';
  end if;
  if p_priority is null or p_priority not in ('low', 'normal', 'high') then
    raise exception 'Pick a priority from the list' using errcode = '22023';
  end if;
  if char_length(clean) > 1000 then
    raise exception 'Keep the note under 1000 characters' using errcode = '22023';
  end if;
  select * into before_row from public.feedback f where f.id = p_id for update;
  if not found then
    raise exception 'That feedback is gone' using errcode = 'P0002';
  end if;
  if before_row.status <> p_status then
    changes := changes || ('status ' || before_row.status || ' to ' || p_status);
  end if;
  if before_row.priority <> p_priority then
    changes := changes || ('priority ' || before_row.priority || ' to ' || p_priority);
  end if;
  if before_row.resolution <> clean then
    changes := changes || 'note edited'::text;
  end if;
  if cardinality(changes) = 0 then
    return;
  end if;
  update public.feedback f
    set status = p_status, priority = p_priority, resolution = clean,
        updated_at = now(), triaged_at = now(), triaged_by = uid
    where f.id = p_id;
  select coalesce(nullif(p.full_name, ''), 'Site owner') into who from public.profiles p where p.id = uid;
  insert into public.admin_log (actor_id, actor_name, action, target_id, target_name, detail)
  values (uid, coalesce(who, 'Site owner'), 'feedback', null,
          'feedback #' || left(p_id::text, 8), array_to_string(changes, ', '));
end
$$;
revoke all on function public.owner_triage_feedback(uuid, text, text, text) from public, anon;
grant execute on function public.owner_triage_feedback(uuid, text, text, text) to authenticated;

-- Audit -----------------------------------------------------------------------------------------------------------
-- admin_log (0052) searched by who, what, target and detail, case-insensitive. Empty search lists everything.
create or replace function public.owner_audit(p_q text default '', p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  q text := left(btrim(coalesce(p_q, '')), 120);
  needle text;
  out jsonb;
begin
  perform private.require_stats_viewer();
  needle := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb) into out
  from (
    select l.id, l.created_at, l.actor_name, l.action, l.target_name, l.detail
    from public.admin_log l
    where q = ''
      or l.action ilike needle or l.actor_name ilike needle or l.target_name ilike needle or l.detail ilike needle
    order by l.created_at desc, l.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  return out;
end
$$;
revoke all on function public.owner_audit(text, integer, integer) from public, anon;
grant execute on function public.owner_audit(text, integer, integer) to authenticated;

-- System health ---------------------------------------------------------------------------------------------------
-- The database's clock (the page times the round trip), which optional features are on this database, the newest
-- applied migrations, and how much analytics is stored. No secrets, settings or connection details.
create or replace function public.owner_system()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  ledger jsonb := null;
begin
  perform private.require_stats_viewer();
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    begin
      execute 'select jsonb_build_object(''count'', (select count(*) from supabase_migrations.schema_migrations),
                 ''latest'', (select coalesce(jsonb_agg(m.name order by m.version desc), ''[]''::jsonb)
                   from (select version, name from supabase_migrations.schema_migrations order by version desc limit 5) m))'
        into ledger;
    exception when others then
      ledger := null;
    end;
  end if;
  return jsonb_build_object(
    'db_time', now(),
    'features', jsonb_build_object(
      'battles', to_regclass('public.battles') is not null,
      'chapter_code', to_regprocedure('public.check_chapter_code(text,text)') is not null,
      'push', to_regclass('public.push_subscriptions') is not null,
      'analytics', to_regclass('public.analytics_events') is not null,
      'feedback', to_regclass('public.feedback') is not null
    ),
    'migrations', ledger,
    'analytics', (select jsonb_build_object('rows', count(*), 'oldest', min(e.occurred_at)) from public.analytics_events e)
  );
end
$$;
revoke all on function public.owner_system() from public, anon;
grant execute on function public.owner_system() to authenticated;
