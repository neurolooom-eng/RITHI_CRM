-- ===========================================================================
-- 0392 — A SPARE REQUEST, A STOCK TRANSFER AND A MATERIAL RETURN ARE SAVED
--        WHOLE OR NOT AT ALL (second re-review D-044)
--
-- addSpareRequest, addStockTransfer and addMaterialReturn (supabase.ts) wrote a
-- header (or the first row), then the lines in a second request, and on a
-- failed line DELETED what they had written without checking the result.
-- Measured on a database:
--   * the engineer's own spare request delete is refused by the retention
--     guard (0049), so a request with no lines stayed, its OR number consumed;
--   * mr_delete admits only an administrator, so for anybody else the first
--     return row stayed -- and it had already taken the stock off the engineer;
--   * stock_transfers has no delete policy, so an empty transfer header stayed;
-- and each screen reported the line error as though nothing had been saved.
--
-- The cure is not a delete that works: it is one transaction. Each function
-- below writes the header and every line in ONE call, so a refused line rolls
-- the header back with it and nothing is left half-saved. They are SECURITY
-- INVOKER: they run as the caller, so every row-level policy, guard and stamp
-- that applied to the two requests applies unchanged -- they add no right.
-- Only the keys the caller sends are written; every other column keeps its
-- default, and the numbers (uid, OR number, row numbers) are still the
-- database's. The screens call these instead of the two requests.
-- In the handstock module, before 0385 / 0384 (which must stay last).
-- ===========================================================================

-- The columns of a public table that a jsonb row names, quoted, for an insert
-- that writes exactly those and leaves the rest to their defaults.
create or replace function public.jsonb_columns_of(p_table text, p_row jsonb)
returns text language sql stable security invoker set search_path = public as $$
  select string_agg(quote_ident(k), ', ' order by k)
    from jsonb_object_keys(coalesce(p_row, '{}'::jsonb)) k
   where exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = p_table
                    and c.column_name = k and c.is_generated = 'NEVER'
                    and coalesce(c.identity_generation, '') <> 'ALWAYS')
$$;
revoke execute on function public.jsonb_columns_of(text, jsonb) from public, anon;
grant execute on function public.jsonb_columns_of(text, jsonb) to authenticated;

-- ---- a spare request and its lines ---------------------------------------------
create or replace function public.save_spare_request(p_req jsonb, p_lines jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_cols text; v_uid text; v_or text;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A spare request needs at least one part' using errcode = '23514';
  end if;
  v_cols := public.jsonb_columns_of('spare_requests', p_req);
  if v_cols is null then
    raise exception 'A spare request needs its details' using errcode = '23514';
  end if;
  execute format('insert into public.spare_requests (%1$s) select %1$s from jsonb_populate_record(null::public.spare_requests, $1) returning uid, or_no', v_cols)
    into v_uid, v_or using p_req;
  -- RowNo is sent explicitly, as the screen did: every row of one insert fires
  -- the numbering trigger against the same snapshot.
  insert into public.spare_request_lines (request_uid, row_no, part, qty)
  select v_uid, t.n, r.part, coalesce(r.qty, 1)
    from jsonb_array_elements(p_lines) with ordinality t(x, n),
         jsonb_populate_record(null::public.spare_request_lines, t.x) r;
  return jsonb_build_object('uid', v_uid, 'or_no', v_or);
end $$;
revoke execute on function public.save_spare_request(jsonb, jsonb) from public, anon;
grant execute on function public.save_spare_request(jsonb, jsonb) to authenticated;

-- ---- a stock transfer and its lines ---------------------------------------------
create or replace function public.save_stock_transfer(p_header jsonb, p_lines jsonb)
returns text language plpgsql security invoker set search_path = public as $$
declare v_cols text; v_uid text;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A stock transfer needs at least one part' using errcode = '23514';
  end if;
  v_cols := public.jsonb_columns_of('stock_transfers', p_header);
  if v_cols is null then
    raise exception 'A stock transfer needs its engineers' using errcode = '23514';
  end if;
  execute format('insert into public.stock_transfers (%1$s) select %1$s from jsonb_populate_record(null::public.stock_transfers, $1) returning uid', v_cols)
    into v_uid using p_header;
  insert into public.stock_transfer_lines (transfer_uid, row_no, part, qty, reason)
  select v_uid, t.n, r.part, r.qty, btrim(coalesce(r.reason, ''))
    from jsonb_array_elements(p_lines) with ordinality t(x, n),
         jsonb_populate_record(null::public.stock_transfer_lines, t.x) r;
  return v_uid;
end $$;
revoke execute on function public.save_stock_transfer(jsonb, jsonb) from public, anon;
grant execute on function public.save_stock_transfer(jsonb, jsonb) to authenticated;

-- ---- a material return: one row per part, sharing the first row's uid -----------
create or replace function public.save_material_return(p_header jsonb, p_lines jsonb)
returns text language plpgsql security invoker set search_path = public as $$
declare v_row jsonb; v_cols text; v_uid text; t record;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A material return needs at least one part' using errcode = '23514';
  end if;
  for t in select x, n from jsonb_array_elements(p_lines) with ordinality u(x, n) order by n loop
    v_row := coalesce(p_header, '{}'::jsonb) || t.x || jsonb_build_object('source', 'app');
    if t.n > 1 then
      v_row := v_row || jsonb_build_object('uid', v_uid, 'row_no', t.n);
    end if;
    v_cols := public.jsonb_columns_of('material_returns', v_row);
    execute format('insert into public.material_returns (%1$s) select %1$s from jsonb_populate_record(null::public.material_returns, $1) returning uid', v_cols)
      into v_uid using v_row;
  end loop;
  return v_uid;
end $$;
revoke execute on function public.save_material_return(jsonb, jsonb) from public, anon;
grant execute on function public.save_material_return(jsonb, jsonb) to authenticated;
