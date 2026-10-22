import { useMemo, useState } from 'react';
import { SectionCard, Toolbar } from '../ui/ui';
import { DataTable, type Column } from '../table/DataTable';
import { Ucn } from '../../lib/callstate';
import { useCallStates, callStateFor } from '../../lib/callstates';
import { csvExport, fmtLongDate } from '../../lib/format';
import { partyDiffers, type MachineEvent, type MachineHistory, type MachineNow } from '../../lib/machineHistory';
import { partial } from '../../lib/exportscope';
import { parseRef } from '../../lib/reportMapping';
import { resolveDriveLinks } from '../../lib/sheets';

// ===========================================================================
// ONE MACHINE'S LIFE, RENDERED ONCE.
//
// Lifted out of the Machine History SCREEN when the Daily Complaint Review
// Register asked for the same thing in a pop-up (the user, 2026-09-22: "add a
// provision to check machine history - in a pop up window with close button").
// A reviewer judging a failure wants to know what this machine has already
// done, and making them leave the review, re-pick the model and the serial,
// and find their way back is three steps for a question with one answer.
//
// EXTRACTED RATHER THAN COPIED, and that is not tidiness — it is the fault
// this project had to fix twice on the same day: two screens reading the same
// thing through two lists of headings that had quietly stopped agreeing. A
// second rendering of a machine's history would drift the same way, and the
// drift would be invisible, because both would look perfectly reasonable.
//
// It renders and filters; it does NOT fetch. The screen owns a product/serial
// picker and the dialog is handed the machine off a call, so the two disagree
// about where the machine comes from and about nothing else.
// ===========================================================================

const SOURCES: MachineEvent['source'][] = [
  'Product Database', 'Call', 'Visit', 'Spare', 'Field Failure', 'Feedback',
  'Sale / warranty', 'Contract', 'Ownership', 'Additional entry', 'Workshop', 'Call history',
];

export const MACHINE_SOURCES = SOURCES;

// OPENING A SERVICE REPORT (the user, 2026-10-22). What the record holds is
// either a link, which opens as it is, or the bare AppSheet file name an old
// export carried ("42CallReporting_Files_/01-05-2023 ... .Service Report.144104.pdf"),
// which is looked up in Google Drive by that name -- the lookup Bulk Report
// Mapping uses. A name found in more than one place is NOT opened: the wrong
// report on a call is worse than none. The window is opened FIRST, before the
// lookup, because a browser blocks one opened after a wait.
async function openReport(raw: string): Promise<string> {
  const ref = parseRef(raw);
  if (ref.kind === 'drive-link' || ref.kind === 'other-url' || ref.kind === 'drive-id') {
    window.open(ref.url, '_blank', 'noopener');
    return '';
  }
  if (!ref.fileName) return `This report reference cannot be opened: “${raw}”.`;
  const w = window.open('', '_blank');
  if (w) w.document.title = 'Finding the report…';
  const res = await resolveDriveLinks([ref.fileName]);
  const link = res.links[ref.fileName];
  if (link) { if (w) w.location.href = link; else window.open(link, '_blank', 'noopener'); return ''; }
  // An AppSheet link still opens in AppSheet when Drive does not have the file.
  if (ref.kind === 'appsheet-url') { if (w) w.location.href = raw; else window.open(raw, '_blank', 'noopener'); return ''; }
  w?.close();
  if (!res.ok) return `Could not look the report up in Drive: ${res.error ?? 'the lookup failed'}.`;
  if (res.ambiguous.includes(ref.fileName)) return `More than one file in Drive is called “${ref.fileName}”, so none is opened. Find it in Drive by that name.`;
  return `“${ref.fileName}” is not in Drive under that name, so it cannot be opened from here.`;
}

/** GOOGLE DRIVE'S OWN SEARCH for a file name -- the direct way to it (the user,
 *  2026-10-22: "add open in drive option directly"). Opens in the viewer's own
 *  Drive, with their own access; nothing is looked up or shared on the way. */
export const driveSearchLink = (fileName: string) =>
  `https://drive.google.com/drive/search?q=${encodeURIComponent(`"${fileName}"`)}`;

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="field-label">{label}</div>
    <div style={{ fontWeight: 600 }}>{value}</div>
  </div>
);

