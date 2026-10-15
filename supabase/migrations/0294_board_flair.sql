-- Leaderboard name colours and flair. Every board colours a name by what the person is in the chapter (developer,
-- executive, trainer, or plain member) and can show a short flair they picked beside it.
--   profiles.flair     up to 20 characters: letters, numbers, spaces and a little punctuation (no emoji, the design
--                      has none). Members set their own in Settings > Account; executives can change or clear anyone's
--                      from the /admin person panel. The usual "update own or exec" policy covers both.
--   public.board_tags() every member's kind and flair, for anyone signed in and not banned. kind is 'developer'
--                      (private.stats_viewers, 0105), else 'executive' or 'trainer' from the role, else 'member'.
-- leaderboard() keeps its signature (the MCP can't drop a function), so boards read this alongside it.
-- Tests: supabase/tests/board_flair.sql.

alter table public.profiles add column if not exists flair text;
alter table public.profiles add constraint profiles_flair_check check (
  flair is null or (
    char_length(flair) between 1 and 20
    and flair = btrim(flair)
    and flair !~ '  '
    and flair ~ '^[A-Za-z0-9 .,''&+#/!?-]+$'
  )
);

create or replace function public.board_tags()
returns table(user_id uuid, kind text, flair text)
language sql stable security definer set search_path = '' as $$
  select p.id,
    case
      when exists (select 1 from private.stats_viewers v where v.user_id = p.id) then 'developer'
      when p.role = 'executive' then 'executive'
      when p.role = 'trainer' then 'trainer'
      else 'member'
    end,
    p.flair
  from public.profiles p
  where (select auth.uid()) is not null and not private.is_banned()
$$;
revoke all on function public.board_tags() from public, anon;
grant execute on function public.board_tags() to authenticated;
