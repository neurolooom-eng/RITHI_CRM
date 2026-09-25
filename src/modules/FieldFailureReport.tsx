import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader, Drawer, SearchBox } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { SelectPicker } from '../components/ui/SelectPicker';
import { MultiPick } from '../components/ui/MultiPick';
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
import { FieldFailureInsights } from './FieldFailureInsights';
import { FieldFailureDesk } from './FieldFailureDesk';
import { useMySignature, signatureBelongsTo } from '../lib/signature';
import { companyLogoBytes, COMPANY_LOGO_TYPE } from '../lib/brand';
import './fieldcalls.css';
import { cappedAt } from '../lib/exportscope';

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
  // TWO TABS (the user, 2026-09-12): Insights across the record, Register for
  // the record itself. Register opens on the DESK they asked for; the flat
  // table is the other view on it, because a desk cannot do what a table does —
  // every column at once, sorted, filtered and exported.
  const [tab, setTab] = useState<'insights' | 'register'>('register');
  const [view, setView] = useState<'desk' | 'table'>('desk');

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

  // ---------------------------------------------------------------------------
  // THE YEAR. The user's ask, 2026-09-14: "Add Year Filter - Default it to the
  // Current Year."
  //
  // A year is a REPORTING PERIOD, not an ad-hoc search, so it is the one filter
  // that also narrows Insights — the question "how did we do in 2026" is a real
  // one and the answer moves with the year by design. The search box and the
  // status chips still do NOT reach Insights: an aggregate that shifts while
  // somebody types is answering a different question from the one on screen.
  //
  // BY THE FFR DATE, the date on the report — the same date the Objective
  // register counts by (0142), so the two agree. Not created_at: a 2025 report
  // typed up in January is a 2025 failure.
  const ffrYear = (r: Row) => String(r.ffr_date ?? '').slice(0, 4);
  const thisYear = String(new Date().getFullYear());

  // MULTI-SELECT, both of them (the user's ask, 2026-09-14). EMPTY MEANS ALL,
  // which is what makes the Product filter free to sit beside the Year one:
  // it starts ticking nothing and therefore hides nothing.
  //
  // The Year still OPENS on the current year, because that was the earlier ask
  // and a register that opens on eleven years of history is not the register
  // anybody wanted. Ticking a second year adds to it rather than replacing it.
  const [years, setYears] = useState<string[]>([thisYear]);
  const [products, setProducts] = useState<string[]>([]);

  // Every year the register actually holds, newest first, with the current one
  // always offered even when it holds nothing yet — otherwise the default would
  // not be selectable on an empty year and the control would look broken.
  const yearOptions = useMemo(() => {
    const seen = new Set(rows.map(ffrYear).filter((y) => /^\d{4}$/.test(y)));
    seen.add(thisYear);
    return [...seen].sort().reverse();
  }, [rows, thisYear]);

  // THE PRODUCTS ON OFFER ARE THE ONES THIS YEAR HOLDS, not every product the
  // register has ever seen. A filter that lists a model with nothing behind it
  // in the chosen period offers a click that can only ever empty the screen.
  const productOptions = useMemo(() => {
    const pool = years.length ? rows.filter((r) => years.includes(ffrYear(r))) : rows;
    return [...new Set(pool.map((r) => String(r.product_name ?? '').trim()).filter(Boolean))].sort();
  }, [rows, years]);

  const inYear = useMemo(() => rows.filter((r) =>
    (years.length === 0 || years.includes(ffrYear(r)))
    && (products.length === 0 || products.includes(String(r.product_name ?? '').trim()))),
    [rows, years, products]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inYear.filter((r) =>
      (!status || String(r.ffr_status ?? '') === status)
      && (!needle || ['ffr_no', 'ucn', 'customer_name', 'product_name', 'product_serial', 'problem_reported']
        .some((k) => String(r[k] ?? '').toLowerCase().includes(needle))));
  }, [inYear, q, status]);

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
    // NOT []. The 📄 Word button above calls THIS render's `doc`, and `doc`
    // reads the signature -- which `useMySignature()` loads AFTER the first
    // render. Memoised on [] the columns kept the first render's `doc` for
    // ever, so the report never carried a signature and the audit row always
    // said signed: false. The primitives, not `user`: the auth context rebuilds
    // its value on every render, and `doc` reads only these three.
  ], [mySig, user?.email, user?.fullName]);

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
        subtitle="Raised automatically when a call is answered YES for Any Potential Effect in the Daily Complaint Review Register. The format is the Field Failure Register sheet; the report is R-SER-03 Rev 02."
        icon="🧪"
        count={tab === 'insights' ? inYear.length : visible.length}
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

      {/* AN EMPTY REGISTER IS NOT AN ANSWER. Reported 2026-09-12: somebody
          holding the permission opened this page and found nothing, with the
          menu entry present and the box ticked — so it read as broken rather
          than as withheld.
          The rows are governed by RLS, not by the page key: without
          `ffr.view` a reader sees only reports on calls THEY can see. When that
          comes to nothing, the screen says so and names the right to ask for,
          because "there are no reports" and "you cannot see the reports" look
          identical and mean opposite things. */}
      {!busy && !rows.length && supabaseConfigured() && !can('ffr.view') && (
        <div className="sheet-banner sheet-banner-info">
          <span>
            Nothing here — and that may be access rather than an empty register.
            Without the <b>Read the whole Field Failure Register</b> right you see
            only reports raised on calls you can see. Ask an administrator for it
            under Roles &amp; Permissions.
          </span>
        </div>
      )}

      {/* A DEFAULT THAT LANDS ON AN EMPTY YEAR LOOKS LIKE A BROKEN REGISTER.
          This page already learned that lesson once (the access banner above):
          "there is nothing" and "there is nothing HERE" look identical and mean
          different things. So say which, and offer the way out. */}
      {!busy && !inYear.length && rows.length > 0 && (years.length > 0 || products.length > 0) && (
        <div className="sheet-banner sheet-banner-info">
          <span>
            Nothing matches {years.length ? <b>{years.join(', ')}</b> : null}
            {years.length && products.length ? ' and ' : null}
            {products.length ? <b>{products.join(', ')}</b> : null}.
            {' '}The register holds <b>{rows.length}</b> report{rows.length === 1 ? '' : 's'} in all.
            {' '}
            <button className="btn btn-sm" onClick={() => { setYears([]); setProducts([]); }}>
              Clear the filters
            </button>
          </span>
        </div>
      )}

      {/* THE YEAR SITS BESIDE THE TABS, not inside one of them, because it
          narrows BOTH — a period chosen on the register that silently did not
          apply to Insights would make the two disagree with no way to see why. */}
      <div className="stage-chips hs-tabs">
        <label className="cr-year">
          <span className="muted">Year</span>
          <MultiPick values={years} onChange={setYears} options={yearOptions}
                     allLabel="All years" noun="years" className="cr-year-pick" />
        </label>
        <label className="cr-year">
          <span className="muted">Product</span>
          <MultiPick values={products} onChange={setProducts} options={productOptions}
                     allLabel="All products" noun="products" className="cr-prod-pick" />
        </label>
        {/* WHAT YOU ARE LOOKING AT, ALL OF IT ON THE RIGHT (the user's ask,
            2026-09-14: "Arrange all the Viewing option on the Right , Filters
            on the Left"). Insights/Register and Desk/Table are the same kind of
            control — which view — and they were split either side of the
            spacer, so one pair sat among the filters and read as one. The
            spacer moves ahead of both instead. */}
        <div className="spacer" />
        <button className={`chip ${tab === 'insights' ? 'chip-on' : ''}`} onClick={() => setTab('insights')}>
          📈 Insights
        </button>
        <button className={`chip ${tab === 'register' ? 'chip-on' : ''}`} onClick={() => setTab('register')}>
          🧪 Register <b>{inYear.length}</b>
        </button>
        {tab === 'register' && (
          <>
            <button className={`chip ${view === 'desk' ? 'chip-on' : ''}`} onClick={() => setView('desk')}>Desk</button>
            <button className={`chip ${view === 'table' ? 'chip-on' : ''}`} onClick={() => setView('table')}>Table</button>
          </>
        )}
      </div>

      {tab === 'insights' ? (
        // OVER EVERY ROW IN THE CHOSEN YEAR, and no further: an aggregate that
        // moves when somebody types in a search box is a different question
        // from the one the page appears to be answering, so the search and the
        // status chips stop here. The YEAR does reach it — that is a reporting
        // period, and it is shown beside the tabs so it is never invisible.
        <FieldFailureInsights rows={inYear} more={rows.length >= 5000} />
      ) : view === 'desk' ? (
        <FieldFailureDesk
          rows={visible}
          busy={busy}
          // The desk SHOWS and the drawer WRITES — one save path, not two.
          onEdit={(r) => { if (mayRaise) { setEditing(Number(r.id)); setForm({ ...r }); } }}
        />
      ) : (
        <>
          <div className="cr-bar" style={{ marginBottom: 10 }}>
            <SearchBox value={q} onChange={setQ} placeholder="FFR no, UCN, customer, product, serial, problem…" />
            <div className="cr-tabs">
              {['', ...FFR_STATUS].map((s) => (
                <button key={s || 'all'} className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setStatus(s)}>{s || 'All'}</button>
              ))}
              <button className="btn btn-sm" onClick={() => csvExport('field-failure-register.csv', FFR_COLUMNS.map((c) => ({ key: c.key, header: c.header })), visible, cappedAt(rows.length, 5000))}>⬇ CSV</button>
            </div>
          </div>

          <DataTable
            rows={visible}
            columns={columns}
            getRowId={(r) => r.id}
            storageKey="rithi.ffr.table"
            onRowClick={mayRaise ? (r) => { setEditing(Number(r.id)); setForm({ ...r }); } : undefined}
          />
        </>
      )}

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
