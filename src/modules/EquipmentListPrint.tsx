// ===========================================================================
// THE EQUIPMENT LIST, PRINTABLE (the user, 2026-10-15; asked: a PDF). Opened
// from Product & Party Search with the filter on screen; re-reads the same
// rows (sbListMachinesByCover) so the paper and the screen agree, and prints
// through the browser's Save as PDF -- the app's other documents' way.
//
// THE SAME GATE AS EVERY DOWNLOAD: the screen's key (App.tsx) AND export.data
// (here), because a printed list is the rows leaving the system. Every print is
// written to audit_log, and the sheet names who generated it and when.
// ===========================================================================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { sbListMachinesByCover, supabaseConfigured, type CoverFilter } from '../lib/supabase';
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
  const product = params.get('product') ?? '';
  const party = params.get('party') ?? '';
  const mayExport = can('export.data') && canExportData();
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [err, setErr] = useState('');
  const today = todayISO();
  // Stamped when the page opens: the moment the list was generated.
  const [generatedAt] = useState(() => formatDayTime(new Date().toISOString()));

  useEffect(() => {
    if (!mayExport) return;
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to generate the list.'); return; }
    let live = true;
    sbListMachinesByCover(kind, today, { product, party })
      .then((r) => { if (live) setRows(r); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [mayExport, kind, product, party, today]);

  const meta = useMemo(() => ({
    filterLabel: coverFilterLabel(kind, today),
    narrowedBy: product ? ` — ${product}` : party ? ` — ${party}` : '',
    generatedBy: [user?.fullName, user?.email].filter(Boolean).join(' · ') || 'unknown',
    generatedAt,
    today,
    ending: kind === 'this_month' ? monthBounds(today, 0) : kind === 'next_month' ? monthBounds(today, 1) : undefined,
  }), [kind, product, party, user, generatedAt, today]);

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
  if (!rows) return <div className="el-page"><div className="el-missing"><p>Generating the Equipment List…</p></div></div>;

  return (
    <div className="el-page">
      <style>{'@media print { @page { size: A4 landscape; margin: 8mm 8mm 12mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt Arial, sans-serif; } } }'}</style>
      <div className="el-toolbar">
        {back}
        <button className="btn btn-sm btn-primary" onClick={() => {
          logAudit({ action: 'lookup.equipment_list_print', target: meta.filterLabel + meta.narrowedBy, status: 'ok', meta: { rows: rows.length, kind, product, party } });
          window.print();
        }}>🖨 Print / Save as PDF</button>
        <span className="muted">{meta.filterLabel}{meta.narrowedBy} · {rows.length} machine{rows.length === 1 ? '' : 's'} · A4 landscape — choose “Save as PDF” as the printer</span>
      </div>
      <section className="el-sheet">
        <EquipmentListSheet rows={rows} meta={meta} />
      </section>
    </div>
  );
}
