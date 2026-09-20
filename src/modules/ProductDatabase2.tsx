import React, { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Toolbar, SearchBox, FacetChips, SectionCard, Drawer } from '../components/ui/ui';
import { csvExport } from '../lib/format';
import { formatDay, formatDayTime } from '../lib/dates';
import { listProductDatabaseV2, diagnoseProductDatabaseV2, refreshProductDatabaseV2,
         supabaseConfigured, type RegisterGap } from '../lib/supabase';
import { loadFailure, emptyRegisterVerdict } from '../lib/dberror';
import { useAuth } from '../lib/auth';
import { seesEveryRecord } from '../lib/rbac';

// ===========================================================================
// PRODUCT DATABASE 2.0 — the machine as the five registers together describe it.
//
//   The user, 2026-09-20: "All unique product+serial no should be listed
//   [Warranty Sale Details, Contract Details, Additional Entries], then arrange
//   these sources + Ownership Transfer to come to a conclusion on the Party,
//   Warranty period, contract period, then derive the item status."
//
// THE OLD PRODUCT DATABASE IS UNTOUCHED and still at `/product-database` — the
// ask was explicit. This screen reads `product_database_v2` (0218), which is a
// view beside `products`, not a replacement for it, so the two can be compared
// on live data before anything moves.
//
// IT SHOWS ITS EVIDENCE. Party, warranty, contract and the status each carry a
// "from" column naming the register that decided them: a value assembled out of
// five sources that cannot say which one it came from is one nobody can check,
// and every row here is an opinion about somebody's machine.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };

const day = (v: unknown) => (v ? formatDay(v) : '');

const COLUMNS: Column<Row>[] = [
  { key: 'product_name', header: 'Product', width: 140 },
  { key: 'serial_number', header: 'Serial', width: 110, wrap: false },
  { key: 'party_name', header: 'Party', width: 220 },
  { key: 'item_status', header: 'Status', width: 110, wrap: false },
  { key: 'warranty_start', header: 'Warranty from', width: 115, render: (r) => day(r.warranty_start) },
  { key: 'warranty_end', header: 'Warranty to', width: 115, render: (r) => day(r.warranty_end) },
  { key: 'contract_type', header: 'Contract', width: 90, wrap: false },
  { key: 'contract_end', header: 'Contract to', width: 115, render: (r) => day(r.contract_end) },
  // WHY IT SAYS WHAT IT SAYS — on the screen, not only in the export.
  { key: 'item_status_reason', header: 'Because', width: 260 },
  { key: 'party_from', header: 'Party from', width: 180 },
];

// Everything the view publishes, for the ⚙ Columns picker and the export.
const ALL_COLUMNS: string[] = [
  'product_name', 'serial_number', 'product_code', 'party_name', 'party_from',
  'item_status', 'item_status_reason',
  'warranty_start', 'warranty_end', 'warranty_months', 'warranty_from', 'warranty_state',
  'contract_number', 'contract_type', 'contract_type_as_recorded', 'contract_start',
  'contract_end', 'contract_months', 'contract_from', 'contract_state',
  'sa_number', 'state', 'city', 'engineer',
  'from_party', 'to_party', 'transfer_date', 'reference_no',
  'in_warranty_register', 'in_contract_register', 'in_additional_entries',
  'installation_ucn', 'machine_key', 'refreshed_at',
];

