-- ===========================================================================
-- 0275 — SPARES BOOKED ON A VISIT, A PART RENAME, AN MRN FOR SOMEBODY ELSE
--
-- Findings 57-67 (docs/PERMISSIONS_REVIEW.md), the user's decisions of
-- 2026-09-30: "63, 64: It should show the Individual View's Control Action and
-- its Check Box" -- each screen gets keys of its own, today's grants copied
-- across (0284) so nobody gains or loses anything on the day it ships -- and
-- "67: Break it down", with the old key kept as the PARENT of the new ones, so
-- a role holding it keeps everything until an administrator unticks it.
-- The parent rule itself is in has_perm() (0272, public.perm_parents).
--
-- This file: cons_write asks visit.spares for a line booked on a visit;
-- rename_part asks masters.edit.rename_part; mr_insert asks
-- stock.return.others to return stock in another engineer's name (it asked
-- can_approve_spares(), which the screen did not -- finding 64).
-- ===========================================================================

drop policy if exists cons_write on public.spare_consumption;
create policy cons_write on public.spare_consumption for insert
      with check (
        case when coalesce(source, 'Report') = 'Reconciliation'
             then public.has_perm('consumption.reconcile')
             else (public.has_perm('visit.spares') or public.has_perm('spare.dispatch'))
        end
      );

drop policy if exists mr_insert on public.material_returns;
create policy mr_insert on public.material_returns for insert
  with check (public.has_perm('stock.return')
              and (public.is_admin() or public.has_perm('stock.return.others')
                   or lower(coalesce(engineer_email, '')) = lower(auth.email())));

CREATE OR REPLACE FUNCTION public.rename_part(p_id bigint, p_code text, p_description text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  old_detail text; old_key text;
  new_code text := btrim(coalesce(p_code, ''));
  new_desc text := btrim(coalesce(p_description, ''));
  new_detail text; moved jsonb := '{}'::jsonb; n bigint;
begin
  if not public.has_perm('masters.edit.rename_part') then
    raise exception 'RBAC: only a role that maintains the masters may rename a part';
  end if;
  if new_code = '' or new_desc = '' then
    raise exception 'A part needs both a code and a description';
  end if;
  if position('|' in new_code) > 0 or position('|' in new_desc) > 0 then
    -- The separator IS the key's structure, so a value containing one would
    -- produce a key nothing can parse back.
    raise exception 'Neither the code nor the description may contain "|"';
  end if;

  select item_detail into old_detail from parts where id = p_id;
  if old_detail is null then raise exception 'No such part'; end if;
  old_key := lower(btrim(old_detail));
  new_detail := new_code || '|' || new_desc;

  if lower(btrim(new_detail)) = old_key then
    return jsonb_build_object('renamed', false, 'reason', 'nothing changed',
                              'from', old_detail, 'to', new_detail);
  end if;
  -- A RENAME, NOT A MERGE (see the header).
  if exists (select 1 from parts where item_detail_key = lower(btrim(new_detail)) and id <> p_id) then
    raise exception 'Another part is already called "%" — a rename cannot merge two parts', new_detail;
  end if;

  -- FILE THE TICKET, so the consumption guard can tell this rename from a line
  -- being re-pointed. Keyed on the transaction, so it is gone when this one
  -- ends — a rollback takes it, and a commit is followed by the delete below.
  -- Any ticket left by a crashed transaction names a txid that will not recur.
  insert into public.part_rename_ticket (txid, old_key, new_detail)
  values (txid_current(), old_key, new_detail)
  on conflict (txid) do update set old_key = excluded.old_key,
                                   new_detail = excluded.new_detail, at = now();

  -- THE NINE, then the part itself. Every one is matched case- and
  -- space-insensitively on the SAME key the register is matched on, so a row
  -- stored with different spacing moves with the rest instead of being left
  -- behind as the only survivor of the old name.
  update spare_consumption         set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Spare consumption', n);
  update spare_consumption_history set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Consumption (history)', n);
  update spare_issue_history       set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Issued to engineers', n);
  update handstock_opening         set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Opening hand stock', n);
  update spare_request_lines       set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Spare request lines', n);
  update spare_dispatch_lines      set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Dispatch lines', n);
  update stock_transfer_lines      set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Stock transfer lines', n);
  update material_returns          set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Material returns', n);
  update indoor_job_parts          set part_code = new_detail where lower(btrim(part_code)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Indoor job parts', n);

  update parts set code = new_code, description = new_desc, item_detail = new_detail
   where id = p_id;

  -- THE CAPABILITY IS SPENT. Not strictly required — the ticket names this
  -- transaction and no later one can reuse the id — but a capability left lying
  -- about is one somebody eventually reasons from.
  delete from public.part_rename_ticket where txid = txid_current();

  return jsonb_build_object('renamed', true, 'from', old_detail, 'to', new_detail, 'moved', moved);
end $function$;
