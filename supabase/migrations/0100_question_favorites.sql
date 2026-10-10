-- Favourite questions: a member stars a question from their career list or a reviewed attempt.
-- 1. question_favorites: one row per member per question; you read, add and remove only your own rows, and only
--    for questions you can view (the same rule as reading the question: private.can_take_test on its test).
-- 2. career_items: the career list plus question_id and whether the caller starred it. career keeps its
--    shape so nothing that reads it breaks.

-- 1. Table -------------------------------------------------------------------

create table public.question_favorites (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index question_favorites_question_idx on public.question_favorites (question_id);
alter table public.question_favorites enable row level security;
revoke all on public.question_favorites from anon, authenticated;
grant select, delete on public.question_favorites to authenticated;
grant insert (question_id) on public.question_favorites to authenticated;

create policy "question_favorites: own read" on public.question_favorites for select to authenticated
  using (user_id = (select auth.uid())
         and private.can_take_test((select q.test_id from public.questions q where q.id = question_id)));
create policy "question_favorites: own add" on public.question_favorites for insert to authenticated
  with check (user_id = (select auth.uid())
              and private.can_take_test((select q.test_id from public.questions q where q.id = question_id)));
create policy "question_favorites: own remove" on public.question_favorites for delete to authenticated
  using (user_id = (select auth.uid())
         and private.can_take_test((select q.test_id from public.questions q where q.id = question_id)));

create trigger refuse_when_banned before insert on public.question_favorites
  for each row execute function private.refuse_when_banned();

-- 2. Career with question ids -------------------------------------------------

-- 0098 (battles) adds private.question_in_live_battle and hides a live round's key from career. This file may be
-- applied before or after the battle migrations, so career_items asks through this wrapper: false while the battle
-- function doesn't exist, the battle answer once it does. Nothing to patch here when 0095-0098 land.
create or replace function private.question_live_guard(qid uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  live boolean;
begin
  if to_regprocedure('private.question_in_live_battle(uuid)') is null then
    return false;
  end if;
  execute 'select private.question_in_live_battle($1)' into live using qid;
  return coalesce(live, false);
end
$$;
revoke all on function private.question_live_guard(uuid) from public, anon, authenticated;

-- Same rows, order, limit and key rules as public.career (0067-0098); adds the question and the caller's star.
create or replace function public.career_items(uid uuid, cid uuid)
 returns table(answered_at timestamp with time zone, test_title text, prompt text, options text[], selected_index smallint, correct_index smallint, is_correct boolean, explanation text, question_id uuid, favorite boolean)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
#variable_conflict use_column
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  return query
  with rows as (
    select aa.answered_at, t.title, q.prompt, q.options, aa.selected_index, k.correct_index, aa.is_correct,
      k.explanation, q.id as qid,
      (private.is_executive() or private.can_manage_classroom(t.classroom_id)
        or (t.show_answers and not private.keys_locked(t.id)
            and (a.submitted_at is not null or a.mode = 'practice')
            and not private.question_live_guard(q.id))) as reveal
    from public.attempt_answers aa
    join public.attempts a on a.id = aa.attempt_id
    join public.tests t on t.id = a.test_id
    join public.questions q on q.id = aa.question_id
    join public.question_keys k on k.question_id = q.id
    where a.user_id = uid
      and (a.submitted_at is not null or a.mode = 'practice')
      and aa.is_correct is not null
      and (cid is null or t.classroom_id = cid)
      and (uid = (select auth.uid())
           or private.is_executive()
           or private.can_manage_classroom(t.classroom_id))
  )
  select r.answered_at, r.title, r.prompt, r.options, r.selected_index,
    case when r.reveal then r.correct_index end,
    case when r.reveal then r.is_correct end,
    case when r.reveal then r.explanation end,
    r.qid,
    exists (select 1 from public.question_favorites f
            where f.user_id = (select auth.uid()) and f.question_id = r.qid)
  from rows r
  order by r.answered_at desc
  limit 500;
end
$function$;
revoke all on function public.career_items(uuid, uuid) from public, anon;
grant execute on function public.career_items(uuid, uuid) to authenticated;
