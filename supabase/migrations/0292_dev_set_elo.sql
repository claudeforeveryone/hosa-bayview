-- Developers set a member's Elo. "Developers" are the accounts in private.stats_viewers (0105), the same list that
-- opens /developer; being an executive is not enough. Elo is the sum of elo_events (0080, 0105), so a change is one
-- more row in that ledger, source 'adjust', with the difference as its points (it can be negative). Every place that
-- shows Elo (boards, Home, member pages, the developer table) sums the same rows, so the change shows everywhere at
-- once. The row has no classroom, so it moves chapter Elo, not an event room's points, and it is dated now, so it
-- also counts in today's, this week's and this month's gain. ref_id is the developer who made it.
--   public.dev_set_elo(p_user, p_elo)  stats viewers only (42501 for anyone else). Returns the new Elo.
-- Tests: supabase/tests/dev_set_elo.sql.

-- Loosen the two checks for 'adjust' rows. The points check came unnamed in 0080, so it's found by what it says.
do $$
declare
  r record;
begin
  for r in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.elo_events'::regclass and con.contype = 'c'
      and (con.conname = 'elo_events_source_check' or pg_get_constraintdef(con.oid) ~ '\mpoints\M')
  loop
    execute format('alter table public.elo_events drop constraint %I', r.conname);
  end loop;
end
$$;
alter table public.elo_events add constraint elo_events_source_check
  check (source = any (array['answer', 'correct', 'repeat', 'review', 'signin', 'bonus', 'adjust']));
alter table public.elo_events add constraint elo_events_points_check
  check (case when source = 'adjust' then points <> 0 and points between -10000000 and 10000000
              else points between 1 and 50 end);

create or replace function public.dev_set_elo(p_user uuid, p_elo integer)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  who uuid := (select auth.uid());
  target_name text;
  current_elo integer;
  diff integer;
begin
  if not private.can_view_stats(who) or private.is_banned() then
    raise exception 'Only developers can change Elo' using errcode = '42501';
  end if;
  if p_elo is null or p_elo not between 0 and 1000000 then
    raise exception 'Pick an Elo from 0 to 1,000,000' using errcode = '22023';
  end if;
  select p.full_name into target_name from public.profiles p where p.id = p_user for update;
  if not found then
    raise exception 'That person is gone. Reload the page.' using errcode = 'P0002';
  end if;
  -- Elo as every board shows it: the rounded sum of the ledger.
  select round(coalesce(sum(e.value), 0))::integer into current_elo from public.elo_events e where e.user_id = p_user;
  diff := p_elo - current_elo;
  if diff = 0 then
    return p_elo;
  end if;
  insert into public.elo_events (user_id, classroom_id, source, ref_id, points, multiplier, earned_at)
  values (p_user, null, 'adjust', who, diff, 1, now());
  insert into public.admin_log (actor_id, actor_name, action, target_id, target_name, detail)
  values (who, coalesce((select p.full_name from public.profiles p where p.id = who), ''),
          'elo', p_user, target_name, format('%s to %s', current_elo, p_elo));
  return p_elo;
end
$$;
revoke all on function public.dev_set_elo(uuid, integer) from public, anon;
grant execute on function public.dev_set_elo(uuid, integer) to authenticated;
