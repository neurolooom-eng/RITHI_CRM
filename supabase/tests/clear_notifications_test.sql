-- ===========================================================================
-- SIGNING OUT CLEARS YOUR NOTIFICATIONS (0123).
--
-- What this suite is really holding:
--   * it clears MINE and nobody else's — the one thing that would matter if it
--     were ever wrong, since the function runs as its definer and so bypasses
--     the row policy that would otherwise stop it;
--   * it clears UNREAD ones too, because sign-out is the clearing event and
--     not "having read it";
--   * signed out already, it deletes NOTHING rather than everything — the
--     null-uid case is the one that turns a scoped delete into a table wipe;
--   * a direct delete is still refused — Supabase grants `authenticated` every
--     table privilege and leaves RLS to decide, so what protects a row here is
--     the ABSENCE of a delete policy, not the absence of a grant. Worth
--     asserting as the thing it actually is;
--   * running it twice is not an error.
--
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('c1c1c1c1-0000-0000-0000-000000000001','cn_one@x.com'),
 ('c1c1c1c1-0000-0000-0000-000000000002','cn_two@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('c1c1c1c1-0000-0000-0000-000000000001','cn_one@x.com','CN One','engineer'),
 ('c1c1c1c1-0000-0000-0000-000000000002','cn_two@x.com','CN Two','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- Four for One (two of them UNREAD), two for Two. Inserted as superuser: the
-- table has no insert policy, only the notify triggers write it.
delete from public.notifications where recipient_email like 'cn_%@x.com';
insert into public.notifications (recipient_id, recipient_email, kind, title, read) values
 ('c1c1c1c1-0000-0000-0000-000000000001','cn_one@x.com','call_allotted','One A', true),
 ('c1c1c1c1-0000-0000-0000-000000000001','cn_one@x.com','call_allotted','One B', true),
 ('c1c1c1c1-0000-0000-0000-000000000001','cn_one@x.com','spare_dispatched','One C unread', false),
 ('c1c1c1c1-0000-0000-0000-000000000001','cn_one@x.com','spare_dispatched','One D unread', false),
 ('c1c1c1c1-0000-0000-0000-000000000002','cn_two@x.com','call_allotted','Two A', true),
 ('c1c1c1c1-0000-0000-0000-000000000002','cn_two@x.com','spare_dispatched','Two B unread', false);

\echo '--- 1. before: One has 4 (2 unread), Two has 2 (1 unread) ---'
select recipient_email, count(*) as rows, count(*) filter (where not read) as unread
  from public.notifications where recipient_email like 'cn_%@x.com'
 group by 1 order by 1;

\echo '--- 2. a direct delete removes NOTHING, even of your own rows ---'
\echo 'expect: DELETE 0, and all 4 still there — no delete policy exists, so'
\echo 'expect: the function below is the only route'
call public.be('cn_one@x.com');
begin;
  set local role authenticated;
  delete from public.notifications where recipient_email = 'cn_one@x.com';
commit;
select count(*) as one_still_has from public.notifications where recipient_email = 'cn_one@x.com';

\echo '--- 3. One signs out: 4 cleared, READ AND UNREAD ---'
\echo 'expect: 4'
call public.be('cn_one@x.com');
begin;
  set local role authenticated;
  select public.clear_my_notifications() as cleared;
commit;

\echo '--- 4. and TWO still has both of theirs ---'
\echo 'expect: cn_two@x.com | 2 | 1, and no row for cn_one'
select recipient_email, count(*) as rows, count(*) filter (where not read) as unread
  from public.notifications where recipient_email like 'cn_%@x.com'
 group by 1 order by 1;

\echo '--- 5. signing out again clears nothing, and is not an error ---'
\echo 'expect: 0'
call public.be('cn_one@x.com');
begin;
  set local role authenticated;
  select public.clear_my_notifications() as cleared;
commit;

\echo '--- 6. NOT SIGNED IN clears nothing — it must not wipe the table ---'
\echo 'expect: 0'
call public.be('nobody@x.com');            -- leaves harness.uid null
begin;
  set local role authenticated;
  select public.clear_my_notifications() as cleared;
commit;

\echo '--- 7. Two is still untouched by all of that ---'
\echo 'expect: cn_two@x.com | 2 | 1'
select recipient_email, count(*) as rows, count(*) filter (where not read) as unread
  from public.notifications where recipient_email like 'cn_%@x.com'
 group by 1 order by 1;

\echo '--- 8. Two signs out too ---'
\echo 'expect: 2, then no cn_ rows left at all'
call public.be('cn_two@x.com');
begin;
  set local role authenticated;
  select public.clear_my_notifications() as cleared;
commit;
select count(*) as cn_rows_left from public.notifications where recipient_email like 'cn_%@x.com';

\echo '--- 9. there is NO delete policy on the table — that is what test 2 proves ---'
\echo 'expect: 0'
select count(*) as delete_policies from pg_policies
 where schemaname='public' and tablename='notifications' and cmd='DELETE';

\echo '--- 10. and the function is not executable by PUBLIC ---'
\echo 'expect: f'
select has_function_privilege('public', 'public.clear_my_notifications()', 'execute') as public_may_run;
