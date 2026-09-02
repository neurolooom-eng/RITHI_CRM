import { useMemo, useState } from 'react';
import { PageHeader, SectionCard, Toolbar } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { useAuth } from '../lib/auth';
import { parseCSV } from '../lib/dataImport';
import { fmtLongSmart } from '../lib/format';
import { resolveDriveLinks, sheetsConfigured } from '../lib/sheets';
import { callKeysFor, upsertRecoveredReports, supabaseConfigured } from '../lib/supabase';
import {
  shapeRow, summarise, fileNamesToResolve, parseRef,
  type MappedRow, type CallKey,
} from '../lib/reportMapping';

// ===========================================================================
// BULK REPORT → CALL MAPPING — putting recovered visit history back.
//
// Three steps, in this order on purpose:
//   1. READ    the sheet, and work out which call each row belongs to
//   2. RESOLVE the AppSheet file references into Drive links
//   3. WRITE   only the rows that came through both cleanly
//
// Nothing is written until the operator has SEEN what each row resolved to.
// This is recovering quality records: a visit attached to the wrong call, or
// carrying another machine's photo, is worse than a visit still missing —
// nothing downstream would ever catch it. So a row that cannot be matched
// without guessing is held back and shown, never guessed at.
// ===========================================================================

type Step = 'idle' | 'read' | 'resolved' | 'written';

