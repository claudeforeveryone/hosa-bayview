-- Weekly attendance tracker (migration 0103). One transaction, rolled back; raises on the first failure.
-- Fixtures are throwaway users with ids 00000000-0000-4000-8000-* and invented names only.
begin;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.r(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8100-' || lpad(to_hex(n), 12, '0'))::uuid
$$;

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end $$;

create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
end $$;

-- The statement must fail with this SQLSTATE.
create function pg_temp.expect(label text, stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL %: expected %, got success', label, state using errcode = 'XX001';
exception when others then
  if sqlstate <> state then raise exception 'FAIL %: expected %, got % (%)', label, state, sqlstate, sqlerrm; end if;
end $$;

-- A. Fixtures ---------------------------------------------------------------------------------------------------
-- 1 executive; 2 trainer of room 1; 3 member of room 1; 4 trainer of room 2; 5 banned trainer of room 3.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  (pg_temp.u(1), 'roster.exec@example.com', '{"full_name":"Roster Exec"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(2), 'roster.trainer@example.com', '{"full_name":"Roster Trainer"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(3), 'roster.member@example.com', '{"full_name":"Quill Testerson"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(4), 'roster.other@example.com', '{"full_name":"Roster Other"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(5), 'roster.banned@example.com', '{"full_name":"Roster Banned"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(6), 'roster.twin1@example.com', '{"full_name":"Twin Fixture"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(7), 'roster.twin2@example.com', '{"full_name":"Twin Fixture"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'executive' where id = pg_temp.u(1);
update public.profiles set role = 'trainer' where id in (pg_temp.u(2), pg_temp.u(4), pg_temp.u(5));
insert into public.classrooms (id, name, owner_id) values
  (pg_temp.r(1), 'Roster Room One', pg_temp.u(2)),
  (pg_temp.r(2), 'Roster Room Two', pg_temp.u(4)),
  (pg_temp.r(3), 'Roster Room Three', pg_temp.u(5));
insert into public.classroom_members (classroom_id, user_id) values (pg_temp.r(1), pg_temp.u(3));
update public.profiles set banned_until = now() + interval '1 day', ban_reason = 'Fixture ban' where id = pg_temp.u(5);

-- B. Short codes ------------------------------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(1));
update public.classrooms set short_code = 'RO' where id = pg_temp.r(1);
select pg_temp.check('executive sets a short code', (select short_code from public.classrooms where id = pg_temp.r(1)) = 'RO');
select pg_temp.expect('lowercase code refused',
  format($$update public.classrooms set short_code = 'ro' where id = %L$$, pg_temp.r(2)), '23514');
select pg_temp.expect('five-letter code refused',
  format($$update public.classrooms set short_code = 'ABCDE' where id = %L$$, pg_temp.r(2)), '23514');
select pg_temp.expect('duplicate code refused',
  format($$update public.classrooms set short_code = 'RO' where id = %L$$, pg_temp.r(2)), '23505');

select pg_temp.as_user(pg_temp.u(2));
select pg_temp.expect('trainer cannot change own class code',
  format($$update public.classrooms set short_code = 'RX' where id = %L$$, pg_temp.r(1)), '42501');
update public.classrooms set description = 'Still editable' where id = pg_temp.r(1);
select pg_temp.check('trainer still edits other class fields',
  (select description from public.classrooms where id = pg_temp.r(1)) = 'Still editable');

-- C. Weeks ------------------------------------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(1));
insert into public.roster_weeks (meet_on) values ('2031-01-09'), ('2031-01-16');
-- Fixed ids for the checks below (clients can't choose ids).
select pg_temp.as_admin();
update public.roster_weeks set id = pg_temp.r(11) where meet_on = '2031-01-09';
update public.roster_weeks set id = pg_temp.r(12) where meet_on = '2031-01-16';
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.expect('duplicate week refused',
  $$insert into public.roster_weeks (meet_on) values ('2031-01-09')$$, '23505');

select pg_temp.as_user(pg_temp.u(2));
select pg_temp.check('trainer reads weeks', (select count(*) from public.roster_weeks where meet_on >= '2031-01-01') = 2);
select pg_temp.expect('trainer cannot add a week',
  $$insert into public.roster_weeks (meet_on) values ('2031-01-23')$$, '42501');

select pg_temp.as_user(pg_temp.u(3));
select pg_temp.check('member reads no weeks', (select count(*) from public.roster_weeks) = 0);

-- D. Roster rows ------------------------------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(2));
insert into public.roster_members (classroom_id, full_name, grade, position) values
  (pg_temp.r(1), '  quill testerson ', 10, 1),
  (pg_temp.r(1), 'Twin Fixture', 11, 2),
  (pg_temp.r(1), 'Nobody Matches', null, 3);
select pg_temp.as_admin();
update public.roster_members set id = pg_temp.r(21) where full_name = 'quill testerson';
update public.roster_members set id = pg_temp.r(22) where full_name = 'Twin Fixture';
update public.roster_members set id = pg_temp.r(23) where full_name = 'Nobody Matches';
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.check('name trimmed', (select full_name from public.roster_members where id = pg_temp.r(21)) = 'quill testerson');
select pg_temp.check('single match links the account',
  (select user_id from public.roster_members where id = pg_temp.r(21)) = pg_temp.u(3));
select pg_temp.check('two profiles with the name: not linked',
  (select user_id from public.roster_members where id = pg_temp.r(22)) is null);
select pg_temp.check('no match: not linked',
  (select user_id from public.roster_members where id = pg_temp.r(23)) is null);
select pg_temp.expect('same name twice in a class refused',
  format($$insert into public.roster_members (classroom_id, full_name) values (%L, 'QUILL TESTERSON')$$, pg_temp.r(1)), '23505');
select pg_temp.expect('grade 8 refused',
  format($$insert into public.roster_members (classroom_id, full_name, grade) values (%L, 'Grade Eight', 8)$$, pg_temp.r(1)), '23514');
select pg_temp.expect('empty name refused',
  format($$insert into public.roster_members (classroom_id, full_name) values (%L, '')$$, pg_temp.r(1)), '23514');
select pg_temp.expect('client cannot set user_id',
  format($$insert into public.roster_members (classroom_id, full_name, user_id) values (%L, 'Sneaky Link', %L)$$,
    pg_temp.r(1), pg_temp.u(4)), '42501');
select pg_temp.expect('trainer cannot add to another class',
  format($$insert into public.roster_members (classroom_id, full_name) values (%L, 'Wrong Room')$$, pg_temp.r(2)), '42501');

select pg_temp.as_user(pg_temp.u(4));
select pg_temp.check('other trainer reads none of room 1', (select count(*) from public.roster_members) = 0);
insert into public.roster_members (classroom_id, full_name) values (pg_temp.r(2), 'Room Two Person');
select pg_temp.as_admin();
update public.roster_members set id = pg_temp.r(24) where full_name = 'Room Two Person';

select pg_temp.as_user(pg_temp.u(3));
select pg_temp.check('member reads no roster', (select count(*) from public.roster_members) = 0);

select pg_temp.as_user(pg_temp.u(1));
select pg_temp.check('executive reads every class', (select count(*) from public.roster_members
  where classroom_id in (pg_temp.r(1), pg_temp.r(2))) = 4);

-- E. Marks ------------------------------------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(2));
insert into public.roster_marks (member_id, week_id) values (pg_temp.r(21), pg_temp.r(11));
select pg_temp.check('mark defaults to present and stamps the marker', exists (
  select 1 from public.roster_marks where member_id = pg_temp.r(21) and week_id = pg_temp.r(11)
    and present and marked_by = pg_temp.u(2)));
insert into public.roster_marks (member_id, week_id, present) values (pg_temp.r(21), pg_temp.r(11), false)
  -- Same shape as a PostgREST upsert: every sent column, keys included, is in the SET list.
  on conflict (member_id, week_id) do update
  set member_id = excluded.member_id, week_id = excluded.week_id, present = excluded.present;
select pg_temp.check('upsert unticks', exists (
  select 1 from public.roster_marks where member_id = pg_temp.r(21) and week_id = pg_temp.r(11) and not present));
select pg_temp.expect('cannot move a mark into another class',
  format($update public.roster_marks set member_id = %L where member_id = %L$, pg_temp.r(24), pg_temp.r(21)), '42501');
select pg_temp.expect('trainer cannot mark another class',
  format($$insert into public.roster_marks (member_id, week_id) values (%L, %L)$$, pg_temp.r(24), pg_temp.r(11)), '42501');
select pg_temp.expect('client cannot set marked_by',
  format($$insert into public.roster_marks (member_id, week_id, marked_by) values (%L, %L, %L)$$,
    pg_temp.r(22), pg_temp.r(11), pg_temp.u(1)), '42501');

select pg_temp.as_user(pg_temp.u(1));
update public.roster_marks set present = true where member_id = pg_temp.r(21) and week_id = pg_temp.r(11);
select pg_temp.check('executive re-ticks; marker updated', exists (
  select 1 from public.roster_marks where member_id = pg_temp.r(21) and present and marked_by = pg_temp.u(1)));
insert into public.roster_marks (member_id, week_id) values (pg_temp.r(24), pg_temp.r(12));

select pg_temp.as_user(pg_temp.u(4));
select pg_temp.check('other trainer sees only own marks', (select count(*) from public.roster_marks) = 1);
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.check('member reads no marks', (select count(*) from public.roster_marks) = 0);

-- F. Banned and anonymous ---------------------------------------------------------------------------------------
select pg_temp.as_admin();
insert into public.roster_members (id, classroom_id, full_name) values (pg_temp.r(25), pg_temp.r(3), 'Room Three Person');
select pg_temp.as_user(pg_temp.u(5));
select pg_temp.check('banned trainer reads nothing', (select count(*) from public.roster_members) = 0);
select pg_temp.expect('banned trainer cannot add',
  format($$insert into public.roster_members (classroom_id, full_name) values (%L, 'Banned Add')$$, pg_temp.r(3)), '42501');
select pg_temp.expect('banned trainer cannot mark',
  format($$insert into public.roster_marks (member_id, week_id) values (%L, %L)$$, pg_temp.r(25), pg_temp.r(11)), '42501');

select pg_temp.as_anon();
select pg_temp.expect('anon cannot read roster', $$select 1 from public.roster_members$$, '42501');
select pg_temp.expect('anon cannot read weeks', $$select 1 from public.roster_weeks$$, '42501');
select pg_temp.expect('anon cannot read marks', $$select 1 from public.roster_marks$$, '42501');

-- G. Cascades ---------------------------------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.u(2));
delete from public.roster_members where id = pg_temp.r(21);
select pg_temp.as_admin();
select pg_temp.check('removing a name removes its marks',
  not exists (select 1 from public.roster_marks where member_id = pg_temp.r(21)));
delete from public.roster_weeks where id = pg_temp.r(12);
select pg_temp.check('removing a week removes its marks',
  not exists (select 1 from public.roster_marks where week_id = pg_temp.r(12)));

select 'attendance_roster: all checks passed' as result;
rollback;
