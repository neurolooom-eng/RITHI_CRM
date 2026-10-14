import { useState } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { SectionCard } from '../components/ui/ui';
import { getSheetsTab, getSheetsUrl, pingSheet, setSheetsTab, setSheetsUrl } from '../lib/sheets';
import { recordAudit } from '../lib/audit';
import './fieldcalls.css';

// Settings panel to connect the app to the Google Sheet Apps Script Web App.
// `readOnly` — see the bridge's setup without being able to repoint it
// (admin.view / Technical Support). Test saves what it tests, so it is a write.
export function SheetConnection({ readOnly = false }: { readOnly?: boolean }) {
  const [url, setUrl] = useState(getSheetsUrl());
  const [tab, setTab] = useState(getSheetsTab());
  const [tabs, setTabs] = useState<string[]>([]);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // A CHANGE OF BRIDGE IS RECORDED BEFORE IT TAKES EFFECT (D-067, FRS-214.4):
  // the bridge carries every visit report and document to Drive, so pointing
  // this browser at another deployment changes where they go. Old and new
  // address, in the connected database. With no database connected there is
  // nowhere to record it, and that is asked about rather than skipped.
  //
  // Answers null when the change was NOT made, else the reason it was not
  // recorded ('' when it was) so the result line can carry it.
  const switchTo = async (via: 'save' | 'test'): Promise<string | null> => {
    const was = { url: getSheetsUrl(), tab: getSheetsTab() };
    const next = { url: url.trim(), tab: tab.trim() };
    if (was.url !== next.url || was.tab !== next.tab) {
      const err = await recordAudit({
        action: 'settings.callreg_bridge', target: next.url,
        meta: { setting: 'CallReg bridge', old_url: was.url, new_url: next.url, old_tab: was.tab, new_tab: next.tab, via },
      });
      if (err && !confirm(`This change could not be recorded:\n\n${err}\n\nPoint this browser's bridge at ${next.url} anyway?`)) {
        setStatus({ tone: 'error', text: `Not changed — the change could not be recorded: ${err}` });
        return null;
      }
      setSheetsUrl(url);
      setSheetsTab(tab);
      return err ?? '';
    }
    setSheetsUrl(url);
    setSheetsTab(tab);
    return '';
  };

  const save = async () => {
    const unrecorded = await switchTo('save');
    if (unrecorded === null) return;
    setStatus(unrecorded
      ? { tone: 'error', text: `Saved, but the change was NOT recorded in the audit log: ${unrecorded}` }
      : {
        tone: 'ok',
        text: `Saved${tab ? ` — Field Calls will read the “${tab}” tab` : ''}. Open Service Calls → Field Call Register and Refresh.`,
      });
  };

  const test = async () => {
    const unrecorded = await switchTo('test');
    if (unrecorded === null) return;
    const flag = unrecorded ? ` ⚑ The change was NOT recorded in the audit log: ${unrecorded}` : '';
    setTesting(true);
    setStatus({ tone: 'info', text: 'Contacting the sheet…' });
    const r = await pingSheet();
    setTesting(false);
    if (r.ok) {
      setTabs(r.tabs ?? []);
      setStatus({
        tone: flag ? 'error' : 'ok',
        text: `Connected — reading tab “${r.sheet}” (${r.count ?? 0} rows, ${r.headers?.length ?? 0} columns). ${r.tabs?.length ? `Pick the Field tab below.` : ''}${flag}`,
      });
    } else {
      setStatus({ tone: 'error', text: `Could not connect: ${r.error}. Check the URL ends in /exec and the deployment access is “Anyone”.${flag}` });
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
          disabled={readOnly}
          onChange={(e) => setUrl(e.target.value)}
        />
        {!readOnly && (
          <>
            <button className="btn" onClick={() => void test()} disabled={testing || !url.trim()}>
              {testing ? 'Testing…' : 'Test'}
            </button>
            <button className="btn btn-primary" onClick={() => void save()} disabled={!url.trim()}>Save</button>
          </>
        )}
      </div>

      <div className="sheet-conn-row" style={{ marginTop: 10 }}>
        <label className="muted" style={{ alignSelf: 'center', minWidth: 120 }}>Field Calls tab:</label>
        {tabs.length > 0 ? (
          <SelectPicker value={tab} disabled={readOnly} onChange={setTab}
            placeholder="(auto-detect: UC Number tab)" options={tabs} />
        ) : (
          <input
            className="input"
            placeholder="e.g. Field  (leave blank to auto-detect; Test to list tabs)"
            value={tab}
            disabled={readOnly}
            onChange={(e) => setTab(e.target.value)}
          />
        )}
      </div>

      {status && (
        <div className={`sheet-conn-status sheet-banner-${status.tone}`}>{status.text}</div>
      )}
    </SectionCard>
  );
}
