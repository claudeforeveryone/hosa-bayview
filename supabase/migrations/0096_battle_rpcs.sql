-- Task 18: battle RPCs. The server owns every rule: who may join, team sizes, the 20 s clock, one answer per
-- round, grading at close, and the order of rounds. Any player may call advance_battle; it only does what the
-- clock allows. Errors: 42501 not allowed, P0002 no such battle, 22023 bad move, 23505 answered already.
-- Battles write no elo_events and no attempts.

-- Points: 100 for a right answer plus a speed bonus of up to 50, linear in the time left (20 s window).
-- Mirrored by battlePoints in src/lib/battle.ts.
create function private.battle_points(time_left interval)
returns integer language sql immutable set search_path = '' as $$
  select 100 + round(50 * least(greatest(extract(epoch from time_left) * 1000, 0), 20000) / 20000)::integer
$$;

-- Most players per team for a format.
create function private.battle_team_cap(fmt text)
returns integer language sql immutable set search_path = '' as $$
  select case fmt when '1v1' then 1 when '2v2' then 2 when '3v3' then 3 else 20 end
$$;

create function private.new_battle_code()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
      into c from generate_series(1, 4);
    exit when not exists (select 1 from public.battles b where b.code = c and b.status <> 'done');
  end loop;
  return c;
end
$$;

-- Live battles nobody touched for 30 minutes are over; frees their codes.
create function private.sweep_battles()
returns void language sql volatile security definer set search_path = '' as $$
  update public.battles set status = 'done', ended_at = now()
  where status <> 'done' and touched_at < now() - interval '30 minutes'
$$;

-- Questions a battle can draw from: one eligible test, or every eligible test in the room. Keyed questions only.
create function private.battle_pool(cid uuid, tid uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select q.id
  from public.questions q
  join public.tests t on t.id = q.test_id
  join public.question_keys k on k.question_id = q.id
  where t.classroom_id = cid
    and (tid is null or t.id = tid)
    and private.battle_test_ok(t.id)
$$;

-- In the battle and not walked away. A lobby leaver who comes back after the start isn't "in" it.
create function private.battle_active(bid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.battle_players p where p.battle_id = bid and p.user_id = uid and p.left_at is null)
$$;

create function private.battle_all_answered(bid uuid, n smallint)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.battle_players p
    where p.battle_id = bid and p.left_at is null
      and not exists (select 1 from public.battle_answers a
                      where a.battle_id = bid and a.round_no = n and a.user_id = p.user_id)
  )
$$;

-- Close a round once: grade every pick against the key, scored on the server's answer time.
create function private.battle_close_round(bid uuid, n smallint)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  answer_key smallint;
  ends timestamptz;
begin
  select k.correct_index, r.ends_at into answer_key, ends
  from public.battle_rounds r
  left join public.question_keys k on k.question_id = r.question_id
  where r.battle_id = bid and r.round_no = n and r.closed_at is null and r.started_at is not null;
  if not found then
    return;
  end if;
  update public.battle_answers a
    set is_correct = (answer_key is not null and a.choice = answer_key),
        points = case when answer_key is not null and a.choice = answer_key then private.battle_points(ends - a.answered_at) else 0 end
    where a.battle_id = bid and a.round_no = n;
  update public.battle_rounds r set closed_at = now() where r.battle_id = bid and r.round_no = n;
  update public.battles b set touched_at = now() where b.id = bid;
end
$$;

create function private.battle_start_round(bid uuid, n smallint)
returns void language sql volatile security definer set search_path = '' as $$
  update public.battle_rounds set started_at = now(), ends_at = now() + interval '20 seconds'
    where battle_id = bid and round_no = n;
  update public.battles set current_round = n, touched_at = now() where id = bid;
$$;

-- Team totals from closed rounds.
create function private.battle_team_points(bid uuid, tm smallint)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(a.points), 0)::integer
  from public.battle_answers a
  join public.battle_players p on p.battle_id = a.battle_id and p.user_id = a.user_id
  join public.battle_rounds r on r.battle_id = a.battle_id and r.round_no = a.round_no
  where a.battle_id = bid and p.team = tm and r.closed_at is not null
