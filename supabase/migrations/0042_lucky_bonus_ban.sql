-- Banned members don't roll lucky bonuses. Returns 0 quietly so the overlay just shows nothing.
create or replace function public.roll_lucky_bonus(p_reason text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  amount integer;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('visit', 'test', 'flashcards') then
    raise exception 'Reason must be visit, test or flashcards' using errcode = '22023';
  end if;
  if private.is_banned() then
    return 0;
  end if;

  insert into public.elo_rolls (user_id, reason, day)
  values (uid, p_reason, private.local_day(now()))
  on conflict do nothing;
  if not found then
    return 0;
  end if;

  amount := private.lucky_amount(random(), random(), random());
  if amount > 0 then
    insert into public.elo_bonuses (user_id, amount, reason) values (uid, amount, p_reason);
  end if;
  return amount;
end
$$;
