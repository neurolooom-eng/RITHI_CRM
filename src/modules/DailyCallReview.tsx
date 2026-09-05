import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { PageHeader, SectionCard, Toolbar, Drawer } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { csvExport, fmtLongDate, statusBadge, timeAgo } from '../lib/format';
import {
  callReview, countCallReviews, listCallReviews, listMasterLists, listMasterValuesForProduct,
  reviewPickLists, saveCallReview, supabaseConfigured, type MasterList, type ReviewFilter,
} from '../lib/supabase';
import { fallbackList } from './masterLists';
import { MasterListTable } from './MasterListTable';
import { logAudit } from '../lib/audit';
import {
  DCCR_EXPORT_COLUMNS, GROUPING_MASTER, REVIEW_STATUSES, REVIEW_STATUS_TONES, ROOT_CAUSE_MASTER,
  SPARE_CATEGORY, YES_NO, actionFor, potentialEffect, toExportRow, yearStartISO,
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

// How many calls one read brings back. The register is paged rather than
// pulled down whole: the per-call report lookups (0047) run for every row a
// query returns, so a page is the difference between a quarter of a second
// and a stalled screen.
const PAGE = 500;
// `field_calls.open_state` — the four it can hold. Cancelled is deliberately
// not here: the full view the rows come from does not carry `cancelled_at`
// (see 0111), so offering it would filter the counters and not the rows.
const CALL_STATES = ['Unattended', 'Unsolved', 'Report pending', 'Solved'];


export function DailyCallReview() {
  const { user, can } = useAuth();
  const live = supabaseConfigured();
  const editable = live && can('review.edit');

  const [tab, setTab] = useState<Tab>('register');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [counts, setCounts] = useState<{ total: number; byStatus: Record<string, number>; effects: number }>(
    { total: 0, byStatus: {}, effects: 0 },
  );
  const [lastSync, setLastSync] = useState('');
  // True when the database predates the report context (0047/0048).
  const [stale, setStale] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    live ? null : { tone: 'info', text: 'Connect the database in Settings to run the daily review.' },
  );

  // The database registry describes each master (label, entry name, the Product
  // column); the built-in definition stands until 0044 has been applied.
  const [lists, setLists] = useState<Record<string, MasterList>>({});

  // ---- filters -------------------------------------------------------------
  // Every one of these is applied by the DATABASE, and the register is read a
  // page at a time — the whole register is far too much to pull down at once.
  // IT OPENS ON THE WHOLE OF THIS YEAR. It is a daily review, but the register
  // it keeps is the year's — and the next year starts fresh. Opening on the
  // last 30 days made a register holding 3,850 calls show 425, which reads as
  // an upload that failed rather than a filter that is doing its job.
  const [from, setFrom] = useState(yearStartISO());
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');       // the PAPERWORK: Review 1/2/3
  const [callState, setCallState] = useState('');  // the CALL: Unattended / Solved / …
  const [product, setProduct] = useState('');
  const [engineer, setEngineer] = useState('');
  const [effectOnly, setEffectOnly] = useState(false);
  const [search, setSearch] = useState('');
  // What the loaded page set was actually read with, so Load more keeps asking
  // for the same thing while the boxes are being typed in.
  const [applied, setApplied] = useState<ReviewFilter>({ from: yearStartISO() });

  // The pick-lists. Read once from the whole register (the summary view, which
  // has no per-call lookups) rather than from whatever page is loaded — a
  // product only used last year must still be selectable.
  const [products, setProducts] = useState<string[]>([]);
  const [engineers, setEngineers] = useState<string[]>([]);

  // The call whose review is open.
  const [open, setOpen] = useState<ReviewRow | null>(null);

  const filter = useMemo<ReviewFilter>(() => ({
    from: from || undefined, to: to || undefined, status: status || undefined,
    callState: callState || undefined,
    product: product || undefined, engineer: engineer || undefined,
    effectOnly: effectOnly || undefined, q: search.trim() || undefined,
  }), [from, to, status, callState, product, engineer, effectOnly, search]);

  const load = async (f: ReviewFilter) => {
    if (!live) return;
    setBusy(true);
    try {
      const page = (await listCallReviews(f, 0, PAGE)) as ReviewRow[];
      setRows(page);
      setMore(page.length === PAGE);
      setApplied(f);
      setLastSync(new Date().toISOString());
      // A register from before 0047/0048 has no report columns at all. Left
      // alone that reads as "no visit reported yet" on every call, which is
      // indistinguishable from a call nobody has attended — so say what it is.
      const stale = page.length > 0 && page[0].visit_details === undefined;
      setStale(stale);
      setMsg(stale
        ? { tone: 'info', text: 'The visits, spares consumed, software version and product age are not in this database yet — run supabase/apply/daily_review.sql, then refresh.' }
        : null);
      // The stage counters cover the WHOLE filtered set, not the page shown.
      void countCallReviews(f).then(setCounts).catch(() => { /* counters stay as they were */ });
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not read the review register: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const next = (await listCallReviews(applied, rows.length, PAGE)) as ReviewRow[];
      setRows((r) => [...r, ...next]);
      setMore(next.length === PAGE);
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not read the next page: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setLoadingMore(false); }
  };

  // Re-read when a filter changes. The free-text box is debounced so a query
  // is not fired on every keystroke.
  useEffect(() => {
    if (!live) return;
    const t = setTimeout(() => { void load(filter); }, search ? 400 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, filter]);

  useEffect(() => {
    if (!live) return;
    void listMasterLists()
      .then((all) => setLists(Object.fromEntries(all.map((l) => [l.key, l]))))
      .catch(() => { /* no registry yet — the built-in definitions stand */ });
    void reviewPickLists()
      .then((p) => { setProducts(p.products); setEngineers(p.engineers); })
      .catch(() => { /* the boxes stay empty; the register still reads */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const statusCount = (s: string) => counts.byStatus[s] ?? 0;

  // Export covers the WHOLE filtered set, not the pages that happen to be on
  // screen — so it is read here rather than taken from `rows`.
  const [exporting, setExporting] = useState(false);
  const exportRows = async () => {
    if (exporting) return;
    setExporting(true);
    setMsg({ tone: 'info', text: `Reading ${counts.total.toLocaleString()} calls for the export…` });
    try {
      const all: ReviewRow[] = [];
      for (let off = 0; ; off += PAGE) {
        const page = (await listCallReviews(applied, off, PAGE)) as ReviewRow[];
        all.push(...page);
        if (page.length < PAGE) break;
        setMsg({ tone: 'info', text: `Read ${all.length.toLocaleString()} of ${counts.total.toLocaleString()}…` });
      }
      csvExport(`dccr-${new Date().toISOString().slice(0, 10)}.csv`, DCCR_EXPORT_COLUMNS, all.map((r, i) => toExportRow(r, i)));
      setMsg({ tone: 'ok', text: `Exported ${all.length.toLocaleString()} calls.` });
      logAudit({ action: 'dccr.export', target: `${all.length} calls`, meta: { rows: all.length } });
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not export: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setExporting(false); }
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
      key: 'open_state', header: 'Call Status', width: 130, wrap: false,
      render: (r) => (r.open_state || r.last_status || r.status || <span className="muted">—</span>),
    },
    { key: 'visit_details', header: 'Visit Details', width: 260 },
    { key: 'spares_consumed', header: 'Spares Consumed', width: 220 },
    { key: 'sw_version', header: 'SW Version', width: 100, wrap: false },
    {
      key: 'age_group', header: 'Age of Product', width: 130, wrap: false,
      accessor: (r) => r.age_days ?? -1,
      render: (r) => (r.age_days == null
        ? <span className="muted">—</span>
        : <span title={`${r.age_days.toLocaleString()} days from warranty start`}>{r.age_group}</span>),
    },
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
        // The count is EXACT — countCallReviews walks every page of the summary
        // view — so no "+", even though only the first page of rows is on
        // screen. `moreAvailable` is what puts Load more beside it.
        count={tab === 'register' ? counts.total : undefined}
        moreAvailable={tab === 'register' && more}
        onLoadMore={tab === 'register' ? () => void loadMore() : undefined}
        loadingMore={loadingMore}
        status={tab === 'register' ? (
          <>
            <span className={`conn-dot ${live ? 'conn-on' : 'conn-off'}`}>
              {live ? 'Database connected' : 'Not connected'}
            </span>
            {/* Rows ON SCREEN against the whole filtered set — the one number
                here that IS partial, so it carries the "+". */}
            <span className="conn-dot conn-off">
              showing {rows.length.toLocaleString()}{more ? '+' : ''} of {counts.total.toLocaleString()}
            </span>
            {lastSync && <span className="conn-dot conn-off" title={new Date(lastSync).toLocaleString()}>⟳ synced {timeAgo(lastSync)}</span>}
          </>
        ) : undefined}
        actions={
          tab === 'register' ? (
            <>
              <button className="btn btn-sm" onClick={() => void load(filter)} disabled={busy || !live}>{busy ? '…' : '↻ Refresh'}</button>
              <button className="btn btn-primary btn-sm" onClick={() => void exportRows()} disabled={exporting || !counts.total}>{exporting ? 'Exporting…' : '⭳ Export DCCR'}</button>
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
            {t.key === 'register' && counts.total > 0 && <span className="dccr-tab-count">{counts.total.toLocaleString()}</span>}
          </button>
        ))}
      </div>

      {tab === 'register' && (
        <>
          <KpiGrid min={170}>
            <KpiCard label="Calls in view" value={counts.total} tone="primary" icon="📋" />
            <KpiCard label="Review 1 Pending" value={statusCount('Review 1 Pending')} tone={statusCount('Review 1 Pending') ? 'danger' : 'neutral'} />
            <KpiCard label="Review 2 Pending" value={statusCount('Review 2 Pending')} tone={statusCount('Review 2 Pending') ? 'warning' : 'neutral'} />
            <KpiCard label="Review 3 Pending" value={statusCount('Review 3 Pending')} tone={statusCount('Review 3 Pending') ? 'info' : 'neutral'} />
            <KpiCard label="Review Completed" value={statusCount('Review Completed')} tone="success" />
            <KpiCard label="Any Potential Effect" value={counts.effects} tone={counts.effects ? 'danger' : 'neutral'} icon="⚠️" sub="FFR to be raised" />
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
              {/* Two different questions about the same call: Review Status is
                  where the PAPERWORK has got to, this is where the CALL has. */}
              <label className="field-label">Call Status</label>
              <select className="select" value={callState} onChange={(e) => setCallState(e.target.value)}>
                <option value="">All call statuses</option>
                {CALL_STATES.map((s) => <option key={s}>{s}</option>)}
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
              rows={rows}
              getRowId={(r) => r.ucn}
              onRowClick={(r) => setOpen(r)}
              storageKey="dccr-register"
              rowsBeforeScroll={12}
              dense
              // Load more lives beside the count in the heading (see PageHeader),
              // so it is NOT passed here. `moreAvailable` stays: it is what puts
              // the "+" on the footer's row count and on every group heading,
              // which ARE counts over the rows loaded.
              moreAvailable={more}
              emptyText={busy ? 'Loading…' : live ? 'No calls match these filters.' : 'Connect the database to load the register.'}
              toolbar={
                <Toolbar>
                  <input className="input" placeholder="Search UCN, customer, product, complaint…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <div className="spacer" />
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
            drops straight into the workbook. It exports <b>every call the Review Register's
            filters match</b> — not just the pages loaded on screen — so set the date range and
            the filters there first.
          </p>
          <div className="row" style={{ marginBottom: 14 }}>
            <button className="btn btn-primary" onClick={() => void exportRows()} disabled={exporting || !counts.total}>
              {exporting ? 'Exporting…' : `⭳ Export ${counts.total.toLocaleString()} ${counts.total === 1 ? 'call' : 'calls'}`}
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
        stale={stale}
        editable={editable}
        reviewer={user?.fullName || user?.email || ''}
        onClose={() => setOpen(null)}
        onSaved={async () => { setOpen(null); await load(applied); }}
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
  row, stale, editable, reviewer, onClose, onSaved,
}: {
  row: ReviewRow | null;
  stale: boolean;
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
  // The row on the register is from a page read; re-read this one call so the
  // report context (visits, spares, software version) is what it is right now.
  const [live, setLive] = useState<ReviewRow | null>(null);

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

  useEffect(() => {
    if (!ucn) { setLive(null); return; }
    let cancelled = false;
    setLive(null);
    void callReview(ucn)
      .then((r) => { if (!cancelled && r) setLive(r as ReviewRow); })
      .catch(() => { /* the register's own row stands */ });
    return () => { cancelled = true; };
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
  const ctx = live ?? row;   // the freshly-read row when it has arrived

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

      {/* ---- What the reviewer judges the call by, from the report --------- */}
      <div className="dccr-stage dccr-report">
        <div className="dccr-stage-head">
          <h3>From the report</h3>
          <span className="dccr-stage-date">
            {stale ? 'not in this database yet'
              : ctx.visit_count ? `${ctx.visit_count} visit${ctx.visit_count === 1 ? '' : 's'}` : 'no visit reported yet'}
          </span>
        </div>
        <div className="dccr-fields">
          <ReadOnly label="Call Status" value={ctx.open_state || ctx.last_status || ctx.status} />
          <ReadOnly label="Software Version" value={ctx.sw_version} />
          <ReadOnly
            label="Age of the Product at failure"
            value={ctx.age_days == null ? '' : `${ctx.age_days.toLocaleString()} days · ${ctx.age_group}`}
          />
        </div>
        {ctx.pending_reason && (
          <p className="muted" style={{ margin: '10px 0 0' }}>Pending reason: {ctx.pending_reason}</p>
        )}
        <div style={{ marginTop: 12 }}>
          <label className="field-label">Visit Details</label>
          {ctx.visit_details
            ? <pre className="dccr-visits">{ctx.visit_details}</pre>
            : <div className="muted">{stale
                ? 'Run supabase/apply/daily_review.sql to bring the visits onto the review.'
                : 'No visit has been reported against this call yet.'}</div>}
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="field-label">Spares Consumed{ctx.spares_count ? ` (${ctx.spares_count})` : ''}</label>
          {ctx.spares_consumed
            ? <div className="dccr-spares">{ctx.spares_consumed}</div>
            : <div className="muted">{stale
                ? 'Run supabase/apply/daily_review.sql to bring the consumption onto the review.'
                : 'No spare booked against this call.'}</div>}
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
