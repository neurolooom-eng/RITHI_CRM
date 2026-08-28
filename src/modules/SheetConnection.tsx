import { useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { getSheetsUrl, pingSheet, setSheetsUrl } from '../lib/sheets';
import './fieldcalls.css';

// Settings panel to connect the app to the Google Sheet Apps Script Web App.
export function SheetConnection() {
  const [url, setUrl] = useState(getSheetsUrl());
  const [status, setStatus] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const save = () => {
    setSheetsUrl(url);
    setStatus({ tone: 'ok', text: 'Saved. Open Service Calls → Field Call Register to load your calls.' });
  };

  const test = async () => {
    setSheetsUrl(url);
    setTesting(true);
    setStatus({ tone: 'info', text: 'Contacting the sheet…' });
    const r = await pingSheet();
    setTesting(false);
    if (r.ok) {
      setStatus({ tone: 'ok', text: `Connected to “${r.sheet}” — ${r.count ?? 0} rows, ${r.headers?.length ?? 0} columns detected.` });
    } else {
      setStatus({ tone: 'error', text: `Could not connect: ${r.error}. Check the URL ends in /exec and the deployment access is “Anyone”.` });
    }
  };

  return (
    <SectionCard title="Google Sheet Connection">
      <div className="muted" style={{ marginBottom: 12 }}>
        Paste the <b>CallReg</b> Web app URL (ends in <code>/exec</code>) — the standalone
        Apps Script that bridges to your Call Register sheet. Setup steps are in
        <code>apps-script/DEPLOY.md</code>. The Field Call Register then reads and writes
        the sheet directly.
      </div>
      <div className="sheet-conn-row">
        <input
          className="input"
          type="url"
          placeholder="https://script.google.com/macros/s/……/exec"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="btn" onClick={() => void test()} disabled={testing || !url.trim()}>
          {testing ? 'Testing…' : 'Test'}
        </button>
        <button className="btn btn-primary" onClick={save} disabled={!url.trim()}>Save</button>
      </div>
      {status && (
        <div className={`sheet-conn-status sheet-banner-${status.tone}`}>{status.text}</div>
      )}
    </SectionCard>
  );
}
