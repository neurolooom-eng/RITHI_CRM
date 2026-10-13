-- ===========================================================================
-- 0426 -- FILES KEPT WITH A STOCK TRANSFER OR A MATERIAL RETURN (the user,
-- 2026-10-13: "Add File Upload Option in Stock Transfer and Material Return").
--
-- Settled with the user the same day: any number of files per record
-- (the signed MTN or MRN, a photo, a covering letter), each listed with who
-- attached it and when; attached on the New Transfer / New MRN form AND
-- afterwards on the saved record, because the signed copy usually comes back
-- after the stock has moved; optional -- a record saves without one.
--
-- A TABLE OF ITS OWN, not a column on the record, for two reasons:
--   * a material return is one ROW PER PART sharing a Reference (uid), so a
--     file on the return is a file on the GROUP, which no row can carry once;
--   * both records are fixed once written -- stock_transfer_header_fixed and
--     material_returns_immutable refuse edits -- and those guards are right.
--     A file attached later is a new fact about the record, not a change to
--     it, so it is a new row here and neither guard is loosened.
--
-- APPEND-ONLY. No update or delete policy: a file somebody relied on stays
-- listed. The file itself lives in Drive, uploaded through the bridge (the
-- "Stock Transfers" / "Material Returns" folders, else the drive root).
--
-- WHO MAY SEE A FILE: whoever may see its record -- the read policy asks the
-- record's own table, under the reader's own row-level security.
-- WHO MAY ATTACH ONE: whoever may see the record AND may raise that kind of
-- record -- stock.transfer for a transfer; for a return, stock.return on
-- their own return, or stock.return.others / an administrator on anybody's
-- (mr_insert's own audience, restated).
-- WHO ATTACHED IT AND WHEN are stamped by the database; a caller's values are
-- discarded (the 0113/0114 rule).
-- ===========================================================================

create table if not exists public.stock_record_files (
  id               bigserial primary key,
  kind             text not null check (kind in ('stock_transfer', 'material_return')),
  ref              text not null check (btrim(ref) <> ''),
  file_name        text not null check (btrim(file_name) <> ''),
  url              text not null check (btrim(url) <> ''),
  attached_by      uuid,
  attached_by_name text not null default '',
  attached_at      timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index if not exists stock_record_files_ref_idx on public.stock_record_files (kind, ref);

comment on table public.stock_record_files is
  'Files kept with a stock transfer (ref = stock_transfers.uid) or a material return (ref = material_returns.uid), any number each, append-only (0426).';

alter table public.stock_record_files enable row level security;

create or replace function public.stock_record_files_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.attached_by      := auth.uid();
  new.attached_by_name := coalesce((select nullif(btrim(full_name), '') from public.profiles where id = auth.uid()),
                                   auth.email(), '');
  new.attached_at      := now();
  new.created_at       := now();
  return new;
end $$;
revoke execute on function public.stock_record_files_stamp() from public, anon, authenticated;

drop trigger if exists stock_record_files_stamp on public.stock_record_files;
create trigger stock_record_files_stamp before insert on public.stock_record_files
  for each row execute function public.stock_record_files_stamp();

drop policy if exists srf_read on public.stock_record_files;
create policy srf_read on public.stock_record_files for select using (
  (kind = 'stock_transfer'  and exists (select 1 from public.stock_transfers  t where t.uid = stock_record_files.ref))
  or (kind = 'material_return' and exists (select 1 from public.material_returns m where m.uid = stock_record_files.ref))
);

drop policy if exists srf_insert on public.stock_record_files;
create policy srf_insert on public.stock_record_files for insert with check (
  (kind = 'stock_transfer'
     and (select public.has_perm('stock.transfer'))
     and exists (select 1 from public.stock_transfers t where t.uid = stock_record_files.ref))
  or (kind = 'material_return'
     and (select public.has_perm('stock.return'))
     and exists (select 1 from public.material_returns m
                  where m.uid = stock_record_files.ref
                    and ((select public.is_admin())
                         or (select public.has_perm('stock.return.others'))
                         or lower(coalesce(m.engineer_email, '')) = lower(coalesce((select auth.email()), '')))))
);

-- SAID, NOT LEFT TO DEFAULTS. Supabase's default privileges hand every new
-- table to anon and authenticated in full; with no policy an UPDATE or DELETE
-- would merely match nothing and report success. Revoked, they are refused.
revoke all on public.stock_record_files from anon, authenticated;
grant select, insert on public.stock_record_files to authenticated;
revoke all on sequence public.stock_record_files_id_seq from anon;
grant usage on sequence public.stock_record_files_id_seq to authenticated;

-- The five system columns every table carries (0244), attached now so the
-- live project need not wait for sys_columns.sql to be re-run.
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.stock_record_files'::regclass);
  end if;
end $$;
