-- 0205: an answer reads the test's show_answers under a share lock on the test row, so an answer and a reveal (the
-- UPDATE that turns show_answers on, which pays held-back bonuses in private.elo_pay_revealed) can't miss each other.
-- One session can't race itself, so this checks the lock the answer leaves behind: a graded answer must hold FOR SHARE
-- on its test row (that conflicts with UPDATE). Before 0205's lock the row only had the FOR KEY SHARE a foreign key
-- check takes, which an UPDATE of show_answers doesn't wait for.
-- Needs pgrowlocks, created inside this transaction (the rollback removes it). Writes only rows the rollback removes:
-- one question and its key in a published test the account can practise, a practice run and an answer.
-- Account: omega.trainee_id if set, otherwise the newest trainee who isn't banned. Raises if a check fails.
begin;
set local lock_timeout = '3s';
create extension if not exists pgrowlocks with schema extensions;

create temp table _p (k text primary key, v text);
grant all on _p to authenticated;
insert into _p
select 'who', coalesce(nullif(current_setting('omega.trainee_id', true), '')::uuid,
  (select p.id from public.profiles p
   where p.role = 'trainee' and (p.banned_until is null or p.banned_until <= now())
   order by p.created_at desc limit 1))::text;

-- A published test the account can practise now, with no competition window in the way.
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from _p where k = 'who'), 'role', 'authenticated')::text, true);
insert into _p
select 'test', (select t.id::text from public.tests t
  where t.is_published and t.allow_practice and private.can_take_test(t.id)
    and private.test_state(t.id) not in ('open', 'upcoming')
    and not private.practice_locked(t.id, (select v::uuid from _p where k = 'who'))
  order by t.created_at, t.id limit 1);
select set_config('request.jwt.claims', '', true);

insert into public.questions (id, test_id, position, prompt, options)
select '00000000-0000-4000-8000-0000000000c1', v::uuid,
  coalesce((select max(q.position) from public.questions q where q.test_id = v::uuid), 0) + 1,
  'Omega lock check', array['first', 'second']
from _p where k = 'test' and v is not null;
insert into public.question_keys (question_id, correct_index)
select id, 0 from public.questions where id = '00000000-0000-4000-8000-0000000000c1';

select set_config('request.jwt.claims',
  json_build_object('sub', (select v from _p where k = 'who'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _p select 'run', public.start_attempt((select v::uuid from _p where k = 'test'), 'practice')::text;
insert into _p
select 'answered', (select (a.selected_index = 0)::text
  from public.answer_question((select v::uuid from _p where k = 'run'), '00000000-0000-4000-8000-0000000000c1', 0) a);
reset role;
select set_config('request.jwt.claims', '', true);

insert into _p
select 'modes', (select coalesce(array_to_string(r.modes, ','), '')
  from extensions.pgrowlocks('public.tests') r
  where r.locked_row = (select ctid from public.tests where id = (select v::uuid from _p where k = 'test')));
insert into _p
select 'elo', (select count(*)::text from public.elo_events
  where ref_id = '00000000-0000-4000-8000-0000000000c1' and source = 'answer');

do $$
declare bad text := '';
begin
  if (select v from _p where k = 'test') is null then
    bad := bad || ' | setup: no published test the account can practise';
  end if;
  if (select v from _p where k = 'answered') is distinct from 'true' then
    bad := bad || ' | setup: the practice answer was not stored';
  end if;
  if (select v from _p where k = 'elo') is distinct from '1' then
    bad := bad || ' | the answer earned no answer row (the trigger did not reach the lock)';
  end if;
  if position('For Share' in coalesce((select v from _p where k = 'modes'), '')) = 0 then
    bad := bad || ' | a graded answer must hold FOR SHARE on its test row, got [' ||
      coalesce((select v from _p where k = 'modes'), 'no lock') || ']';
  end if;
  if bad <> '' then
    raise exception 'elo_reveal_lock FAILED:%', bad;
  end if;
end $$;

select 'elo_reveal_lock: all 4 checks passed' as result;

rollback;
