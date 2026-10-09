-- Members could read join_code straight off the table. Column grants now leave it out:
-- the code is only readable through my_classrooms/classroom_detail, which show it to managers.
revoke select on public.classrooms from authenticated;
grant select (id, num, name, event, description, owner_id, created_at) on public.classrooms to authenticated;

-- Count-then-insert let parallel guesses all slip under the limit. Serialize each user's attempts.
create or replace function public.join_classroom(code text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean text := upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
  cid uuid;
  owner_uid uuid;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('hosa.join:' || uid::text));
  if (select count(*) from private.join_attempts where user_id = uid and at > now() - interval '10 minutes') >= 10 then
    raise exception 'Too many tries' using errcode = '54000';
  end if;

  select id, owner_id into cid, owner_uid from public.classrooms where join_code = clean;
  if cid is null then
    insert into private.join_attempts (user_id) values (uid);
    delete from private.join_attempts where at < now() - interval '1 day';
    return null;
  end if;

  if owner_uid is distinct from uid then
    insert into public.classroom_members (classroom_id, user_id) values (cid, uid)
    on conflict do nothing;
  end if;
  return cid;
end
$$;
