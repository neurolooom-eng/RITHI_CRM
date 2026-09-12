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
import {
  listFfrs, addFfr, updateFfr, supabaseConfigured,
  reportsByCall, consumptionForCall,
} from '../lib/supabase';
import {
  FFR_COLUMNS, FFR_COVER, FFR_CAPA_STATUS, FFR_STATUS, FFR_SOURCES,
  ffrDocFrom, ffrFromCall, type CallPrefill,
} from '../lib/ffr';
import { ffrDocDownload } from '../lib/ffrdoc';
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

  // ARRIVED FROM THE DAILY CALL REVIEW. The call fills in what it knows and the
  // visit fills in the rest — the observation, what was fitted, when it was
  // solved — because re-typing those from the screen next door is how the
  // register and the report come to disagree with the call.
  useEffect(() => {
    const call = (loc.state as { ffrFromCall?: CallPrefill } | null)?.ffrFromCall;
    if (!call) return;
    nav(loc.pathname, { replace: true, state: null });   // so a reload does not re-open it
    const base = ffrFromCall(call);
    setEditing(null);
    setForm(base);
    const ucn = String(call.ucn ?? '');
    const callNo = String(call.call_number ?? '');
    if (!ucn && !callNo) return;
    void Promise.all([reportsByCall(callNo || ucn), consumptionForCall(ucn, callNo)])
      .then(([visits, spares]) => {
        const latest = visits[0] as Record<string, unknown> | undefined;
        const d = (latest?.data && typeof latest.data === 'object' ? latest.data : {}) as Record<string, unknown>;
        setForm((f) => (f ? {
          ...f,
          service_observation: String(d['Complaint Observation'] ?? ''),
          problem_status: String(d['Job Done'] ?? ''),
          visit_remarks: visits.map((v) => {
            const vd = (v.data && typeof v.data === 'object' ? v.data : {}) as Record<string, unknown>;
            return `${fmtLongDate(v.visit_at) || ''} : ${String(vd['Job Done'] ?? '')}`.trim();
          }).filter((s) => s.length > 3).join('\n'),
          spares_consumed: spares.map((s) => String(s.part ?? '')).filter(Boolean).join(', '),
          call_solved_at: latest?.visit_at ?? null,
        } : f));
      })
      .catch(() => { /* the call's own fields are already in; the visit is a bonus */ });
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
    {
      key: '_doc', header: 'Report', width: 110, wrap: false,
      render: (r: Row) => (
        <button className="btn btn-ghost btn-sm" title="Download the R-SER-03 report"
                onClick={(e) => { e.stopPropagation(); doc(r); }}>📄 Word</button>
      ),
    },
  ], []);

  const doc = (r: Row) => {
    ffrDocDownload(ffrDocFrom(r, String(r.raised_by_name ?? '') || (user?.email ?? '')));
    logAudit({ action: 'ffr.document', target: String(r.ffr_no ?? ''), status: 'ok' });
  };

  const save = async () => {
    if (!form) return;
    const problem = String(form.problem_reported ?? '').trim();
    if (!problem) { setMsg({ tone: 'error', text: 'Problem reported by customer is required — it is what the report is about.' }); return; }
    if (!String(form.customer_name ?? '').trim()) { setMsg({ tone: 'error', text: 'Customer Name is required.' }); return; }
    setBusy(true);
    const payload = { ...form, raised_by_name: user?.email ?? '' };
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
        subtitle="Failures reported to manufacturing. The format is the Field Failure Register sheet; the report is R-SER-03 Rev 02."
        icon="🧪"
        count={visible.length}
        countMore={false}
        onRefresh={() => void load()}
        refreshing={busy}
        actions={mayRaise
          ? <button className="btn btn-primary" onClick={() => { setEditing(null); setForm(ffrFromCall({})); }}>＋ Raise FFR</button>
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
                {field('CAPA (if reqd) Responsibility', 'capa_responsibility')}
                {field('CAPA NO', 'capa_no')}
                {field('CAPA Status', 'capa_status', 'pick', FFR_CAPA_STATUS)}
                {field('FFR Status', 'ffr_status', 'pick', FFR_STATUS)}
                {field('Verified By', 'verified_by')}
                {field('CURRENT CALL STATUS', 'current_call_status')}
                {field('Remarks', 'remarks', 'long')}
              </div>
            </section>

            <div className="rep-actions">
              {editing != null && (
                <button className="btn btn-sm" onClick={() => doc({ ...(form as Row), id: '0' })}>📄 Word</button>
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