export function ProductDatabase2() {
  const { user, can } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  // Only ever filled when the list comes back EMPTY — see the banner below.
  const [gaps, setGaps] = useState<RegisterGap[] | null>(null);
  // WHEN THE FIGURES WERE BUILT. The view is materialised (0220), so every
  // number on this screen is as of a moment — and a figure nobody can date
  // is the fault this project has written down more than once.
  const [builtAt, setBuiltAt] = useState<string>('');
  const [rebuilding, setRebuilding] = useState(false);
  // The machine whose full record is open. The table shows ten columns of a
  // thirty-three column view; this is the rest of it.
  const [open, setOpen] = useState<Row | null>(null);

  const load = async () => {
    if (!supabaseConfigured()) return;
    setBusy(true); setErr(null);
    try {
      const r = await listProductDatabaseV2();
      setRows(r.map((x, i) => ({ ...x, id: String(x.machine_key ?? i) } as Row)));
      // AN EMPTY LIST IS A QUESTION, NOT AN ANSWER. Ask the registers what they
      // hold before saying anything about them; nine head requests, and only
      // when there is nothing to show.
      setBuiltAt(String(r[0]?.refreshed_at ?? ''));
      setGaps(r.length === 0 ? await diagnoseProductDatabaseV2() : null);
    } catch (e) {
      // The three answers, and the error VERBATIM — the real fault is usually
      // readable in the message and a hint written over it costs the round trip.
      setErr(loadFailure(e, {
        tables: ['product_database_v2'],
        hint: 'Product Database 2.0 is not on this project yet — run product_database_2.sql.',
      }));
    } finally { setBusy(false); }
  };
  // A REBUILD IS NOT A REFRESH, and the button says which. Refresh re-reads what
  // is stored; this re-derives it from the five registers, which is what has to
  // happen after a register is loaded.
  const rebuild = async () => {
    setRebuilding(true); setErr(null);
    try { await refreshProductDatabaseV2(); await load(); }
    catch (e) { setErr(loadFailure(e, { tables: ['product_database_v2'], hint: 'Product Database 2.0 is not on this project yet — run product_database_2.sql.' })); }
    finally { setRebuilding(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && String(r.item_status ?? '') !== status) return false;
      if (!s) return true;
      return `${r.product_name} ${r.serial_number} ${r.party_name} ${r.contract_number} ${r.sa_number}`
        .toLowerCase().includes(s);
    });
  }, [rows, q, status]);

  // EXACT, so no `+`. The read pages until the view is exhausted, which is why
  // this is a count and not a lower bound.
  const facets = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const k = String(r.item_status ?? '');
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="Product Database 2.0" icon="🧬"
        subtitle="One row per machine — model and serial — assembled from the warranty sale, the contract, the additional entries, the ownership transfer and the installation call."
        count={visible.length} onRefresh={() => void load()} refreshing={busy}
        actions={(
          <>
            {builtAt && <span className="muted" style={{ fontSize: 12.5 }}>Built {formatDayTime(builtAt)}</span>}
            {can('masters.edit') && (
              <button className="btn btn-sm" disabled={rebuilding} onClick={() => void rebuild()}
                title="Re-derive every machine from the five registers. Readers are not blocked while it runs.">
                {rebuilding ? 'Rebuilding…' : '⟳ Rebuild from the registers'}
              </button>
            )}
          </>
        )} />

      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}

      {!err && !busy && rows.length === 0 && <EmptyBecause gaps={gaps} everything={seesEveryRecord(user, can)} />}

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Product, serial, party, contract or SA number" />
      </Toolbar>

      {/* A count over PARTLY loaded data is a lower bound; this one is not —
          the read pages until the view is exhausted, so `more` is false. */}
      <FacetChips options={facets} value={status} onChange={setStatus} more={false} />

      <DataTable<Row>
        columns={COLUMNS} rows={visible} getRowId={(r) => r.id}
        onRowClick={(r) => setOpen(r)}
        toolbar={(
          <button className="btn btn-ghost btn-sm" onClick={() => csvExport(
            `product-database-2-${new Date().toISOString().slice(0, 10)}.csv`,
            ALL_COLUMNS.map((k) => ({ key: k, header: k })), visible)}>
            ⭳ Export CSV
          </button>
        )} />

      <MachineDrawer row={open} onClose={() => setOpen(null)} />
    </div>
  );
}

