-- ===========================================================================
-- THE KNOWLEDGE BASE ASKS FOR A KNOWN LOGIN, NOT JUST A SIGNED-IN ONE (D-074).
--
-- 0042 let "everyone signed in" read Field Solutions and "any signed-in user"
-- write one. Signed in is not the same as known: a Supabase Auth account with
-- no profile and no User Master row is signed in, and FRS-210.5 says it holds
-- nothing. These two policies did not go through has_perm(), so 0300 could not
-- reach them.
--
-- A PROFILE is the test -- my_role() is NULL only when there is none (it reads
-- a blank role as engineer). Every person the app admits has one, so nobody
-- who can use Field Solutions today loses it. Wrapped in a sub-select so it is
-- asked once per query, not once per article (0250).
-- Edit and delete are untouched: they already need the author or an admin.
-- ===========================================================================

drop policy if exists kb_read on public.kb_articles;
create policy kb_read on public.kb_articles for select
  using ((select public.my_role()) is not null);

drop policy if exists kb_insert on public.kb_articles;
create policy kb_insert on public.kb_articles for insert
  with check ((select public.my_role()) is not null);
