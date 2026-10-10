-- Task 18: battles. Live head-to-head and team quiz rounds on an event's own questions.
-- Tables only here; every write goes through the RPCs in 0096, the realtime wiring is 0097.
-- Rules: the server owns the clock (round start, answer time, round close); the answer key is read only after
-- a round closes; battles never write elo_events (wins are a plain count on the profile).

-- Battles ------------------------------------------------------------------------------------------------------

create table public.battles (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  -- 4 characters, same alphabet as join codes (no 0/O/1/I/L). Unique among live battles only (index below).
  code text not null check (code ~ '^[A-HJKMNP-Z2-9]{4}$'),
  host_id uuid references public.profiles (id) on delete set null,
  format text not null check (format in ('1v1', '2v2', '3v3', 'teams')),
  -- Null means "all questions in this event" (published tests only).
  source_test_id uuid references public.tests (id) on delete set null,
  question_count smallint not null check (question_count between 1 and 30),
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'done')),
  current_round smallint not null default 0,
  winner smallint check (winner in (1, 2)),
  rematch_id uuid references public.battles (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  -- Last time anything happened. A live battle untouched for 30 minutes counts as abandoned.
  touched_at timestamptz not null default now()
);
create unique index battles_live_code_idx on public.battles (code) where status <> 'done';
create index battles_classroom_idx on public.battles (classroom_id, status);
create index battles_host_idx on public.battles (host_id);
create index battles_rematch_idx on public.battles (rematch_id);
create index battles_source_idx on public.battles (source_test_id);
alter table public.battles enable row level security;

create table public.battle_players (
  battle_id uuid not null references public.battles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team smallint not null check (team in (1, 2)),
  joined_at timestamptz not null default now(),
  -- Set when a player leaves; cleared when they rejoin. Left players don't hold up a round.
  left_at timestamptz,
  won boolean not null default false,
  primary key (battle_id, user_id)
);
create index battle_players_user_idx on public.battle_players (user_id);
alter table public.battle_players enable row level security;

-- One row per question in the battle, written at start. A round is visible once it has started.
-- No key column here: this table is on the realtime publication.
create table public.battle_rounds (
  battle_id uuid not null references public.battles (id) on delete cascade,
  round_no smallint not null check (round_no between 1 and 30),
  question_id uuid references public.questions (id) on delete set null,
  started_at timestamptz,
  ends_at timestamptz,
  closed_at timestamptz,
  primary key (battle_id, round_no)
);
create index battle_rounds_question_idx on public.battle_rounds (question_id);
alter table public.battle_rounds enable row level security;

-- Picks. answered_at is the server's clock. Graded (is_correct, points) only when the round closes.
-- Never readable straight off the table; battle_state shows picks and points after the close.
create table public.battle_answers (
  battle_id uuid not null,
  round_no smallint not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  choice smallint not null check (choice between 0 and 4),
  answered_at timestamptz not null default now(),
  is_correct boolean,
  points integer not null default 0 check (points between 0 and 150),
  primary key (battle_id, round_no, user_id),
  foreign key (battle_id, round_no) references public.battle_rounds (battle_id, round_no) on delete cascade
);
create index battle_answers_user_idx on public.battle_answers (user_id);
alter table public.battle_answers enable row level security;

-- Helpers ------------------------------------------------------------------------------------------------------

-- Battles run in event classrooms (kind 'class') that have a multiple-choice or practical section.
create function private.battle_room_ok(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.classrooms c
    where c.id = cid and c.kind = 'class' and c.category in ('mc', 'practical')
  )
$$;

-- Who may see a battle: anyone who can view its classroom (members, its trainer, executives), never banned.
-- can_view_classroom carries the ban check (0066).
create function private.can_see_battle(bid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select private.can_view_classroom(b.classroom_id) and private.battle_room_ok(b.classroom_id)
    from public.battles b where b.id = bid
  ), false)
$$;

-- A test whose questions may be played: published, answers shown after a run, and not a capped timed test
-- (those keep keys hidden until the timed runs are used up, 0048). Battles reveal the key after each round,
-- so anything that hides keys is left out.
create function private.battle_test_ok(tid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tests t
    where t.id = tid and t.is_published and t.show_answers
      and not (t.time_limit_minutes is not null and t.attempts_allowed is not null)
      and private.battle_room_ok(t.classroom_id)
  )
$$;

revoke all on function private.battle_room_ok(uuid), private.can_see_battle(uuid), private.battle_test_ok(uuid)
  from public, anon;
grant execute on function private.battle_room_ok(uuid), private.can_see_battle(uuid), private.battle_test_ok(uuid)
  to authenticated;

-- Privileges and policies ----------------------------------------------------------------------------------------

revoke all on public.battles, public.battle_players, public.battle_rounds, public.battle_answers from anon, authenticated;
grant select on public.battles, public.battle_players, public.battle_rounds to authenticated;

create policy "battles: room viewers read"
  on public.battles for select to authenticated
  using ((select private.can_see_battle(id)));

create policy "battle_players: room viewers read"
  on public.battle_players for select to authenticated
  using ((select private.can_see_battle(battle_id)));

-- Rounds that haven't started stay hidden, so nobody reads the question list ahead.
create policy "battle_rounds: started, room viewers read"
  on public.battle_rounds for select to authenticated
  using (started_at is not null and (select private.can_see_battle(battle_id)));

-- battle_answers: RLS on, no policy and no grant. Only the security-definer RPCs read it.

-- Same write guard as every other content table (writes come only from RPCs, which check first).
create trigger refuse_when_banned before insert or update on public.battles
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert or update on public.battle_players
  for each row execute function private.refuse_when_banned();
create trigger refuse_when_banned before insert on public.battle_answers
  for each row execute function private.refuse_when_banned();
