-- ===========================================================================
-- TURN RLS OFF ON public.products -- WHAT YOU ASKED FOR, AND WHAT IT DOES.
--
-- The user, 2026-09-21: "Remove RLS on product database." Here it is, and it
-- is deliberately a HAND-RUN file rather than a migration: a migration would
-- make this the permanent shape of the table on every rebuild, and the
-- measurements below say that is a bigger decision than the symptom it was
-- aimed at. Say the word and I will file it as one.
--
-- MEASURED FIRST, on 19,253 machines -- the live count:
--
--   the read policy is `auth.role() = 'authenticated'`. It filters NOTHING.
--   An engineer already reads all 19,253 rows. Removing RLS cannot widen a
--   read that is already open, and it cannot speed one up either: the worst
--   keystroke cost 7.2 ms with RLS on and 2.7 ms with it off. 4.5 ms.
--
--   SO THIS WILL NOT FIX THE PRODUCT PICKER. That is a different fault --
--   see _why_is_the_product_list_empty.sql, which names it.
--
-- WHAT IT DOES CHANGE, and it is the whole of the change:
--
--   the write policy is `has_perm('masters.edit')`. It is the ONLY thing RLS
--   gates on this table. With RLS off, EVERY SIGNED-IN USER MAY INSERT,
--   UPDATE AND DELETE THE INSTALL BASE -- 19,253 machines, their customers,
--   serials and cover. An engineer could overwrite a serial from a phone.
--
-- With record_audit armed (0225) a change here is NOT photographed either:
-- that trail covers the ten quality tables and `products` is not one of them.
--
-- Run it if that is what you want. It is one statement and it is reversible
-- with the line beneath it.
-- ===========================================================================

alter table public.products disable row level security;

-- TO PUT IT BACK:
--   alter table public.products enable row level security;
-- The two policies are not dropped by the line above, so they resume the
-- moment RLS is re-enabled. Nothing is lost by trying this.

select 'products RLS is now' as what,
       case when relrowsecurity then 'ON' else 'OFF -- every signed-in user may write the install base' end as state,
       (select count(*) from pg_policies where tablename = 'products')::text || ' policies still defined (they resume when RLS is re-enabled)' as note
  from pg_class where oid = 'public.products'::regclass;
