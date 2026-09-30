-- ===========================================================================
-- 0283 — A UNIT IS NOT DISPATCHED THROUGH THE STATUS PICKER WITHOUT THE DISPATCH RIGHT
--
-- Findings 57-67 (docs/PERMISSIONS_REVIEW.md), the user's decisions of
-- 2026-09-30: "63, 64: It should show the Individual View's Control Action and
-- its Check Box" -- each screen gets keys of its own, today's grants copied
-- across (0284) so nobody gains or loses anything on the day it ships -- and
-- "67: Break it down", with the old key kept as the PARENT of the new ones, so
-- a role holding it keeps everything until an administrator unticks it.
-- The parent rule itself is in has_perm() (0272, public.perm_parents).
--
-- This file: finding 59. The guard asked indoor.dispatch only when the
-- dispatch date, reference or dispatcher changed, so the Status picker could
-- set Dispatched or Closed with indoor.work alone. It now asks it for that
-- status change too.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.indoor_jobs_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- An administrator is not gated by the stage rights; every other rule below
  -- still applies to them, because the ones that follow are about the RECORD
  -- being coherent rather than about who is allowed to act.
  if not public.is_admin() then
    if tg_op = 'UPDATE' then
      if (new.qc_result is distinct from old.qc_result
       or new.qc_by     is distinct from old.qc_by
       or new.qc_at     is distinct from old.qc_at
       or new.qc_notes  is distinct from old.qc_notes)
         and not public.has_perm('indoor.qc') then
        raise exception 'indoor.qc is required to record a quality check'
          using errcode = '42501';
      end if;

      if (new.dispatched_at is distinct from old.dispatched_at
       or new.dispatch_ref  is distinct from old.dispatch_ref
       or new.dispatched_by is distinct from old.dispatched_by)
         and not public.has_perm('indoor.dispatch') then
        raise exception 'indoor.dispatch is required to dispatch a unit'
          using errcode = '42501';
      end if;

      if new.status in ('Dispatched', 'Closed') and new.status is distinct from old.status
         and not public.has_perm('indoor.dispatch') then
        raise exception 'indoor.dispatch is required to mark a unit %', new.status
          using errcode = '42501';
      end if;
    end if;

    -- CONDEMNING IS ITS OWN RIGHT, on insert as well as update. Scrapping
    -- customer property in particular cannot be an engineer's own decision
    -- (open question 8 in the plan, settled here the safe way: a separate
    -- permission granted to nobody by default).
    if (tg_op = 'INSERT' and (btrim(new.condemned_reason) <> '' or new.status = 'Condemned'))
    or (tg_op = 'UPDATE' and (new.condemned_reason is distinct from old.condemned_reason
                           or new.condemned_at     is distinct from old.condemned_at
                           or (new.status = 'Condemned' and old.status <> 'Condemned'))) then
      if not public.has_perm('indoor.condemn') then
        raise exception 'indoor.condemn is required to condemn a unit'
          using errcode = '42501';
      end if;
      if new.condemned_at is null then new.condemned_at := now(); end if;
      if new.condemned_by is null then new.condemned_by := auth.uid(); end if;
    end if;
  end if;

  -- A MACHINE CANNOT LEAVE WITH A FAILED CHECK. 4.5.6 puts the quality check
  -- before the return, so a failed one sends it back to Under repair rather
  -- than being noted and stepped over.
  if new.status in ('Ready', 'Dispatched', 'Closed') and new.qc_result = 'Fail' then
    raise exception 'the quality check failed -- the unit returns to Under repair, it does not leave'
      using errcode = '23514';
  end if;

  -- AND A REPAIR OR REWORK CANNOT LEAVE WITH NO CHECK AT ALL. The other four
  -- activities are exempt on purpose: a demo going out and a unit stripped for
  -- parts have no repair to verify, and a pre-delivery inspection records its
  -- verdict in pdi_result instead.
  if new.status in ('Dispatched', 'Closed')
     and new.activity in ('Repair', 'Rework')
     and new.qc_result is null then
    raise exception 'a % cannot be dispatched before its quality check is recorded (4.5.6)', lower(new.activity)
      using errcode = '23514';
  end if;

  -- A FAILED PRE-DELIVERY INSPECTION DOES NOT SHIP either, and a held one says
  -- why it is being held.
  if new.status in ('Dispatched', 'Closed')
     and new.activity = 'Pre-delivery inspection' and new.pdi_result = 'Fail' then
    raise exception 'a failed pre-delivery inspection does not leave the workshop'
      using errcode = '23514';
  end if;

  -- Timestamps that follow from an action are stamped, not typed: a cleaning
  -- date somebody can type is a cleaning date somebody can back-date.
  if new.status <> 'Received' and old is distinct from null then
    if new.cleaned_by is distinct from coalesce(old.cleaned_by, new.cleaned_by)
       and new.cleaned_at is null then
      new.cleaned_at := now();
    end if;
  end if;
  if new.qc_result is not null and new.qc_at is null then
    new.qc_at := now();
    if new.qc_by is null then new.qc_by := auth.uid(); end if;
  end if;
  if new.dispatch_ref <> '' and new.dispatched_at is null then
    new.dispatched_at := now();
    if new.dispatched_by is null then new.dispatched_by := auth.uid(); end if;
  end if;

  return new;
end $function$;
