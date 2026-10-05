-- ===========================================================================
-- 0379  A SPARE IMPORTED FROM AN MRN HAS THE SOURCE "Defective Spare"
--       (2026-10-05).
--
-- 0376's screen made Source a pick of Service Return / Defective Spare, while
-- an MRN import went on writing "MRN <no> · <engineer>". The user, asked which
-- it should be: "DEFECTIVE SPARE". The screen now sends it; this puts the
-- requests already imported in step. The MRN No stays on each in mrn_ref, so
-- nothing is lost.
--
-- A CLOSED request is otherwise unchangeable, so the ONE guard that refuses it
-- is lifted by name for this statement and put straight back.
-- ===========================================================================
do $$
declare n integer;
begin
  if to_regclass('public.recycle_requests') is null then return; end if;
  alter table public.recycle_requests disable trigger recycle_requests_guard;
  update public.recycle_requests
     set received_from = 'Defective Spare'
   where coalesce(mrn_ref, '') <> ''
     and received_from is distinct from 'Defective Spare';
  get diagnostics n = row_count;
  alter table public.recycle_requests enable trigger recycle_requests_guard;
  raise notice '0379: % request(s) imported from an MRN now read Source "Defective Spare"', n;
end $$;
