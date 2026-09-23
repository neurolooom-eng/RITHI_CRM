import { useMemo, useState } from 'react';
import { SectionCard, Toolbar } from '../ui/ui';
import { useAuth } from '../../lib/auth';
import { seesEveryRecord } from '../../lib/rbac';
import { DataTable, type Column } from '../table/DataTable';
import { fmtLongSmart } from '../../lib/format';
import { resolveDriveLinks, sheetsConfigured } from '../../lib/sheets';
import { loadedReportRefs, convertReportLinks } from '../../lib/supabase';
import {
  planConversion, conversionTally, namesToLookUp, writesFor,
  type ConvertRow,
} from '../../lib/reportMapping';

// ===========================================================================
// THE REPORTS ALREADY IN THE REGISTER.
//
// The sheet flow above resolves references AS A FILE IS IMPORTED. That does
// nothing for the visits already loaded, and a probe on 2026-09-22 counted
// 7,538 of them carrying an AppSheet reference where a Drive link should be --
// 5,496 bare file paths and 2,042 AppSheet URLs, out of 12,254 visits. On those
// calls "open the report" opens a string.
//
// RE-IMPORTING THE SHEET IS NOT THE REMEDY. Those rows carry the engineer's
// own columns now, and an upsert would write the file over them. This changes
// the FORM of one column and touches nothing else.
//
// IT RUNS IN PASSES, AND THAT IS NOT TIMIDITY. The Drive lookup goes through
// the CallReg bridge 60 names at a time, so 7,538 of them is 126 round trips
// and several minutes with the tab held open -- a single button that does the
// lot would be one network hiccup away from an unknown amount of work done. A
// pass is re-runnable by construction: a converted row is a Drive link and the
// next survey no longer offers it, so the remaining count falls and the
// operator can stop and resume whenever.
// ===========================================================================

type Phase = 'idle' | 'surveyed' | 'resolved';

