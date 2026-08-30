-- ===========================================================================
-- Dropped — a spare Stores did not send.
--
-- Stores can drop a line instead of dispatching it (short supply, part no
-- longer needed, superseded). That is a different outcome from a rejection:
-- an approver refuses the request, Stores drops a part that was already
-- approved. The imported history carries 272 of them, 254 approved by the RM
-- first, so folding them into Rejected would misreport who ended the line.
--
-- Terminal, like Dispatched and Rejected. Checked after Rejected: if an
-- approver refused the line, that decision is the one that closed it.
-- ===========================================================================

create or replace function public.spare_line_stage(
  rm text, commercial text, nsm text, stores text, received timestamptz, item_status text
) returns text language sql immutable as $$
  select case
    when rm ~* 'reject' or commercial ~* 'reject' or nsm ~* 'reject' then 'Rejected'
    when received is not null                                        then 'Received'
    when stores ~* 'drop'                                            then 'Dropped'
    when stores ~* 'dispatch'                                        then 'Dispatched'
    when rm !~* 'approv|auto'                                        then 'RM Approval'
    when public.spare_needs_review(item_status)
     and commercial !~* 'approv|auto'                                then 'Commercial'
    when public.spare_needs_review(item_status)
     and nsm !~* 'approv|auto'                                       then 'NSM'
    else 'Stores'
  end;
$$;

-- The request's rolled-up stage: a dropped line is closed, so it no longer
-- holds the request open. A request is Dropped only when every line is.
create or replace function public.spare_request_rollup(p_uid text)
returns void language plpgsql security definer set search_path = public as $$
declare roll text;
begin
  select case
           when count(*) = 0 then 'RM Approval'
           when count(*) filter (where stage not in ('Rejected', 'Dropped')) = 0
             then case when count(*) filter (where stage = 'Dropped') > 0
                       then 'Dropped' else 'Rejected' end
           else min(case stage
                      when 'RM Approval' then 1 when 'Commercial' then 2
                      when 'NSM'         then 3 when 'Stores'     then 4
                      when 'Dispatched'  then 5 when 'Received'   then 6
                    end) filter (where stage not in ('Rejected', 'Dropped'))::text
         end
    into roll
    from public.spare_request_lines where request_uid = p_uid;

  roll := coalesce(case roll
            when '1' then 'RM Approval' when '2' then 'Commercial'
            when '3' then 'NSM'         when '4' then 'Stores'
            when '5' then 'Dispatched'  when '6' then 'Received'
            else roll end, 'RM Approval');

  perform set_config('app.spare_rollup', '1', true);
  update public.spare_requests
     set stage  = roll,
         status = case when roll = 'Stores' then 'Awaiting Dispatch' else roll end
   where uid = p_uid and (stage is distinct from roll);
  perform set_config('app.spare_rollup', '', true);
end $$;

-- Recompute every line and request against the new rule. The RBAC guard is
-- dropped around it: this is a data migration, and in the SQL Editor
-- auth.uid() is NULL so is_admin() is false and the guard would refuse it.
drop trigger if exists spare_request_lines_guard on public.spare_request_lines;

update public.spare_request_lines l
   set stage = public.spare_line_stage(
                 coalesce(l.rm_approval, 'Pending'), coalesce(l.commercial_approval, 'Pending'),
                 coalesce(l.nsm_approval, 'Pending'), coalesce(l.stores_status, 'Pending'),
                 l.received_at, r.item_status),
       status = public.spare_line_stage(
                 coalesce(l.rm_approval, 'Pending'), coalesce(l.commercial_approval, 'Pending'),
                 coalesce(l.nsm_approval, 'Pending'), coalesce(l.stores_status, 'Pending'),
                 l.received_at, r.item_status)
  from public.spare_requests r
 where r.uid = l.request_uid;

create trigger spare_request_lines_guard
  before update on public.spare_request_lines
  for each row execute function public.spare_request_lines_guard();

do $$
declare u text;
begin
  for u in select uid from public.spare_requests loop
    perform public.spare_request_rollup(u);
  end loop;
end $$;
