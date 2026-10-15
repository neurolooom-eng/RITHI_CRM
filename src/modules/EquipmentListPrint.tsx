// ===========================================================================
// THE EQUIPMENT LIST, PRINTABLE (the user, 2026-10-15; asked: a PDF, and ONE
// PARTY per list). Opened from Product & Party Search with a party and the
// filter on screen; re-reads the same rows (sbListMachinesByCover) and the
// party's own record, so the paper and the screen agree, and prints through
// the browser's Save as PDF -- the app's other documents' way.
//
// THE SAME GATE AS EVERY DOWNLOAD: the screen's key (App.tsx) AND export.data
// (here), because a printed list is the rows leaving the system. Every print is
// written to audit_log, and the sheet names who generated it and when.
// ===========================================================================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { partyByExactName, sbListMachinesByCover, supabaseConfigured, type CoverFilter } from '../lib/supabase';
import { monthBounds } from '../lib/coverToday';
import { canExportData, todayISO } from '../lib/format';
import { formatDayTime } from '../lib/dates';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { coverFilterLabel } from './Lookup';
import { EquipmentListSheet } from './EquipmentListSheet';

const KINDS: CoverFilter[] = ['all', 'this_month', 'next_month', 'ogp'];

export function EquipmentListPrint() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const kind = (KINDS.includes(params.get('kind') as CoverFilter) ? params.get('kind') : 'all') as CoverFilter;
  const party = params.get('party') ?? '';
  // THE SERVICE ENGINEER COLUMN is a choice made when generating, off by
  // default (the user, 2026-10-15).
  const [showEngineer, setShowEngineer] = useState(false);
  const mayExport = can('export.data') && canExportData();
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [partyRow, setPartyRow] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState('');
  const today = todayISO();
  // Stamped when the page opens: the moment the list was generated.
  const [generatedAt] = useState(() => formatDayTime(new Date().toISOString()));

  useEffect(() => {
    if (!mayExport) return;
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to generate the list.'); return; }
    if (!party.trim()) { setErr('The Equipment List is one party\'s list: open a party on Product & Party Search first.'); return; }
    let live = true;
    Promise.all([sbListMachinesByCover(kind, today, { party }), partyByExactName(party)])
      .then(([r, p]) => { if (live) { setRows(r); setPartyRow(p ?? { party_name: party }); } })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [mayExport, kind, party, today]);

  const meta = useMemo(() => ({
    filterLabel: coverFilterLabel(kind, today),
    generatedBy: [user?.fullName, user?.email].filter(Boolean).join(' · ') || 'unknown',
    generatedAt,
    today,
    ending: kind === 'this_month' ? monthBounds(today, 0) : kind === 'next_month' ? monthBounds(today, 1) : undefined,
    showEngineer,
  }), [kind, user, generatedAt, today, showEngineer]);

  const back = <button className="btn btn-sm" onClick={() => navigate('/lookup')}>← Back to Product &amp; Party Search</button>;
  if (!mayExport) {
    return (
      <div className="el-page">
        <div className="el-toolbar">{back}</div>
        <div className="el-missing"><p>The Equipment List is a download of the machine register, and your role may not export data. Ask an administrator for <b>Export / download</b> in Roles &amp; Permissions.</p></div>
      </div>
    );
  }
  if (err) return <div className="el-page"><div className="el-toolbar">{back}</div><div className="el-missing"><p>{err}</p></div></div>;
  if (!rows || !partyRow) return <div className="el-page"><div className="el-missing"><p>Generating the Equipment List…</p></div></div>;

  return (
    <div className="el-page">
      {/* The FFR header's PAGE NO: box is numbered by the printer: a web page
          cannot count its own sheets. */}
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm 8mm 12mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7pt 'Source Sans 3', Arial, sans-serif; color: #5b6673; } } }`}</style>
      <div className="el-toolbar">
        {back}
        <button className="btn btn-sm btn-primary" onClick={() => {
          logAudit({ action: 'lookup.equipment_list_print', target: `${party} — ${meta.filterLabel}`, status: 'ok', meta: { rows: rows.length, kind, party, showEngineer } });
          window.print();
        }}>🖨 Print / Save as PDF</button>
        <label className="row" style={{ gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showEngineer} onChange={(e) => setShowEngineer(e.target.checked)} />
          Include Service Engineer
        </label>
        <span className="muted">{party} · {meta.filterLabel} · {rows.length} machine{rows.length === 1 ? '' : 's'} · A4 landscape — choose “Save as PDF” as the printer</span>
      </div>
      <section className="el-sheet">
        <EquipmentListSheet party={partyRow} rows={rows} meta={meta} />
      </section>
    </div>
  );
}
