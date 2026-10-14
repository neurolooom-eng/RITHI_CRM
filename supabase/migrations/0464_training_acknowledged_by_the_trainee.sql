-- ===========================================================================
-- D-176 (re-review 5, 2026-10-12): "read and understood" is the trainee's to
-- say, and a training assignment is imaged.
--
-- tg_update lets a holder of training.manage write every column of
-- training_assignments, acknowledged_at and dir_id included; training_touch()
-- protects only assigned_at and assigned_by; training_status reads Completed
-- as soon as acknowledged_at is set; and the table is not under record_audit.
-- Measured: a role holding only training.manage set acknowledged_at to a
-- month ago (UPDATE 1), the trainee read Completed back-dated, and nothing
-- recorded it.
--
-- 1. A trigger running AS THE CALLER keeps acknowledged_at and dir_id as they
--    were on a direct signed-in update (current_user = authenticated), for
--    everybody but an importer. acknowledge_training() -- the trainee's own
--    acknowledgement, checked against their own email -- runs as the owner and
--    is unaffected; so is cancelling, which stays the manager's action.
-- 2. record_audit on training_assignments: who, when, before and after.
-- ===========================================================================
create or replace function public.training_ack_by_trainee()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' or auth.uid() is null
     or public.has_perm('bulk.upload') or public.has_perm('import.panel') then
    return new;
  end if;
  new.acknowledged_at := old.acknowledged_at;
  new.dir_id := old.dir_id;
  return new;
end $$;
revoke execute on function public.training_ack_by_trainee() from public, anon;

drop trigger if exists a_training_ack_by_trainee on public.training_assignments;
create trigger a_training_ack_by_trainee
  before update on public.training_assignments
  for each row execute function public.training_ack_by_trainee();

do $on$
begin
  if to_regprocedure('public.record_audit_fn()') is null then return; end if;
  drop trigger if exists record_audit_i on public.training_assignments;
  drop trigger if exists record_audit_u on public.training_assignments;
  drop trigger if exists record_audit_d on public.training_assignments;
  create trigger record_audit_i after insert on public.training_assignments
    referencing new table as new_rows for each statement execute function public.record_audit_fn();
  create trigger record_audit_u after update on public.training_assignments
    referencing old table as old_rows new table as new_rows for each statement execute function public.record_audit_fn();
  create trigger record_audit_d after delete on public.training_assignments
    referencing old table as old_rows for each statement execute function public.record_audit_fn();
end $on$;
