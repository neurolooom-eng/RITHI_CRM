-- ===========================================================================
-- WHAT WRITE AUTHORITY DO THE READ-ONLY ROLES HOLD?
--
-- READ-ONLY. Changes nothing. Run it in the Supabase SQL editor.
--
-- The status row fails on EITHER of two clauses, and they mean opposite
-- things, so the first job is to say WHICH:
--
--   A. DIFFERENCE -- technical_support holds a key zoho_migration does not.
--                    EXPECTED, not a fault: a clone seeds a role ONCE and is
--                    not a standing mirror (the user's rule, 2026-09-13), so
--                    the two are meant to diverge. Listed because it answers
--                    "why can one of them do this and the other not?", which
--                    is a real question with an innocent answer.
--   B. A WRITE ACTION on a role described as read-only, on EITHER role.
--                    This one matters -- but it is a QUESTION, not a verdict.
--                    `review.edit` on technical_support was ticked deliberately
--                    (2026-09-13) and kept. So a line here means "somebody
--                    granted this; is that still what you want?", and NOT
--                    "a bundle is missing". No bundle can remove it: 0145
--                    merges and never takes away.
-- ===========================================================================
select 'A. present?' as clause,
       coalesce((select 'zoho_migration row exists' from public.app_roles
                  where role = 'zoho_migration'), 'MISSING -- rbac.sql has not run') as finding
union all
select 'A. difference (expected)', 'technical_support has, zoho_migration lacks: ' || m.v
  from public.app_roles ts, lateral jsonb_array_elements_text(ts.permissions) m(v)
 where ts.role = 'technical_support'
   and not exists (select 1 from public.app_roles zm
                    where zm.role = 'zoho_migration' and zm.permissions ? m.v)
union all
select 'B. write action', r.role || ' HOLDS the write action: ' || m.v
  from public.app_roles r, lateral jsonb_array_elements_text(r.permissions) m(v)
 where r.role in ('zoho_migration', 'technical_support')
   and m.v in ('calls.create','calls.edit','calls.report','calls.cancel','calls.allot',
               'masters.edit','cover.edit','ownership.transfer','review.edit',
               'spare.request','spare.dispatch','spare.drop','stock.transfer','stock.return',
               'consumption.reconcile','pending.register','request.create','install.create',
               'docs.manage','qms.manage','users.manage','config.manage','rbac.manage')
union all
select 'counts', r.role || ' = ' || jsonb_array_length(r.permissions) || ' permissions'
  from public.app_roles r
 where r.role in ('admin','technical_support','zoho_migration')
order by 1, 2;