export function MachineHistoryView({
  product, serial, now, events, unread = [], rowsBeforeScroll,
}: {
  product: string;
  serial: string;
  now: MachineNow | null;
  events: MachineEvent[] | null;
  /** Registers that refused to be read. Each is NAMED, never shown as empty. */
  unread?: MachineHistory['unread'];
  /** The dialog shows fewer rows before it scrolls than the full screen does. */
  rowsBeforeScroll?: number;
}) {
  const [only, setOnly] = useState<MachineEvent['source'] | ''>('');
  const [reportMsg, setReportMsg] = useState('');
  const [opening, setOpening] = useState('');
  const more = unread.length > 0;

  const shown = useMemo(
    () => (events ?? []).filter((e) => !only || e.source === only),
    [events, only],
  );
  // A UCN carries the call's colour wherever it appears — every module.
  useCallStates(shown.map((e) => e.ucn).filter(Boolean));

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events ?? []) m.set(e.source, (m.get(e.source) ?? 0) + 1);
    return m;
  }, [events]);

  const columns: Column<Record<string, unknown>>[] = [
    { key: 'on', header: 'When', width: 120, wrap: false,
      render: (r) => (r.on ? fmtLongDate(r.on) : <span className="muted">no date</span>) },
    { key: 'source', header: 'Register', width: 130, wrap: false },
    { key: 'what', header: 'What', width: 150 },
    { key: 'ref', header: 'Reference', width: 150, wrap: false,
      render: (r) => (r.ucn
        ? <Ucn ucn={String(r.ucn)} state={callStateFor(String(r.ucn))} />
        : String(r.ref ?? '')) },
    { key: 'party', header: 'Who', width: 180 },
    { key: 'detail', header: 'Detail' },
    // THE SERVICE REPORT, where the record has one (Call History's own column).
    // A LINK OPENS DIRECTLY. A bare AppSheet file name gets "Open in Drive" --
    // Drive's own search for that name, a plain link -- and "Find & open",
    // which looks the one file up and opens it.
    { key: 'report', header: 'Report', width: 220, wrap: false, sortable: false,
      render: (r) => {
        const raw = String(r.report ?? '');
        if (!raw) return '';
        const ref = parseRef(raw);
        if (ref.url) {
          return <a className="btn btn-sm" href={ref.url} target="_blank" rel="noopener noreferrer" title={raw}>📄 Open</a>;
        }
        if (!ref.fileName) return <span className="muted" title={raw}>not a link</span>;
        return (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <a className="btn btn-sm" href={driveSearchLink(ref.fileName)} target="_blank" rel="noopener noreferrer"
               title={`Search Google Drive for “${ref.fileName}”`}>📂 Open in Drive</a>
            <button className="btn btn-sm" disabled={opening === String(r.key)} title={`Find “${ref.fileName}” and open it`}
              onClick={() => {
                setReportMsg(''); setOpening(String(r.key));
                void openReport(raw).then((m) => { setReportMsg(m); setOpening(''); });
              }}>
              {opening === String(r.key) ? 'Finding…' : '📄 Find & open'}
            </button>
          </span>
        );
      } },
  ];

  return (
    <>
      {now && (
        <SectionCard title="Where it is now">
          <div className="sf-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            <Fact label="With" value={now.party || '—'} />
            <Fact label="Status" value={now.itemStatus || '—'} />
            <Fact label="Where" value={[now.city, now.state].filter(Boolean).join(', ') || '—'} />
            <Fact label="Engineer" value={now.engineer || '—'} />
            <Fact label="Warranty" value={now.warrantyNumber
              ? `${now.warrantyNumber} to ${fmtLongDate(now.warrantyEnd) || '—'}${now.warrantyState ? ` (${now.warrantyState})` : ''}`
              : '—'} />
            <Fact label="Contract" value={now.contractNumber
              ? `${now.contractType || 'Contract'} ${now.contractNumber} to ${fmtLongDate(now.contractEnd) || '—'}${now.contractState ? ` (${now.contractState})` : ''}`
              : '—'} />
          </div>
          {/* THE TWO PARTIES DISAGREEING IS THE FINDING, not a display fault.
              Reported of ORION-G 2141: the master said one hospital and the
              cover, the calls, the visit and the feedback all said another.
              `products.party_name` is written only by the Product Database
              upload and by an Ownership Transfer (0072); a CONTRACT moves the
              cover and never the party. So a machine that moved on a contract
              with no transfer filed keeps the old hospital on the master for
              ever — and the master is what the call form and the request
              cascade read, so the next call is offered the wrong one. */}
          {partyDiffers(now) && (
            <div className="sheet-banner sheet-banner-warn" style={{ marginTop: 10 }}>
              <span>
                The <b>Product Database</b> says this machine is with <b>{now.party}</b>, but its
                cover — and the calls below — say <b>{now.coverParty}</b>. Go by where the calls
                are being raised. The master only moves when an <b>Ownership Transfer</b> is
                filed or the master is re-imported; a contract for a new hospital moves the
                cover and leaves the party behind. Until it is corrected, raising a call for
                this machine will offer the wrong hospital.
              </span>
            </div>
          )}
          {/* A MACHINE WITH A HISTORY AND NO MASTER ROW IS A FINDING, not an
              error: the registers know it and the Product Database does not. */}
          {!now.onMaster && (
            <div className="sheet-banner sheet-banner-info" style={{ marginTop: 10 }}>
              <span>
                This machine is <b>not on the Product Database</b> — what you see above is worked
                out from its cover. Everything below still happened to it.
              </span>
            </div>
          )}
        </SectionCard>
      )}

      {events && (
        <>
          <div style={{ height: 12 }} />
          <SectionCard title={`Everything recorded against it — ${events.length}${more ? '+' : ''} entr${events.length === 1 && !more ? 'y' : 'ies'}`}>
            {/* A REGISTER THAT REFUSED IS NAMED, NOT SHOWN AS EMPTY (D-019).
                Before, a failed read came back as a register with nothing in
                it, and the history read as complete without it. */}
            {more && (
              <div className="sheet-banner sheet-banner-error">
                <span>
                  <b>Not complete.</b> {unread.length === 1 ? 'One register' : `${unread.length} registers`} could
                  not be read, so anything recorded there is missing below:{' '}
                  {unread.map((u, i) => (
                    <span key={u.source}>{i > 0 && '; '}<b>{u.source}</b> ({u.reason})</span>
                  ))}.
                </span>
              </div>
            )}
            {reportMsg && (
              <div className="sheet-banner sheet-banner-error">
                <span>{reportMsg}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setReportMsg('')}>✕</button>
              </div>
            )}
            <Toolbar>
              <button className={`chip ${only === '' ? 'chip-on' : ''}`} onClick={() => setOnly('')}>
                All <b>{events.length}{more ? '+' : ''}</b>
              </button>
              {SOURCES.filter((x) => counts.get(x)).map((x) => (
                <button key={x} className={`chip ${only === x ? 'chip-on' : ''}`}
                        onClick={() => setOnly((c) => (c === x ? '' : x))}>
                  {x} <b>{counts.get(x)}</b>
                </button>
              ))}
              <div className="spacer" />
              {shown.length > 0 && (
                <button className="btn btn-sm"
                        onClick={() => csvExport(
                          `machine-${product}-${serial}.csv`.replace(/[^a-z0-9.-]+/gi, '-'),
                          columns.filter((c) => c.key !== 'ucn').map((c) => ({ key: c.key, header: String(c.header) })),
                          shown as unknown as Record<string, unknown>[],
                          // Every register is read WHOLE for this one machine;
                          // the file is partial only when one of them refused.
                          partial(more))}>
                  ⭳ Export CSV
                </button>
              )}
            </Toolbar>
            {/* EACH REGISTER IS READ WHOLE for this one machine, page after page,
                so its count is exact. The All count takes a "+" only when a
                register refused -- and that register is named above. */}
            <DataTable<Record<string, unknown>>
              columns={columns}
              rows={shown as unknown as Record<string, unknown>[]}
              rowsBeforeScroll={rowsBeforeScroll}
              // THE ROW'S OWN KEY, not a recipe made of its fields. Two visits
              // on one call on one day with the same status and no remark are
              // identical in every field this table shows, and React drops and
              // duplicates rows that share a key -- reported from use
              // (2026-09-22): the Spare chip listed three spares and two
              // visits. `withEventKeys` numbers each row within its register.
              getRowId={(r) => String(r.key)}
            />
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              This is what <b>this</b> system holds. Anything from before the migration lives in
              the old system and is not shown here.
            </p>
          </SectionCard>
        </>
      )}
    </>
  );
}
