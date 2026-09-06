-- ===========================================================================
-- The refurbished-part notice, which module ORDER had been quietly discarding.
--
-- `notify_spare_dispatched()` is created by 0045, corrected by 0054, and
-- extended by 0064 to say when the dispatched part is a REFURBISHED one — the
-- thing an engineer most needs told. But 0064 lives in `handstock`, and
-- `notifications` runs AFTER handstock in ALL_ORDER, so 0054's version had the
-- last word on every database built from all.sql: the refurbished line has
-- never been sent. Replaying HandStock_X.sql put 0064's back, and replaying
-- notifications.sql took it away again.
--
-- Ending this module with 0064's definition settles all three at once — the
-- fresh apply, the handstock replay and the notifications replay.
--
-- The definition here is a COPY. `npm run check:bundles` compares it with
-- 0064 word for word and fails if either side moves.
-- ===========================================================================

do $mirror$
begin
  if to_regclass('public.spare_dispatch_lines') is null then
    raise notice 'skip notify_spare_dispatched — public.spare_dispatch_lines is not present yet';
    return;
  end if;
  execute $body$
create or replace function public.notify_spare_dispatched()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid; r record; refurb_note text := '';
begin
  if coalesce(new.stores_status, '') !~* 'dispatch' then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.stores_status, '') ~* 'dispatch' then return new; end if;
  select sr.engineer, sr.engineer_email, sr.ucn, sr.party_name into r
    from public.spare_requests sr where sr.uid = new.request_uid;
  v_uid := public.notify_resolve_uid(r.engineer_email, r.engineer);
  if v_uid is null then return new; end if;

  if exists (select 1 from public.spare_dispatch_lines d
              where d.line_id = new.id and d.refurbished) then
    refurb_note := ' · REFURBISHED part';
  end if;

  insert into public.notifications (recipient_id, recipient_email, kind, title, body, link)
  values (v_uid, coalesce(r.engineer_email, ''), 'spare_dispatched',
          case when refurb_note <> '' then 'Spare dispatched (refurbished)' else 'Spare dispatched' end,
          concat_ws(' · ', nullif(coalesce(new.part, ''), ''), nullif(coalesce(r.ucn, ''), ''),
                    nullif(coalesce(r.party_name, ''), '')) || refurb_note,
          '/spare-requests');
  return new;
end $$;
  $body$;
end $mirror$;
