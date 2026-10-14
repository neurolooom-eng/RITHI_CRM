-- ===========================================================================
-- 0439 -- THE CALLS CANCELLED IN THE OLD SYSTEM, CANCELLED HERE (the user,
-- 2026-10-14: "Previously cancelled calls now moved to unsolved" ... "I have a
-- file of the cancelled calls -- upload it", Canceled_Calls.csv).
--
-- The file is the old system's record of each cancellation: a visit entry
-- with Call Status "Canceled" (39 rows, 38 calls; 26E07F0010 twice). None of
-- those entries is in RITHI's visits, so nothing here said the calls were
-- cancelled and they read Unattended, Unsolved or Solved. Settled with the
-- user the same day:
--
--   cancelled_at   the entry's Visit Entry Date (when it was entered), IST;
--   cancel_reason  its "Reason for cancelation";
--   cancelled by   its Email-ID -- kept as text in extra.cancelled_by_name,
--                  and as cancelled_by where that address is a RITHI login;
--   a call that now reads Solved or Report pending is cancelled too, its
--                  visits and spares kept ("Cancel it, keep the visits").
--
-- LEFT AS THEY ARE: a call already cancelled in RITHI (its own reason and
-- date stand), and a call not in the live register -- the three 2025 calls
-- are in Call History, which carries no workflow (0429). Where a call is in
-- the file twice, its EARLIER entry is the cancellation.
--
-- Measured on the live project before writing: 21 to cancel (13 Unattended,
-- 5 Unsolved, 3 Solved), 14 already cancelled, 3 in Call History.
-- open_state follows by call_open_state_stamp() (0434). Restorable one by one
-- with Restore call, like any cancellation.
-- ===========================================================================

do $load$
declare n bigint; total bigint := 0; t text; v_held bigint; v_already bigint;
begin
  create temporary table _cancelled_file (ucn text, entry_uid text, call_number text, entered_at timestamptz, reason text, email text) on commit drop;
  insert into _cancelled_file values
  ('25L29F0008', 'H-926344b1', 'R15736-MONNAL T60-212', timestamptz '2026-01-19 18:15:59+05:30', 'Wrong sl.no. entered', 'airliquide.customercare2022@gmail.com'),
  ('26A22F0004', 'H-88cf8fc4', 'R16094-ORION-G-1439', timestamptz '2026-01-27 11:28:16+05:30', 'WRONG CALL REGISTRATION', 'airliquide.customercare2022@gmail.com'),
  ('26B04F0005', 'H-94bcc800', 'R16217-ORION-G-105', timestamptz '2026-02-04 16:10:23+05:30', 'Wrong supply', 'airliquide.customercare2022@gmail.com'),
  ('26B03F0031', 'H-0e7dabbe', 'R16215-ORION-G-106', timestamptz '2026-02-04 16:11:22+05:30', 'Wrong supply', 'airliquide.customercare2022@gmail.com'),
  ('26B04F0024', 'H-0375f8e4', 'R16234-ORION-G-2142', timestamptz '2026-02-05 12:29:24+05:30', 'Repeated Calls-Software Issue', 'airliquide.customercare2022@gmail.com'),
  ('25L30F0014', 'H-8123663b', 'R15765-EXTEND-XT-XT 2986', timestamptz '2026-02-05 17:20:54+05:30', 'CUSTOMER NOT APPROVED THE ESTIMATE', 'airliquide.customercare2022@gmail.com'),
  ('25L22F0033', 'H-d44582e7', 'CL2302883-CPX CARE-1034', timestamptz '2026-02-05 17:48:57+05:30', 'Wrong sl.no. entered', 'airliquide.customercare2022@gmail.com'),
  ('26A08F0002', 'H-627632f8', 'R15920-MONNAL T60-19616', timestamptz '2026-02-09 12:25:52+05:30', 'Wrong sl.no. entered', 'airliquide.customercare2022@gmail.com'),
  ('26A05F0001', 'H-3ccb7626', 'CL2303084-ORION-G-842', timestamptz '2026-02-11 14:34:37+05:30', 'Wrong sl.no. entered', 'airliquide.customercare2022@gmail.com'),
  ('26B03F0017', 'H-ab332f2a', 'CL2300579-EXTEND-XT-XT 2884', timestamptz '2026-02-16 16:05:08+05:30', 'Wrong sl.no. entered', 'airliquide.customercare2022@gmail.com'),
  ('26B13F0012', 'H-ee2bf99e', 'CL2300745-EXTEND-XT-XT 2884', timestamptz '2026-02-16 16:05:18+05:30', 'Wrong sl.no. entered', 'airliquide.customercare2022@gmail.com'),
  ('26B03F0032', 'H-f8434031', 'R16216-VEGA-155', timestamptz '2026-02-16 18:13:48+05:30', 'CUSTOMER NOT APPROVED THE ESTIMATE', 'airliquide.customercare2022@gmail.com'),
  ('26A30F0020', 'H-ca7c6c6e', 'R16167-CPX CARE-1767', timestamptz '2026-02-19 10:55:53+05:30', 'ALTERNATE SERVICE', 'airliquide.customercare2022@gmail.com'),
  ('26A30F0004', 'H-ac65988d', 'R16167-CPX CARE-1769', timestamptz '2026-02-19 10:56:12+05:30', 'ALTERNATE SERVICE', 'airliquide.customercare2022@gmail.com'),
  ('26A30F0006', 'H-ced8cb85', 'R16167-CPX CARE-1770', timestamptz '2026-02-19 10:56:24+05:30', 'ALTERNATE SERVICE', 'airliquide.customercare2022@gmail.com'),
  ('26A30F0008', 'H-910dd5d2', 'R16168-CPX CARE-1772', timestamptz '2026-02-19 10:56:34+05:30', 'ALTERNATE SERVICE', 'airliquide.customercare2022@gmail.com'),
  ('26A30F0005', 'H-2b1a98dd', 'R16167-CPX CARE-1775', timestamptz '2026-02-19 10:57:04+05:30', 'ALTERNATE SERVICE', 'airliquide.customercare2022@gmail.com'),
  ('26A30F0007', 'H-9894a085', 'R16167-CPX CARE-1776', timestamptz '2026-02-19 10:57:38+05:30', 'ALTERNATE SERVICE', 'airliquide.customercare2022@gmail.com'),
  ('26B02F0008', 'H-d78bebdd', 'CL2300555-EXTEND-XT-INXT 0104', timestamptz '2026-03-02 18:05:55+05:30', 'CUSTOMER NOT APPROVED THE ESTIMATE', 'airliquide.customercare2022@gmail.com'),
  ('26A28F0008', 'H-3792e74b', 'R16140-VEGA-201', timestamptz '2026-03-10 16:14:23+05:30', 'WRONG CALL REGISTRATION', 'airliquide.customercare2022@gmail.com'),
  ('26B10F0016', 'H-5be280f2', 'R16286-EXTEND-XT-3', timestamptz '2026-03-17 11:49:41+05:30', 'CUSTOMER NOT APPROVED THE ESTIMATE', 'airliquide.customercare2022@gmail.com'),
  ('26C26I0001', 'H-e0226aa7', 'WI-MONNAL T60-20133', timestamptz '2026-03-19 11:49:46+05:30', 'WRONG CALL REGISTRATION', 'airliquide.customercare2022@gmail.com'),
  ('26C17F0011', 'H-3bf9cb06', 'CL2301288-VEGA-253', timestamptz '2026-03-20 14:38:32+05:30', 'WRONG CALL REGISTRATION', 'airliquide.customercare2022@gmail.com'),
  ('26C30F0010', 'H-acf05da5', 'CL2301552-ORION-1880', timestamptz '2026-03-30 18:27:13+05:30', 'Repeated Calls-Software Issue', 'airliquide.customercare2022@gmail.com'),
  ('26A19F0044', 'H-9875997c', 'R16015-ORION-G-263', timestamptz '2026-04-02 15:23:12+05:30', 'CUSTOMER NOT APPROVED THE ESTIMATE', 'airliquide.customercare2022@gmail.com'),
  ('26D07F0016', 'H-0f6d2e26', 'R16946-ORION-G-2000', timestamptz '2026-04-08 16:53:29+05:30', 'Repeated Calls-Software Issue', 'airliquide.customercare2022@gmail.com'),
  ('26C18F0010', 'H-efdbb2ac', 'R16742-MONNAL T75-10897', timestamptz '2026-04-10 16:34:08+05:30', 'ALTERNATE SERVICE', 'airliquide.customercare2022@gmail.com'),
  ('26D08F0004', 'H-8b66cfd4', 'R16951-MONNAL T75-5075', timestamptz '2026-04-24 12:53:37+05:30', 'CUSTOMER NOT APPROVED THE ESTIMATE', 'airliquide.customercare2022@gmail.com'),
  ('26E12F0024', 'H-94b4ab94', 'R17291-VEGA-81', timestamptz '2026-05-14 10:02:57+05:30', 'WRONG CALL REGISTRATION', 'airliquide.customercare2022@gmail.com'),
  ('26B16F0030', 'H-6afba427', 'R16347-EXTEND-XT-INXT 1041', timestamptz '2026-05-15 15:19:06+05:30', 'CUSTOMER NOT APPROVED THE ESTIMATE', 'airliquide.customercare2022@gmail.com'),
  ('26C10F0002', 'H-fb3da293', 'R16645-MONNAL T60-7133', timestamptz '2026-05-15 15:19:59+05:30', 'CUSTOMER NOT APPROVED THE ESTIMATE', 'airliquide.customercare2022@gmail.com'),
  ('26D10F0016', 'H-20fdfa4d', 'R16978-EXTEND-XT-XT 2837', timestamptz '2026-05-15 15:20:51+05:30', 'CUSTOMER NOT APPROVED THE ESTIMATE', 'airliquide.customercare2022@gmail.com'),
  ('26E07F0010', 'H-d6d7b6ec', 'R17247-EXTEND-XT-XT 2851', timestamptz '2026-05-15 15:22:15+05:30', 'CUSTOMER NOT APPROVED THE ESTIMATE', 'airliquide.customercare2022@gmail.com'),
  ('26E07F0012', 'H-ff247dc7', 'R17249-EXTEND-XT-INXT 0419', timestamptz '2026-05-15 15:22:26+05:30', 'CUSTOMER NOT APPROVED THE ESTIMATE', 'airliquide.customercare2022@gmail.com'),
  ('26E07F0010', 'H-3f35a61d', 'R17247-EXTEND-XT-XT 2851', timestamptz '2026-05-15 15:22:48+05:30', 'CUSTOMER NOT APPROVED THE ESTIMATE', 'airliquide.customercare2022@gmail.com'),
  ('26C18F0070', 'H-0b5039a8', 'R16747-EXTEND-XT-INXT 0519', timestamptz '2026-05-25 14:20:28+05:30', 'CUSTOMER NOT APPROVED THE ESTIMATE', 'airliquide.customercare2022@gmail.com'),
  ('26F01F0007', 'H-02a41594', 'R17504-ORION-G-936', timestamptz '2026-06-09 14:35:33+05:30', 'Repeated Calls-Software Issue', 'airliquide.customercare2022@gmail.com'),
  ('26F01F0008', 'H-36113ca4', 'R17504-ORION-G-964', timestamptz '2026-06-09 14:37:06+05:30', 'Repeated Calls-Software Issue', 'airliquide.customercare2022@gmail.com'),
  ('26G08F0031', 'H-f30b1087', 'CL2303045-MONNAL T75-', timestamptz '2026-08-25 15:10:15+05:30', 'WRONG CALL REGISTRATION', 'airliquide.customercare2022@gmail.com')
;
  select count(distinct f.ucn) into v_held from _cancelled_file f where not exists (select 1 from public.calls c where c.ucn = f.ucn);
  select count(distinct f.ucn) into v_already from _cancelled_file f join public.calls c on c.ucn = f.ucn where c.cancelled_at is not null;

  foreach t in array array['field_calls', 'installation_calls', 'pm_calls'] loop
    execute format($q$
      with first_entry as (
        select distinct on (ucn) ucn, entered_at, reason, email
          from _cancelled_file order by ucn, entered_at, entry_uid
      )
      update public.%I c
         set cancelled_at  = e.entered_at,
             cancel_reason = e.reason,
             cancelled_by  = (select p.id from public.profiles p where lower(p.email) = lower(e.email) limit 1),
             extra         = coalesce(c.extra, '{}'::jsonb)
                             || jsonb_build_object('cancelled_by_name', e.email,
                                                   'cancelled_from', 'Canceled_Calls.csv (old system), loaded 2026-10-14')
        from first_entry e
       where e.ucn = c.ucn and c.cancelled_at is null
      $q$, t);
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  raise notice '0439: % call(s) cancelled from the file; % already cancelled in RITHI, left as they were; % not in the live register (Call History), left.', total, v_already, v_held;
end $load$;
