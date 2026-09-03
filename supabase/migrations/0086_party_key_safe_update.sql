-- ===========================================================================
-- "UPDATE requires a WHERE clause" — the Party Master upload, stopped at row 1.
--
-- Supabase runs PostgREST with pg_safeupdate loaded, so ANY update or delete
-- without a WHERE clause is refused for the API roles — including one inside a
-- SECURITY DEFINER function, because the guard is a session setting and not a
-- privilege. `next_party_key()` bumped its counter with
--
--     update public.party_key_seq set last_no = last_no + 1 returning ...
--
-- which is unambiguous (the table holds exactly one row, by primary key) but
-- has no WHERE — so the first inserted party raised, and 5,873 rows landed
-- nowhere. It never showed in psql, where the guard is not loaded.
--
-- The counter row is `singleton`. Name it.
-- ===========================================================================

create or replace function public.next_party_key()
returns text language plpgsql security definer set search_path = public as $$
declare v_no bigint;
begin
  insert into public.party_key_seq (singleton, last_no)
  values (true, coalesce((select max(nullif(regexp_replace(party_key, '^Party-', ''), '')::bigint)
                            from public.parties where party_key ~ '^Party-[0-9]+$'), 0))
  on conflict (singleton) do nothing;

  update public.party_key_seq set last_no = last_no + 1
   where singleton
  returning last_no into v_no;
  return 'Party-' || v_no;
end $$;
grant execute on function public.next_party_key() to authenticated;
