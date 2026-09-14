-- ===========================================================================
-- 0193 — THE PRODUCT MASTER: the catalogue of product LINES.
--
-- The user, 2026-09-14: "Add a Separate Product Master - Which is the Actual
-- List of Product Lines along with all Details -- With Active and Inactive
-- [All Inactive Products can never have a new Sale Entry, But can still have
-- Contract or Calls or Basically everything other than New Sale Entry]".
--
-- THE TWO ARE NOT THE SAME REGISTER AND NEVER WERE:
--
--   public.products         the INSTALL BASE — one row per MACHINE, model and
--                           serial, its customer and its cover. Labelled
--                           PRODUCT DATABASE since 0192.
--   public.product_master   THIS — one row per PRODUCT LINE. 53 of them today.
--                           No customer, no serial, no cover.
--
-- THE KEY IS THE PRODUCT CODE, measured against the user's own ProductList
-- export rather than assumed: 53 rows, 53 distinct Product Codes, but only 43
-- distinct Product NAMES. CPX CARE alone has NINE codes, EXTEND-XT two, HORUS
-- two — and within CPX CARE some codes are Active and some Inactive. So a rule
-- written on the NAME would be wrong nine times over on that product alone.
--
-- `active` IS THE WHOLE POINT OF THE TABLE. 23 of the 53 are Active and 30
-- Inactive, and the rule the user gave is precise: an inactive line takes NO
-- NEW SALE ENTRY, and everything else — contracts, calls, visits, spares,
-- feedback — carries on exactly as before. A machine sold in 2014 is still
-- supported; the line is simply no longer sold.
--
-- WHERE THAT RULE IS ENFORCED, and why not here: see the note at the foot of
-- this file. It is not a trigger, and that is a decision rather than an
-- omission.
-- ===========================================================================

create table if not exists public.product_master (
  product_code   text primary key,
  product_name   text not null default '',
  -- "CODE|NAME", the export's own `Item Code | Item Name`. Carried as given so
  -- a file can be matched back to what it said.
  item_detail    text not null default '',
  item_type      text not null default '',   -- PRODUCT / PRODUCT-ALLIED
  item_category  text not null default '',   -- VENTILATOR-ICU / ACCESSORY / …
  short_form     text not null default '',
  -- ACTIVE? in the export. TRUE means the line can still be SOLD; it says
  -- nothing about whether the machines already out there are supported.
  active         boolean not null default true,
  added_on       date,
  added_by       text not null default '',
  -- Anything the export carries that has no column here, under its own
  -- heading — the same bargain every other importer makes.
  extra          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) default auth.uid()
);

comment on table public.product_master is
  'The catalogue of PRODUCT LINES — one row per code, 53 today. Not the install base: that is public.products, labelled Product Database. `active` false means the line takes no NEW SALE ENTRY; contracts, calls and everything else are unaffected.';
comment on column public.product_master.active is
  'Can this line still be SOLD? False stops a NEW sale entry only. Machines already sold stay supported — they take contracts, calls, visits, spares and feedback exactly as before.';

create index if not exists product_master_name_idx   on public.product_master (product_name);
create index if not exists product_master_active_idx on public.product_master (active);
-- NO TRIGRAM INDEX, and the reason is the size rather than the search. The
-- first draft added one by habit — the party cascade needed pg_trgm alongside
-- its btree, and that note in CLAUDE.md is about a table with thousands of
-- rows. THIS TABLE HAS FIFTY-THREE. Postgres will scan it whatever is on it,
-- and the index only bought a dependency: `check:replay` refused the bundle
-- outright with `operator class "gin_trgm_ops" does not exist`, because
-- all.sql builds its database before any migration has created the extension.
-- A habit applied without the measurement behind it.

create or replace function public.product_master_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists product_master_touch on public.product_master;
create trigger product_master_touch before update on public.product_master
  for each row execute function public.product_master_touch();

-- ---------------------------------------------------------------------------
-- RLS. Reading the catalogue is reading a price-list without prices: it names
-- the product lines and says which are still sold, and carries no customer, no
-- serial and no cover. Any signed-in user reads it, because every picker that
-- offers a product needs it. Writing needs `masters.edit`, the same right the
-- other masters take.
-- ---------------------------------------------------------------------------
alter table public.product_master enable row level security;
grant select, insert, update, delete on public.product_master to authenticated;

drop policy if exists pm_read on public.product_master;
create policy pm_read on public.product_master for select
  using (auth.role() = 'authenticated');

drop policy if exists pm_write on public.product_master;
create policy pm_write on public.product_master for all
  using (public.has_perm('masters.edit')) with check (public.has_perm('masters.edit'));

-- ---------------------------------------------------------------------------
-- IS THIS LINE STILL SELLABLE? One answer, for the form and for anything else
-- that needs it.
--
-- UNKNOWN IS SELLABLE. A code the catalogue has never heard of returns TRUE,
-- not FALSE: the catalogue is maintained by hand and an incomplete one must not
-- silently refuse a real sale. Refusing what you do not recognise is how a
-- master list stops a business rather than describing it.
--
-- THE NAME IS THE FALLBACK, and only where there is no code — a name is
-- sellable if ANY of its codes is. CPX CARE is the case: nine codes, some
-- active, some not, and treating the name as dead because one code is would be
-- wrong eight times.
-- ---------------------------------------------------------------------------
create or replace function public.product_line_sellable(p_code text, p_name text default null)
returns boolean language sql stable as $$
  select case
    when coalesce(btrim(p_code), '') <> '' then
      coalesce((select pm.active from public.product_master pm
                 where upper(btrim(pm.product_code)) = upper(btrim(p_code))), true)
    when coalesce(btrim(p_name), '') <> '' then
      coalesce((select bool_or(pm.active) from public.product_master pm
                 where upper(btrim(pm.product_name)) = upper(btrim(p_name))), true)
    else true
  end;
$$;

comment on function public.product_line_sellable(text, text) is
  'Can a NEW sale entry name this product line? Keyed on the CODE; the NAME is the fallback and is sellable if ANY of its codes is. An UNKNOWN code or name is sellable — an incomplete catalogue must not refuse a real sale.';

-- ===========================================================================
-- WHY THERE IS NO TRIGGER ON sale_items, and it is a decision not an omission.
--
-- A trigger refusing an inactive line would also refuse THE HISTORICAL SALES
-- IMPORT. The Warranty Sale Details export is full of machines sold when their
-- line was current and long since retired — ORION, HORUS, MONNAL T20, the whole
-- PRD-OLD-* family, 30 of the 53 lines. Those sales HAPPENED. A database that
-- refused to record them would make the register unloadable, and the first
-- symptom would be a load stopping part-way with a message about a product
-- nobody is trying to sell.
--
-- So the rule lives where the ACT of selling happens: the Sale Entry form
-- offers active lines only, and says why when a line is missing. A bulk load of
-- history is not somebody making a new sale.
--
-- If that is ever not enough, the guard belongs on the FORM'S path rather than
-- the table's — an `is_new_sale` flag the importer does not set — and this note
-- is here so whoever adds it knows which way round the problem is.
-- ===========================================================================