// ONE FOLDER FIELD, TWO PLACES TO TYPE IT. The value is the screen's, not
// this card's: the Drive folder the report images live in is the same folder
// whichever flow is looking for them, and a second copy of it is how the
// operator ends up searching their whole Drive from one card and a folder from
// the other, with nothing saying why the two disagreed.
export function ConvertLoadedReports(
  { folderId, onFolderId }: { folderId: string; onFolderId: (v: string) => void },
) {
  const [plan, setPlan] = useState<ConvertRow[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [batch, setBatch] = useState(500);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const { user, can } = useAuth();

  // WHOSE VISITS THESE ARE. `reports_read` is admin OR can_view_all_calls() OR
  // the reader's own and their team's, so a scoped reader's survey is a count of
  // what THEY can see -- and "12,254 visits carry a report" would be a claim
  // about the register that only an office role's number supports. The helper
  // is the project's one copy of that list and takes the USER, so no call site
  // can reach for `user.role` -- which collapses four office roles to
  // 'engineer' and reads perfectly correct while being wrong.
  const everything = seesEveryRecord(user, can);
  const scope = everything ? '' : ' you can see';

  const tally = useMemo(() => conversionTally(plan, links), [plan, links]);
  // THE ROWS THIS PASS IS ABOUT. The survey holds the whole register; a pass
  // takes the first `batch` of the ones that need converting, and the table
  // shows those -- not 7,538 rows nobody is going to read.
  const pass = useMemo(
    () => plan.filter((p) => p.action === 'convert').slice(0, Math.max(1, batch)),
    [plan, batch],
  );
  const writes = useMemo(() => writesFor(pass, links), [pass, links]);

  const survey = async () => {
    setBusy('Reading the reports already in the register…'); setMsg(null); setLinks({});
    try {
      const rows = await loadedReportRefs();
      const p = planConversion(rows);
      setPlan(p); setPhase('surveyed');
      const t = conversionTally(p);
      setMsg({
        tone: t.convert ? 'info' : 'ok',
        text: t.convert
          ? `${t.total.toLocaleString()} visits${scope} carry a report. ${t.convert.toLocaleString()} still hold an AppSheet reference rather than a link — ${t.names.toLocaleString()} distinct files to find in Drive.`
          : `${t.total.toLocaleString()} visits${scope} carry a report, and every one of them is already a link. Nothing to convert${everything ? '' : ' among the visits you can see'}.`,
      });
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not read the register: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(''); }
  };

  const resolve = async () => {
    const names = namesToLookUp(pass);
    if (!names.length) { setMsg({ tone: 'info', text: 'Nothing in this pass needs a Drive lookup.' }); setPhase('resolved'); return; }
    setBusy(`Resolving 0 / ${names.length} in Drive…`);
    const res = await resolveDriveLinks(names, folderId.trim(), (d, t) => setBusy(`Resolving ${d} / ${t} in Drive…`));
    setBusy('');
    if (!res.ok && !Object.keys(res.links).length) { setMsg({ tone: 'error', text: res.error ?? 'Drive lookup failed.' }); return; }
    setLinks(res.links);
    setPhase('resolved');
    const found = writesFor(pass, res.links).length;
    setMsg({
      tone: found === pass.length ? 'ok' : 'info',
      text: `${found} of ${pass.length} rows in this pass resolved to a Drive link.`
        + `${res.ambiguous.length ? ` ${res.ambiguous.length} file name${res.ambiguous.length === 1 ? ' matches' : 's match'} more than one file in Drive and ${res.ambiguous.length === 1 ? 'was' : 'were'} left alone.` : ''}`
        + `${res.error ? ` (${res.error})` : ''}`,
    });
  };

  const convert = async () => {
    if (!writes.length) { setMsg({ tone: 'error', text: 'Nothing in this pass resolved, so there is nothing to write.' }); return; }
    // WHAT IS NOT BEING WRITTEN IS THE HALF WORTH SAYING. A reference Drive
    // could not find keeps its reference, and the confirm says so -- otherwise
    // "converted 380 of 500" reads as 120 rows lost.
    const untouched = pass.length - writes.length;
    if (!confirm(
      `Convert ${writes.length} reference${writes.length === 1 ? '' : 's'} into Drive links?\n\n`
      + `The original goes into Source Ref on each row. Nothing else changes — not the status, not the visit date, not the engineer.\n\n`
      + (untouched ? `${untouched} row(s) in this pass were not found in Drive and keep their reference exactly as it is.` : ''),
    )) return;

    setBusy(`Converting 0 / ${writes.length}…`);
    const r = await convertReportLinks(writes, (d, t) => setBusy(`Converting ${d} / ${t}…`));
    setBusy('');
    if (!r.ok) { setMsg({ tone: 'error', text: `${r.error} (${r.written} converted before it stopped.)` }); return; }

    // The converted rows are dropped from the survey rather than re-read: they
    // are Drive links now, so a fresh survey would not offer them either, and
    // re-reading 12,254 rows to learn that costs a register-sized download.
    const done = new Set(writes.map((w) => String(w.id)));
    setPlan((cur) => cur.filter((p) => !done.has(String(p.row.id))));
    setLinks({}); setPhase('surveyed');
    const left = plan.filter((p) => p.action === 'convert' && !done.has(String(p.row.id))).length;
    setMsg({
      tone: 'ok',
      text: `${r.written} converted. ${left.toLocaleString()} reference${left === 1 ? '' : 's'} still to go`
        + `${left ? ' — run the next pass.' : '.'}`,
    });
  };

  const columns: Column<ConvertRow & Record<string, unknown>>[] = useMemo(() => [
    { key: 'ucn', header: 'Call', width: 150, render: (p) => p.row.ucn || <span className="muted">—</span> },
    { key: 'visit_at', header: 'Visit', width: 150, wrap: false, render: (p) => (p.row.visit_at ? fmtLongSmart(p.row.visit_at) : <span className="muted">—</span>) },
    {
      key: 'now', header: 'Holds', width: 300,
      render: (p) => <code style={{ fontSize: 11 }} title={p.ref.note}>{p.row.manual_report}</code>,
    },
    {
      key: 'becomes', header: 'Becomes', width: 200,
      render: (p) => {
        const url = p.link || links[p.ref.fileName] || '';
        if (url) return <a href={url} target="_blank" rel="noreferrer">open in Drive</a>;
        return <span className="muted">{phase === 'resolved' ? 'not found in Drive — left alone' : 'awaiting lookup'}</span>;
      },
    },
    { key: 'why', header: 'Why', width: 300, render: (p) => <span className="muted">{p.why}</span> },
  ], [links, phase]);

  return (
    <SectionCard title="0 · Reports already in the register">
      <p className="muted" style={{ marginTop: 0 }}>
        Visits loaded through Bulk Uploads keep the attachment cell exactly as the file wrote it, so many
        of them hold an AppSheet path where a Drive link should be — and “open the report” opens a string.
        This finds them and resolves each one <b>by file name</b>, in passes. A file Drive cannot find, or
        finds twice, <b>keeps its reference</b>: an unresolved reference can still be settled by hand, a
        blanked one has lost the only thing that says which document it was.
      </p>

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="input" style={{ minWidth: 300 }} value={folderId}
          onChange={(e) => onFolderId(e.target.value)}
          placeholder="Drive folder ID to search first (optional — blank searches your whole Drive)" />
        <button className="btn" disabled={!!busy} onClick={() => void survey()}>
          🔍 {phase === 'idle' ? 'Survey the register' : 'Survey again'}
        </button>
        {phase !== 'idle' && (
          <>
            <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              Convert up to
              <input className="input" type="number" min={1} max={2000} style={{ width: 90 }}
                value={batch} onChange={(e) => setBatch(Number(e.target.value) || 1)} />
              per pass
            </label>
            <button className="btn btn-primary" disabled={!!busy || !sheetsConfigured() || !pass.length}
              onClick={() => void resolve()}>
              🔎 Resolve {namesToLookUp(pass).length} file name{namesToLookUp(pass).length === 1 ? '' : 's'}
            </button>
            <button className="btn btn-primary" disabled={!!busy || phase !== 'resolved' || !writes.length}
              onClick={() => void convert()}>
              ⤵ Convert {writes.length}
            </button>
          </>
        )}
      </div>

      {phase !== 'idle' && (
        <>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap', margin: '10px 0' }}>
            <span><b>{tally.total.toLocaleString()}</b> visits{scope} with a report</span>
            <span>🔗 <b>{tally.leave.toLocaleString()}</b> already a link or left alone</span>
            <span>🧩 <b>{tally.convert.toLocaleString()}</b> to convert</span>
            {/* WHICH SHAPES, COUNTED RATHER THAN ASSUMED. The question nothing in
                the repository could answer -- how many AppSheet URLs actually
                carry a `fileName` -- is answered here, by the data: one without
                it parses as `unknown` and is counted separately. */}
            {tally.byKind.map((k) => (
              <span key={k.kind} className="muted">{k.kind} <b>{k.n.toLocaleString()}</b></span>
            ))}
          </div>

          <DataTable<ConvertRow & Record<string, unknown>>
            columns={columns}
            rows={pass as (ConvertRow & Record<string, unknown>)[]}
            getRowId={(p) => String(p.row.id)}
            storageKey="report-convert"
            rowsBeforeScroll={12}
            dense
            emptyText={everything
              ? 'Nothing in the register still holds an AppSheet reference.'
              : 'Nothing you can see still holds an AppSheet reference. Your role is shown its own visits and its team\u2019s, so this is not a statement about the register.'}
            toolbar={
              <Toolbar>
                <span className="muted">
                  This pass: {pass.length.toLocaleString()} of {tally.convert.toLocaleString()}
                </span>
                <div className="spacer" />
                {!sheetsConfigured() && <span className="muted">The Drive lookup needs the CallReg bridge — set its URL in Settings.</span>}
              </Toolbar>
            }
          />
        </>
      )}

      {busy && <div className="sheet-banner sheet-banner-info"><span>{busy}</span></div>}
    </SectionCard>
  );
}
