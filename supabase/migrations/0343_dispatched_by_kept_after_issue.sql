-- ===========================================================================
-- 0343 — WHO DISPATCHED A STOCK OUT IS KEPT ONCE THE CHALLAN IS ISSUED
--        (second re-review, 2026-10-03: D-126)
--
-- 0211 stamps spare_dispatches.dispatched_by from the session -- on INSERT
-- only. sd_update lets anybody holding spare.dispatch update the row, so the
-- name on an issued challan could be rewritten afterwards. Measured on a
-- database built from every migration: a Stores Incharge set dispatched_by to
-- "Somebody Else" on an issued stock out (UPDATE 1), and the Delivery Challan
-- and, since D-155, the Declaration print that name.
--
-- THE SAME RULE AS 0211, carried to UPDATE: with a signed-in session the
-- caller's value is DISCARDED, not refused -- the row keeps the name it was
-- issued with. Refusing would make an honest update of something else fail
-- because it happened to send the column back.
--
-- WHAT KEEPS WORKING -- read from the code, not assumed:
--   * The app never updates spare_dispatches directly. It dispatches through
--     dispatch_spare_lines(), which INSERTS the header (stamped by 0211), and
--     the recount functions (0064 / 0065 / 0122) update line_count and
--     total_qty only.
--   * A User Master rename (0259) moves spare_dispatches.engineer and,
--     deliberately, never dispatched_by -- who DID something does not move.
--   * The Stock Out Register upload re-loads on uid (an upsert). Its INSERT
--     half is stamped by 0211 before the conflict is found, so before this
--     file a re-load rewrote every matching challan with the UPLOADER's name.
--     It now keeps the name each one was issued with.
--   * An administrative connection (no session: the SQL editor, a restore)
--     keeps whatever it supplies, exactly as 0211 does on insert -- that is
--     the only way left to correct a wrong name, and it leaves the audit row.
--
-- The line rows (spare_request_lines.dispatched_by) are a copy written by
-- dispatch_spare_lines() and are not touched here: a partial dispatch rewrites
-- them legitimately at the next stock out, and that guard was rebuilt twice
-- from old revisions (0210 / 0217). The challan and the Declaration read the
-- HEADER.
--
-- Same module and bundle as 0211 (spare_requests -> Spare_1.sql), so a replay
-- of that bundle alone ends on this definition.
-- ===========================================================================

create or replace function public.spare_dispatches_stamp_actor()
returns trigger language plpgsql security definer set search_path = public as $$
declare me text;
begin
  me := public.my_display_name();
  -- Only where there IS a session. On an administrative connection the caller's
  -- value is all there is, and blanking it would lose the only record of who
  -- booked the stock out.
  if me is null then return new; end if;

  if tg_op = 'INSERT' then
    new.dispatched_by := me;
  else
    -- An issued challan says what it said (D-126).
    new.dispatched_by := old.dispatched_by;
  end if;
  return new;
end $$;
revoke execute on function public.spare_dispatches_stamp_actor() from public, anon, authenticated;

drop trigger if exists spare_dispatches_stamp_actor on public.spare_dispatches;
create trigger spare_dispatches_stamp_actor
  before insert or update on public.spare_dispatches
  for each row execute function public.spare_dispatches_stamp_actor();
