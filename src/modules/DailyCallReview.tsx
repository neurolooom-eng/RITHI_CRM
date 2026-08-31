import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { PageHeader, SectionCard, Toolbar, Drawer } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { csvExport, fmtLongDate, statusBadge, timeAgo } from '../lib/format';
import { listCallReviews, listMasterLists, listMasterValuesForProduct, saveCallReview, supabaseConfigured, type MasterList } from '../lib/supabase';
import { fallbackList } from './masterLists';
import { MasterListTable } from './MasterListTable';
import { logAudit } from '../lib/audit';
import {
  DCCR_EXPORT_COLUMNS, GROUPING_MASTER, REVIEW_STATUSES, REVIEW_STATUS_TONES, ROOT_CAUSE_MASTER,
  SPARE_CATEGORY, YES_NO, actionFor, potentialEffect, toExportRow,
  type ReviewPatch, type ReviewRow,
} from '../lib/dccr';
import './dccr.css';
import './fieldcalls.css';

// ===========================================================================
// DAILY CALL REVIEW — the DCCR (Daily Customer Complaint Review Register).
//
// Every FIELD call is reviewed, every day, in three stages:
//
//   Review 1  Public Health Threat? / Death? / Serious Incident? — answered on
//             the Call Registration form, so its date IS the registration date
//             and this screen only shows it back.
//   Review 2  Risk to Patient / Warranty Failure (1yr) / Frequent Failure.
//   Review 3  Complaint Grouping / Root Cause Key Word /
//             Spare · Consumable · Correction · Calibration.
//
// Any Potential Effect, Action Taken (FFR Generation) and Review Status are
// DERIVED — the database computes them (0044_daily_call_review.sql); the drawer
// previews them from the same rules in src/lib/dccr.ts as the answers are given.
//
// One screen, four tabs: the register, the two masters it reads (both tagged
// per product), and the export in the register's own format.
// ===========================================================================

type Tab = 'register' | 'grouping' | 'rootcause' | 'export';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'register', label: 'Review Register', icon: '📋' },
  { key: 'grouping', label: 'DCCR Complaint Grouping', icon: '🗂️' },
  { key: 'rootcause', label: 'Root Cause Key Word', icon: '🔍' },
  { key: 'export', label: 'Export', icon: '⭳' },
];

const OPT = (arr: string[]) => ['', ...arr];

