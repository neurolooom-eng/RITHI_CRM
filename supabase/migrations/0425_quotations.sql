-- ===========================================================================
-- 0425  QUOTATIONS -- for a service contract on a customer's machines, for
-- spares, or both on the one document (the user, 2026-10-13: "Quote
-- Generation for Both Product Contract + Spares").
--
-- ONE REGISTER, TWO KINDS OF LINE. A quotation is a header (who it is for,
-- when, how long it stands, its terms) and its lines; each line is either a
-- CONTRACT line -- one machine, model and serial, AMC or CMC, a period and a
-- rate -- or a SPARE line -- a Part Master part, HSN, quantity and a unit
-- price. A quotation may carry only contract lines, only spare lines, or
-- both, so a customer renewing a contract and buying a kit gets one document.
--
-- THE MONEY IS WORKED OUT HERE, ONCE. Taxable, GST and total on a line are
-- GENERATED columns from quantity, unit price, discount and GST %, so a line
-- cannot carry a total that disagrees with its own figures however it was
-- written; src/lib/quotes.ts is the client's copy of the same arithmetic for
-- the as-you-type preview, and quotations_test.sql asserts the two agree on
-- the awkward cases (a discount, a fraction, a 0% GST line).
--
-- THE NUMBER IS THE DATABASE'S: QT/YY/NNNN, the two-digit year of when the
-- quotation is raised (India time), restarting at 0001 each year, given on
-- insert and kept on every update -- the PDQC/RCY pattern (0355, 0378).
--
-- PREPARED BY IS THE SESSION'S (the 0113/0114 rule): stamped from auth.uid()
-- with the profile's name; whatever the browser sends is discarded.
--
-- A QUOTATION IS NEVER DELETED. It moves Draft -> Sent -> Accepted / Declined,
-- or Cancelled; once Accepted, Declined or Cancelled it is FROZEN -- header
-- and lines alike -- and a change is refused by the database, naming the
-- quotation and its status. A price has to change? REVISE it: the screen
-- copies it into a new Draft that records which number it revises
-- (revision_of), so what was sent stays exactly as it was sent.
--
-- KEYS: mod:/quotations opens the page and reads the rows; quote.edit raises,
-- edits, revises and moves the status. The page key goes to admin,
-- technical_support, nsm and commercial; quote.edit to admin, nsm and
-- commercial. Every other grant is made on Roles & Permissions.
-- ===========================================================================

create table if not exists public.quotations (
  id            bigint generated always as identity primary key,
  quote_no      text,                                   -- QT/YY/NNNN, the database's (below)
  quote_date    date not null default ((now() at time zone 'Asia/Kolkata')::date),
  valid_until   date,
  party_name    text not null check (btrim(party_name) <> ''),
  party_address text not null default '',
  party_city    text not null default '',
  party_state   text not null default '',
  party_pincode text not null default '',
  party_gstin   text not null default '',
  party_pan     text not null default '',
  contact_name  text not null default '',
  contact_phone text not null default '',
  contact_email text not null default '',
  subject       text not null default '',
  customer_ref  text not null default '',
  status        text not null default 'Draft'
                check (status in ('Draft', 'Sent', 'Accepted', 'Declined', 'Cancelled')),
  status_by     uuid,
  status_at     timestamptz,
  terms         text not null default '',
  remarks       text not null default '',
  revision_of   text not null default '',
  prepared_by   uuid,
  prepared_by_name text not null default '',
  created_at    timestamptz not null default now(),
  updated_by    uuid,
  updated_at    timestamptz not null default now(),
  constraint quotations_valid_until_after_date check (valid_until is null or valid_until >= quote_date)
);

comment on table public.quotations is
  'A quotation to a customer (0425): a service contract on their machines, spares, or both on one document. Numbered QT/YY/NNNN by the database; Prepared by stamped from the session. Never deleted: Cancelled instead, and frozen once Accepted, Declined or Cancelled -- a change is a revision (revision_of).';
comment on column public.quotations.revision_of is
  'The quote_no this quotation revises, where it was raised by Revise on a frozen one; blank otherwise.';

create index if not exists quotations_date on public.quotations (quote_date desc, id desc);
create index if not exists quotations_party on public.quotations (party_name);

create table if not exists public.quotation_lines (
  id            bigint generated always as identity primary key,
  quote_id      bigint not null references public.quotations (id) on delete cascade,
  row_no        integer not null default 1,
  line_type     text not null check (line_type in ('Contract', 'Spare')),
  description   text not null check (btrim(description) <> ''),
  -- a CONTRACT line: the machine, the cover sold and the period
  product_name  text not null default '',
  serial_number text not null default '',
  cover_type    text not null default '',
  period_months integer check (period_months is null or period_months > 0),
  period_start  date,
  period_end    date,
  -- a SPARE line: the Part Master part
  part_code     text not null default '',
  hsn_code      text not null default '',
  -- the money, on every line
  qty           numeric not null default 1  check (qty > 0),
  unit_price    numeric not null default 0  check (unit_price >= 0),
  discount_pct  numeric not null default 0  check (discount_pct >= 0 and discount_pct <= 100),
  gst_pct       numeric not null default 18 check (gst_pct >= 0 and gst_pct <= 100),
  taxable_amount numeric generated always as
    (round(qty * unit_price * (1 - discount_pct / 100), 2)) stored,
  tax_amount     numeric generated always as
    (round(round(qty * unit_price * (1 - discount_pct / 100), 2) * gst_pct / 100, 2)) stored,
  total_amount   numeric generated always as
    (round(qty * unit_price * (1 - discount_pct / 100), 2)
     + round(round(qty * unit_price * (1 - discount_pct / 100), 2) * gst_pct / 100, 2)) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- A contract line sells cover on ONE machine: it names the serial and says
  -- which cover (the WGP / OGP / CMC / AMC vocabulary; a contract is one of
  -- the last two). A spare line names a Part Master part.
  constraint quotation_lines_contract_shape check
    (line_type <> 'Contract' or (btrim(serial_number) <> '' and cover_type in ('AMC', 'CMC') and period_months is not null)),
  constraint quotation_lines_spare_shape check
    (line_type <> 'Spare' or btrim(part_code) <> ''),
  constraint quotation_lines_period check
    (period_end is null or period_start is null or period_end >= period_start)
);

comment on table public.quotation_lines is
  'The lines of a quotation (0425): Contract (one machine, AMC or CMC, a period, a rate) or Spare (a Part Master part, HSN, quantity, unit price). Taxable, GST and total are generated from qty, unit_price, discount_pct and gst_pct. Frozen with the quotation once it is Accepted, Declined or Cancelled.';

create index if not exists quotation_lines_quote on public.quotation_lines (quote_id, row_no, id);
create index if not exists quotation_lines_part on public.quotation_lines (part_code) where part_code <> '';
create index if not exists quotation_lines_serial on public.quotation_lines (serial_number) where serial_number <> '';

-- ---------------------------------------------------------------------------
-- QT/YY/NNNN -- the next number for the year the quotation is raised in.
-- Serialised per year with an advisory lock, as PDQC/YY/NNNN is (0378).
-- Internal: reached only from the trigger below, so the API roles cannot
-- call it (row 189's rule).
-- ---------------------------------------------------------------------------
create or replace function public.quote_next_no(p_at timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare
  yy text := to_char(p_at at time zone 'Asia/Kolkata', 'YY');
  n  integer;
begin
  perform pg_advisory_xact_lock(hashtext('quote_no:' || yy));
  select coalesce(max(nullif(split_part(quote_no, '/', 3), '')::int), 0) into n
    from public.quotations where quote_no like 'QT/' || yy || '/%';
  return 'QT/' || yy || '/' || lpad((n + 1)::text, 4, '0');
end $$;
revoke execute on function public.quote_next_no(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- THE HEADER'S STAMPS AND ITS FREEZE, in one before-row trigger.
--   * number given on insert, kept on update, whatever was sent;
--   * prepared_by / prepared_by_name from the session on insert (a value sent
--     by the browser is discarded); kept on update;
--   * status_by / status_at stamped when the status changes;
--   * a quotation that is Accepted, Declined or Cancelled refuses every
--     change -- the document that was sent stays as it was sent.
-- ---------------------------------------------------------------------------
create or replace function public.quotation_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  new.party_name := btrim(new.party_name);
  if tg_op = 'INSERT' then
    new.quote_no   := public.quote_next_no(now());
    new.created_at := now();
    if auth.uid() is not null then
      new.prepared_by := auth.uid();
      select coalesce(nullif(btrim(p.full_name), ''), p.email, '') into v_name
        from public.profiles p where p.id = auth.uid();
      new.prepared_by_name := coalesce(v_name, '');
    end if;
    new.status_by := case when new.status <> 'Draft' then auth.uid() end;
    new.status_at := case when new.status <> 'Draft' then now() end;
  else
    if old.status in ('Accepted', 'Declined', 'Cancelled') then
      raise exception 'Quotation % is % and cannot be changed. Revise it into a new quotation instead.',
        old.quote_no, old.status using errcode = 'check_violation';
    end if;
    new.quote_no         := old.quote_no;
    new.created_at       := old.created_at;
    new.prepared_by      := old.prepared_by;
    new.prepared_by_name := old.prepared_by_name;
    if new.status is distinct from old.status then
      new.status_by := auth.uid();
      new.status_at := now();
    else
      new.status_by := old.status_by;
      new.status_at := old.status_at;
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
revoke execute on function public.quotation_stamp() from public, anon, authenticated;

drop trigger if exists zz_quotation_stamp on public.quotations;
create trigger zz_quotation_stamp before insert or update on public.quotations
  for each row execute function public.quotation_stamp();

-- A LINE FOLLOWS ITS QUOTATION'S FREEZE: nothing is added to, changed on or
-- removed from a quotation that is Accepted, Declined or Cancelled.
create or replace function public.quotation_line_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  q record;
begin
  if tg_op = 'DELETE' then
    select quote_no, status into q from public.quotations where id = old.quote_id;
  else
    select quote_no, status into q from public.quotations where id = new.quote_id;
  end if;
  if q.status in ('Accepted', 'Declined', 'Cancelled') then
    raise exception 'Quotation % is % and its lines cannot be changed. Revise it into a new quotation instead.',
      q.quote_no, q.status using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.description   := btrim(new.description);
  new.part_code     := upper(btrim(new.part_code));
  new.serial_number := btrim(new.serial_number);
  new.cover_type    := upper(btrim(new.cover_type));
  if tg_op = 'INSERT' then new.created_at := now(); else new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.quotation_line_guard() from public, anon, authenticated;

drop trigger if exists zz_quotation_line_guard on public.quotation_lines;
create trigger zz_quotation_line_guard before insert or update or delete on public.quotation_lines
  for each row execute function public.quotation_line_guard();

-- ---------------------------------------------------------------------------
-- THE REGISTER: every quotation with its line counts and totals. The columns
-- are LISTED rather than `q.*`, so the system columns 0244 attaches later do
-- not change the view's shape (the 0245 rule). security_invoker, so the
-- quotations read policy bounds it.
-- ---------------------------------------------------------------------------
create or replace view public.quotation_register with (security_invoker = on) as
select q.id, q.quote_no, q.quote_date, q.valid_until, q.party_name, q.party_city, q.party_state,
       q.contact_name, q.subject, q.customer_ref, q.status, q.status_at, q.revision_of,
       q.prepared_by, q.prepared_by_name, q.created_at, q.updated_at,
       coalesce(l.lines, 0)          as lines,
       coalesce(l.contract_lines, 0) as contract_lines,
       coalesce(l.spare_lines, 0)    as spare_lines,
       coalesce(l.taxable_total, 0)  as taxable_total,
       coalesce(l.tax_total, 0)      as tax_total,
       coalesce(l.grand_total, 0)    as grand_total
  from public.quotations q
  left join lateral (
    select count(*)                                          as lines,
           count(*) filter (where line_type = 'Contract')    as contract_lines,
           count(*) filter (where line_type = 'Spare')       as spare_lines,
           sum(taxable_amount)                               as taxable_total,
           sum(tax_amount)                                   as tax_total,
           sum(total_amount)                                 as grand_total
      from public.quotation_lines x where x.quote_id = q.id) l on true;
grant select on public.quotation_register to authenticated;

-- ---------------------------------------------------------------------------
-- WHO MAY. The page key reads; quote.edit writes. No DELETE on a quotation
-- (Cancelled instead); a line may be removed from a quotation that is not
-- frozen, which is what editing a draft is.
-- ---------------------------------------------------------------------------
alter table public.quotations enable row level security;
drop policy if exists quotations_read on public.quotations;
create policy quotations_read on public.quotations for select
  using ((select public.has_perm('mod:/quotations')) or (select public.has_perm('quote.edit')));
drop policy if exists quotations_insert on public.quotations;
create policy quotations_insert on public.quotations for insert
  with check ((select public.has_perm('quote.edit')));
drop policy if exists quotations_update on public.quotations;
create policy quotations_update on public.quotations for update
  using ((select public.has_perm('quote.edit')))
  with check ((select public.has_perm('quote.edit')));
revoke all on public.quotations from anon;
revoke delete, truncate on public.quotations from authenticated;
grant select, insert, update on public.quotations to authenticated;

alter table public.quotation_lines enable row level security;
drop policy if exists quotation_lines_read on public.quotation_lines;
create policy quotation_lines_read on public.quotation_lines for select
  using ((select public.has_perm('mod:/quotations')) or (select public.has_perm('quote.edit')));
drop policy if exists quotation_lines_write on public.quotation_lines;
create policy quotation_lines_write on public.quotation_lines for all
  using ((select public.has_perm('quote.edit')))
  with check ((select public.has_perm('quote.edit')));
revoke all on public.quotation_lines from anon;
revoke truncate on public.quotation_lines from authenticated;
grant select, insert, update, delete on public.quotation_lines to authenticated;

-- The system columns, where 0244 has already run (a fresh apply reaches
-- sys_columns last and covers both tables then).
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.quotations'::regclass);
    perform public.sys_columns_attach('public.quotation_lines'::regclass);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- THE KEYS, MERGED INTO THE STORED ROLES (never overwritten; a role with an
-- empty row is left alone). The page to admin, technical_support, nsm and
-- commercial; raising and editing to admin, nsm and commercial.
-- ---------------------------------------------------------------------------
do $$
declare n integer; m integer;
begin
  if to_regclass('public.app_roles') is null then return; end if;
  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (select jsonb_array_elements_text(ar.permissions) as v
                   union select unnest(array['mod:/quotations']) as v) u),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and ar.role in ('admin', 'technical_support', 'nsm', 'commercial')
     and not (ar.permissions ? 'mod:/quotations');
  get diagnostics n = row_count;
  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (select jsonb_array_elements_text(ar.permissions) as v
                   union select unnest(array['quote.edit']) as v) u),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and ar.role in ('admin', 'nsm', 'commercial')
     and not (ar.permissions ? 'quote.edit');
  get diagnostics m = row_count;
  raise notice '0425: Quotations page key given to admin, technical_support, nsm, commercial (% rows); quote.edit to admin, nsm, commercial (% rows) -- grant the rest on Roles & Permissions', n, m;
end $$;