$$;

-- The end: the higher team wins (a tie has no winner). Winners who answered at least once get the win.
create function private.battle_finish(bid uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  one integer := private.battle_team_points(bid, 1::smallint);
  two integer := private.battle_team_points(bid, 2::smallint);
  w smallint := case when one > two then 1 when two > one then 2 end;
begin
  update public.battles set status = 'done', ended_at = now(), touched_at = now(), winner = w where id = bid;
  if w is not null then
    update public.battle_players p set won = true
      where p.battle_id = bid and p.team = w
        and exists (select 1 from public.battle_answers a where a.battle_id = bid and a.user_id = p.user_id);
  end if;
end
$$;

revoke all on function private.battle_points(interval), private.battle_team_cap(text), private.new_battle_code(),
  private.sweep_battles(), private.battle_pool(uuid, uuid), private.battle_active(uuid, uuid),
  private.battle_all_answered(uuid, smallint), private.battle_close_round(uuid, smallint),
  private.battle_start_round(uuid, smallint), private.battle_team_points(uuid, smallint), private.battle_finish(uuid)
  from public, anon, authenticated;

-- Public RPCs ----------------------------------------------------------------------------------------------------

-- Host a battle. Ends any lobby you were already hosting. Returns the battle id.
create function public.create_battle(cid uuid, p_format text, p_test uuid, p_count integer)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  bid uuid;
begin
  if uid is null or not private.can_view_classroom(cid) then
    raise exception 'You can''t battle in this event' using errcode = '42501';
  end if;
  if not private.battle_room_ok(cid) then
    raise exception 'Battles are for multiple-choice and practical events' using errcode = '22023';
  end if;
  if p_format is null or p_format not in ('1v1', '2v2', '3v3', 'teams') then
    raise exception 'Pick a format' using errcode = '22023';
  end if;
  if p_count is null or p_count not between 5 and 30 then
    raise exception 'Pick 5 to 30 questions' using errcode = '22023';
  end if;
  if p_test is not null and not exists (
    select 1 from public.tests t where t.id = p_test and t.classroom_id = cid and private.battle_test_ok(t.id)
  ) then
    raise exception 'Pick a published test from this event' using errcode = '22023';
  end if;
  if not exists (select 1 from private.battle_pool(cid, p_test)) then
    raise exception 'No questions to play yet' using errcode = '22023';
  end if;

  perform private.sweep_battles();
  update public.battles set status = 'done', ended_at = now() where host_id = uid and status = 'lobby';
  insert into public.battles (classroom_id, code, host_id, format, source_test_id, question_count)
  values (cid, private.new_battle_code(), uid, p_format, p_test, p_count)
  returning id into bid;
  insert into public.battle_players (battle_id, user_id, team) values (bid, uid, 1);
  return bid;
end
$$;

-- Join (or rejoin) a battle. New players join in the lobby only, on the smaller team. Returns your team.
create function public.join_battle(bid uuid)
returns smallint language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  b public.battles;
  mine public.battle_players;
  cap integer;
  one integer;
  two integer;
  tm smallint;
begin
  if uid is null or not private.can_see_battle(bid) then
    raise exception 'You can''t join this battle' using errcode = '42501';
  end if;
  select * into b from public.battles where id = bid for update;
  if b.status = 'done' or b.touched_at < now() - interval '30 minutes' then
    raise exception 'This battle is over' using errcode = '22023';
  end if;
  select * into mine from public.battle_players p where p.battle_id = bid and p.user_id = uid;
  if found and mine.left_at is null then
    return mine.team;
  end if;
  -- Rejoin mid-game: same team, same points. A lobby leaver can't slip back in once it's started.
  if found and b.status = 'playing' and mine.left_at >= b.started_at then
    update public.battle_players set left_at = null where battle_id = bid and user_id = uid;
    update public.battles set touched_at = now() where id = bid;
    return mine.team;
  end if;
  if b.status <> 'lobby' then
    raise exception 'This battle already started' using errcode = '22023';
  end if;
  cap := private.battle_team_cap(b.format);
  select count(*) filter (where p.team = 1), count(*) filter (where p.team = 2) into one, two
    from public.battle_players p where p.battle_id = bid and p.left_at is null and p.user_id <> uid;
  tm := case when one <= two then 1 else 2 end;
  if (case tm when 1 then one else two end) >= cap then
    tm := 3 - tm;
  end if;
  if (case tm when 1 then one else two end) >= cap then
    raise exception 'This battle is full' using errcode = '22023';
  end if;
  insert into public.battle_players (battle_id, user_id, team) values (bid, uid, tm)
    on conflict (battle_id, user_id) do update set team = excluded.team, left_at = null, joined_at = now();
  update public.battles set touched_at = now() where id = bid;
  return tm;
end
$$;

-- Join by the 4-character code. "No battle with that code" also covers battles in rooms you can't see.
create function public.join_battle_code(p_code text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  c text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  bid uuid;
begin
  if (select auth.uid()) is null or private.is_banned() then
    raise exception 'You can''t join this battle' using errcode = '42501';
  end if;
  perform private.sweep_battles();
  select b.id into bid from public.battles b where b.code = c and b.status <> 'done';
  if bid is null or not private.can_see_battle(bid) then
    raise exception 'No battle with that code' using errcode = 'P0002';
  end if;
  perform public.join_battle(bid);
  return bid;
end
$$;

-- Switch team in the lobby.
create function public.pick_battle_team(bid uuid, p_team integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  b public.battles;
begin
  if uid is null or not private.can_see_battle(bid) then
    raise exception 'You can''t join this battle' using errcode = '42501';
  end if;
  select * into b from public.battles where id = bid for update;
  if b.status <> 'lobby' then
    raise exception 'Teams are set once it starts' using errcode = '22023';
  end if;
  if p_team is null or p_team not in (1, 2) then
    raise exception 'Pick team 1 or 2' using errcode = '22023';
  end if;
  if not private.battle_active(bid, uid) then
    raise exception 'You''re not in this battle' using errcode = '42501';
  end if;
  if (select count(*) from public.battle_players p
      where p.battle_id = bid and p.team = p_team and p.left_at is null and p.user_id <> uid)
     >= private.battle_team_cap(b.format) then
    raise exception 'That team is full' using errcode = '22023';
  end if;
  update public.battle_players set team = p_team where battle_id = bid and user_id = uid;
  update public.battles set touched_at = now() where id = bid;
end
$$;

-- Leave. The host role passes to the next player; an empty battle ends. Your points stay with your team.
create function public.leave_battle(bid uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  b public.battles;
  next_host uuid;
begin
  if uid is null then
    raise exception 'You''re not in this battle' using errcode = '42501';
  end if;
  select * into b from public.battles where id = bid for update;
  if not found or not private.battle_active(bid, uid) then
    return;
  end if;
  update public.battle_players set left_at = now() where battle_id = bid and user_id = uid;
  if b.status = 'done' then
    return;
  end if;
  if b.host_id is not distinct from uid or b.host_id is null then
    select p.user_id into next_host from public.battle_players p
      where p.battle_id = bid and p.left_at is null order by p.joined_at limit 1;
    if next_host is not null then
      update public.battles set host_id = next_host where id = bid;
    end if;
  end if;
  if not exists (select 1 from public.battle_players p where p.battle_id = bid and p.left_at is null) then
    update public.battles set status = 'done', ended_at = now(), touched_at = now() where id = bid;
    return;
  end if;
  update public.battles set touched_at = now() where id = bid;
  -- The ones still here may all have answered already.
  if b.status = 'playing' and private.battle_all_answered(bid, b.current_round) then
    perform private.battle_close_round(bid, b.current_round);
  end if;
end
$$;

-- Host only: draw the questions (random, no repeats) and start round 1.
create function public.start_battle(bid uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  b public.battles;
  cap integer;
  one integer;
  two integer;
  n integer;
begin
  if uid is null or not private.can_see_battle(bid) then
    raise exception 'You can''t start this battle' using errcode = '42501';
  end if;
  select * into b from public.battles where id = bid for update;
  if b.host_id is distinct from uid then
    raise exception 'Only the host can start' using errcode = '42501';
  end if;
  if b.status <> 'lobby' then
    raise exception 'This battle already started' using errcode = '22023';
  end if;
  cap := private.battle_team_cap(b.format);
  select count(*) filter (where p.team = 1), count(*) filter (where p.team = 2) into one, two
    from public.battle_players p where p.battle_id = bid and p.left_at is null;
  if b.format = 'teams' and (one < 1 or two < 1) then
    raise exception 'Needs a player on each team' using errcode = '22023';
  end if;
  if b.format <> 'teams' and (one <> cap or two <> cap) then
    raise exception 'Needs % on each team', cap using errcode = '22023';
  end if;
  insert into public.battle_rounds (battle_id, round_no, question_id)
  select bid, row_number() over (), s.id
  from (select p.id from private.battle_pool(b.classroom_id, b.source_test_id) p(id) order by random() limit b.question_count) s;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'No questions to play yet' using errcode = '22023';
  end if;
  update public.battles set status = 'playing', started_at = now(), question_count = n where id = bid;
  perform private.battle_start_round(bid, 1::smallint);
end
$$;

-- One answer per round, inside the 20 s window, timed by the server. Says nothing about right or wrong:
-- that comes from battle_state once the round closes. Closes the round when everyone still here has answered.
create function public.answer_battle(bid uuid, p_round integer, p_choice integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  b public.battles;
  r public.battle_rounds;
  opts integer;
begin
  if uid is null or not private.can_see_battle(bid) then
    raise exception 'You can''t play this battle' using errcode = '42501';
  end if;
  select * into b from public.battles where id = bid for update;
  if b.status <> 'playing' then
    raise exception 'This battle isn''t running' using errcode = '22023';
  end if;
  if not private.battle_active(bid, uid) then
    raise exception 'You''re not in this battle' using errcode = '42501';
  end if;
  if p_round is distinct from b.current_round then
    raise exception 'That round is over' using errcode = '22023';
  end if;
  select * into r from public.battle_rounds where battle_id = bid and round_no = b.current_round;
  if exists (select 1 from public.battle_answers a where a.battle_id = bid and a.round_no = r.round_no and a.user_id = uid) then
    raise exception 'You already answered this one' using errcode = '23505';
  end if;
  if r.closed_at is not null or now() >= r.ends_at then
    raise exception 'Time is up' using errcode = '22023';
  end if;
  select cardinality(q.options) into opts from public.questions q where q.id = r.question_id;
  if p_choice is null or opts is null or p_choice < 0 or p_choice >= opts then
    raise exception 'Pick one of the options' using errcode = '22023';
  end if;
  insert into public.battle_answers (battle_id, round_no, user_id, choice, answered_at)
  values (bid, r.round_no, uid, p_choice, now());
  update public.battles set touched_at = now() where id = bid;
  if private.battle_all_answered(bid, r.round_no) then
    perform private.battle_close_round(bid, r.round_no);
  end if;
end
$$;

-- Moves the battle on as far as the clock allows. Safe for every player to call at once.
-- Open round: closes it at the 20 s mark, or once everyone still here has answered.
-- Closed round: the host may go on straight away; anyone may after the 5 s reveal. After the last round, the end.
create function public.advance_battle(bid uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  b public.battles;
  r public.battle_rounds;
begin
  if uid is null or not private.can_see_battle(bid) then
    raise exception 'You can''t play this battle' using errcode = '42501';
  end if;
  select * into b from public.battles where id = bid for update;
  if b.status <> 'playing' then
    return;
  end if;
  if not exists (select 1 from public.battle_players p where p.battle_id = bid and p.user_id = uid) then
    raise exception 'You''re not in this battle' using errcode = '42501';
  end if;
  select * into r from public.battle_rounds where battle_id = bid and round_no = b.current_round;
  if r.closed_at is null then
    if now() >= r.ends_at or private.battle_all_answered(bid, r.round_no) then
      perform private.battle_close_round(bid, r.round_no);
    end if;
    return;
  end if;
  if b.host_id is distinct from uid and now() < r.closed_at + interval '5 seconds' then
    return;
  end if;
  if b.current_round < b.question_count then
    perform private.battle_start_round(bid, (b.current_round + 1)::smallint);
  else
    perform private.battle_finish(bid);
  end if;
end
$$;

-- Everything a screen needs, in one read. Picks, points and the key appear only for a closed round;
-- scores count closed rounds only.
create function public.battle_state(bid uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  b public.battles;
  r public.battle_rounds;
  q public.questions;
  answer_key smallint;
  cur jsonb;
begin
  if uid is null or not private.can_see_battle(bid) then
    raise exception 'You can''t see this battle' using errcode = '42501';
  end if;
  select * into b from public.battles where id = bid;
  if b.current_round > 0 then
    select * into r from public.battle_rounds where battle_id = bid and round_no = b.current_round;
    select * into q from public.questions where id = r.question_id;
    if r.closed_at is not null then
      select k.correct_index into answer_key from public.question_keys k where k.question_id = r.question_id;
    end if;
    cur := jsonb_build_object(
      'no', r.round_no,
      'prompt', coalesce(q.prompt, 'This question was removed'),
      'options', coalesce(to_jsonb(q.options), '[]'::jsonb),
      'started_at', r.started_at,
      'ends_at', r.ends_at,
      'closed_at', r.closed_at,
      'answered', (select count(*) from public.battle_answers a
                   where a.battle_id = bid and a.round_no = r.round_no),
      'my_choice', (select a.choice from public.battle_answers a
                    where a.battle_id = bid and a.round_no = r.round_no and a.user_id = uid),
      'correct_index', case when r.closed_at is not null then answer_key end,
      'results', case when r.closed_at is not null then coalesce((
        select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'choice', a.choice, 'points', a.points,
                                            'is_correct', a.is_correct))
        from public.battle_answers a where a.battle_id = bid and a.round_no = r.round_no), '[]'::jsonb) end
    );
  end if;
  return jsonb_build_object(
    'id', b.id,
    'code', b.code,
    'format', b.format,
    'status', b.status,
    'round', b.current_round,
    'total', b.question_count,
    'host_id', b.host_id,
    'me', uid,
    'classroom_id', b.classroom_id,
    'classroom_name', (select c.name from public.classrooms c where c.id = b.classroom_id),
    'source_title', (select t.title from public.tests t where t.id = b.source_test_id),
    'winner', b.winner,
    'rematch_id', (select x.id from public.battles x where x.id = b.rematch_id and x.status = 'lobby'),
    'now', now(),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.user_id,
        'name', coalesce(pr.full_name, 'Member'),
        'team', p.team,
        'active', p.left_at is null,
        'points', coalesce(s.points, 0),
        'correct', coalesce(s.correct, 0),
        'answered', coalesce(s.answered, 0),
        'in_round', exists (select 1 from public.battle_answers a
                            where a.battle_id = bid and a.round_no = b.current_round and a.user_id = p.user_id)
      ) order by p.team, p.joined_at)
      from public.battle_players p
      left join public.profiles pr on pr.id = p.user_id
      left join lateral (
        select sum(a.points)::integer as points, count(*) filter (where a.is_correct)::integer as correct,
               count(*)::integer as answered
        from public.battle_answers a
        join public.battle_rounds br on br.battle_id = a.battle_id and br.round_no = a.round_no
        where a.battle_id = bid and a.user_id = p.user_id and br.closed_at is not null
      ) s on true
      where p.battle_id = bid
        -- Lobby leavers drop off the list; players who left mid-game stay, greyed out.
        and (p.left_at is null or (b.started_at is not null and p.left_at >= b.started_at))
    ), '[]'::jsonb),
    'teams', jsonb_build_array(private.battle_team_points(bid, 1::smallint), private.battle_team_points(bid, 2::smallint)),
    'current', cur
  );
end
$$;

-- Live battles for the event page (cid) or every room you're in (cid null): lobbies you can join, and games
-- you're part of. Abandoned ones (30 minutes untouched) don't show.
create function public.open_battles(cid uuid default null)
returns table(id uuid, code text, classroom_id uuid, classroom_name text, format text, status text,
              host_name text, players bigint, joined boolean)
language sql stable security definer set search_path = '' as $$
  select b.id, b.code, b.classroom_id, c.name, b.format, b.status,
    (select pr.full_name from public.profiles pr where pr.id = b.host_id),
    (select count(*) from public.battle_players p where p.battle_id = b.id and p.left_at is null),
    exists (select 1 from public.battle_players p where p.battle_id = b.id and p.user_id = (select auth.uid())
            and (p.left_at is null or (b.started_at is not null and p.left_at >= b.started_at)))
  from public.battles b
  join public.classrooms c on c.id = b.classroom_id
  where b.status <> 'done'
    and b.touched_at > now() - interval '30 minutes'
    and (cid is null or b.classroom_id = cid)
    and private.can_see_battle(b.id)
    and (b.status = 'lobby' or exists (
      select 1 from public.battle_players p where p.battle_id = b.id and p.user_id = (select auth.uid())
        and (p.left_at is null or p.left_at >= b.started_at)))
  order by b.created_at desc
  limit 10
$$;

-- Tests a host can pick as the source, with how many questions each has.
create function public.battle_sources(cid uuid)
returns table(test_id uuid, title text, questions bigint)
language sql stable security definer set search_path = '' as $$
  select t.id, t.title, count(*)
  from public.tests t
  join private.battle_pool(cid, null) p(id) on true
  join public.questions q on q.id = p.id and q.test_id = t.id
  where t.classroom_id = cid and private.can_view_classroom(cid)
  group by t.id, t.title, t.created_at
  order by t.created_at desc
$$;

-- Play again: the first player to ask makes the new lobby (same room, format and source) and hosts it;
-- everyone after joins that one.
create function public.rematch_battle(bid uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  b public.battles;
  nb uuid;
begin
  if uid is null or not private.can_see_battle(bid) then
    raise exception 'You can''t join this battle' using errcode = '42501';
  end if;
  select * into b from public.battles where id = bid for update;
  if b.status <> 'done' then
    raise exception 'This battle is still going' using errcode = '22023';
  end if;
  if not exists (select 1 from public.battle_players p where p.battle_id = bid and p.user_id = uid) then
    raise exception 'You weren''t in this battle' using errcode = '42501';
  end if;
  if b.rematch_id is not null
     and exists (select 1 from public.battles x where x.id = b.rematch_id and x.status = 'lobby'
                 and x.touched_at > now() - interval '30 minutes') then
    perform public.join_battle(b.rematch_id);
    return b.rematch_id;
  end if;
  nb := public.create_battle(b.classroom_id, b.format,
    case when b.source_test_id is not null and private.battle_test_ok(b.source_test_id) then b.source_test_id end,
    greatest(b.question_count, 5));
  update public.battles set rematch_id = nb where id = bid;
  return nb;
end
$$;

-- Battle wins for a profile. Not an Elo source.
create function public.battle_wins(p_user uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.battle_players p
  where p.user_id = p_user and p.won and (select auth.uid()) is not null and not private.is_banned()
$$;

revoke all on function public.create_battle(uuid, text, uuid, integer), public.join_battle(uuid),
  public.join_battle_code(text), public.pick_battle_team(uuid, integer), public.leave_battle(uuid),
  public.start_battle(uuid), public.answer_battle(uuid, integer, integer), public.advance_battle(uuid),
  public.battle_state(uuid), public.open_battles(uuid), public.battle_sources(uuid), public.rematch_battle(uuid),
  public.battle_wins(uuid)
  from public, anon;
grant execute on function public.create_battle(uuid, text, uuid, integer), public.join_battle(uuid),
  public.join_battle_code(text), public.pick_battle_team(uuid, integer), public.leave_battle(uuid),
  public.start_battle(uuid), public.answer_battle(uuid, integer, integer), public.advance_battle(uuid),
  public.battle_state(uuid), public.open_battles(uuid), public.battle_sources(uuid), public.rematch_battle(uuid),
  public.battle_wins(uuid)
  to authenticated;
