-- Task 18: realtime for battles. One private channel per battle, topic 'battle:<id>'.
-- 1. battle_rounds is on the supabase_realtime publication; clients hear round changes as postgres_changes.
--    RLS applies (only started rounds, only room viewers) and so do column grants: question_id is not granted
--    (0095), so it never appears in a payload.
-- 2. Each battle RPC sends one bare 'sync' broadcast (private.battle_poke, 0096); clients re-read battle_state.
-- 3. Only room viewers (never banned) may join the channel; nobody may send on it from a client.

alter publication supabase_realtime add table public.battle_rounds;

-- Channel access: the topic names a battle the caller can see.
create function private.battle_topic_ok(topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if topic is null or topic not like 'battle:%' then
    return false;
  end if;
  return private.can_see_battle(substr(topic, 8)::uuid);
exception when invalid_text_representation then
  return false;
end
$$;
revoke all on function private.battle_topic_ok(text) from public, anon;
grant execute on function private.battle_topic_ok(text) to authenticated;

create policy "battle channel: room viewers receive"
  on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select private.battle_topic_ok((select realtime.topic()))));
