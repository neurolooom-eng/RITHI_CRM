import { useEffect, useState } from 'react';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { checkConfig, getConfig, setConfig, type ConfigCheck, type SheetConfig } from '../lib/sheets';
import './fieldcalls.css';

// ===========================================================================
// ADMIN CONFIG — the sheet links used by CallReg are stored in the backend
// (script properties). This screen shows / edits them and verifies each one.
// ===========================================================================

const FIELDS: { key: keyof SheetConfig; label: string }[] = [
  { key: 'register', label: 'Call Register (FIELD / INST / UCN tabs)' },
  { key: 'prodmaster', label: 'Product Master' },
  { key: 'partymaster', label: 'Party Master' },
  { key: 'usermaster', label: 'User Master' },
  { key: 'crn', label: 'Call Registration Request (CRN)' },
];

export function AdminConfig() {
  const [cfg, setCfg] = useState<SheetConfig>({});
  const [checks, setChecks] = useState<Record<string, ConfigCheck>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  const load = async () => {
    setBusy(true);
    try {
      setCfg(await getConfig());
      setMsg(null);
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not load config: ${e instanceof Error ? e.message : String(e)}. Redeploy CallReg with the latest script.` });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const set = (k: keyof SheetConfig, v: string) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setBusy(true);
    setMsg({ tone: 'info', text: 'Saving…' });
    try {
      setCfg(await setConfig(cfg));
      setMsg({ tone: 'ok', text: 'Saved. Verify to confirm each sheet opens.' });
    } catch (e) {
      setMsg({ tone: 'error', text: `Save failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setMsg({ tone: 'info', text: 'Verifying each sheet…' });
    try {
      setChecks(await checkConfig());
      setMsg({ tone: 'ok', text: 'Verification complete.' });
    } catch (e) {
      setMsg({ tone: 'error', text: `Verify failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const idFromInput = (v: string) => {
    // Accept a full URL or a bare ID.
    const m = String(v).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : v.trim();
  };

  return (
    <div>
      <PageHeader title="Admin Config" subtitle="Backend sheet links used by CallReg — edit and verify." icon="🛠️" />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <SectionCard title="Sheet Links">
        <div className="muted" style={{ marginBottom: 12 }}>
          Paste a Google Sheet URL or its ID. Stored in CallReg (script properties), not in the app or repo.
        </div>
        <div className="stack" style={{ gap: 12 }}>
          {FIELDS.map((f) => {
            const chk = checks[f.key];
            return (
              <div key={f.key} className="cfg-row">
                <label className="cfg-label">{f.label}</label>
                <input
                  className="input"
                  value={cfg[f.key] ?? ''}
                  placeholder="Sheet URL or ID"
                  onChange={(e) => set(f.key, e.target.value)}
                  onBlur={(e) => set(f.key, idFromInput(e.target.value))}
                />
                {chk && (
                  <div className={`cfg-check ${chk.ok ? 'cfg-ok' : 'cfg-bad'}`}>
                    {chk.ok ? `✓ ${chk.name} · ${chk.tabs?.length ?? 0} tabs` : `✗ ${chk.error}`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn" onClick={() => void load()} disabled={busy}>Reload</button>
          <div className="spacer" />
          <button className="btn" onClick={() => void verify()} disabled={busy}>Verify all</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>Save</button>
        </div>
      </SectionCard>
    </div>
  );
}
