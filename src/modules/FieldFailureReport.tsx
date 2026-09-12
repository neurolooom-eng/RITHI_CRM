import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader, Drawer, SearchBox } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { SelectPicker } from '../components/ui/SelectPicker';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { fmtLongDate, csvExport } from '../lib/format';
import { Ucn } from '../lib/callstate';
import { useCallStates, callStateFor } from '../lib/callstates';
import { listFfrs, addFfr, updateFfr, listFfrHistory, supabaseConfigured,
  type FfrHistoryRow } from '../lib/supabase';
import {
  FFR_COLUMNS, FFR_LIVE_COLUMNS, FFR_COVER, FFR_CAPA_STATUS, FFR_CAPA_RESPONSIBILITY,
  FFR_STATUS, FFR_SOURCES, ffrDocFrom, ffrFromReview, ffrCallNotSolved, ffrEffectWithdrawn,
  type ReviewSource,
} from '../lib/ffr';
import { ffrDocDownload } from '../lib/ffrdoc';
import { useMySignature, signatureBelongsTo } from '../lib/signature';
import { companyLogoBytes, COMPANY_LOGO_TYPE } from '../lib/brand';
import './fieldcalls.css';

// ===========================================================================
// FIELD FAILURE REGISTER — the register, and the report it produces.
//
// The format is the Field_Failure_Register workbook's 2026 tab; the document is
// R-SER-03 Rev 02. An FFR is raised FROM THE DAILY CALL REVIEW, because that is
// where somebody decides a failure is worth reporting — this screen is where it
// is then completed, tracked and printed.
//
// THE NUMBER IS NOT ON THIS FORM. `FFR - 001/26` is issued by the database on
// save and restarts each year (0165), seeded past whatever the sheet already
// holds — 2026 reaches FFR - 035/26, and a counter starting at one would
// re-issue numbers that exist on paper.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };

const DATE_KEYS = new Set(['ffr_date', 'crn_date', 'installation_date', 'call_solved_at']);

