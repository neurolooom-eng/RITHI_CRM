-- ===========================================================================
-- Loading the spare-request history: keep the export's columns, and let the
-- two files arrive in either order.
--
-- The register comes as two exports. The HEADER file is one row per request
-- (its OR number, engineer, call, machine); the LINES file is one row per spare
-- on it, and identifies its parent ONLY by the OR number. So the OR number is
-- what joins them, and `spare_requests.uid` has to be it — nothing else in the
-- lines file could point at a request.
--
-- Two things that file needs:
--
-- 1. `extra` on both tables. The header carries 47 columns the table has no
--    field for (its own row id, and Spare (1..20) / Qty (1..20) — the lines
--    repeated across the row) and the lines carry 29 more (the SO number, POD,
--    Tally reference, the reporting and regional manager). Dropping them on the
--    floor because the table happens to have no column is the quiet loss the
--    rest of the import is careful to avoid.
--
-- 2. A STUB PARENT, exactly as 0036 does for a sale item whose entry has not
--    been loaded. 72 of the 8,675 line rows name an OR number that is not in
--    the header export at all — a real gap in the source, not a loading order
--    problem — and `spare_request_lines_request_uid_fkey` would fail the whole
--    batch on them. A stub lets them load and MARKS ITSELF, so the gap is
--    visible in the register instead of costing 8,603 good rows. If the missing
--    header rows ever arrive, loading them fills the stub in.
-- ===========================================================================

alter table public.spare_requests      add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.spare_request_lines add column if not exists extra jsonb not null default '{}'::jsonb;

comment on column public.spare_requests.extra is
  'Everything the source export carried that has no field of its own, kept as written.';

create or replace function public.spare_request_line_stub_parent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if btrim(coalesce(new.request_uid, '')) = '' then
    return new;                                   -- nothing to point at; the FK will say so
  end if;
  if exists (select 1 from public.spare_requests r where r.uid = new.request_uid) then
    return new;
  end if;
  -- Marked, not silent: a request that exists only because a line referred to it
  -- should be findable and fixable, not indistinguishable from a real one.
  insert into public.spare_requests (uid, or_no, req_type, status, remarks)
  values (new.request_uid, new.request_uid, 'Call Based', 'Imported',
          'Created from an imported spare line — the request header was not in the export.')
  on conflict (uid) do nothing;
  return new;
end $$;

drop trigger if exists spare_request_line_stub_parent on public.spare_request_lines;
create trigger spare_request_line_stub_parent before insert on public.spare_request_lines
  for each row execute function public.spare_request_line_stub_parent();