export function DailyCallReview() {
  const { user, can } = useAuth();
  const live = supabaseConfigured();
  const editable = live && can('review.edit');

  const [tab, setTab] = useState<Tab>('register');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    live ? null : { tone: 'info', text: 'Connect the database in Settings to run the daily review.' },
  );

  // The database registry describes each master (label, entry name, the Product
  // column); the built-in definition stands until 0044 has been applied.
  const [lists, setLists] = useState<Record<string, MasterList>>({});

  // ---- filters -------------------------------------------------------------
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [product, setProduct] = useState('');
  const [engineer, setEngineer] = useState('');
  const [effectOnly, setEffectOnly] = useState(false);
  const [search, setSearch] = useState('');

  // The call whose review is open.
  const [open, setOpen] = useState<ReviewRow | null>(null);

  const load = async () => {
    if (!live) return;
    setBusy(true);
    try {
      const r = (await listCallReviews()) as ReviewRow[];
      setRows(r);
      setLastSync(new Date().toISOString());
      setMsg(null);
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not read the review register: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  useEffect(() => {
    void load();
    if (!live) return;
    void listMasterLists()
      .then((all) => setLists(Object.fromEntries(all.map((l) => [l.key, l]))))
      .catch(() => { /* no registry yet — the built-in definitions stand */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const products = useMemo(
    () => [...new Set(rows.map((r) => String(r.product_name ?? '')).filter(Boolean))].sort(),
    [rows],
  );
  const engineers = useMemo(
    () => [...new Set(rows.map((r) => String(r.allocated_to ?? '')).filter(Boolean))].sort(),
    [rows],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const d = String(r.reg_date ?? '').slice(0, 10);
      if (from && (!d || d < from)) return false;
      if (to && (!d || d > to)) return false;
      if (status && r.review_status !== status) return false;
      if (product && r.product_name !== product) return false;
      if (engineer && r.allocated_to !== engineer) return false;
      if (effectOnly && r.any_potential_effect !== 'YES') return false;
      if (!q) return true;
      return [r.ucn, r.call_number, r.party_name, r.product_name, r.serial, r.allocated_to,
        r.standard_complaint, r.complaint_reported, r.complaint_grouping, r.root_cause_keyword]
        .some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }, [rows, from, to, status, product, engineer, effectOnly, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { 'Review 1 Pending': 0, 'Review 2 Pending': 0, 'Review 3 Pending': 0, 'Review Completed': 0 };
    visible.forEach((r) => { c[r.review_status] = (c[r.review_status] ?? 0) + 1; });
    return c;
  }, [visible]);
  const effects = useMemo(() => visible.filter((r) => r.any_potential_effect === 'YES').length, [visible]);

  const exportRows = () => {
    csvExport(
      `dccr-${new Date().toISOString().slice(0, 10)}.csv`,
      DCCR_EXPORT_COLUMNS,
      visible.map((r, i) => toExportRow(r, i)),
    );
    logAudit({ action: 'dccr.export', target: `${visible.length} calls`, meta: { rows: visible.length } });
  };

  const columns: Column<ReviewRow>[] = [
    { key: 'review_status', header: 'Review Status', width: 150, wrap: false, render: (r) => statusBadge(r.review_status, REVIEW_STATUS_TONES) },
    { key: 'ucn', header: 'UC Number', width: 115, wrap: false },
    { key: 'call_number', header: 'Call Number', width: 130, wrap: false },
    { key: 'reg_date', header: 'Call Date', width: 105, wrap: false, render: (r) => fmtLongDate(r.reg_date) },
    { key: 'party_name', header: 'Customer', width: 200 },
    { key: 'product_name', header: 'Product', width: 130 },
    { key: 'serial', header: 'Serial', width: 100, wrap: false },
    { key: 'allocated_to', header: 'Engineer', width: 140 },
    { key: 'complaint_reported', header: 'Nature of Complaint', width: 220 },
    {
      key: 'any_potential_effect', header: 'Any Potential Effect', width: 140, wrap: false,
      render: (r) => (r.any_potential_effect
        ? <span className={`badge badge-${r.any_potential_effect === 'YES' ? 'danger' : 'success'}`}>{r.any_potential_effect}</span>
        : <span className="muted">—</span>),
    },
    { key: 'action_taken', header: 'Action Taken', width: 140 },
    { key: 'complaint_grouping', header: 'Complaint Grouping', width: 170 },
    { key: 'root_cause_keyword', header: 'Root Cause Key Word', width: 170 },
    { key: 'spare_category', header: 'Spare / Consumable / Correction / Calibration', width: 150 },
    { key: 'review1_at', header: 'Date of Review 1', width: 120, wrap: false, render: (r) => fmtLongDate(r.review1_at) },
    { key: 'review2_at', header: 'Date of Review 2', width: 120, wrap: false, render: (r) => fmtLongDate(r.review2_at) },
    { key: 'review3_at', header: 'Date of Review 3', width: 120, wrap: false, render: (r) => fmtLongDate(r.review3_at) },
    {
      key: '_review', header: '', width: 110, sortable: false, wrap: false,
      render: (r) => (
        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>
          {r.review_status === 'Review Completed' ? 'View' : 'Review'}
        </button>
      ),
    },
  ];

  const masterList = (key: string): MasterList => lists[key] ?? fallbackList(key);

  return (
    <div>
      <PageHeader
        title="Daily Call Review"
        subtitle="DCCR — every field call through Review 1, 2 and 3"
        icon="🩺"
        count={tab === 'register' ? visible.length : undefined}
        actions={
          tab === 'register' ? (
            <>
              <button className="btn btn-sm" onClick={() => void load()} disabled={busy || !live}>{busy ? '…' : '↻ Refresh'}</button>
              <button className="btn btn-primary btn-sm" onClick={exportRows} disabled={!visible.length}>⭳ Export DCCR</button>
            </>
          ) : undefined
        }
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <div className="dccr-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`dccr-tab${tab === t.key ? ' is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.icon} {t.label}
            {t.key === 'register' && rows.length > 0 && <span className="dccr-tab-count">{visible.length.toLocaleString()}</span>}
          </button>
        ))}
      </div>

      {tab === 'register' && (
        <>
          <KpiGrid min={170}>
            <KpiCard label="Calls in view" value={visible.length} tone="primary" icon="📋" />
            <KpiCard label="Review 1 Pending" value={counts['Review 1 Pending']} tone={counts['Review 1 Pending'] ? 'danger' : 'neutral'} />
            <KpiCard label="Review 2 Pending" value={counts['Review 2 Pending']} tone={counts['Review 2 Pending'] ? 'warning' : 'neutral'} />
            <KpiCard label="Review 3 Pending" value={counts['Review 3 Pending']} tone={counts['Review 3 Pending'] ? 'info' : 'neutral'} />
            <KpiCard label="Review Completed" value={counts['Review Completed']} tone="success" />
            <KpiCard label="Any Potential Effect" value={effects} tone={effects ? 'danger' : 'neutral'} icon="⚠️" sub="FFR to be raised" />
          </KpiGrid>

          <div className="filter-bar">
            <div>
              <label className="field-label">Call Date from</label>
              <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="field-label">to</label>
              <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Review Status</label>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All stages</option>
                {REVIEW_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Product</label>
              <select className="select" value={product} onChange={(e) => setProduct(e.target.value)}>
                <option value="">All products</option>
                {products.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Engineer</label>
              <select className="select" value={engineer} onChange={(e) => setEngineer(e.target.value)}>
                <option value="">All engineers</option>
                {engineers.map((e) => <option key={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">&nbsp;</label>
              <label className="row" style={{ height: 36 }}>
                <input type="checkbox" checked={effectOnly} onChange={(e) => setEffectOnly(e.target.checked)} />
                <span>Potential effect only</span>
              </label>
            </div>
          </div>

          <SectionCard title="Review Register">
            <DataTable<ReviewRow>
              columns={columns}
              rows={visible}
              getRowId={(r) => r.ucn}
              onRowClick={(r) => setOpen(r)}
              storageKey="dccr-register"
              rowsBeforeScroll={12}
              dense
              emptyText={busy ? 'Loading…' : live ? 'No calls match these filters.' : 'Connect the database to load the register.'}
              toolbar={
                <Toolbar>
                  <input className="input" placeholder="Search UCN, customer, product, complaint…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <div className="spacer" />
                  {lastSync && <span className="muted">synced {timeAgo(lastSync)}</span>}
                </Toolbar>
              }
            />
          </SectionCard>
        </>
      )}

      {tab === 'grouping' && (
        <SectionCard title="DCCR Complaint Grouping">
          <p className="muted" style={{ marginTop: 0 }}>
            Tagged per product — Review 3 offers a call only the groupings for its own product,
            plus anything tagged <b>COMM</b> (common to every product).
          </p>
          <MasterListTable list={masterList(GROUPING_MASTER)} />
        </SectionCard>
      )}

      {tab === 'rootcause' && (
        <SectionCard title="Root Cause Key Word">
          <p className="muted" style={{ marginTop: 0 }}>
            Tagged per product — Review 3 offers a call only the key words for its own product,
            plus anything tagged <b>COMM</b> (common to every product).
          </p>
          <MasterListTable list={masterList(ROOT_CAUSE_MASTER)} />
        </SectionCard>
      )}

      {tab === 'export' && (
        <SectionCard title="Export — DCCR format">
          <p className="muted" style={{ marginTop: 0 }}>
            The register's own columns, in its own order and under its own headings, so the file
            drops straight into the workbook. It exports <b>what the Review Register tab is
            currently showing</b> — set the date range and the filters there first.
          </p>
          <div className="row" style={{ marginBottom: 14 }}>
            <button className="btn btn-primary" onClick={exportRows} disabled={!visible.length}>
              ⭳ Export {visible.length.toLocaleString()} {visible.length === 1 ? 'call' : 'calls'}
            </button>
            <button className="btn" onClick={() => setTab('register')}>Change the filters</button>
          </div>
          <h4 style={{ marginBottom: 8 }}>Columns ({DCCR_EXPORT_COLUMNS.length})</h4>
          <ol className="dccr-export-cols">
            {DCCR_EXPORT_COLUMNS.map((c) => <li key={c.key}>{c.header}</li>)}
          </ol>
        </SectionCard>
      )}

      <ReviewDrawer
        row={open}
        editable={editable}
        reviewer={user?.fullName || user?.email || ''}
        onClose={() => setOpen(null)}
        onSaved={async () => { setOpen(null); await load(); }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One call's review: Review 1 as it was answered at registration (read-only),
// then Review 2 and Review 3. Any Potential Effect and the action it calls for
// are previewed live from the same rules the database applies on save.
// ---------------------------------------------------------------------------
function ReviewDrawer({
  row, editable, reviewer, onClose, onSaved,
}: {
  row: ReviewRow | null;
  editable: boolean;
  reviewer: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<ReviewPatch>({});
  const [groupings, setGroupings] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const ucn = row?.ucn ?? '';
  const productName = row?.product_name ?? '';

  useEffect(() => {
    if (!row) return;
    setErr('');
    setDraft({
      risk_to_patient: row.risk_to_patient ?? '',
      warranty_failure: row.warranty_failure ?? '',
      frequent_failure: row.frequent_failure ?? '',
      complaint_grouping: row.complaint_grouping ?? '',
      root_cause_keyword: row.root_cause_keyword ?? '',
      spare_category: row.spare_category ?? '',
      service_observation: row.service_observation ?? '',
      action_taken: row.action_taken ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ucn]);

  // The two masters, narrowed to this call's product (plus the COMM values).
  useEffect(() => {
    if (!row) return;
    let cancelled = false;
    void listMasterValuesForProduct(GROUPING_MASTER, productName)
      .then((v) => { if (!cancelled) setGroupings(v); }).catch(() => { if (!cancelled) setGroupings([]); });
    void listMasterValuesForProduct(ROOT_CAUSE_MASTER, productName)
      .then((v) => { if (!cancelled) setKeywords(v); }).catch(() => { if (!cancelled) setKeywords([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ucn, productName]);

  if (!row) return null;

  const set = (k: keyof ReviewPatch) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  const effect = potentialEffect(draft.risk_to_patient, draft.warranty_failure, draft.frequent_failure);
  const action = actionFor(effect, draft.action_taken ?? '');
  const stage2Done = !!(draft.risk_to_patient && draft.warranty_failure && draft.frequent_failure);
  const stage3Done = !!(draft.complaint_grouping && draft.root_cause_keyword && draft.spare_category);

  // A value already on the record but no longer in its product's list still has
  // to be offered, or opening an old review would silently blank it.
  const withCurrent = (list: string[], current?: string) =>
    current && !list.includes(current) ? [current, ...list] : list;

  const save = async () => {
    setBusy(true); setErr('');
    const patch: Record<string, unknown> = { ...draft };
    if (stage2Done && !row.review2_done) patch.review2_by = reviewer;
    if (stage3Done && !row.review3_done) patch.review3_by = reviewer;
    const r = await saveCallReview(ucn, String(row.call_number ?? ''), patch);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? 'Could not save this review.'); return; }
    logAudit({ action: 'dccr.review', target: ucn, meta: { stage2: stage2Done, stage3: stage3Done } });
    await onSaved();
  };

  return (
    <Drawer open onClose={onClose} title={`Daily Review — ${ucn}`} width={760}>
      <div className="dccr-callcard">
        <div><span>Call Number</span>{row.call_number || '—'}</div>
        <div><span>Call Date</span>{fmtLongDate(row.reg_date) || '—'}</div>
        <div><span>Customer</span>{row.party_name || '—'}</div>
        <div><span>Product · Serial</span>{[row.product_name, row.serial].filter(Boolean).join(' · ') || '—'}</div>
        <div><span>Engineer</span>{row.allocated_to || '—'}</div>
        <div><span>Call Status</span>{row.open_state || row.last_status || row.status || '—'}</div>
        <div className="dccr-wide" style={{ gridColumn: '1 / -1' }}>
          <span>Nature of Complaint</span>{row.complaint_reported || row.standard_complaint || '—'}
        </div>
      </div>

      {/* ---- Review 1 — answered at registration -------------------------- */}
      <div className="dccr-stage">
        <div className="dccr-stage-head">
          <h3>Review 1 · at Call Registration</h3>
          {statusBadge(row.review1_done ? 'Completed' : 'Pending', { Completed: 'success', Pending: 'danger' })}
          <span className="dccr-stage-date">{row.review1_at ? fmtLongDate(row.review1_at) : 'not dated'}</span>
        </div>
        <div className="dccr-fields">
          <ReadOnly label="Public Health Threat?" value={row.public_health_threat} />
          <ReadOnly label="Death?" value={row.death} />
          <ReadOnly label="Serious Incident?" value={row.serious_incident} />
        </div>
        {!row.review1_done && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Answered on the Call Registration form — edit the call in the Field Call Register to complete it.
          </p>
        )}
      </div>

      {/* ---- Review 2 ---------------------------------------------------- */}
      <div className="dccr-stage">
        <div className="dccr-stage-head">
          <h3>Review 2 · Risk assessment</h3>
          {statusBadge(stage2Done ? 'Completed' : 'Pending', { Completed: 'success', Pending: 'warning' })}
          <span className="dccr-stage-date">{row.review2_at ? fmtLongDate(row.review2_at) : 'dated when completed'}</span>
        </div>
        <div className="dccr-fields">
          <Choice label="Risk to Patient / Any Clinical Impact" value={draft.risk_to_patient} onChange={set('risk_to_patient')} disabled={!editable} />
          <Choice label="Warranty Failure (1 yr)" value={draft.warranty_failure} onChange={set('warranty_failure')} disabled={!editable} />
          <Choice label="Frequent Failure" value={draft.frequent_failure} onChange={set('frequent_failure')} disabled={!editable} />
        </div>
        <div className="dccr-derived">
          <b>Any Potential Effect:</b>
          {effect
            ? <span className={`badge badge-${effect === 'YES' ? 'danger' : 'success'}`}>{effect}</span>
            : <span className="muted">— all three answers needed</span>}
          {effect === 'YES' && <span className="muted">→ a Field Failure Report is to be raised.</span>}
        </div>
      </div>

      {/* ---- Review 3 ---------------------------------------------------- */}
      <div className="dccr-stage">
        <div className="dccr-stage-head">
          <h3>Review 3 · Root cause</h3>
          {statusBadge(stage3Done ? 'Completed' : 'Pending', { Completed: 'success', Pending: 'info' })}
          <span className="dccr-stage-date">{row.review3_at ? fmtLongDate(row.review3_at) : 'dated when completed'}</span>
        </div>
        <div className="dccr-fields">
          <div>
            <label className="field-label">Complaint Grouping</label>
            <select className="select" value={draft.complaint_grouping ?? ''} onChange={set('complaint_grouping')} disabled={!editable}>
              {OPT(withCurrent(groupings, draft.complaint_grouping)).map((v) => <option key={v} value={v}>{v || '— select —'}</option>)}
            </select>
            <div className="field-help">{groupings.length} for {productName || 'this product'} (incl. COMM)</div>
          </div>
          <div>
            <label className="field-label">Root Cause Key Word</label>
            <select className="select" value={draft.root_cause_keyword ?? ''} onChange={set('root_cause_keyword')} disabled={!editable}>
              {OPT(withCurrent(keywords, draft.root_cause_keyword)).map((v) => <option key={v} value={v}>{v || '— select —'}</option>)}
            </select>
            <div className="field-help">{keywords.length} for {productName || 'this product'} (incl. COMM)</div>
          </div>
          <div>
            <label className="field-label">Spare / Consumable / Correction / Calibration</label>
            <select className="select" value={draft.spare_category ?? ''} onChange={set('spare_category')} disabled={!editable}>
              {OPT(withCurrent(SPARE_CATEGORY, draft.spare_category)).map((v) => <option key={v} value={v}>{v || '— select —'}</option>)}
            </select>
          </div>
          <div className="dccr-wide">
            <label className="field-label">Service Dept Observation</label>
            <textarea className="textarea" rows={2} value={draft.service_observation ?? ''} onChange={set('service_observation')} disabled={!editable} />
          </div>
          <div className="dccr-wide">
            <label className="field-label">Action Taken</label>
            <input
              className="input"
              value={draft.action_taken ?? ''}
              onChange={set('action_taken')}
              placeholder={effect === 'YES' ? 'FFR Generation — replace with the FFR number, e.g. FFR-001/26' : 'Set when Any Potential Effect is YES'}
              disabled={!editable}
            />
            <div className="field-help">
              {effect === 'YES'
                ? <>Any Potential Effect is YES, so this is <b>{action || 'FFR Generation'}</b> until the FFR number is entered.</>
                : 'Filled automatically with “FFR Generation” once Any Potential Effect turns YES.'}
            </div>
          </div>
        </div>
      </div>

      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={() => void save()} disabled={!editable || busy}>
          {busy ? 'Saving…' : 'Save review'}
        </button>
        <button className="btn" onClick={onClose}>Close</button>
        {!editable && <span className="muted">You need the “Complete the daily call review” permission to change this.</span>}
      </div>
    </Drawer>
  );
}

function ReadOnly({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input className="input" value={String(value ?? '') || '—'} readOnly />
    </div>
  );
}

function Choice({
  label, value, onChange, disabled,
}: {
  label: string;
  value?: string;
  onChange: (e: { target: { value: string } }) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <select className="select" value={value ?? ''} onChange={onChange} disabled={disabled}>
        {OPT(YES_NO).map((v) => <option key={v} value={v}>{v || '— select —'}</option>)}
      </select>
    </div>
  );
}
