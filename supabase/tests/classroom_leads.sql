-- Event leads (migration 0291). One transaction, rolled back; raises on the first failure.
-- Run as a superuser (Supabase SQL editor or MCP execute_sql).
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.expect(label text, stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL %: expected %, got success', label, state using errcode = 'XX001';
exception when others then
  if sqlstate <> state then raise exception 'FAIL %: expected %, got % (%)', label, state, sqlstate, sqlerrm; end if;
end $$;

create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
end $$;

-- E1 executive (makes the room), E2 executive, R1 and R2 trainers, T1 trainee, M1 trainee member.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000ce1', 'authenticated', 'authenticated', 'cl.e1@example.com', '{"full_name":"Lead Maker"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000ce2', 'authenticated', 'authenticated', 'cl.e2@example.com', '{"full_name":"Exec Two"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000cb1', 'authenticated', 'authenticated', 'cl.r1@example.com', '{"full_name":"Rae Lead"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000cb2', 'authenticated', 'authenticated', 'cl.r2@example.com', '{"full_name":"Ria Lead"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000ca1', 'authenticated', 'authenticated', 'cl.t1@example.com', '{"full_name":"Tad Trainee"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000ca2', 'authenticated', 'authenticated', 'cl.m1@example.com', '{"full_name":"Mo Member"}', now());
update public.profiles set role = 'executive'
  where id in ('00000000-0000-4000-8000-000000000ce1', '00000000-0000-4000-8000-000000000ce2');
update public.profiles set role = 'trainer'
  where id in ('00000000-0000-4000-8000-000000000cb1', '00000000-0000-4000-8000-000000000cb2');

insert into public.classrooms (id, name, event, owner_id)
  values ('00000000-0000-4000-8000-0000000c1a55', 'Leads Room', 'Forensic Science', '00000000-0000-4000-8000-000000000ce1');
insert into public.classroom_members (classroom_id, user_id)
  values ('00000000-0000-4000-8000-0000000c1a55', '00000000-0000-4000-8000-000000000ca2');

-- Before any leads: the maker shows, and a trainer outside the room can't see it.
select pg_temp.as_user('00000000-0000-4000-8000-000000000ca2');
select pg_temp.check('maker shows with no leads',
  (select owner_name = 'Lead Maker' from public.classroom_detail('00000000-0000-4000-8000-0000000c1a55')));
select pg_temp.check('runners fall back to the maker',
  (select array_agg(full_name) = array['Lead Maker'] and not bool_or(lead)
   from public.classroom_runners('00000000-0000-4000-8000-0000000c1a55')));
select pg_temp.as_admin();
select pg_temp.as_user('00000000-0000-4000-8000-000000000cb1');
select pg_temp.check('outside trainer sees nothing',
  not exists (select 1 from public.classroom_detail('00000000-0000-4000-8000-0000000c1a55')));
-- Only executives set leads.
select pg_temp.expect('trainer cannot set leads',
  $q$select public.set_classroom_leads('00000000-0000-4000-8000-0000000c1a55', array['00000000-0000-4000-8000-000000000cb1']::uuid[])$q$,
  '42501');
select pg_temp.expect('lead_ids not readable directly',
  $q$select lead_ids from public.classrooms$q$, '42501');
select pg_temp.expect('lead_ids not writable directly',
  $q$update public.classrooms set lead_ids = array['00000000-0000-4000-8000-000000000cb1']::uuid[]$q$, '42501');
select pg_temp.as_admin();

select pg_temp.as_user('00000000-0000-4000-8000-000000000ce2');
select pg_temp.expect('trainee refused as lead',
  $q$select public.set_classroom_leads('00000000-0000-4000-8000-0000000c1a55', array['00000000-0000-4000-8000-000000000ca1']::uuid[])$q$,
  'P0001');
select pg_temp.expect('missing person refused',
  $q$select public.set_classroom_leads('00000000-0000-4000-8000-0000000c1a55', array[gen_random_uuid()])$q$, 'P0002');
select pg_temp.expect('missing room refused',
  $q$select public.set_classroom_leads(gen_random_uuid(), '{}')$q$, 'P0002');
select pg_temp.expect('at most 6',
  $q$select public.set_classroom_leads('00000000-0000-4000-8000-0000000c1a55',
    array(select gen_random_uuid() from generate_series(1, 7)))$q$, '22023');
-- Order kept, duplicates and nulls dropped.
select public.set_classroom_leads('00000000-0000-4000-8000-0000000c1a55', array[
  '00000000-0000-4000-8000-000000000cb2', null, '00000000-0000-4000-8000-000000000cb1',
  '00000000-0000-4000-8000-000000000cb2', '00000000-0000-4000-8000-000000000ce2']::uuid[]);
select pg_temp.as_admin();
select pg_temp.check('stored in order, deduped', (select lead_ids = array[
  '00000000-0000-4000-8000-000000000cb2', '00000000-0000-4000-8000-000000000cb1',
  '00000000-0000-4000-8000-000000000ce2']::uuid[] from public.classrooms where id = '00000000-0000-4000-8000-0000000c1a55'));
select pg_temp.check('logged', exists (select 1 from public.admin_log where action = 'leads'
  and target_name = 'Leads Room' and detail = 'Ria Lead, Rae Lead & Exec Two'));
select pg_temp.check('names read A, B & C',
  private.lead_names(array['00000000-0000-4000-8000-000000000cb2', '00000000-0000-4000-8000-000000000cb1']::uuid[]) = 'Ria Lead & Rae Lead');

-- A lead (trainer, not a member) now sees and runs the room.
select pg_temp.as_user('00000000-0000-4000-8000-000000000cb1');
select pg_temp.check('lead sees it as theirs',
  (select is_owner and can_manage and owner_name = 'Ria Lead, Rae Lead & Exec Two' and join_code is not null
   from public.classroom_detail('00000000-0000-4000-8000-0000000c1a55')));
delete from public.classrooms where id = '00000000-0000-4000-8000-0000000c1a55';
select pg_temp.check('lead cannot delete it', exists (select 1 from public.classroom_detail('00000000-0000-4000-8000-0000000c1a55')));
select pg_temp.check('lead lists it', exists (select 1 from public.my_classrooms()
  where id = '00000000-0000-4000-8000-0000000c1a55' and is_owner));
update public.classrooms set description = 'Run by leads' where id = '00000000-0000-4000-8000-0000000c1a55';
select pg_temp.check('lead edits it', (select description = 'Run by leads' from public.classroom_detail('00000000-0000-4000-8000-0000000c1a55')));
select pg_temp.as_admin();

-- The member sees the leads' names, not as theirs, and the runners in order.
select pg_temp.as_user('00000000-0000-4000-8000-000000000ca2');
select pg_temp.check('member sees lead names',
  (select owner_name = 'Ria Lead, Rae Lead & Exec Two' and not is_owner and not can_manage
   from public.my_classrooms() where id = '00000000-0000-4000-8000-0000000c1a55'));
select pg_temp.check('runners are the leads in order',
  (select array_agg(full_name) = array['Ria Lead', 'Rae Lead', 'Exec Two'] and bool_and(lead)
   from public.classroom_runners('00000000-0000-4000-8000-0000000c1a55')));
select pg_temp.as_admin();

-- Ask teacher reaches the leads and the maker.
insert into public.tests (id, classroom_id, title)
  values ('00000000-0000-4000-8000-0000000c7e57', '00000000-0000-4000-8000-0000000c1a55', 'Leads test');
select pg_temp.check('questions reach leads and maker',
  (select private.flag_recipients('00000000-0000-4000-8000-0000000c7e57', '00000000-0000-4000-8000-000000000ca2')
   @> array['00000000-0000-4000-8000-000000000cb1', '00000000-0000-4000-8000-000000000cb2',
            '00000000-0000-4000-8000-000000000ce2', '00000000-0000-4000-8000-000000000ce1']::uuid[]));

-- A demoted lead keeps seeing the room but can't run it.
update public.profiles set role = 'trainee' where id = '00000000-0000-4000-8000-000000000cb1';
select pg_temp.as_user('00000000-0000-4000-8000-000000000cb1');
select pg_temp.check('demoted lead sees, does not run',
  (select not can_manage from public.classroom_detail('00000000-0000-4000-8000-0000000c1a55')));
select pg_temp.as_admin();

-- Clearing the leads puts the maker back.
select pg_temp.as_user('00000000-0000-4000-8000-000000000ce2');
select public.set_classroom_leads('00000000-0000-4000-8000-0000000c1a55', '{}');
select pg_temp.check('maker back', (select owner_name = 'Lead Maker'
  from public.classroom_detail('00000000-0000-4000-8000-0000000c1a55')));
select pg_temp.as_admin();

rollback;
