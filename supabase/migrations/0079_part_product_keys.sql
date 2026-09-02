-- ===========================================================================
-- Natural keys for Part Master and Product Master.
--
-- Neither had one, so re-running an upload ADDED every row again — 1,324 parts
-- and 19,259 machines, silently, with the damage only visible later when every
-- picker shows everything twice. Parties got this in 0076; these are the other
-- two registers a cutover loads more than once.
--
--   parts     — the part CODE. One duplicate in the real 1,324-row export
--               ("YR134500"), which the upload collapses to the last of them.
--   products  — a machine is its MODEL plus its SERIAL, not the serial alone:
--               in the real 20,999-row export 3,794 serials repeat (there are
--               eleven machines called "219"), but model + serial is distinct
--               on 19,253 of 19,259.
--
-- Both are STORED generated columns rather than expression indexes, because
-- `on conflict` cannot infer an expression index (0071, 0074, 0076, 0077 — this
-- is the fifth time, hence the check in `npm run check:uploads`).
--
-- GUARDED: a project that already holds duplicates from an earlier load cannot
-- build the index, and this says so rather than failing the whole bundle.
-- ===========================================================================

alter table public.parts
  add column if not exists code_key text generated always as (lower(btrim(code))) stored;

do $$
begin
  if exists (select 1 from public.parts where btrim(coalesce(code, '')) <> ''
              group by lower(btrim(code)) having count(*) > 1) then
    raise notice 'parts already holds duplicate codes — de-duplicate, then re-run this file to build parts_code_key_uniq.';
  else
    create unique index if not exists parts_code_key_uniq on public.parts (code_key) where code_key <> '';
  end if;
end $$;

alter table public.products
  add column if not exists machine_key text generated always as
    (lower(btrim(coalesce(item_name, ''))) || '|' || lower(btrim(coalesce(serial_number, '')))) stored;

do $$
begin
  if exists (select 1 from public.products where btrim(coalesce(serial_number, '')) <> ''
              group by lower(btrim(coalesce(item_name, ''))) || '|' || lower(btrim(coalesce(serial_number, '')))
              having count(*) > 1) then
    raise notice 'products already holds duplicate model+serial — de-duplicate, then re-run this file to build products_machine_key_uniq.';
  else
    create unique index if not exists products_machine_key_uniq
      on public.products (machine_key) where machine_key <> '|';
  end if;
end $$;

create index if not exists parts_code_key_idx    on public.parts (code_key);
create index if not exists products_machine_idx  on public.products (machine_key);
