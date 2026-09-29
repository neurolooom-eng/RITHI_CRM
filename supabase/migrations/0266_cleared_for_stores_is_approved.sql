-- ===========================================================================
-- "CLEARED FOR STORES PROCESSING" IS AN APPROVAL (finding 20, follow-up).
--
-- The user, 2026-09-30, after 0256 went live: "'Cleared for Stores
-- Processing' - These values should be considered as Approved."
--
-- 0256 made an approval stage pass only on the WORDS Approved or
-- Auto-Approved, and held every other value at that approver. The register
-- carries a third way of saying yes, so lines bearing it were held that
-- should have gone on. This adds it to the yes words, whole phrase only —
-- any case, surrounding space ignored, one or more spaces between the words —
-- so a longer sentence that merely contains it ("Not cleared for stores
-- processing") still waits. The stored value is NOT rewritten: it is the
-- approver's record and stays as they wrote it.
--
-- THE CLIENT COPY is `APPROVED_RE` in `src/lib/spareflow.ts`; `check:ui`
-- compares it with this pattern character for character. Same six arguments
-- as 0210/0256, for the reason 0210 gives.
-- ===========================================================================

create or replace function public.spare_line_stage(
  rm text, commercial text, nsm text, stores text, received timestamptz, item_status text
) returns text language sql immutable as $$
  select case
    when rm ~* 'reject' or commercial ~* 'reject' or nsm ~* 'reject' then 'Rejected'
    when received is not null                                        then 'Received'
    when stores ~* 'drop'                                            then 'Dropped'
    when stores ~* 'dispatch'                                        then 'Dispatched'
    when rm         !~* '^\s*((auto[\s-]*)?approved|cleared\s+for\s+stores\s+processing)\s*$' then 'RM Approval'
    when commercial !~* '^\s*((auto[\s-]*)?approved|cleared\s+for\s+stores\s+processing)\s*$' then 'Commercial'
    when nsm        !~* '^\s*((auto[\s-]*)?approved|cleared\s+for\s+stores\s+processing)\s*$' then 'NSM'
    else 'Stores'
  end;
$$;

-- ---------------------------------------------------------------------------
-- The stored stage follows, exactly as in 0256: only OPEN lines whose cached
-- stage changes, no approval column written, and each moved line's request
-- rolled up by the per-row trigger. This time lines move FORWARD — a line
-- held at RM Approval because its RM column says "Cleared for Stores
-- Processing" goes on to the next stage that still needs a decision, or to
-- Stores. `supabase/apply/_approval_words.sql` lists what is still held.
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  with moved as (
    update public.spare_request_lines l
       set stage  = x.new_stage,
           status = x.new_stage
      from (select l2.id,
                   public.spare_line_stage(
                     coalesce(l2.rm_approval, 'Pending'),
                     coalesce(l2.commercial_approval, 'Pending'),
                     coalesce(l2.nsm_approval, 'Pending'),
                     coalesce(l2.stores_status, 'Pending'),
                     l2.received_at, r.item_status) as new_stage
              from public.spare_request_lines l2
              join public.spare_requests r on r.uid = l2.request_uid
             where l2.received_at is null
               and coalesce(l2.stores_status, '') !~* 'dispatch|drop') x
     where l.id = x.id
       and l.stage is distinct from x.new_stage
    returning l.request_uid
  )
  select count(*) into n from moved;
  raise notice '0266: % open line(s) restaged', n;
end $$;
