-- ===========================================================================
-- 0336 — AN INDOOR JOB THAT HAS BEEN WORKED ON IS NOT DELETED
--        (second re-review, 2026-10-03: D-142)
--
-- 0324 lets an Indoor Service job be deleted PERMANENTLY -- the user's choice,
-- for a job "received in error (the wrong unit, a duplicate intake, a test
-- entry)" -- and refuses it once the job has left a trace: a DC, or a filed
-- visit. Measured: a job that was CONDEMNED (decontaminated, disposal
-- reference, a harvested part, a check verdict) and one that was VERIFIED and
-- PDT-SIGNED were both deleted, and only the status and the counts survived in
-- the audit entry. Neither was received in error; both are quality records.
--
-- THE FIX keeps 0324's rule and its purpose, and counts the job's own SIGNED
-- or OUTWARD records as traces too: verified or re-verified, Pre-Delivery
-- Testing signed, reported to the customer, condemned or disposal recorded,
-- service report uploaded. The refusal says which trace stopped it.
--
-- WHAT IS DELIBERATELY NOT A TRACE: a QC result, checks, harvested parts,
-- accessories, decontamination and an UNSIGNED PDT. 0324's own suite deletes a
-- job carrying all of those ("Duplicate intake", indoor_delete_job_test
-- section 7), so that is the deletion the user decided on, and it still works
-- exactly as before.
--
-- The function is 0324's definition, read from the file that is its only
-- definition, with that one block (and its variable) added.
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
  v_trace  text;
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

  -- 0336 (D-142): a job that has been worked on is a quality record, not a job
  -- "received in error" (URS-175). Any one of these is a trace of its own.
  v_trace := concat_ws(', ',
    case when j.status = 'Condemned' or j.condemned_at is not null
              or btrim(coalesce(j.disposal_ref, '')) <> '' or btrim(coalesce(j.disposal_method, '')) <> ''
         then 'condemned / disposal recorded' end,
    case when j.verified_by is not null or j.verified_at is not null then 'verified' end,
    case when btrim(coalesce(j.reverified_by, '')) <> '' or j.reverified_at is not null then 're-verified' end,
    case when exists (select 1 from public.indoor_pdt p
                       where p.job_id = j.id and (p.inspected_by is not null or p.inspected_at is not null))
         then 'Pre-Delivery Testing signed' end,
    case when btrim(coalesce(j.report_file_url, '')) <> '' then 'service report uploaded' end,
    case when j.reported_to_customer_at is not null then 'reported to the customer' end);
  if v_trace <> '' then
    raise exception '% has been worked on (%) -- it is a quality record, not a job received in error, and is not deleted',
      j.job_no, v_trace
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
  'Deletes an Indoor Service job PERMANENTLY with its accessories, harvested parts, checks and PDT (0324): asks indoor.delete (granted to no role by migration; an administrator passes); needs a reason; refused for a job carrying a DC No., named on any Indoor DC line, or whose visit has been filed, and (0336) for one verified, re-verified, PDT-signed, reported to the customer, condemned or disposed of, or with its report uploaded. Writes audit_log indoor.job_delete. The job counter is untouched, so the number is not reissued.';
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