// ===========================================================================
// ONE MACHINE, WHOLE — and every reference on it is a way through to the
// document that says it.
//
//   The user, 2026-09-20: "On clicking it, i need the Data to Load in a Drawer
//   and all Relevant Links should be Clickable -- like if it has an SA No, If i
//   click on that - it should open. Same for Contract, Ownership Transfer."
//
// EVERY LINK GOES TO A REGISTER THAT IS EXPECTING IT. Each one carries the
// number in `location.state.search`, and the Warranty Register, the Contract
// Register and Ownership Transfer were taught to read it in the same change —
// a link that lands on an unfiltered register is not a link, it is a
// suggestion that you go and search again.
//
// A NUMBER THAT IS NOT THERE IS NOT A LINK. Most machines carry some of these
// and no machine carries all of them, so each one renders as plain text (or
// not at all) unless there is something to open. A dead link on a record is
// worse than a blank: it says a document exists.
// ===========================================================================
function MachineDrawer({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const navigate = useNavigate();
  const go = (path: string, state: Record<string, unknown>) => { onClose(); navigate(path, { state }); };
  const v = (k: string) => {
    const x = row?.[k];
    return x === null || x === undefined || x === '' ? '' : String(x);
  };
  const D = ({ label, k }: { label: string; k: string }) =>
    v(k) ? <Fact label={label} value={day(row?.[k])} /> : null;
  const F = ({ label, k }: { label: string; k: string }) =>
    v(k) ? <Fact label={label} value={v(k)} /> : null;
  const Link = ({ label, k, to, state }: { label: string; k: string; to: string; state: Record<string, unknown> }) =>
    v(k) ? (
      <div>
        <div className="field-label">{label}</div>
        <button className="btn-link" onClick={() => go(to, state)}>{v(k)} ↗</button>
      </div>
    ) : null;

  return (
    <Drawer open={!!row} onClose={onClose} width={720}
      title={row ? `${v('product_name')} · ${v('serial_number')}` : ''}>
      {row && (
        <div style={{ display: 'grid', gap: 12 }}>
          <SectionCard title="The machine">
            <div className="sf-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
              <F label="Product" k="product_name" />
              <F label="Product code" k="product_code" />
              <F label="Serial" k="serial_number" />
              <Fact label="Status today" value={v('item_status')} />
              <Fact label="Because" value={v('item_status_reason')} />
              <Link label="Full history of this machine" k="serial_number" to="/machine-history"
                state={{ product: v('product_name'), serial: v('serial_number') }} />
            </div>
          </SectionCard>

          <SectionCard title="Whose it is">
            <div className="sf-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
              <F label="Party" k="party_name" />
              <F label="Decided by" k="party_from" />
              <F label="State" k="state" />
              <F label="City" k="city" />
              <F label="Engineer" k="engineer" />
            </div>
          </SectionCard>

          <SectionCard title="Warranty">
            <div className="sf-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
              <D label="From" k="warranty_start" />
              <D label="To" k="warranty_end" />
              <F label="Period (months)" k="warranty_months" />
              <F label="State" k="warranty_state" />
              <F label="Source" k="warranty_from" />
              <Link label="Sale (SA number)" k="sa_number" to="/warranties"
                state={{ search: v('sa_number'), tab: 'entries' }} />
              <Link label="Installation call" k="installation_ucn" to="/installations"
                state={{ search: { ucn: v('installation_ucn') } }} />
            </div>
          </SectionCard>

          <SectionCard title="Contract">
            <div className="sf-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
              <Link label="Contract number" k="contract_number" to="/contracts"
                state={{ search: v('contract_number'), tab: 'entries' }} />
              <F label="Type" k="contract_type" />
              <F label="Type as recorded" k="contract_type_as_recorded" />
              <D label="From" k="contract_start" />
              <D label="To" k="contract_end" />
              <F label="Period (months)" k="contract_months" />
              <F label="State" k="contract_state" />
              <F label="Source" k="contract_from" />
            </div>
          </SectionCard>

          {(v('to_party') || v('reference_no')) && (
            <SectionCard title="Ownership transfer">
              <div className="sf-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                <F label="From" k="from_party" />
                <F label="To" k="to_party" />
                <D label="On" k="transfer_date" />
                <Link label="Reference" k="reference_no" to="/ownership-transfer"
                  state={{ search: v('reference_no'), tab: 'transfers' }} />
              </div>
            </SectionCard>
          )}

          <SectionCard title="Which registers named it">
            <div className="sf-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
              <Fact label="Warranty sale register" value={row.in_warranty_register ? 'yes' : 'no'} />
              <Fact label="Contract register" value={row.in_contract_register ? 'yes' : 'no'} />
              <Fact label="Additional entries" value={row.in_additional_entries ? 'yes' : 'no'} />
              <F label="Machine key" k="machine_key" />
            </div>
          </SectionCard>
        </div>
      )}
    </Drawer>
  );
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="field-label">{label}</div>
    <div>{value || '—'}</div>
  </div>
);

// ===========================================================================
// WHY THERE IS NOTHING HERE — measured, and never claimed beyond the measurement.
//
// The banner used to say "No machine appears in the warranty sale register, the
// contract register or the additional entries yet", which is the strong claim
// and is the one thing an empty list cannot support. 2.0 lists a machine only
// where a register row records BOTH a model and a serial — a machine is its
// model PLUS its serial, and a serial-only key merges the eleven machines
// numbered 219 into one row — so an empty list is equally consistent with
// thousands of rows that carry a serial and no model. Those need opposite
// actions, so the screen asks the registers instead of picking one.
//
// WHAT IT IS ALLOWED TO CONCLUDE. `noModel === rows` proves that NO row in that
// register can be listed; anything short of that proves nothing either way, and
// is reported as the numbers alone. The counts are NULL-or-EMPTY, so each is a
// LOWER bound on what is blank — which is why the conclusion is only drawn from
// the equality, where the bound cannot be hiding anything.
// ===========================================================================
// Styled from the tokens rather than a class, because there is no shared
// `mini-table` rule and a class with no rule behind it renders as a plain
// table — the `sheet-banner-warn` fault, one file over.
const cell1: React.CSSProperties = { padding: '3px 14px 3px 0', textAlign: 'left' };
const cellN: React.CSSProperties = { padding: '3px 0 3px 14px', textAlign: 'right' };
const head1: React.CSSProperties = { ...cell1, fontWeight: 600, borderBottom: '1px solid var(--border)' };
const headN: React.CSSProperties = { ...cellN, fontWeight: 600, borderBottom: '1px solid var(--border)' };

function EmptyBecause({ gaps, everything }: { gaps: RegisterGap[] | null; everything: boolean }) {
  // The verdict is decided in `dberror.ts`, where `check:dberror` can prove
  // every branch of it — not here, beside the fetch, where nothing can.
  const verdict = emptyRegisterVerdict(gaps);
  const n = (v: number | null) => (v === null ? '—' : v.toLocaleString());

  return (
    <div className="sheet-banner sheet-banner-info" style={{ display: 'block' }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        {everything
          ? 'Nothing to list. Here is what the three registers actually hold.'
          : 'Nothing here that you may see — and these counts are your slice too, not the company\'s.'}
      </div>
      <div>
        A machine is listed here only where a register row records <strong>both a model and a
        serial</strong>, so an empty list does not mean the registers are empty.
      </div>

      {gaps === null ? (   /* === verdict 'counting'; written so the narrowing holds */
        <div style={{ marginTop: 6, opacity: 0.8 }}>Counting the registers…</div>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>
                <th style={head1}>Register</th>
                <th style={headN}>Rows</th>
                <th style={headN}>No serial</th>
                <th style={headN}>No model</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((g) => (
                <tr key={g.table}>
                  <td style={cell1}>{g.register}</td>
                  {g.error
                    // Uncounted is said, never shown as zero: a zero would read
                    // as "this register is empty", which is a claim.
                    ? <td colSpan={3} style={{ ...cell1, opacity: 0.8 }}>could not be counted — {g.error}</td>
                    : <>
                        <td style={cellN}>{n(g.rows)}</td>
                        <td style={cellN}>{n(g.noSerial)}</td>
                        <td style={cellN}>{n(g.noModel)}</td>
                      </>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {verdict === 'no-model' && (
        <div style={{ marginTop: 8 }}>
          <strong>Every row in every register counted above records no model</strong>, so there is
          nothing 2.0 can key on. The registers need their model column filled — re-uploading them
          with it is what puts machines on this screen.
        </div>
      )}
      {verdict === 'no-serial' && (
        <div style={{ marginTop: 8 }}>
          <strong>Every row in every register counted above records no serial number</strong>, so no
          machine can be identified at all.
        </div>
      )}
      {verdict === 'elsewhere' && (
        <div style={{ marginTop: 8 }}>
          Those registers do hold rows with a model and a serial, so the blanks above are not the
          whole story — run <code>_why_is_product_database_2_empty.sql</code> as an administrator,
          which asks the same question without the row-level filtering this screen is subject to.
        </div>
      )}
      {verdict === 'registers-empty' && (
        <div style={{ marginTop: 8 }}>
          The three registers are empty. Load them under Bulk Uploads and the machines appear here.
        </div>
      )}
      {verdict === 'uncountable' && (
        <div style={{ marginTop: 8 }}>
          None of the three registers could be counted, so nothing can be concluded from this screen
          being empty — the errors beside each are the thing to fix first.
        </div>
      )}
    </div>
  );
}
