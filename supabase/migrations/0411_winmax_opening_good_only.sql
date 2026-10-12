-- ===========================================================================
-- 0411 -- THE WINMAX OPENING IS THE GOOD BALANCE ONLY (the user, 2026-10-12:
-- "Only the Good balance should be taken as WinMax opening Balance, but the
-- Defective Balance is taken as Opening Balance -- For Example - MP-010 --
-- SUNIL KUMAR.K.V - Opening is 170 matches with the Defective QTY from Winmax.
-- Fix it").
--
-- The WinMax upload ("Opening Stock -- the WinMax export") added the Defective
-- Balance to the Good Balance (D-161). MP-010 / SUNIL KUMAR.K.V: Good Balance
-- empty, Defective Balance 170, opening 170. The upload now takes the Good
-- Balance alone; this corrects the rows already loaded.
--
-- Measured on the live project first (_winmax_opening_good_vs_defective.sql):
-- 1,186 WinMax HS rows, 7,816 units; 1,035 carry a Defective Balance, 6,727
-- units; 815 have no Good Balance at all; on every row qty = good + defective,
-- so the good balance is qty - defective exactly. Taking it out leaves 53
-- lines below zero (-91 in all; MP-010 / SUNIL 168 -> -2) -- what the
-- engineer consumed beyond his good stock, which is the Spare Coordinator's
-- to settle with a Hand Stock adjustment.
--
--   * A row whose Good Balance is nothing (qty = defective) is REMOVED: the
--     corrected upload holds such a row back, so it is not opening stock. The
--     row audit (record_audit) keeps its image.
--   * Any other row keeps qty - defective, and records what was taken out as
--     data._0411_defective_removed.
--
-- ONCE, and safely re-runnable: a row already corrected carries the marker,
-- and a row written after this file (the corrected upload, which never adds
-- the defective) is left alone by the cutoff, so nothing is subtracted twice.
-- A migration writes with no signed-in user, which stock_import_allowed()
-- (0339) trusts with history, so the cut is not refused as a stock move.
-- ===========================================================================

do $once$
declare
  v_cutoff timestamptz := '2026-10-12T05:50:00Z';
  n_upd integer; n_del integer; u_upd numeric; u_del numeric;
begin
  create temp table _w0411 on commit drop as
  select o.id, o.qty,
         coalesce(nullif(replace(btrim(coalesce(o.data ->> 'Defective Balance', '')), ',', ''), '')::numeric, 0) as defective
    from public.handstock_opening o
   where o.source_key = 'winmax hs'
     and not (o.data ? '_0411_defective_removed')
     and o.updated_at <= v_cutoff;
  delete from _w0411 where defective <= 0;

  select count(*), coalesce(sum(defective), 0) into n_del, u_del from _w0411 where qty - defective <= 0;
  delete from public.handstock_opening o using _w0411 w
   where o.id = w.id and w.qty - w.defective <= 0;

  select count(*), coalesce(sum(defective), 0) into n_upd, u_upd from _w0411 where qty - defective > 0;
  update public.handstock_opening o
     set qty = w.qty - w.defective,
         data = o.data || jsonb_build_object('_0411_defective_removed', w.defective),
         updated_at = now()
    from _w0411 w
   where o.id = w.id and w.qty - w.defective > 0;

  raise notice '0411: WinMax HS opening -- % row(s) with no Good Balance removed (% defective units), % row(s) cut to the Good Balance (% defective units taken out)',
    n_del, u_del, n_upd, u_upd;
end $once$;
