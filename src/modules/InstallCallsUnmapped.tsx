import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox, FacetChips } from '../components/ui/ui';
import { csvExport, fmtLongDate } from '../lib/format';
import { xlsxDownload, xlsxCell, xlsxText } from '../lib/xlsx';
import { logAudit } from '../lib/audit';
import { formatDay, todayLocal } from '../lib/dates';
import { listInstallCallsUnmapped, supabaseConfigured } from '../lib/supabase';
import { loadFailure } from '../lib/dberror';
import { COMPLETE } from '../lib/exportscope';

// ===========================================================================
// MACHINES WITHOUT AN INSTALLATION CALL — administrators only.
//
// The user, 2026-10-02: "look for all installation calls using this - Product,
// Serial No, Party Name or WI-<Product>-<SerialNo>. And map it. If it does not
// have an installation call give it as a separate list in reports - view only
// for Admins."
//
// 0319 did the mapping once. This is what it could not map, LIVE: every
// warranty machine line whose INST Call holds no call number, with WHY and the
// installation calls that were candidates, so somebody can decide. It changes
// nothing -- a call is mapped from the Warranty Register, where the machine is.
//
// THE DATA IS GATED, NOT ONLY THE SCREEN: install_calls_unmapped() asks for
// `mod:/install-calls-unmapped` itself, so a role without the key gets a
// refusal from the database rather than an empty page.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };
const day = (v: unknown) => (v ? formatDay(v) : '');

const COLUMNS: Column<Row>[] = [
  { key: 'sa_number', header: 'SA Number', width: 110, wrap: false },
  { key: 'party_name', header: 'Party', width: 230 },
  { key: 'product_name', header: 'Product', width: 140 },
  { key: 'serial_number', header: 'Serial', width: 110, wrap: false },
  { key: 'warranty_start', header: 'Warranty start', width: 115, render: (r) => day(r.warranty_start) },
  { key: 'inst_call', header: 'INST Call now', width: 110, wrap: false },
  { key: 'reason', header: 'Why it has none', width: 340 },
  { key: 'candidates', header: 'Candidate installation calls', width: 260 },
];

const EXPORT: { key: string; header: string }[] = [
  { key: 'sa_number', header: 'SA Number' },
  { key: 'party_name', header: 'Party' },
  { key: 'product_code', header: 'Product Code' },
  { key: 'product_name', header: 'Product' },
  { key: 'serial_number', header: 'Serial' },
  { key: 'warranty_start', header: 'Warranty Start' },
  { key: 'warranty_end', header: 'Warranty End' },
  { key: 'inst_call', header: 'INST Call now' },
  { key: 'reason', header: 'Why it has none' },
  { key: 'candidates', header: 'Candidate installation calls' },
];

// The reason's first clause is the finding; the chips group by it.
const finding = (r: Row) => String(r.reason ?? '').split(' -- ')[0].split(' (')[0];

export function InstallCallsUnmapped() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [gap, setGap] = useState('');

  const load = async () => {
    if (!supabaseConfigured()) return;
    setBusy(true); setErr(null);
    try {
      const r = await listInstallCallsUnmapped();
      setRows(r.map((x) => ({ ...x, id: String(x.sale_item_id) } as Row)));
    } catch (e) {
      setErr(loadFailure(e, {
        tables: [],
        functions: ['install_calls_unmapped'],
        hint: 'This list is not on the project yet — it arrives with migration 0319 (supabase/apply/sales_contracts.sql).',
      }));
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // ONE FINDING PER ROW, so the chips sum to the row count, and the read pages
  // to the end, so they are exact and take no "+".
  const facets = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => { const k = finding(r); if (k) m.set(k, (m.get(k) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
  }, [rows]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (gap && finding(r) !== gap) return false;
      if (!s) return true;
      return `${r.sa_number} ${r.party_name} ${r.product_name} ${r.serial_number} ${r.candidates}`.toLowerCase().includes(s);
    });
  }, [rows, q, gap]);

  const download = (kind: 'xlsx' | 'csv') => {
    if (!visible.length) return;
    const name = `machines-without-an-installation-call-${todayLocal()}`;
    const scope = [gap ? `finding: ${gap}` : '', q.trim() ? `search: ${q.trim()}` : ''].filter(Boolean).join(' · ') || 'every row';
    if (kind === 'csv') {
      csvExport(`${name}.csv`, EXPORT,
        visible.map((r) => Object.fromEntries(EXPORT.map((c) => [c.key, xlsxText(r[c.key])]))), COMPLETE);
    } else {
      // Dates go in as Excel dates (xlsxCell), identifiers stay text.
      xlsxDownload(`${name}.xlsx`, [
        { name: 'Without an Installation Call',
          columns: EXPORT.map((c) => c.header),
          rows: visible.map((r) => Object.fromEntries(EXPORT.map((c) => [c.header, xlsxCell(r[c.key])]))) },
        { name: 'About', columns: ['Item', 'Value'], rows: [
          { Item: 'Report', Value: 'Machines Without an Installation Call' },
          { Item: 'What it lists', Value: 'Every warranty machine line whose INST Call holds no call number.' },
          { Item: 'How calls were matched (once, 0319)', Value: 'Installation calls only: by WI-<Product>-<Serial>, then Product + Serial + Party, then Product + Serial — and only where exactly one call fitted.' },
          { Item: 'Scope of this file', Value: scope },
          { Item: 'Rows', Value: String(visible.length) },
          { Item: 'Taken', Value: fmtLongDate(new Date().toISOString()) },
        ] },
      ], COMPLETE);
    }
    logAudit({ action: 'report.install_calls_unmapped', meta: { rows: visible.length, scope, kind } });
  };

  return (
    <div>
      <PageHeader
        title="Machines Without an Installation Call" icon="🧰"
        subtitle="Warranty machines with no installation call mapped to them, why, and the calls that could be theirs. Map one from the Warranty Register — this list changes nothing."
        count={visible.length} onRefresh={() => void load()} refreshing={busy} />

      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}
      {!err && !busy && rows.length === 0 && (
        <div className="sheet-banner sheet-banner-ok"><span>Every warranty machine has its installation call mapped.</span></div>
      )}

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="SA number, party, product, serial or UCN" />
      </Toolbar>
      <FacetChips options={facets} value={gap} onChange={setGap} more={false} />

      <DataTable<Row>
        columns={COLUMNS} rows={visible} getRowId={(r) => r.id}
        storageKey="install-calls-unmapped"
        toolbar={(
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => download('xlsx')}>⭳ Excel</button>
            <button className="btn btn-ghost btn-sm" onClick={() => download('csv')}>⭳ CSV</button>
            <div className="spacer" />
            <span className="muted">{visible.length} shown</span>
          </>
        )}
        emptyText={busy ? 'Loading…' : 'Nothing to show.'}
      />
    </div>
  );
}

export default InstallCallsUnmapped;
