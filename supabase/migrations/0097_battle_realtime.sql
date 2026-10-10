-- Task 18: realtime for battles. One private channel per battle, topic 'battle:<id>'.
-- 1. No battle table is on the supabase_realtime publication: column grants may not filter postgres_changes
--    payloads, and battle_rounds holds question_id. Clients rely on broadcast pokes and RPC reads only.
-- 2. Each battle RPC sends one bare 'sync' broadcast (private.battle_poke, 0096); clients re-read battle_state.
-- 3. Only room viewers (never banned) may join the channel; nobody may send on it from a client.

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
