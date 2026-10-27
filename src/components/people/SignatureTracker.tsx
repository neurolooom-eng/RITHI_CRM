// ===========================================================================
// THE SIGNATURE TRACKER (0454; the user, 2026-10-27: "Maintain a Tracker of How
// many users have completed this Activity of Updating their Signatures").
//
// On User Master, for whoever may edit User Master details: how many ACTIVE
// logins have saved a signature, and who has not yet -- with the date each one
// was saved. WHETHER and WHEN only, never the image (0172: nobody reads
// anybody else's signature).
// ===========================================================================
import { useEffect, useMemo, useState } from 'react';
import { sbSignatureTracker, type SignatureTrackerRow } from '../../lib/supabase';
import { formatDayTime } from '../../lib/dates';
import { csvExport } from '../../lib/format';
import { COMPLETE } from '../../lib/exportscope';

export function SignatureTracker() {
  const [rows, setRows] = useState<SignatureTrackerRow[] | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState<'pending' | 'done'>('pending');

  useEffect(() => {
    let live = true;
    sbSignatureTracker().then((r) => { if (live) setRows(r); }).catch((e) => { if (live) setErr(String((e as Error)?.message ?? e)); });
    return () => { live = false; };
  }, []);

  const active = useMemo(() => (rows ?? []).filter((r) => r.active), [rows]);
  const done = active.filter((r) => r.has_signature);
  const pending = active.filter((r) => !r.has_signature);
  if (err) return <div className="sheet-banner sheet-banner-info"><span>Signature tracker: {err}</span></div>;
  if (!rows) return null;
  const pct = active.length ? Math.round((done.length / active.length) * 100) : 0;
  const list = show === 'pending' ? pending : done;

  // The file carries the timestamp as stored; csvExport writes it dd-MMM-yyyy HH:mm:ss.
  const download = () => csvExport('signature-tracker.csv', [
    { key: 'full_name', header: 'Name' }, { key: 'email', header: 'Email' }, { key: 'designation', header: 'Designation' },
    { key: 'saved', header: 'Signature saved' }, { key: 'saved_on', header: 'Saved on' },
  ], active.map((r) => ({ ...r, saved: r.has_signature ? 'Yes' : 'No', saved_on: r.has_signature ? r.signed_at ?? '' : '' })), COMPLETE);

  return (
    <div className="sheet-banner sheet-banner-info" style={{ display: 'block' }}>
      <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>✍️ <b>Signatures saved: {done.length} of {active.length}</b> active logins ({pct}%)</span>
        <span style={{ flex: '1 1 120px', maxWidth: 240, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}
          aria-hidden="true">
          <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: '#2e7d32' }} />
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : `Show who (${pending.length} still to do)`}</button>
        <button className="btn btn-ghost btn-sm" onClick={download}>⬇ CSV</button>
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            <button className={`btn btn-sm ${show === 'pending' ? 'btn-primary' : ''}`} onClick={() => setShow('pending')}>Not yet ({pending.length})</button>
            <button className={`btn btn-sm ${show === 'done' ? 'btn-primary' : ''}`} onClick={() => setShow('done')}>Saved ({done.length})</button>
          </div>
          <div style={{ maxHeight: 280, overflow: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Name</th><th>Email</th><th>Designation</th>{show === 'done' && <th>Saved on</th>}</tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.user_id}>
                    <td>{r.full_name || '—'}</td><td>{r.email}</td><td>{r.designation || '—'}</td>
                    {show === 'done' && <td>{r.signed_at ? formatDayTime(r.signed_at) : '—'}</td>}
                  </tr>
                ))}
                {!list.length && <tr><td colSpan={4} className="muted">{show === 'pending' ? 'Everybody active has saved one.' : 'Nobody yet.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
