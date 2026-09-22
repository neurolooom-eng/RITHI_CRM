import { useMemo, useState } from 'react';
import { SectionCard, Toolbar } from '../ui/ui';
import { DataTable, type Column } from '../table/DataTable';
import { Ucn } from '../../lib/callstate';
import { useCallStates, callStateFor } from '../../lib/callstates';
import { csvExport, fmtLongDate } from '../../lib/format';
import { partyDiffers, type MachineEvent, type MachineNow } from '../../lib/machineHistory';

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
  'Sale / warranty', 'Contract', 'Ownership', 'Additional entry', 'Workshop',
];

export const MACHINE_SOURCES = SOURCES;

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="field-label">{label}</div>
    <div style={{ fontWeight: 600 }}>{value}</div>
  </div>
);

export function MachineHistoryView({
  product, serial, now, events, rowsBeforeScroll,
}: {
  product: string;
  serial: string;
  now: MachineNow | null;
  events: MachineEvent[] | null;
  /** The dialog shows fewer rows before it scrolls than the full screen does. */
  rowsBeforeScroll?: number;
}) {
  const [only, setOnly] = useState<MachineEvent['source'] | ''>('');

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
          <SectionCard title={`Everything recorded against it — ${events.length} entr${events.length === 1 ? 'y' : 'ies'}`}>
            <Toolbar>
              <button className={`chip ${only === '' ? 'chip-on' : ''}`} onClick={() => setOnly('')}>
                All <b>{events.length}</b>
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
                          shown as unknown as Record<string, unknown>[])}>
                  ⭳ Export CSV
                </button>
              )}
            </Toolbar>
            {/* EVERY COUNT HERE IS EXACT — each register was read whole for this
                one machine, not paged — so none of them carries a "+". */}
            <DataTable<Record<string, unknown>>
              columns={columns}
              rows={shown as unknown as Record<string, unknown>[]}
              rowsBeforeScroll={rowsBeforeScroll}
              getRowId={(r) => `${r.source}-${r.ref}-${r.on}-${r.detail}`}
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
