import { useEffect, useState } from 'react';
import { Modal } from '../ui/ui';
import { MachineHistoryView } from './MachineHistoryView';
import { machineHistory, machineNow, type MachineEvent, type MachineNow } from '../../lib/machineHistory';
import { supabaseConfigured } from '../../lib/supabase';
import { logAudit } from '../../lib/audit';

// ===========================================================================
// MACHINE HISTORY, WITHOUT LEAVING THE REVIEW.
//
//   The user, 2026-09-22, on the Daily Complaint Review Register: "add a
//   provision to check machine history - in a pop up window with close button".
//
// A reviewer deciding whether a failure is a repeat wants to know what this
// machine has already done. The full screen answers that, and getting there
// means leaving a half-answered review, re-picking the model, re-picking the
// serial and finding the way back — four steps for one question, on a screen
// with Auto Save on.
//
// IT TAKES THE MACHINE, IT DOES NOT ASK FOR IT. A machine is MODEL + SERIAL
// and never the serial alone (eleven machines are numbered 219), and the call
// already carries both — so the dialog is handed them and refuses politely if
// either is missing, rather than offering a picker that would let somebody
// look up a different machine by accident while reviewing this one.
//
// IT FETCHES ONLY WHEN OPENED, and again if the machine changes underneath it:
// mounting this beside every row of a register would otherwise read eleven
// registers per row for an answer nobody asked for.
// ===========================================================================

export function MachineHistoryDialog({
  open, onClose, product, serial,
}: {
  open: boolean;
  onClose: () => void;
  product: string;
  serial: string;
}) {
  const [now, setNow] = useState<MachineNow | null>(null);
  const [events, setEvents] = useState<MachineEvent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const p = String(product ?? '').trim();
  const s = String(serial ?? '').trim();

  useEffect(() => {
    if (!open) return;
    setNow(null); setEvents(null); setMsg('');
    if (!supabaseConfigured()) { setMsg('Not connected to the database — this reads the registers directly.'); return; }
    if (!p || !s) return;                       // the banner below says which is missing
    let live = true;
    setBusy(true);
    void Promise.all([machineNow(p, s), machineHistory(p, s)])
      .then(([n, e]) => {
        if (!live) return;
        setNow(n); setEvents(e);
        if (!n && !e.length) setMsg('Nothing anywhere mentions this machine.');
        logAudit({ action: 'machine.history', target: `${p} ${s}`,
                   meta: { events: e.length, onMaster: !!n?.onMaster, from: 'dccr' } });
      })
      .catch((err) => { if (live) setMsg(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [open, p, s]);

  return (
    <Modal open={open} onClose={onClose}
           title={`Machine History — ${[p, s].filter(Boolean).join(' · ') || 'no machine on this call'}`}
           width={1040}>
      {/* A MACHINE IS ITS MODEL AND ITS SERIAL. With only one of them there is
          nothing to look up, and guessing from the serial alone would show
          another hospital's machine — the fault this rule exists for. */}
      {(!p || !s) && (
        <div className="sheet-banner sheet-banner-info">
          <span>
            This call does not record {!p && !s ? 'a product or a serial' : !p ? 'a product' : 'a serial'},
            and a machine is its model <b>and</b> its serial — the same serial belongs to several models,
            so there is nothing here that can be looked up safely.
          </span>
        </div>
      )}
      {msg && <div className="sheet-banner sheet-banner-info"><span>{msg}</span></div>}
      {busy && <p className="muted">Reading every register for this machine…</p>}

      <MachineHistoryView product={p} serial={s} now={now} events={events} rowsBeforeScroll={10} />

      {/* THE CLOSE BUTTON THE USER ASKED FOR, as well as the ✕ in the corner.
          They are not the same affordance: after scrolling through forty
          entries the ✕ is off the top of the dialog. */}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
