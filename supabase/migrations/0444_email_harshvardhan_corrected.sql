-- ===========================================================================
-- 0444 -- AN EMAIL ADDRESS CORRECTED EVERYWHERE (the user, 2026-10-15:
-- "replace harshavardhan.singh@airliquide.com to harshvardhan.singh@airliquide.com
-- in all databases ... including the User Authentication in Supabase";
-- asked about the audit trails: "Change them as well").
--
-- Measured on the live project the same day: the User Master already carries
-- the new address (HARSH VARDHAN SINGH RAJPUT, Regional Manager), while the
-- login (auth.users, auth.identities -- email and password), the profile and
-- the working records still carried the old one; the 19 audit events under the
-- new address are all failed sign-ins. Old address found in: auth.users.email,
-- auth.identities.email / identity_data, profiles.email, audit_log.email,
-- call_report_reviews.reviewed_by_name, call_requests.email,
-- feedback.engineer_email, field_calls.email_address,
-- notifications.recipient_email, record_audit.actor_email / old_data /
-- new_data, reports.data / engineer_email, spare_consumption.engineer_email,
-- spare_dispatches.engineer_email, spare_requests.engineer_email.
--
-- HOW. Every text and JSON column of every public table is searched, so a
-- column holding the address that the measurement did not list is corrected
-- too. A table being corrected has its triggers switched off for the one
-- statement and on again straight after -- its guards (frozen requests,
-- immutable numbers, audit) would otherwise refuse a text correction or
-- recompute things that have not changed -- and each table corrected gets ONE
-- record_audit row saying what was done, so the correction is itself on the
-- record. All in one transaction: if anything fails, nothing changes.
-- Supabase Authentication is updated directly; the password is unchanged, so
-- he signs in with the new address and the same password.
-- ===========================================================================

do $fix$
declare
  v_old  constant text := 'harshavardhan.singh@airliquide.com';
  v_new  constant text := 'harshvardhan.singh@airliquide.com';
  v_pat  constant text := 'harshavardhan\.singh@airliquide\.com';
  r      record;
  n      bigint;
  v_skip text;
  t_rows bigint;
  v_tbl  text := '';
  v_log  jsonb := '[]'::jsonb;
begin
  -- ---- the public tables -------------------------------------------------
  for r in
    select c.table_name, c.column_name, c.data_type
      from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
                                       and tb.table_type = 'BASE TABLE'
     where c.table_schema = 'public'
       and c.data_type in ('text', 'character varying', 'jsonb', 'json')
       and c.is_generated = 'NEVER'
     order by c.table_name, c.column_name
  loop
    -- The audit rows this migration writes name the old address on purpose:
    -- they are the record of the correction, and are never themselves corrected.
    v_skip := case when r.table_name = 'record_audit'
                   then ' and not (op = ''BULK UPDATE'' and coalesce(new_data->>''note'', '''') like ''Email address corrected%%'')'
                   else '' end;
    execute format('select count(*) from public.%I where lower(%I::text) like %L' || v_skip,
                   r.table_name, r.column_name, '%' || v_old || '%') into n;
    continue when n = 0;
    execute format('alter table public.%I disable trigger user', r.table_name);
    execute format('update public.%I set %I = (regexp_replace(%I::text, %L, %L, %L))::%s where lower(%I::text) like %L' || v_skip,
                   r.table_name, r.column_name, r.column_name, v_pat, v_new, 'gi',
                   case r.data_type when 'character varying' then 'varchar' else r.data_type end,
                   r.column_name, '%' || v_old || '%');
    get diagnostics t_rows = row_count;
    execute format('alter table public.%I enable trigger user', r.table_name);
    v_log := v_log || jsonb_build_object('table', r.table_name, 'column', r.column_name, 'rows', t_rows);
    raise notice '0444: public.%.% -- % row(s)', r.table_name, r.column_name, t_rows;
  end loop;

  -- One record per table corrected, so the correction is on the record.
  if to_regclass('public.record_audit') is not null and jsonb_array_length(v_log) > 0 then
    insert into public.record_audit (table_name, op, record_key, actor, actor_email, old_data, new_data)
    select e->>'table', 'BULK UPDATE', null, null, null,
           jsonb_build_object('email', v_old),
           jsonb_build_object('email', v_new, 'columns', jsonb_agg(jsonb_build_object('column', e->>'column', 'rows', (e->>'rows')::int)),
                              'note', 'Email address corrected everywhere (0444, the user 2026-10-15).')
      from jsonb_array_elements(v_log) e
     group by e->>'table';
  end if;

  -- ---- Supabase Authentication -------------------------------------------
  update auth.users set email = v_new where lower(email) = v_old;
  get diagnostics n = row_count;
  raise notice '0444: auth.users -- % row(s)', n;

  if to_regclass('auth.identities') is not null then
    update auth.identities
       set identity_data = (regexp_replace(identity_data::text, v_pat, v_new, 'gi'))::jsonb
     where lower(identity_data::text) like '%' || v_old || '%';
    get diagnostics n = row_count;
    raise notice '0444: auth.identities.identity_data -- % row(s)', n;
    -- `email` is generated from identity_data on current Supabase; where it is
    -- an ordinary column it is written too.
    if exists (select 1 from information_schema.columns
                where table_schema = 'auth' and table_name = 'identities' and column_name = 'email'
                  and is_generated = 'NEVER') then
      update auth.identities set email = v_new where lower(email) = v_old;
    end if;
  end if;
end $fix$;
