-- ===========================================================================
-- THE SHARED TRACKER (0143).
--
-- "shared between me and a few other. all who have access should be able add,
--  edit" -- so the access model is ONE permission, and that is what this holds:
--
--   * mod:/tracker reads AND writes. Not two rights, because the user asked for
--     one, and two would need two ticks to undo.
--   * WITHOUT it, nothing at all -- not a read, not an insert. A shared list a
--     stranger can see is not shared with a few people.
--   * the stamps are the DATABASE's. A client cannot forget who edited a row,
--     and cannot claim to be somebody else.
--   * an edit CANNOT rewrite who raised it, or when.
--
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('7a7a7a7a-0000-0000-0000-000000000001','trk_in@x.com'),
 ('7a7a7a7a-0000-0000-0000-000000000002','trk_out@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('7a7a7a7a-0000-0000-0000-000000000001','trk_in@x.com','Trk Insider','nsm'),
 ('7a7a7a7a-0000-0000-0000-000000000002','trk_out@x.com','Trk Outsider','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
-- The insider's role holds mod:/tracker; the outsider's must NOT.
insert into public.app_roles (role, permissions) values
 ('nsm', '["mod:/tracker","calls.view"]'::jsonb)
on conflict (role) do update set permissions = (
  select coalesce(jsonb_agg(distinct v), '[]'::jsonb) from (
    select jsonb_array_elements_text(app_roles.permissions) as v
    union select unnest(array['mod:/tracker','calls.view'])) u);
update public.app_roles set permissions = permissions - 'mod:/tracker' where role = 'engineer';

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

delete from public.tracker_items where title like 'TRK %';

\echo '--- 1. ONE PERMISSION READS AND WRITES ---'
\echo 'expect: the insert succeeds and the row comes back. Seeing the page IS'
\echo 'expect: the right to change it -- the user asked for one permission, and'
\echo 'expect: splitting it would take two ticks to undo.'
call public.be('trk_in@x.com');
begin;
  set local role authenticated;
  insert into public.tracker_items (title, detail, owner, area)
       values ('TRK first', 'raised by the insider', 'Me', 'Calls');
  select title, status, owner from public.tracker_items where title = 'TRK first';
commit;

\echo '--- 2. ...and the same person may EDIT what anyone raised ---'
\echo 'expect: In progress -- a shared list is shared both ways; an item only'
\echo 'expect: its author could move would be a personal list on a shared page.'
begin;
  set local role authenticated;
  update public.tracker_items set status = 'In progress' where title = 'TRK first';
  select title, status from public.tracker_items where title = 'TRK first';
commit;

\echo '--- 3. WITHOUT THE PERMISSION, NOTHING ---'
\echo 'expect: 0 rows -- not an error, just nothing. RLS hides rather than'
\echo 'expect: refuses on a read, which is what makes "a few people" mean it.'
call public.be('trk_out@x.com');
begin;
  set local role authenticated;
  select count(*) as rows_the_outsider_can_see from public.tracker_items;
commit;

\echo 'expect ERROR: the outsider cannot add either (row-level security)'
begin;
  set local role authenticated;
  insert into public.tracker_items (title) values ('TRK sneaked in');
commit;

\echo 'expect: 0 -- nothing was written'
select count(*) from public.tracker_items where title = 'TRK sneaked in';

\echo '--- 4. THE STAMPS ARE THE DATABASE''S ---'
\echo 'expect: created_by and updated_by are BOTH the insider''s id, even though'
\echo 'expect: the insert named neither. A client cannot forget them.'
call public.be('trk_in@x.com');
begin;
  set local role authenticated;
  select created_by = '7a7a7a7a-0000-0000-0000-000000000001'::uuid as created_stamped,
         updated_by = '7a7a7a7a-0000-0000-0000-000000000001'::uuid as updated_stamped
    from public.tracker_items where title = 'TRK first';
commit;

\echo '--- 5. AN EDIT CANNOT REWRITE WHO RAISED IT ---'
\echo 'expect: t t -- the update TRIES to set created_by to the outsider and a'
\echo 'expect: created_at of 2001, and the trigger puts both back. Authorship on'
\echo 'expect: a shared list is not a field somebody can type over.'
begin;
  set local role authenticated;
  update public.tracker_items
     set created_by = '7a7a7a7a-0000-0000-0000-000000000002'::uuid,
         created_at = timestamptz '2001-01-01',
         detail = 'edited'
   where title = 'TRK first';
  select created_by = '7a7a7a7a-0000-0000-0000-000000000001'::uuid as author_unchanged,
         created_at > timestamptz '2020-01-01' as raised_at_unchanged
    from public.tracker_items where title = 'TRK first';
commit;

\echo '--- 6. A CLOSED ITEM STAYS ON THE LIST ---'
\echo 'expect: t -- Done sets is_closed, and the ROW is still there. The page'
\echo 'expect: hides it; the database keeps it. A shared list people delete from'
\echo 'expect: is one nobody trusts: the thing you remember agreeing is simply'
\echo 'expect: gone, with no way to tell whether it was finished or abandoned.'
begin;
  set local role authenticated;
  update public.tracker_items set status = 'Done' where title = 'TRK first';
  select is_closed, title from public.tracker_list where title = 'TRK first';
commit;

\echo '--- 7. AN INVENTED STATUS IS REFUSED ---'
\echo 'expect ERROR: tracker_items_status_check -- the five are the vocabulary,'
\echo 'expect: so a typo cannot quietly create a sixth column of the board.'
begin;
  set local role authenticated;
  update public.tracker_items set status = 'Sort of done' where title = 'TRK first';
commit;

\echo '--- 8. THE LIST SHOWS NAMES, not UUIDs ---'
\echo 'expect: Trk Insider on both -- resolved once, in the view, so two screens'
\echo 'expect: cannot disagree about who did something.'
begin;
  set local role authenticated;
  select created_by_name, updated_by_name from public.tracker_list where title = 'TRK first';
commit;
