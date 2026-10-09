-- A test or flashcards roll only counts once the member has done it today: a submitted attempt, or a card
-- review or finished match. Checked before the day's roll is used, so an early call just tries again later.
create or replace function public.roll_lucky_bonus(p_reason text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := private.local_day(now());
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
  if p_reason = 'test' and not exists (
    select 1 from public.attempts a
    where a.user_id = uid and a.submitted_at is not null and private.local_day(a.submitted_at) = today
  ) then
    return 0;
  end if;
  if p_reason = 'flashcards' and not exists (
    select 1 from public.card_reviews r
    where r.user_id = uid and private.local_day(r.reviewed_at) = today
  ) and not exists (
    select 1 from public.match_results m
    where m.user_id = uid and private.local_day(m.created_at) = today
  ) then
    return 0;
  end if;

  insert into public.elo_rolls (user_id, reason, day)
  values (uid, p_reason, today)
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