export function FieldFailureReport() {
  const { can, user } = useAuth();
  const mySig = useMySignature();
  const mayRaise = can('ffr.manage');
  const nav = useNavigate();
  const loc = useLocation();

  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  const load = async () => {
    if (!supabaseConfigured()) { setMsg({ tone: 'info', text: 'Connect the database in Settings to load the register.' }); return; }
    setBusy(true);
    try {
      const r = await listFfrs();
      setRows(r.map((x, i) => ({ ...x, id: String(x.id ?? i) })) as Row[]);
      setMsg(null);
    } catch (e) {
      setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);

  // ARRIVED FROM THE DAILY CALL REVIEW, which already holds the report.
  //
  // It used to re-read the visits and the consumption here. It does not need
  // to: the review row carries Review 3's "Service Dept Observation" — the FFR
  // column of that name — plus `visit_details` already formatted as the sheet
  // formats VISIT REMARKS, and `spares_consumed` already joined. Two fewer
  // requests, and the register, the review and the report cannot disagree
  // about the same failure.
  useEffect(() => {
    const call = (loc.state as { ffrFromCall?: ReviewSource } | null)?.ffrFromCall;
    if (!call) return;
    nav(loc.pathname, { replace: true, state: null });   // so a reload does not re-open it
    setEditing(null);
    setForm(ffrFromReview(call));
    if (ffrCallNotSolved(String(call.open_state ?? call.last_status ?? ''))) {
      setMsg({ tone: 'info', text: 'This call is not solved yet. Every FFR on the 2026 register is a solved call — raising one now is allowed, but the observation and status will be incomplete.' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.state]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!status || String(r.ffr_status ?? '') === status)
      && (!needle || ['ffr_no', 'ucn', 'customer_name', 'product_name', 'product_serial', 'problem_reported']
        .some((k) => String(r[k] ?? '').toLowerCase().includes(needle))));
  }, [rows, q, status]);

  // A UCN carries its call's colour wherever it appears — the standing rule.
  useCallStates(visible.map((r) => String(r.ucn ?? '')).filter(Boolean));

  const columns: Column<Row>[] = useMemo(() => [
    ...FFR_COLUMNS.map((c) => ({
      key: c.key,
      header: c.header,
      width: c.width,
      wrap: (c.width ?? 0) > 200,
      render: c.key === 'ucn'
        ? (r: Row) => <Ucn ucn={r.ucn} state={callStateFor(r.ucn)} />
        : DATE_KEYS.has(c.key)
          ? (r: Row) => <>{fmtLongDate(r[c.key]) || ''}</>
          : undefined,
    })),
    // THE LIVE CALL, after the record. Not interleaved with it: a reader has to
    // be able to tell which columns are the report and which are today.
    ...FFR_LIVE_COLUMNS.map((c) => ({
      key: c.key,
      header: c.header,
      width: c.width,
      wrap: (c.width ?? 0) > 200,
      render: c.key === 'live_any_potential_effect'
        ? (r: Row) => (ffrEffectWithdrawn(r)
            ? <span className="badge badge-warning" title="This report was raised on Any Potential Effect = YES; the review no longer says so. The record stands.">{String(r.live_any_potential_effect ?? '')} — withdrawn</span>
            : <>{String(r.live_any_potential_effect ?? '')}</>)
        : undefined,
    })),
    {
      key: '_doc', header: 'Report', width: 110, wrap: false,
      render: (r: Row) => (
        <div className="row" onClick={(e) => e.stopPropagation()}>
          {/* TWO WAYS OUT, because they are for different moments: the page
              prints now, from anything with a browser; the Word copy is for
              somebody who has to edit or file it. Both render R-SER-03 from the
              same form definition (src/lib/ffrform.ts). */}
          <button className="btn btn-ghost btn-sm" title="Open the printable R-SER-03 report"
                  onClick={() => nav(`/ffr/${encodeURIComponent(String(r.ffr_no ?? ''))}`)}>🖨 Print</button>
          <button className="btn btn-ghost btn-sm" title="Download the R-SER-03 report as Word"
                  onClick={() => void doc(r)}>📄 Word</button>
        </div>
      ),
    },
  ], []);

  const doc = async (r: Row) => {
    const raisedBy = String(r.raised_by_name ?? '') || (user?.email ?? '');
    // THE SIGNATURE BLOCK IS THE RAISER'S, so it carries a saved signature only
    // when the person pressing this button IS the raiser. Anybody else printing
    // the same report gets an empty block to sign by hand — see
    // src/lib/signature.ts for why that is the rule and not a limitation to be
    // worked around.
    const signature = signatureBelongsTo(raisedBy, user) ? (mySig?.signature ?? '') : '';
    // The mark is fetched rather than bundled as a constant (brand.ts), and a
    // failure to read it costs the document its logo and nothing else.
    const logo = await companyLogoBytes();
    ffrDocDownload({
      ...ffrDocFrom(r, raisedBy), signature,
      ...(logo ? { logo, logoType: COMPANY_LOGO_TYPE } : {}),
    });
    logAudit({ action: 'ffr.document', target: String(r.ffr_no ?? ''), status: 'ok', meta: { signed: !!signature } });
  };

  const save = async () => {
    if (!form) return;
    const problem = String(form.problem_reported ?? '').trim();
    if (!problem) { setMsg({ tone: 'error', text: 'Problem reported by customer is required — it is what the report is about.' }); return; }
    if (!String(form.customer_name ?? '').trim()) { setMsg({ tone: 'error', text: 'Customer Name is required.' }); return; }
    setBusy(true);
    // RAISED BY IS SET ONCE, WHEN THE REPORT IS RAISED — never on an edit.
    //
    // This used to stamp `user?.email` on EVERY save, so opening somebody
    // else's report, correcting a typo and saving replaced the raiser with the
    // editor. Two things wrong with that: it is not who raised the report, and
    // an e-mail address is not the name the register shows everywhere else
    // (0173 takes the reviewer's name from User Master for exactly that
    // reason). An edit now leaves the field alone, and the weekly review has
    // `reviewed_by_name` of its own to say who looked at it.
    const payload = editing == null
      ? { ...form, raised_by_name: String(form.raised_by_name ?? '').trim() || user?.fullName || user?.email || '' }
      : form;
    const res = editing == null ? await addFfr(payload) : await updateFfr(editing, payload);
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Save failed.' }); return; }
    const no = editing == null ? (res as { ffrNo?: string }).ffrNo : String(form.ffr_no ?? '');
    logAudit({ action: editing == null ? 'ffr.raise' : 'ffr.edit', target: no ?? '', status: 'ok' });
    setMsg({ tone: 'ok', text: editing == null ? `Raised ${no}. Use 📄 Word on its row for the report.` : `Saved ${no}.` });
    setForm(null); setEditing(null);
    await load();
  };

  const field = (label: string, key: string, kind: 'text' | 'long' | 'date' | 'pick' = 'text', options?: string[]) => (
    <label className={`rep-field ${kind === 'long' ? 'rep-span2' : ''}`} key={key}>
      <span className="field-label">{label}</span>
      {kind === 'long' ? (
        <textarea className="input" rows={3} value={String(form?.[key] ?? '')}
                  onChange={(e) => setForm((f) => ({ ...(f ?? {}), [key]: e.target.value }))} />
      ) : kind === 'pick' ? (
        <SelectPicker value={String(form?.[key] ?? '')} options={options ?? []}
                      onChange={(v) => setForm((f) => ({ ...(f ?? {}), [key]: v }))} />
      ) : (
        <input className="input" type={kind === 'date' ? 'date' : 'text'}
               value={String(form?.[key] ?? '').slice(0, kind === 'date' ? 10 : undefined)}
               onChange={(e) => setForm((f) => ({ ...(f ?? {}), [key]: e.target.value || null }))} />
      )}
    </label>
  );

  return (
    <div>
      <PageHeader
        title="Field Failure Register"
        subtitle="Raised automatically when a call is answered YES for Any Potential Effect in the Daily Call Review. The format is the Field Failure Register sheet; the report is R-SER-03 Rev 02."
        icon="🧪"
        count={visible.length}
        countMore={false}
        onRefresh={() => void load()}
        refreshing={busy}
        actions={mayRaise
          ? <button className="btn btn-primary" onClick={() => { setEditing(null); setForm(ffrFromReview({})); }}>＋ Raise FFR</button>
          : undefined}
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      {!mayRaise && (
        <div className="sheet-banner sheet-banner-info">
          <span>You can read the register but not raise or edit a report — that needs the <b>Field Failure Register</b> right.</span>
        </div>
      )}

      <div className="cr-bar" style={{ marginBottom: 10 }}>
        <SearchBox value={q} onChange={setQ} placeholder="FFR no, UCN, customer, product, serial, problem…" />
        <div className="cr-tabs">
          {['', ...FFR_STATUS].map((s) => (
            <button key={s || 'all'} className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setStatus(s)}>{s || 'All'}</button>
          ))}
          <button className="btn btn-sm" onClick={() => csvExport('field-failure-register.csv', FFR_COLUMNS.map((c) => ({ key: c.key, header: c.header })), visible)}>⬇ CSV</button>
        </div>
      </div>

      <DataTable
        rows={visible}
        columns={columns}
        getRowId={(r) => r.id}
        storageKey="rithi.ffr.table"
        onRowClick={mayRaise ? (r) => { setEditing(Number(r.id)); setForm({ ...r }); } : undefined}
      />

      <Drawer
        open={!!form}
        onClose={() => { setForm(null); setEditing(null); }}
        title={editing == null ? 'Raise a Field Failure Report' : `Edit ${String(form?.ffr_no ?? '')}`}
        width={860}
      >
        {form && (
          <div className="rep-form">
            <section className="rep-sec">
              <div className="rep-sec-title">
                {editing == null
                  ? <>The number is issued on save <span className="muted">— FFR - NNN/YY, restarting each year</span></>
                  : <>FFR No: <b>{String(form.ffr_no ?? '')}</b> <span className="muted">— issued once, never edited</span></>}
              </div>
              <div className="rep-grid">
                {field('Source', 'source', 'pick', FFR_SOURCES)}
                {field('FFR Date', 'ffr_date', 'date')}
                {field('CRN NO (UCN)', 'ucn')}
                {field('CRN Date', 'crn_date', 'date')}
                {field('Customer Name', 'customer_name')}
                {field('Place', 'place')}
                {field('Product Name', 'product_name')}
                {field('WGP / OGP / AMC', 'cover', 'pick', FFR_COVER)}
                {field('Item Code', 'item_code')}
                {field('Product S. No', 'product_serial')}
                {field('Installation Date', 'installation_date', 'date')}
                {field('Call Type', 'call_type')}
              </div>
            </section>

            <section className="rep-sec">
              <div className="rep-sec-title">The failure</div>
              <div className="rep-grid">
                {field('Problem reported by customer', 'problem_reported', 'long')}
                {field('Additional Problem Description', 'additional_problem', 'long')}
                {field('Service Dept Observation', 'service_observation', 'long')}
                {field('Problem Status', 'problem_status', 'long')}
                {field('VISIT REMARKS', 'visit_remarks', 'long')}
                {field('SPARES CONSUMED', 'spares_consumed', 'long')}
              </div>
            </section>

            <section className="rep-sec">
              <div className="rep-sec-title">CAPA and closure</div>
              <div className="rep-grid">
                {field('CAPA (if reqd) Responsibility', 'capa_responsibility', 'pick', FFR_CAPA_RESPONSIBILITY)}
                {field('CAPA NO', 'capa_no')}
                {field('CAPA Status', 'capa_status', 'pick', FFR_CAPA_STATUS)}
                {field('FFR Status', 'ffr_status', 'pick', FFR_STATUS)}
                {field('Verified By', 'verified_by')}
                {field('CURRENT CALL STATUS', 'current_call_status')}
                {field('Remarks', 'remarks', 'long')}
              </div>
            </section>

            {/* THE CHANGE LOG. Only on an existing report — a report being
                raised has no history, and an empty panel on the new-report form
                would read as one that failed to load. */}
            {editing != null && <FfrHistory ffrNo={String(form?.ffr_no ?? '')} />}

            <div className="rep-actions">
              {editing != null && (
                <>
                  <button className="btn btn-sm"
                          onClick={() => nav(`/ffr/${encodeURIComponent(String(form?.ffr_no ?? ''))}`)}>🖨 Print</button>
                  <button className="btn btn-sm" onClick={() => void doc({ ...(form as Row), id: '0' })}>📄 Word</button>
                </>
              )}
              <button className="btn btn-ghost" onClick={() => { setForm(null); setEditing(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
                {editing == null ? 'Raise FFR' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}


// ---------------------------------------------------------------------------
// WHAT CHANGED, AND WHO CHANGED IT (0174).
//
// The user, 2026-09-12: "I need to be able to capture everytime it is updated -
// For log keeping." The FFR is reviewed weekly and edited each time, so the
// register's current state answers none of the questions a weekly cycle asks.
//
// WRITTEN BY THE DATABASE, so this panel shows a record the application cannot
// have failed to write — including an edit made straight through the API, which
// the client-written audit trail never sees.
//
// FIELD NAMES ARE SHOWN AS THE REGISTER'S OWN HEADINGS. `capa_status` means
// nothing to the person reading this; "CAPA Status" is the column they edited.
// ---------------------------------------------------------------------------
const FFR_HEADING = new Map(
  [...FFR_COLUMNS, ...FFR_LIVE_COLUMNS].map((c) => [c.key, c.header] as const));

const headingFor = (k: string) =>
  FFR_HEADING.get(k)
  // The weekly-review columns are not on the register's grid, so they are named
  // here rather than shown raw.
  ?? ({ attachment_url: 'Attachment', attachment_name: 'Attachment name',
        reviewed_at: 'Weekly review date', reviewed_by_name: 'Reviewed by',
        raised_by_name: 'Raised by', extra: 'Why it was raised' } as Record<string, string>)[k]
  ?? k;

/** A value as the log should show it. `null` and '' are both "empty" to a
 *  reader, and printing "null" would suggest the field holds that word. */
const shown = (v: unknown): string => {
  if (v === null || v === undefined) return '(empty)';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.trim() === '' ? '(empty)' : (s.length > 160 ? `${s.slice(0, 160)}…` : s);
};

function FfrHistory({ ffrNo }: { ffrNo: string }) {
  const [rows, setRows] = useState<FfrHistoryRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setBusy(true);
    listFfrHistory(ffrNo)
      .then((r) => { if (live) setRows(r); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [ffrNo]);

  const edits = rows.filter((r) => r.action === 'update').length;

  return (
    <section className="rep-section">
      <button className="btn btn-sm" onClick={() => setOpen((o) => !o)}>
        {open ? '⌃' : '⌄'} Update log
        {busy ? ' …' : ` — ${edits} change${edits === 1 ? '' : 's'}`}
      </button>

      {open && (
        busy ? <div className="muted" style={{ marginTop: 8 }}>Loading…</div>
        : rows.length === 0 ? (
          <div className="muted" style={{ marginTop: 8 }}>
            Nothing recorded yet. If this report predates the update log, its
            history starts from the next change.
          </div>
        ) : (
          <div className="assoc-scroll" style={{ marginTop: 8 }}>
            <table className="assoc-table">
              <thead>
                <tr><th style={{ width: 150 }}>When</th><th style={{ width: 150 }}>Who</th><th>What changed</th></tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.id}>
                    <td>{fmtLongDate(h.changed_at)}</td>
                    <td>{h.changed_by_name || <span className="muted">—</span>}</td>
                    <td>
                      {h.action === 'create' ? (
                        <b>Report raised</b>
                      ) : (
                        Object.entries(h.changes ?? {}).map(([k, v]) => (
                          <div key={k}>
                            <b>{headingFor(k)}</b>{': '}
                            <span className="muted">{shown(v?.from)}</span>
                            {' → '}
                            <span>{shown(v?.to)}</span>
                          </div>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}
