-- ===========================================================================
-- Cancelling a batch of calls in one go (0242).
--   The batch adds NO new power: an engineer gets nothing through it.
--   One reason is written onto every call in the batch.
--   PARTIAL SUCCESS IS REPORTED PER CALL — one bad UCN does not throw away the
--   rest, and the message comes back word for word.
--   The same UCN twice is ONE row, not a self-inflicted "already cancelled".
--   An empty reason and an oversized batch are refused outright.
--   It is NOT a delete, and `restore_call` still works on what it cancelled.
--
-- EVERY INVARIANT IS A `raise exception`, NOT A GRID SOMEBODY READS. The suite
-- runner judges ERRORS — it pairs each `expect ERROR` with the next error and
-- reports the rest as unexpected — so an assertion that only PRINTS a value is
-- an assertion nothing checks. The grids are still here, for the person
-- reading the output; the guards beside them are what fails the run. This was
-- worth doing rather than assuming: a mutation that made the function write
-- its own UPDATE instead of delegating to cancel_call() left the printed grid
-- reading ok=true and the suite passing.
--
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('c2c2c2c2-0000-0000-0000-000000000001','cb_admin@x.com'),
 ('c2c2c2c2-0000-0000-0000-000000000002','cb_hotline@x.com'),
 ('c2c2c2c2-0000-0000-0000-000000000004','cb_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('c2c2c2c2-0000-0000-0000-000000000001','cb_admin@x.com','CB Admin','admin'),
 ('c2c2c2c2-0000-0000-0000-000000000002','cb_hotline@x.com','CB Hotline','hotline'),
 ('c2c2c2c2-0000-0000-0000-000000000004','cb_eng@x.com','CB Engineer','engineer')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- Set up as the ADMIN so nothing is stamped created_by = the engineer and
-- handed to them by the read policy's own-rows arm.
call public.be('cb_admin@x.com');

insert into public.calls (ucn, call_type, product_name, serial, reg_date, party_name,
                          complaint_reported, standard_complaint, allocated_to)
values ('CB-1', 'FIELD',        'CBPROD', '1', current_date, 'HOSP', 'x', 'y', 'Someone Else'),
       ('CB-2', 'FIELD',        'CBPROD', '1', current_date, 'HOSP', 'x', 'y', 'Someone Else'),
       ('CB-3', 'INSTALLATION', 'CBPROD', '2', current_date, 'HOSP', 'x', 'y', 'Someone Else'),
       ('CB-4', 'PM',           'CBPROD', '3', current_date, 'HOSP', 'x', 'y', 'Someone Else'),
       ('CB-5', 'FIELD',        'CBPROD', '4', current_date, 'HOSP', 'x', 'y', 'Someone Else');

\echo '--- 1. AN ENGINEER GETS NOTHING THROUGH THE BATCH ---'
\echo 'expect: every row ok=false, with the RBAC refusal word for word'
call public.be('cb_eng@x.com');
begin;
  set local role authenticated;
  select ucn, ok, error from public.cancel_calls(array['CB-1','CB-2'], 'Duplicate Call') order by ucn;
  do $g$
  declare v_ok int; v_rbac int;
  begin
    select count(*) filter (where ok), count(*) filter (where error like 'RBAC:%')
      into v_ok, v_rbac
      from public.cancel_calls(array['CB-1','CB-2'], 'Duplicate Call');
    if v_ok <> 0 then
      raise exception 'FAIL: the batch let an engineer cancel % call(s)', v_ok;
    end if;
    if v_rbac <> 2 then
      raise exception 'FAIL: expected 2 RBAC refusals, got %', v_rbac;
    end if;
  end $g$;
rollback;
call public.be('cb_admin@x.com');
do $g$
declare n int;
begin
  select count(*) into n from public.calls where ucn like 'CB-%' and cancelled_at is not null;
  if n <> 0 then raise exception 'FAIL: % call(s) were cancelled by an engineer', n; end if;
end $g$;

\echo '--- 2. THE HOTLINE CANCELS THREE IN ONE GO, ONE REASON ---'
\echo 'expect: three rows, all ok=true'
call public.be('cb_hotline@x.com');
begin;
  set local role authenticated;
  select ucn, ok, error from public.cancel_calls(array['CB-1','CB-2','CB-3'], 'Duplicate Call') order by ucn;
commit;
\echo 'expect: CB-1..3 Cancelled, reason "Duplicate Call", cancelled_by = the hotline user'
select c.ucn, s.state, c.cancel_reason,
       (select email from auth.users u where u.id = c.cancelled_by) as by
  from public.calls c join public.call_state s using (ucn)
 where c.ucn like 'CB-%' order by c.ucn;
do $g$
declare n int;
begin
  -- ONE REASON ON EVERY CALL IN THE BATCH, and the right person against each:
  -- the whole point of doing it in one go is that the set reads as one
  -- decision, which a per-call prompt is exactly how you lose.
  select count(*) into n
    from public.calls c
   where c.ucn in ('CB-1','CB-2','CB-3')
     and c.cancelled_at is not null
     and c.cancel_reason = 'Duplicate Call'
     and c.cancelled_by = (select id from auth.users where email = 'cb_hotline@x.com');
  if n <> 3 then raise exception 'FAIL: % of 3 carry the batch reason and author', n; end if;
  select count(*) into n from public.call_state
   where ucn in ('CB-1','CB-2','CB-3') and state <> 'Cancelled';
  if n <> 0 then raise exception 'FAIL: % of the three do not read Cancelled', n; end if;
  select count(*) into n from public.pending_calls where ucn in ('CB-1','CB-2','CB-3');
  if n <> 0 then raise exception 'FAIL: % cancelled call(s) are still pending', n; end if;
end $g$;

\echo '--- 3. PARTIAL SUCCESS: one already cancelled, one unknown, one good ---'
\echo 'expect: CB-1 already cancelled, CB-4 ok, CB-NOPE no such call — all three reported'
call public.be('cb_hotline@x.com');
begin;
  set local role authenticated;
  select ucn, ok, error from public.cancel_calls(array['CB-1','CB-4','CB-NOPE'], 'Duplicate Call') order by ucn;
commit;
do $g$
declare n int;
begin
  -- THE GOOD ONE SURVIVES THE BAD ONES. An all-or-nothing batch would have
  -- thrown CB-4 away over a call somebody had already cancelled.
  select count(*) into n from public.calls where ucn = 'CB-4' and cancelled_at is not null;
  if n <> 1 then raise exception 'FAIL: CB-4 was lost to the other two'; end if;
end $g$;

\echo '--- 4. THE SAME UCN TWICE IS ONE ROW ---'
\echo 'expect: exactly one row, ok=true — not a second reading "already cancelled"'
call public.be('cb_hotline@x.com');
begin;
  set local role authenticated;
  select ucn, ok, error from public.cancel_calls(array['CB-5','CB-5','  CB-5  '], 'Duplicate Call');
  do $g$
  declare n int; v_ok int;
  begin
    select count(*), count(*) filter (where ok) into n, v_ok
      from public.cancel_calls(array['CB-4','CB-4','  CB-4  '], 'Duplicate Call');
    -- CB-4 is already cancelled by section 3, so the one row reports that.
    -- What is being tested is the COUNT: three spellings of one UCN is one row.
    if n <> 1 then raise exception 'FAIL: one UCN three times produced % rows', n; end if;
    if v_ok <> 0 then raise exception 'FAIL: an already-cancelled call reported ok'; end if;
  end $g$;
commit;

\echo '--- 5. BLANKS ARE DROPPED, and an all-blank batch does nothing ---'
\echo 'expect: 0 rows'
begin;
  set local role authenticated;
  select count(*) as rows_returned from public.cancel_calls(array['', '   ', null], 'Duplicate Call');
  do $g$
  declare n int;
  begin
    select count(*) into n from public.cancel_calls(array['', '   ', null], 'Duplicate Call');
    if n <> 0 then raise exception 'FAIL: a batch of blanks returned % row(s)', n; end if;
  end $g$;
commit;

\echo '--- 6. A BATCH NEEDS A REASON — refused outright, not per row ---'
\echo 'expect ERROR: a reason'
begin;
  set local role authenticated;
  select * from public.cancel_calls(array['CB-1'], '   ');
rollback;

\echo '--- 7. THE CAP IS 500 ---'
\echo 'expect ERROR: too many'
begin;
  set local role authenticated;
  select * from public.cancel_calls(
    (select array_agg('CB-BULK-' || g) from generate_series(1, 501) g), 'Duplicate Call');
rollback;

\echo '--- 8. ...and 500 is allowed (they are all unknown UCNs, so all reported) ---'
\echo 'expect: 500 rows, none ok'
begin;
  set local role authenticated;
  do $g$
  declare n int; v_ok int;
  begin
    select count(*), count(*) filter (where ok) into n, v_ok
      from public.cancel_calls(
        (select array_agg('CB-BULK-' || g) from generate_series(1, 500) g), 'Duplicate Call');
    if n <> 500 then raise exception 'FAIL: a 500-call batch reported % row(s)', n; end if;
    if v_ok <> 0 then raise exception 'FAIL: % unknown UCN(s) reported ok', v_ok; end if;
  end $g$;
commit;

\echo '--- 9. NOT A DELETE: all five calls are still there ---'
call public.be('cb_admin@x.com');
do $g$
declare n int;
begin
  select count(*) into n from public.calls where ucn like 'CB-_';
  if n <> 5 then raise exception 'FAIL: % of 5 calls survived the batch', n; end if;
end $g$;

\echo '--- 10. the undo still applies to what the batch cancelled ---'
\echo 'expect: CB-1 back on the pending list, reason still on the record'
call public.be('cb_hotline@x.com');
begin;
  set local role authenticated;
  select public.restore_call('CB-1');
commit;
select s.ucn, s.state, c.cancel_reason
  from public.call_state s join public.calls c using (ucn) where s.ucn = 'CB-1';
do $g$
declare v_state text; v_reason text;
begin
  select s.state, c.cancel_reason into v_state, v_reason
    from public.call_state s join public.calls c using (ucn) where s.ucn = 'CB-1';
  if v_state = 'Cancelled' then raise exception 'FAIL: CB-1 was not restored'; end if;
  -- The reason STAYS: what was done and then undone is part of the record.
  if v_reason <> 'Duplicate Call' then raise exception 'FAIL: the reason was wiped by the restore'; end if;
end $g$;

\echo '--- 11. THE WRAPPER DELEGATES, AND IS NOT A SECURITY DEFINER ---'
do $g$
declare v_def boolean; v_body text;
begin
  select p.prosecdef, pg_get_functiondef(p.oid) into v_def, v_body
    from pg_proc p where p.oid = to_regprocedure('public.cancel_calls(text[],text)');
  -- IT MUST CALL cancel_call(). A body that grew its own UPDATE would skip
  -- every rule 0108 wrote down — the permission, the reason, the unknown UCN,
  -- the already-cancelled one. Measured, not assumed: that exact mutation left
  -- section 1's printed grid reading ok=true.
  if v_body !~ 'cancel_call\(' then raise exception 'FAIL: the batch no longer delegates to cancel_call()'; end if;
  -- AND IT STAYS INVOKER. That is the second line of defence rather than the
  -- first: has_perm() reads auth.uid(), which a definer does not change, so a
  -- definer wrapper would NOT by itself bypass the permission. What it would
  -- bypass is RLS on public.calls — which is what stopped the mutation above
  -- from actually cancelling anything.
  if v_def then raise exception 'FAIL: cancel_calls is a SECURITY DEFINER'; end if;
end $g$;

\echo '--- 12. cleanup ---'
call public.be('cb_admin@x.com');
delete from public.calls where ucn like 'CB-%';
delete from public.profiles where email like 'cb_%@x.com';
