import { useEffect, useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { useUserNames, nameForUserId } from '../lib/userNames';
import { fmtLongSmart } from '../lib/format';
import {
  supabaseConfigured, getAuditMode, setAuditMode, listAuditModeChanges,
  type AuditModeChange,
} from '../lib/supabase';

// ===========================================================================
// ADMIN CONFIG → AUDIT MODE.
//
// Asked for on 2026-09-06, WITH THE RULES TO FOLLOW: "come up with an Audit
// Mode, which can be toggled only by the admins — I will give the list of rules
// for that later."
//
// So this is the switch and nothing else, and THE CARD SAYS SO rather than
// implying the mode does something it does not. Attaching behaviour before the
// rules arrive would mean guessing what an audit is meant to change; in a
// regulated system a wrong guess is worse than an empty switch.
//
// Turning it on or off needs a REASON and the reason is kept forever, in a
// table nothing purges and nobody can edit through the API. That is not one of
// the rules — it is the floor underneath whatever the rules turn out to be, so
// that "was the mode on when this record was made?" always has an answer.
//
// Classified in the Validation Package as a NON-AUDITABLE REQUIREMENT
// (NAR-001): it is the user's own requirement rather than one derived from a
// regulatory clause, so it is not offered as evidence against one. That says
// where the requirement came from — not that its use goes unrecorded.
// ===========================================================================
export function AuditModeCard() {
  const { isAdmin } = useAuth();
  const names = useUserNames();
  const onDb = supabaseConfigured();
  const [on, setOn] = useState<boolean | null>(null);
  const [history, setHistory] = useState<AuditModeChange[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  const load = async () => {
    if (!onDb) { setMsg({ tone: 'info', text: 'Connect the database to use this.' }); return; }
    try {
      setOn(await getAuditMode());
      if (isAdmin) setHistory(await listAuditModeChanges());
    } catch (e) {
      setMsg({
        tone: 'error',
        text: /audit_mode|does not exist|schema cache/i.test(String(e))
          ? 'Run supabase/apply/audit.sql in the Supabase SQL editor, then Refresh.'
          : `Load failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isAdmin]);

  const flip = async (next: boolean) => {
    if (!reason.trim()) { setMsg({ tone: 'error', text: 'Give a reason — it is kept with the change.' }); return; }
    setBusy(true);
    const res = await setAuditMode(next, reason.trim());
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Failed.' }); return; }
    setReason('');
    setMsg({ tone: 'ok', text: next ? 'Audit Mode is ON.' : 'Audit Mode is OFF.' });
    void load();
  };

  return (
    <SectionCard title="Audit Mode">
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        A switch only an administrator can throw. <b>Nothing in the app behaves differently while it is on
        yet</b> — the rules for it have not been given, and guessing at them would be worse than waiting.
        Every change is kept with its reason, so once the rules do arrive it will always be answerable
        whether the mode was on when a record was made.
      </p>
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`} style={{ marginBottom: 10 }}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span className={`badge ${on ? 'badge-warning' : 'badge-neutral'}`}>{on === null ? '—' : on ? 'ON' : 'OFF'}</span>
        {isAdmin && onDb && (
          <>
            <input
              className="input"
              style={{ minWidth: 280, flex: 1 }}
              placeholder={on ? 'Why is it being switched off?' : 'Why is it being switched on? (e.g. CDSCO inspection)'}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" disabled={busy || on === null} onClick={() => void flip(!on)}>
              {busy ? 'Saving…' : on ? 'Switch OFF' : 'Switch ON'}
            </button>
          </>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={busy}>Refresh</button>
      </div>
      {!isAdmin && <p className="muted" style={{ fontSize: 12 }}>Only an administrator can change it, or read its history.</p>}

      {isAdmin && history.length > 0 && (
        <div className="assoc-scroll">
          <table className="assoc-table" style={{ minWidth: 520 }}>
            <thead><tr><th style={{ width: 180 }}>When</th><th style={{ width: 70 }}>To</th><th>Reason</th><th style={{ width: 160 }}>By</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{fmtLongSmart(h.at)}</td>
                  <td>{h.turned_on ? 'ON' : 'OFF'}</td>
                  <td>{h.reason}</td>
                  <td>{h.changed_by ? nameForUserId(h.changed_by, names) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
