// ===========================================================================
// R/SER/07 INDOOR SERVICE EQUIPMENT FAILURE REGISTER, PRINTABLE (2026-10-02).
//
// The user: "I will need these docs generated as well when completed or when
// printed. Printing can be HTML generated." One sheet per print -- "CUSTOMER –
// DEVICE's" or "DEMO", the paper's two -- landscape A4, the eighteen columns of
// REGISTER_COLUMNS in the paper's order, S.No running within the sheet in
// incoming-date order, the header row repeated on every printed page.
//
// THE SAME GATE AS THE EXCEL DOWNLOAD: the module key (App.tsx) AND
// export.data (here), because a printed register is the same rows leaving the
// system on paper. Every print is written to audit_log.
//
// VERIFIED BY prints the verifier's NAME; the stored signature beside it only
// on the rows whose verifier is the person printing (URS-057), as the FFR does.
// ===========================================================================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { listIndoorJobs, supabaseConfigured, type IndoorJob } from '../lib/supabase';
import {
  INDOOR_ORG, INDOOR_NOTICE, REGISTER_COLUMNS, REGISTER_DATE_COLUMNS, REGISTER_HEADER, REGISTER_SHEETS,
  registerJobs, registerRow, type RegisterSheet,
} from '../lib/indoorforms';
import { formatDay } from '../lib/dates';
import { canExportData } from '../lib/format';
import { useMySignature, signatureBelongsTo } from '../lib/signature';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { COMPANY_LOGO } from '../lib/brand';
import './indoorprint.css';

export function IndoorRegisterPrint() {
  const { sheet: sheetParam = 'customer' } = useParams();
  const [params] = useSearchParams();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const sheet: RegisterSheet = sheetParam === 'demo' ? 'demo' : sheetParam === 'newdevice' ? 'newdevice' : 'customer';
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const mySig = useMySignature();
  const [jobs, setJobs] = useState<IndoorJob[] | null>(null);
  const [err, setErr] = useState('');
  const mayExport = can('export.data') && canExportData();

  useEffect(() => {
    if (!mayExport) return;
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to print the register.'); return; }
    let live = true;
    listIndoorJobs()
      .then((all) => { if (live) setJobs(all); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [mayExport]);

  const rows = useMemo(() => (jobs ? registerJobs(jobs, sheet, from, to) : []), [jobs, sheet, from, to]);

  if (!mayExport) {
    return (
      <div className="ip-page">
        <div className="ip-toolbar"><button className="btn btn-sm" onClick={() => navigate('/indoor')}>← Back</button></div>
        <div className="ip-missing"><p>Printing the register is a download of its rows, and your role may not export data. Ask an administrator for <b>Export / download</b> in Roles &amp; Permissions.</p></div>
      </div>
    );
  }
  if (err) {
    return (
      <div className="ip-page">
        <div className="ip-toolbar"><button className="btn btn-sm" onClick={() => navigate('/indoor')}>← Back</button></div>
        <div className="ip-missing"><p>{err}</p></div>
      </div>
    );
  }
  if (!jobs) return <div className="ip-page"><div className="ip-missing"><p>Loading the register…</p></div></div>;

  const def = REGISTER_SHEETS[sheet];
  const range = from || to ? `Incoming ${from ? formatDay(from) : '…'} to ${to ? formatDay(to) : '…'}` : 'All incoming dates';
  const cell = (c: typeof REGISTER_COLUMNS[number], v: unknown) =>
    (REGISTER_DATE_COLUMNS.includes(c) ? formatDay(v) : String(v ?? ''));

  return (
    <div className="ip-page">
      <style>{'@media print { @page { size: A4 landscape; margin: 10mm 8mm 14mm; @bottom-right { content: "PAGE NO: " counter(page); font-size: 9pt; } } }'}</style>
      <div className="ip-toolbar">
        <button className="btn btn-sm" onClick={() => navigate('/indoor')}>← Back to the register</button>
        <button className="btn btn-sm btn-primary" onClick={() => {
          logAudit({ action: 'indoor.register_print', target: def.printTitle, status: 'ok', meta: { rows: rows.length, sheet, from, to } });
          window.print();
        }}>🖨 Print</button>
        <span className="muted">R/SER/07 · {def.printTitle} · {range} · {rows.length} row{rows.length === 1 ? '' : 's'} · A4 landscape</span>
      </div>

      <section className="ip-sheet ip-landscape">
        <table className="ip-grid ip-reg">
          <thead>
            {/* THE HEADER BAND IS PART OF THE TABLE HEAD, so the browser repeats
                it on every printed page with the column headings. */}
            <tr>
              <th colSpan={REGISTER_COLUMNS.length} style={{ padding: 0, border: 'none' }}>
                <table className="ip-head">
                  <tbody>
                    <tr>
                      <td className="ip-logo" rowSpan={2}><img src={COMPANY_LOGO} alt="Air Liquide Medical Systems" /></td>
                      <td className="ip-mid">{INDOOR_ORG}<br />{REGISTER_HEADER.dept}</td>
                      {/* The page number is the printer's (the @page counter):
                          a web page cannot number its own sheets. */}
                      <td className="ip-pg" rowSpan={2}>PAGE NO:</td>
                    </tr>
                    <tr><td className="ip-mid">{REGISTER_HEADER.title}<br />{def.printTitle}</td></tr>
                  </tbody>
                </table>
              </th>
            </tr>
            <tr>{REGISTER_COLUMNS.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((j, i) => {
              const r = registerRow(j, i + 1);
              return (
                <tr key={j.id}>
                  {REGISTER_COLUMNS.map((c) => (
                    <td key={c}>
                      {cell(c, r[c])}
                      {c === 'Verified By' && signatureBelongsTo(j.verified_by_name, user) && mySig?.signature
                        ? <img className="ip-sign-ink" src={mySig.signature} alt="" /> : null}
                    </td>
                  ))}
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr><td colSpan={REGISTER_COLUMNS.length}>No {def.printTitle} entries {from || to ? 'in this range' : 'yet'}.</td></tr>
            ) : null}
          </tbody>
        </table>
        <div className="ip-foot">
          <div className="ip-foot-notice">{INDOOR_NOTICE}</div>
          <div className="ip-foot-tmpl">{REGISTER_HEADER.tmpl}</div>
        </div>
      </section>
    </div>
  );
}
