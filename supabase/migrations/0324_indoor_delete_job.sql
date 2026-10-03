-- ===========================================================================
-- 0324 — DELETING AN INDOOR SERVICE JOB, PERMANENTLY, BEFORE IT HAS LEFT A
--        TRACE ANYWHERE ELSE
--
-- The user, 2026-10-03: a job received in error (the wrong unit, a duplicate
-- intake, a test entry) should be removable, and they chose PERMANENT deletion
-- over keep-and-hide. "Allow Admin by default, rest I will update from Roles &
-- Permissions": the key is `indoor.delete`, an administrator passes has_perm()
-- anyway, and THIS MIGRATION GRANTS IT TO NO OTHER ROLE.
--
-- WHAT IS NEVER DELETED, whoever asks:
--   * a job that went on an Indoor DC -- it carries a DC No. (dispatch_ref) or
--     a line of any Indoor DC names it, approved, pending or rejected. A DC is
--     a record of a unit leaving and is kept for ever (0321, no_hard_delete);
--     its lines reference the job.
--   * a job whose visit has been FILED against its call (visit_uid): the call's
--     visit history names that work, and deleting the job would leave a visit
--     pointing at nothing.
-- A drafted visit (visit_draft) lives on the job and goes with it.
--
-- HOW: delete_indoor_job() is SECURITY DEFINER and is the ONLY way. indoor_jobs
-- and indoor_pdt have no DELETE policy (0158, 0320), and this migration also
-- revokes the DELETE privilege on both from the API roles, so a direct DELETE
-- is refused outright rather than matching zero rows. The function deletes the
-- children it names (accessories, harvested parts, checks, PDT) and then the
-- job; indoor_job_counters is not touched, so a deleted job's number is never
-- issued again. No record-retention trigger sits on these tables (0049 covers
-- calls, visits and spares), so nothing has to be lifted: there is no ticket
-- and no general hole.
--
-- THE TRAIL: an audit_log row `indoor.job_delete` written by the function
-- itself, naming the job no., product, serial, UCN, kind, status, the reason and
-- what went with it; who and when are stamped by audit_before_insert() from the
-- session.
-- ===========================================================================

create or replace function public.delete_indoor_job(p_job_id bigint, p_reason text)
returns text
language plpgsql volatile security definer
set search_path = public
as $$
declare
  j        public.indoor_jobs%rowtype;
  v_dcs    text;
  v_acc    integer;
  v_parts  integer;
  v_checks integer;
  v_pdt    integer;
  v_actor  text;
  v_role   text;
begin
  if not public.has_perm('indoor.delete') then
    raise exception 'indoor.delete is required to delete an Indoor Service job'
      using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'say why the Indoor Service job is being deleted'
      using errcode = '23514';
  end if;

  select * into j from public.indoor_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Indoor Service job % was not found', p_job_id
      using errcode = '23503';
  end if;

  if btrim(coalesce(j.dispatch_ref, '')) <> '' then
    raise exception '% carries DC No. % -- a job that went on a delivery challan is a record of the unit leaving and is not deleted',
      j.job_no, btrim(j.dispatch_ref)
      using errcode = '23514';
  end if;
  select string_agg(distinct d.dc_no || ' (' || d.approval_status || ')', ', ') into v_dcs
    from public.indoor_dc_lines l join public.indoor_dcs d on d.id = l.dc_id
   where l.job_id = j.id;
  if v_dcs is not null then
    raise exception '% is on Indoor DC % -- the challan keeps its lines, so the job is not deleted',
      j.job_no, v_dcs
      using errcode = '23514';
  end if;
  if j.visit_uid is not null then
    raise exception '% has visit % filed against call % -- the call''s visit history names this job, so it is not deleted',
      j.job_no, j.visit_uid, coalesce(j.ucn, '(none)')
      using errcode = '23514';
  end if;

  delete from public.indoor_job_accessories where job_id = j.id;
  get diagnostics v_acc = row_count;
  delete from public.indoor_job_parts where job_id = j.id;
  get diagnostics v_parts = row_count;
  delete from public.indoor_job_checks where job_id = j.id;
  get diagnostics v_checks = row_count;
  delete from public.indoor_pdt where job_id = j.id;
  get diagnostics v_pdt = row_count;
  delete from public.indoor_jobs where id = j.id;

  select coalesce(nullif(btrim(p.full_name), ''), p.email, ''), coalesce(p.role, '')
    into v_actor, v_role
    from public.profiles p where p.id = auth.uid();

  insert into public.audit_log (actor, role, action, target, status, meta)
  values (coalesce(v_actor, ''), coalesce(v_role, ''), 'indoor.job_delete', j.job_no, 'ok',
          jsonb_build_object(
            'job_no', j.job_no, 'product', j.product_name, 'serial', j.serial,
            'ucn', coalesce(j.ucn, ''), 'kind', j.kind, 'activity', j.activity, 'status', j.status,
            'party', coalesce(j.party_name, ''), 'received_at', j.received_at,
            'indoor_report_no', coalesce(j.indoor_report_no, ''),
            'had_visit_draft', j.visit_draft is not null,
            'reason', btrim(p_reason),
            'deleted', jsonb_build_object('accessories', v_acc, 'parts', v_parts, 'checks', v_checks, 'pdt', v_pdt)));

  return j.job_no;
end $$;
comment on function public.delete_indoor_job(bigint, text) is
  'Deletes an Indoor Service job PERMANENTLY with its accessories, harvested parts, checks and PDT (0324): asks indoor.delete (granted to no role by migration; an administrator passes); needs a reason; refused for a job carrying a DC No., named on any Indoor DC line, or whose visit has been filed. Writes audit_log indoor.job_delete. The job counter is untouched, so the number is not reissued.';
revoke all on function public.delete_indoor_job(bigint, text) from public;
do $$ begin
  execute 'revoke all on function public.delete_indoor_job(bigint, text) from anon';
  execute 'grant execute on function public.delete_indoor_job(bigint, text) to authenticated';
exception when undefined_object then null; end $$;

-- A DIRECT DELETE IS REFUSED OUTRIGHT. There is no DELETE policy on either
-- table, so a project's default grants would let a DELETE through to RLS and
-- match zero rows -- "nothing happened" rather than "you may not". Revoked, it
-- says so. The function above runs as the owner and is unaffected.
do $$ begin
  execute 'revoke delete on public.indoor_jobs, public.indoor_pdt from anon, authenticated';
exception when undefined_object then null; end $$;
