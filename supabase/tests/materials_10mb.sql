-- Materials upload cap (migration 0106). One transaction, rolled back; raises on the first failure.
begin;

create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
end $$;

-- The bucket accepts up to 10 MB per file, matching MAX_MATERIAL_BYTES in src/lib/materials.ts.
select pg_temp.check('materials bucket limit is 10 MB',
  (select file_size_limit from storage.buckets where id = 'materials') = 10485760);

select 'materials_10mb: all checks passed' as result;
rollback;
