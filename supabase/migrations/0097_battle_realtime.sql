-- Task 18: realtime for battles. One private channel per battle, topic 'battle:<id>'.
-- 1. battle_rounds is on the supabase_realtime publication; clients hear round changes as postgres_changes
--    (RLS applies: only started rounds, only room viewers). The table has no key column.
-- 2. The database broadcasts a bare 'sync' on the channel when the battle, its players or its answer count
--    change. The payload is just the battle id: clients re-read battle_state, which applies every rule.
-- 3. Only room viewers (never banned) may join the channel; nobody may send on it from a client.

alter publication supabase_realtime add table public.battle_rounds;

create function private.battle_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  bid uuid := coalesce(to_jsonb(new) ->> 'battle_id', to_jsonb(new) ->> 'id')::uuid;
begin
  -- realtime.send never raises (it turns failures into a warning), so a broadcast hiccup can't undo a move.
  perform realtime.send(jsonb_build_object('battle', bid), 'sync', 'battle:' || bid::text, true);
  return null;
end
$$;
revoke all on function private.battle_sync() from public, anon, authenticated;

create trigger battle_sync after update on public.battles
  for each row execute function private.battle_sync();
create trigger battle_sync after insert or update of team, left_at on public.battle_players
  for each row execute function private.battle_sync();
create trigger battle_sync after insert on public.battle_answers
  for each row execute function private.battle_sync();

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
