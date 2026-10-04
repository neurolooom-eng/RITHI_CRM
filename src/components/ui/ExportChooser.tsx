// ===========================================================================
// EVERY DOWNLOAD ASKS WHERE IT GOES: this device, or a Google Sheet in the
// person's own folder on Drive (the user, 2026-10-04). Mounted ONCE, inside
// the auth provider; the three file writers hand their finished export here
// through `deliverExport` (exportscope.ts), so no screen carries a button of
// its own for it.
// ===========================================================================
import { useEffect, useState } from 'react';
import { Modal } from './ui';
import { useAuth } from '../../lib/auth';
import { setExportChooser, type ExportJob } from '../../lib/exportscope';
import { saveAsGoogleSheet, sheetsConfigured } from '../../lib/sheets';
import { logAudit } from '../../lib/audit';

type Phase = { k: 'choose' } | { k: 'saving'; secs: number } | { k: 'done'; url: string } | { k: 'failed'; error: string };

export function ExportChooser() {
  const { user } = useAuth();
  const [job, setJob] = useState<ExportJob | null>(null);
  const [phase, setPhase] = useState<Phase>({ k: 'choose' });

  useEffect(() => {
    setExportChooser((j) => { setJob(j); setPhase({ k: 'choose' }); });
    return () => setExportChooser(null);
  }, []);

  if (!job) return null;
  const close = () => { if (phase.k !== 'saving') setJob(null); };
  const bridge = sheetsConfigured();

  const toSheet = async () => {
    setPhase({ k: 'saving', secs: 0 });
    const sheets = job.sheets();
    const rows = sheets[0]?.rows.length ?? 0;
    const r = await saveAsGoogleSheet(job.filename, sheets,
      { name: user?.fullName ?? '', email: user?.email ?? '' },
      (secs) => setPhase({ k: 'saving', secs }));
    // A file that left the system is recorded (URS-149) — and one that did not
    // is recorded as failed, never as taken.
    logAudit({ action: 'export.google_sheet', target: job.filename, status: r.ok ? 'ok' : 'error',
      error: r.ok ? undefined : r.error, meta: { rows, url: r.url } });
    setPhase(r.ok && r.url ? { k: 'done', url: r.url } : { k: 'failed', error: r.error ?? 'Not saved.' });
  };

  return (
    <Modal open onClose={close} title="Save the export" width={440}>
      <p className="muted" style={{ marginTop: 0 }}>{job.filename}</p>
      {phase.k === 'choose' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => { job.saveFile(); setJob(null); }}>⭳ Download {job.kind}</button>
          <button className="btn" disabled={!bridge} onClick={() => void toSheet()}
            title={bridge ? 'Saved in your own folder in the RITHI export folder on Google Drive' : 'No Google Apps Script URL is configured'}>
            Save as Google Sheet
          </button>
        </div>
      )}
      {phase.k === 'choose' && (
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          A Google Sheet is saved in your own folder inside the export folder on Drive — made on your first export, reused after that.
        </p>
      )}
      {phase.k === 'saving' && <p>Writing the Google Sheet… {phase.secs > 0 ? `${phase.secs}s` : ''} A large register can take a minute or two.</p>}
      {phase.k === 'done' && (
        <p>Saved. <a href={phase.url} target="_blank" rel="noreferrer">Open the Google Sheet</a></p>
      )}
      {phase.k === 'failed' && (
        <>
          <div className="sheet-banner sheet-banner-error">Not saved as a Google Sheet: {phase.error}</div>
          <button className="btn btn-sm" onClick={() => { job.saveFile(); setJob(null); }}>⭳ Download {job.kind} instead</button>
        </>
      )}
    </Modal>
  );
}
