-- Official launch (migration 0064). One transaction, rolled back; raises on the first failure.
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
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
end $$;
create function pg_temp.expect(label text, stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL %: expected %, got success', label, state using errcode = 'XX001';
exception when others then
  if sqlstate <> state then raise exception 'FAIL %: expected %, got % (%)', label, state, sqlstate, sqlerrm; end if;
end $$;

-- Fixtures: 1 executive, 2 trainer owning room 1, 3 member of room 1, 5 outsider.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role) values
  (pg_temp.u(1), 'launch.exec@example.com', '{"full_name":"Launch Exec"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(2), 'launch.trainer@example.com', '{"full_name":"Launch Trainer"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(3), 'launch.member@example.com', '{"full_name":"Launch Member"}', now(), 'authenticated', 'authenticated'),
  (pg_temp.u(5), 'launch.outsider@example.com', '{"full_name":"Launch Outsider"}', now(), 'authenticated', 'authenticated');
update public.profiles set role = 'executive' where id = pg_temp.u(1);
update public.profiles set role = 'trainer' where id = pg_temp.u(2);
insert into public.classrooms (id, name, owner_id, category) values (pg_temp.r(1), 'Launch Room', pg_temp.u(2), 'practical');
insert into public.classroom_members (classroom_id, user_id) values (pg_temp.r(1), pg_temp.u(3));

-- Category and bucket limit.
select pg_temp.expect('bad category rejected',
  format($$insert into public.classrooms (name, owner_id, category) values ('Bad', %L, 'nope')$$, pg_temp.u(2)), '23514');
select pg_temp.check('bucket limit is 50 MB',
  (select file_size_limit from storage.buckets where id = 'materials') = 52428800);

-- Materials: section, 50 MB, placeholder rows.
select pg_temp.as_user(pg_temp.u(2));
insert into public.materials (classroom_id, title, note, section) values (pg_temp.r(1), 'Textbook X', 'Link coming soon', 'Textbooks');
insert into public.materials (classroom_id, title, url, section) values (pg_temp.r(1), 'Site', 'https://example.com', 'Videos');
select pg_temp.check('placeholder with no url or path allowed',
  exists (select 1 from public.materials where title = 'Textbook X' and url is null and path is null));
select pg_temp.expect('section over 80 chars rejected',
  format($$insert into public.materials (classroom_id, title, section) values (%L, 'T', %L)$$, pg_temp.r(1), repeat('x', 81)), '23514');
select pg_temp.expect('empty section rejected',
  format($$insert into public.materials (classroom_id, title, section) values (%L, 'T', '')$$, pg_temp.r(1)), '23514');
select pg_temp.expect('url and path together rejected',
  format($$insert into public.materials (classroom_id, title, url, path) values (%L, 'T', 'https://example.com', %L)$$,
    pg_temp.r(1), pg_temp.r(1)::text || '/a.pdf'), '23514');
select pg_temp.expect('51 MB rejected',
  format($$insert into public.materials (classroom_id, title, path, size_bytes) values (%L, 'T', %L, 53477376)$$,
    pg_temp.r(1), pg_temp.r(1)::text || '/big.pdf'), '23514');
insert into public.materials (classroom_id, title, path, size_bytes)
  values (pg_temp.r(1), 'Fits', pg_temp.r(1)::text || '/fits.pdf', 51380224);
select pg_temp.check('49 MB accepted', exists (select 1 from public.materials where title = 'Fits'));

-- Skills.
insert into public.skills (classroom_id, name, steps) values
  (pg_temp.r(1), 'Skill A', '[{"text":"Wash hands","points":2}]');
select pg_temp.check('manager inserted a skill', exists (select 1 from public.skills where name = 'Skill A'));
select pg_temp.expect('steps must be an array',
  format($$insert into public.skills (classroom_id, name, steps) values (%L, 'B', '{}')$$, pg_temp.r(1)), '23514');

select pg_temp.as_user(pg_temp.u(3));
select pg_temp.check('member reads skills', exists (select 1 from public.skills where name = 'Skill A'));
select pg_temp.expect('member cannot add a skill',
  format($$insert into public.skills (classroom_id, name) values (%L, 'Sneaky')$$, pg_temp.r(1)), '42501');
select pg_temp.expect('trainee cannot call storage_usage', $$select * from public.storage_usage()$$, '42501');

select pg_temp.as_user(pg_temp.u(5));
select pg_temp.check('non-member cannot select skills', not exists (select 1 from public.skills));
select pg_temp.expect('non-member cannot add a skill',
  format($$insert into public.skills (classroom_id, name) values (%L, 'Sneaky')$$, pg_temp.r(1)), '42501');

select pg_temp.as_user(pg_temp.u(1));
select pg_temp.check('executive can call storage_usage', (select count(*) from public.storage_usage()) >= 0);

select pg_temp.as_admin();
select 'official_launch: all checks passed' as result;
rollback;
