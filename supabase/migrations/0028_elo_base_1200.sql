-- Elo starts at 1200 instead of 100. Gains and the streak multiplier are unchanged.
create or replace function private.elo_score(minutes bigint, reviews bigint, answered bigint, correct bigint, streak integer)
returns integer
language sql immutable set search_path = ''
as $$
  select round(
    1200 + (minutes * 0.5 + reviews * 1 + answered * 2 + correct * 3)
          * (1 + least(greatest(streak, 0), 30) * 0.02)
  )::integer
$$;
