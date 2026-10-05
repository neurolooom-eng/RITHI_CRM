-- ===========================================================================
-- 0378  PRE-DELIVERY QUALITY CHECK NUMBER -- PDQC/YY/NNNN (2026-10-05).
--
-- The user, asked whether a check should carry a number such as
-- PDQC/26/0001: "Yes". Numbered like RCY/YY/NNNN (0355): the two-digit year
-- of when the check is recorded (India time), restarting at 0001 each year,
-- stamped by the database on insert and never changed after. Checks already
-- recorded are numbered once, in the order they were recorded.
-- ===========================================================================

alter table public.pdqc_records add column if not exists pdqc_no text;

create or replace function public.pdqc_next_no(p_at timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare
  yy text := to_char(p_at at time zone 'Asia/Kolkata', 'YY');
  n  integer;
begin
  perform pg_advisory_xact_lock(hashtext('pdqc_no:' || yy));
  select coalesce(max(nullif(split_part(pdqc_no, '/', 3), '')::int), 0) into n
    from public.pdqc_records where pdqc_no like 'PDQC/' || yy || '/%';
  return 'PDQC/' || yy || '/' || lpad((n + 1)::text, 4, '0');
end $$;
revoke execute on function public.pdqc_next_no(timestamptz) from public, anon, authenticated;

-- Number what is already there, oldest first (a no-op once every row has one).
do $$
declare r record;
begin
  for r in select id, created_at from public.pdqc_records where pdqc_no is null order by created_at, id loop
    update public.pdqc_records set pdqc_no = public.pdqc_next_no(r.created_at) where id = r.id;
  end loop;
end $$;

create unique index if not exists pdqc_records_pdqc_no on public.pdqc_records (pdqc_no);

-- The number is the database's: given on insert, kept on every update.
create or replace function public.pdqc_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.pdqc_no := public.pdqc_next_no(now());
  else
    new.pdqc_no := coalesce(old.pdqc_no, new.pdqc_no);
  end if;
  return new;
end $$;
revoke execute on function public.pdqc_number() from public, anon, authenticated;

drop trigger if exists zy_pdqc_number on public.pdqc_records;
create trigger zy_pdqc_number before insert or update on public.pdqc_records
  for each row execute function public.pdqc_number();

alter table public.pdqc_records alter column pdqc_no set not null;