export function ReportMapping() {
  const { isAdmin, can } = useAuth();
  const [rows, setRows] = useState<MappedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [busy, setBusy] = useState('');
  const [folderId, setFolderId] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const sum = useMemo(() => summarise(rows), [rows]);
  const mayRun = (isAdmin || can('calls.report')) && supabaseConfigured();

  if (!mayRun) {
    return (
      <div>
        <PageHeader title="Bulk Report Mapping" icon="🧩" />
        <p className="muted" style={{ padding: 24 }}>
          {supabaseConfigured()
            ? 'You need admin access to load recovered visit history.'
            : 'Connect the database in Settings first.'}
        </p>
      </div>
    );
  }

  // ---- 1. read the sheet and match each row to its call --------------------
  const onPick = async (f: File | null) => {
    if (!f) return;
    setFileName(f.name); setMsg(null); setBusy('Reading the sheet…');
    try {
      const raw = parseCSV(await f.text());
      if (!raw.length) { setMsg({ tone: 'error', text: 'That file has no rows.' }); setBusy(''); return; }

      // Fetch only the calls this sheet actually names.
      const ucns: string[] = []; const nos: string[] = [];
      raw.forEach((r) => {
        Object.entries(r).forEach(([k, v]) => {
          const key = k.trim().toLowerCase();
          if (key === 'ucn') ucns.push(String(v));
          if (key.replace(/[\s_]/g, '') === 'callnumber') nos.push(String(v));
        });
      });
      setBusy(`Looking up ${new Set([...ucns, ...nos].filter(Boolean)).size} calls…`);
      const calls = (await callKeysFor(ucns, nos)) as CallKey[];

      const shaped = raw.map((r, i) => shapeRow(r, calls, i));
      setRows(shaped);
      setStep('read');
      const s = summarise(shaped);
      setMsg({
        tone: s.unmatched || s.ambiguous ? 'info' : 'ok',
        text: `${s.total} rows read — ${s.matched} matched to a call, ${s.unmatched} unmatched, ${s.ambiguous} ambiguous. ${s.needLookup} attachment${s.needLookup === 1 ? '' : 's'} still need resolving in Drive.`,
      });
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not read that file: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(''); }
  };

  // ---- 2. turn the AppSheet references into Drive links --------------------
  const resolve = async () => {
    const names = fileNamesToResolve(rows.map((r) => r.ref));
    if (!names.length) { setStep('resolved'); setMsg({ tone: 'ok', text: 'Nothing to resolve — no AppSheet references in this sheet.' }); return; }
    setBusy(`Resolving 0 / ${names.length} in Drive…`);
    const res = await resolveDriveLinks(names, folderId.trim(), (d, t) => setBusy(`Resolving ${d} / ${t} in Drive…`));
    setBusy('');
    if (!res.ok && !Object.keys(res.links).length) {
      setMsg({ tone: 'error', text: res.error ?? 'Drive lookup failed.' });
      return;
    }
    const next = rows.map((r) => {
      if (!r.ref.fileName) return r;
      const url = res.links[r.ref.fileName] ?? '';
      return url
        ? { ...r, manual_report: url }
        : { ...r, problem: [r.problem, `Attachment “${r.ref.fileName}” was not found in Drive (or matches more than one file).`].filter(Boolean).join(' ') };
    });
    setRows(next);
    setStep('resolved');
    const found = next.filter((r) => r.ref.fileName && r.manual_report).length;
    setMsg({
      tone: found === names.length ? 'ok' : 'info',
      text: `${found} of ${names.length} attachments resolved to a Drive link.${res.ambiguous.length ? ` ${res.ambiguous.length} matched more than one file and were left blank — settle those by hand.` : ''}${res.error ? ` (${res.error})` : ''}`,
    });
  };

  // ---- 3. write the rows that came through cleanly ------------------------
  const write = async () => {
    const ready = rows.filter((r) => !r.problem);
    if (!ready.length) { setMsg({ tone: 'error', text: 'No rows are ready to write.' }); return; }
    if (!confirm(`Write ${ready.length} recovered visit${ready.length === 1 ? '' : 's'}?\n\nRows are matched on their row id, so running the same sheet again corrects them rather than duplicating them. ${rows.length - ready.length} row(s) with a problem will be skipped.`)) return;
    setBusy(`Writing 0 / ${ready.length}…`);
    const res = await upsertRecoveredReports(
      ready.map(({ match, ref, problem, ...r }) => { void match; void ref; void problem; return r; }),
      (d, t) => setBusy(`Writing ${d} / ${t}…`),
    );
    setBusy('');
    if (!res.ok) { setMsg({ tone: 'error', text: `${res.error} (${res.written} written before it stopped.)` }); return; }
    setStep('written');
    setMsg({ tone: 'ok', text: `${res.written} visits written. They show on their calls' Visit history, marked as recovered.` });
  };

  const visible = onlyProblems ? rows.filter((r) => r.problem) : rows;

  const columns: Column<MappedRow & Record<string, unknown>>[] = useMemo(() => [
    {
      key: 'match', header: 'Call', width: 190,
      render: (r) => (r.match.how === 'ucn' || r.match.how === 'call-number'
        ? <span title={r.match.note}>✅ {r.ucn}{r.call_number ? ` · ${r.call_number}` : ''}</span>
        : <span className="badge badge-neutral" title={r.match.note}>{r.match.how === 'ambiguous' ? '⚠ ambiguous' : '✖ no match'}</span>),
    },
    { key: 'visit_at', header: 'Visit', width: 150, wrap: false, render: (r) => (r.visit_at ? fmtLongSmart(r.visit_at) : <span className="muted">—</span>) },
    { key: 'engineer', header: 'Engineer', width: 150 },
    { key: 'call_status', header: 'Status', width: 160 },
    {
      key: 'source_ref', header: 'AppSheet reference', width: 230,
      render: (r) => (r.source_ref ? <code style={{ fontSize: 11 }} title={r.ref.note}>{r.source_ref}</code> : <span className="muted">—</span>),
    },
    {
      key: 'manual_report', header: 'Becomes', width: 200,
      render: (r) => (r.manual_report
        ? <a href={r.manual_report} target="_blank" rel="noreferrer">open in Drive</a>
        : r.ref.fileName
          ? <span className="muted">{step === 'read' ? 'awaiting lookup' : 'not found'}</span>
          : <span className="muted">{r.ref.note}</span>),
    },
    { key: 'uid', header: 'Row id', width: 200, wrap: false },
    {
      key: 'problem', header: 'Problem', width: 300,
      render: (r) => (r.problem ? <span style={{ color: 'var(--danger, #b3261e)' }}>{r.problem}</span> : <span className="muted">—</span>),
    },
  ], [step]);

  return (
    <div>
      <PageHeader
        title="Bulk Report Mapping" icon="🧩"
        subtitle="Load recovered visit history and attach each visit to its call — turning AppSheet file references into Drive links on the way."
        count={rows.length || undefined}
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <SectionCard title="1 · The sheet">
        <p className="muted" style={{ marginTop: 0 }}>
          A CSV of the visits you are putting back. Columns are recognised by name, so an export
          does not need renaming first: <b>UCN</b> or <b>Call Number</b> (either will do — UCN wins),
          <b> Visit Date</b>, <b>Engineer</b>, <b>Call Status</b>, and the attachment column
          (<b>Manual Report</b>, <b>Attachment</b>, <b>File</b>, <b>Photo</b>…). Anything else is kept
          on the visit as it was written.
        </p>
        <input type="file" accept=".csv,text/csv" className="input" disabled={!!busy}
          onChange={(e) => void onPick(e.target.files?.[0] ?? null)} />
        {fileName && <span className="muted" style={{ marginLeft: 8 }}>{fileName}</span>}
      </SectionCard>

      {step !== 'idle' && (
        <SectionCard title="2 · The attachments">
          <p className="muted" style={{ marginTop: 0 }}>
            AppSheet keeps a file as a path like <code>Reports_Images/Row 42_Photo.png</code>, not as a
            link. Each one is looked up in Drive <b>by file name</b>. A name that matches more than one
            file is left blank rather than guessed at — the wrong photo on a service record is worse
            than none.
          </p>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="input" style={{ minWidth: 320 }} value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              placeholder="Drive folder ID to search first (optional — blank searches your whole Drive)" />
            <button className="btn btn-primary" disabled={!!busy || !sheetsConfigured()} onClick={() => void resolve()}>
              🔎 Resolve {sum.needLookup} attachment{sum.needLookup === 1 ? '' : 's'}
            </button>
          </div>
          {!sheetsConfigured() && (
            <p className="muted" style={{ fontSize: 12 }}>
              The Drive lookup runs through the CallReg bridge — set its URL in Settings. You can still
              write the rows whose attachments are already links.
            </p>
          )}
        </SectionCard>
      )}

      {step !== 'idle' && (
        <SectionCard title="3 · What will be written">
          <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
            <span><b>{sum.total}</b> rows</span>
            <span>✅ <b>{sum.matched}</b> matched</span>
            <span>✖ <b>{sum.unmatched}</b> unmatched</span>
            <span>⚠ <b>{sum.ambiguous}</b> ambiguous</span>
            <span>🔗 <b>{sum.alreadyLinked}</b> with a link</span>
            <span style={{ marginLeft: 'auto' }}><b>{rows.filter((r) => !r.problem).length}</b> ready to write</span>
          </div>

          <DataTable<MappedRow & Record<string, unknown>>
            columns={columns}
            rows={visible as (MappedRow & Record<string, unknown>)[]}
            getRowId={(r) => String(r.uid || `${r.source_ref}-${r.visit_at}`)}
            storageKey="report-mapping"
            rowsBeforeScroll={12}
            dense
            emptyText={onlyProblems ? 'No rows have a problem.' : 'Nothing loaded.'}
            toolbar={
              <Toolbar>
                <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
                  Only rows with a problem
                </label>
                <div className="spacer" />
                <span className="muted">{visible.length} shown</span>
              </Toolbar>
            }
          />

          <div className="rep-actions">
            <span className="muted" style={{ marginRight: 'auto' }}>
              {rows.length - rows.filter((r) => !r.problem).length > 0
                ? `${rows.length - rows.filter((r) => !r.problem).length} row(s) will be skipped — fix the sheet and load it again.`
                : 'Every row is ready.'}
            </span>
            <button className="btn btn-primary" disabled={!!busy || step === 'written' || !rows.some((r) => !r.problem)}
              onClick={() => void write()}>
              ⤵ Write {rows.filter((r) => !r.problem).length} visits
            </button>
          </div>
        </SectionCard>
      )}

      {busy && <div className="sheet-banner sheet-banner-info"><span>{busy}</span></div>}
    </div>
  );
}
