-- ===========================================================================
-- 0376 — SPARE RECYCLING: DELETE A REQUEST.
--
-- The user, 2026-10-04: "Add Delete Option" (on the Spare Recycling list).
-- delete_recycle_requests() removes one or many requests, open or closed,
-- with the consumption booked on them (those parts go back to the recycling
-- hand stock, which is derived) and their other costs; an MRS raised for one
-- stays, unlinked. Its own key, recycle.delete, granted to NO role (an
-- administrator passes); refused, like the whole track, in Audit Mode.
-- Non-auditable (NAR-008), so a deletion is a deletion -- it is logged to the
-- audit log by the screen, not kept as a voided row.
-- ===========================================================================

-- The two guards, re-stated from the database's definitions (0355's), each
-- stepping aside for the delete function only.
CREATE OR REPLACE FUNCTION public.recycle_consumption_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  st   text;
  bal  numeric;
begin
  if tg_op = 'UPDATE' then
    raise exception 'A consumption line is not edited. Remove it and enter it again.';
  end if;
  if tg_op = 'DELETE' then
    -- 0376: delete_recycle_requests() removes a request's consumption with it.
    if coalesce(current_setting('rithi.recycle_delete', true), '') = 'on' then return old; end if;
    select r.status into st from public.recycle_requests r where r.id = old.request_id;
    if st <> 'Open' then raise exception 'The request is closed; its consumption stays.'; end if;
    return old;
  end if;
  select r.status into st from public.recycle_requests r where r.id = new.request_id;
  if st is null then raise exception 'No such recycling request.'; end if;
  if st <> 'Open' then raise exception 'The request is closed; nothing more can be consumed on it.'; end if;
  -- FROM THE CONSUMER'S OWN RECYCLING HAND STOCK, and never more than it holds.
  new.holder := auth.uid();
  new.holder_name := public.recycle_me_name();
  new.part_code := btrim(new.part_code);
  perform pg_advisory_xact_lock(hashtext('recycle_bal:' || coalesce(new.holder::text, '') || ':' || new.part_code));
  bal := public.recycle_balance(new.holder, new.part_code);
  if new.qty > bal then
    raise exception 'Your recycling hand stock of % is %; % cannot be consumed.', new.part_code, bal, new.qty;
  end if;
  new.consumed_at := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.recycle_other_costs_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  st text;
begin
  select r.status into st from public.recycle_requests r
   where r.id = case when tg_op = 'DELETE' then old.request_id else new.request_id end;
  -- 0376: delete_recycle_requests() removes a request's costs with it.
  if tg_op = 'DELETE' and coalesce(current_setting('rithi.recycle_delete', true), '') = 'on' then return old; end if;
  if st is distinct from 'Open' then raise exception 'The request is closed; its costs stay as they are.'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_by_name := public.recycle_me_name();
    new.created_at := now();
  else
    new.request_id := old.request_id; new.created_by := old.created_by;
    new.created_by_name := old.created_by_name; new.created_at := old.created_at;
  end if;
  return new;
end $function$;

create or replace function public.delete_recycle_requests(p_ids bigint[])
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not coalesce(public.recycle_may('recycle.delete'), false) then
    raise exception 'RBAC: deleting a recycling request needs "Delete a recycling request" (and Audit Mode off)';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then return 0; end if;
  perform set_config('rithi.recycle_delete', 'on', true);
  delete from public.recycle_consumption where request_id = any (p_ids);
  delete from public.recycle_other_costs where request_id = any (p_ids);
  update public.recycle_mrs set request_id = null where request_id = any (p_ids);
  delete from public.recycle_requests where id = any (p_ids);
  get diagnostics n = row_count;
  perform set_config('rithi.recycle_delete', '', true);
  return n;
end $$;
revoke execute on function public.delete_recycle_requests(bigint[]) from public, anon;
grant execute on function public.delete_recycle_requests(bigint[]) to authenticated;
